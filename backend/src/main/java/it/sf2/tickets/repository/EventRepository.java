package it.sf2.tickets.repository;

import it.sf2.tickets.domain.Event;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long> {
}
