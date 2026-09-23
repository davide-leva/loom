package it.davideleva.loom.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@EqualsAndHashCode
@NoArgsConstructor
public class IssueUserViewId implements Serializable {
    @Column(name = "issue_id")
    private Long issueId;

    @Column(name = "user_id")
    private Long userId;

    public IssueUserViewId(Long issueId, Long userId) {
        this.issueId = issueId;
        this.userId = userId;
    }
}
