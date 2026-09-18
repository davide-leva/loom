package it.sf2.tickets.repository;

import it.sf2.tickets.domain.ProjectUser;
import it.sf2.tickets.domain.ProjectUserId;
import it.sf2.tickets.domain.Role;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import it.sf2.tickets.domain.Project;

public interface ProjectUserRepository extends JpaRepository<ProjectUser, ProjectUserId> {
    List<ProjectUser> findByProject_Id(Long projectId);
    List<ProjectUser> findByUser_Id(Long userId);

    @Query("select membership.project from ProjectUser membership where membership.user.id = :userId order by membership.project.name, membership.project.id")
    List<Project> findProjectsByUserId(@Param("userId") Long userId);

    @Modifying
    @Query("""
        delete from ProjectUser membership
        where membership.project.id = :projectId
          and membership.user.company.id = :companyId
          and membership.user.role in :roles
        """)
    void deleteCompanyUserMemberships(@Param("projectId") Long projectId,
                                      @Param("companyId") Long companyId,
                                      @Param("roles") List<Role> roles);
}
