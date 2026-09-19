package it.sf2.tickets.controller;

import it.sf2.tickets.auth.ExternalSecretCipher;
import it.sf2.tickets.domain.ExternalJwtSecret;
import it.sf2.tickets.domain.ExternalJwtSubjectMapping;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.ExternalJwtSecretRepository;
import it.sf2.tickets.repository.ExternalJwtSubjectMappingRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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
@RequestMapping("/api/external-auth/projects/{projectId}")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class ExternalAuthConfigController {
    private final ApiLookup lookup;
    private final ExternalJwtSecretRepository secrets;
    private final ExternalJwtSubjectMappingRepository mappings;
    private final ProjectUserRepository memberships;
    private final ExternalSecretCipher cipher;

    public record EnableInput(@NotNull Boolean enabled) {}
    public record SecretInput(@NotBlank @Size(max = 64) String name, @Size(max = 700) String secret,
                              String algorithm, Boolean secretBase64) {}
    public record MappingInput(@NotBlank @Size(max = 255) String subject, @NotNull Long userId) {}
    public record MappingOutput(Long id, String subject, Long userId, String username) {}
    public record SecretOutput(Long id, String name, String algorithm, boolean secretBase64,
                               int userCount, List<MappingOutput> mappings) {}
    public record ConfigOutput(Long projectId, boolean enabled, List<SecretOutput> secrets) {}

    @GetMapping
    @Transactional(readOnly = true)
    public ConfigOutput get(@PathVariable Long projectId) {
        Project project = lookup.project(projectId);
        return output(project);
    }

    @PutMapping
    public ConfigOutput setEnabled(@PathVariable Long projectId, @Valid @RequestBody EnableInput input) {
        Project project = lookup.project(projectId);
        project.setExternalAuthEnabled(input.enabled());
        return output(project);
    }

    @PostMapping("/secrets")
    @ResponseStatus(HttpStatus.CREATED)
    public ConfigOutput addSecret(@PathVariable Long projectId, @Valid @RequestBody SecretInput input) {
        Project project = lookup.project(projectId);
        String name = input.name().trim();
        if (name.isEmpty() || secrets.existsByProject_IdAndNameIgnoreCase(projectId, name)) {
            throw ApiLookup.conflict("Application name already exists");
        }
        String algorithm = algorithm(input.algorithm());
        boolean base64 = Boolean.TRUE.equals(input.secretBase64());
        validateSecret(input.secret(), algorithm, base64);
        secrets.save(new ExternalJwtSecret(project, name, cipher.encrypt(input.secret()), algorithm, base64));
        return output(project);
    }

    @PutMapping("/secrets/{secretId}")
    public ConfigOutput updateSecret(@PathVariable Long projectId, @PathVariable Long secretId,
                                     @Valid @RequestBody SecretInput input) {
        ExternalJwtSecret existing = secret(projectId, secretId);
        String name = input.name().trim();
        if (name.isEmpty() || (secrets.existsByProject_IdAndNameIgnoreCase(projectId, name)
            && !existing.getName().equalsIgnoreCase(name))) {
            throw ApiLookup.conflict("Application name already exists");
        }
        String algorithm = algorithm(input.algorithm());
        boolean base64 = Boolean.TRUE.equals(input.secretBase64());
        String plainSecret = input.secret() == null || input.secret().isEmpty()
            ? cipher.decrypt(existing.getEncryptedSecret()) : input.secret();
        validateSecret(plainSecret, algorithm, base64);
        existing.update(name, input.secret() == null || input.secret().isEmpty()
            ? null : cipher.encrypt(input.secret()), algorithm, base64);
        return output(existing.getProject());
    }

    @DeleteMapping("/secrets/{secretId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSecret(@PathVariable Long projectId, @PathVariable Long secretId) {
        secrets.delete(secret(projectId, secretId));
    }

    @PostMapping("/secrets/{secretId}/mappings")
    @ResponseStatus(HttpStatus.CREATED)
    public ConfigOutput addMapping(@PathVariable Long projectId, @PathVariable Long secretId,
                                   @Valid @RequestBody MappingInput input) {
        ExternalJwtSecret secret = secret(projectId, secretId);
        String subject = input.subject().trim();
        if (subject.isEmpty()) throw ApiLookup.badRequest("Subject is required");
        if (mappings.existsBySecret_IdAndSubject(secretId, subject)) {
            throw ApiLookup.conflict("Subject is already mapped for this secret");
        }
        User user = lookup.user(input.userId());
        boolean explicitMember = memberships.existsById(new ProjectUserId(projectId, user.getId()));
        ProjectMembershipPolicy.requireParticipant(secret.getProject(), user, explicitMember);
        mappings.save(new ExternalJwtSubjectMapping(secret, subject, user));
        return output(secret.getProject());
    }

    @DeleteMapping("/secrets/{secretId}/mappings/{mappingId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMapping(@PathVariable Long projectId, @PathVariable Long secretId,
                              @PathVariable Long mappingId) {
        secret(projectId, secretId);
        ExternalJwtSubjectMapping mapping = mappings.findById(mappingId)
            .orElseThrow(() -> ApiLookup.badRequest("Mapping not found"));
        if (!mapping.getSecret().getId().equals(secretId)) {
            throw ApiLookup.badRequest("Mapping does not belong to this secret");
        }
        mappings.delete(mapping);
    }

    private ExternalJwtSecret secret(Long projectId, Long secretId) {
        ExternalJwtSecret secret = secrets.findById(secretId)
            .orElseThrow(() -> ApiLookup.badRequest("Secret not found"));
        if (!secret.getProject().getId().equals(projectId)) {
            throw ApiLookup.badRequest("Secret does not belong to this project");
        }
        return secret;
    }

    private static String algorithm(String value) {
        String algorithm = value == null ? "HS256" : value;
        if (!algorithm.equals("HS256") && !algorithm.equals("HS384") && !algorithm.equals("HS512")) {
            throw ApiLookup.badRequest("Unsupported JWT algorithm");
        }
        return algorithm;
    }

    private static void validateSecret(String secret, String algorithm, boolean base64) {
        if (secret == null || secret.isBlank() || secret.length() > 700) {
            throw ApiLookup.badRequest("Secret is required and must be at most 700 characters");
        }
        byte[] bytes;
        try {
            bytes = base64 ? Base64.getDecoder().decode(secret) : secret.getBytes(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            throw ApiLookup.badRequest("Secret is not valid Base64");
        }
        int minimum = switch (algorithm) {
            case "HS384" -> 48;
            case "HS512" -> 64;
            default -> 32;
        };
        if (bytes.length < minimum || bytes.length > 512) {
            throw ApiLookup.badRequest("Decoded secret must contain " + minimum + " to 512 bytes");
        }
    }

    private ConfigOutput output(Project project) {
        List<SecretOutput> items = secrets.findByProject_IdOrderByNameAsc(project.getId()).stream()
            .map(secret -> {
                List<MappingOutput> subjects = mappings.findBySecret_IdOrderBySubjectAsc(secret.getId()).stream()
                    .map(mapping -> new MappingOutput(mapping.getId(), mapping.getSubject(),
                        mapping.getUser().getId(), mapping.getUser().getUsername()))
                    .toList();
                return new SecretOutput(secret.getId(), secret.getName(), secret.getAlgorithm(),
                    secret.isSecretBase64(), (int) subjects.stream().map(MappingOutput::userId).distinct().count(), subjects);
            })
            .toList();
        return new ConfigOutput(project.getId(), project.isExternalAuthEnabled(), items);
    }
}
