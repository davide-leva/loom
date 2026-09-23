package it.davideleva.loom.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.FieldScope;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUser;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.live.LiveUpdateHub;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.EventUserNotificationRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventServiceTest {
    @Mock EventRepository events;
    @Mock EventUserNotificationRepository notifications;
    @Mock ProjectUserRepository memberships;
    @Mock UserRepository users;
    @Mock LiveUpdateHub liveUpdates;

    private EventService service;

    @BeforeEach
    void setUp() {
        service = new EventService(events, notifications, memberships, users, liveUpdates);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.initSynchronization();
        }
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void issueEventPersistsEventWithCorrectProjectIssueActorTypeAndMessage() {
        Scenario s = scenario(false);
        User actor = s.issuer;

        service.issueEvent(EventType.ISSUE_CREATED, s.issue, actor, "Issue was created");

        ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);
        verify(events).save(captor.capture());
        Event saved = captor.getValue();
        assertEquals(EventType.ISSUE_CREATED, saved.getType());
        assertEquals(s.project, saved.getProject());
        assertEquals(s.issue, saved.getIssue());
        assertEquals(actor, saved.getActor());
        assertEquals("Issue was created", saved.getData());
        assertEquals(s.issue.getId(), saved.getIssueRefId());
        assertEquals(false, saved.isInternal());
    }

    @Test
    void issueEventCreatesOneNotificationPerRecipientExceptActor() {
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.issuer, "msg");

        verify(notifications, atLeastOnce()).save(captor.capture());
        List<EventUserNotification> saved = captor.getAllValues();

        // Recipients: developer, approver, companyUser1, member, admin = 5 distinct users
        // Actor = issuer, so excluded. Total = 5 notifications.
        assertEquals(5, saved.size());
        assertTrue(saved.stream().noneMatch(n -> n.getUser().getId().equals(s.issuer.getId())),
            "actor must not be in notifications");
    }

    @Test
    void issueEventExcludesActorFromNotifications() {
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_STATUS_CHANGED, s.issue, s.issuer, "status updated");

        verify(notifications, atLeastOnce()).save(captor.capture());
        assertTrue(captor.getAllValues().stream()
                .noneMatch(n -> n.getUser().getId().equals(s.issuer.getId())),
            "actor must not receive a notification for their own action");
    }

    @Test
    void issueEventForInternalIssueOnlyNotifiesAdminOrTeamWhenActorIsNotAdmin() {
        Scenario s = scenario(true);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.issuer, "internal issue");

        verify(notifications, atLeastOnce()).save(captor.capture());
        List<EventUserNotification> saved = captor.getAllValues();

        // For internal: only ADMIN/TEAM get notified. Issuer is USER (not admin/team).
        // Admin is the only admin in the scenario and is not the actor.
        assertTrue(saved.stream().allMatch(n ->
                n.getUser().getRole() == Role.ADMIN || n.getUser().getRole() == Role.TEAM),
            "internal-issue notifications must only target ADMIN/TEAM users");
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getId().equals(s.admin.getId())),
            "admin should receive notifications for internal issues");
    }

    @Test
    void issueEventSkipsUserWithWantEmailFalse() {
        Scenario s = scenario(false);
        // Mark companyUser1 as not wanting email. Admin has no membership so the global
        // wantEmail flag controls whether they get a notification.
        s.companyUser1.setWantEmail(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.admin, "msg");

        verify(notifications, atLeastOnce()).save(captor.capture());
        assertTrue(captor.getAllValues().stream()
                .noneMatch(n -> n.getUser().getId().equals(s.companyUser1.getId())),
            "companyUser1 should be excluded due to wantEmail=false");
    }

    @Test
    void issueEventSkipsUserWhenMembershipWantEmailFalse() {
        Scenario s = scenario(false);
        // Rebuild memberships to mark companyUser1 as not wanting email.
        ProjectUser m = membershipFor(s.project, s.companyUser1, false);
        when(memberships.findByProject_Id(s.project.getId())).thenReturn(List.of(m));
        when(memberships.findById(new ProjectUserId(s.project.getId(), s.companyUser1.getId())))
            .thenReturn(Optional.of(m));

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.admin, "msg");

        verify(notifications, atLeastOnce()).save(captor.capture());
        assertTrue(captor.getAllValues().stream()
                .noneMatch(n -> n.getUser().getId().equals(s.companyUser1.getId())),
            "companyUser1 should be excluded due to membership wantEmail=false");
    }

    @Test
    void issueEventAttachesLiveUpdateAfterCommit() {
        Scenario s = scenario(false);

        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.admin, "msg");

        List<TransactionSynchronization> syncs =
            new ArrayList<>(TransactionSynchronizationManager.getSynchronizations());
        assertEquals(1, syncs.size());
        syncs.get(0).afterCommit();

        verify(liveUpdates).changed(s.project.getId(), s.issue.getId(), false);
    }

    @Test
    void issueEventAttachesLiveUpdateWithInternalFlag() {
        Scenario s = scenario(true);

        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.issuer, "msg");

        List<TransactionSynchronization> syncs =
            new ArrayList<>(TransactionSynchronizationManager.getSynchronizations());
        syncs.get(0).afterCommit();

        verify(liveUpdates).changed(s.project.getId(), s.issue.getId(), true);
    }

    @Test
    void issueEventHandlesNullActorGracefully() {
        Scenario s = scenario(false);

        ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);
        service.issueEvent(EventType.ISSUE_CREATED, s.issue, null, "system event");

        verify(events).save(captor.capture());
        assertEquals(null, captor.getValue().getActor());

        List<TransactionSynchronization> syncs =
            new ArrayList<>(TransactionSynchronizationManager.getSynchronizations());
        syncs.get(0).afterCommit();

        verify(liveUpdates).changed(eq(s.project.getId()), eq(s.issue.getId()), eq(false));
    }

    @Test
    void issueEventPersistsStatusChangedEventForSubscribers() {
        Scenario s = scenario(false);

        service.issueEvent(EventType.ISSUE_STATUS_CHANGED, s.issue, s.admin, "REPORTED -> IN_PROGRESS");

        ArgumentCaptor<Event> captor = ArgumentCaptor.forClass(Event.class);
        verify(events).save(captor.capture());
        assertEquals(EventType.ISSUE_STATUS_CHANGED, captor.getValue().getType());

        ArgumentCaptor<EventUserNotification> notifCaptor = ArgumentCaptor.forClass(EventUserNotification.class);
        verify(notifications, atLeastOnce()).save(notifCaptor.capture());
        // Subscribers = everyone except the actor (admin in this test).
        List<EventUserNotification> saved = notifCaptor.getAllValues();
        assertTrue(saved.stream().noneMatch(n -> n.getUser().getId().equals(s.admin.getId())),
            "actor (admin) should not be in notifications");
        assertTrue(saved.size() >= 4, "subscribers should receive status change notifications");
    }

    @Test
    void detachIssueDelegatesToRepository() {
        service.detachIssue(7L);
        verify(events).detachIssue(7L);
    }

    @Test
    void issueEventNotificationCarriesEventAndUser() {
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_STATUS_CHANGED, s.issue, s.admin, "status updated");

        verify(notifications, atLeastOnce()).save(captor.capture());
        EventUserNotification notif = captor.getValue();
        assertNotNull(notif.getUser());
        assertNotNull(notif.getEvent());
        assertEquals(notif.getUser().getId(), notif.getId().getUserId());
    }

    @Test
    void issueEventDoesNotBroadcastLiveUpdateBeforeCommit() {
        Scenario s = scenario(false);

        service.issueEvent(EventType.ISSUE_CREATED, s.issue, s.admin, "msg");

        // before afterCommit runs, the live update must not have fired.
        verify(liveUpdates, times(0)).changed(any(), any(), eq(false));
    }

    @Test
    void issueEventWithTeamScopeExcludesUsersWhoCannotSeeTeamFields() {
        // Scenario: USER recipients (issuer/dev/approver/companyUser1/member) cannot see TEAM scope,
        // so a TEAM-scoped field change should not notify them. Admin (always visible) still does.
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        // Use a USER actor (developer) so that admin is not removed by the actor filter.
        service.issueEvent(EventType.ISSUE_VALUES_CHANGED, s.issue, s.developer, "Campo team: A → B",
            Set.of(FieldScope.TEAM));

        verify(notifications, atLeastOnce()).save(captor.capture());
        List<EventUserNotification> saved = captor.getAllValues();
        assertTrue(saved.stream().allMatch(n -> n.getUser().getRole() == Role.ADMIN),
            "only admins should receive notifications for TEAM-scoped field changes");
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getId().equals(s.admin.getId())),
            "admin should receive the notification even though it is for a TEAM-scoped field");
    }

    @Test
    void issueEventWithSuperuserScopeExcludesRegularUsersButReachesSuperuser() {
        // Scenarist: approver is SUPERUSER (USER-scoped visibility only for regular USER).
        // Modify a SUPERUSER-scoped field; approver must still get a notification.
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        service.issueEvent(EventType.ISSUE_VALUES_CHANGED, s.issue, s.admin, "Campo superuser: X → Y",
            Set.of(FieldScope.SUPERUSER));

        verify(notifications, atLeastOnce()).save(captor.capture());
        List<EventUserNotification> saved = captor.getAllValues();
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getId().equals(s.approver.getId())),
            "superuser approver should receive notifications for SUPERUSER-scoped field changes");
        assertTrue(saved.stream().noneMatch(n -> n.getUser().getRole() == Role.USER),
            "USER recipients should not be notified about SUPERUSER-scoped changes");
    }

    @Test
    void issueEventWithMixedScopesNotifiesAllRolesWithAnyOverlappingVisibility() {
        // USER-scoped change — USER recipients must still get USER-scope notifications, and admins
        // (with broader visibility) must remain reachable regardless.
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        // Use a USER actor so admin does not get excluded by the actor filter.
        service.issueEvent(EventType.ISSUE_VALUES_CHANGED, s.issue, s.developer, "Campo user: a → b",
            Set.of(FieldScope.USER));

        verify(notifications, atLeastOnce()).save(captor.capture());
        List<EventUserNotification> saved = captor.getAllValues();
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getRole() == Role.USER),
            "USER recipients should receive USER-scoped field notifications");
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getRole() == Role.ADMIN),
            "ADMIN recipients should receive USER-scoped field notifications");
    }

    @Test
    void issueEventWithoutScopesNotifiesEveryoneAsBefore() {
        Scenario s = scenario(false);

        ArgumentCaptor<EventUserNotification> captor = ArgumentCaptor.forClass(EventUserNotification.class);
        // Use a USER-role actor so the admin recipient is not excluded by the actor filter.
        service.issueEvent(EventType.ISSUE_STATUS_CHANGED, s.issue, s.companyUser1, "status updated");

        verify(notifications, atLeastOnce()).save(captor.capture());
        // Fallback (no scopes argument) still notifies every recipient regardless of role.
        List<EventUserNotification> saved = captor.getAllValues();
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getRole() == Role.USER),
            "USER recipients should still be notified when no scope filter is given");
        assertTrue(saved.stream().anyMatch(n -> n.getUser().getRole() == Role.ADMIN),
            "ADMIN recipients should still be notified when no scope filter is given");
    }

    // ---------- helpers ----------

    private Scenario scenario(boolean internal) {
        Company company = company(1L);
        Project project = project(10L, company);
        User issuer = user(11L, Role.USER, company);
        User developer = user(12L, Role.USER, company);
        User approver = user(13L, Role.SUPERUSER, company);
        User companyUser1 = user(14L, Role.USER, company);
        User member = user(15L, Role.USER, company);
        User admin = user(100L, Role.ADMIN, null);

        Issue issue = new Issue(project, "Title", "Description", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 50L);
        issue.setIssuer(issuer);
        issue.setDeveloper(developer);
        issue.setApprover(approver);
        issue.setInternal(internal);
        ReflectionTestUtils.setField(issue, "createdAt", Instant.parse("2026-03-01T10:00:00Z"));

        ProjectUser memberShip = membershipFor(project, member, true);

        // Default wantsEmail = true for everyone except admin who has no membership and is opted in globally.
        issuer.setWantEmail(true);
        developer.setWantEmail(true);
        approver.setWantEmail(true);
        companyUser1.setWantEmail(true);
        member.setWantEmail(true);
        admin.setWantEmail(true);

        // Wire up recipients lookup.
        lenient().when(users.findByCompany_Id(company.getId()))
            .thenReturn(List.of(issuer, developer, approver, companyUser1, member));
        lenient().when(users.findAll()).thenReturn(List.of(admin));
        lenient().when(memberships.findByProject_Id(project.getId())).thenReturn(List.of(memberShip));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), issuer.getId())))
            .thenReturn(Optional.of(membershipFor(project, issuer, true)));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), developer.getId())))
            .thenReturn(Optional.of(membershipFor(project, developer, true)));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), approver.getId())))
            .thenReturn(Optional.of(membershipFor(project, approver, true)));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), companyUser1.getId())))
            .thenReturn(Optional.of(membershipFor(project, companyUser1, true)));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), member.getId())))
            .thenReturn(Optional.of(memberShip));
        lenient().when(memberships.findById(new ProjectUserId(project.getId(), admin.getId())))
            .thenReturn(Optional.empty());

        return new Scenario(company, project, issuer, developer, approver, companyUser1, member, admin, issue);
    }

    private static ProjectUser membershipFor(Project project, User user, boolean wantsEmail) {
        ProjectUser m = new ProjectUser(project, user);
        ReflectionTestUtils.setField(m, "id", new ProjectUserId(project.getId(), user.getId()));
        m.setWantEmail(wantsEmail);
        return m;
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

    private record Scenario(Company company, Project project, User issuer, User developer, User approver,
                            User companyUser1, User member, User admin, Issue issue) {}
}
