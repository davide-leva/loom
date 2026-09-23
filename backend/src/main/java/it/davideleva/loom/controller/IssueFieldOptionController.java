package it.davideleva.loom.controller;

import it.davideleva.loom.domain.FieldType;
import it.davideleva.loom.domain.IssueFieldDefinition;
import it.davideleva.loom.domain.IssueFieldOption;
import it.davideleva.loom.repository.IssueDataRepository;
import it.davideleva.loom.repository.IssueFieldOptionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
@RequestMapping("/api/issue-field-options")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class IssueFieldOptionController {
    private final IssueFieldOptionRepository options;
    private final IssueDataRepository values;
    private final ApiLookup lookup;

    public record Create(@NotNull Long definitionId, @NotBlank @Size(max = 64) String value,
                         @NotBlank @Size(max = 64) String label) {}
    public record Update(@NotBlank @Size(max = 64) String value,
                         @NotBlank @Size(max = 64) String label, @NotNull Boolean active) {}
    public record Output(Long id, Long definitionId, Long projectId,
                         String value, String label, boolean active) {}

    @GetMapping
    public List<Output> getAll() {
        return options.findAll().stream().map(IssueFieldOptionController::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.option(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return options.findByDefinition_Project_Id(projectId).stream()
            .map(IssueFieldOptionController::output).toList();
    }

    @GetMapping("/field/{definitionId}")
    public List<Output> getByField(@PathVariable Long definitionId) {
        lookup.definition(definitionId);
        return options.findByDefinition_Id(definitionId).stream()
            .map(IssueFieldOptionController::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Create input) {
        IssueFieldDefinition definition = lookup.definition(input.definitionId());
        requireSelect(definition);
        return output(options.save(new IssueFieldOption(definition, input.value(), input.label())));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Update input) {
        IssueFieldOption option = lookup.option(id);
        if (!option.getValue().equals(input.value())
            && values.existsByDefinitionIdAndValue(option.getDefinition().getId(), option.getValue())) {
            throw ApiLookup.conflict("Cannot rename an option used by existing issues");
        }
        option.setValue(input.value());
        option.setLabel(input.label());
        option.setActive(input.active());
        return output(option);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        IssueFieldOption option = lookup.option(id);
        if (values.existsByDefinitionIdAndValue(option.getDefinition().getId(), option.getValue())) {
            throw ApiLookup.conflict("Deactivate options used by existing issues instead of deleting them");
        }
        options.delete(option);
    }

    private static void requireSelect(IssueFieldDefinition definition) {
        if (definition.getType() != FieldType.SELECT) {
            throw ApiLookup.badRequest("Options are only available for SELECT fields");
        }
    }

    private static Output output(IssueFieldOption option) {
        return new Output(option.getId(), option.getDefinition().getId(),
            option.getDefinition().getProject().getId(), option.getValue(),
            option.getLabel(), option.isActive());
    }
}
