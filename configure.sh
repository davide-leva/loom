#!/usr/bin/env bash
# configure.sh — bootstrap .env from .env.example.
#
# Generates JWT_SECRET (and optionally DB_PASSWORD) with openssl, prompts for
# the remaining variables that need a human in the loop, then writes .env
# with mode 0600 so secrets aren't world-readable.
#
# Usage:
#   ./configure.sh              # interactive
#   ./configure.sh --force      # overwrite existing .env
#   ./configure.sh --non-interactive [--force]
#                               # use .env.example defaults + auto-generated secrets
#                               # (any pre-set env var is honoured)
#   ./configure.sh --help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
ENV_EXAMPLE="${ENV_EXAMPLE:-${REPO_ROOT}/.env.example}"

usage() {
    sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

FORCE=0
NON_INTERACTIVE=0
for arg in "$@"; do
    case "${arg}" in
        --force) FORCE=1 ;;
        --non-interactive|-y) NON_INTERACTIVE=1 ;;
        --help|-h) usage; exit 0 ;;
        *) echo "Unknown argument: ${arg}" >&2; usage >&2; exit 1 ;;
    esac
done

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
[[ -f "${ENV_EXAMPLE}" ]] || { echo "${ENV_EXAMPLE} not found" >&2; exit 1; }

