ALTER TABLE projects ADD COLUMN external_auth_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE external_jwt_secrets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    encrypted_secret VARCHAR(1024) NOT NULL
);

CREATE UNIQUE INDEX external_jwt_secrets_project_name_unique
    ON external_jwt_secrets (project_id, LOWER(name));

CREATE TABLE external_jwt_subject_mappings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    secret_id BIGINT NOT NULL REFERENCES external_jwt_secrets(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (secret_id, subject)
);
