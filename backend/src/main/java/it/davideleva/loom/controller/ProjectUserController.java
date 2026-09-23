package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUser;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ProjectUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/project-users")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class ProjectUserController {
    private final ProjectUserRepository memberships;
    private final ApiLookup lookup;

    public record Input(@NotNull Long projectId, @NotNull Long userId, Boolean wantEmail) {}
    public record Update(Boolean wantEmail) {}
    public record Output(Long projectId, Long userId, Boolean wantEmail) {}

    @GetMapping
    public List<Output> getAll() {
        return memberships.findAll().stream().map(ProjectUserController::output).toList();
    }

    @GetMapping("/{projectId}/{userId}")
    public Output getById(@PathVariable Long projectId, @PathVariable Long userId) {
        return output(lookup.membership(projectId, userId));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return memberships.findByProject_Id(projectId).stream().map(ProjectUserController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Input input) {
        Project project = lookup.project(input.projectId());
        User user = lookup.user(input.userId());
        if (ProjectMembershipPolicy.isAutomaticCompanyMember(project, user)) {
            throw ApiLookup.badRequest("Company users belong to linked projects automatically");
        }
        ProjectUserId id = new ProjectUserId(input.projectId(), input.userId());
        if (memberships.existsById(id)) throw ApiLookup.conflict("Project membership already exists");
        ProjectUser membership = new ProjectUser(project, user);
        membership.setWantEmail(input.wantEmail());
        return output(memberships.save(membership));
    }

    @PutMapping("/{projectId}/{userId}")
    public Output update(@PathVariable Long projectId, @PathVariable Long userId,
                         @Valid @RequestBody Update input) {
        rejectAutomaticMembership(projectId, userId);
        ProjectUser membership = lookup.membership(projectId, userId);
        membership.setWantEmail(input.wantEmail());
        return output(membership);
    }

    @DeleteMapping("/{projectId}/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long projectId, @PathVariable Long userId) {
        rejectAutomaticMembership(projectId, userId);
        memberships.delete(lookup.membership(projectId, userId));
    }

    private void rejectAutomaticMembership(Long projectId, Long userId) {
        Project project = lookup.project(projectId);
        User user = lookup.user(userId);
        if (ProjectMembershipPolicy.isAutomaticCompanyMember(project, user)) {
            throw ApiLookup.conflict("Company membership cannot be changed individually");
        }
    }

    private static Output output(ProjectUser membership) {
        return new Output(membership.getId().getProjectId(),
            membership.getId().getUserId(), membership.getWantEmail());
    }
}
