package it.davideleva.loom.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import it.davideleva.loom.controller.BrandingService;
import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.EventUserNotificationRepository;
import it.davideleva.loom.repository.UserRepository;
import jakarta.mail.internet.MimeMessage;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmailNotificationSchedulerTest {
    @Mock EventUserNotificationRepository notifications;
    @Mock JavaMailSender mailSender;
    @Mock CompanyRepository companies;
    @Mock BrandingService branding;
    @Mock UserRepository userRepository;
    private final EventDigestService digestService = new EventDigestService();

    private EmailNotificationScheduler scheduler;
    private MimeMessage mime;

    @BeforeEach
    void setUp() {
        scheduler = new EmailNotificationScheduler(notifications, mailSender, companies, branding, digestService, userRepository);
        ReflectionTestUtils.setField(scheduler, "from", "noreply@example.com");
        ReflectionTestUtils.setField(scheduler, "minEventAge", java.time.Duration.ZERO);
        ReflectionTestUtils.setField(scheduler, "digestWindow", java.time.Duration.ofHours(48));
        mime = new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null);
        lenient().when(mailSender.createMimeMessage()).thenReturn(mime);
        lenient().when(userRepository.findById(any())).thenAnswer(invocation -> java.util.Optional.empty());
    }

    @Test
    void sendPendingNotificationsSendsMailAndMarksAsNotifiedForEachPending() throws Exception {
        Scenario s = scenario();
        EventUserNotification n1 = notification(s, 1L, "alice@example.com", s.event);
        EventUserNotification n2 = notification(s, 2L, "bob@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n1, n2));
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.of(s.teamCompany));

        scheduler.sendPendingNotifications();

        verify(mailSender, times(2)).send(any(MimeMessage.class));
        assertEquals(true, n1.isNotified());
        assertEquals(true, n2.isNotified());
        assertTrue(n1.getNotifiedAt() != null);
        assertTrue(n2.getNotifiedAt() != null);
    }

    @Test
    void sendPendingNotificationsWithNoTeamCompanyUsesDefaultBrand() throws Exception {
        Scenario s = scenario();
        EventUserNotification n = notification(s, 1L, "alice@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n));
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.empty());

        scheduler.sendPendingNotifications();

        verify(mailSender, times(1)).send(any(MimeMessage.class));
        assertEquals(true, n.isNotified());
    }

    @Test
    void sendPendingNotificationsSkipsUsersWithEmptyEmailButStillMarks() throws Exception {
        Scenario s = scenario();
        EventUserNotification n = notification(s, 1L, "  ", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n));

        scheduler.sendPendingNotifications();

        verify(mailSender, never()).send(any(MimeMessage.class));
        assertEquals(true, n.isNotified());
    }

    @Test
    void sendPendingNotificationsDoesNothingWhenNoPending() throws Exception {
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of());

        scheduler.sendPendingNotifications();

        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void sendPendingNotificationsKeepsNotifiedFalseOnMailFailure() throws Exception {
        Scenario s = scenario();
        EventUserNotification n = notification(s, 1L, "alice@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n));
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.of(s.teamCompany));
        org.mockito.Mockito.doThrow(new MailSendException("SMTP unavailable"))
            .when(mailSender).send(any(MimeMessage.class));

        scheduler.sendPendingNotifications();

        assertEquals(false, n.isNotified(), "mail failure must keep notified=false so retry picks it up");
    }

    @Test
    void sendPendingNotificationsProcessesBatchByUserIndependently() throws Exception {
        Scenario s = scenario();
        EventUserNotification n1 = notification(s, 1L, "alice@example.com", s.event);
        EventUserNotification n2 = notification(s, 2L, "bob@example.com", s.event);
        EventUserNotification n3 = notification(s, 1L, "alice@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n1, n2, n3));
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.of(s.teamCompany));

        scheduler.sendPendingNotifications();

        // Digest mode: one email per user, regardless of how many notifications the user has.
        verify(mailSender, times(2)).send(any(MimeMessage.class));
        assertEquals(true, n1.isNotified());
        assertEquals(true, n2.isNotified());
        assertEquals(true, n3.isNotified());
    }

    @Test
    void sendPendingNotificationsOnStartupDelegatesToMainMethod() throws Exception {
        Scenario s = scenario();
        EventUserNotification n = notification(s, 1L, "alice@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n));
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.of(s.teamCompany));

        scheduler.sendPendingNotificationsOnStartup();

        verify(mailSender, times(1)).send(any(MimeMessage.class));
        assertEquals(true, n.isNotified());
    }

    @Test
    void sendPendingNotificationsAttachesLogoWhenPresent() throws Exception {
        Scenario s = scenario();
        when(companies.findFirstByTeamCompanyTrue()).thenReturn(Optional.of(s.teamCompany));
        s.teamCompany.setLogoExtension("png");
        when(branding.logoPath("companies", s.teamCompany.getId(), "png"))
            .thenReturn(Path.of("target/test-logo.png"));

        EventUserNotification n = notification(s, 1L, "alice@example.com", s.event);
        when(notifications.findByNotifiedFalseAndEvent_EventDateAfterOrderByEvent_EventDateAsc(any()))
            .thenReturn(List.of(n));

        scheduler.sendPendingNotifications();

        verify(mailSender, times(1)).send(any(MimeMessage.class));
        assertEquals(true, n.isNotified());
    }

    // ---------- helpers ----------

    private Scenario scenario() {
        Company company = new Company("Customer");
        ReflectionTestUtils.setField(company, "id", 1L);

        Company team = new Company("Internal", true);
        ReflectionTestUtils.setField(team, "id", 100L);

        Project project = new Project("Portal", company);
        ReflectionTestUtils.setField(project, "id", 50L);

        Issue issue = new Issue(project, "Bug", "Description", IssueType.ANOMALY);
        ReflectionTestUtils.setField(issue, "id", 500L);
        issue.setStatus(it.davideleva.loom.domain.IssueStatus.REPORTED);

        Event event = new Event(EventType.ISSUE_CREATED, "", project, issue, null);
        ReflectionTestUtils.setField(event, "id", 1000L);
        ReflectionTestUtils.setField(event, "eventDate", Instant.parse("2026-03-01T10:00:00Z"));

        return new Scenario(company, team, project, issue, event);
    }

    private static EventUserNotification notification(Scenario s, long userId, String email, Event event) {
        User user = new User("u" + userId, email, "hash", Role.USER, s.company);
        ReflectionTestUtils.setField(user, "id", userId);
        EventUserNotification n = new EventUserNotification(event, user);
        return n;
    }

    private record Scenario(Company company, Company teamCompany, Project project, Issue issue, Event event) {}
}
