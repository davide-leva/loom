package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import it.davideleva.loom.domain.IssueAttachment;
import it.davideleva.loom.repository.EventRepository;
import it.davideleva.loom.repository.IssueAttachmentRepository;
import it.davideleva.loom.repository.IssueRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:permanentdeletion;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "debug=false",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PermanentIssueDeletionIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired IssueRepository issues;
    @Autowired IssueAttachmentRepository attachments;
    @Autowired EventRepository events;
    @TempDir Path directory;

    private final HttpClient client = HttpClient.newHttpClient();
    private String admin;
    private long projectId;

    @BeforeAll
    void setup() throws Exception {
        assertEquals(201, request("POST", "/api/setup", """
            {"teamCompanyName":"Team","username":"admin","email":"admin@example.com",
             "password":"admin-password-123"}
            """).statusCode());
        var login = request("POST", "/api/auth/login", """
            {"username":"admin","password":"admin-password-123"}
            """);
        assertEquals(200, login.statusCode(), login.body());
        admin = json.readTree(login.body()).get("accessToken").asText();
        projectId = createdId(request("POST", "/api/projects", "{\"name\":\"Deletion tests\"}"));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void permanentDeletionCommitsAndPreservesEvents(int attachmentCount) throws Exception {
        // Two issues exercise the auto-flush between iterations as well as the final commit.
        List<Long> issueIds = new ArrayList<>();
        List<Long> eventIds = new ArrayList<>();
        List<Long> attachmentIds = new ArrayList<>();
        List<Path> files = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            long issueId = createIssue();
            issueIds.add(issueId);
            eventIds.add(events.findTopByIssueRefIdOrderByIdDesc(issueId).orElseThrow().getId());
            for (int j = 0; j < attachmentCount; j++) {
                var attachment = new IssueAttachment(issues.findById(issueId).orElseThrow(), null, null,
                    "evidence.txt", "text/plain", 8, "txt");
                // Also cover attachments whose stored path is absent.
                if (j == 0) {
                    Path file = Files.writeString(directory.resolve(issueId + ".txt"), "evidence");
                    files.add(file);
                    attachment.setStoredPath(file.toString());
                }
                attachmentIds.add(attachments.saveAndFlush(attachment).getId());
            }
        }
        long retainedIssue = createIssue();
        long retainedEvent = events.findTopByIssueRefIdOrderByIdDesc(retainedIssue).orElseThrow().getId();

        // An actual HTTP request ends its transaction before we inspect committed state.
        var response = request("POST", "/api/work/issues/permanent-delete",
            json.writeValueAsString(java.util.Map.of("ids", issueIds)));
        assertEquals(204, response.statusCode(), response.body());

        for (int i = 0; i < issueIds.size(); i++) {
            assertFalse(issues.existsById(issueIds.get(i)));
            var event = events.findById(eventIds.get(i)).orElseThrow();
            assertNull(event.getIssue());
            assertEquals(issueIds.get(i), event.getIssueRefId());
        }
        attachmentIds.forEach(id -> assertFalse(attachments.existsById(id)));
        files.forEach(file -> assertFalse(Files.exists(file)));
        assertTrue(issues.existsById(retainedIssue));
        assertEquals(retainedIssue, events.findById(retainedEvent).orElseThrow().getIssue().getId());
    }

    private long createIssue() throws Exception {
        return createdId(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Ticket\",\"description\":\"Details\"}"));
    }

    private long createdId(HttpResponse<String> response) throws Exception {
        assertEquals(201, response.statusCode(), response.body());
        return json.readTree(response.body()).get("id").asLong();
    }

    private HttpResponse<String> request(String method, String path, String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (admin != null) builder.header("Authorization", "Bearer " + admin);
        builder.header("Content-Type", "application/json");
        builder.method(method, HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
