package it.sf2.tickets.notification;

import it.sf2.tickets.controller.ProjectMembershipPolicy;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueType;
import it.sf2.tickets.domain.IssueUserView;
import it.sf2.tickets.domain.IssueUserViewId;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.EventRepository;
import it.sf2.tickets.repository.IssueRepository;
import it.sf2.tickets.repository.IssueUserViewRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class IssueNotificationService {
    private final EventRepository events;
    private final IssueRepository issues;
    private final IssueUserViewRepository views;
    private final ProjectUserRepository memberships;

    public record UnreadIssue(Long issueId, IssueType issueType) {}

    public record Summary(Long projectId, long total, long planning, long anomalies,
                          long improvements, long implementations, List<UnreadIssue> issues) {}

    @Transactional(readOnly = true)
    public Summary summary(Project project, User user) {
        requireVisibleProject(project, user);
        boolean internalAllowed = user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM;
        List<UnreadIssue> unread = issues.findAllById(
                events.unreadIssueIds(project.getId(), user.getId(), internalAllowed)).stream()
            .filter(issue -> issue.getProject().getId().equals(project.getId()))
            .filter(issue -> !issue.isInternal() || internalAllowed)
            .map(issue -> new UnreadIssue(issue.getId(), issue.getIssueType()))
            .sorted(Comparator.comparing(UnreadIssue::issueId))
            .toList();
        return new Summary(project.getId(), unread.size(), count(unread, null),
            count(unread, IssueType.ANOMALY), count(unread, IssueType.IMPROVEMENT),
            count(unread, IssueType.IMPLEMENTATION), unread);
    }

    @Transactional
    public void markSeen(Issue issue, User user) {
        // Serialize the first view for this user/issue so concurrent detail refreshes cannot insert the same PK.
        issues.findByIdForUpdate(issue.getId());
        events.findTopByIssueRefIdOrderByIdDesc(issue.getId()).ifPresent(latest -> {
            IssueUserViewId id = new IssueUserViewId(issue.getId(), user.getId());
            IssueUserView view = views.findById(id)
                .orElseGet(() -> new IssueUserView(issue, user, latest.getId(), Instant.now()));
            if (view.getLastSeenEventId() < latest.getId()) view.setLastSeenEventId(latest.getId());
            view.setSeenAt(Instant.now());
            views.save(view);
        });
    }

    public void requireVisibleProject(Project project, User user) {
        if (user.getRole() == Role.ADMIN) return;
        boolean explicitMember = memberships.existsById(new ProjectUserId(project.getId(), user.getId()));
        if (!ProjectMembershipPolicy.isAutomaticCompanyMember(project, user) && !explicitMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project not available");
        }
    }

    private static long count(List<UnreadIssue> issues, IssueType type) {
        return issues.stream().filter(issue -> issue.issueType() == type).count();
    }
}
