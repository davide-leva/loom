CREATE TABLE IF NOT EXISTS events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
    type        VARCHAR(64) NOT NULL,
    data        TEXT NOT NULL,
    project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    issue_id    BIGINT REFERENCES issues(id) ON DELETE CASCADE,
    actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_user_notifications (
    event_id    BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notified    BOOLEAN NOT NULL DEFAULT FALSE,
    notified_at TIMESTAMPTZ,

    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS events_event_date_idx ON events (event_date);
CREATE INDEX IF NOT EXISTS event_user_notifications_pending_idx ON event_user_notifications (notified, event_id);
