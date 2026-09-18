CREATE TABLE IF NOT EXISTS issue_attachments (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id        BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_dtype_id  BIGINT REFERENCES issue_dtype(id) ON DELETE SET NULL,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    original_name   VARCHAR(255) NOT NULL,
    content_type    VARCHAR(128),
    file_size       BIGINT NOT NULL,
    extension       VARCHAR(32) NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    stored_path     TEXT,

    CONSTRAINT issue_attachments_issue_fk FOREIGN KEY (issue_id, project_id)
        REFERENCES issues(id, project_id) ON DELETE CASCADE,
    CONSTRAINT issue_attachments_dtype_fk FOREIGN KEY (issue_dtype_id)
        REFERENCES issue_dtype(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS issue_attachments_issue_idx ON issue_attachments (issue_id);
