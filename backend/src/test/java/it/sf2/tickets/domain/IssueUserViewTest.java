package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueUserViewTest {

    private static Issue newIssue(long id) {
        Project project = new Project("Apollo", new Company("Acme"));
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", id);
        return issue;
    }

    private static User newUser(long id) {
        User user = new User("user", "user@example.com", "h", Role.USER, null);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    void constructorBuildsCompositeIdAndStoresInitialState() {
        Issue issue = newIssue(100L);
        User user = newUser(200L);
        Instant seenAt = Instant.parse("2026-06-01T10:00:00Z");

        IssueUserView view = new IssueUserView(issue, user, 42L, seenAt);

        assertEquals(100L, view.getId().getIssueId());
        assertEquals(200L, view.getId().getUserId());
        assertSame(issue, view.getIssue());
        assertSame(user, view.getUser());
        assertEquals(42L, view.getLastSeenEventId());
        assertEquals(seenAt, view.getSeenAt());
    }

    @Test
    void lastSeenEventIdAndSeenAtAreUpdatable() {
        IssueUserView view = new IssueUserView(newIssue(1L), newUser(2L), 10L, Instant.parse("2026-06-01T10:00:00Z"));

        Instant updated = Instant.parse("2026-06-02T11:00:00Z");
        view.setLastSeenEventId(99L);
        view.setSeenAt(updated);

        assertEquals(99L, view.getLastSeenEventId());
        assertEquals(updated, view.getSeenAt());
    }

    @Test
    void differentInstancesAreNotEqualBecauseEntityHasNoEqualsOverride() {
        IssueUserView a = new IssueUserView(newIssue(5L), newUser(6L), 1L, Instant.parse("2026-01-01T00:00:00Z"));
        IssueUserView b = new IssueUserView(newIssue(5L), newUser(6L), 1L, Instant.parse("2026-01-01T00:00:00Z"));
        IssueUserView c = new IssueUserView(newIssue(7L), newUser(6L), 1L, Instant.parse("2026-01-01T00:00:00Z"));

        // The entity has no @EqualsAndHashCode, so equality defaults to identity equality.
        assertNotSame(a, b);
        assertNotEquals(a, b);
        assertNotEquals(a, c);
    }

    @Test
    void compositeIdEqualityIsDeterminedByIssueIdAndUserId() {
        // The composite key itself is an @Embeddable with @EqualsAndHashCode,
        // so two keys with the same fields compare equal even though the
        // entity wrappers do not.
        IssueUserViewId idA1 = new IssueUserViewId(5L, 6L);
        IssueUserViewId idA2 = new IssueUserViewId(5L, 6L);
        IssueUserViewId idB = new IssueUserViewId(7L, 6L);

        assertEquals(idA1, idA2);
        assertEquals(idA1.hashCode(), idA2.hashCode());
        assertNotEquals(idA1, idB);
    }
}
