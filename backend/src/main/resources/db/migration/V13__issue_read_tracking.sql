CREATE TABLE issue_user_views (
    issue_id           BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen_event_id BIGINT NOT NULL,
    seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (issue_id, user_id)
);

CREATE INDEX issue_user_views_user_issue_idx ON issue_user_views (user_id, issue_id);
CREATE INDEX events_project_issue_actor_id_idx ON events (project_id, issue_id, actor_id, id);
