package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ExternalJwtSecretTest {

    private static Project newProject() {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", 1L);
        return project;
    }

    @Test
    void constructorStoresAllFields() {
        Project project = newProject();
        ExternalJwtSecret secret = new ExternalJwtSecret(project, "My IdP", "encrypted", "HS512", true);

        assertEquals(project, secret.getProject());
        assertEquals("My IdP", secret.getName());
        assertEquals("encrypted", secret.getEncryptedSecret());
        assertEquals("HS512", secret.getAlgorithm());
        assertTrue(secret.isSecretBase64());
    }

    @Test
    void algorithmFieldAcceptsArbitraryString() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "idp", "enc", "RS256", false);
        assertEquals("RS256", secret.getAlgorithm());
    }

    @Test
    void updateChangesAllFieldsAndPreservesSecretWhenNull() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "old", "old-secret", "HS256", false);

        secret.update("new", "new-secret", "HS512", true);

        assertEquals("new", secret.getName());
        assertEquals("new-secret", secret.getEncryptedSecret());
        assertEquals("HS512", secret.getAlgorithm());
        assertTrue(secret.isSecretBase64());
    }

    @Test
    void updateWithNullSecretLeavesExistingSecretUntouched() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "idp", "keep-me", "HS256", false);

        secret.update("new-name", null, "HS512", true);

        assertEquals("new-name", secret.getName());
        assertEquals("keep-me", secret.getEncryptedSecret(), "encrypted secret must not be overwritten when null");
        assertEquals("HS512", secret.getAlgorithm());
        assertTrue(secret.isSecretBase64());
    }

    @Test
    void secretBase64RoundTrips() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "idp", "enc", "HS256", true);
        assertTrue(secret.isSecretBase64());
        ReflectionTestUtils.setField(secret, "secretBase64", false);
        assertFalse(secret.isSecretBase64());
    }

    @Test
    void idIsSettableViaReflection() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "idp", "enc", "HS256", false);
        ReflectionTestUtils.setField(secret, "id", 88L);
        assertEquals(88L, secret.getId());
    }

    @Test
    void mappingsListDefaultsToEmpty() {
        ExternalJwtSecret secret = new ExternalJwtSecret(newProject(), "idp", "enc", "HS256", false);
        assertTrue(secret.getMappings().isEmpty());
    }
}
