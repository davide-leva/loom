package it.sf2.tickets.notification;

import it.sf2.tickets.domain.Event;
import it.sf2.tickets.domain.EventType;
import it.sf2.tickets.domain.EventUserNotification;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.EventRepository;
import it.sf2.tickets.repository.EventUserNotificationRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import it.sf2.tickets.repository.UserRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class EventService {
    private final EventRepository events;
    private final EventUserNotificationRepository notifications;
    private final ProjectUserRepository memberships;
    private final UserRepository users;

    @Transactional
    public void issueEvent(EventType type, Issue issue, User actor, String message) {
        Event event = events.save(new Event(type, message, issue.getProject(), issue, actor));
        recipients(issue).values().stream()
            .filter(user -> actor == null || !user.getId().equals(actor.getId()))
            .filter(user -> wantsEmail(user, issue.getProject()))
            .map(user -> new EventUserNotification(event, user))
            .forEach(notifications::save);
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
