package it.sf2.tickets.notification;

import it.sf2.tickets.controller.ProjectMembershipPolicy;
import it.sf2.tickets.domain.Event;
import it.sf2.tickets.domain.EventType;
import it.sf2.tickets.domain.IssueStatus;
import it.sf2.tickets.domain.Project;
import it.sf2.tickets.domain.Role;
import it.sf2.tickets.domain.User;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Pure-logic service that turns a stream of raw events into a single
 * {@link EmailDigest} per user.
 *
 * The collapse rules are:
 * <ul>
 *   <li><b>Status transitions:</b> a chain A → B → C for the same issue collapses to a
 *       single "A → C" line. If the chain returns to the start (A → B → A) the transition
 *       is omitted entirely.</li>
 *   <li><b>Comments:</b> adds and deletes are net-counted. A net count of 0 or below is
 *       dropped. A net count above 0 is rendered as a single "N nuovi commenti" entry.</li>
 *   <li><b>Attachments:</b> net-counted like comments. Currently only add events exist in
 *       the schema; deletes would already flow through a future
 *       {@code ISSUE_ATTACHMENT_DELETED} event when one is added.</li>
 *   <li><b>Field changes:</b> any number of {@code ISSUE_VALUES_CHANGED} events on the
 *       same issue collapses to a single "Campi aggiornati" entry.</li>
 *   <li><b>Issue added then deleted:</b> if an issue has both {@code ISSUE_CREATED} and
 *       {@code ISSUE_DELETED} (or {@code ISSUE_ARCHIVED}) events within the same window
 *       — and the delete/archive is the most recent — the entire issue disappears from
 *       the digest.</li>
 *   <li><b>Visibility:</b> each candidate issue is re-checked against the user's current
 *       membership and role. Internal-only events are excluded for non-internal-allowed
 *       users; cross-company issues are dropped when the user is no longer a participant.</li>
 * </ul>
 */
@Component
public class EventDigestService {

    /**
     * Build a digest for {@code user} from {@code events}, which must already be
     * pre-filtered to that user (e.g. via {@code findByUserAndNotifiedFalse}).
     *
     * @return the digest, or {@code null} if nothing visible to this user remains
     *         after collapsing and filtering.
     */
    public EmailDigest buildDigest(User user, Collection<Event> events) {
        if (user == null || events == null || events.isEmpty()) return null;

        boolean internalAllowed = user.getRole() == Role.ADMIN || user.getRole() == Role.TEAM;

        // Group events by issueRefId so an issue that was hard-deleted between two events
        // still keeps its history together.
        Map<Long, List<Event>> byIssue = new LinkedHashMap<>();
        Instant oldest = null;
        Instant newest = null;
        for (Event event : events) {
            if (event == null) continue;
            if (!isVisibleTo(user, event, internalAllowed)) continue;
            Long issueId = event.getIssueRefId();
            if (issueId == null) continue; // project-level events aren't part of the per-issue digest
            byIssue.computeIfAbsent(issueId, key -> new ArrayList<>()).add(event);
            oldest = oldest == null || event.getEventDate().isBefore(oldest) ? event.getEventDate() : oldest;
            newest = newest == null || event.getEventDate().isAfter(newest) ? event.getEventDate() : newest;
        }

        if (byIssue.isEmpty()) return null;

        List<EmailDigest.IssueDigest> issueDigests = new ArrayList<>(byIssue.size());
        for (Map.Entry<Long, List<Event>> entry : byIssue.entrySet()) {
            List<Event> issueEvents = entry.getValue();
            issueEvents.sort((a, b) -> Long.compare(a.getId(), b.getId()));
            EmailDigest.IssueDigest digest = collapse(entry.getKey(), issueEvents, user, internalAllowed);
            if (digest != null) issueDigests.add(digest);
        }

        if (issueDigests.isEmpty()) return null;

        return new EmailDigest(
            new EmailDigest.UserDigest(user.getId(), user.getUsername(), user.getEmail(), fullName(user)),
            oldest, newest, issueDigests);
    }

    private static String fullName(User user) {
        String first = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String last = user.getLastName() == null ? "" : user.getLastName().trim();
        String joined = (first + " " + last).trim();
        return joined.isEmpty() ? user.getUsername() : joined;
    }

