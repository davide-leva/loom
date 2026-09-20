package it.sf2.tickets.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "projects")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @Column(nullable = false, length = 32)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    @Column(name = "external_auth_enabled", nullable = false)
    private boolean externalAuthEnabled;

    @Column(name = "logo_extension", length = 8)
    private String logoExtension;

    @OneToMany(mappedBy = "project", cascade = CascadeType.REMOVE)
    private List<ExternalJwtSecret> externalJwtSecrets = new ArrayList<>();

    @Column(name = "archive_after_days")
    private Integer archiveAfterDays;

    public Project(String name, Company company) {
        this.name = name;
        this.company = company;
    }

}
