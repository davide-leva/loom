package it.davideleva.loom.repository;

import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.EventUserNotificationId;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventUserNotificationRepository extends JpaRepository<EventUserNotification, EventUserNotificationId> {
    List<EventUserNotification> findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(Instant after);
    long countByNotifiedFalseAndEvent_EventDateAfter(Instant after);
}
