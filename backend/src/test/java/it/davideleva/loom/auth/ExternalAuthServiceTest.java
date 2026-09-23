package it.davideleva.loom.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.ExternalJwtSecret;
import it.davideleva.loom.domain.ExternalJwtSubjectMapping;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.ExternalJwtSecretRepository;
import it.davideleva.loom.repository.ExternalJwtSubjectMappingRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class ExternalAuthServiceTest {
    private static final String TEST_SECRET = "another-32-byte-secret-for-external-jwt-123";

    private final ExternalJwtSecretRepository secrets = mock(ExternalJwtSecretRepository.class);
    private final ExternalJwtSubjectMappingRepository mappings = mock(ExternalJwtSubjectMappingRepository.class);
    private final ProjectUserRepository memberships = mock(ProjectUserRepository.class);
    private final ExternalSecretCipher cipher = mock(ExternalSecretCipher.class);
    private final AuthService auth = mock(AuthService.class);

    private final ExternalAuthService service = new ExternalAuthService(
        secrets, mappings, memberships, cipher, auth);

    @Test
    void loginWithNullTokenThrows401() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(null));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginWithEmptyTokenThrows401() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(""));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginWithNonJwtStringThrows401() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login("not-a-jwt"));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginWithSpacesInTokenThrows401() {
        // 3 dot-separated parts, but the 3rd part contains whitespace → regex fails
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login("too.long.with many spaces"));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginWithNoConfiguredSecretsThrows401() throws Exception {
        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of());

        String token = makeToken(TEST_SECRET, "partner-42", Instant.now().plusSeconds(60));
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWithPlainUtf8SecretSucceeds() throws Exception {
        Company userCompany = new Company("Acme");
        ReflectionTestUtils.setField(userCompany, "id", 1L);
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 10L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, userCompany);
        ReflectionTestUtils.setField(user, "id", 42L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 7L);
        ExternalJwtSubjectMapping mapping = new ExternalJwtSubjectMapping(secret, "partner-42", user);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);
        when(mappings.findBySecret_IdAndSubject(7L, "partner-42")).thenReturn(Optional.of(mapping));
        when(memberships.existsById(new ProjectUserId(10L, 42L))).thenReturn(false);
        when(auth.issueToken(user, 10L)).thenReturn(new LoginResponse("jwt", "Bearer", 900));

        String token = makeToken(TEST_SECRET, "partner-42", Instant.now().plusSeconds(60));
        ExternalAuthService.ExternalLoginResponse response = service.login(token);

        assertEquals(10L, response.projectId());
        assertNotNull(response.session());
        assertEquals("jwt", response.session().accessToken());
        verify(auth, times(1)).issueToken(user, 10L);
    }

    @Test
    void loginWithBase64SecretSucceeds() throws Exception {
        Company userCompany = new Company("Acme");
        ReflectionTestUtils.setField(userCompany, "id", 1L);
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 11L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, userCompany);
        ReflectionTestUtils.setField(user, "id", 43L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Base64", "encrypted", "HS256", true);
        ReflectionTestUtils.setField(secret, "id", 8L);
        ExternalJwtSubjectMapping mapping = new ExternalJwtSubjectMapping(secret, "partner-99", user);

        // For base64 secrets the cipher returns base64-encoded bytes; the service decodes them
        // back to the original UTF-8 bytes that the JWT was signed with.
        String base64PlainSecret = java.util.Base64.getEncoder()
            .encodeToString(TEST_SECRET.getBytes(StandardCharsets.UTF_8));

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(base64PlainSecret);
        when(mappings.findBySecret_IdAndSubject(8L, "partner-99")).thenReturn(Optional.of(mapping));
        when(memberships.existsById(new ProjectUserId(11L, 43L))).thenReturn(false);
        when(auth.issueToken(user, 11L)).thenReturn(new LoginResponse("jwt", "Bearer", 900));

        String token = makeToken(TEST_SECRET, "partner-99", Instant.now().plusSeconds(60));
        ExternalAuthService.ExternalLoginResponse response = service.login(token);

        assertEquals(11L, response.projectId());
        verify(auth).issueToken(user, 11L);
    }

    @Test
    void loginWithMissingSubjectContinuesToNextSecretAndEventuallyFails() throws Exception {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 12L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 9L);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);

        // token WITHOUT subject
        String token = makeToken(TEST_SECRET, null, Instant.now().plusSeconds(60));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(mappings, never()).findBySecret_IdAndSubject(anyLong(), anyString());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWithBlankSubjectContinuesToNextSecretAndEventuallyFails() throws Exception {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 13L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 14L);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);

        // token with blank subject
        String token = makeToken(TEST_SECRET, "   ", Instant.now().plusSeconds(60));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(mappings, never()).findBySecret_IdAndSubject(anyLong(), anyString());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWithMissingExpiresAtContinuesToNextSecretAndEventuallyFails() throws Exception {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 14L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 15L);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);

        // token WITHOUT exp
        SignedJWT jwt = new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder()
                .subject("partner-42")
                .issueTime(Date.from(Instant.now().minusSeconds(60)))
                .build());
        jwt.sign(new MACSigner(TEST_SECRET.getBytes(StandardCharsets.UTF_8)));
        String token = jwt.serialize();

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(mappings, never()).findBySecret_IdAndSubject(anyLong(), anyString());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWithMissingMappingThrows401() throws Exception {
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 16L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 17L);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);
        when(mappings.findBySecret_IdAndSubject(17L, "partner-42")).thenReturn(Optional.empty());

        String token = makeToken(TEST_SECRET, "partner-42", Instant.now().plusSeconds(60));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWithAmbiguousTwoSecretsThrows401() throws Exception {
        Company userCompany = new Company("Acme");
        ReflectionTestUtils.setField(userCompany, "id", 1L);
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 18L);

        User user = new User("alice", "alice@example.com", "hash", Role.USER, userCompany);
        ReflectionTestUtils.setField(user, "id", 50L);

        // Two secrets that both produce valid mappings for the same subject
        ExternalJwtSecret secret1 = new ExternalJwtSecret(project, "Partner1", "encrypted1", "HS256", false);
        ReflectionTestUtils.setField(secret1, "id", 19L);
        ExternalJwtSecret secret2 = new ExternalJwtSecret(project, "Partner2", "encrypted2", "HS256", false);
        ReflectionTestUtils.setField(secret2, "id", 20L);

        ExternalJwtSubjectMapping mapping1 = new ExternalJwtSubjectMapping(secret1, "partner-42", user);
        ExternalJwtSubjectMapping mapping2 = new ExternalJwtSubjectMapping(secret2, "partner-42", user);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret1, secret2));
        when(cipher.decrypt("encrypted1")).thenReturn(TEST_SECRET);
        when(cipher.decrypt("encrypted2")).thenReturn(TEST_SECRET);
        when(mappings.findBySecret_IdAndSubject(19L, "partner-42")).thenReturn(Optional.of(mapping1));
        when(mappings.findBySecret_IdAndSubject(20L, "partner-42")).thenReturn(Optional.of(mapping2));

        String token = makeToken(TEST_SECRET, "partner-42", Instant.now().plusSeconds(60));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    @Test
    void loginWhenMembershipPolicyFailsThrows401() throws Exception {
        Company userCompany = new Company("Other");
        ReflectionTestUtils.setField(userCompany, "id", 99L);
        Company projectCompany = new Company("Acme");
        ReflectionTestUtils.setField(projectCompany, "id", 1L);

        Project project = new Project("Project", projectCompany);
        ReflectionTestUtils.setField(project, "id", 21L);

        // Non-ADMIN user in different company, no explicit membership
        User user = new User("alice", "alice@example.com", "hash", Role.USER, userCompany);
        ReflectionTestUtils.setField(user, "id", 51L);

        ExternalJwtSecret secret = new ExternalJwtSecret(project, "Partner", "encrypted", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 22L);
        ExternalJwtSubjectMapping mapping = new ExternalJwtSubjectMapping(secret, "partner-42", user);

        when(secrets.findByProject_ExternalAuthEnabledTrue()).thenReturn(List.of(secret));
        when(cipher.decrypt("encrypted")).thenReturn(TEST_SECRET);
        when(mappings.findBySecret_IdAndSubject(22L, "partner-42")).thenReturn(Optional.of(mapping));
        when(memberships.existsById(new ProjectUserId(21L, 51L))).thenReturn(false);

        String token = makeToken(TEST_SECRET, "partner-42", Instant.now().plusSeconds(60));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.login(token));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verify(auth, never()).issueToken(any(), anyLong());
    }

    // ----- helpers -----

    private static String makeToken(String secret, String subject, Instant expiresAt) throws Exception {
        JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder()
            .issueTime(Date.from(Instant.now().minusSeconds(60)));
        if (subject != null) builder.subject(subject);
        if (expiresAt != null) builder.expirationTime(Date.from(expiresAt));
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), builder.build());
        jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }
}
