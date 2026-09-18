package it.sf2.tickets.controller;

import it.sf2.tickets.domain.EventType;
import it.sf2.tickets.domain.FieldScope;
import it.sf2.tickets.domain.FieldType;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueAttachment;
import it.sf2.tickets.domain.IssueComment;
import it.sf2.tickets.domain.IssueData;
import it.sf2.tickets.domain.IssueFieldDefinition;
import it.sf2.tickets.domain.IssueStatus;
import it.sf2.tickets.domain.IssueType;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.IssueAttachmentRepository;
import it.sf2.tickets.repository.IssueCommentRepository;
import it.sf2.tickets.repository.IssueDataRepository;
import it.sf2.tickets.repository.IssueFieldDefinitionRepository;
import it.sf2.tickets.repository.IssueFieldOptionRepository;
import it.sf2.tickets.repository.IssueRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import it.sf2.tickets.repository.UserRepository;
import it.sf2.tickets.notification.EventService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
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
    private final ApiLookup lookup;
    private final Path attachmentsRoot;
    private final DataSize maxAttachmentSize;

    public WorkspaceIssueController(IssueRepository issues, IssueAttachmentRepository attachments,
                                    IssueCommentRepository comments, IssueDataRepository values,
                                    IssueFieldDefinitionRepository definitions, IssueFieldOptionRepository options,
                                    UserRepository users, ProjectUserRepository memberships, EventService eventService,
                                    ApiLookup lookup,
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
        this.lookup = lookup;
        this.attachmentsRoot = Paths.get(attachmentsRootFolder).toAbsolutePath().normalize();
        this.maxAttachmentSize = maxAttachmentSize;
    }

    public record IssueOutput(
        Long id, Long projectId, String title, String description, Instant createdAt,
        IssueStatus status, IssueType issueType, Instant releasedAt, Instant approvedAt,
        Long issuerUserId, String issuerUsername, Long devUserId, String devUsername,
        Long approveUserId, String approveUsername, boolean internal
    ) {}

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
        Long id, Long projectId, String code, String label,
        boolean mandatory, boolean multiple, FieldType type, FieldScope scope
    ) {}

    public record FieldOptionOutput(Long id, Long definitionId, Long projectId, String value, String label, boolean active) {}

    public record StatusPatch(@NotNull IssueStatus status) {}

    public record CreateIssue(
        @NotNull Long projectId,
        @NotBlank @Size(max = 255) String title,
        @NotBlank String description,
        List<FieldValueInput> values
    ) {}

    public record PlanningPatch(@NotNull IssueType issueType, Long devUserId) {}
    public record CreateComment(@NotBlank String comment) {}

    public record FieldValueInput(@NotNull Long definitionId, Integer position, @NotBlank String value) {}

    @GetMapping("/projects/{projectId}/issues")
    @Transactional(readOnly = true)
    public List<IssueOutput> issuesByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        requireVisibleProject(project, currentUser(authentication));
        return issues.findByProject_Id(projectId).stream()
            .map(WorkspaceIssueController::issueOutput)
            .toList();
    }


    @GetMapping("/issues/{issueId}")
    @Transactional(readOnly = true)
    public IssueDetail issueDetail(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        return new IssueDetail(issueOutput(issue),
            values.findByIssueId(issueId).stream().map(data -> valueOutput(data, definitions.findById(data.getDefinitionId())
                .map(IssueFieldDefinition::getLabel).orElse("Campo " + data.getDefinitionId()))).toList(),
            attachments.findByIssue_IdOrderByUploadedAtAscIdAsc(issueId).stream().map(WorkspaceIssueController::attachmentOutput).toList(),
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
        requireVisibleProject(project, currentUser(authentication));
        return definitions.findByProject_Id(projectId).stream()
            .filter(definition -> definition.getScope() == FieldScope.USER)
            .map(WorkspaceIssueController::fieldOutput)
            .toList();
    }

    @GetMapping("/projects/{projectId}/field-options")
    @Transactional(readOnly = true)
    public List<FieldOptionOutput> fieldOptionsByProject(@PathVariable Long projectId, JwtAuthenticationToken authentication) {
        Project project = lookup.project(projectId);
        requireVisibleProject(project, currentUser(authentication));
        return options.findByDefinition_Project_Id(projectId).stream()
            .filter(option -> option.isActive() && option.getDefinition().getScope() == FieldScope.USER)
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
        Issue saved = issues.save(issue);
        values.saveAll(validatedValues(saved, input.values() == null ? List.of() : input.values()));
        eventService.issueEvent(EventType.ISSUE_CREATED, saved, reporter, "Nuova segnalazione creata");
        return issueOutput(saved);
    }

    @PostMapping(value = "/issues/{issueId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AttachmentOutput uploadAttachment(@PathVariable Long issueId, @RequestParam Long definitionId,
                                             @RequestParam MultipartFile file,
                                             JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        IssueFieldDefinition definition = lookup.definition(definitionId);
        if (!definition.getProject().getId().equals(issue.getProject().getId())
            || definition.getScope() != FieldScope.USER || definition.getType() != FieldType.ATTACHMENTS) {
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
                "Allegato caricato: " + originalName);
            return attachmentOutput(attachment);
        } catch (IOException exception) {
            attachments.delete(attachment);
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
        IssueComment comment = comments.save(new IssueComment(issue, user, input.comment().trim()));
        eventService.issueEvent(EventType.ISSUE_COMMENT_ADDED, issue, user, "Nuovo commento aggiunto");
        return commentOutput(comment, user);
    }

    @DeleteMapping("/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@PathVariable Long commentId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        IssueComment comment = lookup.comment(commentId);
        requireVisibleProject(comment.getIssue().getProject(), user);
        boolean owner = comment.getUser() != null && comment.getUser().getId().equals(user.getId());
        boolean withinWindow = comment.getDate() != null
            && comment.getDate().plus(Duration.ofMinutes(10)).isAfter(Instant.now());
        if (!owner || !withinWindow) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Comment cannot be deleted");
        }
        comments.delete(comment);
    }

    @PatchMapping("/issues/{issueId}/approval")
    public IssueOutput approveIssue(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        if (user.getRole() != Role.SUPERUSER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "SUPERUSER role required");
        }
        if (issue.getStatus() != IssueStatus.RELEASED) {
            throw ApiLookup.badRequest("Only released issues can be approved");
        }
        issue.setStatus(IssueStatus.APPROVED);
        issue.setApprovedAt(Instant.now());
        issue.setApprover(user);
        eventService.issueEvent(EventType.ISSUE_APPROVED, issue, user, "Segnalazione approvata");
        return issueOutput(issue);
    }

    @DeleteMapping("/issues/{issueId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteIssue(@PathVariable Long issueId, JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), user);
        boolean admin = user.getRole() == Role.ADMIN;
        boolean reporter = issue.getIssuer() != null && issue.getIssuer().getId().equals(user.getId());
        boolean withinWindow = issue.getCreatedAt() != null
            && issue.getCreatedAt().plus(Duration.ofMinutes(10)).isAfter(Instant.now());
        if (!admin && (!reporter || !withinWindow)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Issue cannot be deleted");
        }
        eventService.issueEvent(EventType.ISSUE_DELETED, issue, user, "Segnalazione eliminata");
        issues.delete(issue);
    }

    @PatchMapping("/issues/{issueId}/planning")
    public IssueOutput updatePlanning(@PathVariable Long issueId, @Valid @RequestBody PlanningPatch input,
                                      JwtAuthenticationToken authentication) {
        User user = currentUser(authentication);
        requireAdmin(user);
        Issue issue = lookup.issue(issueId);
        issue.setIssueType(input.issueType());
        issue.setDeveloper(teamParticipant(issue.getProject(), input.devUserId()));
        eventService.issueEvent(EventType.ISSUE_PLANNED, issue, user,
            "Segnalazione pianificata come " + input.issueType());
        return issueOutput(issue);
    }

    @PatchMapping("/issues/{issueId}/status")
    public IssueOutput updateStatus(@PathVariable Long issueId, @Valid @RequestBody StatusPatch input,
                                    JwtAuthenticationToken authentication) {
        User actor = currentUser(authentication);
        Issue issue = lookup.issue(issueId);
        requireVisibleProject(issue.getProject(), actor);
        IssueStatus previousStatus = issue.getStatus();
        if (input.status() == IssueStatus.APPROVED && previousStatus != IssueStatus.APPROVED) {
            throw ApiLookup.badRequest("APPROVED status can only be set by SUPERUSER approval");
        }
        issue.setStatus(input.status());
        if (input.status() == IssueStatus.RELEASED && issue.getReleasedAt() == null) {
            issue.setReleasedAt(Instant.now());
        }
        if (input.status() == IssueStatus.APPROVED && issue.getApprovedAt() == null) {
            issue.setApprovedAt(Instant.now());
        }
        if (previousStatus != input.status()) {
            eventService.issueEvent(EventType.ISSUE_STATUS_CHANGED, issue, actor,
                "Lo stato della segnalazione è cambiato da " + previousStatus + " a " + input.status());
        }
        return issueOutput(issue);
    }



    private List<IssueData> validatedValues(Issue issue, List<FieldValueInput> inputValues) {
        Map<Long, IssueFieldDefinition> userFields = definitions.findByProject_Id(issue.getProject().getId()).stream()
            .filter(definition -> definition.getScope() == FieldScope.USER)
            .collect(Collectors.toMap(IssueFieldDefinition::getId, definition -> definition));
        Map<Long, List<FieldValueInput>> byDefinition = inputValues.stream()
            .filter(input -> input.value() != null && !input.value().isBlank())
            .collect(Collectors.groupingBy(FieldValueInput::definitionId, LinkedHashMap::new, Collectors.toList()));

        for (Long definitionId : byDefinition.keySet()) {
            if (!userFields.containsKey(definitionId)) {
                throw ApiLookup.badRequest("Field definition belongs to another project or is not visible to USER");
            }
        }

        for (IssueFieldDefinition definition : userFields.values()) {
            if (definition.isMandatory() && definition.getType() != FieldType.ATTACHMENTS
                && !byDefinition.containsKey(definition.getId())) {
                throw ApiLookup.badRequest("Missing mandatory field: " + definition.getCode());
            }
        }

        List<IssueData> output = new ArrayList<>();
        for (Map.Entry<Long, List<FieldValueInput>> entry : byDefinition.entrySet()) {
            IssueFieldDefinition definition = userFields.get(entry.getKey());
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

    private User currentUser(JwtAuthenticationToken authentication) {
        return users.findById(Long.parseLong(authentication.getName()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private static IssueOutput issueOutput(Issue issue) {
        return new IssueOutput(issue.getId(), issue.getProject().getId(), issue.getTitle(), issue.getDescription(),
            issue.getCreatedAt(), issue.getStatus(), issue.getIssueType(), issue.getReleasedAt(), issue.getApprovedAt(),
            id(issue.getIssuer()), username(issue.getIssuer()), id(issue.getDeveloper()), username(issue.getDeveloper()),
            id(issue.getApprover()), username(issue.getApprover()), issue.isInternal());
    }

    private static UserOutput userOutput(User user) {
        return new UserOutput(user.getId(), user.getUsername(), user.getFirstName(), user.getLastName(), user.getRole());
    }

    private static FieldOutput fieldOutput(IssueFieldDefinition definition) {
        return new FieldOutput(definition.getId(), definition.getProject().getId(), definition.getCode(),
            definition.getLabel(), definition.isMandatory(), definition.isMultiple(), definition.getType(),
            definition.getScope());
    }

    private static FieldOptionOutput fieldOptionOutput(it.sf2.tickets.domain.IssueFieldOption option) {
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
