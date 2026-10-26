package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:userapproval;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa",
    "spring.datasource.password=", "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop", "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserOwnIssueApprovalIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();
    private String admin, owner, other, superuser;
    private long ownerId, companyId, projectId;

    @BeforeAll
    void setup() throws Exception {
        assertEquals(201, request("POST", "/api/setup", """
            {"teamCompanyName":"Team","username":"admin","email":"admin@example.com",
             "password":"test-password-123"}
            """, null).statusCode());
        admin = login("admin");
        companyId = created("/api/companies", Map.of("name", "Customer"), admin);
        projectId = created("/api/projects", Map.of("name", "Approvals", "companyId", companyId), admin);
        ownerId = createUser("owner", "USER");
        createUser("other", "USER");
        createUser("superuser", "SUPERUSER");
        owner = login("owner"); other = login("other"); superuser = login("superuser");
    }

    @ParameterizedTest
    @ValueSource(strings = {"approval", "status"})
    void userCanApproveOwnReleasedIssueAndAuditRecordsTheUser(String endpoint) throws Exception {
        long id = issue(projectId, owner, false);
        body(patch("/api/work/issues/" + id + "/status", "{\"status\":\"RELEASED\"}", admin), 200);
        JsonNode released = detail(id, owner);
        JsonNode approved = body(approve(id, endpoint, owner), 200);
        assertEquals("APPROVED", approved.get("status").asText());
        assertEquals(ownerId, approved.get("approveUserId").asLong());
        assertEquals(released.get("releasedAt"), approved.get("releasedAt"));
        assertTrue(!approved.get("approvedAt").isNull());
        JsonNode persisted = detail(id, owner);
        assertEquals("APPROVED", persisted.get("status").asText());
        assertEquals(ownerId, persisted.get("approveUserId").asLong());
        assertEquals("USER", body(request("GET", "/api/auth/me", null, owner), 200).get("role").asText());
        assertEquals(403, request("GET", "/api/users", null, owner).statusCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"approval", "status"})
    void userCannotApproveSomeoneElsesReleasedIssue(String endpoint) throws Exception {
        long id = issue(projectId, owner, false);
        body(patch("/api/work/issues/" + id + "/status", "{\"status\":\"RELEASED\"}", admin), 200);
        var response = approve(id, endpoint, other);
        assertEquals(403, response.statusCode(), response.body());
        JsonNode unchanged = detail(id, owner);
        assertEquals("RELEASED", unchanged.get("status").asText());
        assertTrue(unchanged.get("approveUserId").isNull());
        assertTrue(unchanged.get("approvedAt").isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"approval", "status"})
    void ownershipDoesNotBypassReleasedStateOrProjectAccess(String endpoint) throws Exception {
        long id = issue(projectId, owner, false);
        assertEquals(400, approve(id, endpoint, owner).statusCode());
        assertEquals("REPORTED", detail(id, owner).get("status").asText());
        long project = created("/api/projects", Map.of("name", "Restricted", "companyId", companyId), admin);
        long restrictedIssue = issue(project, owner, false);
        body(patch("/api/work/issues/" + restrictedIssue + "/status", "{\"status\":\"RELEASED\"}", admin), 200);
        long anotherCompany = created("/api/companies", Map.of("name", "Other company"), admin);
        body(request("PUT", "/api/projects/" + project,
            json.writeValueAsString(Map.of("name", "Restricted", "companyId", anotherCompany)), admin), 200);
        assertEquals(403, approve(restrictedIssue, endpoint, owner).statusCode());
    }

    @Test
    void existingSuperuserAndAdminApprovalRulesRemainUnchanged() throws Exception {
        long publicIssue = issue(projectId, owner, false);
        body(patch("/api/work/issues/" + publicIssue + "/status", "{\"status\":\"RELEASED\"}", admin), 200);
        assertEquals(403, approve(publicIssue, "approval", admin).statusCode());
        body(approve(publicIssue, "approval", superuser), 200);
        long internalIssue = issue(projectId, admin, true);
        body(patch("/api/work/issues/" + internalIssue + "/status", "{\"status\":\"RELEASED\"}", admin), 200);
        assertEquals(403, approve(internalIssue, "approval", owner).statusCode());
        body(approve(internalIssue, "approval", admin), 200);
    }

    private long createUser(String username, String role) throws Exception {
        return created("/api/users", Map.of("username", username, "email", username + "@example.com",
            "password", "test-password-123", "role", role, "companyId", companyId), admin);
    }

    private String login(String username) throws Exception {
        return body(request("POST", "/api/auth/login", json.writeValueAsString(Map.of(
            "username", username, "password", "test-password-123")), null), 200).get("accessToken").asText();
    }

    private long issue(long project, String token, boolean internal) throws Exception {
        return created("/api/work/issues", Map.of("projectId", project, "title", "Approval ticket",
            "description", "Details", "internal", internal), token);
    }

    private long created(String path, Map<String, Object> input, String token) throws Exception {
        return body(request("POST", path, json.writeValueAsString(input), token), 201).get("id").asLong();
    }

    private HttpResponse<String> approve(long id, String endpoint, String token) throws Exception {
        return patch("/api/work/issues/" + id + "/" + endpoint,
            endpoint.equals("status") ? "{\"status\":\"APPROVED\"}" : "{}", token);
    }

    private HttpResponse<String> patch(String path, String input, String token) throws Exception {
        return request("PATCH", path, input, token);
    }

    private JsonNode detail(long id, String token) throws Exception {
        return body(request("GET", "/api/work/issues/" + id, null, token), 200).get("issue");
    }

    private JsonNode body(HttpResponse<String> response, int status) throws Exception {
        assertEquals(status, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private HttpResponse<String> request(String method, String path, String input, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.header("Content-Type", "application/json");
        builder.method(method, input == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(input));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
