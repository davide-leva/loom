package it.davideleva.loom.notification;

import java.time.Instant;
import java.util.List;

/**
 * Aggregated email content for a single user, computed from the raw event stream.
 *
 * One {@link EmailDigest} is built per scan iteration and rendered into a single
 * digest email. The structure is intentionally simple so the {@link EventDigestService}
 * that produces it can stay a pure-logic, easily unit-tested component.
 */
public record EmailDigest(UserDigest user, Instant oldestEvent, Instant newestEvent, List<IssueDigest> issues) {

    public record UserDigest(Long id, String username, String email, String fullName) {}

    /**
     * Per-issue digest block. Carries the metadata the email renderer needs to give the
     * reader enough context: tipologia (anomalia/miglioria/implementazione), stato corrente
     * e sviluppatore assegnato, oltre al titolo e alla lista di
     * {@link DigestItem}.
     */
    public record IssueDigest(Long id, Long projectId, String projectName, String title,
                              boolean internal,
                              String issueType, String currentStatus, String developerName,
                              List<DigestItem> items) {}

    public sealed interface DigestItem permits
        StatusTransition, CommentsAdded, AttachmentsAdded, Planned, ValuesChanged, Created, Approved, Archived {
    }

    /** Status change collapsed to its first source and last destination. Italian labels. */
    public record StatusTransition(String from, String to) implements DigestItem {}

    /** Net count of newly added comments plus a few text previews of the latest ones. */
    public record CommentsAdded(int count, List<String> previews) implements DigestItem {}

    /** Net count of newly added attachments plus their file names. */
    public record AttachmentsAdded(int count, List<String> fileNames) implements DigestItem {}

    /**
     * Issue has been classified (type/developer assigned). {@code type} or {@code developer}
     * can be {@code null} if the planner only changed one of the two.
     */
    public record Planned(String type, String developer) implements DigestItem {}

    /**
     * Custom-field values have been edited. Multiple edits are collapsed into one entry
     * that still carries per-field detail (field label + before/after value).
     */
    public record ValuesChanged(List<FieldChange> changes) implements DigestItem {}

    /** Field label and old/new value from the latest {@code ISSUE_VALUES_CHANGED} event in the window. */
    public record FieldChange(String label, String before, String after) {}

    /** Issue was just created in this digest window. */
    public record Created() implements DigestItem {}

    /** Issue has been approved. {@code approver} is the username of who approved it. */
    public record Approved(String approver) implements DigestItem {}

    /** Issue has been archived. {@code reason} carries the controller-supplied message (e.g. "Archiviata manualmente da …"). */
    public record Archived(String reason) implements DigestItem {}
}
