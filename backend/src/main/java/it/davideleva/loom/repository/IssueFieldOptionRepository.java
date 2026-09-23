package it.davideleva.loom.repository;

import it.davideleva.loom.domain.IssueFieldOption;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueFieldOptionRepository extends JpaRepository<IssueFieldOption, Long> {
    List<IssueFieldOption> findByDefinition_Project_Id(Long projectId);
    List<IssueFieldOption> findByDefinition_Id(Long definitionId);
    boolean existsByDefinition_IdAndValueAndActiveTrue(Long definitionId, String value);
}
