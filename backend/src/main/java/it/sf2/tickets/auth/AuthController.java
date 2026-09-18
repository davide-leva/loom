package it.sf2.tickets.auth;

import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.ProjectRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import it.sf2.tickets.repository.UserRepository;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final UserRepository users;
    private final ProjectRepository projects;
    private final ProjectUserRepository memberships;

    public AuthController(AuthService auth, UserRepository users, ProjectRepository projects,
                          ProjectUserRepository memberships) {
        this.auth = auth;
        this.users = users;
        this.projects = projects;
        this.memberships = memberships;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request);
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    public MeResponse me(JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        return new MeResponse(
            user.getId(), user.getUsername(), user.getEmail(), user.getRole().name(),
            user.getCompany() == null ? null : user.getCompany().getName()
        );
    }

    public record ProjectSummary(Long id, String name) {}

    @GetMapping("/projects")
    @Transactional(readOnly = true)
    public List<ProjectSummary> projects(JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        List<Project> available = user.getRole() == Role.ADMIN
            ? projects.findAll(Sort.by("name", "id"))
            : visibleProjects(user);
        return available.stream().map(project -> new ProjectSummary(project.getId(), project.getName())).toList();
    }

    private List<Project> visibleProjects(User user) {
        Map<Long, Project> available = new LinkedHashMap<>();
        if (user.getCompany() != null) {
            projects.findByCompany_Id(user.getCompany().getId()).forEach(project -> available.put(project.getId(), project));
        }
        memberships.findProjectsByUserId(user.getId()).forEach(project -> available.put(project.getId(), project));
        return new ArrayList<>(available.values()).stream()
            .sorted(Comparator.comparing(Project::getName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(Project::getId))
            .toList();
    }

    private User currentUser(JwtAuthenticationToken authentication) {
        return users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
