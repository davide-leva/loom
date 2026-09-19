package it.sf2.tickets.auth;

import it.sf2.tickets.controller.ProjectMembershipPolicy;
import it.sf2.tickets.domain.ExternalJwtSecret;
import it.sf2.tickets.domain.ExternalJwtSubjectMapping;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.ExternalJwtSecretRepository;
import it.sf2.tickets.repository.ExternalJwtSubjectMappingRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ExternalAuthService {
    private final ExternalJwtSecretRepository secrets;
    private final ExternalJwtSubjectMappingRepository mappings;
    private final ProjectUserRepository memberships;
    private final ExternalSecretCipher cipher;
    private final AuthService auth;

    public ExternalAuthService(ExternalJwtSecretRepository secrets,
                               ExternalJwtSubjectMappingRepository mappings,
                               ProjectUserRepository memberships, ExternalSecretCipher cipher, AuthService auth) {
        this.secrets = secrets;
        this.mappings = mappings;
        this.memberships = memberships;
        this.cipher = cipher;
        this.auth = auth;
    }

    public record ExternalLoginResponse(LoginResponse session, Long projectId) {}

    @Transactional(readOnly = true)
    public ExternalLoginResponse login(String token) {
        if (token == null || token.length() > 8192 || !token.matches("[^\\s.]+\\.[^\\s.]+\\.[^\\s.]+")) {
            throw invalid();
        }
        ExternalJwtSubjectMapping match = null;
        for (ExternalJwtSecret secret : secrets.findByProject_ExternalAuthEnabledTrue()) {
            Jwt jwt;
            try {
                String plainSecret = cipher.decrypt(secret.getEncryptedSecret());
                byte[] keyBytes = secret.isSecretBase64()
                    ? Base64.getDecoder().decode(plainSecret)
                    : plainSecret.getBytes(StandardCharsets.UTF_8);
                MacAlgorithm algorithm = MacAlgorithm.from(secret.getAlgorithm());
                jwt = NimbusJwtDecoder.withSecretKey(
                    new SecretKeySpec(keyBytes, "HmacSHA" + secret.getAlgorithm().substring(2)))
                    .macAlgorithm(algorithm).build().decode(token);
            } catch (JwtException | IllegalStateException | IllegalArgumentException exception) {
                continue;
            }
            if (jwt.getExpiresAt() == null || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
                continue;
            }
            var mapping = mappings.findBySecret_IdAndSubject(secret.getId(), jwt.getSubject());
            if (mapping.isPresent()) {
                if (match != null) throw invalid();
                match = mapping.get();
            }
        }
        if (match == null) throw invalid();
        User user = match.getUser();
        var project = match.getSecret().getProject();
        boolean explicitMember = memberships.existsById(new ProjectUserId(project.getId(), user.getId()));
        try {
            ProjectMembershipPolicy.requireParticipant(project, user, explicitMember);
        } catch (ResponseStatusException exception) {
            throw invalid();
        }
        return new ExternalLoginResponse(auth.issueToken(user, project.getId()), project.getId());
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid external token");
    }
}
