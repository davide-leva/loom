package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueAttachmentTest {

    private static Project newProject(long id) {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", id);
        return project;
    }

    @Test
    void constructorPopulatesAllFieldsAndProjectIdFromIssue() {
        Project project = newProject(77L);
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 100L);

        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Attachment", FieldType.ATTACHMENTS);
        User user = new User("alice", "alice@example.com", "h", Role.USER, null);

        IssueAttachment attachment = new IssueAttachment(
            issue, def, user, "report.pdf", "application/pdf", 4096L, "pdf");

        assertSame(issue, attachment.getIssue());
        assertSame(def, attachment.getDefinition());
        assertSame(user, attachment.getUser());
        assertEquals("report.pdf", attachment.getOriginalName());
        assertEquals("application/pdf", attachment.getContentType());
        assertEquals(4096L, attachment.getFileSize());
        assertEquals("pdf", attachment.getExtension());
        assertEquals(77L, attachment.getProjectId());
        assertNull(attachment.getStoredPath());
    }

    @Test
    void storedPathRoundTrips() {
        Project project = newProject(1L);
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        IssueAttachment attachment = new IssueAttachment(issue, null, null, "a.txt", "text/plain", 1L, "txt");

        attachment.setStoredPath("/var/data/a.txt");
        assertEquals("/var/data/a.txt", attachment.getStoredPath());
    }

    @Test
    void idIsSettableViaReflection() {
        Project project = newProject(1L);
        Issue issue = new Issue(project, "Title", "Desc", IssueType.ANOMALY);
        IssueAttachment attachment = new IssueAttachment(issue, null, null, "a.txt", "text/plain", 1L, "txt");
        ReflectionTestUtils.setField(attachment, "id", 5L);
        assertEquals(5L, attachment.getId());
    }
}
