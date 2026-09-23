package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueFieldOptionTest {

    private static IssueFieldDefinition newDefinition() {
        Project project = new Project("Apollo", new Company("Acme"));
        return new IssueFieldDefinition(project, "ABC", "Label", FieldType.SELECT);
    }

    @Test
    void newOptionIsActiveByDefault() {
        IssueFieldDefinition def = newDefinition();
        IssueFieldOption option = new IssueFieldOption(def, "VAL", "Value");
        assertTrue(option.isActive());
        assertEquals("VAL", option.getValue());
        assertEquals("Value", option.getLabel());
        assertEquals(def, option.getDefinition());
    }

    @Test
    void activeFlagCanBeToggled() {
        IssueFieldDefinition def = newDefinition();
        IssueFieldOption option = new IssueFieldOption(def, "VAL", "Value");
        assertTrue(option.isActive());

        option.setActive(false);
        assertEquals(false, option.isActive());

        option.setActive(true);
        assertTrue(option.isActive());
    }

    @Test
    void labelAndValueAreSettable() {
        IssueFieldDefinition def = newDefinition();
        IssueFieldOption option = new IssueFieldOption(def, "VAL", "Value");
        option.setValue("NEW");
        option.setLabel("New Label");
        assertEquals("NEW", option.getValue());
        assertEquals("New Label", option.getLabel());
    }

    @Test
    void idIsSettableViaReflection() {
        IssueFieldDefinition def = newDefinition();
        IssueFieldOption option = new IssueFieldOption(def, "VAL", "Value");
        ReflectionTestUtils.setField(option, "id", 8L);
        assertEquals(8L, option.getId());
    }

    @Test
    void lombokEqualsAndHashCodeDistinguishDifferentOptions() {
        IssueFieldDefinition def = newDefinition();
        IssueFieldOption a = new IssueFieldOption(def, "A", "A");
        IssueFieldOption b = new IssueFieldOption(def, "B", "B");
        assertEquals(a, a);
        assertEquals(a.hashCode(), a.hashCode());
        assertNotEquals(a, b);
    }
}
