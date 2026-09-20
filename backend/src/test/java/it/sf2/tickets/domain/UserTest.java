package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class UserTest {

    @Test
    void constructorPopulatesAllCoreFields() {
        Company company = new Company("Acme");
        User user = new User("alice", "alice@example.com", "hash", Role.ADMIN, company);

        assertEquals("alice", user.getUsername());
        assertEquals("alice@example.com", user.getEmail());
        assertEquals("hash", user.getPasswordHash());
        assertEquals(Role.ADMIN, user.getRole());
        assertSame(company, user.getCompany());
    }

    @Test
    void optionalFieldsDefaultToNull() {
        User user = new User("bob", "bob@example.com", "h", Role.USER, null);
        assertNull(user.getFirstName());
        assertNull(user.getLastName());
        assertNull(user.getWantEmail());
    }

    @Test
    void idIsSettableViaReflection() {
        User user = new User("alice", "alice@example.com", "hash", Role.ADMIN, null);
        ReflectionTestUtils.setField(user, "id", 5L);
        assertEquals(5L, user.getId());
    }

    @Test
    void settersUpdateFields() {
        User user = new User("alice", "alice@example.com", "hash", Role.USER, null);
        user.setFirstName("Alice");
        user.setLastName("Smith");
        user.setUsername("alice2");
        user.setEmail("alice2@example.com");
        user.setPasswordHash("newhash");
        user.setRole(Role.TEAM);
        user.setWantEmail(true);

        assertEquals("Alice", user.getFirstName());
        assertEquals("Smith", user.getLastName());
        assertEquals("alice2", user.getUsername());
        assertEquals("alice2@example.com", user.getEmail());
        assertEquals("newhash", user.getPasswordHash());
        assertEquals(Role.TEAM, user.getRole());
        assertEquals(Boolean.TRUE, user.getWantEmail());
    }

    @Test
    void roleEnumSupportsAllValues() {
        for (Role role : Role.values()) {
            User user = new User("u", "u@example.com", "h", role, null);
            assertEquals(role, user.getRole());
        }
    }
}
