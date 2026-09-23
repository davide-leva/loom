package it.davideleva.loom.repository;

import it.davideleva.loom.domain.IssueComment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueCommentRepository extends JpaRepository<IssueComment, Long> {
    List<IssueComment> findByIssue_Project_Id(Long projectId);
    List<IssueComment> findByIssue_IdOrderByDateAscIdAsc(Long issueId);
    List<IssueComment> findByIssue_Id(Long issueId);
}
