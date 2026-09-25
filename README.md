<p align="center">
  <img src="frontend/public/LogoType_Loom.png" alt="Loom" width="280">
</p>

<p align="center">
  <a href="docs/README.it.md">Italian README</a> ·
  <a href="docs/USE_CASES.md">Use cases</a> ·
  <a href="docs/DEV_NOTES.md">DEV_NOTES</a>
</p>

# Loom

Complete ticketing application with a Spring Boot backend, Angular frontend, PostgreSQL database, Flyway migrations, JWT authentication, filesystem attachments, and email notifications.

The production Docker setup exposes the Angular frontend directly from the backend: the application runs as a single Docker image named `loom`.

## One-Shot Installation

On a Debian/Ubuntu server you can install prerequisites, configure the environment, start the stack, and set up automatic updates with:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/davide-leva/loom/master/install.sh)
```

The installer:

- installs Docker and the Compose plugin if missing
- asks for domain, email, database, JWT, and SMTP settings
- writes `.env`
- starts `docker compose up -d`
- optionally installs a systemd timer for automatic image updates

Non-interactive mode:

```bash
curl -fsSL https://raw.githubusercontent.com/davide-leva/loom/master/install.sh | \
  LOOM_DOMAIN=loom.example.com \
  LOOM_LETSENCRYPT_EMAIL=admin@example.com \
  LOOM_DB_PASSWORD='change-me' \
  LOOM_JWT_SECRET='change-me-change-me-change-me' \
  bash -s -- --yes
```

When launched through `curl | bash`, interactive prompts are read from the terminal when available, so the answers are not swallowed by the piped script body.

## Quick Start With Docker Compose

Start the full stack with the published image from GitHub Container Registry:

```bash
cp .env.example .env
./scripts/configure.sh
docker compose up -d
```

Default local URLs:

- App: <https://localhost> or <http://localhost:8080> with `LOOM_DOMAIN=localhost`
- API: proxied through the same app origin under `/api`

The backend serves the compiled frontend from the same container, so no separate frontend service is needed in production.

## Start With GitHub Images

Images are published on GitHub Container Registry:

```bash
ghcr.io/davide-leva/loom:latest
ghcr.io/davide-leva/loom:<version>
```

Update `.env` if needed:

```env
LOOM_IMAGE=ghcr.io/davide-leva/loom:latest
```

Then start:

```bash
docker compose up -d
```

To update:

```bash
docker compose pull
docker compose up -d
```

## Start With Local Build

For local development or image testing:

```bash
cp .env.example .env
./scripts/configure.sh
docker compose -f compose.dev.yml up --build
```

The development compose file builds the local `loom` image instead of pulling it from GHCR.

First setup:

```bash
./scripts/configure.sh
docker compose up -d
```

## Started Services

- `database`: PostgreSQL
- `loom`: single application container with Spring Boot backend and compiled Angular frontend
- `caddy`: reverse proxy, HTTPS, optional Let's Encrypt

## Exposed Host Ports

`compose.yml` exposes only the proxy ports:

- `80`
- `443`

The app container is reachable only on the internal Docker network.

For local work without Caddy, use `compose.dev.yml`, which also exposes:

- `8080`: backend and frontend served by Spring Boot

## TLS

For a real domain:

```env
LOOM_DOMAIN=loom.example.com
LOOM_LETSENCRYPT_EMAIL=admin@example.com
```

For local HTTP:

```env
LOOM_DOMAIN=localhost
LOOM_LETSENCRYPT_EMAIL=
```

Caddy automatically manages certificates when a public domain and email are configured.

## Docker Persistence

Persistent data is stored under `./data`:

- `data/postgres`: PostgreSQL data
- `data/uploads`: uploaded attachments
- `data/caddy`: Caddy certificates and state
- `data/caddy_config`: Caddy config state

Backups should include `.env` and the full `data/` directory.

## Backup

PostgreSQL dump:

```bash
docker compose exec -T database pg_dump -U loom loom > loom.sql
```

Attachments and certificates:

```bash
tar -czf loom-data.tgz data .env
```

## Publishing Docker Images

The workflow `.github/workflows/publish-images.yml` builds and publishes:

- `ghcr.io/<owner>/<repo>/loom:latest`
- `ghcr.io/<owner>/<repo>/loom:<version>` on tags like `v1.2.3`

Manual local build:

```bash
docker build -t loom:local -f backend/Dockerfile .
```

## `.env` Configuration

Main variables:

```env
LOOM_IMAGE=ghcr.io/davide-leva/loom:latest
LOOM_DOMAIN=localhost
LOOM_LETSENCRYPT_EMAIL=