    private EmailDigest.IssueDigest collapse(Long issueId, List<Event> events, User user, boolean internalAllowed) {
        // An issue whose window starts with a create and ends with a delete/archive is
        // not visible to the user anymore — drop the whole digest for it.
        boolean createdHere = false;
        boolean deletedHere = false;
        boolean archivedHere = false;
        for (Event event : events) {
            switch (event.getType()) {
                case ISSUE_CREATED -> createdHere = true;
                case ISSUE_DELETED -> deletedHere = true;
                case ISSUE_ARCHIVED -> archivedHere = true;
                default -> { /* not relevant to net-presence */ }
            }
        }
        if ((deletedHere || archivedHere)) {
            // Created + deleted/archived within the window: nothing to report.
            return null;
        }

        // We need the issue for display fields. If it was hard-deleted the event row
        // keeps the project/issueRefId only — fall back to the project from any event.
        Event anyEvent = events.get(0);
        Project project = anyEvent.getProject();
        String title = anyEvent.getIssue() != null ? anyEvent.getIssue().getTitle() : "";
        boolean internal = anyEvent.isInternal();

        // Re-check project visibility right before rendering. The user may have lost
        // project membership after the events were recorded.
        if (project != null && !canSeeProject(user, project)) return null;
        if (internal && !internalAllowed) return null;

        List<EmailDigest.DigestItem> items = new ArrayList<>();

        // Status transition collapse: scan ISSUE_STATUS_CHANGED events in order, only
        // emit (firstFrom, lastTo). Skip when firstFrom == lastTo (net-zero).
        IssueStatus firstFrom = null;
        IssueStatus lastTo = null;
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_STATUS_CHANGED) {
                StatusChange change = StatusChange.parse(event.getData());
                if (change == null) continue;
                if (firstFrom == null) firstFrom = change.from();
                lastTo = change.to();
            }
        }
        if (firstFrom != null && lastTo != null && firstFrom != lastTo) {
            items.add(new EmailDigest.StatusTransition(firstFrom.name(), lastTo.name()));
        }

        // Comment net count: adds minus deletes.
        int netComments = 0;
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_COMMENT_ADDED) netComments++;
            else if (event.getType() == EventType.ISSUE_COMMENT_DELETED) netComments--;
        }
        if (netComments > 0) items.add(new EmailDigest.CommentsAdded(netComments));

        // Attachment net count (only adds today).
        int netAttachments = 0;
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_ATTACHMENT_UPLOADED) netAttachments++;
        }
        if (netAttachments > 0) items.add(new EmailDigest.AttachmentsAdded(netAttachments));

        // Field values: any number of edits collapses to one line.
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_VALUES_CHANGED) {
                items.add(new EmailDigest.ValuesChanged());
                break;
            }
        }

        if (createdHere) items.add(new EmailDigest.Created());
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_PLANNED) {
                items.add(new EmailDigest.Planned());
                break;
            }
        }
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_APPROVED) {
                items.add(new EmailDigest.Approved());
                break;
            }
        }

        if (items.isEmpty()) return null;

        return new EmailDigest.IssueDigest(
            issueId,
            project == null ? null : project.getId(),
            project == null ? "" : project.getName(),
            title,
            internal,
            items);
    }

    private boolean isVisibleTo(User user, Event event, boolean internalAllowed) {
        if (event.isInternal() && !internalAllowed) return false;
        if (event.getProject() != null && !canSeeProject(user, event.getProject())) return false;
        return true;
    }

    private boolean canSeeProject(User user, Project project) {
        if (user.getRole() == Role.ADMIN) return true;
        return ProjectMembershipPolicy.isAutomaticCompanyMember(project, user);
    }

    /** Parsed form of an {@code ISSUE_STATUS_CHANGED} event's payload. */
    record StatusChange(IssueStatus from, IssueStatus to) {
        static StatusChange parse(String data) {
            if (data == null) return null;
            // Format emitted by the controller: "REPORTED -> IN_PROGRESS" or
            // an older single-status payload. Be defensive.
            String[] parts = data.split("->");
            if (parts.length != 2) return null;
            try {
                IssueStatus from = IssueStatus.valueOf(parts[0].trim());
                IssueStatus to = IssueStatus.valueOf(parts[1].trim());
                return new StatusChange(from, to);
            } catch (IllegalArgumentException exception) {
                return null;
            }
        }
    }
}
