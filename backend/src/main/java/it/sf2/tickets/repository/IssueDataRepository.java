package it.sf2.tickets.repository;

import it.sf2.tickets.domain.IssueData;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueDataRepository extends JpaRepository<IssueData, Long> {
    List<IssueData> findByProjectId(Long projectId);
    List<IssueData> findByIssueId(Long issueId);
    List<IssueData> findByIssueIdIn(Collection<Long> issueIds);
    List<IssueData> findByIssueIdAndDefinitionIdIn(Long issueId, Collection<Long> definitionIds);
    void deleteByIssueIdAndDefinitionIdIn(Long issueId, Collection<Long> definitionIds);
    boolean existsByIssueIdAndDefinitionId(Long issueId, Long definitionId);
    boolean existsByIssueIdAndDefinitionIdAndIdNot(Long issueId, Long definitionId, Long id);
    boolean existsByDefinitionIdAndValue(Long definitionId, String value);
    boolean existsByDefinitionId(Long definitionId);
}
