package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ExternalJwtSubjectMappingTest {

    private static ExternalJwtSecret newSecret() {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", 1L);
        ExternalJwtSecret secret = new ExternalJwtSecret(project, "idp", "enc", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 11L);
        return secret;
    }

    @Test
    void constructorStoresSecretSubjectAndUser() {
        ExternalJwtSecret secret = newSecret();
        User user = new User("alice", "alice@example.com", "h", Role.USER, null);

        ExternalJwtSubjectMapping mapping = new ExternalJwtSubjectMapping(secret, "alice-sub", user);

        assertSame(secret, mapping.getSecret());
        assertEquals("alice-sub", mapping.getSubject());
        assertSame(user, mapping.getUser());
    }

    @Test
    void idIsSettableViaReflection() {
        ExternalJwtSecret secret = newSecret();
        User user = new User("alice", "alice@example.com", "h", Role.USER, null);
        ExternalJwtSubjectMapping mapping = new ExternalJwtSubjectMapping(secret, "sub", user);

        ReflectionTestUtils.setField(mapping, "id", 42L);
        assertEquals(42L, mapping.getId());
    }
}
