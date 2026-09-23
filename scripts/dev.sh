#!/usr/bin/env bash
# dev.sh — local development with hot reload.
#
# Starts the database via compose, then runs the backend (Spring Boot) and
# frontend (Angular dev server) locally for hot reload. Sources `.env` from
# the repo root.
#
# Data lives in ./data/{db,attachments,branding,caddy*} as bind mounts and
# persists across runs. Use --fresh to wipe db/attachments/branding before
# starting (Caddy state is preserved).
#
# Usage:
#   ./scripts/dev.sh           # run in foreground, tail logs, Ctrl+C to stop
#   ./scripts/dev.sh --detach  # run in background, return immediately
#   ./scripts/dev.sh --stop    # kill any prior dev processes and the database
#   ./scripts/dev.sh --fresh   # wipe ./data/{db,attachments,branding} then start
#   ./scripts/dev.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/compose.yml}"
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.dev-logs}"

usage() {
    sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

DETACH=0
ACTION="up"
FRESH=0
for arg in "$@"; do
    case "${arg}" in
        --detach|-d) DETACH=1 ;;
        --stop)      ACTION="stop" ;;
        --fresh)     FRESH=1 ;;
        --help|-h)   usage; exit 0 ;;
        *) echo "Unknown argument: ${arg}" >&2; usage >&2; exit 1 ;;
    esac
done

cd "${REPO_ROOT}"

# Point git at the versioned .githooks/ directory. Idempotent — only
# prints on the first run so subsequent runs stay quiet.
if [[ "$(git config --get core.hooksPath 2>/dev/null || true)" != ".githooks" ]]; then
    git config core.hooksPath .githooks
    echo "→ Installed git hooks (core.hooksPath=.githooks)"
fi

if [[ "${ACTION}" == "stop" ]]; then
    echo "→ Stopping dev processes"
    # mvn / npm parents (graceful) then any orphaned Java/ng children (force).
    # spring-boot:run spawns a JVM child whose argv doesn't contain the mvn
    # pattern, so plain pkill on the parent leaves the child running and
    # holding port 8080 — hence the broader patterns below.
    pkill -f "mvn spring-boot:run" 2>/dev/null && echo "  ✓ stopped mvn spring-boot:run" || echo "  - mvn not running"
    pkill -f "ng serve"            2>/dev/null && echo "  ✓ stopped ng serve"            || echo "  - ng not running"
    sleep 1
    pkill -9 -f "LoomApplication"              2>/dev/null || true
    pkill -9 -f "ng serve"                     2>/dev/null || true
    pkill -9 -f "@angular/cli"                 2>/dev/null || true
    docker compose -f "${COMPOSE_FILE}" stop database 2>/dev/null \
        && echo "  ✓ stopped database container" \
        || echo "  - database not running"
    exit 0
fi

