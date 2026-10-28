-- The scheduler archives approved issues based on approval age.
DROP INDEX IF EXISTS issues_released_eligible_idx;
CREATE INDEX issues_approved_eligible_idx ON issues (approved_at)
    WHERE status = 'APPROVED' AND deleted_at IS NULL AND archived_at IS NULL;
