package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ProjectUserTest {

    @Test
    void constructorBuildsCompositeIdFromProjectAndUser() {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", 5L);
        User user = new User("alice", "alice@example.com", "h", Role.USER, null);
        ReflectionTestUtils.setField(user, "id", 7L);

        ProjectUser membership = new ProjectUser(project, user);

        assertSame(project, membership.getProject());
        assertSame(user, membership.getUser());
        assertEquals(5L, membership.getId().getProjectId());
        assertEquals(7L, membership.getId().getUserId());
        assertNull(membership.getWantEmail());
    }

    @Test
    void wantEmailRoundTrips() {
        ProjectUser membership = new ProjectUser(
            new Project("Apollo", new Company("Acme")),
            new User("alice", "alice@example.com", "h", Role.USER, null));
        membership.setWantEmail(true);
        assertEquals(Boolean.TRUE, membership.getWantEmail());

        membership.setWantEmail(false);
        assertEquals(Boolean.FALSE, membership.getWantEmail());

        membership.setWantEmail(null);
        assertNull(membership.getWantEmail());
    }
}
