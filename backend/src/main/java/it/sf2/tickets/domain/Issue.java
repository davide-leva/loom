package it.sf2.tickets.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "issues")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Issue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private Project project;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private Instant createdAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private IssueStatus status = IssueStatus.REPORTED;

    @Enumerated(EnumType.STRING)
    @Column(name = "issue_type", length = 16)
    private IssueType issueType;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issuer_user_id")
    private User issuer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dev_user_id")
    private User developer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approve_user_id")
    private User approver;

    @Column(name = "is_internal", nullable = false)
    private boolean internal;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "archived_at")
    private Instant archivedAt;

    public Issue(Project project, String title, String description, IssueType issueType) {
        this.project = project;
        this.title = title;
        this.description = description;
        this.issueType = issueType;
    }

    public boolean isDeleted()  { return deletedAt  != null; }
    public boolean isArchived() { return archivedAt != null; }

    public void markDeleted(Instant at)  { this.deletedAt  = at; }
    public void markArchived(Instant at) { this.archivedAt = at; }

}
