package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class EventTest {

    @Test
    void constructorForIssueDerivesIssueRefIdAndInternalFlag() {
        Company company = new Company("Acme");
        Project project = new Project("Apollo", company);
        ReflectionTestUtils.setField(project, "id", 1L);

        Issue internalIssue = new Issue(project, "Internal", "Body", IssueType.ANOMALY);
        ReflectionTestUtils.setField(internalIssue, "id", 100L);
        ReflectionTestUtils.setField(internalIssue, "internal", true);

        Issue publicIssue = new Issue(project, "Public", "Body", IssueType.ANOMALY);
        ReflectionTestUtils.setField(publicIssue, "id", 200L);
        // publicIssue stays non-internal (false)

        User actor = new User("alice", "alice@example.com", "h", Role.ADMIN, company);
        ReflectionTestUtils.setField(actor, "id", 7L);

        Event internalEvent = new Event(EventType.ISSUE_CREATED, "data", project, internalIssue, actor);
        assertEquals(internalIssue.getId(), internalEvent.getIssueRefId());
        assertTrue(internalEvent.isInternal());

        Event publicEvent = new Event(EventType.ISSUE_CREATED, "data", project, publicIssue, actor);
        assertEquals(publicIssue.getId(), publicEvent.getIssueRefId());
        assertFalse(publicEvent.isInternal());
    }

    @Test
    void constructorWithNullIssueLeavesIssueRefIdAndInternalAsNullAndFalse() {
        Project project = new Project("Apollo", new Company("Acme"));
        User actor = new User("alice", "alice@example.com", "h", Role.ADMIN, null);

        Event event = new Event(EventType.ISSUE_CREATED, "data", project, null, actor);
        assertNull(event.getIssueRefId());
        assertFalse(event.isInternal());
    }

    @Test
    void constructorPopulatesAllArguments() {
        Company company = new Company("Acme");
        Project project = new Project("Apollo", company);
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 5L);
        User actor = new User("alice", "alice@example.com", "h", Role.ADMIN, company);

        Event event = new Event(EventType.ISSUE_STATUS_CHANGED, "payload", project, issue, actor);

        assertEquals(EventType.ISSUE_STATUS_CHANGED, event.getType());
        assertEquals("payload", event.getData());
        assertEquals(project, event.getProject());
        assertEquals(issue, event.getIssue());
        assertEquals(5L, event.getIssueRefId());
        assertEquals(actor, event.getActor());
        assertFalse(event.isInternal());
    }

    @Test
    void settersUpdateFields() {
        Event event = new Event(EventType.ISSUE_CREATED, "data",
            new Project("Apollo", new Company("Acme")),
            null,
            new User("alice", "alice@example.com", "h", Role.USER, null));
        event.setData("updated");
        event.setInternal(true);
        assertEquals("updated", event.getData());
        assertTrue(event.isInternal());
    }

    @Test
    void idIsSettableViaReflection() {
        Event event = new Event(EventType.ISSUE_CREATED, "data",
            new Project("Apollo", new Company("Acme")),
            null,
            new User("alice", "alice@example.com", "h", Role.USER, null));
        ReflectionTestUtils.setField(event, "id", 33L);
        assertEquals(33L, event.getId());
    }
}
