package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Company;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.CompanyRepository;
import it.sf2.tickets.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/setup")
@Transactional
@RequiredArgsConstructor
public class SetupController {
    private final UserRepository users;
    private final CompanyRepository companies;
    private final PasswordEncoder passwords;

    public record Status(boolean required) {}
    public record Input(
        @NotBlank @Size(max = 64) String teamCompanyName,
        @NotBlank @Size(max = 64) String username,
        @NotBlank @Email @Size(max = 128) String email,
        @NotBlank @Size(min = 12) String password,
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
        if (users.count() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Setup already completed");
        }
        Company company = companies.save(new Company(input.teamCompanyName().trim(), true));
        User admin = new User(input.username().trim().toLowerCase(Locale.ROOT),
            input.email().trim().toLowerCase(Locale.ROOT), passwords.encode(input.password()), Role.ADMIN, company);
        admin.setFirstName(input.firstName());
        admin.setLastName(input.lastName());
        users.save(admin);
    }
}
