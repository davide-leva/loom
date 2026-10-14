package it.davideleva.loom.notification;

import it.davideleva.loom.domain.*;

public final class EmailPreferencePolicy {
    private EmailPreferencePolicy() {}

    public static String exclusionReason(User user, Event event) {
        if (Boolean.FALSE.equals(user.getWantEmail())) return "GLOBAL_EMAIL_DISABLED";
        Issue issue = event.getIssue();
        if (user.isEmailOnlyOwn() && (issue == null || issue.getIssuer() == null
            || !user.getId().equals(issue.getIssuer().getId()))) return "ONLY_OWN_ISSUES";
        return switch (event.getType()) {
            case ISSUE_CREATED -> user.isEmailNewIssues() ? null : "NEW_ISSUES_DISABLED";
            case ISSUE_COMMENT_ADDED, ISSUE_COMMENT_DELETED -> user.isEmailComments() ? null : "COMMENTS_DISABLED";
            case ISSUE_STATUS_CHANGED, ISSUE_APPROVED -> {
                if (user.getEmailStatusChanges() == EmailStatusPreference.NONE) yield "STATUS_CHANGES_DISABLED";
                if (user.getEmailStatusChanges() == EmailStatusPreference.RELEASED) {
                    var change = EventDigestService.StatusChange.parse(event.getData());
                    if (change == null || change.to() != IssueStatus.RELEASED) yield "ONLY_RELEASED_STATUS";
                }
                yield null;
            }
            default -> user.isEmailDataChanges() ? null : "DATA_CHANGES_DISABLED";
        };
    }
}
