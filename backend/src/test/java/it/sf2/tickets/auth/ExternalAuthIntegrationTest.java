package it.sf2.tickets.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:externalauth;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "debug=false",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class ExternalAuthIntegrationTest {
    private static final String EXTERNAL_SECRET = "another-32-byte-secret-for-external-jwt-123";

    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper json;

    @Autowired
    private JdbcTemplate jdbc;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void externalJwtRequiresEnabledProjectValidSignatureMappedSubjectAndMembership() throws Exception {
        assertEquals(201, request("POST", "/api/setup",
            "{\"teamCompanyName\":\"Team\",\"username\":\"admin\",\"email\":\"admin@example.com\","
                + "\"password\":\"admin-password-123\"}", null).statusCode());
        String admin = login("admin", "admin-password-123");
        long companyId = id(request("POST", "/api/companies", "{\"name\":\"Acme\"}", admin));
        long projectId = id(request("POST", "/api/projects",
            "{\"name\":\"Project\",\"companyId\":" + companyId + "}", admin));
        long userId = id(request("POST", "/api/users",
            "{\"username\":\"customer\",\"email\":\"customer@example.com\","
                + "\"password\":\"customer-password-123\",\"role\":\"USER\",\"companyId\":" + companyId + "}", admin));
        String configPath = "/api/external-auth/projects/" + projectId;
        assertEquals(403, request("GET", configPath, null, login("customer", "customer-password-123")).statusCode());

        HttpResponse<String> created = request("POST", configPath + "/secrets",
            "{\"name\":\"Partner\",\"secret\":\"" + EXTERNAL_SECRET + "\"}", admin);
        assertEquals(201, created.statusCode());
        assertFalse(created.body().contains(EXTERNAL_SECRET));
        long secretId = json.readTree(created.body()).get("secrets").get(0).get("id").asLong();
        String storedSecret = jdbc.queryForObject(
            "select encrypted_secret from external_jwt_secrets where id = ?", String.class, secretId);
        assertFalse(storedSecret.contains(EXTERNAL_SECRET));
        assertFalse(storedSecret.equals(EXTERNAL_SECRET));
        String mappingPath = configPath + "/secrets/" + secretId + "/mappings";
        assertEquals(201, request("POST", mappingPath,
            "{\"subject\":\"partner-42\",\"userId\":" + userId + "}", admin).statusCode());

        String validToken = token(EXTERNAL_SECRET, "partner-42", Instant.now().plusSeconds(300));
        assertEquals(401, externalLogin(validToken).statusCode());
        assertEquals(200, request("PUT", configPath, "{\"enabled\":true}", admin).statusCode());
        assertEquals(401, externalLogin(token("a-different-32-byte-secret-for-testing", "partner-42",
            Instant.now().plusSeconds(300))).statusCode());
        assertEquals(401, externalLogin(token(EXTERNAL_SECRET, "unknown", Instant.now().plusSeconds(300))).statusCode());
        assertEquals(401, externalLogin(token(EXTERNAL_SECRET, "partner-42", Instant.now().minusSeconds(60))).statusCode());

        HttpResponse<String> result = externalLogin(validToken);
        assertEquals(200, result.statusCode());
        JsonNode response = json.readTree(result.body());
        assertEquals(projectId, response.get("projectId").asLong());
        String session = response.get("session").get("accessToken").asText();
        assertEquals("customer", json.readTree(request("GET", "/api/auth/me", null, session).body())
            .get("username").asText());
        assertEquals(200, request("GET", "/api/work/projects/" + projectId + "/notifications",
            null, session).statusCode());
        long anotherProjectId = id(request("POST", "/api/projects",
            "{\"name\":\"Another project\",\"companyId\":" + companyId + "}", admin));
        JsonNode externalProjects = json.readTree(request("GET", "/api/auth/projects", null, session).body());
        assertEquals(1, externalProjects.size());
        assertEquals(projectId, externalProjects.get(0).get("id").asLong());
        assertEquals(403, request("GET", "/api/work/projects/" + anotherProjectId + "/notifications",
            null, session).statusCode());
        assertFalse(request("GET", configPath, null, admin).body().contains(EXTERNAL_SECRET));

        String secondSecret = "second-distinct-32-byte-secret-for-partner";
        HttpResponse<String> secondCreated = request("POST", configPath + "/secrets",
            "{\"name\":\"Secondo partner\",\"secret\":\"" + secondSecret + "\"}", admin);
        assertEquals(201, secondCreated.statusCode());
        long secondId = json.readTree(secondCreated.body()).get("secrets").get(1).get("id").asLong();
        assertEquals(201, request("POST", configPath + "/secrets/" + secondId + "/mappings",
            "{\"subject\":\"partner-42\",\"userId\":" + userId + "}", admin).statusCode());
        String secondToken = token(secondSecret, "partner-42", Instant.now().plusSeconds(300));
        assertEquals(200, externalLogin(secondToken).statusCode());

        String binaryKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        String encodedKey = Base64.getEncoder().encodeToString(binaryKey.getBytes(StandardCharsets.UTF_8));
        assertEquals(400, request("POST", configPath + "/secrets",
            "{\"name\":\"Invalid Base64\",\"secret\":\"not-base64!\",\"algorithm\":\"HS256\","
                + "\"secretBase64\":true}", admin).statusCode());
        HttpResponse<String> appCreated = request("POST", configPath + "/secrets",
            "{\"name\":\"Base64 app\",\"secret\":\"" + encodedKey + "\",\"algorithm\":\"HS384\","
                + "\"secretBase64\":true}", admin);
        assertEquals(201, appCreated.statusCode());
        JsonNode app = json.readTree(appCreated.body()).get("secrets").get(0);
        long appId = app.get("id").asLong();
        assertEquals("HS384", app.get("algorithm").asText());
        assertTrue(app.get("secretBase64").asBoolean());
        assertEquals(0, app.get("userCount").asInt());
        assertEquals(201, request("POST", configPath + "/secrets/" + appId + "/mappings",
            "{\"subject\":\"partner-42\",\"userId\":" + userId + "}", admin).statusCode());
        assertEquals(200, externalLogin(token(binaryKey, "partner-42", Instant.now().plusSeconds(300),
            MacAlgorithm.HS384)).statusCode());
        HttpResponse<String> updated = request("PUT", configPath + "/secrets/" + appId,
            "{\"name\":\"Renamed app\",\"secret\":\"\",\"algorithm\":\"HS512\","
                + "\"secretBase64\":true}", admin);
        assertEquals(200, updated.statusCode());
        assertEquals(1, json.readTree(updated.body()).get("secrets").get(0).get("userCount").asInt());
        assertEquals(401, externalLogin(token(binaryKey, "partner-42", Instant.now().plusSeconds(300),
            MacAlgorithm.HS384)).statusCode());
        assertEquals(200, externalLogin(token(binaryKey, "partner-42", Instant.now().plusSeconds(300),
            MacAlgorithm.HS512)).statusCode());
        assertEquals(204, request("DELETE", configPath + "/secrets/" + appId, null, admin).statusCode());
        assertEquals(204, request("DELETE", configPath + "/secrets/" + secretId, null, admin).statusCode());
        assertEquals(401, externalLogin(validToken).statusCode());
        assertEquals(200, externalLogin(secondToken).statusCode());

        assertEquals(200, request("PUT", "/api/projects/" + projectId,
            "{\"name\":\"Project\",\"companyId\":null}", admin).statusCode());
        assertEquals(401, externalLogin(secondToken).statusCode());
        assertEquals(204, request("DELETE", configPath + "/secrets/" + secondId + "/mappings/"
            + json.readTree(request("GET", configPath, null, admin).body()).get("secrets").get(0)
                .get("mappings").get(0).get("id").asLong(), null, admin).statusCode());
        assertTrue(json.readTree(request("GET", configPath, null, admin).body()).get("secrets").get(0)
            .get("mappings").isEmpty());
    }

    private String token(String secret, String subject, Instant expiresAt) throws Exception {
        return token(secret, subject, expiresAt, MacAlgorithm.HS256);
    }

    private String token(String secret, String subject, Instant expiresAt, MacAlgorithm algorithm) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.parse(algorithm.getName())),
            new JWTClaimsSet.Builder().subject(subject).issueTime(Date.from(Instant.now().minusSeconds(120)))
                .expirationTime(Date.from(expiresAt)).build());
        jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }

    private HttpResponse<String> externalLogin(String token) throws Exception {
        return request("POST", "/api/auth/external-login", "{\"token\":\"" + token + "\"}", null);
    }

    private long id(HttpResponse<String> response) throws Exception {
        assertEquals(201, response.statusCode());
        return json.readTree(response.body()).get("id").asLong();
    }

    private String login(String username, String password) throws Exception {
        HttpResponse<String> response = request("POST", "/api/auth/login",
            "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}", null);
        assertEquals(200, response.statusCode());
        return json.readTree(response.body()).get("accessToken").asText();
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (body != null) builder.header("Content-Type", "application/json");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
