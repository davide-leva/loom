package it.davideleva.loom.notification;

import it.davideleva.loom.controller.BrandingService;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.EventUserNotificationRepository;
import it.davideleva.loom.repository.UserRepository;
import jakarta.mail.MessagingException;
import java.io.File;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Digest-style email dispatcher.
 *
 * <p>Each scheduler tick loads all undelivered {@link EventUserNotification}s, groups
 * them by user, and asks {@link EventDigestService} to collapse the raw event stream
 * into a single per-user {@link EmailDigest}. One email is sent per user, not one per
 * event.
 *
 * <p><b>Throttling:</b> if any of the events for a user is younger than
 * {@code app.notifications.email.min-event-age} (default 5 minutes), that user's
 * digest is skipped this tick. The events stay {@code notified=false} so the next
 * scheduled run retries — this gives authors a brief grace window to back out or
 * amend a recent change before it reaches inboxes.
 */
@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app.notifications.email", name = "enabled", havingValue = "true")
public class EmailNotificationScheduler {
    private final EventUserNotificationRepository notifications;
    private final JavaMailSender mailSender;
    private final CompanyRepository companies;
    private final BrandingService branding;
    private final EventDigestService digestService;
    private final UserRepository users;

    @Value("${app.notifications.email.from}")
    private String from;

    /**
     * Minimum age an event must reach before its digest is sent. Defaults to 5 minutes.
     * Configurable via {@code app.notifications.email.min-event-age} (ISO-8601 duration
     * such as {@code PT5M} or Spring's short form {@code 5m}).
     */
    @Value("${app.notifications.email.min-event-age:5m}")
    private Duration minEventAge;

    /** Notifications older than this are dropped without sending. Defaults to 48h. */
    @Value("${app.notifications.email.digest-window:48h}")
    private Duration digestWindow;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void sendPendingNotificationsOnStartup() {
        sendPendingNotifications();
    }

    @Scheduled(fixedDelayString = "${app.notifications.email.scheduler-delay}", initialDelayString = "${app.notifications.email.scheduler-delay}")
    @Transactional
    public void sendPendingNotifications() {
        Instant since = Instant.now().minus(digestWindow);
        List<EventUserNotification> pending =
            notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(since);
        if (pending.isEmpty()) return;

        Map<Long, List<EventUserNotification>> byUser = pending.stream()
            .collect(Collectors.groupingBy(n -> n.getUser().getId()));
        log.info("Email digest scan started: users={} notifications={}", byUser.size(), pending.size());

        int sent = 0;
        int deferred = 0;
        int skipped = 0;
        for (Map.Entry<Long, List<EventUserNotification>> entry : byUser.entrySet()) {
            User user = entry.getValue().get(0).getUser();
            // Eagerly load user — the collection above holds the proxy.
            user = users.findById(user.getId()).orElse(user);
            List<Event> events = entry.getValue().stream()
                .map(EventUserNotification::getEvent)
                .sorted(Comparator.comparingLong(Event::getId))
                .toList();
            Instant youngest = events.stream().map(Event::getEventDate).max(Comparator.naturalOrder()).orElse(Instant.now());

            if (youngest.isAfter(Instant.now().minus(minEventAge))) {
                // Keep notified=false and skip; the next tick will retry.
                deferred++;
                log.debug("Email digest deferred: user={} youngestEvent={} minAge={}",
                    user.getId(), youngest, minEventAge);
                continue;
            }

            EmailDigest digest = digestService.buildDigest(user, events);
            if (digest == null) {
                // Nothing visible after collapsing/permission filtering — mark these as
                // delivered so we don't re-evaluate them on every tick.
                entry.getValue().forEach(this::markNotified);
                skipped++;
                continue;
            }

            try {
                sendDigest(digest);
                entry.getValue().forEach(this::markNotified);
                sent++;
                log.info("Email digest sent: user={} issues={} window={}..{}",
                    user.getId(), digest.issues().size(), digest.oldestEvent(), digest.newestEvent());
            } catch (RuntimeException | MessagingException exception) {
                log.warn("Email digest failed: user={} reason={}", user.getId(), exception.getMessage(), exception);
                // Keep notified=false so the next scheduled run retries.
            }
        }
        log.info("Email digest scan completed: sent={} deferred={} skipped={}", sent, deferred, skipped);
    }

