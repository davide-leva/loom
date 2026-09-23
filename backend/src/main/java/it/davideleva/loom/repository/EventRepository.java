package it.davideleva.loom.repository;

import it.davideleva.loom.domain.Event;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<Event, Long>, JpaSpecificationExecutor<Event> {
    Optional<Event> findTopByIssueRefIdOrderByIdDesc(Long issueId);

    @Query("select distinct e.issueRefId from Event e where e.project.id = :projectId "
        + "and e.issue is not null and e.issueRefId is not null "
        + "and (:internalAllowed = true or e.internal = false) "
        + "and (e.actor is null or e.actor.id <> :userId) "
        + "and not exists (select v.id.issueId from IssueUserView v "
        + "where v.issue.id = e.issue.id and v.user.id = :userId and v.lastSeenEventId >= e.id)")
    List<Long> unreadIssueIds(@Param("projectId") Long projectId, @Param("userId") Long userId,
                              @Param("internalAllowed") boolean internalAllowed);

    @Modifying(flushAutomatically = true)
    @Query("update Event e set e.issue = null where e.issue.id = :issueId")
    int detachIssue(@Param("issueId") Long issueId);

    @Query("select distinct e.actor.id, e.actor.username from Event e where e.project.id = :projectId "
        + "and (:internalAllowed = true or e.internal = false) and e.actor is not null order by e.actor.username")
    List<Object[]> actors(@Param("projectId") Long projectId, @Param("internalAllowed") boolean internalAllowed);
}
