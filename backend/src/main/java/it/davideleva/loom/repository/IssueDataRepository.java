package it.davideleva.loom.repository;

import it.davideleva.loom.domain.IssueData;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface IssueDataRepository extends JpaRepository<IssueData, Long> {
    List<IssueData> findByProjectId(Long projectId);
    List<IssueData> findByIssueId(Long issueId);
    List<IssueData> findByIssueIdIn(Collection<Long> issueIds);
    List<IssueData> findByIssueIdAndDefinitionIdIn(Long issueId, Collection<Long> definitionIds);

    @Modifying(flushAutomatically = true)
    @Query("delete from IssueData d where d.issueId = :issueId and d.definitionId in :definitionIds")
    void deleteByIssueIdAndDefinitionIdIn(@Param("issueId") Long issueId,
                                         @Param("definitionIds") Collection<Long> definitionIds);

    boolean existsByIssueIdAndDefinitionId(Long issueId, Long definitionId);
    boolean existsByIssueIdAndDefinitionIdAndIdNot(Long issueId, Long definitionId, Long id);
    boolean existsByDefinitionIdAndValue(Long definitionId, String value);
    boolean existsByDefinitionId(Long definitionId);
}
