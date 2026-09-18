CREATE TABLE IF NOT EXISTS companies (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name      VARCHAR(32),
    last_name       VARCHAR(32),
    role            VARCHAR(16) NOT NULL,
    company_id      BIGINT REFERENCES companies(id) ON DELETE CASCADE,
    email           VARCHAR(128) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    want_email      BOOLEAN,

    CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'TEAM', 'SUPERUSER', 'USER')),
    CONSTRAINT users_company_role_check CHECK (
        (role IN ('USER', 'SUPERUSER') AND company_id IS NOT NULL)
        OR (role IN ('TEAM', 'ADMIN') AND company_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS projects (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(32) NOT NULL,
    company_id      BIGINT REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects_users (
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    want_email      BOOLEAN,

    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS issues (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          VARCHAR(16) NOT NULL DEFAULT 'REPORTED',
    issue_type      VARCHAR(16) NOT NULL,
    released_at     TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    issuer_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    dev_user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approve_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    is_internal     BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT issues_status_check CHECK (
        status IN ('REPORTED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'APPROVED')
    ),
    CONSTRAINT issues_type_check CHECK (
        issue_type IN ('ANOMALY', 'IMPROVEMENT', 'IMPLEMENTATION')
    ),
    UNIQUE (id, project_id)
);

CREATE TABLE IF NOT EXISTS issue_dtype (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cod             VARCHAR(8) NOT NULL,
    label           VARCHAR(64) NOT NULL,
    mandatory       BOOLEAN NOT NULL DEFAULT FALSE,
    multiple        BOOLEAN NOT NULL DEFAULT FALSE,
    type            VARCHAR(16) NOT NULL,
    scope           VARCHAR(16) NOT NULL DEFAULT 'USER',

    CONSTRAINT issue_dtype_type_check CHECK (
        type IN ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'ATTACHMENTS')
    ),
    CONSTRAINT issue_dtype_scope_check CHECK (
        scope IN ('USER', 'SUPERUSER', 'TEAM')
    ),
    CONSTRAINT issue_dtype_cod_uppercase_check CHECK (UPPER(cod) = cod),
    UNIQUE (project_id, cod),
    UNIQUE (id, project_id)
);

CREATE TABLE IF NOT EXISTS issue_dtype_options (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_dtype_id  BIGINT NOT NULL REFERENCES issue_dtype(id) ON DELETE CASCADE,
    value           VARCHAR(64) NOT NULL,
    label           VARCHAR(64) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (issue_dtype_id, value)
);

-- The application validates type, mandatory/multiple rules and SELECT options.
-- For ATTACHMENTS, value is an object-storage key; storage cleanup is external.
CREATE TABLE IF NOT EXISTS issues_data (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id        BIGINT NOT NULL,
    project_id      BIGINT NOT NULL,
    issue_dtype_id  BIGINT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    value           TEXT NOT NULL,

    CONSTRAINT issues_data_issue_fk FOREIGN KEY (issue_id, project_id)
        REFERENCES issues(id, project_id) ON DELETE CASCADE,
    CONSTRAINT issues_data_dtype_fk FOREIGN KEY (issue_dtype_id, project_id)
        REFERENCES issue_dtype(id, project_id) ON DELETE CASCADE,
    UNIQUE (issue_id, issue_dtype_id, position)
);

CREATE TABLE IF NOT EXISTS issue_comments (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id        BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    "date"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    comment         TEXT NOT NULL
);
