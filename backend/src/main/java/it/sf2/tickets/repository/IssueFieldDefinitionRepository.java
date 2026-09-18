package it.sf2.tickets.repository;

import it.sf2.tickets.domain.IssueFieldDefinition;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueFieldDefinitionRepository extends JpaRepository<IssueFieldDefinition, Long> {
    List<IssueFieldDefinition> findByProject_Id(Long projectId);
}
