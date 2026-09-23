package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:issuereport;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class IssueReportIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void downloadsFilteredIssueReportAsPdf() throws Exception {
        assertEquals(201, request("POST", "/api/setup", "{\"teamCompanyName\":\"Team\",\"username\":\"admin\","
            + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", null).statusCode());
        String token = login("admin", "admin-password-123");
        long projectId = id(request("POST", "/api/projects", "{\"name\":\"Portal\"}", token));
        assertEquals(201, request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Public ticket\",\"description\":\"Visible to everyone\"}", token).statusCode());
        assertEquals(201, request("POST", "/api/work/issues", "{\"projectId\":" + projectId
            + ",\"title\":\"Internal ticket\",\"description\":\"Team only\",\"internal\":true}", token).statusCode());

        HttpResponse<byte[]> report = requestBytes("GET", "/api/work/projects/" + projectId
            + "/issues/report?search=Internal&internal=true", token);
        assertEquals(200, report.statusCode());
        assertEquals("application/pdf", report.headers().firstValue("Content-Type").orElse(""));
        assertTrue(report.headers().firstValue("Content-Disposition").orElse("").contains("attachment"));
        assertEquals("%PDF", new String(report.body(), 0, 4, StandardCharsets.US_ASCII));

        try (var document = Loader.loadPDF(report.body())) {
            String text = new PDFTextStripper().getText(document);
            assertTrue(text.contains("Internal ticket"));
            assertFalse(text.contains("Public ticket"));
            assertTrue(text.contains("Totale: 1"));
        }

        assertEquals(400, requestBytes("GET", "/api/work/projects/" + projectId
            + "/issues/report?uncategorized=true&issueType=ANOMALY", token).statusCode());
    }

    private long id(HttpResponse<String> response) throws Exception {
        assertEquals(201, response.statusCode(), response.body());
        return json.readTree(response.body()).get("id").asLong();
    }

    private String login(String username, String password) throws Exception {
        HttpResponse<String> response = request("POST", "/api/auth/login", "{\"username\":\"" + username
            + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode());
        return json.readTree(response.body()).get("accessToken").asText();
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<byte[]> requestBytes(String method, String path, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.method(method, HttpRequest.BodyPublishers.noBody());
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    }
}
