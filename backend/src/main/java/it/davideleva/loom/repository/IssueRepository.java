package it.davideleva.loom.repository;

import it.davideleva.loom.domain.Issue;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssueRepository extends JpaRepository<Issue, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select issue from Issue issue where issue.id = :issueId")
    Optional<Issue> findByIdForUpdate(@Param("issueId") Long issueId);

    List<Issue> findByProject_Id(Long projectId);

    @Query("select distinct issue from Issue issue where issue.issuer.id = :userId "
        + "or issue.developer.id = :userId or issue.approver.id = :userId")
    List<Issue> findInvolvingUser(@Param("userId") Long userId);

    // Live issues for the workspace lists and the PDF report: exclude soft-deleted and archived.
    List<Issue> findByProject_IdAndDeletedAtIsNullAndArchivedAtIsNull(Long projectId);

    // Admin soft-delete view: only soft-deleted issues (most recent first).
    List<Issue> findByProject_IdAndDeletedAtIsNotNullOrderByDeletedAtDescIdDesc(Long projectId);

    // Archived view: only archived, not soft-deleted (most recent archive first).
    List<Issue> findByProject_IdAndArchivedAtIsNotNullAndDeletedAtIsNullOrderByArchivedAtDescIdDesc(Long projectId);

    // Scheduler: issues eligible to be archived now (RELEASED + old enough + not already archived/deleted).
    @Query("select issue from Issue issue "
        + "where issue.status = it.davideleva.loom.domain.IssueStatus.RELEASED "
        + "and issue.releasedAt is not null "
        + "and issue.releasedAt < :before "
        + "and issue.deletedAt is null "
        + "and issue.archivedAt is null")
    List<Issue> findArchivable(@Param("before") Instant before);
}
