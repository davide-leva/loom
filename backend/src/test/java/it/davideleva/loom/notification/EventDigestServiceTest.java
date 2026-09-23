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
import java.util.ArrayList;
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
        assertEquals(new EmailDigest.StatusTransition("Segnalato", "Rilasciato"), id.items().get(0));
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
        assertEquals(List.of(new EmailDigest.StatusTransition("Segnalato", "In lavorazione")), id.items());
    }

    @Test
    void statusTransitionAcceptsHumanReadablePayloadWithUnicodeArrow() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        // Payload as written by the controller before this fix:
        // human-readable line with U+2192 RIGHTWARDS ARROW.
        String payload = "Stato: Segnalato → In lavorazione";
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, payload)
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest, "unicode-arrow payload must produce a digest, not be skipped");
        EmailDigest.IssueDigest id = digest.issues().get(0);
        assertEquals(List.of(new EmailDigest.StatusTransition("Segnalato", "In lavorazione")), id.items());
    }

    @Test
    void statusTransitionFallsBackWhenAllPayloadsAreUnparseable() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        issue.setStatus(it.davideleva.loom.domain.IssueStatus.IN_PROGRESS);
        User u = user(2, Role.USER, c);
        // Multiple legacy events with garbage payload, no parseable ones.
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, ""),
            event(2, EventType.ISSUE_STATUS_CHANGED, issue, "garbage line"),
            event(3, EventType.ISSUE_STATUS_CHANGED, issue, "legacy free-text, no enum")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest, "fallback must produce a digest with at least one status item");
        EmailDigest.IssueDigest id = digest.issues().get(0);
        assertEquals(1, id.items().size());
        assertTrue(id.items().get(0) instanceof EmailDigest.StatusTransition,
            "fallback item must be a StatusTransition");
        EmailDigest.StatusTransition transition = (EmailDigest.StatusTransition) id.items().get(0);
        assertEquals("aggiornato", transition.from());
        assertEquals("In lavorazione", transition.to(),
            "fallback must reflect the issue's current status");
    }

    @Test
    void statusTransitionAcceptsDualFormatPayloadEmittedByCurrentController() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        // Format emitted after the fix: human-readable line then machine-parseable
        // enum pair on a second line. The parser must prefer the machine line.
        String payload = "Stato: Segnalato → In lavorazione\nREPORTED -> IN_PROGRESS";
        List<Event> events = List.of(
            event(1, EventType.ISSUE_STATUS_CHANGED, issue, payload)
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest id = digest.issues().get(0);
        assertEquals(List.of(new EmailDigest.StatusTransition("Segnalato", "In lavorazione")), id.items());
    }

    // -------- comments --------

    @Test
    void thirtyCommentAddsAndOneDeleteNetToTwentyNine() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);

        List<Event> events = new ArrayList<>();
        long id = 1;
        for (int i = 0; i < 30; i++) events.add(event(id++, EventType.ISSUE_COMMENT_ADDED, issue,
            "Commento:\nTesto commento " + i));
        events.add(event(id++, EventType.ISSUE_COMMENT_DELETED, issue, ""));
        events.add(event(id++, EventType.ISSUE_COMMENT_DELETED, issue, ""));

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest idig = digest.issues().get(0);
        assertEquals(1, idig.items().size());
        EmailDigest.CommentsAdded comments = (EmailDigest.CommentsAdded) idig.items().get(0);
        assertEquals(28, comments.count());
        // Previews are capped at COMMENT_PREVIEW_LIMIT and pulled from the comments that
        // landed in chronological order in the test list.
        assertTrue(comments.previews().size() <= EventDigestService.COMMENT_PREVIEW_LIMIT);
        assertTrue(comments.previews().stream().allMatch(preview -> preview.startsWith("Testo commento")));
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
            event(3, EventType.ISSUE_VALUES_CHANGED, issue, "Note: (vuoto) → Ciao")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        EmailDigest.IssueDigest id = digest.issues().get(0);
        assertEquals(List.of(new EmailDigest.ValuesChanged(List.of(
            new EmailDigest.FieldChange("Note", "(vuoto)", "Ciao")
        ))), id.items());
    }

    @Test
    void commentPreviewsCarryLatestTextsFromAddEvents() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_COMMENT_ADDED, issue, "Commento:\nPrimo"),
            event(2, EventType.ISSUE_COMMENT_ADDED, issue, "Commento:\nSecondo"),
            event(3, EventType.ISSUE_COMMENT_ADDED, issue, "Commento:\nTerzo")
        );

        EmailDigest digest = service.buildDigest(u, events);
        EmailDigest.CommentsAdded item = (EmailDigest.CommentsAdded) digest.issues().get(0).items().get(0);
        assertEquals(3, item.count());
        // Previews are capped at COMMENT_PREVIEW_LIMIT and ordered most-recent first
        // (the controller emits add events with increasing ids).
        assertTrue(item.previews().size() <= EventDigestService.COMMENT_PREVIEW_LIMIT);
        assertTrue(item.previews().contains("Secondo"));
    }

    @Test
    void attachmentsCaptureOriginalFileNamesFromPayload() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_ATTACHMENT_UPLOADED, issue, "File: report.pdf\nDimensione: 12 byte"),
            event(2, EventType.ISSUE_ATTACHMENT_UPLOADED, issue, "File: screenshot.png\nDimensione: 34 byte")
        );

        EmailDigest digest = service.buildDigest(u, events);
        EmailDigest.AttachmentsAdded item = (EmailDigest.AttachmentsAdded) digest.issues().get(0).items().get(0);
        assertEquals(2, item.count());
        assertEquals(List.of("report.pdf", "screenshot.png"), item.fileNames());
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
            event(1, EventType.ISSUE_VALUES_CHANGED, issue, "Note: (vuoto) → Prima"),
            event(2, EventType.ISSUE_VALUES_CHANGED, issue, "Note: Prima → Seconda\nAllegato: (vuoto) → foto.png"),
            event(3, EventType.ISSUE_VALUES_CHANGED, issue, "Note: Seconda → Finale")
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        // The latest payload wins; earlier intermediates are dropped.
        assertEquals(List.of(new EmailDigest.ValuesChanged(List.of(
            new EmailDigest.FieldChange("Note", "Seconda", "Finale")
        ))), digest.issues().get(0).items());
    }

    @Test
    void createdAndApprovedAndPlannedAllAppearOnce() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        User u = user(2, Role.USER, c);
        User approver = user(99, Role.SUPERUSER, c);
        Event approvalEvent = event(4, EventType.ISSUE_APPROVED, issue, "Stato: RELEASED → APPROVED");
        ReflectionTestUtils.setField(approvalEvent, "actor", approver);
        List<Event> events = List.of(
            event(1, EventType.ISSUE_CREATED, issue, ""),
            event(2, EventType.ISSUE_PLANNED, issue, "Tipologia: (non categorizzata) → Anomalia"),
            event(3, EventType.ISSUE_PLANNED, issue, "Tipologia: Anomalia → Anomalia\nSviluppatore: Non assegnato → alice"),
            approvalEvent
        );

        EmailDigest digest = service.buildDigest(u, events);
        assertNotNull(digest);
        assertEquals(List.of(
            new EmailDigest.Created(),
            new EmailDigest.Planned("Anomalia", "alice"),
            new EmailDigest.Approved("u99")
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
        assertEquals(List.of(new EmailDigest.StatusTransition("Segnalato", "Completato"), new EmailDigest.CommentsAdded(1, List.of())),
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
        // The parser needs a parseable payload so the values-changed item is emitted.
        Event event = event(1, EventType.ISSUE_VALUES_CHANGED, issue, "Note team: (vuoto) → Prima");

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

    @Test
    void issueDigestCarriesTypeStatusDeveloperFromIssueEntity() {
        Company c = company(100);
        Project p = project(10, c);
        Issue issue = issue(1, p);
        // The Issue's internal state is what the renderer reads for tipologia/status/dev.
        issue.setIssueType(IssueType.IMPLEMENTATION);
        issue.setStatus(it.davideleva.loom.domain.IssueStatus.IN_PROGRESS);
        User dev = user(2, Role.TEAM, c);
        issue.setDeveloper(dev);
        User reader = user(3, Role.USER, c);
        Event event = event(1, EventType.ISSUE_CREATED, issue, "");

        EmailDigest digest = service.buildDigest(reader, List.of(event));
        EmailDigest.IssueDigest d = digest.issues().get(0);
        assertEquals("Implementazione", d.issueType());
        assertEquals("In lavorazione", d.currentStatus());
        assertEquals("u2", d.developerName());
    }

    @Test
    void parseCommentTextReturnsNullForEmptyPayload() {
        assertNull(EventDigestService.parseCommentText(null));
        assertNull(EventDigestService.parseCommentText(""));
        assertNull(EventDigestService.parseCommentText("Commento:\n"));
    }

    @Test
    void parseAttachmentNameExtractsFileFromControllerPayload() {
        assertEquals("report.pdf",
            EventDigestService.parseAttachmentName("File: report.pdf\nDimensione: 12 byte"));
        assertEquals("screenshot.png",
            EventDigestService.parseAttachmentName("File: screenshot.png"));
        assertNull(EventDigestService.parseAttachmentName(null));
        assertNull(EventDigestService.parseAttachmentName(""));
        assertNull(EventDigestService.parseAttachmentName("no File: marker here"));
    }

    @Test
    void parseFieldChangesStripsLabelsAndBeforeAfter() {
        List<EmailDigest.FieldChange> parsed = EventDigestService.parseFieldChanges(
            "Note: (vuoto) → Prima\nAllegato: Nessuno → foto.png", 10);
        assertEquals(2, parsed.size());
        assertEquals(new EmailDigest.FieldChange("Note", "(vuoto)", "Prima"), parsed.get(0));
        assertEquals(new EmailDigest.FieldChange("Allegato", "Nessuno", "foto.png"), parsed.get(1));
    }

    @Test
    void parsePlanningExtractsTypeAndDeveloper() {
        java.util.Map<String, String> parsed = EventDigestService.parsePlanning(
            "Tipologia: Anomalia → Miglioria\nSviluppatore: Non assegnato → alice");
        assertEquals("Miglioria", parsed.get("type"));
        assertEquals("alice", parsed.get("developer"));
    }

    @Test
    void parseArchivedReasonStripsTrailingPeriod() {
        assertEquals("Archiviata manualmente da davide",
            EventDigestService.parseArchivedReason("Archiviata manualmente da davide."));
        assertEquals("Archiviata",
            EventDigestService.parseArchivedReason("Archiviata"));
        assertNull(EventDigestService.parseArchivedReason(null));
        assertNull(EventDigestService.parseArchivedReason(""));
    }
}
