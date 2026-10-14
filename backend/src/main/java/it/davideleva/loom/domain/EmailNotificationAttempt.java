package it.davideleva.loom.domain;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "email_notification_attempts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EmailNotificationAttempt {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "event_id", nullable = false) private Event event;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "batch_id", nullable = false, length = 36) private String batchId;
    @Column(name = "delivery_id", length = 36) private String deliveryId;
    @Column(nullable = false, length = 16) private String status;
    @Column(length = 512) private String reason;
    @Column(name = "recipient_email", length = 128) private String recipientEmail;
    @Column(name = "attempted_at", nullable = false) private Instant attemptedAt;

    public EmailNotificationAttempt(EventUserNotification n) {
        event = n.getEvent(); userId = n.getUser().getId(); batchId = n.getEmailBatchId();
        deliveryId = n.getEmailDeliveryId(); status = n.getDeliveryStatus(); reason = n.getDeliveryReason();
        recipientEmail = n.getRecipientEmail(); attemptedAt = n.getAttemptedAt();
    }
}
