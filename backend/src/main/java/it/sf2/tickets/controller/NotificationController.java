package it.sf2.tickets.controller;

import it.sf2.tickets.notification.EmailNotificationScheduler;
import it.sf2.tickets.repository.EventUserNotificationRepository;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class NotificationController {
    private final Optional<EmailNotificationScheduler> scheduler;
    private final EventUserNotificationRepository notifications;

    @Value("${app.notifications.email.enabled:false}")
    private boolean enabled;

    @Value("${app.notifications.email.scheduler-delay}")
    private String schedulerDelay;

    @Value("${spring.mail.host:}")
    private String smtpHost;

    @Value("${spring.mail.port:0}")
    private int smtpPort;

    public record EmailStatus(boolean enabled, boolean schedulerActive, String schedulerDelay,
                              String smtpHost, int smtpPort, long pendingLastTwoDays) {}

    @GetMapping("/email/status")
    public EmailStatus emailStatus() {
        Instant after = Instant.now().minusSeconds(2 * 24 * 60 * 60);
        return new EmailStatus(enabled, scheduler.isPresent(), schedulerDelay, smtpHost, smtpPort,
            notifications.countByNotifiedFalseAndEvent_EventDateAfter(after));
    }

    @PostMapping("/email/run")
    public void runEmailNotifications() {
        scheduler.orElseThrow().sendPendingNotifications();
    }
}
