package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/work/projects/{projectId}/events")
@PreAuthorize("hasAnyRole('TEAM', 'ADMIN')")
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class WorkspaceEventController {
    private final EventRepository events;
    private final UserRepository users;
    private final ProjectUserRepository memberships;
    private final ApiLookup lookup;

    public record EventOutput(Long id, Instant eventDate, EventType type, String data,
                              Long issueId, String issueTitle, boolean internal,
                              Long actorId, String actorUsername) {}
    public record ActorOutput(Long id, String username) {}
    public record EventPage(List<EventOutput> items, long total) {}

    @GetMapping
    public EventPage list(@PathVariable Long projectId, @RequestParam(defaultValue = "0") int page,
                          @RequestParam(defaultValue = "25") int size, @RequestParam(required = false) EventType type,
                          @RequestParam(required = false) Long actorId, @RequestParam(required = false) Instant from,
                          @RequestParam(required = false) Instant to, JwtAuthenticationToken authentication) {
        User user = authorizedUser(projectId, authentication);
        if (page < 0 || size < 1 || size > 100 || (from != null && to != null && !from.isBefore(to))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid event filters");
        }
        Specification<Event> filters = (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.equal(root.get("project").get("id"), projectId));
            if (!canSeeInternal(user)) predicates.add(builder.isFalse(root.get("internal")));
            if (type != null) predicates.add(builder.equal(root.get("type"), type));
            if (actorId != null) predicates.add(builder.equal(root.get("actor").get("id"), actorId));
            if (from != null) predicates.add(builder.greaterThanOrEqualTo(root.get("eventDate"), from));
            if (to != null) predicates.add(builder.lessThan(root.get("eventDate"), to));
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        Page<Event> result = events.findAll(filters,
            PageRequest.of(page, size, Sort.by(Sort.Order.desc("eventDate"), Sort.Order.desc("id"))));
        log.info("Events listed: project={} actor={} page={} size={} type={} actorFilter={} total={}",
            projectId, user.getId(), page, size, type, actorId, result.getTotalElements());
        return new EventPage(result.map(event -> new EventOutput(event.getId(), event.getEventDate(), event.getType(),
            event.getData(), event.getIssueRefId(), event.getIssue() == null ? null : event.getIssue().getTitle(),
            event.isInternal(),
            event.getActor() == null ? null : event.getActor().getId(),
            event.getActor() == null ? null : event.getActor().getUsername())).getContent(), result.getTotalElements());
    }

    @GetMapping("/actors")
    public List<ActorOutput> actors(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        User user = authorizedUser(projectId, authentication);
        List<ActorOutput> output = events.actors(projectId, canSeeInternal(user)).stream()
            .map(row -> new ActorOutput((Long) row[0], (String) row[1])).toList();
        log.info("Event actors listed: project={} actor={} count={}", projectId, user.getId(), output.size());
        return output;
    }

    private User authorizedUser(Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        User user = users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        if (user.getRole() != Role.ADMIN
            && !ProjectMembershipPolicy.isAutomaticCompanyMember(project, user)
            && !memberships.existsById(new ProjectUserId(projectId, user.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project not available");
        }
        return user;
    }

    private boolean canSeeInternal(User user) {
        return user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM;
    }
}
