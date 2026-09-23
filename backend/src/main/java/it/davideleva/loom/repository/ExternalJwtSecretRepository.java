package it.davideleva.loom.repository;

import it.davideleva.loom.domain.ExternalJwtSecret;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalJwtSecretRepository extends JpaRepository<ExternalJwtSecret, Long> {
    List<ExternalJwtSecret> findByProject_IdOrderByNameAsc(Long projectId);
    List<ExternalJwtSecret> findByProject_ExternalAuthEnabledTrue();
    boolean existsByProject_IdAndNameIgnoreCase(Long projectId, String name);
}
