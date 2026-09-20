package it.sf2.tickets.controller;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.sf2.tickets.domain.Company;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class ProjectMembershipPolicyTest {

    @Test
    void adminAlwaysPassesRequireParticipant() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Company otherCompany = new Company("Other");
        ReflectionTestUtils.setField(otherCompany, "id", 2L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 10L);

        User admin = new User("admin", "admin@example.com", "hash", Role.ADMIN, otherCompany);
        ReflectionTestUtils.setField(admin, "id", 42L);

        // no explicit membership, different company — ADMIN still passes
        assertDoesNotThrow(() -> ProjectMembershipPolicy.requireParticipant(project, admin, false));
    }

    @Test
    void userInSameCompanyIsAutomaticMemberAndPasses() {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 1L);

        Project project = new Project("Project", company);
        ReflectionTestUtils.setField(project, "id", 10L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, company);
        ReflectionTestUtils.setField(user, "id", 1L);

        assertTrue(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
        assertDoesNotThrow(() -> ProjectMembershipPolicy.requireParticipant(project, user, false));
    }

    @Test
    void userInDifferentCompanyWithoutExplicitMembershipThrowsForbidden() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Company otherCompany = new Company("Other");
        ReflectionTestUtils.setField(otherCompany, "id", 2L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 10L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, otherCompany);
        ReflectionTestUtils.setField(user, "id", 1L);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> ProjectMembershipPolicy.requireParticipant(project, user, false));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    @Test
    void userInDifferentCompanyWithExplicitMembershipPasses() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Company otherCompany = new Company("Other");
        ReflectionTestUtils.setField(otherCompany, "id", 2L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 10L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, otherCompany);
        ReflectionTestUtils.setField(user, "id", 1L);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
        assertDoesNotThrow(() -> ProjectMembershipPolicy.requireParticipant(project, user, true));
    }

    @Test
    void adminInDifferentCompanyWithoutExplicitMembershipStillPasses() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Company otherCompany = new Company("Other");
        ReflectionTestUtils.setField(otherCompany, "id", 2L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 10L);

        User admin = new User("admin", "admin@example.com", "hash", Role.ADMIN, otherCompany);
        ReflectionTestUtils.setField(admin, "id", 42L);

        // not automatic, no explicit membership — admin still passes
        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, admin));
        assertDoesNotThrow(() -> ProjectMembershipPolicy.requireParticipant(project, admin, false));
    }

    @Test
    void isAutomaticCompanyMemberTrueWhenSameCompanyId() {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 5L);

        Project project = new Project("Project", company);
        User user = new User("alice", "alice@example.com", "hash", Role.USER, company);

        assertTrue(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
    }

    @Test
    void isAutomaticCompanyMemberFalseWhenDifferentCompanyId() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Company otherCompany = new Company("Other");
        ReflectionTestUtils.setField(otherCompany, "id", 2L);

        Project project = new Project("Project", projectCompany);
        User user = new User("alice", "alice@example.com", "hash", Role.USER, otherCompany);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
    }

    @Test
    void isAutomaticCompanyMemberFalseWhenProjectCompanyIsNull() {
        Project project = new Project("Project", null);
        Company userCompany = new Company("Acme");
        ReflectionTestUtils.setField(userCompany, "id", 1L);
        User user = new User("alice", "alice@example.com", "hash", Role.USER, userCompany);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
    }

    @Test
    void isAutomaticCompanyMemberFalseWhenUserCompanyIsNull() {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);
        Project project = new Project("Project", projectCompany);
        User user = new User("alice", "alice@example.com", "hash", Role.USER, null);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
    }

    @Test
    void isAutomaticCompanyMemberFalseWhenBothCompaniesAreNull() {
        Project project = new Project("Project", null);
        User user = new User("alice", "alice@example.com", "hash", Role.USER, null);

        assertFalse(ProjectMembershipPolicy.isAutomaticCompanyMember(project, user));
    }
}
