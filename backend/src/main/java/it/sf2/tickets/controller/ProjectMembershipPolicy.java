package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;

public final class ProjectMembershipPolicy {
    private ProjectMembershipPolicy() {}

    public static boolean isAutomaticCompanyMember(Project project, User user) {
        return project.getCompany() != null && user.getCompany() != null
            && project.getCompany().getId().equals(user.getCompany().getId());
    }

    public static void requireParticipant(Project project, User user, boolean explicitMember) {
        if (user.getRole() == Role.ADMIN) return;
        if (!isAutomaticCompanyMember(project, user) && !explicitMember) {
            throw ApiLookup.badRequest("User does not belong to this project");
        }
    }
}
