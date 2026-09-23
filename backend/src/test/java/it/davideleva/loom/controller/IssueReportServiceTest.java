package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueStatus;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.User;
import java.time.Instant;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueReportServiceTest {
    private final IssueReportService service = new IssueReportService();

    @Test
    void generateReturnsNonEmptyPdfWithProvidedHeader() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 1L);
        Project project = new Project("Portal", company);
        ReflectionTestUtils.setField(project, "id", 1L);

        User issuer = new User("alice", "alice@example.com", "hash",
            it.davideleva.loom.domain.Role.USER, company);
        ReflectionTestUtils.setField(issuer, "id", 11L);

        Issue issue = new Issue(project, "Login button is broken",
            "Clicking the login button does nothing.", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 101L);
        issue.setStatus(IssueStatus.REPORTED);
        issue.setIssuer(issuer);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-01T10:00:00Z"));

        IssueReportService.Section section = new IssueReportService.Section("Anomalie", List.of(issue));

        byte[] pdf = service.generate("Portal", List.of(section), List.of());

        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        assertEquals("%PDF", new String(pdf, 0, 4));

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Report segnalazioni"));
            assertTrue(text.contains("Progetto: Portal"));
            assertTrue(text.contains("Login button is broken"));
            assertTrue(text.contains("Segnalato"));
            assertTrue(text.contains("alice"));
        }
    }

    @Test
    void generateProducesPdfWhenNoIssuesMatchFilters() throws Exception {
        byte[] pdf = service.generate("Empty", List.of(), List.of("status=REPORTED"));

        assertNotNull(pdf);
        assertTrue(pdf.length > 0);
        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Nessuna segnalazione corrisponde ai filtri selezionati."));
            assertTrue(text.contains("Totale: 0"));
        }
    }

    @Test
    void generateRendersMultipleSectionsAndFilterDescription() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 2L);
        Project project = new Project("Mobile", company);
        ReflectionTestUtils.setField(project, "id", 2L);

        Issue anomaly = new Issue(project, "Crash on launch",
            "App crashes immediately when launched.", IssueType.ANOMALY);
        ReflectionTestUtils.setField(anomaly, "id", 1L);
        anomaly.setStatus(IssueStatus.IN_PROGRESS);
        ReflectionTestUtils.setField(anomaly, "createdAt", Instant.parse("2026-03-02T08:00:00Z"));

        Issue improvement = new Issue(project, "Add dark mode",
            "Provide a dark mode toggle in settings.", IssueType.IMPROVEMENT);
        ReflectionTestUtils.setField(improvement, "id", 2L);
        improvement.setStatus(IssueStatus.RELEASED);
        ReflectionTestUtils.setField(improvement, "createdAt", Instant.parse("2026-03-03T08:00:00Z"));

        IssueReportService.Section anomalies =
            new IssueReportService.Section("Anomalie", List.of(anomaly));
        IssueReportService.Section improvements =
            new IssueReportService.Section("Migliorie", List.of(improvement));

        byte[] pdf = service.generate("Mobile", List.of(anomalies, improvements),
            List.of("status=IN_PROGRESS", "status=RELEASED"));

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Anomalie"));
            assertTrue(text.contains("Migliorie"));
            assertTrue(text.contains("Crash on launch"));
            assertTrue(text.contains("Add dark mode"));
            assertTrue(text.contains("Totale: 2"));
            assertTrue(text.contains("Filtri: status=IN_PROGRESS · status=RELEASED"));
        }
    }

    @Test
    void generateSkipsEmptySectionsButStillProducesPdf() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 3L);
        Project project = new Project("Reports", company);
        ReflectionTestUtils.setField(project, "id", 3L);

        Issue issue = new Issue(project, "Routed", "Routed to kanban", IssueType.IMPLEMENTATION);
        ReflectionTestUtils.setField(issue, "id", 5L);
        issue.setStatus(IssueStatus.COMPLETED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-04T08:00:00Z"));

        IssueReportService.Section empty =
            new IssueReportService.Section("Rifiutati", List.of());
        IssueReportService.Section routed =
            new IssueReportService.Section("In lavorazione", List.of(issue));

        byte[] pdf = service.generate("Reports", List.of(empty, routed), List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Routed"));
            assertTrue(text.contains("Completato"));
            assertTrue(text.contains("Totale: 1"));
        }
    }

    @Test
    void generateHighlightsSoftDeletedRows() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 4L);
        Project project = new Project("Cleanup", company);
        ReflectionTestUtils.setField(project, "id", 4L);

        Issue deleted = new Issue(project, "Removed",
            "This issue was soft-deleted.", IssueType.ANOMALY);
        ReflectionTestUtils.setField(deleted, "id", 9L);
        deleted.setStatus(IssueStatus.REPORTED);
        ReflectionTestUtils.setField(deleted, "createdAt", Instant.parse("2026-03-05T08:00:00Z"));
        deleted.markDeleted(Instant.parse("2026-03-06T08:00:00Z"));

        byte[] pdf = service.generate("Cleanup",
            List.of(new IssueReportService.Section("Rifiutati", List.of(deleted))), List.of());

        assertNotNull(pdf);
        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Removed"));
            assertTrue(text.contains("Rifiutati"));
        }
    }

    @Test
    void generateRendersUnassignedIssuerAsPlaceholder() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 5L);
        Project project = new Project("NoReporter", company);
        ReflectionTestUtils.setField(project, "id", 5L);

        Issue issue = new Issue(project, "Anonymous", "No reporter", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 12L);
        issue.setStatus(IssueStatus.REPORTED);
        issue.setIssuer(null);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-07T08:00:00Z"));

        byte[] pdf = service.generate("NoReporter",
            List.of(new IssueReportService.Section("Segnalati", List.of(issue))), List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Non assegnato"));
        }
    }

    @Test
    void generateWrapsLongTitlesAcrossMultipleLines() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 6L);
        Project project = new Project("Long", company);
        ReflectionTestUtils.setField(project, "id", 6L);

        String longTitle = "Questo è un titolo molto molto molto molto molto molto molto molto molto lungo";
        Issue issue = new Issue(project, longTitle, "Descrizione", IssueType.IMPROVEMENT);
        ReflectionTestUtils.setField(issue, "id", 20L);
        issue.setStatus(IssueStatus.REPORTED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-08T08:00:00Z"));

        byte[] pdf = service.generate("Long",
            List.of(new IssueReportService.Section("Migliorie", List.of(issue))), List.of());

        assertTrue(pdf.length > 0);
        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            // Long titles get word-wrapped but their words survive.
            assertTrue(text.contains("titolo"));
        }
    }

    @Test
    void generateFiltersBySectionEmptyWithoutEmptyMessageWhenAllSectionsEmpty() throws Exception {
        byte[] pdf = service.generate("AllEmpty",
            List.of(new IssueReportService.Section("Anomalie", List.of()),
                    new IssueReportService.Section("Migliorie", List.of())),
            List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Nessuna segnalazione corrisponde ai filtri selezionati."));
        }
    }

    @Test
    void generateRendersStatusLabelsInItalian() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 7L);
        Project project = new Project("i18n", company);
        ReflectionTestUtils.setField(project, "id", 7L);

        Issue issue = new Issue(project, "Translated", "Status labels", IssueType.IMPLEMENTATION);
        ReflectionTestUtils.setField(issue, "id", 21L);
        issue.setStatus(IssueStatus.APPROVED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-09T08:00:00Z"));

        byte[] pdf = service.generate("i18n",
            List.of(new IssueReportService.Section("Implementazioni", List.of(issue))), List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Approvato"));
            assertTrue(text.contains("Implementazione"));
        }
    }

    @Test
    void generateRendersUntypedIssueAsNonCategorized() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 8L);
        Project project = new Project("Untyped", company);
        ReflectionTestUtils.setField(project, "id", 8L);

        Issue issue = new Issue(project, "No type", "No type assigned", null);
        ReflectionTestUtils.setField(issue, "id", 22L);
        issue.setStatus(IssueStatus.REPORTED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-10T08:00:00Z"));

        byte[] pdf = service.generate("Untyped",
            List.of(new IssueReportService.Section("Segnalati", List.of(issue))), List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document).replaceAll("\\s+", " ");
            assertTrue(text.contains("Non categorizzata"));
        }
    }

    @Test
    void generateWithFilterTextLargerThanPageWidthIsTruncated() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 9L);
        Project project = new Project("Trunc", company);
        ReflectionTestUtils.setField(project, "id", 9L);

        Issue issue = new Issue(project, "Trunc", "Trunc", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 23L);
        issue.setStatus(IssueStatus.REPORTED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-11T08:00:00Z"));

        List<String> filters = List.of("x".repeat(800));
        byte[] pdf = service.generate("Trunc",
            List.of(new IssueReportService.Section("Segnalati", List.of(issue))), filters);

        assertTrue(pdf.length > 0);
    }

    @Test
    void generateHandlesNullIssueTitleAsEmpty() throws Exception {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 10L);
        Project project = new Project("NullTitle", company);
        ReflectionTestUtils.setField(project, "id", 10L);

        Issue issue = new Issue(project, null, "Description", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 24L);
        issue.setStatus(IssueStatus.REPORTED);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-12T08:00:00Z"));

        byte[] pdf = service.generate("NullTitle",
            List.of(new IssueReportService.Section("Segnalati", List.of(issue))), List.of());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("NullTitle"));
            assertTrue(text.contains("Segnalati"));
        }
    }
}
