package it.davideleva.loom.controller;

import it.davideleva.loom.logging.SqlTraceInspector;
import jakarta.persistence.PersistenceException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.JDBCException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class ApiExceptionHandler {
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Void> conflict(DataIntegrityViolationException exception, HttpServletRequest request) {
        logDatabaseException("Database constraint violation", exception, request, false);
        return ResponseEntity.status(HttpStatus.CONFLICT).build();
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Void> databaseError(DataAccessException exception, HttpServletRequest request) {
        logDatabaseException("Database access failed", exception, request, true);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    @ExceptionHandler(PersistenceException.class)
    public ResponseEntity<Void> persistenceError(PersistenceException exception, HttpServletRequest request) {
        logDatabaseException("Persistence operation failed", exception, request, true);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    private void logDatabaseException(String message, Exception exception, HttpServletRequest request, boolean withStackTrace) {
        String sql = sqlFrom(exception);
        Object[] args = {
            message, request == null ? "n/a" : request.getMethod(), request == null ? "n/a" : request.getRequestURI(),
            rootMessage(exception), sql == null ? "n/a" : sql
        };
        if (withStackTrace) {
            log.error("{}: method={} path={} cause={} sql={}", args[0], args[1], args[2], args[3], args[4], exception);
        } else {
            log.warn("{}: method={} path={} cause={} sql={}", args);
        }
        SqlTraceInspector.clear();
    }

    private String sqlFrom(Throwable exception) {
        JDBCException jdbc = findCause(exception, JDBCException.class);
        if (jdbc != null && jdbc.getSQL() != null && !jdbc.getSQL().isBlank()) {
            return jdbc.getSQL();
        }
        return SqlTraceInspector.lastSql();
    }

    private String rootMessage(Throwable exception) {
        Throwable root = exception;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        String message = root.getMessage();
        return message == null || message.isBlank() ? root.getClass().getName() : message;
    }

    private <T extends Throwable> T findCause(Throwable exception, Class<T> type) {
        Throwable current = exception;
        while (current != null) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause();
        }
        return null;
    }
}
