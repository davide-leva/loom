package it.sf2.tickets.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "issues_data")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueData {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    // The two composite foreign keys in the migration enforce a common project.
    @Column(name = "issue_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private Long issueId;

    @Column(name = "project_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private Long projectId;

    @Column(name = "issue_dtype_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private Long definitionId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, columnDefinition = "text")
    private String value;

    public IssueData(Long issueId, Long projectId, Long definitionId, int position, String value) {
        this.issueId = issueId;
        this.projectId = projectId;
        this.definitionId = definitionId;
        this.position = position;
        this.value = value;
    }

}
