package it.sf2.tickets.notification;

import it.sf2.tickets.domain.Event;
import it.sf2.tickets.domain.EventType;
import it.sf2.tickets.domain.EventUserNotification;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.live.LiveUpdateHub;
import it.sf2.tickets.repository.EventRepository;
import it.sf2.tickets.repository.EventUserNotificationRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import it.sf2.tickets.repository.UserRepository;
import java.util.LinkedHashMap;
import java.util.Map;
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
        // Soft-delete keeps the issue row, so the event still references it via the FK.
        // The historical issueRefId is also set below so events survive even after a permanent delete.
        Event event = new Event(type, message, issue.getProject(), issue, actor);
        event.setIssueRefId(issue.getId());
        event.setInternal(issue.isInternal());
        events.save(event);
        long notificationsCreated = recipients(issue).values().stream()
            .filter(user -> actor == null || !user.getId().equals(actor.getId()))
            .filter(user -> !issue.isInternal() || user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM)
            .filter(user -> wantsEmail(user, issue.getProject()))
            .map(user -> new EventUserNotification(event, user))
            .peek(notifications::save)
            .count();
        log.info("Event recorded: id={} type={} project={} issue={} actor={} internal={} notifications={}",
            event.getId(), type, issue.getProject().getId(), issue.getId(), actor == null ? null : actor.getId(),
            issue.isInternal(), notificationsCreated);
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

    private Map<Long, User> recipients(Issue issue) {
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
        return output;
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
