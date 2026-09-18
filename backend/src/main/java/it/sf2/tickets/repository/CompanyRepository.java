package it.sf2.tickets.repository;

import it.sf2.tickets.domain.Company;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyRepository extends JpaRepository<Company, Long> {
    Optional<Company> findFirstByTeamCompanyTrue();
}
