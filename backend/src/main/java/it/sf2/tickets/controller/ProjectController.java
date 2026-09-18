package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.repository.ProjectRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
@RequestMapping("/api/projects")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class ProjectController {
    private static final List<Role> COMPANY_ROLES = List.of(Role.USER, Role.SUPERUSER);

    private final ProjectRepository projects;
    private final ProjectUserRepository memberships;
    private final ApiLookup lookup;

    public record Input(@NotBlank @Size(max = 32) String name, Long companyId) {}
    public record Output(Long id, String name, Long companyId) {}

    @GetMapping
    public List<Output> getAll() {
        return projects.findAll().stream().map(ProjectController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.project(id));
    }

    @GetMapping("/company/{companyId}")
    public List<Output> getByCompany(@PathVariable Long companyId) {
        lookup.company(companyId);
        return projects.findByCompany_Id(companyId).stream().map(ProjectController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Input input) {
        return output(projects.save(new Project(input.name(),
            input.companyId() == null ? null : lookup.company(input.companyId()))));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Input input) {
        Project project = lookup.project(id);
        Long oldCompanyId = project.getCompany() == null ? null : project.getCompany().getId();
        Long newCompanyId = input.companyId();
        deleteAutomaticRows(project.getId(), oldCompanyId);
        project.setName(input.name());
        project.setCompany(newCompanyId == null ? null : lookup.company(newCompanyId));
        deleteAutomaticRows(project.getId(), newCompanyId);
        return output(project);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        projects.delete(lookup.project(id));
    }

    private static Output output(Project project) {
        return new Output(project.getId(), project.getName(),
            project.getCompany() == null ? null : project.getCompany().getId());
    }

    private void deleteAutomaticRows(Long projectId, Long companyId) {
        if (companyId != null) {
            memberships.deleteCompanyUserMemberships(projectId, companyId, COMPANY_ROLES);
        }
    }
}
