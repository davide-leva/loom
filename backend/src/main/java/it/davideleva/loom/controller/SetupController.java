package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/setup")
@Transactional
@RequiredArgsConstructor
public class SetupController {
    private final UserRepository users;
    private final CompanyRepository companies;
    private final PasswordEncoder passwords;
    private final BrandingService branding;

    public record Status(boolean required) {}
    public record Input(
        @NotBlank @Size(max = 64) String teamCompanyName,
        String primaryColor,
        @NotBlank @Size(max = 64) String username,
        @NotBlank @Email @Size(max = 128) String email,
        @NotBlank @Size(min = 8) String password,
        @Size(max = 32) String firstName,
        @Size(max = 32) String lastName
    ) {}

    @GetMapping("/status")
    public Status status() {
        return new Status(users.count() == 0);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public void setup(@Valid @RequestBody Input input) {
        create(input, null);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public void setupWithLogo(@Valid @RequestPart("input") Input input,
                              @RequestPart(value = "logo", required = false) MultipartFile logo) {
        create(input, logo);
    }

    private void create(Input input, MultipartFile logo) {
        if (users.count() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Setup already completed");
        }
        Company company = companies.save(new Company(input.teamCompanyName().trim(), true));
        company.setPrimaryColor(BrandingService.color(input.primaryColor()));
        if (logo != null && !logo.isEmpty()) {
            company.setLogoExtension(branding.saveLogo("companies", company.getId(), logo, null));
        }
        User admin = new User(input.username().trim().toLowerCase(Locale.ROOT),
            input.email().trim().toLowerCase(Locale.ROOT), passwords.encode(input.password()), Role.ADMIN, company);
        admin.setFirstName(input.firstName());
        admin.setLastName(input.lastName());
        users.save(admin);
    }
}
