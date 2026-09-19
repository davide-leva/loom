package it.sf2.tickets.controller;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:branding;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef",
    "app.branding.root-folder=target/test-branding"
})
class BrandingIntegrationTest {
    private static final byte[] PNG = Base64.getDecoder().decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==");

    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void companyAndProjectBrandingAreSavedAndServed() throws Exception {
        assertEquals(201, multipart("POST", "/api/setup",
            "{\"teamCompanyName\":\"Internal\",\"primaryColor\":\"teal\",\"username\":\"admin\","
                + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", PNG, null).statusCode());
        assertTrue(Files.exists(Path.of("target/test-branding/companies/1.png")));
        assertArrayEquals(PNG, getBytes("/api/branding/companies/1/logo"));
        String admin = json.readTree(request("POST", "/api/auth/login",
            "{\"username\":\"admin\",\"password\":\"admin-password-123\"}", null).body())
            .get("accessToken").asText();
        var adminProfile = json.readTree(request("GET", "/api/auth/me", null, admin).body());
        assertEquals("teal", adminProfile.get("primaryColor").asText());
        assertEquals("/api/branding/companies/1/logo", adminProfile.get("internalLogoUrl").asText());

        var company = multipart("POST", "/api/companies",
            "{\"name\":\"Customer\",\"primaryColor\":\"violet\"}", PNG, admin);
        assertEquals(201, company.statusCode());
        long companyId = json.readTree(company.body()).get("id").asLong();
        assertEquals("violet", json.readTree(company.body()).get("primaryColor").asText());
        assertTrue(Files.exists(Path.of("target/test-branding/companies/" + companyId + ".png")));
        assertArrayEquals(PNG, getBytes("/api/branding/companies/" + companyId + "/logo"));

        var project = multipart("POST", "/api/projects",
            "{\"name\":\"Portal\",\"companyId\":" + companyId + "}", PNG, admin);
        assertEquals(201, project.statusCode());
        long projectId = json.readTree(project.body()).get("id").asLong();
        assertTrue(Files.exists(Path.of("target/test-branding/projects/" + projectId + ".png")));
        assertArrayEquals(PNG, getBytes("/api/branding/projects/" + projectId + "/logo"));
        assertEquals("/api/branding/projects/" + projectId + "/logo",
            json.readTree(request("GET", "/api/auth/projects", null, admin).body()).get(0)
                .get("logoUrl").asText());
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">"
            .concat("<circle cx=\"5\" cy=\"5\" r=\"4\"/></svg>").getBytes(StandardCharsets.UTF_8);
        assertEquals(200, multipart("PUT", "/api/projects/" + projectId,
            "{\"name\":\"Portal\",\"companyId\":" + companyId + "}", svg, admin, "mark.svg", "image/svg+xml")
            .statusCode());
        assertTrue(Files.exists(Path.of("target/test-branding/projects/" + projectId + ".svg")));
        assertArrayEquals(svg, getBytes("/api/branding/projects/" + projectId + "/logo"));

        var customer = request("POST", "/api/users",
            "{\"username\":\"customer\",\"email\":\"customer@example.com\","
                + "\"password\":\"customer-password-123\",\"role\":\"USER\",\"companyId\":" + companyId + "}", admin);
        assertEquals(201, customer.statusCode());
        String customerToken = json.readTree(request("POST", "/api/auth/login",
            "{\"username\":\"customer\",\"password\":\"customer-password-123\"}", null).body())
            .get("accessToken").asText();
        var profile = json.readTree(request("GET", "/api/auth/me", null, customerToken).body());
        assertEquals("violet", profile.get("primaryColor").asText());
        assertEquals("/api/branding/companies/" + companyId + "/logo", profile.get("companyLogoUrl").asText());
        assertEquals("/api/branding/companies/1/logo", profile.get("internalLogoUrl").asText());
    }

    private HttpResponse<String> multipart(String method, String path, String input, byte[] logo, String token)
        throws Exception {
        return multipart(method, path, input, logo, token, "mark.png", "image/png");
    }

    private HttpResponse<String> multipart(String method, String path, String input, byte[] logo, String token,
                                           String filename, String contentType) throws Exception {
        String boundary = "sf2-brand-test";
        var body = HttpRequest.BodyPublishers.concat(
            HttpRequest.BodyPublishers.ofString("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"input\"\r\n"
                + "Content-Type: application/json\r\n\r\n" + input + "\r\n"),
            HttpRequest.BodyPublishers.ofString("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"logo\"; filename=\"" + filename + "\"\r\n"
                + "Content-Type: " + contentType + "\r\n\r\n"),
            HttpRequest.BodyPublishers.ofByteArray(logo),
            HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n")
        );
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary);
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return client.send(builder.method(method, body).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (body != null) builder.header("Content-Type", "application/json");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return client.send(builder.method(method, body == null
            ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(),
            HttpResponse.BodyHandlers.ofString());
    }

    private byte[] getBytes(String path) throws Exception {
        var response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
            HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, response.statusCode());
        return response.body();
    }
}
