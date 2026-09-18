package it.sf2.tickets.repository;

import it.sf2.tickets.domain.IssueAttachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueAttachmentRepository extends JpaRepository<IssueAttachment, Long> {
    List<IssueAttachment> findByIssue_IdOrderByUploadedAtAscIdAsc(Long issueId);
}
