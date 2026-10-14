package it.davideleva.loom.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "event_user_notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventUserNotification {
    @EmbeddedId
    private EventUserNotificationId id;

    @MapsId("eventId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    private Event event;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Setter
    @Column(nullable = false)
    private boolean notified;

    @Setter
    @Column(name = "notified_at")
    private Instant notifiedAt;

    @Setter
    @Column(name = "email_batch_id", length = 36)
    private String emailBatchId;

    @Setter
    @Column(name = "email_delivery_id", length = 36)
    private String emailDeliveryId;

    @Setter
    @Column(name = "delivery_status", length = 16)
    private String deliveryStatus;

    @Setter
    @Column(name = "delivery_reason", length = 512)
    private String deliveryReason;

    @Setter
    @Column(name = "recipient_email", length = 128)
    private String recipientEmail;

    @Setter
    @Column(name = "attempted_at")
    private Instant attemptedAt;

    public EventUserNotification(Event event, User user) {
        this.event = event;
        this.user = user;
        this.id = new EventUserNotificationId(event.getId(), user.getId());
    }
}
