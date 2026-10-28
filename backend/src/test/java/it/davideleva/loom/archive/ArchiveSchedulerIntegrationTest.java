package it.davideleva.loom.archive;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import it.davideleva.loom.domain.*;
import it.davideleva.loom.notification.EventService;
import it.davideleva.loom.repository.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:archive;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
    "spring.datasource.password=", "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop", "logging.level.root=WARN",
    "app.archive.enabled=false", "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
@Transactional
class ArchiveSchedulerIntegrationTest {
    @Autowired CompanyRepository companies;
    @Autowired ProjectRepository projects;
    @Autowired IssueRepository issues;

    @Test
    void querySelectsOnlyApprovedIssuesOlderThanApprovalThreshold() {
        Project project = project("Eligibility", 7);
        Instant threshold = Instant.parse("2026-10-01T12:00:00Z");
        Issue eligible = issue(project, IssueStatus.APPROVED, threshold.minusSeconds(1));
        issue(project, IssueStatus.APPROVED, threshold);
        issue(project, IssueStatus.APPROVED, threshold.plusSeconds(1));
        issue(project, IssueStatus.APPROVED, null);
        for (IssueStatus status : IssueStatus.values()) {
            if (status != IssueStatus.APPROVED) issue(project, status, threshold.minusSeconds(1));
        }
        Issue deleted = issue(project, IssueStatus.APPROVED, threshold.minusSeconds(1));
        deleted.markDeleted(threshold);
        Issue archived = issue(project, IssueStatus.APPROVED, threshold.minusSeconds(1));
        archived.markArchived(threshold);
        // Approval is the sole age reference, even when release is absent or more recent.
        eligible.setReleasedAt(null);
        Issue recentRelease = issue(project, IssueStatus.APPROVED, threshold.minusSeconds(1));
        recentRelease.setReleasedAt(threshold.plusSeconds(1));
        issues.flush();

        assertEquals(java.util.Set.of(eligible.getId(), recentRelease.getId()),
            issues.findArchivable(threshold).stream().map(Issue::getId).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void schedulerUsesEachProjectsDaysSinceApprovalAndIsIdempotent() {
        Project shortRetention = project("Short", 7);
        Project longRetention = project("Long", 30);
        Project disabled = project("Disabled", null);
        Instant tenDaysAgo = Instant.now().minus(10, ChronoUnit.DAYS);
        Issue eligible = issue(shortRetention, IssueStatus.APPROVED, tenDaysAgo);
        Issue tooRecent = issue(longRetention, IssueStatus.APPROVED, tenDaysAgo);
        Issue oldRelease = issue(shortRetention, IssueStatus.APPROVED, Instant.now().minus(1, ChronoUnit.DAYS));
        Issue released = issue(shortRetention, IssueStatus.RELEASED, null);
        Issue noConfig = issue(disabled, IssueStatus.APPROVED, tenDaysAgo);
        EventService events = mock(EventService.class);
        ArchiveScheduler scheduler = new ArchiveScheduler(projects, issues, events);

        scheduler.archiveApprovedIssues();
        issues.flush();
        assertNotNull(eligible.getArchivedAt());
        for (Issue excluded : java.util.List.of(tooRecent, oldRelease, released, noConfig)) {
            assertNull(excluded.getArchivedAt());
        }
        scheduler.archiveApprovedIssues();
        verify(events, times(1)).issueEvent(eq(EventType.ISSUE_ARCHIVED), eq(eligible), isNull(),
            eq("Archiviata automaticamente dopo 7 giorni dall'approvazione."));
    }

    private Project project(String name, Integer days) {
        Company company = companies.save(new Company(name));
        Project project = new Project(name, company);
        project.setArchiveAfterDays(days);
        return projects.save(project);
    }

    private Issue issue(Project project, IssueStatus status, Instant approvedAt) {
        Issue issue = new Issue(project, "Archive test", "Description", IssueType.ANOMALY);
        issue.setStatus(status);
        issue.setReleasedAt(Instant.parse("2026-01-01T00:00:00Z"));
        issue.setApprovedAt(approvedAt);
        return issues.save(issue);
    }
}
