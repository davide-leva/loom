package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void dataIntegrityViolationReturnsConflictWithoutBody() {
        DataIntegrityViolationException exception =
            new DataIntegrityViolationException("unique constraint violated");

        ResponseEntity<Void> response = handler.conflict(exception, request());

        assertNotNull(response);
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNull(response.getBody());
    }

    @Test
    void dataIntegrityViolationWithNestedCauseIsHandled() {
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
            "constraint", new IllegalStateException("duplicate key"));

        ResponseEntity<Void> response = handler.conflict(exception, request());

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertNull(response.getBody());
    }

    private MockHttpServletRequest request() {
        return new MockHttpServletRequest("POST", "/api/test");
    }
}
