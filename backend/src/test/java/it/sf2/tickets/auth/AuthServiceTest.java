package it.sf2.tickets.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.UserRepository;
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
}