LOOM_DB_NAME=loom
LOOM_DB_USER=loom
LOOM_DB_PASSWORD=loom

LOOM_JWT_SECRET=change-me-change-me-change-me-change-me
LOOM_JWT_TTL_MINUTES=480

LOOM_MAIL_HOST=
LOOM_MAIL_PORT=587
LOOM_MAIL_USERNAME=
LOOM_MAIL_PASSWORD=
LOOM_MAIL_FROM=
LOOM_MAIL_SMTP_AUTH=true
LOOM_MAIL_SMTP_STARTTLS_ENABLE=true
```

`LOOM_JWT_TTL_MINUTES` controls the default JWT duration. The default is `480` minutes, equal to 8 hours.

Email notifications require SMTP settings, for example:

```env
LOOM_MAIL_HOST=smtp.example.com
LOOM_MAIL_PORT=587
LOOM_MAIL_USERNAME=loom@example.com
LOOM_MAIL_PASSWORD=secret
LOOM_MAIL_FROM=loom@example.com
```

If SMTP is not configured, notification emails are skipped safely.

## Local Development

Backend:

```bash
cd backend
./mvnw spring-boot:run
```

Frontend:

```bash
cd frontend
npm install
npm start
```

Default local frontend URL:

```text
http://localhost:4200
```

Default local backend URL:

```text
http://localhost:8080
```

`frontend/proxy.conf.json` forwards `/api` calls to the backend during Angular development.

You can also use the helper script:

```bash
./scripts/dev.sh
```

Compose-based development mode:

```bash
./scripts/dev.sh --compose
```

This starts the stack with `compose.dev.yml`, rebuilding the local image and exposing the app on port `8080`.

## Application Notes

- Keep `LOOM_JWT_SECRET` stable between restarts or existing tokens become invalid.
- Flyway runs database migrations on startup.
- Hibernate validates the schema after migrations.
- Uploaded files are stored on disk, not in the database.
- The Angular app uses PrimeNG and PrimeIcons; icon assets are served by the backend from the compiled frontend bundle.
- Logos are stored in `frontend/public`.

## Authentication

Loom supports JWT-based authentication.

The main login flow uses:

```http
POST /api/auth/login
```

Response:

```json
{
  "token": "jwt-token",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "ADMIN"
  },
  "expiresInSeconds": 28800
}
```

## External Authentication

External systems can request Loom tokens through dedicated authentication endpoints when enabled by configuration.

This is useful when another platform needs to open Loom with a user context already known by an upstream system.

## Companies, Users, And Projects

Loom supports:

- companies
- users
- projects
- project memberships
- user roles

Projects belong to a company and can be linked to issue workflows and assignments.

## Issues, Statuses, And Approval

Issue management supports:

- issue creation
- issue details
- assignment
- status transitions
- approval or rejection
- comments
- attachments
- issue type classification

Statuses and types can be managed from the administrative area.

## Email Notifications

Email notifications can be sent for relevant issue events, including assignment and workflow changes.

Configuration is read from the `LOOM_MAIL_*` environment variables. When SMTP is missing, the application continues to run and skips email delivery.

## Events And Live Sync

The frontend can receive live work updates through:

```http
GET /api/work/live
```

The endpoint uses the current JWT authentication context. Keeping the token lifetime aligned with the work session avoids periodic `403` responses during long-running sessions.

## Administrative APIs

Some administrative resources are exposed under `/api/admin`.

Common areas:

| Area | Example |
| --- | --- |
| Users | `/api/admin/users` |
| Companies | `/api/admin/companies` |
| Projects | `/api/admin/projects` |
| Issue types | `/api/admin/issue-types` |
| Issue statuses | `/api/admin/issue-statuses` |

## Developer Notes

### Issue Notification APIs

Issue-related notification flows are covered by backend services and tests under:

```text
backend/src/test/java/it/davideleva/loom/notification
```

### Internal And External Tokens

JWT expiration is configured with:

```env
LOOM_JWT_TTL_MINUTES=480
```

Application configuration maps it to:

```yaml
app:
  jwt:
    expiration-ms: 28800000
```

Eight hours correspond to:

```text
480 minutes
28800 seconds
28800000 milliseconds
```
