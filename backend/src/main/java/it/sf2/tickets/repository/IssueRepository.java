package it.sf2.tickets.repository;

import it.sf2.tickets.domain.Issue;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssueRepository extends JpaRepository<Issue, Long> {
    List<Issue> findByProject_Id(Long projectId);

    @Query("select distinct issue from Issue issue where issue.issuer.id = :userId "
        + "or issue.developer.id = :userId or issue.approver.id = :userId")
    List<Issue> findInvolvingUser(@Param("userId") Long userId);
}
