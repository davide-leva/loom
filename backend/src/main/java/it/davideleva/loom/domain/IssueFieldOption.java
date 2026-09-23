package it.davideleva.loom.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "issue_dtype_options")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueFieldOption {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_dtype_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private IssueFieldDefinition definition;

    @Column(nullable = false, length = 64)
    private String value;

    @Column(nullable = false, length = 64)
    private String label;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    public IssueFieldOption(IssueFieldDefinition definition, String value, String label) {
        this.definition = definition;
        this.value = value;
        this.label = label;
    }

}
