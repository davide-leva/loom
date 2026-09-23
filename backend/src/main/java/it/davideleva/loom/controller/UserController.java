package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.UserRepository;
import it.davideleva.loom.repository.CompanyRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
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
@RequestMapping("/api/users")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class UserController {
    private final UserRepository users;
    private final CompanyRepository companies;
    private final PasswordEncoder passwords;
    private final ApiLookup lookup;

    public record Input(
        @Size(max = 32) String firstName,
        @Size(max = 32) String lastName,
        @NotNull Role role,
        Long companyId,
        @NotBlank @Size(max = 64) String username,
        @NotBlank @Email @Size(max = 128) String email,
        @Size(min = 8) String password,
        Boolean wantEmail
    ) {}

    public record Output(
        Long id, String firstName, String lastName, Role role,
        Long companyId, String username, String email, Boolean wantEmail
    ) {}

    @GetMapping
    public List<Output> getAll() {
        return users.findAll().stream().map(UserController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.user(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        var project = lookup.project(projectId);
        Map<Long, User> members = new LinkedHashMap<>();
        if (project.getCompany() != null) {
            users.findByCompany_Id(project.getCompany().getId()).forEach(user -> members.put(user.getId(), user));
        }
        users.findByProjectId(projectId).stream()
            .forEach(user -> members.put(user.getId(), user));
        return members.values().stream().sorted((a, b) -> a.getUsername().compareToIgnoreCase(b.getUsername()))
            .map(UserController::output).toList();
    }

    @GetMapping("/company/{companyId}")
    public List<Output> getByCompany(@PathVariable Long companyId) {
        lookup.company(companyId);
        return users.findByCompany_Id(companyId).stream().map(UserController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Input input) {
        if (input.password() == null || input.password().isBlank()) {
            throw ApiLookup.badRequest("Password is required");
        }
        User user = new User(normalize(input.username()), normalize(input.email()), passwords.encode(input.password()),
            input.role(), companyFor(input));
        user.setFirstName(input.firstName());
        user.setLastName(input.lastName());
        user.setWantEmail(input.wantEmail());
        return output(users.save(user));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Input input) {
        User user = lookup.user(id);
        user.setFirstName(input.firstName());
        user.setLastName(input.lastName());
        user.setRole(input.role());
        user.setCompany(companyFor(input));
        user.setEmail(normalize(input.email()));
        user.setUsername(normalize(input.username()));
        user.setWantEmail(input.wantEmail());
        if (input.password() != null) {
            if (input.password().isBlank()) throw ApiLookup.badRequest("Password cannot be blank");
            user.setPasswordHash(passwords.encode(input.password()));
        }
        return output(user);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        users.delete(lookup.user(id));
    }

    private Company companyFor(Input input) {
        if (input.role() == Role.TEAM || input.role() == Role.ADMIN) {
            return companies.findFirstByTeamCompanyTrue()
                .orElseThrow(() -> ApiLookup.badRequest("Team company is not configured"));
        }
        if (input.companyId() == null) {
            throw ApiLookup.badRequest("USER and SUPERUSER require companyId");
        }
        Company company = lookup.company(input.companyId());
        if (company.isTeamCompany()) {
            throw ApiLookup.badRequest("USER and SUPERUSER cannot belong to the team company");
        }
        return company;
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static Output output(User user) {
        return new Output(user.getId(), user.getFirstName(), user.getLastName(), user.getRole(),
            user.getCompany() == null ? null : user.getCompany().getId(),
            user.getUsername(), user.getEmail(), user.getWantEmail());
    }
}
