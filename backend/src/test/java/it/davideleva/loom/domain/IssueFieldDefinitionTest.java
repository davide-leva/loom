package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueFieldDefinitionTest {

    @Test
    void constructorPopulatesMandatoryFields() {
        Project project = new Project("Apollo", new Company("Acme"));
        ReflectionTestUtils.setField(project, "id", 1L);
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Description", FieldType.TEXT);

        assertEquals(project, def.getProject());
        assertEquals("ABC", def.getCode());
        assertEquals("Description", def.getLabel());
        assertEquals(FieldType.TEXT, def.getType());
        assertFalse(def.isMandatory());
        assertFalse(def.isMultiple());
        assertEquals(FieldScope.USER, def.getScope());
        assertNull(def.getDescription());
    }

    @Test
    void mandatoryFlagRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Description", FieldType.TEXT);
        assertFalse(def.isMandatory());
        def.setMandatory(true);
        assertTrue(def.isMandatory());
    }

    @Test
    void multipleFlagRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Description", FieldType.SELECT);
        assertFalse(def.isMultiple());
        def.setMultiple(true);
        assertTrue(def.isMultiple());
    }

    @Test
    void scopeCanBeChanged() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Description", FieldType.TEXT);
        assertEquals(FieldScope.USER, def.getScope());

        def.setScope(FieldScope.SUPERUSER);
        assertEquals(FieldScope.SUPERUSER, def.getScope());

        def.setScope(FieldScope.TEAM);
        assertEquals(FieldScope.TEAM, def.getScope());
    }

    @Test
    void descriptionRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Label", FieldType.TEXTAREA);
        def.setDescription("A long description");
        assertEquals("A long description", def.getDescription());
    }

    @Test
    void typeRoundTrips() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Label", FieldType.TEXT);
        def.setType(FieldType.NUMBER);
        assertEquals(FieldType.NUMBER, def.getType());
    }

    @Test
    void idIsSettableViaReflection() {
        Project project = new Project("Apollo", new Company("Acme"));
        IssueFieldDefinition def = new IssueFieldDefinition(project, "ABC", "Label", FieldType.TEXT);
        ReflectionTestUtils.setField(def, "id", 42L);
        assertEquals(42L, def.getId());
    }
}
