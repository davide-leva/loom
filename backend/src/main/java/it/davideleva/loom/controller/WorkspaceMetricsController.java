package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.UserRepository;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only project metrics used by integrations that need a per-user
 * activity snapshot (e.g. periodic digest emails). Counts distinct
 * non-deleted issues per user across the issuer / developer / approver
 * roles. Visible to ADMIN only — the counts themselves are not sensitive,
 * but the endpoint is gated the same way as the rest of the admin
 * workspace.
 */
@RestController
@RequestMapping("/api/work")
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class WorkspaceMetricsController {
    private final IssueRepository issues;
    private final UserRepository users;
    private final ApiLookup lookup;

    public record UserIssueCount(
        Long userId, String username, String firstName, String lastName,
        long asIssuer, long asDeveloper, long asApprover, long total
    ) {}

    @GetMapping("/projects/{projectId}/user-issue-counts")
    public List<UserIssueCount> userIssueCounts(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        lookup.project(projectId);
        User user = currentUser(authentication);
        if (user.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
        // No dedicated "live + archived but not soft-deleted" finder; filter the
        // full project listing. The metrics exclude soft-deleted rows since those
        // represent rejected issues, not active ones.
        List<Issue> live = issues.findByProject_Id(projectId).stream()
            .filter(issue -> !issue.isDeleted())
            .toList();

        Map<Long, Counts> accumulator = new LinkedHashMap<>();
        for (Issue issue : live) {
            // Distinct per-issue contribution to `total`: a user who is BOTH issuer
            // and developer on the same issue still counts as one issue, not two.
            Set<Long> seen = new HashSet<>();
            addOnce(accumulator, seen, issue.getIssuer());
            addOnce(accumulator, seen, issue.getDeveloper());
            addOnce(accumulator, seen, issue.getApprover());
            // Per-role buckets are tracked independently and can overlap.
            bumpRole(accumulator, issue.getIssuer(), Counts::bumpIssuer);
            bumpRole(accumulator, issue.getDeveloper(), Counts::bumpDeveloper);
            bumpRole(accumulator, issue.getApprover(), Counts::bumpApprover);
        }

        Map<Long, User> known = new HashMap<>();
        for (Long id : accumulator.keySet()) {
            users.findById(id).ifPresent(u -> known.put(id, u));
        }

        return accumulator.entrySet().stream()
            .map(entry -> {
                User u = known.get(entry.getKey());
                String username = u == null ? null : u.getUsername();
                String firstName = u == null ? null : u.getFirstName();
                String lastName = u == null ? null : u.getLastName();
                Counts c = entry.getValue();
                return new UserIssueCount(entry.getKey(), username, firstName, lastName,
                    c.asIssuer, c.asDeveloper, c.asApprover, c.total);
            })
            .sorted(Comparator.comparingLong(UserIssueCount::total).reversed()
                .thenComparing(UserIssueCount::userId, Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();
    }

    private static void addOnce(Map<Long, Counts> accumulator, Set<Long> seen, User user) {
        if (user == null) return;
        Long id = user.getId();
        if (!seen.add(id)) return;
        accumulator.computeIfAbsent(id, key -> new Counts()).total++;
    }

    private static void bumpRole(Map<Long, Counts> accumulator, User user, java.util.function.Consumer<Counts> role) {
        if (user == null) return;
        Counts counts = accumulator.get(user.getId());
        if (counts == null) return;
        role.accept(counts);
    }

    private static final class Counts {
        long asIssuer;
        long asDeveloper;
        long asApprover;
        long total;

        void bumpIssuer() { asIssuer++; }
        void bumpDeveloper() { asDeveloper++; }
        void bumpApprover() { asApprover++; }
    }

    private User currentUser(JwtAuthenticationToken authentication) {
        return users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
