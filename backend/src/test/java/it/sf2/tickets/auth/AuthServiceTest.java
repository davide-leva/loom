package it.sf2.tickets.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class AuthServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = new BCryptPasswordEncoder();
    private final SecretKey key = new SecretKeySpec(new byte[32], "HmacSHA256");
    private final AuthService auth = new AuthService(
        users, passwords, NimbusJwtEncoder.withSecretKey(key).build(), "sf2-tickets", 15
    );

    @Test
    void validCredentialsProduceVerifiableToken() {
        User user = new User("admin", "admin@example.com", passwords.encode("correct-password"), Role.ADMIN, null);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));

        LoginResponse response = auth.login(new LoginRequest(" ADMIN ", "correct-password"));
        Jwt jwt = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)
            .build().decode(response.accessToken());

        assertEquals("Bearer", response.tokenType());
        assertEquals(900, response.expiresInSeconds());
        assertEquals("42", jwt.getSubject());
        assertEquals("ADMIN", jwt.getClaimAsString("role"));
        assertEquals("admin", jwt.getClaimAsString("username"));
        assertEquals("admin@example.com", jwt.getClaimAsString("email"));
    }

    @Test
    void wrongPasswordIsRejected() {
        User user = new User("admin", "admin@example.com", passwords.encode("correct-password"), Role.ADMIN, null);
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> auth.login(new LoginRequest("admin", "wrong-password")));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginWithBlankUsernameStillFindsUser() {
        User user = new User("admin", "admin@example.com", passwords.encode("correct-password"), Role.ADMIN, null);
        ReflectionTestUtils.setField(user, "id", 7L);
        // Repository receives the trimmed + lowercased value.
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));

        LoginResponse response = auth.login(new LoginRequest("   admin   ", "correct-password"));

        Jwt jwt = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)
            .build().decode(response.accessToken());
        assertEquals("7", jwt.getSubject());
        assertEquals("admin", jwt.getClaimAsString("username"));
    }

    @Test
    void loginWithNonExistentUserThrows401() {
        when(users.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> auth.login(new LoginRequest("ghost", "any-password")));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }

    @Test
    void loginIsCaseInsensitive() {
        User user = new User("Admin", "admin@example.com", passwords.encode("correct-password"), Role.ADMIN, null);
        ReflectionTestUtils.setField(user, "id", 11L);
        // Repository receives lowercase-trimmed value (verified via mock matcher).
        when(users.findByUsernameIgnoreCase("admin")).thenReturn(Optional.of(user));

        LoginResponse response = auth.login(new LoginRequest("ADMIN", "correct-password"));
        Jwt jwt = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)
            .build().decode(response.accessToken());

        assertEquals("11", jwt.getSubject());
        assertEquals("Admin", jwt.getClaimAsString("username"));
    }

    @Test
    void issueTokenSetsExpectedClaims() {
        User user = new User("alice", "alice@example.com", "hash", Role.USER, null);
        ReflectionTestUtils.setField(user, "id", 99L);

        Instant before = Instant.now();
        LoginResponse response = auth.issueToken(user);
        Instant after = Instant.now();

        Jwt jwt = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)
            .build().decode(response.accessToken());

        assertEquals("99", jwt.getSubject());
        assertEquals("alice", jwt.getClaimAsString("username"));
        assertEquals("alice@example.com", jwt.getClaimAsString("email"));
        assertEquals("USER", jwt.getClaimAsString("role"));
        assertEquals("sf2-tickets", jwt.getClaimAsString("iss"));

        // expiresAt should be ~15 minutes in the future
        assertNotNull(jwt.getExpiresAt());
        long expectedLowerBound = before.plusSeconds(15 * 60 - 2).getEpochSecond();
        long expectedUpperBound = after.plusSeconds(15 * 60 + 2).getEpochSecond();
        long actual = jwt.getExpiresAt().getEpochSecond();
        assertTrue(actual >= expectedLowerBound && actual <= expectedUpperBound,
            "expiresAt should be approximately now+15min");

        // no external_project_id claim when not provided
        assertTrue(jwt.getClaim("external_project_id") == null);
    }

    @Test
    void issueTokenWithExternalProjectIdAddsClaim() {
        User user = new User("alice", "alice@example.com", "hash", Role.USER, null);
        ReflectionTestUtils.setField(user, "id", 12L);

        LoginResponse response = auth.issueToken(user, 555L);
        Jwt jwt = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256)
            .build().decode(response.accessToken());

        assertEquals("12", jwt.getSubject());
        assertEquals(555L, ((Number) jwt.getClaim("external_project_id")).longValue());
    }

    @Test
    void constructorRejectsNonPositiveTtl() {
        assertThrows(IllegalArgumentException.class,
            () -> new AuthService(users, passwords, NimbusJwtEncoder.withSecretKey(key).build(), "iss", 0));
        assertThrows(IllegalArgumentException.class,
            () -> new AuthService(users, passwords, NimbusJwtEncoder.withSecretKey(key).build(), "iss", -1));
    }
}
