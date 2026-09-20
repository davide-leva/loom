package it.sf2.tickets.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "issue_dtype")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class IssueFieldDefinition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    @Setter(AccessLevel.NONE)
    private Project project;

    @Column(name = "cod", nullable = false, length = 8)
    private String code;

    @Column(nullable = false, length = 64)
    private String label;

    @Column(nullable = false)
    private boolean mandatory;

    @Column(nullable = false)
    private boolean multiple;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private FieldType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private FieldScope scope = FieldScope.USER;

    @Column(columnDefinition = "text")
    private String description;

    public IssueFieldDefinition(Project project, String code, String label, FieldType type) {
        this.project = project;
        this.code = code;
        this.label = label;
        this.type = type;
    }

}
