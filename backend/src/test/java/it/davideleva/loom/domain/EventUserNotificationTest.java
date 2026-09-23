package it.davideleva.loom.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class EventUserNotificationTest {

    private static Event newEvent(long id) {
        Event event = new Event(EventType.ISSUE_CREATED, "data",
            new Project("Apollo", new Company("Acme")),
            null,
            new User("actor", "actor@example.com", "h", Role.USER, null));
        ReflectionTestUtils.setField(event, "id", id);
        return event;
    }

    private static User newUser(long id) {
        User user = new User("user", "user@example.com", "h", Role.USER, null);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    void constructorBuildsCompositeIdFromEventAndUser() {
        Event event = newEvent(11L);
        User user = newUser(22L);

        EventUserNotification notification = new EventUserNotification(event, user);

        assertEquals(11L, notification.getId().getEventId());
        assertEquals(22L, notification.getId().getUserId());
        assertSame(event, notification.getEvent());
        assertSame(user, notification.getUser());
        assertFalse(notification.isNotified());
        assertNull(notification.getNotifiedAt());
    }

    @Test
    void notifiedFlagCanBeToggled() {
        EventUserNotification notification = new EventUserNotification(newEvent(1L), newUser(2L));
        assertFalse(notification.isNotified());

        notification.setNotified(true);
        assertEquals(true, notification.isNotified());
    }

    @Test
    void notifiedAtRoundTrips() {
        EventUserNotification notification = new EventUserNotification(newEvent(1L), newUser(2L));
        Instant at = Instant.parse("2026-05-01T10:00:00Z");
        notification.setNotifiedAt(at);
        assertEquals(at, notification.getNotifiedAt());
    }

    @Test
    void differentInstancesAreNotEqualBecauseEntityHasNoEqualsOverride() {
        EventUserNotification a = new EventUserNotification(newEvent(5L), newUser(6L));
        EventUserNotification b = new EventUserNotification(newEvent(5L), newUser(6L));
        EventUserNotification c = new EventUserNotification(newEvent(5L), newUser(7L));

        // The entity has no @EqualsAndHashCode, so equality defaults to identity equality.
        assertNotSame(a, b);
        assertNotEquals(a, b);
        assertNotEquals(a, c);
    }

    @Test
    void compositeIdEqualityIsDeterminedByEventIdAndUserId() {
        // The composite key itself is an @Embeddable with @EqualsAndHashCode,
        // so two keys with the same fields compare equal even though the
        // entity wrappers do not.
        EventUserNotificationId idA1 = new EventUserNotificationId(5L, 6L);
        EventUserNotificationId idA2 = new EventUserNotificationId(5L, 6L);
        EventUserNotificationId idB = new EventUserNotificationId(7L, 6L);

        assertEquals(idA1, idA2);
        assertEquals(idA1.hashCode(), idA2.hashCode());
        assertNotEquals(idA1, idB);
    }
}
