package it.sf2.tickets.live;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class LiveWebSocketConfig implements WebSocketConfigurer {
    private final LiveUpdateHub hub;
    private final LiveTicketService tickets;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(hub, "/api/work/live").addInterceptors(new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                           org.springframework.web.socket.WebSocketHandler handler,
                                           Map<String, Object> attributes) {
                String value = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("ticket");
                LiveTicketService.Grant grant = tickets.consume(value);
                if (grant == null) {
                    response.setStatusCode(HttpStatus.FORBIDDEN);
                    return false;
                }
                attributes.put("grant", grant);
                return true;
            }

            @Override
            public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       org.springframework.web.socket.WebSocketHandler handler, Exception exception) {}
        });
    }
}
