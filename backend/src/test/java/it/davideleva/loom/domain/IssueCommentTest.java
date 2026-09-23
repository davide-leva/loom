package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueCommentTest {

    @Test
    void constructorStoresIssueUserAndComment() {
        Project project = new Project("Apollo", new Company("Acme"));
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        User user = new User("alice", "alice@example.com", "h", Role.USER, null);

        IssueComment comment = new IssueComment(issue, user, "Hello world");

        assertSame(issue, comment.getIssue());
        assertSame(user, comment.getUser());
        assertEquals("Hello world", comment.getComment());
    }

    @Test
    void commentSetterUpdatesValue() {
        IssueComment comment = new IssueComment(
            new Issue(new Project("Apollo", new Company("Acme")), "T", "D", IssueType.ANOMALY),
            new User("alice", "alice@example.com", "h", Role.USER, null),
            "old");
        comment.setComment("new");
        assertEquals("new", comment.getComment());
    }

    @Test
    void idIsSettableViaReflection() {
        IssueComment comment = new IssueComment(
            new Issue(new Project("Apollo", new Company("Acme")), "T", "D", IssueType.ANOMALY),
            new User("alice", "alice@example.com", "h", Role.USER, null),
            "text");
        ReflectionTestUtils.setField(comment, "id", 12L);
        assertEquals(12L, comment.getId());
    }
}
