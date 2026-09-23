package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

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
    "spring.datasource.url=jdbc:h2:mem:crudapi;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "debug=false",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class CrudApiIntegrationTest {
    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper json;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void adminCanManageProjectDataAndTeamCannotReadIt() throws Exception {
        assertEquals(401, request("GET", "/api/companies", null, null).statusCode());
        assertEquals(201, request("POST", "/api/setup",
            "{\"teamCompanyName\":\"Software Due\",\"username\":\"admin\","
                + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", null).statusCode());

        String admin = login("admin", "admin-password-123");
        JsonNode adminProfile = json.readTree(request("GET", "/api/auth/me", null, admin).body());
        assertEquals("admin", adminProfile.get("username").asText());
        HttpResponse<String> company = request("POST", "/api/companies",
            "{\"name\":\"Acme\"}", admin);
        assertEquals(201, company.statusCode());
        long companyId = json.readTree(company.body()).get("id").asLong();
        assertEquals("Acme 2", json.readTree(request("PUT", "/api/companies/" + companyId,
            "{\"name\":\"Acme 2\"}", admin).body()).get("name").asText());

        HttpResponse<String> project = request("POST", "/api/projects",
            "{\"name\":\"ERP\",\"companyId\":" + companyId + "}", admin);
        assertEquals(201, project.statusCode());
        long projectId = json.readTree(project.body()).get("id").asLong();
        assertEquals(projectId, json.readTree(request("GET", "/api/auth/projects", null, admin).body())
            .get(0).get("id").asLong());

        HttpResponse<String> customer = request("POST", "/api/users",
            "{\"username\":\"customer\",\"email\":\"customer@example.com\",\"password\":\"customer-password-123\","
                + "\"role\":\"USER\",\"companyId\":" + companyId + "}", admin);
        assertEquals(201, customer.statusCode());
        long customerId = json.readTree(customer.body()).get("id").asLong();
        assertEquals(400, request("POST", "/api/project-users",
            "{\"projectId\":" + projectId + ",\"userId\":" + customerId + "}",
            admin).statusCode());
        assertEquals(409, request("DELETE", "/api/project-users/" + projectId + "/" + customerId,
            null, admin).statusCode());
        assertEquals(1, json.readTree(request("GET", "/api/users/project/" + projectId,
            null, admin).body()).size());
        HttpResponse<String> unrelatedProject = request("POST", "/api/projects",
            "{\"name\":\"Other ERP\",\"companyId\":" + companyId + "}", admin);
        assertEquals(201, unrelatedProject.statusCode());
        long unrelatedProjectId = json.readTree(unrelatedProject.body()).get("id").asLong();
        String customerToken = login("customer", "customer-password-123");
        assertEquals("Acme 2", json.readTree(request("GET", "/api/auth/me", null, customerToken)
            .body()).get("companyName").asText());
        assertEquals(projectId, json.readTree(request("GET", "/api/auth/projects", null, customerToken)
            .body()).get(0).get("id").asLong());
        assertEquals(2, json.readTree(request("GET", "/api/auth/projects", null, customerToken).body()).size());
        HttpResponse<String> laterCustomer = request("POST", "/api/users",
            "{\"username\":\"later\",\"email\":\"later@example.com\",\"password\":\"later-password-123\","
                + "\"role\":\"SUPERUSER\",\"companyId\":" + companyId + "}", admin);
        assertEquals(201, laterCustomer.statusCode());
        assertEquals(2, json.readTree(request("GET", "/api/users/project/" + projectId,
            null, admin).body()).size());

        HttpResponse<String> externalCompany = request("POST", "/api/companies",
            "{\"name\":\"Beta\"}", admin);
        assertEquals(201, externalCompany.statusCode());
        long externalCompanyId = json.readTree(externalCompany.body()).get("id").asLong();
        HttpResponse<String> externalCustomer = request("POST", "/api/users",
            "{\"username\":\"external\",\"email\":\"external@example.com\",\"password\":\"external-password-123\","
                + "\"role\":\"USER\",\"companyId\":" + externalCompanyId + "}", admin);
        assertEquals(201, externalCustomer.statusCode());
        long externalCustomerId = json.readTree(externalCustomer.body()).get("id").asLong();
        assertEquals(201, request("POST", "/api/project-users",
            "{\"projectId\":" + projectId + ",\"userId\":" + externalCustomerId + "}",
            admin).statusCode());
        assertEquals(3, json.readTree(request("GET", "/api/users/project/" + projectId,
            null, admin).body()).size());
        String externalCustomerToken = login("external", "external-password-123");
        assertEquals(1, json.readTree(request("GET", "/api/auth/projects", null,
            externalCustomerToken).body()).size());

        HttpResponse<String> field = request("POST", "/api/issue-fields",
            "{\"projectId\":" + projectId
                + ",\"code\":\"MODULE\",\"label\":\"Module\",\"type\":\"SELECT\"}", admin);
        assertEquals(201, field.statusCode());
        long fieldId = json.readTree(field.body()).get("id").asLong();

        HttpResponse<String> option = request("POST", "/api/issue-field-options",
            "{\"definitionId\":" + fieldId
                + ",\"value\":\"CORE\",\"label\":\"Core\"}", admin);
        assertEquals(201, option.statusCode());
        long optionId = json.readTree(option.body()).get("id").asLong();

        HttpResponse<String> issue = request("POST", "/api/issues",
            "{\"projectId\":" + projectId
                + ",\"title\":\"Cannot save\",\"description\":\"Details\","
                + "\"issueType\":\"ANOMALY\",\"issuerUserId\":" + customerId + "}", admin);
        assertEquals(201, issue.statusCode());
        long issueId = json.readTree(issue.body()).get("id").asLong();

        assertEquals(200, request("PUT", "/api/projects/" + projectId,
            "{\"name\":\"ERP\",\"companyId\":null}", admin).statusCode());
        assertEquals(1, json.readTree(request("GET", "/api/users/project/" + projectId,
            null, admin).body()).size());
        assertEquals(1, json.readTree(request("GET", "/api/auth/projects", null, customerToken).body()).size());
        assertEquals(1, json.readTree(request("GET", "/api/auth/projects", null,
            externalCustomerToken).body()).size());
        assertEquals(200, request("GET", "/api/issues/" + issueId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/project-users/" + projectId + "/" + externalCustomerId,
            null, admin).statusCode());
        assertEquals(0, json.readTree(request("GET", "/api/users/project/" + projectId,
            null, admin).body()).size());
        assertEquals(0, json.readTree(request("GET", "/api/auth/projects", null,
            externalCustomerToken).body()).size());

        HttpResponse<String> comment = request("POST", "/api/issue-comments",
            "{\"issueId\":" + issueId + ",\"comment\":\"Looking into this\"}", admin);
        assertEquals(201, comment.statusCode());
        long commentId = json.readTree(comment.body()).get("id").asLong();
        assertEquals(1, json.readTree(request("GET", "/api/issue-comments/project/" + projectId,
            null, admin).body()).size());

        assertEquals(400, request("POST", "/api/issue-data",
            "{\"issueId\":" + issueId + ",\"definitionId\":" + fieldId
                + ",\"value\":\"UNKNOWN\"}", admin).statusCode());
        HttpResponse<String> data = request("POST", "/api/issue-data",
            "{\"issueId\":" + issueId + ",\"definitionId\":" + fieldId
                + ",\"value\":\"CORE\"}", admin);
        assertEquals(201, data.statusCode());
        long dataId = json.readTree(data.body()).get("id").asLong();

        JsonNode projectIssues = json.readTree(request("GET", "/api/issues/project/" + projectId,
            null, admin).body());
        assertEquals(1, projectIssues.size());
        assertEquals(issueId, projectIssues.get(0).get("id").asLong());

        JsonNode users = json.readTree(request("GET", "/api/users", null, admin).body());
        assertFalse(users.get(0).has("passwordHash"));

        HttpResponse<String> teamUser = request("POST", "/api/users",
            "{\"username\":\"team\",\"email\":\"team@example.com\",\"password\":\"team-password-123\",\"role\":\"TEAM\"}",
            admin);
        assertEquals(201, teamUser.statusCode());
        long teamUserId = json.readTree(teamUser.body()).get("id").asLong();
        String team = login("team", "team-password-123");
        assertEquals(403, request("GET", "/api/companies", null, team).statusCode());
        assertEquals(0, json.readTree(request("GET", "/api/auth/projects", null, team).body()).size());
        assertEquals(201, request("POST", "/api/project-users",
            "{\"projectId\":" + projectId + ",\"userId\":" + teamUserId + "}", admin).statusCode());
        assertEquals(1, json.readTree(request("GET", "/api/auth/projects", null, team).body()).size());

        // H2's Hibernate-generated test schema omits the PostgreSQL migration's ON DELETE CASCADE rules.
        assertEquals(204, request("DELETE", "/api/project-users/" + projectId + "/" + teamUserId,
            null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/issue-data/" + dataId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/issue-field-options/" + optionId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/issue-fields/" + fieldId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/issue-comments/" + commentId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/issues/" + issueId, null, admin).statusCode());
        assertEquals(200, request("PUT", "/api/projects/" + unrelatedProjectId,
            "{\"name\":\"Other ERP\",\"companyId\":null}", admin).statusCode());
        assertEquals(0, json.readTree(request("GET", "/api/users/project/" + unrelatedProjectId,
            null, admin).body()).size());
        assertEquals(0, json.readTree(request("GET", "/api/auth/projects", null, customerToken).body()).size());
        assertEquals(204, request("DELETE", "/api/projects/" + projectId, null, admin).statusCode());
        assertEquals(204, request("DELETE", "/api/projects/" + unrelatedProjectId, null, admin).statusCode());
        assertEquals(404, request("GET", "/api/issues/" + issueId, null, admin).statusCode());
    }

    private String login(String username, String password) throws Exception {
        HttpResponse<String> response = request("POST", "/api/auth/login",
            "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode());
        return json.readTree(response.body()).get("accessToken").asText();
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
