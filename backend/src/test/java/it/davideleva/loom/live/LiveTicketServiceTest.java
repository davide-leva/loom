package it.davideleva.loom.live;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

import it.davideleva.loom.controller.ApiLookup;
import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class LiveTicketServiceTest {
    @Mock UserRepository users;
    @Mock ProjectUserRepository memberships;
    @Mock ApiLookup lookup;

    @Test
    void ticketIsConsumedOnlyOnceForAnAuthorizedCompanyUser() {
        Company company = company(5L);
        User user = user(10L, Role.USER, company);
        Project project = project(20L, company);
        LiveTicketService service = new LiveTicketService(users, memberships, lookup);
        when(users.findById(10L)).thenReturn(Optional.of(user));
        when(lookup.project(20L)).thenReturn(project);

        LiveTicketService.Ticket ticket = service.issue(20L, auth(10L));

        assertNotNull(service.consume(ticket.value()));
        assertNull(service.consume(ticket.value()));
    }

    @Test
    void ticketIsNotIssuedWhenProjectIsNotVisible() {
        User user = user(10L, Role.USER, company(5L));
        Project project = project(20L, company(6L));
        LiveTicketService service = new LiveTicketService(users, memberships, lookup);
        when(users.findById(10L)).thenReturn(Optional.of(user));
        when(lookup.project(20L)).thenReturn(project);
        when(memberships.existsById(new ProjectUserId(20L, 10L))).thenReturn(false);

        try {
            service.issue(20L, auth(10L));
        } catch (ResponseStatusException exception) {
            assertNull(service.consume("missing"));
            return;
        }
        throw new AssertionError("Expected ResponseStatusException");
    }

    @Test
    void grantExpiresWithJwtSession() {
        Company company = company(5L);
        User team = user(10L, Role.TEAM, company);
        Project project = project(20L, company);
        LiveTicketService service = new LiveTicketService(users, memberships, lookup);
        when(users.findById(10L)).thenReturn(Optional.of(team));
        when(lookup.project(20L)).thenReturn(project);

        LiveTicketService.Ticket ticket = service.issue(20L, auth(10L, Instant.now().minusSeconds(1)));

        assertNull(service.consume(ticket.value()));
    }

    private static JwtAuthenticationToken auth(long userId) {
        return auth(userId, Instant.now().plusSeconds(60));
    }

    private static JwtAuthenticationToken auth(long userId, Instant expiresAt) {
        // Spring's Jwt constructor requires expiresAt > issuedAt, so when the caller
        // asks for an already-expired token we still have to pick an issuedAt that
        // is strictly before expiresAt.
        Instant issuedAt = expiresAt.isAfter(Instant.now())
            ? Instant.now().minusSeconds(1)
            : expiresAt.minusSeconds(60);
        Jwt jwt = new Jwt("token-" + userId, issuedAt, expiresAt,
            Map.of("alg", "none"), Map.of("sub", Long.toString(userId)));
        return new JwtAuthenticationToken(jwt);
    }

    private static Company company(long id) {
        Company company = new Company("Company " + id);
        ReflectionTestUtils.setField(company, "id", id);
        return company;
    }

    private static Project project(long id, Company company) {
        Project project = new Project("Project " + id, company);
        ReflectionTestUtils.setField(project, "id", id);
        return project;
    }

    private static User user(long id, Role role, Company company) {
        User user = new User("user" + id, "user" + id + "@example.com", "hash", role, company);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
