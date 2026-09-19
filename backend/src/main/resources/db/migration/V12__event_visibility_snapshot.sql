ALTER TABLE events ADD COLUMN issue_ref_id BIGINT;
ALTER TABLE events ADD COLUMN internal BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE events SET issue_ref_id = issue_id,
    internal = COALESCE((SELECT i.is_internal FROM issues i WHERE i.id = events.issue_id), FALSE);

CREATE INDEX events_project_visibility_id_idx ON events (project_id, internal, id DESC);
