package it.davideleva.loom.archive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.notification.EventService;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.ProjectRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class ArchiveSchedulerTest {
    @Mock ProjectRepository projects;
    @Mock IssueRepository issues;
    @Mock EventService eventService;

    private ArchiveScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new ArchiveScheduler(projects, issues, eventService);
    }

    @Test
    void archiveDoesNothingWhenNoAutoArchiveProjects() {
        when(projects.findAutoArchiveProjects()).thenReturn(List.of());

        scheduler.archiveReleasedIssues();

        verify(issues, never()).findArchivable(any());
        verify(eventService, never()).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archiveMarksAllEligibleIssuesAndFiresEvents() {
        Company company = company(1L);
        Project project = project(10L, company, 30);

        Issue i1 = makeIssue(project, 100L);
        Issue i2 = makeIssue(project, 101L);
        Issue otherProject = makeIssue(project(99L, company, 30), 102L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of(i1, i2, otherProject));

        scheduler.archiveReleasedIssues();

        ArgumentCaptor<Issue> issueCaptor = ArgumentCaptor.forClass(Issue.class);
        verify(eventService, times(2)).issueEvent(any(), issueCaptor.capture(), any(), any());
        List<Issue> archived = issueCaptor.getAllValues();
        assertEquals(2, archived.size());
        assertTrue(archived.stream().anyMatch(i -> i.getId().equals(100L)));
        assertTrue(archived.stream().anyMatch(i -> i.getId().equals(101L)));

        // Each archived issue must have a non-null archivedAt timestamp.
        assertTrue(archived.stream().allMatch(i -> i.getArchivedAt() != null));
    }

    @Test
    void archivePassesArchiveEventTypeAndMessage() {
        Company company = company(1L);
        Project project = project(10L, company, 7);
        Issue i = makeIssue(project, 50L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of(i));

        scheduler.archiveReleasedIssues();

        ArgumentCaptor<String> messageCaptor = ArgumentCaptor.forClass(String.class);
        verify(eventService).issueEvent(any(), any(), any(), messageCaptor.capture());
        assertTrue(messageCaptor.getValue().contains("7"),
            "message should mention the configured archive days");
        verify(eventService).issueEvent(any(EventType.class), any(), any(), any());
    }

    @Test
    void archiveSkipsProjectsWithoutArchiveAfterDays() {
        Company company = company(1L);
        Project project = project(10L, company, null);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));

        scheduler.archiveReleasedIssues();

        verify(issues, never()).findArchivable(any());
        verify(eventService, never()).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archiveSkipsProjectsWithZeroArchiveAfterDays() {
        Company company = company(1L);
        Project project = project(10L, company, 0);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));

        scheduler.archiveReleasedIssues();

        verify(issues, never()).findArchivable(any());
    }

    @Test
    void archiveSkipsProjectsWithNegativeArchiveAfterDays() {
        Company company = company(1L);
        Project project = project(10L, company, -1);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));

        scheduler.archiveReleasedIssues();

        verify(issues, never()).findArchivable(any());
    }

    @Test
    void archiveProcessesMultipleProjectsIndependently() {
        Company company = company(1L);
        Project p1 = project(10L, company, 10);
        Project p2 = project(20L, company, 20);
        Issue i1 = makeIssue(p1, 100L);
        Issue i2 = makeIssue(p2, 200L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(p1, p2));
        // The scheduler reuses the same result for both projects in our stub; since i1 belongs to p1 and i2 belongs to p2,
        // each project should archive only its own issue (the other gets filtered out by the safety check).
        when(issues.findArchivable(any())).thenReturn(List.of(i1, i2));

        scheduler.archiveReleasedIssues();

        verify(eventService, times(2)).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archiveIgnoresIssuesFromOtherProjectsInResultSet() {
        Company company = company(1L);
        Project project = project(10L, company, 30);
        Project otherProject = project(99L, company, 30);
        // Issue that belongs to a different project sneaks into the result set.
        Issue wrongProjectIssue = makeIssue(otherProject, 300L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of(wrongProjectIssue));

        scheduler.archiveReleasedIssues();

        verify(eventService, never()).issueEvent(any(), any(), any(), any());
        assertNull(wrongProjectIssue.getArchivedAt(),
            "issues from other projects must not be marked archived");
    }

    @Test
    void archiveIsIdempotentBecauseSecondRunFindsNothing() {
        Company company = company(1L);
        Project project = project(10L, company, 30);
        Issue i = makeIssue(project, 100L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any()))
            .thenReturn(List.of(i))
            .thenReturn(List.of());

        scheduler.archiveReleasedIssues();
        scheduler.archiveReleasedIssues();

        // Only the first run archives.
        verify(eventService, times(1)).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archiveHandlesEmptyResultSetGracefully() {
        Company company = company(1L);
        Project project = project(10L, company, 30);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of());

        scheduler.archiveReleasedIssues();

        verify(eventService, never()).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archivePartialBatchProcessesAllEligible() {
        Company company = company(1L);
        Project project = project(10L, company, 5);
        Issue i1 = makeIssue(project, 100L);
        Issue i2 = makeIssue(project, 101L);
        Issue i3 = makeIssue(project, 102L);

        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of(i1, i2, i3));

        scheduler.archiveReleasedIssues();

        verify(eventService, times(3)).issueEvent(any(), any(), any(), any());
    }

    @Test
    void archiveOnStartupDelegatesToArchiveMethod() {
        Company company = company(1L);
        Project project = project(10L, company, 30);
        when(projects.findAutoArchiveProjects()).thenReturn(List.of(project));
        when(issues.findArchivable(any())).thenReturn(List.of());

        scheduler.onStartup();

        verify(projects).findAutoArchiveProjects();
    }

    // ---------- helpers ----------

    private static Company company(long id) {
        Company company = new Company("C" + id);
        ReflectionTestUtils.setField(company, "id", id);
        return company;
    }

    private static Project project(long id, Company company, Integer archiveAfterDays) {
        Project project = new Project("P" + id, company);
        ReflectionTestUtils.setField(project, "id", id);
        project.setArchiveAfterDays(archiveAfterDays);
        return project;
    }

    private static Issue makeIssue(Project project, long id) {
        Issue issue = new Issue(project, "Title " + id, "Desc", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", id);
        issue.setStatus(it.davideleva.loom.domain.IssueStatus.RELEASED);
        issue.setReleasedAt(Instant.parse("2026-01-01T00:00:00Z"));
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-01-01T00:00:00Z"));
        return issue;
    }
}
