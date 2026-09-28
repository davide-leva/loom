package it.davideleva.loom.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

class SecurityConfigTest {
    private final SecurityConfig config = new SecurityConfig();

    @Test
    void corsAllowsLocalhostOnAnyDevelopmentPort() {
        CorsConfiguration configuration = corsConfiguration(
            config.corsConfigurationSource("", "http://localhost:*,http://127.0.0.1:*")
        );

        assertEquals("http://localhost:4300", configuration.checkOrigin("http://localhost:4300"));
        assertEquals("http://127.0.0.1:5173", configuration.checkOrigin("http://127.0.0.1:5173"));
    }

    @Test
    void corsAllowsConfiguredProductionOrigins() {
        CorsConfiguration configuration = corsConfiguration(
            config.corsConfigurationSource("https://loom.example.com", "")
        );

        assertEquals("https://loom.example.com", configuration.checkOrigin("https://loom.example.com"));
        assertNull(configuration.checkOrigin("https://other.example.com"));
    }

    private CorsConfiguration corsConfiguration(CorsConfigurationSource source) {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/auth/login");
        request.addHeader("Origin", "https://loom.example.com");
        request.addHeader("Access-Control-Request-Method", "POST");

        CorsConfiguration configuration = source.getCorsConfiguration((HttpServletRequest) request);
        assertNotNull(configuration);
        return configuration;
    }
}
