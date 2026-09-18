package it.sf2.tickets.repository;

import it.sf2.tickets.domain.User;
import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsernameIgnoreCase(String username);
    List<User> findByCompany_Id(Long companyId);

    @Query("select membership.user from ProjectUser membership where membership.project.id = :projectId")
    List<User> findByProjectId(@Param("projectId") Long projectId);
}
