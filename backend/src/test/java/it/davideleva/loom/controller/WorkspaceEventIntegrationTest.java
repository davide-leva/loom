package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:workspaceevents;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class WorkspaceEventIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    @Autowired it.davideleva.loom.repository.EventRepository eventRepository;
    @Autowired it.davideleva.loom.repository.UserRepository userRepository;
    @Autowired it.davideleva.loom.repository.EmailNotificationAttemptRepository attempts;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void eventsAreFilteredByProjectVisibilityAndRemainAfterDeletion() throws Exception {
        assertEquals(201, request("POST", "/api/setup", "{\"teamCompanyName\":\"Team\",\"username\":\"admin\","
            + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", null).statusCode());
        String admin = login("admin", "admin-password-123");
        var preferences = body(request("PUT", "/api/preferences/email",
            "{\"globalWantEmail\":true,\"onlyOwnIssues\":true,\"newIssues\":false,\"statusChanges\":\"RELEASED\",\"comments\":false,\"dataChanges\":false,\"projects\":[]}", admin));
        assertEquals("RELEASED", preferences.get("statusChanges").asText());
        assertTrue(preferences.get("onlyOwnIssues").asBoolean());
        assertTrue(!preferences.get("comments").asBoolean());
        var savedPreferences = body(request("GET", "/api/preferences/email", null, admin));
        assertTrue(!savedPreferences.get("newIssues").asBoolean());
        assertTrue(!savedPreferences.get("dataChanges").asBoolean());
        long companyId = id(request("POST", "/api/companies", "{\"name\":\"Customer\"}", admin));
        long projectId = id(request("POST", "/api/projects", "{\"name\":\"Portal\",\"companyId\":" + companyId + "}", admin));
        long otherProjectId = id(request("POST", "/api/projects", "{\"name\":\"Other\"}", admin));
        assertEquals(201, request("POST", "/api/users", "{\"username\":\"customer\","
            + "\"email\":\"customer@example.com\",\"password\":\"customer-password-123\","
            + "\"role\":\"USER\",\"companyId\":" + companyId + "}", admin).statusCode());
        long teamId = id(request("POST", "/api/users", "{\"username\":\"team\","
            + "\"email\":\"team@example.com\",\"password\":\"team-password-123\","
            + "\"role\":\"TEAM\"}", admin));
        assertEquals(201, request("POST", "/api/project-users", "{\"projectId\":" + projectId
            + ",\"userId\":" + teamId + "}", admin).statusCode());
        String customer = login("customer", "customer-password-123");
        String team = login("team", "team-password-123");
        String path = "/api/work/projects/" + projectId + "/events";
        assertEquals(403, request("GET", path, null, customer).statusCode());
        assertEquals(403, request("GET", path + "/actors", null, customer).statusCode());
        assertEquals(403, request("GET", "/api/work/projects/" + otherProjectId + "/events", null, team).statusCode());

        long publicIssue = id(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Public\",\"description\":\"Details\"}", admin));
        long internalIssue = id(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Internal\",\"description\":\"Details\",\"internal\":true}", admin));
        JsonNode adminEvents = body(request("GET", path, null, admin));
        assertEquals(2, adminEvents.get("total").asInt());
        assertTrue(adminEvents.get("items").get(0).get("internal").asBoolean());
        assertTrue(!adminEvents.get("items").get(1).get("internal").asBoolean());
        assertEquals(2, body(request("GET", path, null, team)).get("total").asInt());
        assertEquals(2, body(request("GET", path + "?type=ISSUE_CREATED", null, admin)).get("total").asInt());
        assertEquals(0, body(request("GET", path + "?type=ISSUE_APPROVED", null, admin)).get("total").asInt());
        JsonNode actors = body(request("GET", path + "/actors", null, team));
        assertEquals(1, actors.size());
        assertEquals(2, body(request("GET", path + "?actorId=" + actors.get(0).get("id").asLong(),
            null, team)).get("total").asInt());
        assertEquals(0, body(request("GET", path + "?from=2099-01-01T00:00:00Z",
            null, admin)).get("total").asInt());
        assertEquals(1, body(request("GET", path + "?size=1", null, admin)).get("items").size());
        var persisted = eventRepository.findById(adminEvents.get("items").get(0).get("id").asLong()).orElseThrow();
        var recipient = userRepository.findById(teamId).orElseThrow();
        var notification = new it.davideleva.loom.domain.EventUserNotification(persisted, recipient);
        notification.setEmailBatchId("batch-test"); notification.setEmailDeliveryId("delivery-test");
        notification.setRecipientEmail("historical@example.com"); notification.setDeliveryStatus("SENT");
        notification.setAttemptedAt(java.time.Instant.now());
        attempts.save(new it.davideleva.loom.domain.EmailNotificationAttempt(notification));
        JsonNode batches = body(request("GET", path + "/email-batches", null, team));
        assertEquals(1, batches.get("total").asInt());
        var delivery = batches.get("items").get(0).get("deliveries").get(0);
        assertEquals("historical@example.com", delivery.get("recipientEmail").asText());
        assertEquals("SENT", delivery.get("status").asText());
        assertEquals(1, delivery.get("events").size());
        assertEquals(403, request("GET", path + "/email-batches", null, customer).statusCode());
        assertEquals(0, body(request("GET", path + "/email-batches?type=ISSUE_APPROVED", null, team)).get("total").asInt());
        assertEquals(0, body(request("GET", path + "/email-batches?from=2099-01-01T00:00:00Z", null, team)).get("total").asInt());
        long beforeDelete = adminEvents.get("items").get(0).get("id").asLong();

        assertEquals(204, request("DELETE", "/api/work/issues/" + publicIssue, null, admin).statusCode());
        JsonNode teamEvents = body(request("GET", path, null, team));
        assertEquals(3, teamEvents.get("total").asInt());
        assertEquals("ISSUE_DELETED", teamEvents.get("items").get(0).get("type").asText());
        assertEquals(publicIssue, teamEvents.get("items").get(0).get("issueId").asLong());
        assertTrue(teamEvents.get("items").get(0).get("id").asLong() > beforeDelete);
        assertEquals(3, body(request("GET", path, null, admin)).get("total").asInt());
        assertEquals(internalIssue, body(request("GET", path + "?type=ISSUE_CREATED", null, admin))
            .get("items").get(0).get("issueId").asLong());
    }

    private long id(HttpResponse<String> response) throws Exception {
        assertEquals(201, response.statusCode(), response.body());
        return json.readTree(response.body()).get("id").asLong();
    }

    private JsonNode body(HttpResponse<String> response) throws Exception {
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private String login(String username, String password) throws Exception {
        HttpResponse<String> response = request("POST", "/api/auth/login", "{\"username\":\"" + username
            + "\",\"password\":\"" + password + "\"}", null);
        return body(response).get("accessToken").asText();
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
