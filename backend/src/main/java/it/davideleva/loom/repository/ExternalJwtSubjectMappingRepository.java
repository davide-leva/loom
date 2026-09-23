package it.davideleva.loom.repository;

import it.davideleva.loom.domain.ExternalJwtSubjectMapping;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalJwtSubjectMappingRepository extends JpaRepository<ExternalJwtSubjectMapping, Long> {
    List<ExternalJwtSubjectMapping> findBySecret_IdOrderBySubjectAsc(Long secretId);
    Optional<ExternalJwtSubjectMapping> findBySecret_IdAndSubject(Long secretId, String subject);
    boolean existsBySecret_IdAndSubject(Long secretId, String subject);
}
