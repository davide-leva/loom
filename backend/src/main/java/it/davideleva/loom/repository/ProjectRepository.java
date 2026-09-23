package it.davideleva.loom.repository;

import it.davideleva.loom.domain.Project;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    List<Project> findByCompany_Id(Long companyId);

    @Query("select project from Project project where project.archiveAfterDays is not null")
    List<Project> findAutoArchiveProjects();
}
