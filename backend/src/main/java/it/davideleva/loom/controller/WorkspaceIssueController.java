package it.davideleva.loom.controller;

import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.FieldScope;
import it.davideleva.loom.domain.FieldType;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueAttachment;
import it.davideleva.loom.domain.IssueComment;
import it.davideleva.loom.domain.IssueData;
import it.davideleva.loom.domain.IssueFieldDefinition;
import it.davideleva.loom.domain.IssueStatus;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.IssueAttachmentRepository;
import it.davideleva.loom.repository.IssueCommentRepository;
import it.davideleva.loom.repository.IssueDataRepository;
import it.davideleva.loom.repository.IssueFieldDefinitionRepository;
import it.davideleva.loom.repository.IssueFieldOptionRepository;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import it.davideleva.loom.notification.EventService;
import it.davideleva.loom.notification.IssueNotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.unit.DataSize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/work")
@Transactional
@Slf4j
public class WorkspaceIssueController {
    private final IssueRepository issues;
    private final IssueAttachmentRepository attachments;
    private final IssueCommentRepository comments;
    private final IssueDataRepository values;
    private final IssueFieldDefinitionRepository definitions;
    private final IssueFieldOptionRepository options;
    private final UserRepository users;
    private final ProjectUserRepository memberships;
    private final EventService eventService;
    private final IssueNotificationService issueNotifications;
    private final IssueReportService issueReports;
    private final ApiLookup lookup;
    private final Path attachmentsRoot;
    private final DataSize maxAttachmentSize;

    public WorkspaceIssueController(IssueRepository issues, IssueAttachmentRepository attachments,
                                    IssueCommentRepository comments, IssueDataRepository values,
                                    IssueFieldDefinitionRepository definitions, IssueFieldOptionRepository options,
                                    UserRepository users, ProjectUserRepository memberships, EventService eventService,
                                    IssueNotificationService issueNotifications,
                                    IssueReportService issueReports, ApiLookup lookup,
                                    @Value("${app.attachments.root-folder}") String attachmentsRootFolder,
                                    @Value("${app.attachments.max-file-size}") DataSize maxAttachmentSize) {
        this.issues = issues;
        this.attachments = attachments;
        this.comments = comments;
        this.values = values;
        this.definitions = definitions;
        this.options = options;
        this.users = users;
        this.memberships = memberships;
        this.eventService = eventService;
        this.issueNotifications = issueNotifications;
        this.issueReports = issueReports;
        this.lookup = lookup;
        this.attachmentsRoot = Paths.get(attachmentsRootFolder).toAbsolutePath().normalize();
        this.maxAttachmentSize = maxAttachmentSize;
    }

    public record IssueOutput(
        Long id, Long projectId, String title, String description, Instant createdAt,
        IssueStatus status, IssueType issueType, Instant releasedAt, Instant approvedAt,
        Long issuerUserId, String issuerUsername, Long devUserId, String devUsername,
        Long approveUserId, String approveUsername, boolean internal,
        Instant deletedAt, Instant archivedAt,
        Map<Long, List<String>> selectValues
    ) {}

    public record IdsPayload(@NotEmpty List<Long> ids) {}

    public record IssueDetail(IssueOutput issue, List<ValueOutput> values,
                              List<AttachmentOutput> attachments, List<CommentOutput> comments) {}
    public record ValueOutput(Long id, Long issueId, Long projectId, Long definitionId, String label,
                              int position, String value) {}
    public record AttachmentOutput(Long id, Long issueId, Long projectId, Long definitionId, String originalName,
                                   String contentType, long fileSize, Instant uploadedAt, Long userId, String username) {}
    public record CommentOutput(Long id, Long issueId, Long projectId, Long userId, String username,
                                Instant date, String comment, boolean canDelete) {}

    public record UserOutput(Long id, String username, String firstName, String lastName, Role role) {}

    public record FieldOutput(
        Long id, Long projectId, String code, String label, String description,
        boolean mandatory, boolean multiple, FieldType type, FieldScope scope, boolean hasValues
    ) {}

    public record FieldOptionOutput(Long id, Long definitionId, Long projectId, String value, String label, boolean active) {}

    public record StatusPatch(@NotNull IssueStatus status) {}

    public record CreateIssue(
        @NotNull Long projectId,
        @NotBlank @Size(max = 255) String title,
        @NotBlank String description,
        List<FieldValueInput> values,
        Boolean internal
    ) {}

    public record PlanningPatch(@NotNull IssueType issueType, Long devUserId) {}
    public record CreateComment(@NotBlank String comment) {}
    public record ValuesPatch(List<FieldValueInput> values) {}

    public record FieldValueInput(@NotNull Long definitionId, Integer position, @NotBlank String value) {}

