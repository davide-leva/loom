package it.davideleva.loom.domain;

import jakarta.persistence.Column;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "external_jwt_secrets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExternalJwtSecret {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(name = "encrypted_secret", nullable = false, length = 1024)
    private String encryptedSecret;

    @Column(nullable = false, length = 5)
    private String algorithm = "HS256";

    @Column(name = "secret_base64", nullable = false)
    private boolean secretBase64;

    @OneToMany(mappedBy = "secret", cascade = CascadeType.REMOVE)
    private List<ExternalJwtSubjectMapping> mappings = new ArrayList<>();

    public ExternalJwtSecret(Project project, String name, String encryptedSecret, String algorithm, boolean secretBase64) {
        this.project = project;
        this.name = name;
        this.encryptedSecret = encryptedSecret;
        this.algorithm = algorithm;
        this.secretBase64 = secretBase64;
    }

    public void update(String name, String encryptedSecret, String algorithm, boolean secretBase64) {
        this.name = name;
        if (encryptedSecret != null) this.encryptedSecret = encryptedSecret;
        this.algorithm = algorithm;
        this.secretBase64 = secretBase64;
    }
}
