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
@Table(name = "events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Event {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @CreationTimestamp
    @Column(name = "event_date", nullable = false, updatable = false)
    @Setter(AccessLevel.NONE)
    private Instant eventDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 64)
    private EventType type;

    @Column(nullable = false, columnDefinition = "text")
    private String data;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id")
    private Issue issue;

    @Column(name = "issue_ref_id")
    private Long issueRefId;

    @Column(nullable = false)
    private boolean internal;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    public Event(EventType type, String data, Project project, Issue issue, User actor) {
        this.type = type;
        this.data = data;
        this.project = project;
        this.issue = issue;
        this.issueRefId = issue == null ? null : issue.getId();
        this.internal = issue != null && issue.isInternal();
        this.actor = actor;
    }
}
