package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:livewebsocket;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE,TYPE,POSITION;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "logging.level.root=WARN",
    "app.jwt.secret=0123456789abcdef0123456789abcdef"
})
class LiveWebSocketIntegrationTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void allIssueChangesReachAuthorizedClientsAfterCommit() throws Exception {
        assertEquals(201, request("POST", "/api/setup", "{\"teamCompanyName\":\"Team\",\"username\":\"admin\","
            + "\"email\":\"admin@example.com\",\"password\":\"admin-password-123\"}", null).statusCode());
        String admin = login("admin", "admin-password-123");
        long companyId = id(request("POST", "/api/companies", "{\"name\":\"Customer\"}", admin));
        long projectId = id(request("POST", "/api/projects", "{\"name\":\"Portal\",\"companyId\":" + companyId + "}", admin));
        long otherProjectId = id(request("POST", "/api/projects", "{\"name\":\"Private\"}", admin));
        assertEquals(201, request("POST", "/api/users", "{\"username\":\"customer\","
            + "\"email\":\"customer@example.com\",\"password\":\"customer-password-123\","
            + "\"role\":\"USER\",\"companyId\":" + companyId + "}", admin).statusCode());
        String customer = login("customer", "customer-password-123");
        assertEquals(401, request("POST", "/api/work/live/tickets", "{\"projectId\":" + projectId + "}", null).statusCode());
        assertEquals(403, request("POST", "/api/work/live/tickets", "{\"projectId\":" + otherProjectId + "}", customer).statusCode());

        SocketClient adminSocket = connect(projectId, admin);
        SocketClient customerSocket = connect(projectId, customer);
        try {
            assertEquals("ready", kind(adminSocket.next()));
            assertEquals("ready", kind(customerSocket.next()));
            assertThrows(ExecutionException.class, () -> client.newWebSocketBuilder()
                .buildAsync(URI.create("ws://localhost:" + port + "/api/work/live?ticket=" + customerSocket.ticket),
                    new WebSocket.Listener() {}).get(5, TimeUnit.SECONDS));

            long issueId = id(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
                + ",\"title\":\"Public\",\"description\":\"Details\"}", admin));
            changed(adminSocket, issueId);
            changed(customerSocket, issueId);
            JsonNode creation = event(projectId, "ISSUE_CREATED", admin);
            assertEquals("admin", creation.get("actorUsername").asText());
            assertEquals("Public", creation.get("issueTitle").asText());
            assertTrue(creation.get("data").asText().contains("Descrizione: Details"));

            long commentId = id(request("POST", "/api/work/issues/" + issueId + "/comments",
                "{\"comment\":\"Hello\"}", customer));
            changed(adminSocket, issueId);
            changed(customerSocket, issueId);
            JsonNode comment = event(projectId, "ISSUE_COMMENT_ADDED", admin);
            assertEquals("customer", comment.get("actorUsername").asText());
            assertTrue(comment.get("data").asText().contains("Hello"));

            assertEquals(204, request("DELETE", "/api/work/comments/" + commentId, null, customer).statusCode());
            changed(adminSocket, issueId);
            changed(customerSocket, issueId);

            assertEquals(200, request("PATCH", "/api/work/issues/" + issueId + "/status",
                "{\"status\":\"IN_PROGRESS\"}", admin).statusCode());
            changed(adminSocket, issueId);
            changed(customerSocket, issueId);
            assertTrue(event(projectId, "ISSUE_STATUS_CHANGED", admin).get("data").asText()
                .contains("Segnalato → In lavorazione"));

            long internalId = id(request("POST", "/api/work/issues", "{\"projectId\":" + projectId
                + ",\"title\":\"Internal\",\"description\":\"Details\",\"internal\":true}", admin));
            changed(adminSocket, internalId);
            assertNull(customerSocket.messages.poll(500, TimeUnit.MILLISECONDS));

            assertEquals(204, request("DELETE", "/api/work/issues/" + issueId, null, admin).statusCode());
            changed(adminSocket, issueId);
            changed(customerSocket, issueId);
            JsonNode deletion = event(projectId, "ISSUE_DELETED", admin);
            assertEquals("admin", deletion.get("actorUsername").asText());
            assertTrue(deletion.get("data").asText().contains("Titolo: Public"));

            long fieldId = id(request("POST", "/api/issue-fields", "{\"projectId\":" + projectId
                + ",\"code\":\"NOTES\",\"label\":\"Note team\",\"type\":\"TEXT\",\"scope\":\"TEAM\"}", admin));
            assertEquals(200, request("PATCH", "/api/work/issues/" + internalId + "/values",
                "{\"values\":[{\"definitionId\":" + fieldId + ",\"position\":0,\"value\":\"Prima\"}]}", admin).statusCode());
            changed(adminSocket, internalId);
            assertNull(customerSocket.messages.poll(500, TimeUnit.MILLISECONDS));
            assertTrue(event(projectId, "ISSUE_VALUES_CHANGED", admin).get("data").asText()
                .contains("Note team: (vuoto) → Prima"));

            assertEquals(200, request("PATCH", "/api/work/issues/" + internalId + "/values",
                "{\"values\":[{\"definitionId\":" + fieldId + ",\"position\":0,\"value\":\"Dopo\"}]}", admin).statusCode());
            changed(adminSocket, internalId);
            assertTrue(event(projectId, "ISSUE_VALUES_CHANGED", admin).get("data").asText()
                .contains("Note team: Prima → Dopo"));
        } finally {
            adminSocket.socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
            customerSocket.socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
        }
    }

    private void changed(SocketClient client, long issueId) throws Exception {
        JsonNode message = json.readTree(client.next());
        assertEquals("changed", message.get("kind").asText());
        assertEquals(issueId, message.get("issueId").asLong());
    }

    private JsonNode event(long projectId, String type, String token) throws Exception {
        HttpResponse<String> response = request("GET", "/api/work/projects/" + projectId + "/events?type=" + type,
            null, token);
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body()).get("items").get(0);
    }

    private String kind(String message) throws Exception { return json.readTree(message).get("kind").asText(); }

    private SocketClient connect(long projectId, String token) throws Exception {
        String ticket = json.readTree(request("POST", "/api/work/live/tickets",
            "{\"projectId\":" + projectId + "}", token).body()).get("value").asText();
        LinkedBlockingQueue<String> messages = new LinkedBlockingQueue<>();
        WebSocket socket = client.newWebSocketBuilder()
            .buildAsync(URI.create("ws://localhost:" + port + "/api/work/live?ticket=" + ticket), new WebSocket.Listener() {
                private final StringBuilder current = new StringBuilder();

                @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }

                @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                    current.append(data);
                    if (last) {
                        messages.offer(current.toString());
                        current.setLength(0);
                    }
                    webSocket.request(1);
                    return CompletableFuture.completedFuture(null);
                }
            }).get(5, TimeUnit.SECONDS);
        return new SocketClient(socket, messages, ticket);
    }

    private record SocketClient(WebSocket socket, LinkedBlockingQueue<String> messages, String ticket) {
        String next() throws InterruptedException { return messages.poll(5, TimeUnit.SECONDS); }
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
}
