package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class IssueDataTest {

    @Test
    void constructorPopulatesAllFields() {
        IssueData data = new IssueData(10L, 20L, 30L, 1, "value-1");

        assertEquals(10L, data.getIssueId());
        assertEquals(20L, data.getProjectId());
        assertEquals(30L, data.getDefinitionId());
        assertEquals(1, data.getPosition());
        assertEquals("value-1", data.getValue());
    }

    @Test
    void mutableFieldsAreUpdatable() {
        IssueData data = new IssueData(10L, 20L, 30L, 1, "old");

        data.setPosition(2);
        data.setValue("new");

        assertEquals(2, data.getPosition());
        assertEquals("new", data.getValue());
    }

    @Test
    void idIsSettableViaReflection() {
        IssueData data = new IssueData(10L, 20L, 30L, 1, "v");
        ReflectionTestUtils.setField(data, "id", 99L);
        assertEquals(99L, data.getId());
    }
}
