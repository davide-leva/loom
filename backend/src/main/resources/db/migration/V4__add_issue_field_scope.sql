ALTER TABLE issue_dtype
    ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'USER';

ALTER TABLE issue_dtype
    DROP CONSTRAINT IF EXISTS issue_dtype_scope_check;

ALTER TABLE issue_dtype
    ADD CONSTRAINT issue_dtype_scope_check CHECK (scope IN ('USER', 'SUPERUSER', 'TEAM'));
