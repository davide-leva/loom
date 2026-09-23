package it.davideleva.loom.notification;

import it.davideleva.loom.controller.ProjectMembershipPolicy;
import it.davideleva.loom.domain.Event;
import it.davideleva.loom.domain.EventType;
import it.davideleva.loom.domain.Issue;
import it.davideleva.loom.domain.IssueStatus;
import it.davideleva.loom.domain.IssueType;
import it.davideleva.loom.domain.Project;
import it.davideleva.loom.domain.Role;
import it.davideleva.loom.domain.User;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
 *       dropped. Up to three preview lines from the most recent add-events are kept so the
 *       email carries a meaningful excerpt rather than just a count.</li>
 *   <li><b>Attachments:</b> net-counted like comments and keep up to five file names. Only
 *       add events exist today; future delete events flow through the same counter.</li>
 *   <li><b>Field changes:</b> multiple {@code ISSUE_VALUES_CHANGED} events on the same issue
 *       collapse to one entry that carries the parsed field-level before/after details from
 *       the latest such event.</li>
 *   <li><b>Planning / approval / archive:</b> the controller-supplied data payload is parsed
 *       back into structured fields so the email renderer can show the actual label/value
 *       pairs and not just a "Pianificata" placeholder.</li>
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

    /** Maximum number of comment previews included in the digest. */
    static final int COMMENT_PREVIEW_LIMIT = 3;
    /** Maximum number of attachment file names included in the digest. */
    static final int ATTACHMENT_PREVIEW_LIMIT = 5;
    /** Maximum number of field changes included in the digest. */
    static final int FIELD_CHANGE_LIMIT = 10;
    /** Truncate a comment preview to this many characters to keep the email readable. */
    static final int COMMENT_PREVIEW_CHARS = 160;
    static final String DELETED_OR_ARCHIVED_DUMMY_ISSUE_TYPE = null;

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
        Issue issue = anyEvent.getIssue();
        Project project = anyEvent.getProject();
        String title = issue != null ? issue.getTitle() : "";
        boolean internal = anyEvent.isInternal();

        // Re-check project visibility right before rendering. The user may have lost
        // project membership after the events were recorded.
        if (project != null && !canSeeProject(user, project)) return null;
        if (internal && !internalAllowed) return null;

        String issueType = (issue == null || issue.getIssueType() == null) ? null : issueTypeLabel(issue.getIssueType());
        String currentStatus = issue == null ? null : statusLabel(issue.getStatus());
        String developerName = (issue == null || issue.getDeveloper() == null) ? null : userLabel(issue.getDeveloper());

        List<EmailDigest.DigestItem> items = new ArrayList<>();

        // Status transition collapse: scan ISSUE_STATUS_CHANGED events in order, only
        // emit (firstFrom, lastTo). Skip when firstFrom == lastTo (net-zero).
        IssueStatus firstFrom = null;
        IssueStatus lastTo = null;
        boolean sawUnparseableStatus = false;
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_STATUS_CHANGED) {
                StatusChange change = StatusChange.parse(event.getData());
                if (change == null) { sawUnparseableStatus = true; continue; }
                if (firstFrom == null) firstFrom = change.from();
                lastTo = change.to();
            }
        }
        if (firstFrom != null && lastTo != null && firstFrom != lastTo) {
            items.add(new EmailDigest.StatusTransition(statusLabel(firstFrom), statusLabel(lastTo)));
        } else if (sawUnparseableStatus && issue != null && issue.getStatus() != null) {
            // Fallback: at least one ISSUE_STATUS_CHANGED existed in the window but we
            // couldn't parse its payload (e.g. legacy event row). Render the transition
            // against the issue's current status — better than dropping the whole digest.
            items.add(new EmailDigest.StatusTransition("aggiornato", statusLabel(issue.getStatus())));
        }

        // Comment net count + previews: walk events in order so the most recent
        // additions show up first in the previews list.
        int netComments = 0;
        LinkedHashSet<String> commentPreviews = new LinkedHashSet<>();
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_COMMENT_ADDED) {
                netComments++;
                String preview = truncate(parseCommentText(event.getData()), COMMENT_PREVIEW_CHARS);
                if (preview != null && commentPreviews.size() < COMMENT_PREVIEW_LIMIT) commentPreviews.add(preview);
            } else if (event.getType() == EventType.ISSUE_COMMENT_DELETED) {
                netComments--;
            }
        }
        if (netComments > 0) {
            items.add(new EmailDigest.CommentsAdded(netComments, new ArrayList<>(commentPreviews)));
        }

        // Attachments: only adds today, so the "net count" is the add count.
        int netAttachments = 0;
        List<String> attachmentNames = new ArrayList<>();
        for (Event event : events) {
            if (event.getType() == EventType.ISSUE_ATTACHMENT_UPLOADED) {
                netAttachments++;
                String name = parseAttachmentName(event.getData());
                if (name != null && attachmentNames.size() < ATTACHMENT_PREVIEW_LIMIT) attachmentNames.add(name);
            }
        }
        if (netAttachments > 0) {
            items.add(new EmailDigest.AttachmentsAdded(netAttachments, attachmentNames));
        }

        // Field values: use the latest ISSUE_VALUES_CHANGED payload in the window so
        // the reader sees the most recent state, not the intermediate ones.
        List<EmailDigest.FieldChange> fieldChanges = List.of();
        for (int i = events.size() - 1; i >= 0; i--) {
            Event event = events.get(i);
            if (event.getType() == EventType.ISSUE_VALUES_CHANGED) {
                fieldChanges = parseFieldChanges(event.getData(), FIELD_CHANGE_LIMIT);
                break;
            }
        }
        if (!fieldChanges.isEmpty()) items.add(new EmailDigest.ValuesChanged(fieldChanges));

        if (createdHere) items.add(new EmailDigest.Created());

        // Planning: walk backwards so the latest planner edit wins (events are sorted by id asc).
        String plannedType = null;
        String plannedDeveloper = null;
        for (int i = events.size() - 1; i >= 0 && (plannedType == null || plannedDeveloper == null); i--) {
            Event event = events.get(i);
            if (event.getType() == EventType.ISSUE_PLANNED) {
                Map<String, String> parsed = parsePlanning(event.getData());
                if (plannedType == null) plannedType = parsed.get("type");
                if (plannedDeveloper == null) plannedDeveloper = parsed.get("developer");
            }
        }
        if (plannedType != null || plannedDeveloper != null) {
            items.add(new EmailDigest.Planned(plannedType, plannedDeveloper));
        }

        // Approval: data only carries the status transition; the approver username
        // comes from the event actor. Use the latest APPROVED event so a re-approval
        // reflects the most recent reviewer.
        String approver = null;
        for (int i = events.size() - 1; i >= 0 && approver == null; i--) {
            Event event = events.get(i);
            if (event.getType() == EventType.ISSUE_APPROVED) {
                approver = event.getActor() != null ? event.getActor().getUsername() : null;
            }
        }
        if (approver != null) items.add(new EmailDigest.Approved(approver));

        // Archived: render the controller-supplied reason (e.g. "Archiviata manualmente da …").
        if (archivedHere) {
            String reason = "Archiviata";
            for (Event event : events) {
                if (event.getType() == EventType.ISSUE_ARCHIVED) {
                    String parsed = parseArchivedReason(event.getData());
                    if (parsed != null) reason = parsed;
                    break;
                }
            }
            items.add(new EmailDigest.Archived(reason));
        }

        if (items.isEmpty()) return null;

        return new EmailDigest.IssueDigest(
            issueId,
            project == null ? null : project.getId(),
            project == null ? "" : project.getName(),
            title,
            internal,
            issueType,
            currentStatus,
            developerName,
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
            if (data == null || data.isBlank()) return null;
            // Format emitted by the controller: a human-readable line followed by
            // a machine-parseable "REPORTED -> IN_PROGRESS" line. Older events only
            // have the human-readable form ("Stato: ... → ..."), so we look for any
            // line that names two enum values separated by ASCII or Unicode arrow.
            for (String line : data.split("\n")) {
                StatusChange parsed = parseLine(line);
                if (parsed != null) return parsed;
            }
            return null;
        }

        private static StatusChange parseLine(String line) {
            if (line == null) return null;
            // Accept ASCII " -> " and Unicode " → " (U+2192) — older payloads use the latter.
            String normalized = line.replace("→", "->");
            // Try the canonical "REPORTED -> IN_PROGRESS" format first.
            int arrow = normalized.indexOf(" -> ");
            if (arrow < 0) {
                arrow = normalized.indexOf("->");
                if (arrow < 0) return null;
            }
            int sep = arrow;
            String head = normalized.substring(0, sep).trim();
            String tail = normalized.substring(sep + " -> ".length()).trim();
            // Strip "Stato:" or "Stato: " prefix from the human-readable line.
            if (head.regionMatches(true, 0, "stato:", 0, 6)) head = head.substring(6).trim();
            head = enumValueFor(head);
            tail = enumValueFor(tail);
            if (head == null || tail == null) return null;
            try {
                IssueStatus from = IssueStatus.valueOf(head);
                IssueStatus to = IssueStatus.valueOf(tail);
                return new StatusChange(from, to);
            } catch (IllegalArgumentException exception) {
                return null;
            }
        }

        /**
         * Map a status label (English enum or Italian display label) back to its enum
         * constant name. Used by {@link #parseLine(String)} to accept payloads written
         * in the human-readable form ("Segnalato", "In lavorazione") emitted by the
         * controller before the dual-format fix.
         */
        private static String enumValueFor(String label) {
            if (label == null) return null;
            String trimmed = label.trim();
            if (trimmed.isEmpty()) return null;
            // Already an enum constant?
            try {
                IssueStatus.valueOf(trimmed);
                return trimmed;
            } catch (IllegalArgumentException ignored) {
                // Fall through to label lookup.
            }
            return switch (trimmed.toLowerCase(java.util.Locale.ITALY)) {
                case "segnalato" -> "REPORTED";
                case "in lavorazione", "in_lavorazione" -> "IN_PROGRESS";
                case "completato" -> "COMPLETED";
                case "rilasciato" -> "RELEASED";
                case "approvato" -> "APPROVED";
                default -> null;
            };
        }
    }

    // ---------- payload parsers ----------

    /**
     * Extracts the comment text from an {@code ISSUE_COMMENT_ADDED} or
     * {@code ISSUE_COMMENT_DELETED} payload. Strips the leading marker line
     * ("Commento:\n" or "Commento eliminato:\n") and returns whatever follows.
     */
    static String parseCommentText(String data) {
        if (data == null) return null;
        String stripped = stripKnownPrefix(data, "Commento eliminato:");
        stripped = stripKnownPrefix(stripped, "Commento:");
        return stripped == null || stripped.isBlank() ? null : stripped.trim();
    }

    /**
     * Extracts the original file name from an {@code ISSUE_ATTACHMENT_UPLOADED} payload
     * shaped as {@code "File: <name>\nDimensione: <size> byte"}. The marker must lead the
     * payload so random occurrences inside a multi-line text don't get picked up.
     */
    static String parseAttachmentName(String data) {
        if (data == null || !data.startsWith("File:")) return null;
        int start = "File:".length();
        int end = data.indexOf('\n', start);
        String name = (end < 0 ? data.substring(start) : data.substring(start, end)).trim();
        return name.isEmpty() ? null : name;
    }

    /**
     * Parses the controller payload for {@code ISSUE_VALUES_CHANGED} events into a list of
     * {@link EmailDigest.FieldChange}s. Skips lines that don't match the expected shape.
     * Stops at {@code maxLines} entries.
     */
    static List<EmailDigest.FieldChange> parseFieldChanges(String data, int maxLines) {
        if (data == null || data.isBlank()) return List.of();
        List<EmailDigest.FieldChange> output = new ArrayList<>();
        for (String line : data.split("\n")) {
            if (output.size() >= maxLines) break;
            int arrow = line.indexOf("→");
            if (arrow < 0) continue;
            int colon = line.indexOf(':');
            if (colon < 0 || colon > arrow) continue;
            String label = line.substring(0, colon).trim();
            String before = line.substring(colon + 1, arrow).trim();
            String after = line.substring(arrow + 1).trim();
            if (label.isEmpty()) continue;
            output.add(new EmailDigest.FieldChange(label, before, after));
        }
        return output;
    }

    /**
     * Parses the controller payload for {@code ISSUE_PLANNED} events into a map keyed by
     * {@code "type"} and {@code "developer"}. Lines look like
     * {@code "Tipologia: Anomalia → Miglioria"} or {@code "Sviluppatore: x → y"}.
     * Only the destination value (after the {@code →}) is kept — it represents the new
     * state the planner committed.
     */
    static Map<String, String> parsePlanning(String data) {
        if (data == null) return Map.of();
        Map<String, String> output = new LinkedHashMap<>();
        for (String line : data.split("\n")) {
            int colon = line.indexOf(':');
            int arrow = line.indexOf('→');
            if (colon < 0 || arrow < 0 || colon > arrow) continue;
            String key = line.substring(0, colon).trim();
            String value = line.substring(arrow + 1).trim();
            if (key.equalsIgnoreCase("Tipologia") && !value.isBlank()) output.put("type", value);
            if (key.equalsIgnoreCase("Sviluppatore") && !value.isBlank()) output.put("developer", value);
        }
        return output;
    }

    /**
     * Extracts the archive reason from the controller payload, shaped as
     * {@code "Archiviata manualmente da <username>."} Returns the raw message without the
     * trailing period, or {@code null} if the payload doesn't match.
     */
    static String parseArchivedReason(String data) {
        if (data == null) return null;
        String trimmed = data.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.endsWith(".")) trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
        return trimmed;
    }

    private static String stripKnownPrefix(String value, String prefix) {
        if (value == null) return null;
        if (value.startsWith(prefix)) return value.substring(prefix.length());
        return value;
    }

    private static String truncate(String value, int maxChars) {
        if (value == null) return null;
        String collapsed = value.replaceAll("\\s+", " ").trim();
        if (collapsed.length() <= maxChars) return collapsed;
        return collapsed.substring(0, maxChars - 1).trim() + "…";
    }

    private static String statusLabel(IssueStatus status) {
        if (status == null) return null;
        return switch (status) {
            case REPORTED -> "Segnalato";
            case IN_PROGRESS -> "In lavorazione";
            case COMPLETED -> "Completato";
            case RELEASED -> "Rilasciato";
            case APPROVED -> "Approvato";
        };
    }

    private static String issueTypeLabel(IssueType type) {
        if (type == null) return null;
        return switch (type) {
            case ANOMALY -> "Anomalia";
            case IMPROVEMENT -> "Miglioria";
            case IMPLEMENTATION -> "Implementazione";
        };
    }

    private static String userLabel(User user) {
        return user == null ? null : user.getUsername();
    }
}
