package it.sf2.tickets.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "issue_attachments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueAttachment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id", nullable = false)
    private Issue issue;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_dtype_id")
    private IssueFieldDefinition definition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "original_name", nullable = false, length = 255)
    private String originalName;

    @Column(name = "content_type", length = 128)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(nullable = false, length = 32)
    private String extension;

    @CreationTimestamp
    @Column(name = "uploaded_at", nullable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private Instant uploadedAt;

    @Column(name = "stored_path", columnDefinition = "text")
    private String storedPath;

    public IssueAttachment(Issue issue, IssueFieldDefinition definition, User user, String originalName,
                           String contentType, long fileSize, String extension) {
        this.issue = issue;
        this.projectId = issue.getProject().getId();
        this.definition = definition;
        this.user = user;
        this.originalName = originalName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.extension = extension;
    }
}
