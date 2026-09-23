package it.davideleva.loom.controller;

import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;

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