# --- parse defaults from .env.example ---------------------------------------
declare -A DEFAULT
while IFS='=' read -r key value; do
    [[ "${key}" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
    DEFAULT["${key}"]="${value}"
done < "${ENV_EXAMPLE}"

# honour any pre-set shell env vars
for key in "${!DEFAULT[@]}"; do
    if [[ -n "${!key:-}" ]]; then
        DEFAULT["${key}"]="${!key}"
    fi
done

# --- overwrite guard ---------------------------------------------------------
if [[ -f "${ENV_FILE}" ]]; then
    if [[ "${FORCE}" -eq 0 ]]; then
        if [[ "${NON_INTERACTIVE}" -eq 1 ]]; then
            echo "${ENV_FILE} already exists; refusing to overwrite without --force" >&2
            exit 1
        fi
        read -rp ".env already exists. Overwrite? [y/N] " ans
        [[ "${ans}" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
    fi
    cp "${ENV_FILE}" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
fi

# --- helpers -----------------------------------------------------------------
prompt() {
    local label="$1" default="$2" reply
    if [[ "${NON_INTERACTIVE}" -eq 1 ]]; then
        echo "${default}"
        return
    fi
    if [[ -n "${default}" ]]; then
        read -rp "${label} [${default}]: " reply
    else
        read -rp "${label}: " reply
    fi
    echo "${reply:-${default}}"
}

prompt_secret() {
    local label="$1" default="$2" reply
    if [[ "${NON_INTERACTIVE}" -eq 1 ]]; then
        echo "${default}"
        return
    fi
    if [[ -n "${default}" ]]; then
        read -rsp "${label} [leave empty to keep]: " reply
        echo
    else
        read -rsp "${label} (input hidden): " reply
        echo
    fi
    echo "${reply:-${default}}"
}

# --- DB_PASSWORD -------------------------------------------------------------
echo "→ Database password"
echo "  Leave empty to auto-generate a random one."
echo

db_pw_seed="${DEFAULT[DB_PASSWORD]:-}"
if [[ "${db_pw_seed}" == change-me-* ]]; then
    db_pw_seed=""
fi
DB_PASSWORD="$(prompt_secret "DB_PASSWORD" "${db_pw_seed}")"
if [[ -z "${DB_PASSWORD}" ]]; then
    DB_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
    echo "  ✓ generated DB_PASSWORD"
fi

# --- JWT_SECRET --------------------------------------------------------------
echo
echo "→ JWT secret"
JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
echo "  ✓ generated 48-byte JWT_SECRET"

# --- mail --------------------------------------------------------------------
echo
echo "→ Email notifications"
MAIL_NOTIFICATIONS_ENABLED="$(prompt "Enable email notifications?" "${DEFAULT[MAIL_NOTIFICATIONS_ENABLED]:-false}")"
MAIL_FROM="$(prompt "MAIL_FROM" "${DEFAULT[MAIL_FROM]:-no-reply@tickets.local}")"

SMTP_HOST="${DEFAULT[SMTP_HOST]:-localhost}"
SMTP_PORT="${DEFAULT[SMTP_PORT]:-25}"
SMTP_USERNAME="${DEFAULT[SMTP_USERNAME]:-}"
SMTP_PASSWORD="${DEFAULT[SMTP_PASSWORD]:-}"
SMTP_AUTH="${DEFAULT[SMTP_AUTH]:-false}"
SMTP_STARTTLS_ENABLE="${DEFAULT[SMTP_STARTTLS_ENABLE]:-false}"

if [[ "${MAIL_NOTIFICATIONS_ENABLED}" =~ ^[Yy]|[Tt][Rr][Uu][Ee]|1$ ]]; then
    echo
    echo "→ SMTP settings"
    SMTP_HOST="$(prompt "SMTP_HOST" "${SMTP_HOST}")"
    SMTP_PORT="$(prompt "SMTP_PORT" "${SMTP_PORT}")"
    SMTP_USERNAME="$(prompt "SMTP_USERNAME" "${SMTP_USERNAME}")"
    SMTP_PASSWORD="$(prompt_secret "SMTP_PASSWORD" "${SMTP_PASSWORD}")"
    SMTP_AUTH="$(prompt "SMTP_AUTH (true/false)" "${SMTP_AUTH}")"
    SMTP_STARTTLS_ENABLE="$(prompt "SMTP_STARTTLS_ENABLE (true/false)" "${SMTP_STARTTLS_ENABLE}")"
fi

# --- optional overrides ------------------------------------------------------
echo
echo "→ Optional overrides (Enter keeps the .env.example default)"
DB_NAME="$(prompt "DB_NAME" "${DEFAULT[DB_NAME]:-tickets}")"
DB_USER="$(prompt "DB_USER" "${DEFAULT[DB_USER]:-dbatickets}")"
FRONTEND_PORT="$(prompt "FRONTEND_PORT" "${DEFAULT[FRONTEND_PORT]:-8080}")"
ATTACHMENTS_MAX_FILE_SIZE="$(prompt "ATTACHMENTS_MAX_FILE_SIZE" "${DEFAULT[ATTACHMENTS_MAX_FILE_SIZE]:-25MB}")"
ATTACHMENTS_MAX_REQUEST_SIZE="$(prompt "ATTACHMENTS_MAX_REQUEST_SIZE" "${DEFAULT[ATTACHMENTS_MAX_REQUEST_SIZE]:-25M}")"

# --- write .env --------------------------------------------------------------
cat > "${ENV_FILE}" <<EOF
# Generated by configure.sh on $(date -Iseconds)
# Re-run with --force to regenerate secrets.

DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=${JWT_SECRET}

BACKEND_IMAGE=${DEFAULT[BACKEND_IMAGE]:-ghcr.io/your-org/sf2-tickets/backend:latest}
FRONTEND_IMAGE=${DEFAULT[FRONTEND_IMAGE]:-ghcr.io/your-org/sf2-tickets/frontend:latest}

FRONTEND_PORT=${FRONTEND_PORT}

ATTACHMENTS_MAX_FILE_SIZE=${ATTACHMENTS_MAX_FILE_SIZE}
ATTACHMENTS_MAX_REQUEST_SIZE=${ATTACHMENTS_MAX_REQUEST_SIZE}
# Per il backend avviato localmente: ROOT_FOLDER=./branding

MAIL_NOTIFICATIONS_ENABLED=${MAIL_NOTIFICATIONS_ENABLED}
MAIL_FROM=${MAIL_FROM}
MAIL_NOTIFICATIONS_DELAY=${DEFAULT[MAIL_NOTIFICATIONS_DELAY]:-5m}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USERNAME=${SMTP_USERNAME}
SMTP_PASSWORD=${SMTP_PASSWORD}
SMTP_AUTH=${SMTP_AUTH}
SMTP_STARTTLS_ENABLE=${SMTP_STARTTLS_ENABLE}
EOF

chmod 600 "${ENV_FILE}"

echo
echo "✓ Wrote ${ENV_FILE} (mode 0600)"
echo "  Next: docker compose -f compose.yml up -d"
echo "        (or compose.dev.yml --build for local builds)"