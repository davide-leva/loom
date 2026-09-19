package it.sf2.tickets.repository;

import it.sf2.tickets.domain.ExternalJwtSubjectMapping;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalJwtSubjectMappingRepository extends JpaRepository<ExternalJwtSubjectMapping, Long> {
    List<ExternalJwtSubjectMapping> findBySecret_IdOrderBySubjectAsc(Long secretId);
    Optional<ExternalJwtSubjectMapping> findBySecret_IdAndSubject(Long secretId, String subject);
    boolean existsBySecret_IdAndSubject(Long secretId, String subject);
}
