package it.davideleva.loom.live;

import it.davideleva.loom.controller.ApiLookup;
import it.davideleva.loom.controller.ProjectMembershipPolicy;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Slf4j
public class LiveTicketService {
    public record Ticket(String value) {}
    public record Grant(Long userId, Long projectId, boolean internalAllowed,
                        Instant expiresAt, Instant sessionExpiresAt) {}

    private final UserRepository users;
    private final ProjectUserRepository memberships;
    private final ApiLookup lookup;
    private final Map<String, Grant> tickets = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    @Transactional(readOnly = true)
    public Ticket issue(Long projectId, JwtAuthenticationToken authentication) {
        User user = users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        Project project = lookup.project(projectId);
        if (!canAccess(project, user)) {
            log.warn("Live ticket denied: user={} project={}", user.getId(), projectId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project not available");
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tickets.put(value, new Grant(user.getId(), projectId, internalAllowed(user), Instant.now().plusSeconds(30),
            authentication.getToken().getExpiresAt()));
        log.info("Live ticket issued: user={} project={} internalAllowed={}", user.getId(), projectId, internalAllowed(user));
        return new Ticket(value);
    }

    @Transactional(readOnly = true)
    public Grant consume(String value) {
        if (value == null) return null;
        Grant grant = tickets.remove(value);
        if (grant == null || !grant.expiresAt().isAfter(Instant.now())
            || grant.sessionExpiresAt() == null || !grant.sessionExpiresAt().isAfter(Instant.now())) {
            log.warn("Live ticket rejected: expiredOrMissing={}", grant == null ? "missing" : "expired");
            return null;
        }
        User user = users.findById(grant.userId()).orElse(null);
        if (user == null) {
            log.warn("Live ticket rejected: user={} no longer exists", grant.userId());
            return null;
        }
        Project project;
        try {
            project = lookup.project(grant.projectId());
        } catch (ResponseStatusException exception) {
            return null;
        }
        if (!canAccess(project, user)) {
            log.warn("Live ticket rejected: user={} project={} no longer accessible", user.getId(), project.getId());
            return null;
        }
        log.info("Live ticket consumed: user={} project={}", user.getId(), project.getId());
        return new Grant(user.getId(), project.getId(), internalAllowed(user), grant.expiresAt(), grant.sessionExpiresAt());
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean isCurrent(Grant grant) {
        if (!grant.sessionExpiresAt().isAfter(Instant.now())) return false;
        User user = users.findById(grant.userId()).orElse(null);
        if (user == null || internalAllowed(user) != grant.internalAllowed()) return false;
        try {
            return canAccess(lookup.project(grant.projectId()), user);
        } catch (ResponseStatusException exception) {
            return false;
        }
    }

    @Scheduled(fixedDelay = 60_000)
    public void clearExpired() {
        Instant now = Instant.now();
        int before = tickets.size();
        tickets.entrySet().removeIf(entry -> !entry.getValue().expiresAt().isAfter(now));
        int removed = before - tickets.size();
        if (removed > 0) log.debug("Expired live tickets removed: count={}", removed);
    }

    private boolean canAccess(Project project, User user) {
        return user.getRole() == Role.ADMIN
            || ProjectMembershipPolicy.isAutomaticCompanyMember(project, user)
            || memberships.existsById(new ProjectUserId(project.getId(), user.getId()));
    }

    private boolean internalAllowed(User user) {
        return user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM;
    }
}
