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

    public record IssueDigest(Long id, Long projectId, String projectName, String title,
                              boolean internal, List<DigestItem> items) {}

    public sealed interface DigestItem permits
        StatusTransition, CommentsAdded, AttachmentsAdded, Planned, ValuesChanged, Created, Approved, Archived {
    }

    /** Status change collapsed to its first source and last destination. */
    public record StatusTransition(String from, String to) implements DigestItem {}

    /** Net count of newly added comments (adds minus deletes). */
    public record CommentsAdded(int count) implements DigestItem {}

    /** Net count of newly added attachments. */
    public record AttachmentsAdded(int count) implements DigestItem {}

    /** Issue has been classified (type/developer assigned). */
    public record Planned() implements DigestItem {}

    /** Custom-field values have been edited. Multiple edits are collapsed to one entry. */
    public record ValuesChanged() implements DigestItem {}

    /** Issue was just created in this digest window. */
    public record Created() implements DigestItem {}

    /** Issue was approved. */
    public record Approved() implements DigestItem {}

    /** Issue was archived. Only emitted when the issue is not also being deleted in the window. */
    public record Archived() implements DigestItem {}
}
