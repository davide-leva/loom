package it.davideleva.loom.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.IssueUserView;
import it.davideleva.loom.domain.IssueUserViewId;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.IssueUserViewRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IssueNotificationServiceTest {
    @Mock EventRepository events;
    @Mock IssueRepository issues;
    @Mock IssueUserViewRepository views;
    @Mock ProjectUserRepository memberships;

    private IssueNotificationService service;

    private IssueNotificationService newService() {
        return new IssueNotificationService(events, issues, views, memberships);
    }

    @Test
    void summaryReturnsZeroWhenNoUnreadIds() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), anyBoolean()))
            .thenReturn(List.of());

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        assertEquals(s.project.getId(), summary.projectId());
        assertEquals(0L, summary.total());
        assertEquals(0L, summary.anomalies());
        assertEquals(0L, summary.improvements());
        assertEquals(0L, summary.implementations());
        assertEquals(0L, summary.planning());
        assertEquals(0, summary.issues().size());
    }

    @Test
    void summaryAggregatesUnreadIssuesByType() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue anomaly = makeIssue(s.project, 1L, IssueType.ANOMALY, false);
        Issue improvement = makeIssue(s.project, 2L, IssueType.IMPROVEMENT, false);
        Issue implementation = makeIssue(s.project, 3L, IssueType.IMPLEMENTATION, false);
        Issue otherProject = makeIssue(makeProject(99L, s.company), 4L, IssueType.ANOMALY, false);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), anyBoolean()))
            .thenReturn(List.of(1L, 2L, 3L, 4L));
        when(issues.findAllById(List.of(1L, 2L, 3L, 4L)))
            .thenReturn(List.of(anomaly, improvement, implementation, otherProject));

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        assertEquals(3L, summary.total(), "issues from other projects must be filtered out");
        assertEquals(1L, summary.anomalies());
        assertEquals(1L, summary.improvements());
        assertEquals(1L, summary.implementations());
        assertEquals(3, summary.issues().size());
    }

    @Test
    void summaryFiltersInternalIssuesForNonInternalAllowedUsers() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue publicIssue = makeIssue(s.project, 1L, IssueType.ANOMALY, false);
        Issue internalIssue = makeIssue(s.project, 2L, IssueType.ANOMALY, true);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), anyBoolean()))
            .thenReturn(List.of(1L, 2L));
        when(issues.findAllById(List.of(1L, 2L)))
            .thenReturn(List.of(publicIssue, internalIssue));

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        assertEquals(1L, summary.total());
        assertEquals(1, summary.issues().size());
        assertEquals(1L, summary.issues().get(0).issueId());
    }

    @Test
    void summaryKeepsInternalIssuesForAdminOrTeam() {
        IssueNotificationService service = newService();
        Scenario s = scenario(true); // admin actor

        Issue internalIssue = makeIssue(s.project, 5L, IssueType.ANOMALY, true);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), eq(true)))
            .thenReturn(List.of(5L));
        when(issues.findAllById(List.of(5L)))
            .thenReturn(List.of(internalIssue));

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        assertEquals(1L, summary.total());
        assertEquals(1, summary.issues().size());
    }

    @Test
    void summarySortsIssuesById() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue a = makeIssue(s.project, 30L, IssueType.ANOMALY, false);
        Issue b = makeIssue(s.project, 10L, IssueType.ANOMALY, false);
        Issue c = makeIssue(s.project, 20L, IssueType.ANOMALY, false);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), anyBoolean()))
            .thenReturn(List.of(30L, 10L, 20L));
        when(issues.findAllById(List.of(30L, 10L, 20L)))
            .thenReturn(List.of(a, b, c));

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        assertEquals(List.of(10L, 20L, 30L),
            summary.issues().stream().map(IssueNotificationService.UnreadIssue::issueId).toList());
    }

    @Test
    void summaryPlanningBucketIsNullTypeCount() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue typed = makeIssue(s.project, 1L, IssueType.ANOMALY, false);
        Issue untyped = makeIssue(s.project, 2L, null, false);

        when(events.unreadIssueIds(eq(s.project.getId()), eq(s.user.getId()), anyBoolean()))
            .thenReturn(List.of(1L, 2L));
        when(issues.findAllById(List.of(1L, 2L)))
            .thenReturn(List.of(typed, untyped));

        IssueNotificationService.Summary summary = service.summary(s.project, s.user);

        // planning counts issues whose type is null, total = 2, anomalies = 1
        assertEquals(2L, summary.total());
        assertEquals(1L, summary.anomalies());
        assertEquals(1L, summary.planning());
    }

    @Test
    void summaryThrowsForbiddenWhenUserIsNotVisibleToProject() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);
        // user is in a different company and not an admin
        s.user.setRole(Role.USER);
        s.user.setCompany(company(99L));
        when(memberships.existsById(any())).thenReturn(false);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.summary(s.project, s.user));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    @Test
    void markSeenPersistsViewWithLatestEventIdWhenNoPriorViewExists() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue issue = makeIssue(s.project, 7L, IssueType.ANOMALY, false);
        Event latest = makeEvent(99L);
        when(issues.findByIdForUpdate(7L)).thenReturn(Optional.of(issue));
        when(events.findTopByIssueRefIdOrderByIdDesc(7L)).thenReturn(Optional.of(latest));
        when(views.findById(new IssueUserViewId(7L, s.user.getId()))).thenReturn(Optional.empty());

        service.markSeen(issue, s.user);

        org.mockito.ArgumentCaptor<IssueUserView> captor =
            org.mockito.ArgumentCaptor.forClass(IssueUserView.class);
        verify(views).save(captor.capture());
        IssueUserView saved = captor.getValue();
        assertEquals(99L, saved.getLastSeenEventId());
        assertEquals(s.user, saved.getUser());
        assertEquals(issue, saved.getIssue());
        assertNotNullBeforeNow(saved.getSeenAt());
    }

    @Test
    void markSeenUpdatesLastSeenEventIdWhenLatestIsHigher() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue issue = makeIssue(s.project, 8L, IssueType.ANOMALY, false);
        Event latest = makeEvent(200L);
        IssueUserView existing = new IssueUserView(issue, s.user, 50L, Instant.parse("2026-03-01T00:00:00Z"));
        when(issues.findByIdForUpdate(8L)).thenReturn(Optional.of(issue));
        when(events.findTopByIssueRefIdOrderByIdDesc(8L)).thenReturn(Optional.of(latest));
        when(views.findById(new IssueUserViewId(8L, s.user.getId()))).thenReturn(Optional.of(existing));

        service.markSeen(issue, s.user);

        org.mockito.ArgumentCaptor<IssueUserView> captor =
            org.mockito.ArgumentCaptor.forClass(IssueUserView.class);
        verify(views).save(captor.capture());
        assertEquals(200L, captor.getValue().getLastSeenEventId());
    }

    @Test
    void markSeenKeepsLastSeenEventIdWhenLatestIsLessOrEqual() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue issue = makeIssue(s.project, 9L, IssueType.ANOMALY, false);
        Event latest = makeEvent(50L);
        IssueUserView existing = new IssueUserView(issue, s.user, 100L, Instant.parse("2026-03-01T00:00:00Z"));
        when(issues.findByIdForUpdate(9L)).thenReturn(Optional.of(issue));
        when(events.findTopByIssueRefIdOrderByIdDesc(9L)).thenReturn(Optional.of(latest));
        when(views.findById(new IssueUserViewId(9L, s.user.getId()))).thenReturn(Optional.of(existing));

        service.markSeen(issue, s.user);

        // The service always calls save to update seenAt, but the lastSeenEventId
        // must not regress.
        org.mockito.ArgumentCaptor<IssueUserView> captor =
            org.mockito.ArgumentCaptor.forClass(IssueUserView.class);
        verify(views).save(captor.capture());
        assertEquals(100L, captor.getValue().getLastSeenEventId());
    }

    @Test
    void markSeenNoOpWhenNoEventExists() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        Issue issue = makeIssue(s.project, 11L, IssueType.ANOMALY, false);
        when(issues.findByIdForUpdate(11L)).thenReturn(Optional.of(issue));
        when(events.findTopByIssueRefIdOrderByIdDesc(11L)).thenReturn(Optional.empty());

        service.markSeen(issue, s.user);

        verify(views, never()).save(any());
    }

    @Test
    void requireVisibleProjectAllowsAdminWithoutMembership() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);
        s.user.setRole(Role.ADMIN);

        // should not throw
        service.requireVisibleProject(s.project, s.user);
    }

    @Test
    void requireVisibleProjectAllowsExplicitMember() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        when(memberships.existsById(new ProjectUserId(s.project.getId(), s.user.getId())))
            .thenReturn(true);

        service.requireVisibleProject(s.project, s.user);
    }

    @Test
    void requireVisibleProjectAllowsUserInSameCompany() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);

        when(memberships.existsById(new ProjectUserId(s.project.getId(), s.user.getId())))
            .thenReturn(false);

        // user.company == project.company so isAutomaticCompanyMember returns true.
        service.requireVisibleProject(s.project, s.user);
    }

    @Test
    void requireVisibleProjectRejectsUserInDifferentCompanyWithoutMembership() {
        IssueNotificationService service = newService();
        Scenario s = scenario(false);
        Company otherCompany = company(99L);
        s.user.setCompany(otherCompany);

        when(memberships.existsById(new ProjectUserId(s.project.getId(), s.user.getId())))
            .thenReturn(false);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.requireVisibleProject(s.project, s.user));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    // ---------- helpers ----------

    private Scenario scenario(boolean userIsAdmin) {
        Company company = company(1L);
        Project project = project(10L, company);
        User user = user(11L, userIsAdmin ? Role.ADMIN : Role.USER, company);
        return new Scenario(company, project, user);
    }

    private static Issue makeIssue(Project project, long id, IssueType type, boolean internal) {
        Issue issue = new Issue(project, "Title " + id, "Desc " + id, type);
        ReflectionTestUtils.setField(issue, "id", id);
        issue.setInternal(internal);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-01T10:00:00Z"));
        return issue;
    }

    private static Project makeProject(long id, Company company) {
        Project project = new Project("Other" + id, company);
        ReflectionTestUtils.setField(project, "id", id);
        return project;
    }

    private static Event makeEvent(long id) {
        Event event = new Event(it.davideleva.loom.domain.EventType.ISSUE_STATUS_CHANGED, "data", null, null, null);
        ReflectionTestUtils.setField(event, "id", id);
        return event;
    }

    private static Company company(long id) {
        Company company = new Company("C" + id);
        ReflectionTestUtils.setField(company, "id", id);
        return company;
    }

    private static Project project(long id, Company company) {
        Project project = new Project("P" + id, company);
        ReflectionTestUtils.setField(project, "id", id);
        return project;
    }

    private static User user(long id, Role role, Company company) {
        User user = new User("u" + id, "u" + id + "@example.com", "hash", role, company);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    private static void assertNotNullBeforeNow(Instant seenAt) {
        assertEquals(true, seenAt != null && !seenAt.isAfter(Instant.now().plusSeconds(1)),
            "seenAt should be set to a recent instant");
    }

    private record Scenario(Company company, Project project, User user) {}
}
