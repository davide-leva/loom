package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueStatus;
import it.sf2.tickets.domain.IssueType;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.IssueRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/issues")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class IssueController {
    private final IssueRepository issues;
    private final ProjectUserRepository memberships;
    private final ApiLookup lookup;

    public record Create(
        @NotNull Long projectId,
        @NotBlank @Size(max = 255) String title,
        @NotNull String description,
        @NotNull IssueType issueType,
        Long issuerUserId,
        Long devUserId,
        Boolean internal
    ) {}

    public record Update(
        @NotBlank @Size(max = 255) String title,
        @NotNull String description,
        @NotNull IssueStatus status,
        @NotNull IssueType issueType,
        Instant releasedAt,
        Instant approvedAt,
        Long issuerUserId,
        Long devUserId,
        Long approveUserId,
        @NotNull Boolean internal
    ) {}

    public record Output(
        Long id, Long projectId, String title, String description, Instant createdAt,
        IssueStatus status, IssueType issueType, Instant releasedAt, Instant approvedAt,
        Long issuerUserId, Long devUserId, Long approveUserId, boolean internal
    ) {}

    @GetMapping
    public List<Output> getAll() {
        return issues.findAll().stream().map(IssueController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.issue(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return issues.findByProject_Id(projectId).stream().map(IssueController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Create input) {
        Project project = lookup.project(input.projectId());
        Issue issue = new Issue(project, input.title(), input.description(), input.issueType());
        issue.setIssuer(participant(project, input.issuerUserId()));
        issue.setDeveloper(participant(project, input.devUserId()));
        issue.setInternal(Boolean.TRUE.equals(input.internal()));
        return output(issues.save(issue));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Update input) {
        Issue issue = lookup.issue(id);
        Project project = issue.getProject();
        issue.setTitle(input.title());
        issue.setDescription(input.description());
        issue.setStatus(input.status());
        issue.setIssueType(input.issueType());
        issue.setReleasedAt(input.releasedAt());
        issue.setApprovedAt(input.approvedAt());
        issue.setIssuer(participant(project, input.issuerUserId()));
        issue.setDeveloper(participant(project, input.devUserId()));
        issue.setApprover(participant(project, input.approveUserId()));
        issue.setInternal(input.internal());
        return output(issue);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        issues.delete(lookup.issue(id));
    }

    private User participant(Project project, Long userId) {
        if (userId == null) return null;
        User user = lookup.user(userId);
        boolean explicitMember = memberships.existsById(new ProjectUserId(project.getId(), userId));
        ProjectMembershipPolicy.requireParticipant(project, user, explicitMember);
        return user;
    }

    private static Output output(Issue issue) {
        return new Output(issue.getId(), issue.getProject().getId(), issue.getTitle(),
            issue.getDescription(), issue.getCreatedAt(), issue.getStatus(), issue.getIssueType(),
            issue.getReleasedAt(), issue.getApprovedAt(), id(issue.getIssuer()),
            id(issue.getDeveloper()), id(issue.getApprover()), issue.isInternal());
    }

    private static Long id(User user) {
        return user == null ? null : user.getId();
    }
}
