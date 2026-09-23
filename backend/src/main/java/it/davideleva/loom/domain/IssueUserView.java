package it.davideleva.loom.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "issue_user_views")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueUserView {
    @EmbeddedId
    private IssueUserViewId id;

    @MapsId("issueId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private Issue issue;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Setter
    @Column(name = "last_seen_event_id", nullable = false)
    private Long lastSeenEventId;

    @Setter
    @Column(name = "seen_at", nullable = false)
    private Instant seenAt;

    public IssueUserView(Issue issue, User user, Long lastSeenEventId, Instant seenAt) {
        this.issue = issue;
        this.user = user;
        this.id = new IssueUserViewId(issue.getId(), user.getId());
        this.lastSeenEventId = lastSeenEventId;
        this.seenAt = seenAt;
    }
}
