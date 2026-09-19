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
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
    private final BrandingService branding;

    public record Input(@NotBlank @Size(max = 32) String name, Long companyId) {}
    public record Output(Long id, String name, Long companyId, String logoUrl) {}

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
        return create(input, null);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public Output insertWithLogo(@Valid @RequestPart("input") Input input,
                                 @RequestPart(value = "logo", required = false) MultipartFile logo) {
        return create(input, logo);
    }

    private Output create(Input input, MultipartFile logo) {
        Project project = projects.save(new Project(input.name().trim(),
            input.companyId() == null ? null : lookup.company(input.companyId())));
        if (logo != null && !logo.isEmpty()) {
            project.setLogoExtension(branding.saveLogo("projects", project.getId(), logo, null));
        }
        return output(project);
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Input input) {
        return modify(id, input, null);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Output updateWithLogo(@PathVariable Long id, @Valid @RequestPart("input") Input input,
                                 @RequestPart(value = "logo", required = false) MultipartFile logo) {
        return modify(id, input, logo);
    }

    private Output modify(Long id, Input input, MultipartFile logo) {
        Project project = lookup.project(id);
        Long oldCompanyId = project.getCompany() == null ? null : project.getCompany().getId();
        Long newCompanyId = input.companyId();
        deleteAutomaticRows(project.getId(), oldCompanyId);
        project.setName(input.name().trim());
        project.setCompany(newCompanyId == null ? null : lookup.company(newCompanyId));
        deleteAutomaticRows(project.getId(), newCompanyId);
        if (logo != null && !logo.isEmpty()) {
            project.setLogoExtension(branding.saveLogo("projects", id, logo, project.getLogoExtension()));
        }
        return output(project);
    }

    @DeleteMapping("/{id}/logo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLogo(@PathVariable Long id) {
        Project project = lookup.project(id);
        branding.deleteLogo("projects", id, project.getLogoExtension());
        project.setLogoExtension(null);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        Project project = lookup.project(id);
        branding.deleteLogo("projects", id, project.getLogoExtension());
        projects.delete(project);
    }

    private static Output output(Project project) {
        return new Output(project.getId(), project.getName(),
            project.getCompany() == null ? null : project.getCompany().getId(),
            project.getLogoExtension() == null ? null : "/api/branding/projects/" + project.getId() + "/logo");
    }

    private void deleteAutomaticRows(Long projectId, Long companyId) {
        if (companyId != null) {
            memberships.deleteCompanyUserMemberships(projectId, companyId, COMPANY_ROLES);
        }
    }
}
