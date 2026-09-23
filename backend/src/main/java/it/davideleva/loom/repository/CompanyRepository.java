package it.davideleva.loom.repository;

import it.davideleva.loom.domain.Company;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyRepository extends JpaRepository<Company, Long> {
    Optional<Company> findFirstByTeamCompanyTrue();
}
