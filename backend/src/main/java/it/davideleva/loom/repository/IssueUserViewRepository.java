package it.davideleva.loom.repository;

import it.davideleva.loom.domain.IssueUserView;
import it.davideleva.loom.domain.IssueUserViewId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueUserViewRepository extends JpaRepository<IssueUserView, IssueUserViewId> {
}
