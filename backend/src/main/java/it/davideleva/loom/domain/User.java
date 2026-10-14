package it.davideleva.loom.domain;

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
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Setter(AccessLevel.NONE)
    private Long id;

    @Column(name = "first_name", length = 32)
    private String firstName;

    @Column(name = "last_name", length = 32)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Role role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    @Column(nullable = false, length = 128)
    private String email;

    @Column(nullable = false, length = 64)
    private String username;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "want_email")
    private Boolean wantEmail;

    @Column(name = "email_only_own", nullable = false)
    private boolean emailOnlyOwn;

    @Column(name = "email_new_issues", nullable = false)
    private boolean emailNewIssues = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "email_status_changes", nullable = false)
    private EmailStatusPreference emailStatusChanges = EmailStatusPreference.ALL;

    @Column(name = "email_comments", nullable = false)
    private boolean emailComments = true;

    @Column(name = "email_data_changes", nullable = false)
    private boolean emailDataChanges = true;

    public User(String username, String email, String passwordHash, Role role, Company company) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.company = company;
    }

}
