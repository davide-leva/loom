package it.davideleva.loom.controller;

import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/branding")
@RequiredArgsConstructor
public class BrandingController {
    private final BrandingService branding;
    private final CompanyRepository companies;
    private final ProjectRepository projects;

    public record InternalBrand(String name, String primaryColor, String logoUrl) {}

    @GetMapping("/internal")
    public InternalBrand internalBrand() {
        var company = companies.findFirstByTeamCompanyTrue().orElse(null);
        return company == null ? new InternalBrand("Loom", "blue", null)
            : new InternalBrand(company.getName(), company.getPrimaryColor(),
                company.getLogoExtension() == null ? null
                    : "/api/branding/companies/" + company.getId() + "/logo");
    }

    @GetMapping("/companies/{id}/logo")
    public ResponseEntity<Resource> companyLogo(@PathVariable Long id) {
        var company = companies.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Logo not found"));
        return branding.readLogo("companies", id, company.getLogoExtension());
    }

    @GetMapping("/projects/{id}/logo")
    public ResponseEntity<Resource> projectLogo(@PathVariable Long id) {
        var project = projects.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Logo not found"));
        return branding.readLogo("projects", id, project.getLogoExtension());
    }
}
