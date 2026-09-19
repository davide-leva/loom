package it.sf2.tickets.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
    "spring.datasource.url=jdbc:h2:mem:issuenotifications;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class IssueNotificationIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void notificationsAreScopedCountDistinctIssuesAndClearOnDetailGet() throws Exception {
        assertEquals(201, request("POST", "/api/setup", "{\"teamCompanyName\":\"Team\",\"username\":\"admin\"," 
            + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", null).statusCode());
        String admin = login("admin", "admin-password-123");
        long companyId = id(request("POST", "/api/companies", "{\"name\":\"Customer\"}", admin));
        long projectId = id(request("POST", "/api/projects",
            "{\"name\":\"Portal\",\"companyId\":" + companyId + "}", admin));
        long otherProjectId = id(request("POST", "/api/projects", "{\"name\":\"Other\"}", admin));
        assertEquals(201, request("POST", "/api/users", "{\"username\":\"customer\"," 
            + "\"email\":\"customer@example.com\",\"password\":\"customer-password-123\"," 
            + "\"role\":\"USER\",\"companyId\":" + companyId + "}", admin).statusCode());
        String customer = login("customer", "customer-password-123");
        String notifications = "/api/work/projects/" + projectId + "/notifications";

        long issueId = id(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Cannot save\",\"description\":\"Details\"}", admin));
        JsonNode first = body(request("GET", notifications, null, customer));
        assertEquals(1, first.get("total").asInt());
        assertEquals(1, first.get("planning").asInt());
        assertEquals(issueId, first.get("issues").get(0).get("issueId").asLong());

        assertEquals(200, request("GET", "/api/work/projects/" + projectId + "/issues", null, customer).statusCode());
        assertEquals(1, body(request("GET", notifications, null, customer)).get("total").asInt());
        assertEquals(200, request("GET", "/api/work/issues/" + issueId, null, customer).statusCode());
        assertEquals(0, body(request("GET", notifications, null, customer)).get("total").asInt());

        assertEquals(201, request("POST", "/api/work/issues/" + issueId + "/comments",
            "{\"comment\":\"Still reproducible\"}", customer).statusCode());
        JsonNode adminSummary = body(request("GET", notifications, null, admin));
        assertEquals(1, adminSummary.get("total").asInt());
        assertEquals(1, adminSummary.get("planning").asInt());
        assertEquals(200, request("GET", "/api/work/issues/" + issueId, null, admin).statusCode());
        assertEquals(0, body(request("GET", notifications, null, admin)).get("total").asInt());

        assertEquals(200, request("PATCH", "/api/work/issues/" + issueId + "/planning",
            "{\"issueType\":\"ANOMALY\",\"devUserId\":null}", admin).statusCode());
        JsonNode categorized = body(request("GET", notifications, null, customer));
        assertEquals(1, categorized.get("total").asInt());
        assertEquals(0, categorized.get("planning").asInt());
        assertEquals(1, categorized.get("anomalies").asInt());
        assertEquals("ANOMALY", categorized.get("issues").get(0).get("issueType").asText());
        assertEquals(403, request("GET", "/api/work/projects/" + otherProjectId + "/notifications",
            null, customer).statusCode());
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
        return body(request("POST", "/api/auth/login", "{\"username\":\"" + username
            + "\",\"password\":\"" + password + "\"}", null)).get("accessToken").asText();
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