    @GetMapping("/projects/{projectId}/issues")
    @Transactional(readOnly = true)
    public List<IssueOutput> issuesByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        User user = currentUser(authentication);
        requireVisibleProject(project, user);
        List<Issue> live = issues.findByProject_IdAndDeletedAtIsNullAndArchivedAtIsNull(projectId).stream()
            .filter(issue -> canSeeIssue(issue, user))
            .toList();
        Map<Long, Map<Long, List<String>>> selectValues = selectValuesFor(live, project, user);
        return live.stream()
            .map(issue -> issueOutput(issue, selectValues.getOrDefault(issue.getId(), Map.of())))
            .toList();
    }

    @GetMapping(value = "/projects/{projectId}/issues/report", produces = MediaType.APPLICATION_PDF_VALUE)
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> issueReport(
        @PathVariable Long projectId,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) IssueStatus status,
        @RequestParam(required = false) IssueType issueType,
        @RequestParam(defaultValue = "false") boolean uncategorized,
        @RequestParam(required = false) Long issuerId,
        @RequestParam(defaultValue = "false") boolean issuerUnassigned,
        @RequestParam(required = false) Long developerId,
        @RequestParam(defaultValue = "false") boolean developerUnassigned,
        @RequestParam(required = false) Boolean internal,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to,
        JwtAuthenticationToken authentication
    ) {
        Project project = lookup.project(projectId);
        User user = currentUser(authentication);
        requireVisibleProject(project, user);
        if (uncategorized && issueType != null
            || issuerUnassigned && issuerId != null
            || developerUnassigned && developerId != null
            || from != null && to != null && !from.isBefore(to)) {
            throw ApiLookup.badRequest("Invalid report filters");
        }

        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        List<Issue> filtered = issues.findByProject_Id(projectId).stream()
            .filter(issue -> canSeeIssue(issue, user))
            .filter(issue -> status == null || issue.getStatus() == status)
            .filter(issue -> issueType == null || issue.getIssueType() == issueType)
            .filter(issue -> !uncategorized || issue.getIssueType() == null)
            .filter(issue -> issuerId == null || issuerId.equals(id(issue.getIssuer())))
            .filter(issue -> !issuerUnassigned || issue.getIssuer() == null)
            .filter(issue -> developerId == null || developerId.equals(id(issue.getDeveloper())))
            .filter(issue -> !developerUnassigned || issue.getDeveloper() == null)
            .filter(issue -> internal == null || issue.isInternal() == internal)
            .filter(issue -> from == null || !issue.getCreatedAt().isBefore(from))
            .filter(issue -> to == null || issue.getCreatedAt().isBefore(to))
            .filter(issue -> normalizedSearch.isBlank() || reportSearchText(issue).contains(normalizedSearch))
            .sorted(Comparator.comparing(Issue::getCreatedAt).reversed()
                .thenComparing(Comparator.comparing(Issue::getId).reversed()))
            .toList();

        List<IssueReportService.Section> sections = buildReportSections(filtered);

        List<String> activeFilters = reportFilterLabels(search, status, issueType, uncategorized, issuerId,
            issuerUnassigned, developerId, developerUnassigned, internal, from, to);
        byte[] pdf = issueReports.generate(project.getName(), sections, activeFilters);
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"report-segnalazioni-" + projectId + ".pdf\"")
            .body(pdf);
    }


    /**
     * Groups the filtered issues into tipologia sections (Anomalia / Miglioria / Implementazione /
     * Non categorizzata), plus a dedicated "Rifiutati" section for soft-deleted issues. Archived
     * issues stay inside their own tipologia section so the reader sees the full breakdown.
     */
    private List<IssueReportService.Section> buildReportSections(List<Issue> filtered) {
        List<Issue> rejected = new ArrayList<>();
        Map<IssueType, List<Issue>> byType = new LinkedHashMap<>();
        byType.put(IssueType.ANOMALY, new ArrayList<>());
        byType.put(IssueType.IMPROVEMENT, new ArrayList<>());
        byType.put(IssueType.IMPLEMENTATION, new ArrayList<>());
        byType.put(null, new ArrayList<>());

        for (Issue issue : filtered) {
            if (issue.isDeleted()) {
                rejected.add(issue);
                continue;
            }
            byType.get(issue.getIssueType()).add(issue);
        }

        List<IssueReportService.Section> sections = new ArrayList<>();
        sections.add(new IssueReportService.Section("Anomalia", byType.get(IssueType.ANOMALY)));
        sections.add(new IssueReportService.Section("Miglioria", byType.get(IssueType.IMPROVEMENT)));
        sections.add(new IssueReportService.Section("Implementazione", byType.get(IssueType.IMPLEMENTATION)));
        sections.add(new IssueReportService.Section("Non categorizzata", byType.get(null)));
        if (!rejected.isEmpty()) sections.add(new IssueReportService.Section("Rifiutati", rejected));
        return sections;
    }


    @GetMapping("/issues/{issueId}")
    public IssueDetail issueDetail(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireExternalProject(authentication, issue.getProject().getId());
        requireVisibleProject(issue.getProject(), user);
        requireVisibleIssue(issue, user);
        issueNotifications.markSeen(issue, user);
        return new IssueDetail(issueOutput(issue),
            values.findByIssueId(issueId).stream()
                .flatMap(data -> definitions.findById(data.getDefinitionId()).stream()
                    .filter(definition -> canUseField(definition, user))
                    .map(definition -> valueOutput(data, definition.getLabel())))
                .toList(),
            attachments.findByIssue_IdOrderByUploadedAtAscIdAsc(issueId).stream()
                .filter(attachment -> attachment.getDefinition() == null || canUseField(attachment.getDefinition(), user))
                .map(WorkspaceIssueController::attachmentOutput).toList(),
            comments.findByIssue_IdOrderByDateAscIdAsc(issueId).stream().map(comment -> commentOutput(comment, user)).toList());
    }

    @GetMapping("/projects/{projectId}/users")
    @Transactional(readOnly = true)
    public List<UserOutput> usersByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        requireVisibleProject(project, currentUser(authentication));

        Map<Long, User> members = new LinkedHashMap<>();
        if (project.getCompany() != null) {
            users.findByCompany_Id(project.getCompany().getId()).forEach(user -> members.put(user.getId(), user));
        }
        users.findByProjectId(projectId).forEach(user -> members.put(user.getId(), user));
        return members.values().stream()
            .sorted((a, b) -> a.getUsername().compareToIgnoreCase(b.getUsername()))
            .map(WorkspaceIssueController::userOutput)
            .toList();
    }


    @GetMapping("/projects/{projectId}/fields")
    @Transactional(readOnly = true)
    public List<FieldOutput> fieldsByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        User user = currentUser(authentication);
        requireVisibleProject(project, user);
        return definitions.findByProject_Id(projectId).stream()
            .filter(definition -> canUseField(definition, user))
            .map(definition -> fieldOutput(definition, values.existsByDefinitionId(definition.getId())))
            .toList();
    }

    @GetMapping("/projects/{projectId}/field-options")
    @Transactional(readOnly = true)
    public List<FieldOptionOutput> fieldOptionsByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        User user = currentUser(authentication);
        requireVisibleProject(project, user);
        return options.findByDefinition_Project_Id(projectId).stream()
            .filter(option -> option.isActive() && canUseField(option.getDefinition(), user))
            .map(WorkspaceIssueController::fieldOptionOutput)
            .toList();
    }


    @PostMapping("/issues")
    @ResponseStatus(HttpStatus.CREATED)
    public IssueOutput createIssue(@Valid @RequestBody CreateIssue input, JwtAuthenticationToken authentication) {
        Project project = lookup.project(input.projectId());
        User reporter = currentUser(authentication);
        requireVisibleProject(project, reporter);

        Issue issue = new Issue(project, input.title().trim(), input.description().trim(), null);
        issue.setIssuer(reporter);
        issue.setInternal(isInternalUser(reporter) && Boolean.TRUE.equals(input.internal()));
        Issue saved = issues.save(issue);
        List<IssueData> initialValues = validatedValues(saved,
            input.values() == null ? List.of() : input.values(), writableScopesFor(reporter));
        values.saveAll(initialValues);
        String fields = fieldSnapshot(initialValues);
        eventService.issueEvent(EventType.ISSUE_CREATED, saved, reporter,
            "Titolo: " + saved.getTitle() + "\nDescrizione: " + saved.getDescription()
                + (fields.isBlank() ? "" : "\nCampi:\n" + fields));
        log.info("Issue created: project={} issue={} actor={} internal={}",
            project.getId(), saved.getId(), reporter.getId(), saved.isInternal());
        return issueOutput(saved);
    }

    @PatchMapping("/issues/{issueId}/values")
    public IssueDetail updateIssueValues(@PathVariable Long issueId, @Valid @RequestBody ValuesPatch input,
                                         JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        requireVisibleIssue(issue, user);
        Set<FieldScope> writableScopes = writableScopesFor(user);
        List<IssueFieldDefinition> writableFields = definitions.findByProject_Id(issue.getProject().getId()).stream()
            .filter(definition -> writableScopes.contains(definition.getScope()))
            .toList();
        List<Long> writableFieldIds = writableFields.stream().map(IssueFieldDefinition::getId).toList();
        List<IssueData> previousValues = values.findByIssueId(issueId).stream()
            .filter(value -> writableFieldIds.contains(value.getDefinitionId())).toList();
        List<IssueData> updatedValues = validatedValues(issue,
            input.values() == null ? List.of() : input.values(), writableScopes);
        List<IssueFieldDefinition> changedFields = changedFields(writableFields, previousValues, updatedValues);
        String changes = renderFieldChanges(changedFields, previousValues, updatedValues);
        Set<FieldScope> modifiedScopes = changedFields.stream()
            .map(IssueFieldDefinition::getScope)
            .collect(Collectors.toSet());
        if (!writableFieldIds.isEmpty()) {
            values.deleteByIssueIdAndDefinitionIdIn(issue.getId(), writableFieldIds);
        }
        values.saveAll(updatedValues);
        if (!changes.isBlank()) {
            eventService.issueEvent(EventType.ISSUE_VALUES_CHANGED, issue, user, changes, modifiedScopes);
            log.info("Issue values changed: project={} issue={} actor={} scopes={}",
                issue.getProject().getId(), issue.getId(), user.getId(), modifiedScopes);
        }
        return issueDetail(issueId, authentication);
    }

    @PostMapping(value = "/issues/{issueId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentOutput uploadAttachment(@PathVariable Long issueId, @RequestParam Long definitionId,
                                             @RequestParam MultipartFile file,
                                             JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        requireVisibleIssue(issue, user);
        IssueFieldDefinition definition = lookup.definition(definitionId);
        if (!definition.getProject().getId().equals(issue.getProject().getId())
            || !canUseField(definition, user) || definition.getType() != FieldType.ATTACHMENTS) {
            throw ApiLookup.badRequest("Attachment field is not available for this issue");
        }
        if (file.isEmpty()) throw ApiLookup.badRequest("Attachment file is empty");
        if (file.getSize() > maxAttachmentSize.toBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "Attachment exceeds maximum size of " + maxAttachmentSize);
        }
        String originalName = safeOriginalName(file.getOriginalFilename());
        String extension = extension(originalName);
        IssueAttachment attachment = attachments.save(new IssueAttachment(issue, definition, user, originalName,
            file.getContentType(), file.getSize(), extension));
        Path target = attachmentPath(issue, attachment);
        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target);
            attachment.setStoredPath(target.toString());
            eventService.issueEvent(EventType.ISSUE_ATTACHMENT_UPLOADED, issue, user,
                "File: " + originalName + "\nDimensione: " + file.getSize() + " byte");
            log.info("Issue attachment uploaded: project={} issue={} attachment={} actor={} size={}",
                issue.getProject().getId(), issue.getId(), attachment.getId(), user.getId(), file.getSize());
            return attachmentOutput(attachment);
        } catch (IOException exception) {
            attachments.delete(attachment);
            log.warn("Issue attachment upload failed: project={} issue={} actor={} file={} reason={}",
                issue.getProject().getId(), issue.getId(), user.getId(), originalName, exception.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Cannot store attachment", exception);
        }
    }

    @GetMapping("/attachments/{attachmentId}/download")
    @Transactional(readOnly = true)
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long attachmentId,
                                                       JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        IssueAttachment attachment = attachments.findById(attachmentId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        requireVisibleProject(attachment.getIssue().getProject(), user);
        requireVisibleIssue(attachment.getIssue(), user);
        if (attachment.getDefinition() != null && !canUseField(attachment.getDefinition(), user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Attachment not available");
        }
        try {
            Path path = Paths.get(attachment.getStoredPath()).normalize();
            Resource resource = new UrlResource(path.toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment file not found");
            }
            return ResponseEntity.ok()
                .contentType(attachment.getContentType() == null ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + attachment.getOriginalName().replace("\"", "") + "\"")
                .body(resource);
        } catch (MalformedURLException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment file not found", exception);
        }
    }

    @PostMapping("/issues/{issueId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public CommentOutput addComment(@PathVariable Long issueId, @Valid @RequestBody CreateComment input,
                                    JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        requireVisibleIssue(issue, user);
        IssueComment comment = comments.save(new IssueComment(issue, user, input.comment().trim()));
        eventService.issueEvent(EventType.ISSUE_COMMENT_ADDED, issue, user, "Commento:\n" + comment.getComment());
        log.info("Issue comment added: project={} issue={} comment={} actor={}",
            issue.getProject().getId(), issue.getId(), comment.getId(), user.getId());
        return commentOutput(comment, user);
    }

    @DeleteMapping("/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@PathVariable Long commentId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        IssueComment comment = lookup.comment(commentId);
        requireVisibleProject(comment.getIssue().getProject(), user);
        requireVisibleIssue(comment.getIssue(), user);
        boolean owner = comment.getUser() != null && comment.getUser().getId().equals(user.getId());
        boolean withinWindow = comment.getDate() != null
            && comment.getDate().plus(Duration.ofMinutes(10)).isAfter(Instant.now());
        if (!owner || !withinWindow) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Comment cannot be deleted");
        }
        comments.delete(comment);
        eventService.issueEvent(EventType.ISSUE_COMMENT_DELETED, comment.getIssue(), user,
            "Commento eliminato:\n" + comment.getComment());
        log.info("Issue comment deleted: project={} issue={} comment={} actor={}",
            comment.getIssue().getProject().getId(), comment.getIssue().getId(), comment.getId(), user.getId());
    }

    @PatchMapping("/issues/{issueId}/approval")
    public IssueOutput approveIssue(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        requireVisibleIssue(issue, user);
        return approve(issue, user);
    }

    private IssueOutput approve(Issue issue, User user) {
        boolean superuser = user.getRole() == Role.SUPERUSER;
        boolean adminOnInternal = user.getRole() == Role.ADMIN && issue.isInternal();
        if (!superuser && !adminOnInternal) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "SUPERUSER role required, or ADMIN for internal issues");
        }
        if (issue.getStatus() != IssueStatus.RELEASED) {
            throw ApiLookup.badRequest("Only released issues can be approved");
        }
        issue.setStatus(IssueStatus.APPROVED);
        issue.setApprovedAt(Instant.now());
        issue.setApprover(user);
        eventService.issueEvent(EventType.ISSUE_APPROVED, issue, user,
            "Stato: " + statusLabel(IssueStatus.RELEASED) + " → " + statusLabel(IssueStatus.APPROVED));
        return issueOutput(issue);
    }

    /**
     * Admin-only manual archive for approved issues. Distinct from the auto-archive scheduler
     * which only targets RELEASED issues that have aged past {@code archiveAfterDays}.
     */
    @PostMapping("/issues/{issueId}/archive")
    public IssueOutput archiveApprovedIssue(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        requireAdmin(user);
        Issue issue = lookup.issue(issueId);
        if (issue.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue deleted");
        }
        if (issue.isArchived()) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue already archived");
        }
        if (issue.getStatus() != IssueStatus.APPROVED) {
            throw ApiLookup.badRequest("Only approved issues can be manually archived");
        }
        issue.markArchived(Instant.now());
        issues.saveAndFlush(issue);
        eventService.issueEvent(EventType.ISSUE_ARCHIVED, issue, user,
            "Archiviata manualmente da " + user.getUsername() + ".");
        log.info("Issue manually archived: project={} issue={} actor={}",
            issue.getProject().getId(), issueId, user.getId());
        return issueOutput(issue);
    }

    @DeleteMapping("/issues/{issueId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteIssue(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        if (issue.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue already deleted");
        }
        if (issue.isArchived() && user.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue archived");
        }
        boolean admin = user.getRole() == Role.ADMIN;
        boolean reporter = issue.getIssuer() != null && issue.getIssuer().getId().equals(user.getId());
        boolean withinWindow = issue.getCreatedAt() != null
            && issue.getCreatedAt().plus(Duration.ofMinutes(10)).isAfter(Instant.now());
        if (!admin && (!reporter || !withinWindow)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Issue cannot be deleted");
        }
        issue.markDeleted(Instant.now());
        // Flush the soft-delete UPDATE before creating the Event entity, otherwise the Event's
        // cascade to Issue → IssueAttachment can see the issue as transient and fail.
        issues.saveAndFlush(issue);
        eventService.issueEvent(EventType.ISSUE_DELETED, issue, user,
            "Titolo: " + issue.getTitle() + "\nDescrizione: " + issue.getDescription());
        log.info("Issue soft-deleted: project={} issue={} actor={}", issue.getProject().getId(), issueId, user.getId());
    }

    /**
     * Admin-only listing of soft-deleted issues. Uses the same filter parameters as the live
     * issue list so the admin UI mirrors the normal table behaviour.
     */
    @GetMapping("/projects/{projectId}/issues/deleted")
    @Transactional(readOnly = true)
    public List<IssueOutput> deletedIssuesByProject(
        @PathVariable Long projectId,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) IssueStatus status,
        @RequestParam(required = false) IssueType issueType,
        @RequestParam(defaultValue = "false") boolean uncategorized,
        @RequestParam(required = false) Long issuerId,
        @RequestParam(defaultValue = "false") boolean issuerUnassigned,
        @RequestParam(required = false) Long developerId,
        @RequestParam(defaultValue = "false") boolean developerUnassigned,
        @RequestParam(required = false) Boolean internal,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to,
        JwtAuthenticationToken authentication
    ) {
        User user = currentUser(authentication);
        requireAdmin(user);
        Project project = lookup.project(projectId);
        requireVisibleProject(project, user);
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        List<Issue> list = issues.findByProject_IdAndDeletedAtIsNotNullOrderByDeletedAtDescIdDesc(projectId).stream()
            .filter(issue -> matches(issue, status, issueType, uncategorized, issuerId, issuerUnassigned,
                developerId, developerUnassigned, internal, from, to, normalizedSearch))
            .toList();
        Map<Long, Map<Long, List<String>>> selectValues = selectValuesFor(list, project, user);
        return list.stream()
            .map(issue -> issueOutput(issue, selectValues.getOrDefault(issue.getId(), Map.of())))
            .toList();
    }

    /**
     * Listing of archived issues. Visible to any role with project access (still respects
     * internal-visibility rules). Archived issues can be seen by everyone, so this endpoint
     * does not require admin.
     */
    @GetMapping("/projects/{projectId}/issues/archived")
    @Transactional(readOnly = true)
    public List<IssueOutput> archivedIssuesByProject(
        @PathVariable Long projectId,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) IssueStatus status,
        @RequestParam(required = false) IssueType issueType,
        @RequestParam(defaultValue = "false") boolean uncategorized,
        @RequestParam(required = false) Long issuerId,
        @RequestParam(defaultValue = "false") boolean issuerUnassigned,
        @RequestParam(required = false) Long developerId,
        @RequestParam(defaultValue = "false") boolean developerUnassigned,
        @RequestParam(required = false) Boolean internal,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to,
        JwtAuthenticationToken authentication
    ) {
        Project project = lookup.project(projectId);
        User user = currentUser(authentication);
        requireVisibleProject(project, user);
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        List<Issue> list = issues.findByProject_IdAndArchivedAtIsNotNullAndDeletedAtIsNullOrderByArchivedAtDescIdDesc(projectId).stream()
            .filter(issue -> canSeeIssue(issue, user))
            .filter(issue -> matches(issue, status, issueType, uncategorized, issuerId, issuerUnassigned,
                developerId, developerUnassigned, internal, from, to, normalizedSearch))
            .toList();
        Map<Long, Map<Long, List<String>>> selectValues = selectValuesFor(list, project, user);
        return list.stream()
            .map(issue -> issueOutput(issue, selectValues.getOrDefault(issue.getId(), Map.of())))
            .toList();
    }

    /**
     * Admin-only permanent multi-delete. Unlike {@link #deleteIssue(Long, JwtAuthenticationToken)},
     * this removes the row (and cascades to comments/values/attachments). Detaches the issue
     * from any historical events first so the audit trail survives.
     */
    @PostMapping("/issues/permanent-delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void permanentlyDeleteIssues(@Valid @RequestBody IdsPayload payload,
                                        JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        requireAdmin(user);
        if (payload.ids() == null || payload.ids().isEmpty()) return;
        for (Long id : payload.ids()) {
            Issue issue = lookup.issue(id);
            requireVisibleProject(issue.getProject(), user);
            deleteAttachmentFiles(issue);
            eventService.detachIssue(id);
            issues.delete(issue);
            log.info("Issue permanently deleted: project={} issue={} actor={}",
                issue.getProject().getId(), id, user.getId());
        }
    }

    private void deleteAttachmentFiles(Issue issue) {
        for (IssueAttachment attachment : attachments.findByIssue_IdOrderByUploadedAtAscIdAsc(issue.getId())) {
            if (attachment.getStoredPath() == null) continue;
            try {
                Files.deleteIfExists(Paths.get(attachment.getStoredPath()));
            } catch (IOException exception) {
                log.warn("Cannot delete attachment file: issue={} attachment={} path={} reason={}",
                    issue.getId(), attachment.getId(), attachment.getStoredPath(), exception.getMessage());
            }
        }
    }

    /**
     * Shared predicate used by the deleted/archived list endpoints. Mirrors the inline filter
     * chain in {@link #issueReport}, excluding the visibility filter (each endpoint applies it
     * separately).
     */
    private boolean matches(Issue issue, IssueStatus status, IssueType issueType, boolean uncategorized,
                            Long issuerId, boolean issuerUnassigned, Long developerId, boolean developerUnassigned,
                            Boolean internal, Instant from, Instant to, String normalizedSearch) {
        if (status != null && issue.getStatus() != status) return false;
        if (issueType != null && issue.getIssueType() != issueType) return false;
        if (uncategorized && issue.getIssueType() != null) return false;
        if (issuerId != null && !issuerId.equals(id(issue.getIssuer()))) return false;
        if (issuerUnassigned && issue.getIssuer() != null) return false;
        if (developerId != null && !developerId.equals(id(issue.getDeveloper()))) return false;
        if (developerUnassigned && issue.getDeveloper() != null) return false;
        if (internal != null && issue.isInternal() != internal) return false;
        if (from != null && issue.getCreatedAt().isBefore(from)) return false;
        if (to != null && !issue.getCreatedAt().isBefore(to)) return false;
        return normalizedSearch.isBlank() || reportSearchText(issue).contains(normalizedSearch);
    }

    @PatchMapping("/issues/{issueId}/planning")
    public IssueOutput updatePlanning(@PathVariable Long issueId, @Valid @RequestBody PlanningPatch input,
                                      JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        requireAdmin(user);
        Issue issue = lookup.issue(issueId);
        IssueType previousType = issue.getIssueType();
        User previousDeveloper = issue.getDeveloper();
        User nextDeveloper = teamParticipant(issue.getProject(), input.devUserId());
        issue.setIssueType(input.issueType());
        issue.setDeveloper(nextDeveloper);
        List<String> changes = new ArrayList<>();
        if (previousType != input.issueType()) changes.add(
            "Tipologia: " + issueTypeLabel(previousType) + " → " + issueTypeLabel(input.issueType()));
        if (!java.util.Objects.equals(id(previousDeveloper), id(nextDeveloper))) changes.add(
            "Sviluppatore: " + userLabel(previousDeveloper) + " → " + userLabel(nextDeveloper));
        if (!changes.isEmpty()) eventService.issueEvent(EventType.ISSUE_PLANNED, issue, user,
            String.join("\n", changes));
        if (!changes.isEmpty()) log.info("Issue planned: project={} issue={} actor={} changes={}",
            issue.getProject().getId(), issue.getId(), user.getId(), changes.size());
        return issueOutput(issue);
    }

    @PatchMapping("/issues/{issueId}/status")
    public IssueOutput updateStatus(@PathVariable Long issueId, @Valid @RequestBody StatusPatch input,
                                    JwtAuthenticationToken authentication) {
        User actor = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), actor);
        requireVisibleIssue(issue, actor);
        IssueStatus previousStatus = issue.getStatus();
        if (input.status() == IssueStatus.APPROVED && previousStatus != IssueStatus.APPROVED) {
            return approve(issue, actor);
        }
        if (previousStatus != input.status() && !isInternalUser(actor)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "TEAM or ADMIN role required to change issue status");
        }
        issue.setStatus(input.status());
        if (input.status() == IssueStatus.RELEASED && issue.getReleasedAt() == null) {
            issue.setReleasedAt(Instant.now());
        }
        if (previousStatus != input.status()) {
            eventService.issueEvent(EventType.ISSUE_STATUS_CHANGED, issue, actor,
                "Stato: " + statusLabel(previousStatus) + " → " + statusLabel(input.status())
                + "\n" + previousStatus + " -> " + input.status());
            log.info("Issue status changed: project={} issue={} actor={} from={} to={}",
                issue.getProject().getId(), issue.getId(), actor.getId(), previousStatus, input.status());
        }
        return issueOutput(issue);
    }



    private String fieldSnapshot(List<IssueData> issueValues) {
        return issueValues.stream()
            .sorted((a, b) -> a.getDefinitionId().equals(b.getDefinitionId())
                ? Integer.compare(a.getPosition(), b.getPosition()) : a.getDefinitionId().compareTo(b.getDefinitionId()))
            .map(value -> definitions.findById(value.getDefinitionId())
                .map(definition -> definition.getLabel() + ": " + value.getValue())
                .orElse("Campo #" + value.getDefinitionId() + ": " + value.getValue()))
            .collect(Collectors.joining("\n"));
    }

    private static List<IssueFieldDefinition> changedFields(List<IssueFieldDefinition> fields,
                                                             List<IssueData> before, List<IssueData> after) {
        return fields.stream()
            .filter(field -> !fieldValues(before, field.getId()).equals(fieldValues(after, field.getId())))
            .toList();
    }

    private static String renderFieldChanges(List<IssueFieldDefinition> changedFields,
                                             List<IssueData> before, List<IssueData> after) {
        return changedFields.stream()
            .map(field -> field.getLabel() + ": "
                + displayValues(fieldValues(before, field.getId())) + " → "
                + displayValues(fieldValues(after, field.getId())))
            .collect(Collectors.joining("\n"));
    }

    private static List<String> fieldValues(List<IssueData> values, Long definitionId) {
        return values.stream().filter(value -> value.getDefinitionId().equals(definitionId))
            .sorted((a, b) -> Integer.compare(a.getPosition(), b.getPosition()))
            .map(IssueData::getValue).toList();
    }

    private static String displayValues(List<String> values) {
        return values.isEmpty() ? "(vuoto)" : String.join(", ", values);
    }

    private static String statusLabel(IssueStatus status) {
        return switch (status) {
            case REPORTED -> "Segnalato";
            case IN_PROGRESS -> "In lavorazione";
            case COMPLETED -> "Completato";
            case RELEASED -> "Rilasciato";
            case APPROVED -> "Approvato";
        };
    }

    private static String issueTypeLabel(IssueType type) {
        if (type == null) return "Non categorizzata";
        return switch (type) {
            case ANOMALY -> "Anomalia";
            case IMPROVEMENT -> "Miglioria";
            case IMPLEMENTATION -> "Implementazione";
        };
    }

    private static String userLabel(User user) {
        return user == null ? "Non assegnato" : user.getUsername();
    }

    private static String reportSearchText(Issue issue) {
        return String.join(" ", issue.getId().toString(), issue.getTitle(), issue.getDescription(),
            statusLabel(issue.getStatus()), issueTypeLabel(issue.getIssueType()), userLabel(issue.getIssuer()),
            userLabel(issue.getDeveloper())).toLowerCase(Locale.ROOT);
    }

    private static List<String> reportFilterLabels(
        String search, IssueStatus status, IssueType issueType, boolean uncategorized,
        Long issuerId, boolean issuerUnassigned, Long developerId, boolean developerUnassigned,
        Boolean internal, Instant from, Instant to
    ) {
        List<String> labels = new ArrayList<>();
        if (search != null && !search.isBlank()) labels.add("Ricerca: " + search.trim());
        if (status != null) labels.add("Stato: " + statusLabel(status));
        if (issueType != null) labels.add("Tipologia: " + issueTypeLabel(issueType));
        if (uncategorized) labels.add("Tipologia: Non categorizzata");
        if (issuerId != null) labels.add("Segnalatore ID: " + issuerId);
        if (issuerUnassigned) labels.add("Segnalatore: Non assegnato");
        if (developerId != null) labels.add("Sviluppatore ID: " + developerId);
        if (developerUnassigned) labels.add("Sviluppatore: Non assegnato");
        if (internal != null) labels.add("Visibilità: " + (internal ? "Solo interne" : "Solo pubbliche"));
        if (from != null) labels.add("Dal: " + from);
        if (to != null) labels.add("Al: " + to);
        return labels;
    }

    private List<IssueData> validatedValues(Issue issue, List<FieldValueInput> inputValues, Set<FieldScope> writableScopes) {
        Map<Long, IssueFieldDefinition> writableFields = definitions.findByProject_Id(issue.getProject().getId()).stream()
            .filter(definition -> writableScopes.contains(definition.getScope()))
            .collect(Collectors.toMap(IssueFieldDefinition::getId, definition -> definition));
        Map<Long, List<FieldValueInput>> byDefinition = inputValues.stream()
            .filter(input -> input.value() != null && !input.value().isBlank())
            .collect(Collectors.groupingBy(FieldValueInput::definitionId, LinkedHashMap::new, Collectors.toList()));

        for (Long definitionId : byDefinition.keySet()) {
            if (!writableFields.containsKey(definitionId)) {
                throw ApiLookup.badRequest("Field definition belongs to another project or is not writable");
            }
        }

        for (IssueFieldDefinition definition : writableFields.values()) {
            if (definition.isMandatory() && definition.getType() != FieldType.ATTACHMENTS
                && !byDefinition.containsKey(definition.getId())) {
                throw ApiLookup.badRequest("Missing mandatory field: " + definition.getCode());
            }
        }

        List<IssueData> output = new ArrayList<>();
        for (Map.Entry<Long, List<FieldValueInput>> entry : byDefinition.entrySet()) {
            IssueFieldDefinition definition = writableFields.get(entry.getKey());
            List<FieldValueInput> fieldValues = entry.getValue();
            if (!definition.isMultiple() && fieldValues.size() > 1) {
                throw ApiLookup.badRequest("Field accepts only one value: " + definition.getCode());
            }
            Set<Integer> positions = fieldValues.stream()
                .map(value -> value.position() == null ? 0 : value.position())
                .collect(Collectors.toSet());
            if (positions.size() != fieldValues.size()) {
                throw ApiLookup.badRequest("Duplicate position for field: " + definition.getCode());
            }
            for (FieldValueInput value : fieldValues) {
                int position = value.position() == null ? 0 : value.position();
                if (!definition.isMultiple() && position != 0) {
                    throw ApiLookup.badRequest("Single-value fields require position 0: " + definition.getCode());
                }
                output.add(new IssueData(issue.getId(), issue.getProject().getId(), definition.getId(), position,
                    validatedFieldValue(definition, value.value())));
            }
        }
        return output;
    }

    private String validatedFieldValue(IssueFieldDefinition definition, String rawValue) {
        String value = rawValue.trim();
        if (definition.getType() == FieldType.NUMBER) {
            try {
                return new BigDecimal(value).stripTrailingZeros().toPlainString();
            } catch (NumberFormatException exception) {
                throw ApiLookup.badRequest("NUMBER fields require a valid decimal number: " + definition.getCode());
            }
        }
        if (definition.getType() == FieldType.SELECT
            && !options.existsByDefinition_IdAndValueAndActiveTrue(definition.getId(), value)) {
            throw ApiLookup.badRequest("Value is not an active option for field: " + definition.getCode());
        }
        return value;
    }

    private Path attachmentPath(Issue issue, IssueAttachment attachment) {
        return attachmentsRoot
            .resolve(issue.getProject().getId().toString())
            .resolve(issue.getId().toString())
            .resolve(attachment.getId() + attachment.getExtension())
            .normalize();
    }

    private static String safeOriginalName(String originalFilename) {
        String name = originalFilename == null || originalFilename.isBlank() ? "attachment" : originalFilename;
        return Path.of(name).getFileName().toString();
    }

    private static String extension(String originalName) {
        int dot = originalName.lastIndexOf('.');
        if (dot < 0 || dot == originalName.length() - 1) return "";
        String ext = originalName.substring(dot).toLowerCase();
        return ext.length() > 32 ? ext.substring(0, 32) : ext;
    }

    private void requireAdmin(User user) {
        if (user.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    private User teamParticipant(Project project, Long userId) {
        if (userId == null) return null;
        User user = lookup.user(userId);
        if (user.getRole() != Role.TEAM) {
            throw ApiLookup.badRequest("Developer must be a TEAM user");
        }
        boolean explicitMember = memberships.existsById(new ProjectUserId(project.getId(), userId));
        ProjectMembershipPolicy.requireParticipant(project, user, explicitMember);
        return user;
    }

    private void requireVisibleProject(Project project, User user) {
        if (user.getRole() == Role.ADMIN) return;
        boolean explicitMember = memberships.existsById(new ProjectUserId(project.getId(), user.getId()));
        if (!ProjectMembershipPolicy.isAutomaticCompanyMember(project, user) && !explicitMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project not available");
        }
    }

    private void requireVisibleIssue(Issue issue, User user) {
        if (issue.isDeleted() && user.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue deleted");
        }
        if (issue.isArchived() && user.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.GONE, "Issue archived");
        }
        if (!canSeeIssue(issue, user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Issue not available");
        }
    }

    private boolean canSeeIssue(Issue issue, User user) {
        return !issue.isInternal() || isInternalUser(user);
    }

    private boolean canUseField(IssueFieldDefinition definition, User user) {
        if (definition.getScope() == FieldScope.USER) return true;
        if (definition.getScope() == FieldScope.SUPERUSER) return user.getRole() == Role.SUPERUSER || isInternalUser(user);
        return definition.getScope() == FieldScope.TEAM && isInternalUser(user);
    }

    private boolean isInternalUser(User user) {
        return user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM;
    }

    private Set<FieldScope> writableScopesFor(User user) {
        if (isInternalUser(user)) return Set.of(FieldScope.USER, FieldScope.TEAM);
        if (user.getRole() == Role.SUPERUSER) return Set.of(FieldScope.USER, FieldScope.SUPERUSER);
        return Set.of(FieldScope.USER);
    }

    private User currentUser(JwtAuthenticationToken authentication) {
        return users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private static void requireExternalProject(JwtAuthenticationToken authentication, Long projectId) {
        Number externalProjectId = authentication.getToken().getClaim("external_project_id");
        if (externalProjectId != null && externalProjectId.longValue() != projectId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "External session is bound to another project");
        }
    }

    private static IssueOutput issueOutput(Issue issue, Map<Long, List<String>> selectValuesByField) {
        return new IssueOutput(issue.getId(), issue.getProject().getId(), issue.getTitle(), issue.getDescription(),
            issue.getCreatedAt(), issue.getStatus(), issue.getIssueType(), issue.getReleasedAt(), issue.getApprovedAt(),
            id(issue.getIssuer()), username(issue.getIssuer()), id(issue.getDeveloper()), username(issue.getDeveloper()),
            id(issue.getApprover()), username(issue.getApprover()), issue.isInternal(),
            issue.getDeletedAt(), issue.getArchivedAt(),
            selectValuesByField == null ? Map.of() : selectValuesByField);
    }

    private static IssueOutput issueOutput(Issue issue) {
        return issueOutput(issue, Map.of());
    }

    /**
     * Builds a per-issue map of SELECT field values for the given issues. Only SELECT fields the
     * user is allowed to use are included. Used to enable select-field filtering on the
     * dashboard and boards.
     */
    private Map<Long, Map<Long, List<String>>> selectValuesFor(List<Issue> target, Project project, User user) {
        if (target.isEmpty()) return Map.of();
        List<IssueFieldDefinition> selectDefs = definitions.findByProject_Id(project.getId()).stream()
            .filter(definition -> definition.getType() == FieldType.SELECT)
            .filter(definition -> canUseField(definition, user))
            .toList();
        if (selectDefs.isEmpty()) return Map.of();
        Set<Long> selectIds = selectDefs.stream().map(IssueFieldDefinition::getId).collect(Collectors.toSet());
        Set<Long> issueIds = target.stream().map(Issue::getId).collect(Collectors.toSet());
        Map<Long, Map<Long, List<String>>> output = new HashMap<>();
        for (IssueData data : values.findByIssueIdIn(issueIds)) {
            if (!selectIds.contains(data.getDefinitionId())) continue;
            output.computeIfAbsent(data.getIssueId(), key -> new HashMap<>())
                .computeIfAbsent(data.getDefinitionId(), key -> new ArrayList<>())
                .add(data.getValue());
        }
        return output;
    }

    private static UserOutput userOutput(User user) {
        return new UserOutput(user.getId(), user.getUsername(), user.getFirstName(), user.getLastName(), user.getRole());
    }

    private static FieldOutput fieldOutput(IssueFieldDefinition definition, boolean hasValues) {
        return new FieldOutput(definition.getId(), definition.getProject().getId(), definition.getCode(),
            definition.getLabel(), definition.getDescription(),
            definition.isMandatory(), definition.isMultiple(), definition.getType(), definition.getScope(), hasValues);
    }

    private static FieldOptionOutput fieldOptionOutput(it.davideleva.loom.domain.IssueFieldOption option) {
        return new FieldOptionOutput(option.getId(), option.getDefinition().getId(),
            option.getDefinition().getProject().getId(), option.getValue(), option.getLabel(), option.isActive());
    }

    private static ValueOutput valueOutput(IssueData data, String label) {
        return new ValueOutput(data.getId(), data.getIssueId(), data.getProjectId(), data.getDefinitionId(), label,
            data.getPosition(), data.getValue());
    }

    private static AttachmentOutput attachmentOutput(IssueAttachment attachment) {
        return new AttachmentOutput(attachment.getId(), attachment.getIssue().getId(), attachment.getProjectId(),
            attachment.getDefinition() == null ? null : attachment.getDefinition().getId(), attachment.getOriginalName(),
            attachment.getContentType(), attachment.getFileSize(), attachment.getUploadedAt(), id(attachment.getUser()),
            username(attachment.getUser()));
    }

    private static CommentOutput commentOutput(IssueComment comment, User currentUser) {
        boolean canDelete = comment.getUser() != null
            && comment.getUser().getId().equals(currentUser.getId())
            && comment.getDate() != null
            && comment.getDate().plus(Duration.ofMinutes(10)).isAfter(Instant.now());
        return new CommentOutput(comment.getId(), comment.getIssue().getId(), comment.getIssue().getProject().getId(),
            id(comment.getUser()), username(comment.getUser()), comment.getDate(), comment.getComment(), canDelete);
    }

    private static Long id(User user) {
        return user == null ? null : user.getId();
    }

    private static String username(User user) {
        return user == null ? null : user.getUsername();
    }
}
