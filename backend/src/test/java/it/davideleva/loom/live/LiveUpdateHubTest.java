package it.davideleva.loom.live;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LiveUpdateHubTest {
    @Mock LiveTicketService tickets;

    private LiveUpdateHub hub;

    @BeforeEach
    void setUp() {
        hub = new LiveUpdateHub(tickets);
    }

    @Test
    void afterConnectionEstablishedRegistersSessionAndSendsReady() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("s1");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);

        hub.afterConnectionEstablished(session);

        List<String> payloads = payloadsSentTo(session);
        assertTrue(containsPayloadStartingWith(payloads, "ready"));
    }

    @Test
    void afterConnectionEstablishedClosesSessionWithoutGrant() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("s1");
        when(session.getAttributes()).thenReturn(new HashMap<>());

        hub.afterConnectionEstablished(session);

        verify(session).close(CloseStatus.POLICY_VIOLATION);
        assertTrue(payloadsSentTo(session).isEmpty());
    }

    @Test
    void afterConnectionClosedRemovesSession() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("s2");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);

        hub.afterConnectionEstablished(session);
        clearInvocations(session);
        hub.afterConnectionClosed(session, CloseStatus.NORMAL);

        hub.changed(100L, 1L, false);
        // After close, no further payloads should be delivered.
        List<String> payloads = payloadsSentTo(session);
        assertTrue(payloads.stream().noneMatch(p -> p.contains("\"changed\"")),
            "closed session must not receive changed payloads: " + payloads);
    }

    @Test
    void handleTransportErrorRemovesSessionAndCloses() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("s3");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);

        hub.afterConnectionEstablished(session);
        clearInvocations(session);
        hub.handleTransportError(session, new RuntimeException("boom"));

        verify(session).close();
        hub.changed(100L, 1L, false);
        List<String> payloads = payloadsSentTo(session);
        assertTrue(payloads.stream().noneMatch(p -> p.contains("\"changed\"")));
    }

    @Test
    void handleTextMessageClosesSession() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("s4");

        hub.handleTextMessage(session, new TextMessage("ping"));

        verify(session).close(CloseStatus.POLICY_VIOLATION);
    }

    @Test
    void changedBroadcastsOnlyToSessionsMatchingProjectId() throws Exception {
        WebSocketSession matching = mock(WebSocketSession.class);
        WebSocketSession other = mock(WebSocketSession.class);
        when(matching.getId()).thenReturn("m1");
        when(other.getId()).thenReturn("o1");
        when(matching.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(other.getAttributes()).thenReturn(attributes(grant(20L, 200L, false)));
        when(matching.isOpen()).thenReturn(true);
        when(other.isOpen()).thenReturn(true);
        lenient().when(tickets.isCurrent(any())).thenReturn(true);

        hub.afterConnectionEstablished(matching);
        hub.afterConnectionEstablished(other);
        clearInvocations(matching, other);

        hub.changed(100L, 1L, false);

        List<String> matchingPayloads = payloadsSentTo(matching);
        List<String> otherPayloads = payloadsSentTo(other);
        assertTrue(containsPayloadStartingWith(matchingPayloads, "changed"));
        assertTrue(otherPayloads.stream().noneMatch(p -> p.contains("\"changed\"")),
            "session for a different project must not receive the change");
    }

    @Test
    void changedSkipsInternalIssueForSessionsThatCannotSeeIt() throws Exception {
        WebSocketSession userLevel = mock(WebSocketSession.class);
        WebSocketSession teamLevel = mock(WebSocketSession.class);
        when(userLevel.getId()).thenReturn("u1");
        when(teamLevel.getId()).thenReturn("t1");
        when(userLevel.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(teamLevel.getAttributes()).thenReturn(attributes(grant(20L, 100L, true)));
        when(userLevel.isOpen()).thenReturn(true);
        when(teamLevel.isOpen()).thenReturn(true);
        lenient().when(tickets.isCurrent(any())).thenReturn(true);

        hub.afterConnectionEstablished(userLevel);
        hub.afterConnectionEstablished(teamLevel);
        clearInvocations(userLevel, teamLevel);

        hub.changed(100L, 7L, true);

        List<String> userPayloads = payloadsSentTo(userLevel);
        List<String> teamPayloads = payloadsSentTo(teamLevel);
        assertTrue(userPayloads.stream().noneMatch(p -> p.contains("\"issueId\":7")),
            "non-internal session must not receive the internal change");
        assertTrue(teamPayloads.stream().anyMatch(p -> p.contains("\"issueId\":7")),
            "team session should receive the internal change");
    }

    @Test
    void changedSendsInternalIssueToInternalAllowedSession() throws Exception {
        WebSocketSession teamLevel = mock(WebSocketSession.class);
        when(teamLevel.getId()).thenReturn("t2");
        when(teamLevel.getAttributes()).thenReturn(attributes(grant(20L, 100L, true)));
        when(teamLevel.isOpen()).thenReturn(true);
        lenient().when(tickets.isCurrent(any())).thenReturn(true);

        hub.afterConnectionEstablished(teamLevel);
        clearInvocations(teamLevel);

        hub.changed(100L, 8L, true);

        List<String> payloads = payloadsSentTo(teamLevel);
        assertTrue(containsPayloadStartingWith(payloads, "changed"));
        assertTrue(payloads.stream().anyMatch(p -> p.contains("\"issueId\":8")));
    }

    @Test
    void changedClosesSessionWhenGrantIsNoLongerValid() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("stale");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);
        when(tickets.isCurrent(any())).thenReturn(false);

        hub.afterConnectionEstablished(session);

        hub.changed(100L, 1L, false);

        verify(session).close();
        List<String> payloads = payloadsSentTo(session);
        assertTrue(payloads.stream().noneMatch(p -> p.contains("\"changed\"")),
            "stale session must not receive changed payloads");
    }

    @Test
    void changedSkipsSendingWhenSessionIsClosed() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("closed");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(false);
        lenient().when(tickets.isCurrent(any())).thenReturn(true);

        hub.afterConnectionEstablished(session);

        hub.changed(100L, 1L, false);

        List<String> payloads = payloadsSentTo(session);
        assertTrue(payloads.stream().noneMatch(p -> p.contains("\"changed\"")));
    }

    @Test
    void changedClosesSessionWhenSendThrows() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("err");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);
        when(tickets.isCurrent(any())).thenReturn(true);
        org.mockito.Mockito.doThrow(new java.io.IOException("send failed"))
            .when(session).sendMessage(any(TextMessage.class));

        hub.afterConnectionEstablished(session);

        hub.changed(100L, 1L, false);

        verify(session, org.mockito.Mockito.atLeastOnce()).close();
    }

    @Test
    void heartbeatClosesStaleSessions() throws Exception {
        WebSocketSession stale = mock(WebSocketSession.class);
        when(stale.getId()).thenReturn("stale-hb");
        when(stale.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(stale.isOpen()).thenReturn(true);
        when(tickets.isCurrent(any())).thenReturn(false);

        hub.afterConnectionEstablished(stale);

        hub.heartbeat();

        verify(stale).close();
    }

    @Test
    void changedPayloadEncodesIssueIdAsJson() throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("json");
        when(session.getAttributes()).thenReturn(attributes(grant(10L, 100L, false)));
        when(session.isOpen()).thenReturn(true);
        lenient().when(tickets.isCurrent(any())).thenReturn(true);

        hub.afterConnectionEstablished(session);

        hub.changed(100L, 42L, false);

        List<String> payloads = payloadsSentTo(session);
        String payload = payloads.stream().filter(p -> p.contains("\"changed\"")).findFirst().orElseThrow();
        assertTrue(payload.contains("\"kind\":\"changed\""), payload);
        assertTrue(payload.contains("\"issueId\":42"), payload);
    }

    // ---------- helpers ----------

    private static LiveTicketService.Grant grant(long userId, long projectId, boolean internalAllowed) {
        return new LiveTicketService.Grant(userId, projectId, internalAllowed,
            Instant.now().plusSeconds(30), Instant.now().plusSeconds(60));
    }

    private static Map<String, Object> attributes(LiveTicketService.Grant grant) {
        Map<String, Object> map = new HashMap<>();
        map.put("grant", grant);
        return map;
    }

    private static List<String> payloadsSentTo(WebSocketSession session) {
        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        try {
            org.mockito.Mockito.verify(session, org.mockito.Mockito.atLeast(0)).sendMessage(captor.capture());
        } catch (Throwable ignored) {
            return List.of();
        }
        List<String> payloads = new ArrayList<>();
        for (TextMessage message : captor.getAllValues()) {
            payloads.add(message.getPayload());
        }
        return payloads;
    }

    private static boolean containsPayloadStartingWith(List<String> payloads, String kind) {
        return payloads.stream().anyMatch(p -> p.contains("\"kind\":\"" + kind + "\""));
    }

    private static void clearInvocations(WebSocketSession... sessions) {
        for (WebSocketSession session : sessions) {
            org.mockito.Mockito.clearInvocations(session);
        }
    }
}
