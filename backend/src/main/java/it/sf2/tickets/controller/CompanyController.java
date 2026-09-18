package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Company;
import it.sf2.tickets.repository.CompanyRepository;
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
@RequestMapping("/api/companies")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class CompanyController {
    private final CompanyRepository companies;
    private final ApiLookup lookup;

    public record Input(@NotBlank @Size(max = 64) String name) {}
    public record Output(Long id, String name, boolean teamCompany) {}

    @GetMapping
    public List<Output> getAll() {
        return companies.findAll().stream().map(CompanyController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.company(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Input input) {
        return output(companies.save(new Company(input.name())));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Input input) {
        Company company = lookup.company(id);
        company.setName(input.name());
        return output(company);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        Company company = lookup.company(id);
        if (company.isTeamCompany()) {
            throw ApiLookup.conflict("Team company cannot be deleted");
        }
        companies.delete(company);
    }

    private static Output output(Company company) {
        return new Output(company.getId(), company.getName(), company.isTeamCompany());
    }
}
