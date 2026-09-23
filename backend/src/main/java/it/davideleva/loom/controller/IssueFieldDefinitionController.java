package it.davideleva.loom.controller;

import it.davideleva.loom.domain.FieldType;
import it.davideleva.loom.domain.FieldScope;
import it.davideleva.loom.domain.IssueFieldDefinition;
import it.davideleva.loom.repository.IssueDataRepository;
import it.davideleva.loom.repository.IssueFieldDefinitionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
@RequestMapping("/api/issue-fields")
@PreAuthorize("hasRole('ADMIN')")
@Transactional
@RequiredArgsConstructor
public class IssueFieldDefinitionController {
    private final IssueFieldDefinitionRepository definitions;
    private final IssueDataRepository values;
    private final ApiLookup lookup;

    public record Create(
        @NotNull Long projectId,
        @NotBlank @Pattern(regexp = "[A-Z0-9_]{1,8}") String code,
        @NotBlank @Size(max = 64) String label,
        @Size(max = 2000) String description,
        Boolean mandatory, Boolean multiple, @NotNull FieldType type, FieldScope scope
    ) {}

    public record Update(
        @NotBlank @Pattern(regexp = "[A-Z0-9_]{1,8}") String code,
        @NotBlank @Size(max = 64) String label,
        @Size(max = 2000) String description,
        @NotNull Boolean mandatory, @NotNull Boolean multiple, @NotNull FieldType type,
        @NotNull FieldScope scope
    ) {}

    public record Output(
        Long id, Long projectId, String code, String label, String description,
        boolean mandatory, boolean multiple, FieldType type, FieldScope scope, boolean hasValues
    ) {}

    @GetMapping
    public List<Output> getAll() {
        return definitions.findAll().stream()
            .map(this::output).toList();
    }

    @GetMapping("/{id}")
    public Output getById(@PathVariable Long id) {
        return output(lookup.definition(id));
    }

    @GetMapping("/project/{projectId}")
    public List<Output> getByProject(@PathVariable Long projectId) {
        lookup.project(projectId);
        return definitions.findByProject_Id(projectId).stream()
            .map(this::output).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Output insert(@Valid @RequestBody Create input) {
        IssueFieldDefinition definition = new IssueFieldDefinition(
            lookup.project(input.projectId()), input.code(), input.label(), input.type());
        definition.setDescription(input.description());
        definition.setMandatory(Boolean.TRUE.equals(input.mandatory()));
        definition.setMultiple(Boolean.TRUE.equals(input.multiple()));
        definition.setScope(input.scope() == null ? FieldScope.USER : input.scope());
        return output(definitions.save(definition));
    }

    @PutMapping("/{id}")
    public Output update(@PathVariable Long id, @Valid @RequestBody Update input) {
        IssueFieldDefinition definition = lookup.definition(id);
        if ((definition.getType() != input.type() || (definition.isMultiple() && !input.multiple()))
            && values.existsByDefinitionId(id)) {
            throw ApiLookup.conflict("Cannot change type or multiplicity of a field with values");
        }
        definition.setCode(input.code());
        definition.setLabel(input.label());
        definition.setDescription(input.description());
        definition.setMandatory(input.mandatory());
        definition.setMultiple(input.multiple());
        definition.setType(input.type());
        definition.setScope(input.scope());
        return output(definition);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        definitions.delete(lookup.definition(id));
    }

    private Output output(IssueFieldDefinition definition) {
        return new Output(definition.getId(), definition.getProject().getId(),
            definition.getCode(), definition.getLabel(), definition.getDescription(),
            definition.isMandatory(), definition.isMultiple(), definition.getType(), definition.getScope(),
            values.existsByDefinitionId(definition.getId()));
    }
}
