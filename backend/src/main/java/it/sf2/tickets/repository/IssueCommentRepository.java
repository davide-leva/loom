package it.sf2.tickets.repository;

import it.sf2.tickets.domain.IssueComment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueCommentRepository extends JpaRepository<IssueComment, Long> {
    List<IssueComment> findByIssue_Project_Id(Long projectId);
    List<IssueComment> findByIssue_IdOrderByDateAscIdAsc(Long issueId);
    List<IssueComment> findByIssue_Id(Long issueId);
}
