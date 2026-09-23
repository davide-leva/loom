package it.davideleva.loom.archive;

import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.notification.EventService;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.ProjectRepository;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Periodically scans every project that has {@code archiveAfterDays} configured and archives
 * any RELEASED issues whose {@code releasedAt} is older than that threshold. The check runs
 * once at startup and then every {@code app.archive.check-interval} (default: 60m).
 */
@Service
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app.archive", name = "enabled",
    havingValue = "true", matchIfMissing = true)
public class ArchiveScheduler {
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final EventService eventService;

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        archiveReleasedIssues();
    }

    @Scheduled(fixedDelayString = "${app.archive.check-interval:60m}",
               initialDelayString = "${app.archive.check-interval:60m}")
    @Transactional
    public void archiveReleasedIssues() {
        Instant now = Instant.now();
        int totalArchived = 0;
        for (Project project : projects.findAutoArchiveProjects()) {
            Integer days = project.getArchiveAfterDays();
            if (days == null || days <= 0) continue;
            Instant threshold = now.minus(Duration.ofDays(days));
            for (Issue issue : issues.findArchivable(threshold)) {
                // Safety: the scheduler query is global, so make sure the issue belongs to the
                // project we are iterating. (They should always match because the index and
                // predicate are aligned, but we don't want a malformed row to leak across.)
                if (!issue.getProject().getId().equals(project.getId())) continue;
                issue.markArchived(now);
                eventService.issueEvent(EventType.ISSUE_ARCHIVED, issue, null,
                    "Archiviata automaticamente dopo " + days + " giorni dal rilascio.");
                totalArchived++;
            }
        }
        if (totalArchived > 0) {
            log.info("Auto-archive scan completed: archived={}", totalArchived);
        } else {
            log.debug("Auto-archive scan completed: nothing to archive");
        }
    }
}
