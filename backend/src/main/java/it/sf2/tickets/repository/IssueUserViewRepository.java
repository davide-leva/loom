package it.sf2.tickets.repository;

import it.sf2.tickets.domain.IssueUserView;
import it.sf2.tickets.domain.IssueUserViewId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueUserViewRepository extends JpaRepository<IssueUserView, IssueUserViewId> {
}