    /**
     * Bundled Loom wordmark used as the centered footer under the digest card. Loaded
     * once at startup from {@code classpath:email/LogoType_Loom.png}. The resource is
     * optional: if the artifact isn't on the classpath (e.g. tests without resources)
     * the footer gracefully degrades to plain text.
     */
    private static final String LOOM_LOGO_CLASSPATH = "email/LogoType_Loom.png";
    private static final ClassPathResource LOOM_LOGO_RESOURCE = new ClassPathResource(LOOM_LOGO_CLASSPATH);

    private void sendDigest(EmailDigest digest) throws MessagingException {
        if (digest.user().email() == null || digest.user().email().isBlank()) {
            log.info("Skipping digest for user={} because email is empty", digest.user().id());
            return;
        }
        var internal = companies.findFirstByTeamCompanyTrue().orElse(null);
        String brandName = internal == null ? "Loom" : internal.getName();
        var storedLogo = internal == null ? null
            : branding.logoPath("companies", internal.getId(), internal.getLogoExtension());
        File logo = storedLogo == null ? null : storedLogo.toFile();
        boolean hasLogo = logo != null && logo.isFile();
        boolean hasLoomLogo = LOOM_LOGO_RESOURCE.exists();

        var message = mailSender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(from);
        helper.setTo(digest.user().email());
        helper.setSubject(brandName + " · " + subjectFor(digest));
        helper.setText(htmlBody(digest, brandName, hasLogo, hasLoomLogo), true);
        if (hasLogo) {
            helper.addInline("internal-logo", new FileSystemResource(logo));
        }
        if (hasLoomLogo) {
            helper.addInline("loom-logo", LOOM_LOGO_RESOURCE);
        }
        mailSender.send(message);
    }

    private void markNotified(EventUserNotification notification) {
        notification.setNotified(true);
        notification.setNotifiedAt(Instant.now());
    }

    /**
     * Per-progetto subject. Quando il digest copre più progetti, l'oggetto elenca i primi
     * due e conclude con un "+N" se ce ne sono altri. Quando copre un solo progetto, la
     * forma singolare corrisponde a quella richiesta dal prodotto
     * ("Aggiornamenti per il progetto <name>").
     */
    static String subjectFor(EmailDigest digest) {
        List<String> projectNames = digest.issues().stream()
            .map(EmailDigest.IssueDigest::projectName)
            .filter(name -> name != null && !name.isBlank())
            .distinct()
            .toList();
        if (projectNames.isEmpty()) {
            int count = digest.issues().size();
            return count <= 1 ? "Aggiornamenti Loom" : count + " aggiornamenti";
        }
        if (projectNames.size() == 1) return "Aggiornamenti per il progetto " + projectNames.get(0);
        if (projectNames.size() == 2) return "Aggiornamenti per i progetti " + projectNames.get(0)
            + " e " + projectNames.get(1);
        return "Aggiornamenti per i progetti " + projectNames.get(0)
            + ", " + projectNames.get(1)
            + " (+" + (projectNames.size() - 2) + ")";
    }

    private static String htmlBody(EmailDigest digest, String brandName, boolean hasLogo, boolean hasLoomLogo) {
        String logoMarkup = hasLogo
            ? "<img src=\"cid:internal-logo\" alt=\"" + escape(brandName) + "\" style=\"height:46px\" />"
            : "";
        StringBuilder rows = new StringBuilder();
        for (EmailDigest.IssueDigest issue : digest.issues()) {
            rows.append(issueRow(issue));
        }
        String recipient = digest.user().fullName() == null ? "" : escape(digest.user().fullName());
        String window = windowDescription(digest);
        // Centered Loom wordmark rendered just below the card. Falls back to plain
        // text when the bundled LogoType_Loom.png resource is not on the classpath
        // (e.g. some test setups).
        String loomFooter = hasLoomLogo
            ? """
              <div style="text-align:center;margin:28px auto 0">
                <img src="cid:loom-logo" alt="Loom" style="height:48px;max-width:200px;display:inline-block" />
              </div>
              """
            : """
              <div style="text-align:center;margin:28px auto 0;color:#94a3b8;letter-spacing:.18em;
                          font-size:11px;text-transform:uppercase;font-weight:600">Loom</div>
              """;
        return """
            <div style="font-family:Poppins,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
              <div style="max-width:760px;margin:auto;background:#fff;border:1px solid #dbe7f3;border-radius:18px;overflow:hidden">
                <div style="padding:22px 26px;background:#eef5fc;display:flex;align-items:center;gap:14px">
                  %s
                  <div style="font-size:13px;color:#0f477e;font-weight:700;letter-spacing:.08em;text-transform:uppercase">%s</div>
                </div>
                <div style="padding:26px">
                  <h1 style="margin:0 0 6px;color:#0f477e;font-size:22px">Ciao %s, ecco le novità</h1>
                  <p style="margin:0 0 18px;color:#334155;line-height:1.5">%s</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse">
                    %s
                  </table>
                  <p style="margin:18px 0 0;color:#64748b;font-size:13px">Ricevi questa email perché hai attivato le notifiche per queste comunicazioni. Puoi modificare le preferenze dal menu utente, sezione Notifiche email.</p>
                </div>
              </div>
              %s
            </div>
            """.formatted(logoMarkup, escape(brandName), recipient,
            window, rows, loomFooter);
    }

