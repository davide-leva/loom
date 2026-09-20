package it.sf2.tickets.notification;

import it.sf2.tickets.controller.BrandingService;
import it.sf2.tickets.domain.EventUserNotification;
import it.sf2.tickets.repository.CompanyRepository;
import it.sf2.tickets.repository.EventUserNotificationRepository;
import jakarta.mail.MessagingException;
import java.io.File;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app.notifications.email", name = "enabled", havingValue = "true")
public class EmailNotificationScheduler {
    private final EventUserNotificationRepository notifications;
    private final JavaMailSender mailSender;
    private final CompanyRepository companies;
    private final BrandingService branding;

    @Value("${app.notifications.email.from}")
    private String from;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void sendPendingNotificationsOnStartup() {
        sendPendingNotifications();
    }

    @Scheduled(fixedDelayString = "${app.notifications.email.scheduler-delay}", initialDelayString = "${app.notifications.email.scheduler-delay}")
    @Transactional
    public void sendPendingNotifications() {
        Instant after = Instant.now().minusSeconds(2 * 24 * 60 * 60);
        var pending = notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(after);
        log.info("Email notification scan started: pending={}", pending.size());
        pending.forEach(this::sendOne);
        log.info("Email notification scan completed");
    }

    private void sendOne(EventUserNotification notification) {
        if (notification.getUser().getEmail() == null || notification.getUser().getEmail().isBlank()) {
            log.info("Skipping notification event={} user={} because email is empty",
                notification.getEvent().getId(), notification.getUser().getId());
            markNotified(notification);
            return;
        }
        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            var internal = companies.findFirstByTeamCompanyTrue().orElse(null);
            String brandName = internal == null ? "Tickets" : internal.getName();
            var storedLogo = internal == null ? null
                : branding.logoPath("companies", internal.getId(), internal.getLogoExtension());
            File logo = storedLogo == null ? null : storedLogo.toFile();
            helper.setFrom(from);
            helper.setTo(notification.getUser().getEmail());
            helper.setSubject(brandName + " · " + titleFor(notification.getEvent().getType()));
            helper.setText(htmlBody(notification, brandName, logo != null && logo.isFile()), true);
            if (logo != null && logo.isFile()) {
                helper.addInline("internal-logo", new FileSystemResource(logo));
            }
            mailSender.send(message);
            markNotified(notification);
            log.info("Email notification sent: event={} user={} to={}",
                notification.getEvent().getId(), notification.getUser().getId(), notification.getUser().getEmail());
        } catch (MessagingException | RuntimeException exception) {
            log.warn("Email notification failed: event={} user={} to={} reason={}",
                notification.getEvent().getId(), notification.getUser().getId(), notification.getUser().getEmail(),
                exception.getMessage(), exception);
            // Keep notified=false so the next scheduled run retries.
        }
    }

    private void markNotified(EventUserNotification notification) {
        notification.setNotified(true);
        notification.setNotifiedAt(Instant.now());
    }

    private static String htmlBody(EventUserNotification notification, String brandName, boolean hasLogo) {
        var event = notification.getEvent();
        String title = titleFor(event.getType());
        String explanation = explanationFor(event.getType(), event.getData());
        String issueTitle = event.getIssue() == null ? "" : event.getIssue().getTitle();
        String projectName = event.getProject() == null ? "" : event.getProject().getName();
        String issueMeta = issueMetaHtml(event.getIssue());
        String logoMarkup = hasLogo
            ? "<img src=\"cid:internal-logo\" alt=\"" + escape(brandName) + "\" style=\"height:46px\" />"
            : "";
        return """
            <div style=\"font-family:Poppins,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a\">
              <div style=\"max-width:760px;margin:auto;background:#fff;border:1px solid #dbe7f3;border-radius:18px;overflow:hidden\">
                <div style=\"padding:22px 26px;background:#eef5fc;display:flex;align-items:center;gap:14px\">
                  %s
                  <div style=\"font-size:13px;color:#0f477e;font-weight:700;letter-spacing:.08em;text-transform:uppercase\">%s</div>
                </div>
                <div style=\"padding:26px\">
                  <h1 style=\"margin:0 0 10px;color:#0f477e;font-size:24px\">%s</h1>
                  <p style=\"margin:0 0 18px;color:#334155;line-height:1.5\">%s</p>
                  <div style=\"border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#fbfdff;margin-bottom:18px\">
                    <p style=\"margin:0 0 8px\"><strong>Progetto:</strong> %s</p>
                    <p style=\"margin:0 0 8px\"><strong>Segnalazione:</strong> #%s %s</p>
                    %s
                    <p style=\"margin:0\"><strong>Data evento:</strong> %s</p>
                  </div>
                  <p style=\"margin:0;color:#64748b;font-size:13px\">Ricevi questa email perché hai attivato le notifiche per questa comunicazione o per questo progetto. Puoi modificare le preferenze dal menu utente, sezione Notifiche email.</p>
                </div>
              </div>
            </div>
            """.formatted(logoMarkup, escape(brandName), escape(title), escape(explanation), escape(projectName),
            event.getIssue() == null ? "" : event.getIssue().getId(), escape(issueTitle), issueMeta, event.getEventDate());
    }

    private static String issueMetaHtml(it.sf2.tickets.domain.Issue issue) {
        if (issue == null) return "";
        String type = issue.getIssueType() == null ? "Non classificata" : typeLabel(issue.getIssueType().name());
        String status = issue.getStatus() == null ? "" : statusLabel(issue.getStatus().name());
        return """
                    <p style=\"margin:0 0 8px\"><strong>Tipologia:</strong> %s</p>
                    <p style=\"margin:0 0 8px\"><strong>Stato:</strong> %s</p>
            """.formatted(escape(type), escape(status));
    }

    private static String titleFor(it.sf2.tickets.domain.EventType type) {
        return switch (type) {
            case ISSUE_CREATED -> "Nuova segnalazione";
            case ISSUE_PLANNED -> "Segnalazione pianificata";
            case ISSUE_STATUS_CHANGED -> "Stato aggiornato";
            case ISSUE_APPROVED -> "Segnalazione approvata";
            case ISSUE_COMMENT_ADDED -> "Nuovo commento";
            case ISSUE_COMMENT_DELETED -> "Commento eliminato";
            case ISSUE_ATTACHMENT_UPLOADED -> "Nuovo allegato";
            case ISSUE_VALUES_CHANGED -> "Campi aggiornati";
            case ISSUE_DELETED -> "Segnalazione eliminata";
            case ISSUE_ARCHIVED -> "Segnalazione archiviata";
        };
    }

    private static String explanationFor(it.sf2.tickets.domain.EventType type, String data) {
        String detail = humanizeEventData(data);
        return switch (type) {
            case ISSUE_CREATED -> "È stata creata una nuova segnalazione nel progetto. Puoi aprire l’applicazione per leggerne i dettagli, verificare gli allegati e seguire l’avanzamento.";
            case ISSUE_PLANNED -> appendDetail("La segnalazione è stata classificata e inserita nel flusso di lavoro.", detail);
            case ISSUE_STATUS_CHANGED -> appendDetail("Lo stato della segnalazione è stato aggiornato. La modifica è già visibile nella dashboard e nella kanban del progetto.", detail);
            case ISSUE_APPROVED -> "Un superuser ha approvato la segnalazione rilasciata. La richiesta è quindi chiusa dal punto di vista del cliente.";
            case ISSUE_COMMENT_ADDED -> "È stato aggiunto un nuovo commento alla segnalazione. Apri il dettaglio issue per leggere la conversazione completa e rispondere se serve.";
            case ISSUE_COMMENT_DELETED -> "Un commento è stato eliminato dalla segnalazione.";
            case ISSUE_ATTACHMENT_UPLOADED -> appendDetail("È stato caricato un nuovo allegato. L’allegato è disponibile nel dettaglio della segnalazione.", detail);
            case ISSUE_VALUES_CHANGED -> "I campi della segnalazione sono stati aggiornati.";
            case ISSUE_DELETED -> "La segnalazione è stata eliminata. Questa comunicazione resta come traccia dell’operazione eseguita.";
            case ISSUE_ARCHIVED -> "La segnalazione è stata archiviata automaticamente perché è trascorso il periodo di mantenimento configurato per il progetto. È ancora consultabile dalla sezione Archiviate.";
        };
    }

    private static String humanizeEventData(String data) {
        if (data == null || data.isBlank()) return "";
        return data.trim()
            .replace("REPORTED", statusLabel("REPORTED"))
            .replace("IN_PROGRESS", statusLabel("IN_PROGRESS"))
            .replace("COMPLETED", statusLabel("COMPLETED"))
            .replace("RELEASED", statusLabel("RELEASED"))
            .replace("APPROVED", statusLabel("APPROVED"))
            .replace("ANOMALY", typeLabel("ANOMALY"))
            .replace("IMPROVEMENT", typeLabel("IMPROVEMENT"))
            .replace("IMPLEMENTATION", typeLabel("IMPLEMENTATION"));
    }

    private static String statusLabel(String status) {
        return switch (status) {
            case "REPORTED" -> "Segnalato";
            case "IN_PROGRESS" -> "In lavorazione";
            case "COMPLETED" -> "Completato";
            case "RELEASED" -> "Rilasciato";
            case "APPROVED" -> "Approvato";
            default -> status;
        };
    }

    private static String typeLabel(String type) {
        return switch (type) {
            case "ANOMALY" -> "Anomalia";
            case "IMPROVEMENT" -> "Miglioria";
            case "IMPLEMENTATION" -> "Implementazione";
            default -> type;
        };
    }

    private static String appendDetail(String text, String detail) {
        return detail.isBlank() ? text : text + " " + detail;
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
