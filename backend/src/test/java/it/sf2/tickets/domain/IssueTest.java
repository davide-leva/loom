package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueTest {

    private static Issue newIssue() {
        Project project = new Project("Test Project", new Company("Test Company"));
        ReflectionTestUtils.setField(project, "id", 1L);
        return new Issue(project, "Title", "Description", IssueType.ANOMALY);
    }

    @Test
    void constructorPopulatesFields() {
        Project project = new Project("Test Project", new Company("Test Company"));
        ReflectionTestUtils.setField(project, "id", 7L);
        Issue issue = new Issue(project, "My Title", "My Description", IssueType.IMPROVEMENT);

        assertEquals(project, issue.getProject());
        assertEquals("My Title", issue.getTitle());
        assertEquals("My Description", issue.getDescription());
        assertEquals(IssueType.IMPROVEMENT, issue.getIssueType());
        assertNull(issue.getReleasedAt());
        assertNull(issue.getApprovedAt());
    }

    @Test
    void newIssueDefaultsToReportedStatus() {
        Issue issue = newIssue();
        assertEquals(IssueStatus.REPORTED, issue.getStatus());
    }

    @Test
    void isDeletedReturnsFalseWhenDeletedAtIsNull() {
        Issue issue = newIssue();
        assertFalse(issue.isDeleted());
    }

    @Test
    void markDeletedSetsDeletedAtAndIsDeletedReturnsTrue() {
        Issue issue = newIssue();
        Instant at = Instant.parse("2026-01-01T10:00:00Z");
        issue.markDeleted(at);

        assertTrue(issue.isDeleted());
        assertEquals(at, issue.getDeletedAt());
    }

    @Test
    void isArchivedReturnsFalseWhenArchivedAtIsNull() {
        Issue issue = newIssue();
        assertFalse(issue.isArchived());
    }

    @Test
    void markArchivedSetsArchivedAtAndIsArchivedReturnsTrue() {
        Issue issue = newIssue();
        Instant at = Instant.parse("2026-02-15T08:30:00Z");
        issue.markArchived(at);

        assertTrue(issue.isArchived());
        assertEquals(at, issue.getArchivedAt());
    }

    @Test
    void deleteAndArchiveAreIndependent() {
        Issue issue = newIssue();
        Instant deletedAt = Instant.parse("2026-01-01T10:00:00Z");
        Instant archivedAt = Instant.parse("2026-03-01T10:00:00Z");

        issue.markDeleted(deletedAt);
        assertTrue(issue.isDeleted());
        assertFalse(issue.isArchived());

        issue.markArchived(archivedAt);
        assertTrue(issue.isDeleted());
        assertTrue(issue.isArchived());
        assertEquals(deletedAt, issue.getDeletedAt());
        assertEquals(archivedAt, issue.getArchivedAt());
    }

    @Test
    void statusSetterUpdatesStatus() {
        Issue issue = newIssue();
        issue.setStatus(IssueStatus.IN_PROGRESS);
        assertEquals(IssueStatus.IN_PROGRESS, issue.getStatus());
        issue.setStatus(IssueStatus.COMPLETED);
        assertEquals(IssueStatus.COMPLETED, issue.getStatus());
    }

    @Test
    void releasedAtAndApprovedAtAreUpdatedBySetters() {
        Issue issue = newIssue();
        Instant releasedAt = Instant.parse("2026-04-01T12:00:00Z");
        Instant approvedAt = Instant.parse("2026-04-02T12:00:00Z");

        issue.setReleasedAt(releasedAt);
        issue.setApprovedAt(approvedAt);

        assertEquals(releasedAt, issue.getReleasedAt());
        assertEquals(approvedAt, issue.getApprovedAt());
    }

    @Test
    void internalFlagRoundTrips() {
        Issue issue = newIssue();
        assertFalse(issue.isInternal());
        issue.setInternal(true);
        assertTrue(issue.isInternal());
    }

    @Test
    void issueTypeCanBeChanged() {
        Issue issue = newIssue();
        assertEquals(IssueType.ANOMALY, issue.getIssueType());
        issue.setIssueType(IssueType.IMPLEMENTATION);
        assertEquals(IssueType.IMPLEMENTATION, issue.getIssueType());
    }

    @Test
    void idIsSettableViaReflection() {
        Issue issue = newIssue();
        ReflectionTestUtils.setField(issue, "id", 99L);
        assertEquals(99L, issue.getId());
    }

    @Test
    void developerApproverIssuerAreAssignable() {
        Issue issue = newIssue();
        User dev = new User("dev", "dev@example.com", "hash", Role.USER, null);
        User approver = new User("approver", "approver@example.com", "hash", Role.TEAM, null);
        User issuer = new User("issuer", "issuer@example.com", "hash", Role.USER, null);

        issue.setDeveloper(dev);
        issue.setApprover(approver);
        issue.setIssuer(issuer);

        assertEquals(dev, issue.getDeveloper());
        assertEquals(approver, issue.getApprover());
        assertEquals(issuer, issue.getIssuer());
    }
}
