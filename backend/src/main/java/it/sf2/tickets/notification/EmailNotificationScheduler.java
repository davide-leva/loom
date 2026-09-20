package it.sf2.tickets.notification;

import it.sf2.tickets.controller.BrandingService;
import it.sf2.tickets.domain.Event;
import it.sf2.tickets.domain.EventType;
import it.sf2.tickets.domain.EventUserNotification;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.CompanyRepository;
import it.sf2.tickets.repository.EventUserNotificationRepository;
import it.sf2.tickets.repository.UserRepository;
import jakarta.mail.MessagingException;
import java.io.File;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
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

    private void sendDigest(EmailDigest digest) throws MessagingException {
        if (digest.user().email() == null || digest.user().email().isBlank()) {
            log.info("Skipping digest for user={} because email is empty", digest.user().id());
            return;
        }
        var internal = companies.findFirstByTeamCompanyTrue().orElse(null);
        String brandName = internal == null ? "Tickets" : internal.getName();
        var storedLogo = internal == null ? null
            : branding.logoPath("companies", internal.getId(), internal.getLogoExtension());
        File logo = storedLogo == null ? null : storedLogo.toFile();
        boolean hasLogo = logo != null && logo.isFile();

        var message = mailSender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(from);
        helper.setTo(digest.user().email());
        helper.setSubject(brandName + " · " + subjectFor(digest));
        helper.setText(htmlBody(digest, brandName, hasLogo), true);
        if (hasLogo) {
            helper.addInline("internal-logo", new FileSystemResource(logo));
        }
        mailSender.send(message);
    }

    private void markNotified(EventUserNotification notification) {
        notification.setNotified(true);
        notification.setNotifiedAt(Instant.now());
    }

    private static String subjectFor(EmailDigest digest) {
        int count = digest.issues().size();
        if (count == 1) return digest.issues().get(0).title() + " · 1 segnalazione aggiornata";
        return count + " segnalazioni aggiornate";
    }

    private static String htmlBody(EmailDigest digest, String brandName, boolean hasLogo) {
        String logoMarkup = hasLogo
            ? "<img src=\"cid:internal-logo\" alt=\"" + escape(brandName) + "\" style=\"height:46px\" />"
            : "";
        StringBuilder rows = new StringBuilder();
        for (EmailDigest.IssueDigest issue : digest.issues()) {
            rows.append(issueRow(issue));
        }
        String recipient = digest.user().fullName() == null ? "" : escape(digest.user().fullName());
        return """
            <div style="font-family:Poppins,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a">
              <div style="max-width:760px;margin:auto;background:#fff;border:1px solid #dbe7f3;border-radius:18px;overflow:hidden">
                <div style="padding:22px 26px;background:#eef5fc;display:flex;align-items:center;gap:14px">
                  %s
                  <div style="font-size:13px;color:#0f477e;font-weight:700;letter-spacing:.08em;text-transform:uppercase">%s</div>
                </div>
                <div style="padding:26px">
                  <h1 style="margin:0 0 6px;color:#0f477e;font-size:22px">Ciao %s, ecco le novità</h1>
                  <p style="margin:0 0 18px;color:#334155;line-height:1.5">Le segnalazioni qui sotto hanno avuto attività tra %s e %s.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse">
                    %s
                  </table>
                  <p style="margin:18px 0 0;color:#64748b;font-size:13px">Ricevi questa email perché hai attivato le notifiche per queste comunicazioni. Puoi modificare le preferenze dal menu utente, sezione Notifiche email.</p>
                </div>
              </div>
            </div>
            """.formatted(logoMarkup, escape(brandName), recipient,
            escape(formatTimestamp(digest.oldestEvent())),
            escape(formatTimestamp(digest.newestEvent())),
            rows);
    }

    private static String issueRow(EmailDigest.IssueDigest issue) {
        StringBuilder items = new StringBuilder();
        for (EmailDigest.DigestItem item : issue.items()) {
            items.append("<li style=\"margin:0 0 4px\">").append(itemLine(item)).append("</li>");
        }
        return """
            <tr><td style="padding:14px 0;border-top:1px solid #e2e8f0">
              <div style="font-weight:600;color:#0f172a">%s · #%d %s%s</div>
              <ul style="margin:6px 0 0 18px;color:#334155;font-size:14px;line-height:1.5;padding:0">%s</ul>
            </td></tr>
            """.formatted(escape(issue.projectName()), issue.id(),
            escape(issue.title()), issue.internal() ? " <span style=\"color:#0f477e;font-size:12px\">(interna)</span>" : "",
            items);
    }

    private static String itemLine(EmailDigest.DigestItem item) {
        if (item instanceof EmailDigest.StatusTransition transition) {
            return "Stato: <strong>" + escape(transition.from()) + " → " + escape(transition.to()) + "</strong>";
        }
        if (item instanceof EmailDigest.CommentsAdded c) {
            return c.count() == 1 ? "1 nuovo commento" : c.count() + " nuovi commenti";
        }
        if (item instanceof EmailDigest.AttachmentsAdded a) {
            return a.count() == 1 ? "1 nuovo allegato" : a.count() + " nuovi allegati";
        }
        if (item instanceof EmailDigest.ValuesChanged) {
            return "Campi aggiornati";
        }
        if (item instanceof EmailDigest.Created) {
            return "Nuova segnalazione";
        }
        if (item instanceof EmailDigest.Planned) {
            return "Segnalazione pianificata";
        }
        if (item instanceof EmailDigest.Approved) {
            return "Segnalazione approvata";
        }
        if (item instanceof EmailDigest.Archived) {
            return "Segnalazione archiviata";
        }
        return "";
    }

    private static String formatTimestamp(Instant instant) {
        if (instant == null) return "";
        return EventType.ISSUE_CREATED.name() + " " + instant.toString();
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
