package it.davideleva.loom.live;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@RequiredArgsConstructor
@Slf4j
public class LiveUpdateHub extends TextWebSocketHandler {
    private record Connection(LiveTicketService.Grant grant, WebSocketSession session) {}
    private final LiveTicketService tickets;
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        LiveTicketService.Grant grant = (LiveTicketService.Grant) session.getAttributes().get("grant");
        if (grant == null) {
            log.warn("Live websocket rejected: session={} missing grant", session.getId());
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        WebSocketSession safe = new ConcurrentWebSocketSessionDecorator(session, 5_000, 64 * 1024);
        connections.put(session.getId(), new Connection(grant, safe));
        log.info("Live websocket connected: session={} user={} project={} internalAllowed={}",
            session.getId(), grant.userId(), grant.projectId(), grant.internalAllowed());
        send(safe, "{\"kind\":\"ready\"}");
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        session.close(CloseStatus.POLICY_VIOLATION);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        connections.remove(session.getId());
        log.info("Live websocket closed: session={} code={} reason={}", session.getId(), status.getCode(), status.getReason());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        connections.remove(session.getId());
        log.warn("Live websocket transport error: session={} reason={}", session.getId(), exception.getMessage());
        try { session.close(); } catch (IOException ignored) { }
    }

    public void changed(Long projectId, Long issueId, boolean internal) {
        String payload = "{\"kind\":\"changed\",\"issueId\":" + issueId + "}";
        int[] sent = {0};
        connections.forEach((id, connection) -> {
            if (connection.grant().projectId().equals(projectId)) {
                if (!isAllowed(connection)) {
                    close(id, connection);
                } else if (!internal || connection.grant().internalAllowed()) {
                    if (send(connection.session(), payload)) {
                        sent[0]++;
                    } else {
                        close(id, connection);
                    }
                }
            }
        });
        log.info("Live change published: project={} issue={} internal={} recipients={}", projectId, issueId, internal, sent[0]);
    }

    @Scheduled(fixedDelay = 25_000)
    public void heartbeat() {
        connections.forEach((id, connection) -> {
            if (!isAllowed(connection) || !send(connection.session(), "{\"kind\":\"heartbeat\"}")) {
                close(id, connection);
            }
        });
    }

    private void close(String id, Connection connection) {
        connections.remove(id);
        log.debug("Live websocket closing: session={} user={} project={}", id, connection.grant().userId(), connection.grant().projectId());
        try { connection.session().close(); } catch (IOException ignored) { }
    }

    private boolean isAllowed(Connection connection) {
        try {
            return tickets.isCurrent(connection.grant());
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean send(WebSocketSession session, String payload) {
        if (!session.isOpen()) return false;
        try {
            session.sendMessage(new TextMessage(payload));
            return true;
        } catch (IOException | RuntimeException exception) {
            try { session.close(); } catch (IOException ignored) { }
            return false;
        }
    }
}
