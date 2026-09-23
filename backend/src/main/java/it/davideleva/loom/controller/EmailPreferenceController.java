package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUser;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ProjectRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/preferences/email")
@Transactional
@RequiredArgsConstructor
public class EmailPreferenceController {
    private final UserRepository users;
    private final ProjectRepository projects;
    private final ProjectUserRepository memberships;

    public record ProjectPreference(Long projectId, String projectName, Boolean wantEmail) {}
    public record Output(Boolean globalWantEmail, List<ProjectPreference> projects) {}
    public record Input(Boolean globalWantEmail, List<ProjectPreferenceInput> projects) {}
    public record ProjectPreferenceInput(Long projectId, Boolean wantEmail) {}

    @GetMapping
    @Transactional(readOnly = true)
    public Output get(JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        return output(user);
    }

    @PutMapping
    public Output update(@RequestBody Input input, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        user.setWantEmail(input.globalWantEmail());
        Map<Long, Project> visible = visibleProjects(user).stream()
            .collect(LinkedHashMap::new, (map, project) -> map.put(project.getId(), project), Map::putAll);
        if (input.projects() != null) {
            for (ProjectPreferenceInput preference : input.projects()) {
                Project project = visible.get(preference.projectId());
                if (project == null) continue;
                ProjectUserId id = new ProjectUserId(project.getId(), user.getId());
                ProjectUser membership = memberships.findById(id).orElseGet(() -> memberships.save(new ProjectUser(project, user)));
                membership.setWantEmail(preference.wantEmail());
            }
        }
        return output(user);
    }

    private Output output(User user) {
        List<ProjectPreference> projectPreferences = visibleProjects(user).stream()
            .map(project -> new ProjectPreference(project.getId(), project.getName(),
                memberships.findById(new ProjectUserId(project.getId(), user.getId()))
                    .map(ProjectUser::getWantEmail).orElse(null)))
            .toList();
        return new Output(user.getWantEmail(), projectPreferences);
    }

    private List<Project> visibleProjects(User user) {
        if (user.getRole() == Role.ADMIN) return projects.findAll(Sort.by("name", "id"));
        Map<Long, Project> available = new LinkedHashMap<>();
        if (user.getCompany() != null) {
            projects.findByCompany_Id(user.getCompany().getId()).forEach(project -> available.put(project.getId(), project));
        }
        memberships.findProjectsByUserId(user.getId()).forEach(project -> available.put(project.getId(), project));
        return new ArrayList<>(available.values()).stream()
            .sorted(Comparator.comparing(Project::getName, String.CASE_INSENSITIVE_ORDER).thenComparing(Project::getId))
            .toList();
    }

    private User currentUser(JwtAuthenticationToken authentication) {
        return users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
