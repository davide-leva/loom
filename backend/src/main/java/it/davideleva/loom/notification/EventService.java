package it.davideleva.loom.notification;

import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.FieldScope;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.live.LiveUpdateHub;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.EventUserNotificationRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
@Slf4j
public class EventService {
    private final EventRepository events;
    private final EventUserNotificationRepository notifications;
    private final ProjectUserRepository memberships;
    private final UserRepository users;
    private final LiveUpdateHub liveUpdates;

    @Transactional
    public void issueEvent(EventType type, Issue issue, User actor, String message) {
        issueEvent(type, issue, actor, message, null);
    }

    @Transactional
    public void issueEvent(EventType type, Issue issue, User actor, String message, Set<FieldScope> modifiedScopes) {
        // Soft-delete keeps the issue row, so the event still references it via the FK.
        // The historical issueRefId is also set below so events survive even after a permanent delete.
        Event event = new Event(type, message, issue.getProject(), issue, actor);
        event.setIssueRefId(issue.getId());
        event.setInternal(issue.isInternal());
        events.save(event);
        long notificationsCreated = recipients(issue, modifiedScopes).values().stream()
            .filter(user -> actor == null || !user.getId().equals(actor.getId()))
            .filter(user -> !issue.isInternal() || user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM)
            .filter(user -> wantsEmail(user, issue.getProject()))
            .map(user -> new EventUserNotification(event, user))
            .peek(notifications::save)
            .count();
        log.info("Event recorded: id={} type={} project={} issue={} actor={} internal={} scopes={} notifications={}",
            event.getId(), type, issue.getProject().getId(), issue.getId(), actor == null ? null : actor.getId(),
            issue.isInternal(), modifiedScopes, notificationsCreated);
        Long projectId = issue.getProject().getId();
        Long issueId = issue.getId();
        boolean internal = issue.isInternal();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                liveUpdates.changed(projectId, issueId, internal);
            }
        });
    }

    @Transactional
    public void detachIssue(Long issueId) {
        events.detachIssue(issueId);
    }

    private Map<Long, User> recipients(Issue issue, Set<FieldScope> modifiedScopes) {
        Map<Long, User> output = new LinkedHashMap<>();
        Project project = issue.getProject();
        if (project.getCompany() != null) {
            users.findByCompany_Id(project.getCompany().getId()).forEach(user -> output.put(user.getId(), user));
        }
        memberships.findByProject_Id(project.getId()).forEach(membership -> output.put(membership.getUser().getId(), membership.getUser()));
        put(output, issue.getIssuer());
        put(output, issue.getDeveloper());
        put(output, issue.getApprover());
        users.findAll().stream().filter(user -> user.getRole() == Role.ADMIN).forEach(user -> output.put(user.getId(), user));
        if (modifiedScopes == null || modifiedScopes.isEmpty()) return output;
        EnumSet<FieldScope> scopes = modifiedScopes.isEmpty() ? EnumSet.noneOf(FieldScope.class) : EnumSet.copyOf(modifiedScopes);
        output.entrySet().removeIf(entry -> {
            Set<FieldScope> visible = visibleScopesFor(entry.getValue());
            for (FieldScope scope : scopes) {
                if (visible.contains(scope)) return false;
            }
            return true;
        });
        return output;
    }

    private static Set<FieldScope> visibleScopesFor(User user) {
        if (user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM) {
            return EnumSet.of(FieldScope.USER, FieldScope.TEAM, FieldScope.SUPERUSER);
        }
        if (user.getRole() == Role.SUPERUSER) {
            return EnumSet.of(FieldScope.USER, FieldScope.SUPERUSER);
        }
        return EnumSet.of(FieldScope.USER);
    }

    private boolean wantsEmail(User user, Project project) {
        if (Boolean.FALSE.equals(user.getWantEmail())) return false;
        return memberships.findById(new ProjectUserId(project.getId(), user.getId()))
            .map(membership -> !Boolean.FALSE.equals(membership.getWantEmail()))
            .orElse(true);
    }

    private static void put(Map<Long, User> output, User user) {
        if (user != null) output.put(user.getId(), user);
    }
}
