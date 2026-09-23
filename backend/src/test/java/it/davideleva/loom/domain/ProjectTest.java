package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ProjectTest {

    @Test
    void constructorPopulatesNameAndCompany() {
        Company company = new Company("Acme");
        Project project = new Project("Apollo", company);

        assertEquals("Apollo", project.getName());
        assertEquals(company, project.getCompany());
        assertFalse(project.isExternalAuthEnabled());
        assertNull(project.getArchiveAfterDays());
        assertNull(project.getLogoExtension());
    }

    @Test
    void externalAuthEnabledRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        assertFalse(project.isExternalAuthEnabled());
        project.setExternalAuthEnabled(true);
        assertTrue(project.isExternalAuthEnabled());
    }

    @Test
    void archiveAfterDaysRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        assertNull(project.getArchiveAfterDays());

        project.setArchiveAfterDays(30);
        assertEquals(30, project.getArchiveAfterDays());
    }

    @Test
    void logoExtensionRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        project.setLogoExtension("png");
        assertEquals("png", project.getLogoExtension());
    }

    @Test
    void idIsSettableViaReflection() {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", 123L);
        assertEquals(123L, project.getId());
    }

    @Test
    void externalJwtSecretsListDefaultsToEmpty() {
        Project project = new Project("Apollo", new Company("Acme"));
        assertNotNull(project.getExternalJwtSecrets());
        assertTrue(project.getExternalJwtSecrets().isEmpty());
    }

    @Test
    void setterMutationsAreIndependent() {
        Project project = new Project("Apollo", new Company("Acme"));
        project.setName("Gemini");
        project.setCompany(new Company("Other"));
        project.setExternalAuthEnabled(true);
        project.setArchiveAfterDays(7);
        project.setLogoExtension("svg");

        assertEquals("Gemini", project.getName());
        assertEquals("Other", project.getCompany().getName());
        assertTrue(project.isExternalAuthEnabled());
        assertEquals(7, project.getArchiveAfterDays());
        assertEquals("svg", project.getLogoExtension());
    }
}
