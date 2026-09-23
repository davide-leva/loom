package it.davideleva.loom.repository;

import it.davideleva.loom.domain.IssueFieldDefinition;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueFieldDefinitionRepository extends JpaRepository<IssueFieldDefinition, Long> {
    List<IssueFieldDefinition> findByProject_Id(Long projectId);
}
