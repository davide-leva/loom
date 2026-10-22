package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.EmailNotificationAttempt;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.EventUserNotification;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.EmailNotificationAttemptRepository;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.ProjectRepository;
import it.davideleva.loom.repository.UserRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "debug=false",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class EmailBatchPostgresIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    private static final Instant EARLY = Instant.parse("2026-10-20T10:00:00Z");
    private static final Instant MIDDLE = Instant.parse("2026-10-21T10:00:00Z");
    private static final Instant LATE = Instant.parse("2026-10-22T10:00:00Z");

    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired UserRepository users;
    @Autowired CompanyRepository companies;
    @Autowired ProjectRepository projects;
    @Autowired EventRepository events;
    @Autowired EmailNotificationAttemptRepository attempts;
    @Autowired PasswordEncoder passwords;

    private final HttpClient client = HttpClient.newHttpClient();
    private String token;
    private long projectId;
    private long emptyProjectId;
    private long adminId;
    private long otherActorId;

    @BeforeEach
    void seedBatches() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        var company = companies.saveAndFlush(new Company("Team " + suffix, true));
        var admin = users.saveAndFlush(new User("admin-" + suffix, "admin-" + suffix + "@example.com",
            passwords.encode("admin-password-123"), Role.ADMIN, company));
        var otherActor = users.saveAndFlush(new User("team-" + suffix, "team-" + suffix + "@example.com",
            "unused", Role.TEAM, company));
        adminId = admin.getId();
        otherActorId = otherActor.getId();
        var project = projects.saveAndFlush(new Project("Batches " + suffix, null));
        var otherProject = projects.saveAndFlush(new Project("Other " + suffix, null));
        emptyProjectId = projects.saveAndFlush(new Project("Empty " + suffix, null)).getId();
        projectId = project.getId();
        var early = events.saveAndFlush(new Event(EventType.ISSUE_CREATED, "Created", project, null, admin));
        var middle = events.saveAndFlush(new Event(EventType.ISSUE_STATUS_CHANGED, "Changed", project, null, otherActor));
        var late = events.saveAndFlush(new Event(EventType.ISSUE_CREATED, "Created again", project, null, admin));
        var unrelated = events.saveAndFlush(new Event(EventType.ISSUE_CREATED, "Other project", otherProject, null, admin));
        attempt(early, admin, "batch-early", EARLY);
        attempt(early, admin, "batch-early", EARLY); // Count batches, not delivery rows.
        attempt(middle, admin, "batch-middle", MIDDLE);
        attempt(late, admin, "batch-late", LATE);
        attempt(unrelated, admin, "batch-other", LATE);

        var login = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"" + admin.getUsername()
                + "\",\"password\":\"admin-password-123\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, login.statusCode(), login.body());
        token = json.readTree(login.body()).get("accessToken").asText();
    }

    static Stream<Arguments> dateBounds() {
        return Stream.of(
            Arguments.of("", List.of("batch-late", "batch-middle", "batch-early")),
            Arguments.of("from=" + MIDDLE, List.of("batch-late", "batch-middle")),
            Arguments.of("to=" + LATE, List.of("batch-middle", "batch-early")),
            Arguments.of("from=" + MIDDLE + "&to=" + LATE, List.of("batch-middle"))
        );
    }

    @ParameterizedTest
    @MethodSource("dateBounds")
    void listsBatchesWithEveryCombinationOfDateBounds(String filters, List<String> expected) throws Exception {
        assertBatches(filters, expected);
    }

    @Test
    void preservesEventTypeAndActorFilters() throws Exception {
        assertBatches("type=ISSUE_CREATED", List.of("batch-late", "batch-early"));
        assertBatches("actorId=" + adminId, List.of("batch-late", "batch-early"));
        assertBatches("type=ISSUE_STATUS_CHANGED&actorId=" + otherActorId, List.of("batch-middle"));
        assertBatches("type=ISSUE_CREATED&actorId=" + otherActorId, List.of());
    }

    @Test
    void countsDistinctBatchesWhenPaginationForcesTheCountQuery() throws Exception {
        var first = batches(projectId, "size=1");
        assertEquals(3, first.get("total").asLong());
        assertEquals("batch-late", first.get("items").get(0).get("id").asText());
        var second = batches(projectId, "page=1&size=1");
        assertEquals(3, second.get("total").asLong());
        assertEquals("batch-middle", second.get("items").get(0).get("id").asText());
        var bounded = batches(projectId, "size=1&from=" + EARLY + "&to=" + LATE);
        assertEquals(2, bounded.get("total").asLong());
        assertEquals("batch-middle", bounded.get("items").get(0).get("id").asText());
        assertEquals(3, batches(projectId, "size=1&from=" + EARLY).get("total").asLong());
        assertEquals(2, batches(projectId, "size=1&to=" + LATE).get("total").asLong());
    }

    @Test
    void comparesInstantsWithNonUtcOffsets() throws Exception {
        assertBatches("from=2026-10-21T12:00:00%2B02:00&to=2026-10-22T12:00:00%2B02:00",
            List.of("batch-middle"));
    }

    @Test
    void returnsAnEmptyPageWithoutOptionalFilters() throws Exception {
        var page = batches(emptyProjectId, "");
        assertEquals(0, page.get("total").asLong());
        assertEquals(0, page.get("items").size());
    }

    private void attempt(Event event, User recipient, String batchId, Instant at) {
        var notification = new EventUserNotification(event, recipient);
        notification.setEmailBatchId(batchId);
        notification.setEmailDeliveryId(UUID.randomUUID().toString());
        notification.setDeliveryStatus("SENT");
        notification.setRecipientEmail(recipient.getEmail());
        notification.setAttemptedAt(at);
        attempts.saveAndFlush(new EmailNotificationAttempt(notification));
    }

    private void assertBatches(String filters, List<String> expected) throws Exception {
        var page = batches(projectId, filters);
        assertEquals(expected.size(), page.get("total").asLong());
        List<String> actual = new ArrayList<>();
        page.get("items").forEach(batch -> actual.add(batch.get("id").asText()));
        assertEquals(expected, actual);
    }

    private JsonNode batches(long project, String filters) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/work/projects/"
            + project + "/events/email-batches?" + filters))
            .header("Authorization", "Bearer " + token).GET().build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }
}
