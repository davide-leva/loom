package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:admindeveloper;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdminDeveloperAssignmentIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();
    private String adminToken;
    private long projectId;
    private long adminId;
    private long teamId;
    private long outsiderId;
    private long customerId;
    private long superuserId;

    @BeforeAll
    void setup() throws Exception {
        assertEquals(201, request("POST", "/api/setup", """
            {"teamCompanyName":"Team","username":"admin","email":"admin@example.com",
             "password":"admin-password-123"}
            """, null).statusCode());
        var login = request("POST", "/api/auth/login", """
            {"username":"admin","password":"admin-password-123"}
            """, null);
        assertEquals(200, login.statusCode(), login.body());
        adminToken = json.readTree(login.body()).get("accessToken").asText();
        adminId = read("/api/auth/me").get("id").asLong();
        long companyId = createdId(request("POST", "/api/companies", "{\"name\":\"Customer\"}", adminToken));
        projectId = createdId(request("POST", "/api/projects",
            json.writeValueAsString(Map.of("name", "Assignment tests", "companyId", companyId)), adminToken));
        teamId = createUser("developer", "TEAM", null);
        outsiderId = createUser("outsider", "TEAM", null);
        customerId = createUser("customer", "USER", companyId);
        superuserId = createUser("superuser", "SUPERUSER", companyId);
        assertEquals(201, request("POST", "/api/project-users",
            json.writeValueAsString(Map.of("projectId", projectId, "userId", teamId)), adminToken).statusCode());
    }

    @Test
    void adminsAreCandidatesWithoutExplicitMembershipAndAreNotDuplicated() throws Exception {
        long anotherAdmin = createUser("another-admin", "ADMIN", null);
        assertEquals(201, request("POST", "/api/project-users",
            json.writeValueAsString(Map.of("projectId", projectId, "userId", anotherAdmin)), adminToken).statusCode());
        List<Long> ids = new ArrayList<>();
        read("/api/work/projects/" + projectId + "/users").forEach(user -> ids.add(user.get("id").asLong()));
        assertTrue(ids.contains(adminId));
        assertEquals(1, ids.stream().filter(id -> id == anotherAdmin).count());
        assertTrue(ids.contains(teamId));
        assertTrue(ids.contains(customerId));
        assertFalse(ids.contains(outsiderId));
    }

    @Test
    void adminAssignmentIsPersistedVisibleInFiltersAndRemovableWithoutLosingPrivileges() throws Exception {
        long issueId = createIssue();
        var assigned = plan(issueId, adminId, adminToken);
        assertEquals(200, assigned.statusCode(), assigned.body());
        assertEquals(adminId, json.readTree(assigned.body()).get("devUserId").asLong());
        var persisted = read("/api/work/issues/" + issueId).get("issue");
        assertEquals(adminId, persisted.get("devUserId").asLong());
        assertEquals("admin", persisted.get("devUsername").asText());
        List<Long> listed = new ArrayList<>();
        read("/api/work/projects/" + projectId + "/issues").forEach(issue -> {
            if (issue.get("devUserId").asLong() == adminId) listed.add(issue.get("id").asLong());
        });
        assertTrue(listed.contains(issueId));
        var report = request("GET", "/api/work/projects/" + projectId + "/issues/report?developerId=" + adminId,
            null, adminToken);
        assertEquals(200, report.statusCode(), report.body());
        assertTrue(report.headers().firstValue("Content-Type").orElse("").startsWith("application/pdf"));
        assertEquals("ADMIN", read("/api/auth/me").get("role").asText());
        assertEquals(200, request("GET", "/api/users", null, adminToken).statusCode());
        assertEquals(200, plan(issueId, null, adminToken).statusCode());
        assertTrue(read("/api/work/issues/" + issueId).get("issue").get("devUserId").isNull());
    }

    @Test
    void existingTeamAssignmentAndMembershipRestrictionsRemainEnforced() throws Exception {
        long issueId = createIssue();
        assertEquals(200, plan(issueId, teamId, adminToken).statusCode());
        assertEquals(teamId, read("/api/work/issues/" + issueId).get("issue").get("devUserId").asLong());
        for (long invalidDeveloper : List.of(outsiderId, customerId, superuserId)) {
            var rejected = plan(issueId, invalidDeveloper, adminToken);
            assertEquals(400, rejected.statusCode(), rejected.body());
            assertEquals(teamId, read("/api/work/issues/" + issueId).get("issue").get("devUserId").asLong());
        }
        var login = request("POST", "/api/auth/login",
            "{\"username\":\"developer\",\"password\":\"test-password-123\"}", null);
        assertEquals(200, login.statusCode(), login.body());
        String teamToken = json.readTree(login.body()).get("accessToken").asText();
        assertEquals(403, plan(issueId, adminId, teamToken).statusCode());
    }

    private long createUser(String username, String role, Long companyId) throws Exception {
        String body = "{\"username\":\"" + username + "\",\"email\":\"" + username
            + "@example.com\",\"password\":\"test-password-123\",\"role\":\"" + role
            + "\",\"companyId\":" + companyId + "}";
        return createdId(request("POST", "/api/users", body, adminToken));
    }

    private long createIssue() throws Exception {
        return createdId(request("POST", "/api/work/issues", json.writeValueAsString(Map.of(
            "projectId", projectId, "title", "Ticket", "description", "Details")), adminToken));
    }

    private HttpResponse<String> plan(long issueId, Long developerId, String token) throws Exception {
        return request("PATCH", "/api/work/issues/" + issueId + "/planning",
            "{\"issueType\":\"ANOMALY\",\"devUserId\":" + developerId + "}", token);
    }

    private JsonNode read(String path) throws Exception {
        var response = request("GET", path, null, adminToken);
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private long createdId(HttpResponse<String> response) throws Exception {
        assertEquals(201, response.statusCode(), response.body());
        return json.readTree(response.body()).get("id").asLong();
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
