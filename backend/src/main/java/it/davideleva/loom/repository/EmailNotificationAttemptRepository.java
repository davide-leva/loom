package it.davideleva.loom.repository;

import it.davideleva.loom.domain.*;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface EmailNotificationAttemptRepository extends JpaRepository<EmailNotificationAttempt, Long> {
    @Query(value = "select a.batchId from EmailNotificationAttempt a where a.event.project.id = :projectId "
        + "and (:type is null or a.event.type = :type) and (:actorId is null or a.event.actor.id = :actorId) "
        + "and (:from is null or a.attemptedAt >= :from) and (:to is null or a.attemptedAt < :to) "
        + "group by a.batchId order by max(a.attemptedAt) desc",
        countQuery = "select count(distinct a.batchId) from EmailNotificationAttempt a where a.event.project.id = :projectId "
        + "and (:type is null or a.event.type = :type) and (:actorId is null or a.event.actor.id = :actorId) "
        + "and (:from is null or a.attemptedAt >= :from) and (:to is null or a.attemptedAt < :to)")
    Page<String> batches(@Param("projectId") Long projectId, @Param("type") EventType type,
        @Param("actorId") Long actorId, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    List<EmailNotificationAttempt> findByBatchIdInAndEvent_Project_IdOrderByAttemptedAtAscIdAsc(List<String> batchIds, Long projectId);
}
