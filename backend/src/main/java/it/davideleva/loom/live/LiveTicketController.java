package it.davideleva.loom.live;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/work/live/tickets")
@RequiredArgsConstructor
public class LiveTicketController {
    private final LiveTicketService tickets;

    public record Request(@NotNull Long projectId) {}

    @PostMapping
    public LiveTicketService.Ticket issue(@Valid @RequestBody Request request, JwtAuthenticationToken authentication) {
        return tickets.issue(request.projectId(), authentication);
    }
}
