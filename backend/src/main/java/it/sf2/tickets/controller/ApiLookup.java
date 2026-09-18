package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Company;
import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueComment;
import it.sf2.tickets.domain.IssueData;
import it.sf2.tickets.domain.IssueFieldDefinition;
import it.sf2.tickets.domain.IssueFieldOption;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.ProjectUser;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.User;
import it.sf2.tickets.repository.CompanyRepository;
import it.sf2.tickets.repository.IssueCommentRepository;
import it.sf2.tickets.repository.IssueDataRepository;
import it.sf2.tickets.repository.IssueFieldDefinitionRepository;
import it.sf2.tickets.repository.IssueFieldOptionRepository;
import it.sf2.tickets.repository.IssueRepository;
import it.sf2.tickets.repository.ProjectRepository;
import it.sf2.tickets.repository.ProjectUserRepository;
import it.sf2.tickets.repository.UserRepository;
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