    /**
     * Builds the human-readable description of the digest window. When {@code oldestEvent}
     * and {@code newestEvent} fall on the same calendar day the line collapses to
     * "Lo stesso giorno (HH:mm → HH:mm)"; otherwise to "Dal <data> alle <ora> al <data> alle <ora>".
     */
    static String windowDescription(EmailDigest digest) {
        Instant oldest = digest.oldestEvent();
        Instant newest = digest.newestEvent();
        if (oldest == null || newest == null) {
            return "Le segnalazioni qui sotto sono state aggiornate di recente.";
        }
        LocalDateTime oldestLocal = LocalDateTime.ofInstant(oldest, ZoneId.systemDefault());
        LocalDateTime newestLocal = LocalDateTime.ofInstant(newest, ZoneId.systemDefault());
        DateTimeFormatter time = DateTimeFormatter.ofPattern("HH:mm", Locale.ITALY);
        DateTimeFormatter dateTime = DateTimeFormatter.ofPattern("d MMM yyyy 'alle' HH:mm", Locale.ITALY);
        if (oldestLocal.toLocalDate().equals(newestLocal.toLocalDate())) {
            return "Le segnalazioni qui sotto hanno avuto attività oggi, tra le "
                + time.format(oldestLocal) + " e le " + time.format(newestLocal) + ".";
        }
        return "Le segnalazioni qui sotto hanno avuto attività dal "
            + dateTime.format(oldestLocal) + " al " + dateTime.format(newestLocal) + ".";
    }

    private static String issueRow(EmailDigest.IssueDigest issue) {
        StringBuilder items = new StringBuilder();
        for (EmailDigest.DigestItem item : issue.items()) {
            items.append("<li style=\"margin:0 0 6px\">").append(itemLine(item)).append("</li>");
        }

        StringBuilder header = new StringBuilder();
        header.append("<span style=\"font-weight:600;color:#0f172a\">")
            .append(escape(issue.projectName())).append(" · #").append(issue.id()).append(' ')
            .append(escape(issue.title()))
            .append("</span>");
        if (issue.internal()) {
            header.append(" <span style=\"display:inline-block;padding:2px 8px;border-radius:999px;"
                + "background:#fef3c7;color:#92400e;font-size:11px;letter-spacing:.04em;"
                + "text-transform:uppercase\">interna</span>");
        }

        StringBuilder meta = new StringBuilder();
        boolean hasMeta = false;
        if (issue.issueType() != null) {
            meta.append("<span>").append(escape(issue.issueType())).append("</span>");
            hasMeta = true;
        }
        if (issue.currentStatus() != null) {
            if (hasMeta) meta.append("<span style=\"margin:0 8px;color:#cbd5e1\">·</span>");
            meta.append("<span><strong>Stato attuale:</strong> ").append(escape(issue.currentStatus())).append("</span>");
            hasMeta = true;
        }
        if (issue.developerName() != null) {
            if (hasMeta) meta.append("<span style=\"margin:0 8px;color:#cbd5e1\">·</span>");
            meta.append("<span><strong>Sviluppatore:</strong> ").append(escape(issue.developerName())).append("</span>");
            hasMeta = true;
        }

        String metaMarkup = hasMeta
            ? "<div style=\"margin-top:4px;color:#475569;font-size:12px;display:flex;flex-wrap:wrap;align-items:center\">"
                + meta + "</div>"
            : "";

        return """
            <tr><td style="padding:18px 0;border-top:1px solid #e2e8f0">
              %s
              %s
              <ul style="margin:10px 0 0 18px;color:#334155;font-size:14px;line-height:1.5;padding:0">%s</ul>
            </td></tr>
            """.formatted(header, metaMarkup, items);
    }

