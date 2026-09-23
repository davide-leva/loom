package it.davideleva.loom.auth;

import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ProjectRepository;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
public class AuthController {
    private final AuthService auth;
    private final UserRepository users;
    private final ProjectRepository projects;
    private final ProjectUserRepository memberships;
    private final CompanyRepository companies;
    private final ExternalAuthService externalAuth;

    public AuthController(AuthService auth, UserRepository users, ProjectRepository projects,
                          ProjectUserRepository memberships, CompanyRepository companies, ExternalAuthService externalAuth) {
        this.auth = auth;
        this.users = users;
        this.projects = projects;
        this.memberships = memberships;
        this.companies = companies;
        this.externalAuth = externalAuth;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = auth.login(request);
        log.info("Login succeeded: username={}", request.username());
        return response;
    }

    public record ExternalLoginRequest(String token) {}

    @PostMapping("/external-login")
    public ExternalAuthService.ExternalLoginResponse externalLogin(@RequestBody ExternalLoginRequest request) {
        ExternalAuthService.ExternalLoginResponse response = externalAuth.login(request.token());
        log.info("External login succeeded: project={}", response.projectId());
        return response;
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    public MeResponse me(JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        log.debug("Current user loaded: user={}", user.getId());
        Company company = user.getCompany();
        Company internal = companies.findFirstByTeamCompanyTrue().orElse(null);
        String displayName = "%s %s".formatted(user.getLastName(), user.getFirstName());

        return new MeResponse(
            user.getId(), user.getUsername(), displayName, user.getEmail(), user.getRole().name(),
            company == null ? null : company.getName(),
            company == null ? null : company.getId(),
            company == null ? "blue" : company.getPrimaryColor(),
            company == null || company.getLogoExtension() == null ? null
                : "/api/branding/companies/" + company.getId() + "/logo",
            internal == null ? null : internal.getName(),
            internal == null || internal.getLogoExtension() == null ? null
                : "/api/branding/companies/" + internal.getId() + "/logo"
        );
    }

    public record ProjectSummary(Long id, String name, String logoUrl) {}

    @GetMapping("/projects")
    @Transactional(readOnly = true)
    public List<ProjectSummary> projects(JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        log.debug("Projects listed for user={}", user.getId());
        List<Project> available = user.getRole() == Role.ADMIN
            ? projects.findAll(Sort.by("name", "id"))
            : visibleProjects(user);
        Number externalProjectId = authentication.getToken().getClaim("external_project_id");
        if (externalProjectId != null) {
            available = available.stream()
                .filter(project -> project.getId() == externalProjectId.longValue())
                .toList();
        }
        return available.stream().map(project -> new ProjectSummary(project.getId(), project.getName(),
            project.getLogoExtension() == null ? null
                : "/api/branding/projects/" + project.getId() + "/logo")).toList();
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
