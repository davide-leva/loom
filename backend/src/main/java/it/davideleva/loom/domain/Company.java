package it.davideleva.loom.domain;

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
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Company {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(name = "team_company", nullable = false)
    private boolean teamCompany;

    @Column(name = "primary_color", nullable = false, length = 16)
    private String primaryColor = "blue";

    @Column(name = "logo_extension", length = 8)
    private String logoExtension;

    public Company(String name) {
        this.name = name;
    }

    public Company(String name, boolean teamCompany) {
        this.name = name;
        this.teamCompany = teamCompany;
    }
}
