package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Company;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueComment;
import it.davideleva.loom.domain.IssueData;
import it.davideleva.loom.domain.IssueFieldDefinition;
import it.davideleva.loom.domain.IssueFieldOption;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.ProjectUser;
import it.davideleva.loom.domain.ProjectUserId;
import it.davideleva.loom.domain.User;
import it.davideleva.loom.repository.CompanyRepository;
import it.davideleva.loom.repository.IssueCommentRepository;
import it.davideleva.loom.repository.IssueDataRepository;
import it.davideleva.loom.repository.IssueFieldDefinitionRepository;
import it.davideleva.loom.repository.IssueFieldOptionRepository;
import it.davideleva.loom.repository.IssueRepository;
import it.davideleva.loom.repository.ProjectRepository;
import it.davideleva.loom.repository.ProjectUserRepository;
import it.davideleva.loom.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@RequiredArgsConstructor
public class ApiLookup {
    private final CompanyRepository companies;
    private final UserRepository users;
    private final ProjectRepository projects;
    private final ProjectUserRepository memberships;
    private final IssueRepository issues;
    private final IssueFieldDefinitionRepository definitions;
    private final IssueFieldOptionRepository options;
    private final IssueDataRepository values;
    private final IssueCommentRepository comments;

    public Company company(Long id) {
        return companies.findById(id).orElseThrow(() -> missing("Company", id));
    }

    public User user(Long id) {
        return users.findById(id).orElseThrow(() -> missing("User", id));
    }

    public Project project(Long id) {
        return projects.findById(id).orElseThrow(() -> missing("Project", id));
    }

    public ProjectUser membership(Long projectId, Long userId) {
        return memberships.findById(new ProjectUserId(projectId, userId))
            .orElseThrow(() -> missing("Project membership", projectId + "/" + userId));
    }

    public Issue issue(Long id) {
        return issues.findById(id).orElseThrow(() -> missing("Issue", id));
    }

    public IssueFieldDefinition definition(Long id) {
        return definitions.findById(id).orElseThrow(() -> missing("Field definition", id));
    }

    public IssueFieldOption option(Long id) {
        return options.findById(id).orElseThrow(() -> missing("Field option", id));
    }

    public IssueData value(Long id) {
        return values.findById(id).orElseThrow(() -> missing("Issue value", id));
    }

    public IssueComment comment(Long id) {
        return comments.findById(id).orElseThrow(() -> missing("Comment", id));
    }

    public static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static ResponseStatusException missing(String name, Object id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, name + " " + id + " not found");
    }
}
