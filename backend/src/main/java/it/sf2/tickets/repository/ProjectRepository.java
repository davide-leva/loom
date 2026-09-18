package it.sf2.tickets.repository;

import it.sf2.tickets.domain.Project;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    List<Project> findByCompany_Id(Long companyId);
}
