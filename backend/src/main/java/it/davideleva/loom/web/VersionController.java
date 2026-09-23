package it.davideleva.loom.web;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes build / version info. Public endpoint — used by the frontend
 * header badge and by external monitoring scripts.
 */
@RestController
public class VersionController {

    private final String version;
    private final String commit;
    private final String buildTime;
    private final String apiVersion;
    private final String environment;

    public VersionController(
            @Value("${app.version.value:dev}") String version,
            @Value("${app.version.commit:local}") String commit,
            @Value("${app.version.build-time:local}") String buildTime,
            @Value("${app.version.api:v1}") String apiVersion) {
        this.version = version;
        this.commit = commit;
        this.buildTime = buildTime;
        this.apiVersion = apiVersion;
        this.environment = "dev".equals(version) ? "dev" : "production";
    }

    @GetMapping("/api/version")
    public VersionInfo version() {
        return new VersionInfo(version, commit, formatBuildTime(buildTime), environment, apiVersion);
    }

    private static String formatBuildTime(String raw) {
        if ("local".equals(raw) || "unknown".equals(raw) || raw.isBlank()) {
            return raw;
        }
        try {
            Instant instant = Instant.parse(raw);
            return DateTimeFormatter.ISO_INSTANT.format(instant);
        } catch (Exception e) {
            return raw;
        }
    }

    public record VersionInfo(
            String version,
            String commit,
            String buildTime,
            String environment,
            String api) {}
}