# --- pre-flight --------------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
command -v mvn    >/dev/null 2>&1 || { echo "mvn (Maven) is required" >&2; exit 1; }
command -v npm    >/dev/null 2>&1 || { echo "npm is required" >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || {
    echo "${ENV_FILE} not found. Run ./configure.sh first." >&2
    exit 1
}
[[ -d "${REPO_ROOT}/backend"  ]] || { echo "backend/ not found" >&2; exit 1; }
[[ -d "${REPO_ROOT}/frontend" ]] || { echo "frontend/ not found" >&2; exit 1; }

mkdir -p "${LOG_DIR}"

# --- 0b. optional: wipe persisted data --------------------------------------
if [[ "${FRESH}" -eq 1 ]]; then
    echo "→ --fresh: wiping ./data/{db,attachments,branding}"
    docker compose -f "${COMPOSE_FILE}" stop database >/dev/null 2>&1 || true
    for sub in db attachments branding; do
        if [[ -d "${REPO_ROOT}/data/${sub}" ]]; then
            rm -rf "${REPO_ROOT}/data/${sub}"
            echo "  ✓ removed data/${sub}"
        fi
        mkdir -p "${REPO_ROOT}/data/${sub}"
    done
    echo "  (data/caddy* left intact — TLS certs and proxy config preserved)"
fi

# --- 1. database via compose ------------------------------------------------
echo "→ Starting database via compose"
docker compose -f "${COMPOSE_FILE}" up -d database

echo -n "  waiting for healthy"
for _ in $(seq 1 60); do
    if docker compose -f "${COMPOSE_FILE}" ps database --format json 2>/dev/null \
        | grep -q '"Health":"healthy"'; then
        echo
        echo "  ✓ database healthy"
        break
    fi
    echo -n "."
    sleep 1
done

if ! docker compose -f "${COMPOSE_FILE}" ps database --format json 2>/dev/null \
    | grep -q '"Health":"healthy"'; then
    echo
    echo "  ✗ database failed to become healthy in 60s" >&2
    docker compose -f "${COMPOSE_FILE}" logs --tail=20 database >&2
    exit 1
fi

# --- 2. source .env ----------------------------------------------------------
echo "→ Sourcing ${ENV_FILE}"
set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

# --- 2b. derive build metadata from git so the backend's /api/version -------
# ---     shows the real commit and timestamp instead of "local"/"local" -----
# APP_VERSION stays "dev" in local — the badge treats that label specially
# (shows "dev" instead of "vdev" and Ambiente as "dev"). CI/Docker build
# overrides APP_VERSION with the real SemVer from the VERSION file, so
# production still displays v0.0.1 / Ambiente: production.
APP_VERSION="${APP_VERSION:-dev}"
APP_COMMIT="$(git -C "${REPO_ROOT}" rev-parse --short=8 HEAD 2>/dev/null || echo "local")"
APP_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "local")"
APP_ENV="${APP_ENV:-dev}"

export APP_VERSION APP_COMMIT APP_BUILD_TIME APP_ENV
echo "→ Build metadata: ${APP_VERSION} · ${APP_COMMIT} · ${APP_BUILD_TIME} (env: ${APP_ENV})"

# --- 3. backend (mvn spring-boot:run) ---------------------------------------
echo "→ Starting backend (mvn spring-boot:run)"
(cd "${REPO_ROOT}/backend"  && exec mvn spring-boot:run) \
    > "${LOG_DIR}/backend.log"  2>&1 &
BACKEND_PID=$!

# --- 4. frontend (npm start) -------------------------------------------------
echo "→ Starting frontend (npm start)"
(cd "${REPO_ROOT}/frontend" && exec npm start) \
    > "${LOG_DIR}/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo
echo "Backend  PID=${BACKEND_PID}  logs: ${LOG_DIR}/backend.log"
echo "Frontend PID=${FRONTEND_PID}  logs: ${LOG_DIR}/frontend.log"
echo "Frontend URL: http://localhost:4200/  (Angular dev server with proxy → backend:8080)"
echo

cleanup() {
    echo
    echo "→ Stopping dev processes"
    kill "${BACKEND_PID}"  2>/dev/null || true
    kill "${FRONTEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}"  "${FRONTEND_PID}" 2>/dev/null || true
    pkill -P $$ 2>/dev/null || true
    # Catch orphaned children that survived the parent (Spring Boot's JVM,
    # Angular CLI's node workers). Force-kill since the parents are gone.
    sleep 1
    pkill -9 -f "LoomApplication"    2>/dev/null || true
    pkill -9 -f "ng serve"            2>/dev/null || true
    pkill -9 -f "@angular/cli"        2>/dev/null || true
    docker compose -f "${COMPOSE_FILE}" stop database >/dev/null 2>&1 || true
    echo "  ✓ stopped"
}
# Only trap signals — letting EXIT fire would kill the children on --detach
# when the script returns normally. Foreground mode calls cleanup explicitly.
trap cleanup INT TERM

if [[ "${DETACH}" -eq 1 ]]; then
    echo "(detached — re-run with --stop to terminate, or use scripts/dev.sh --stop)"
    exit 0
fi

# foreground: tail both logs, clean up when the tail exits
echo "→ Tailing logs (Ctrl+C to stop)"
cleanup_on_tail_exit() {
    cleanup
    exit 0
}
trap cleanup_on_tail_exit INT TERM EXIT
tail -F -q "${LOG_DIR}/backend.log" "${LOG_DIR}/frontend.log" &
TAIL_PID=$!
wait "${TAIL_PID}"
cleanup
exit 0