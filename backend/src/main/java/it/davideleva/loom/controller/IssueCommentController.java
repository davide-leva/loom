package it.davideleva.loom.controller;

import it.davideleva.loom.domain.IssueComment;
import it.davideleva.loom.repository.IssueCommentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
@RequestMapping("/api/issue-comments")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class IssueCommentController {
    private final IssueCommentRepository comments;
    private final ApiLookup lookup;

    public record Create(@NotNull Long issueId, @NotBlank String comment) {}
    public record Update(@NotBlank String comment) {}
    public record Output(Long id, Long issueId, Long projectId,
                         Long userId, Instant date, String comment) {}

    @GetMapping
    public List<Output> getAll() {
        return comments.findAll().stream().map(IssueCommentController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.comment(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return comments.findByIssue_Project_Id(projectId).stream()
            .map(IssueCommentController::output).toList();
    }

    @GetMapping("/issue/{issueId}")
    public List<Output> getByIssue(@PathVariable Long issueId) {
        lookup.issue(issueId);
        return comments.findByIssue_Id(issueId).stream()
            .map(IssueCommentController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Create input, @AuthenticationPrincipal Jwt jwt) {
        IssueComment comment = new IssueComment(lookup.issue(input.issueId()),
            lookup.user(Long.valueOf(jwt.getSubject())), input.comment());
        return output(comments.save(comment));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Update input) {
        IssueComment comment = lookup.comment(id);
        comment.setComment(input.comment());
        return output(comment);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        comments.delete(lookup.comment(id));
    }

    private static Output output(IssueComment comment) {
        return new Output(comment.getId(), comment.getIssue().getId(),
            comment.getIssue().getProject().getId(),
            comment.getUser() == null ? null : comment.getUser().getId(),
            comment.getDate(), comment.getComment());
    }
}