    private static String itemLine(EmailDigest.DigestItem item) {
        if (item instanceof EmailDigest.StatusTransition transition) {
            return "Stato: <strong>" + escape(transition.from()) + " → " + escape(transition.to()) + "</strong>";
        }
        if (item instanceof EmailDigest.CommentsAdded c) {
            String label = c.count() == 1 ? "1 nuovo commento" : c.count() + " nuovi commenti";
            String body = commentPreviewBlock(c.previews());
            return body.isEmpty() ? label : label + body;
        }
        if (item instanceof EmailDigest.AttachmentsAdded a) {
            String label = a.count() == 1 ? "1 nuovo allegato" : a.count() + " nuovi allegati";
            String body = attachmentListBlock(a.fileNames());
            return body.isEmpty() ? label : label + body;
        }
        if (item instanceof EmailDigest.ValuesChanged v) {
            String body = fieldChangeBlock(v.changes());
            return body.isEmpty() ? "Campi aggiornati" : "Campi aggiornati" + body;
        }
        if (item instanceof EmailDigest.Created) {
            return "Nuova segnalazione";
        }
        if (item instanceof EmailDigest.Planned p) {
            StringBuilder label = new StringBuilder("Segnalazione pianificata");
            if (p.type() != null || p.developer() != null) {
                label.append(": ");
                List<String> parts = new java.util.ArrayList<>();
                if (p.type() != null) parts.add("tipologia <strong>" + escape(p.type()) + "</strong>");
                if (p.developer() != null) parts.add("sviluppatore <strong>" + escape(p.developer()) + "</strong>");
                label.append(String.join(", ", parts));
            }
            return label.toString();
        }
        if (item instanceof EmailDigest.Approved a) {
            return "Approvata da <strong>" + escape(a.approver()) + "</strong>";
        }
        if (item instanceof EmailDigest.Archived a) {
            return "Archiviata" + (a.reason() == null || a.reason().isBlank()
                || "Archiviata".equals(a.reason()) ? "" : ": " + escape(a.reason()));
        }
        return "";
    }

    private static String commentPreviewBlock(List<String> previews) {
        if (previews == null || previews.isEmpty()) return "";
        StringBuilder block = new StringBuilder("<div style=\"margin-top:4px;padding:8px 10px;"
            + "background:#f1f5f9;border-left:3px solid #94a3b8;color:#1e293b;font-size:13px;"
            + "border-radius:4px;font-style:italic\">");
        for (int i = 0; i < previews.size(); i++) {
            if (i > 0) block.append("<br>");
            block.append("&ldquo;").append(escape(previews.get(i))).append("&rdquo;");
        }
        block.append("</div>");
        return block.toString();
    }

    private static String attachmentListBlock(List<String> fileNames) {
        if (fileNames == null || fileNames.isEmpty()) return "";
        StringBuilder block = new StringBuilder("<div style=\"margin-top:4px;color:#475569;font-size:12px\">");
        block.append("File: ");
        for (int i = 0; i < fileNames.size(); i++) {
            if (i > 0) block.append(", ");
            block.append("<span style=\"font-family:Menlo,Consolas,monospace;background:#f1f5f9;"
                + "padding:1px 6px;border-radius:4px\">").append(escape(fileNames.get(i))).append("</span>");
        }
        block.append("</div>");
        return block.toString();
    }

    private static String fieldChangeBlock(List<EmailDigest.FieldChange> changes) {
        if (changes == null || changes.isEmpty()) return "";
        StringBuilder block = new StringBuilder("<div style=\"margin-top:4px;color:#475569;font-size:13px\">");
        for (EmailDigest.FieldChange change : changes) {
            block.append("<div>").append(escape(change.label()))
                .append(": <span style=\"color:#94a3b8\">").append(escape(displayValue(change.before())))
                .append("</span> → <strong>").append(escape(displayValue(change.after()))).append("</strong></div>");
        }
        block.append("</div>");
        return block.toString();
    }

    private static String displayValue(String value) {
        return value == null || value.isBlank() ? "(vuoto)" : value;
    }

    /**
     * Formats an instant as a localized, human-readable Italian date — e.g.
     * {@code "23 set 2026, 14:30"}. Returns an empty string for {@code null} and ignores
     * the now-removed {@code EventType.ISSUE_CREATED} prefix that previously corrupted this
     * function in body text.
     */
    static String formatTimestamp(Instant instant) {
        if (instant == null) return "";
        return DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale.ITALY)
            .withZone(ZoneId.systemDefault())
            .format(instant);
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Exposed for unit tests so they can call the digest send path directly. */
    void setMinEventAge(Duration minEventAge) {
        this.minEventAge = minEventAge;
    }

    void setDigestWindow(Duration digestWindow) {
        this.digestWindow = digestWindow;
    }

    /** Used by tests to inspect the deferred count. */
    int lastDeferredCount() { return lastDeferred; }
    private int lastDeferred;
}
