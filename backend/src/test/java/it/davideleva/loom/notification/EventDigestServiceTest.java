package it.davideleva.loom.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class EventDigestServiceTest {

    private final EventDigestService service = new EventDigestService();

    // -------- helpers --------

    private static Company company(long id) {
        Company c = new Company("Company " + id);
        ReflectionTestUtils.setField(c, "id", id);
        return c;
    }

    private static Project project(long id, Company owner) {
        Project p = new Project("Project " + id, owner);
        ReflectionTestUtils.setField(p, "id", id);
        return p;
    }

    private static Issue issue(long id, Project project) {
        Issue issue = new Issue(project, "Issue " + id, "Body", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", id);
        return issue;
    }

    private static User user(long id, Role role, Company company) {
        User user = new User("u" + id, "u" + id + "@example.com", "hash", role, company);
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "firstName", "First");
        ReflectionTestUtils.setField(user, "lastName", "Last");
        return user;
    }

    private static Event event(long id, EventType type, Issue issue, String data) {
        return event(id, type, issue, data, Instant.parse("2026-03-01T10:00:00Z"));
    }

    private static Event event(long id, EventType type, Issue issue, String data, Instant when) {
        Event event = new Event(type, data, issue.getProject(), issue, null);
        ReflectionTestUtils.setField(event, "id", id);
        ReflectionTestUtils.setField(event, "eventDate", when);
        return event;
    }

    // -------- guards --------

    @Test
    void nullUserReturnsNull() {
        Issue issue = issue(1, project(10, company(100)));
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");
        assertNull(service.buildDigest(null, List.of(event)));
    }

    @Test
    void emptyEventsReturnsNull() {
        assertNull(service.buildDigest(user(1, Role.USER, company(100)), List.of()));
    }

    @Test
    void internalIssueIsHiddenFromRegularUser() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        issue.setInternal(true);
        User regularUser = user(2, Role.USER, c);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        assertNull(service.buildDigest(regularUser, List.of(event)));
    }

    @Test
    void internalIssueIsVisibleToAdmin() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        issue.setInternal(true);
        User admin = user(2, Role.ADMIN, company(999)); // different company, ADMIN override
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        EmailDigest digest = service.buildDigest(admin, List.of(event));
        assertNotNull(digest);
        assertEquals(1, digest.issues().size());
        assertTrue(digest.issues().get(0).internal());
    }

    @Test
    void crossCompanyIssueHiddenFromUserNotInThatCompany() {
        Company userCompany = company(100);
        Company projectCompany = company(200);
        Project p = project(10, projectCompany);
        Issue issue = issue(1, p);
        User regular = user(2, Role.USER, userCompany);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        assertNull(service.buildDigest(regular, List.of(event)));
    }

    // -------- status transition collapse --------

    @Test
    void statusTransitionCollapsesToFirstAndLast() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, "REPORTED -> IN_PROGRESS"),
            event(2, EventType.ISSUE_STATUS_CHANGED, issue, "IN_PROGRESS -> COMPLETED"),
            event(3, EventType.ISSUE_STATUS_CHANGED, issue, "COMPLETED -> RELEASED")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest id = digest.issues().get(0);
        // Exactly one item, collapsed to REPORTED -> RELEASED.
        assertEquals(1, id.items().size());
        assertEquals(new EmailDigest.StatusTransition("REPORTED", "RELEASED"), id.items().get(0));
    }

    @Test
    void statusTransitionChainReturningToStartIsOmitted() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, "REPORTED -> IN_PROGRESS"),
            event(2, EventType.ISSUE_STATUS_CHANGED, issue, "IN_PROGRESS -> REPORTED")
        );

        EmailDigest digest = service.buildDigest(u, events);
        // No status net change AND no other items: digest for this issue is dropped.
        assertNull(digest);
    }

    @Test
    void statusTransitionIgnoresUnparsablePayloads() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, ""),
            event(2, EventType.ISSUE_STATUS_CHANGED, issue, "garbage"),
            event(3, EventType.ISSUE_STATUS_CHANGED, issue, "REPORTED -> IN_PROGRESS")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(1, digest.issues().size());
        EmailDigest.IssueDigest id = digest.issues().get(0);
        // The parseable event becomes the first/last transition.
        assertEquals(List.of(new EmailDigest.StatusTransition("REPORTED", "IN_PROGRESS")), id.items());
    }

    // -------- comments --------

    @Test
    void thirtyCommentAddsAndOneDeleteNetToTwentyNine() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);

        java.util.List<Event> events = new java.util.ArrayList<>();
        long id = 1;
        for (int i = 0; i < 30; i++) events.add(event(id++, EventType.ISSUE_COMMENT_ADDED, issue, ""));
        events.add(event(id++, EventType.ISSUE_COMMENT_DELETED, issue, ""));
        events.add(event(id++, EventType.ISSUE_COMMENT_DELETED, issue, ""));

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest idig = digest.issues().get(0);
        assertEquals(1, idig.items().size());
        assertEquals(new EmailDigest.CommentsAdded(28), idig.items().get(0));
    }

    @Test
    void equalAddAndDeleteCommentsProducesNoCommentItem() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_COMMENT_ADDED, issue, ""),
            event(2, EventType.ISSUE_COMMENT_DELETED, issue, ""),
            // values-changed so the issue survives even with no comment net effect
            event(3, EventType.ISSUE_VALUES_CHANGED, issue, "")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest id = digest.issues().get(0);
        assertEquals(List.of(new EmailDigest.ValuesChanged()), id.items());
    }

    // -------- issue added then deleted --------

    @Test
    void issueCreatedThenDeletedInSameWindowIsDropped() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_CREATED, issue, ""),
            event(2, EventType.ISSUE_STATUS_CHANGED, issue, "REPORTED -> IN_PROGRESS"),
            event(3, EventType.ISSUE_DELETED, issue, "")
        );

        assertNull(service.buildDigest(u, events));
    }

    @Test
    void issueCreatedThenArchivedInSameWindowIsDropped() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_CREATED, issue, ""),
            event(2, EventType.ISSUE_ARCHIVED, issue, "")
        );

        assertNull(service.buildDigest(u, events));
    }

    // -------- other item kinds --------

    @Test
    void valuesChangedCollapsesMultipleEditsIntoOneEntry() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_VALUES_CHANGED, issue, ""),
            event(2, EventType.ISSUE_VALUES_CHANGED, issue, ""),
            event(3, EventType.ISSUE_VALUES_CHANGED, issue, "")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(List.of(new EmailDigest.ValuesChanged()), digest.issues().get(0).items());
    }

    @Test
    void createdAndApprovedAndPlannedAllAppearOnce() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_CREATED, issue, ""),
            event(2, EventType.ISSUE_PLANNED, issue, ""),
            event(3, EventType.ISSUE_PLANNED, issue, ""),
            event(4, EventType.ISSUE_APPROVED, issue, "")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(List.of(
            new EmailDigest.Created(),
            new EmailDigest.Planned(),
            new EmailDigest.Approved()
        ), digest.issues().get(0).items());
    }

    @Test
    void eventsForMultipleIssuesAreGroupedSeparately() {
        Company c = company(100);
        Project p = project(10, c);
        Issue a = issue(1, p);
        Issue b = issue(2, p);
        User u = user(3, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, a, "REPORTED -> COMPLETED"),
            event(2, EventType.ISSUE_COMMENT_ADDED, a, ""),
            event(3, EventType.ISSUE_CREATED, b, "")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(2, digest.issues().size());
        assertEquals(1L, digest.issues().get(0).id());
        assertEquals(2L, digest.issues().get(1).id());
        assertEquals(List.of(new EmailDigest.StatusTransition("REPORTED", "COMPLETED"), new EmailDigest.CommentsAdded(1)),
            digest.issues().get(0).items());
        assertEquals(List.of(new EmailDigest.Created()), digest.issues().get(1).items());
    }

    @Test
    void digestCarriesOldestAndNewestEventTimestamps() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        Instant oldest = Instant.parse("2026-03-01T09:00:00Z");
        Instant newest = Instant.parse("2026-03-01T12:00:00Z");
        List<Event> events = List.of(
            event(1, EventType.ISSUE_CREATED, issue, "", oldest),
            event(2, EventType.ISSUE_VALUES_CHANGED, issue, "", newest),
            event(3, EventType.ISSUE_COMMENT_ADDED, issue, "", Instant.parse("2026-03-01T11:00:00Z"))
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(oldest, digest.oldestEvent());
        assertEquals(newest, digest.newestEvent());
    }

    @Test
    void userDigestCarriesIdUsernameEmailAndFullName() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(7, Role.USER, c);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        EmailDigest digest = service.buildDigest(u, List.of(event));
        assertNotNull(digest);
        assertEquals(7L, digest.user().id());
        assertEquals("u7", digest.user().username());
        assertEquals("u7@example.com", digest.user().email());
        assertEquals("First Last", digest.user().fullName());
    }

    @Test
    void userWithoutFirstOrLastNameFallsBackToUsername() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(8, Role.USER, c);
        ReflectionTestUtils.setField(u, "firstName", null);
        ReflectionTestUtils.setField(u, "lastName", null);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        EmailDigest digest = service.buildDigest(u, List.of(event));
        assertEquals("u8", digest.user().fullName());
    }

    @Test
    void teamUserSeesInternalIssue() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        issue.setInternal(true);
        User teamUser = user(2, Role.TEAM, c);
        Event event = event(1, EventType.ISSUE_VALUES_CHANGED, issue, "");

        EmailDigest digest = service.buildDigest(teamUser, List.of(event));
        assertNotNull(digest);
        assertEquals(1, digest.issues().size());
        assertTrue(digest.issues().get(0).internal());
    }

    @Test
    void eventsWithoutIssueRefIdAreIgnored() {
        Company c = company(100);
        Project p = project(10, c);
        User u = user(2, Role.USER, c);
        Event projectLevel = new Event(EventType.ISSUE_CREATED, "", p, null, null);
        ReflectionTestUtils.setField(projectLevel, "id", 1L);
        ReflectionTestUtils.setField(projectLevel, "eventDate", Instant.parse("2026-03-01T10:00:00Z"));

        assertNull(service.buildDigest(u, List.of(projectLevel)));
    }

    @Test
    void issueDigestKeepsTitleAndProjectName() {
        Company c = company(100);
        Project p = project(10, c);
        ReflectionTestUtils.setField(p, "name", "Customer Portal");
        Issue issue = issue(1, p);
        ReflectionTestUtils.setField(issue, "title", "Cannot save attachments");
        User u = user(2, Role.USER, c);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        EmailDigest digest = service.buildDigest(u, List.of(event));
        EmailDigest.IssueDigest d = digest.issues().get(0);
        assertEquals("Customer Portal", d.projectName());
        assertEquals("Cannot save attachments", d.title());
        assertEquals(1L, d.id());
        assertEquals(10L, d.projectId());
    }
}
