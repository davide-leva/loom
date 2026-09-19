package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.notification.IssueNotificationService;
import it.sf2.tickets.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/work/projects/{projectId}/notifications")
@RequiredArgsConstructor
public class IssueNotificationController {
    private final IssueNotificationService notifications;
    private final UserRepository users;
    private final ApiLookup lookup;

    @GetMapping
    @Transactional(readOnly = true)
    public IssueNotificationService.Summary summary(@PathVariable Long projectId,
                                                    JwtAuthenticationToken authentication) {
        requireExternalProject(authentication, projectId);
        Project project = lookup.project(projectId);
        User user = users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        return notifications.summary(project, user);
    }

    private static void requireExternalProject(JwtAuthenticationToken authentication, Long projectId) {
        Number externalProjectId = authentication.getToken().getClaim("external_project_id");
        if (externalProjectId != null && externalProjectId.longValue() != projectId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "External session is bound to another project");
        }
    }
}
