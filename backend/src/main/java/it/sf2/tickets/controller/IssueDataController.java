package it.sf2.tickets.controller;

import it.sf2.tickets.domain.FieldType;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueData;
import it.sf2.tickets.domain.IssueFieldDefinition;
import it.sf2.tickets.repository.IssueDataRepository;
import it.sf2.tickets.repository.IssueFieldOptionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
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
@RequestMapping("/api/issue-data")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class IssueDataController {
    private final IssueDataRepository values;
    private final IssueFieldOptionRepository options;
    private final ApiLookup lookup;

    public record Create(@NotNull Long issueId, @NotNull Long definitionId,
                         @Min(0) Integer position, @NotBlank String value) {}
    public record Update(@NotNull @Min(0) Integer position, @NotBlank String value) {}
    public record Output(Long id, Long issueId, Long projectId,
                         Long definitionId, int position, String value) {}

    @GetMapping
    public List<Output> getAll() {
        return values.findAll().stream().map(IssueDataController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.value(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return values.findByProjectId(projectId).stream().map(IssueDataController::output).toList();
    }

    @GetMapping("/issue/{issueId}")
    public List<Output> getByIssue(@PathVariable Long issueId) {
        lookup.issue(issueId);
        return values.findByIssueId(issueId).stream().map(IssueDataController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Create input) {
        Issue issue = lookup.issue(input.issueId());
        IssueFieldDefinition definition = lookup.definition(input.definitionId());
        int position = input.position() == null ? 0 : input.position();
        requireSameProject(issue, definition);
        if (!definition.isMultiple() && values.existsByIssueIdAndDefinitionId(issue.getId(), definition.getId())) {
            throw ApiLookup.conflict("This field accepts only one value per issue");
        }
        String value = validatedValue(definition, position, input.value(), true);
        return output(values.save(new IssueData(issue.getId(), issue.getProject().getId(),
            definition.getId(), position, value)));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Update input) {
        IssueData data = lookup.value(id);
        IssueFieldDefinition definition = lookup.definition(data.getDefinitionId());
        data.setValue(validatedValue(definition, input.position(), input.value(),
            !data.getValue().equals(input.value())));
        data.setPosition(input.position());
        return output(data);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        IssueData data = lookup.value(id);
        IssueFieldDefinition definition = lookup.definition(data.getDefinitionId());
        if (definition.isMandatory()
            && !values.existsByIssueIdAndDefinitionIdAndIdNot(data.getIssueId(), data.getDefinitionId(), id)) {
            throw ApiLookup.conflict("Cannot delete the last value of a mandatory field");
        }
        values.delete(data);
    }

    private static void requireSameProject(Issue issue, IssueFieldDefinition definition) {
        if (!issue.getProject().getId().equals(definition.getProject().getId())) {
            throw ApiLookup.badRequest("Field definition belongs to another project");
        }
    }

    private String validatedValue(IssueFieldDefinition definition, int position, String value,
                                  boolean requireActiveOption) {
        if (!definition.isMultiple() && position != 0) {
            throw ApiLookup.badRequest("Single-value fields require position 0");
        }
        if (definition.getType() == FieldType.NUMBER) {
            try {
                return new BigDecimal(value).stripTrailingZeros().toPlainString();
            } catch (NumberFormatException exception) {
                throw ApiLookup.badRequest("NUMBER fields require a valid decimal number");
            }
        }
        if (definition.getType() == FieldType.SELECT && requireActiveOption
            && !options.existsByDefinition_IdAndValueAndActiveTrue(definition.getId(), value)) {
            throw ApiLookup.badRequest("Value is not an active option for this field");
        }
        return value;
    }

    private static Output output(IssueData data) {
        return new Output(data.getId(), data.getIssueId(), data.getProjectId(),
            data.getDefinitionId(), data.getPosition(), data.getValue());
    }
}
