ALTER TABLE issues   ADD COLUMN deleted_at  TIMESTAMPTZ;
ALTER TABLE issues   ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN archive_after_days INTEGER;

-- Partial indexes: cheap, targeted at the two main filter paths used by the
-- workspace list endpoints and the admin deleted/archived views.
CREATE INDEX issues_project_deleted_id_idx  ON issues (project_id, id) WHERE deleted_at  IS NOT NULL;
CREATE INDEX issues_project_archived_id_idx ON issues (project_id, id) WHERE archived_at IS NOT NULL;

-- Composite index used by the scheduler: status RELEASED + released_at set +
-- not deleted + not yet archived. Partial so it stays small.
CREATE INDEX issues_released_eligible_idx   ON issues (released_at)
    WHERE status = 'RELEASED' AND deleted_at IS NULL AND archived_at IS NULL;
