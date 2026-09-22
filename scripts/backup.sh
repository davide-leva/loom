#!/usr/bin/env bash
# backup.sh — snapshot data/, .env, Caddyfile into backups/.
#
# Usage:
#   ./backup.sh                  # creates backups/ticket-platform-<ISO_DATE>.tar.gz
#   ./backup.sh --label mydb     # append a label, e.g. ticket-platform-...-mydb.tar.gz
#   BACKUP_DIR=/mnt/backup ./backup.sh
#                                # override output directory
#   ./backup.sh --help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${DATA_DIR:-${REPO_ROOT}/data}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"

usage() {
    sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

LABEL=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --label=*) LABEL="${1#--label=}" ;;
        --label) shift; LABEL="${1:-}" ;;
        --help|-h) usage; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
    esac
    shift
done

[[ -d "${DATA_DIR}" ]] || { echo "Data directory ${DATA_DIR} not found" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"

# UTC timestamp, colons replaced (not portable across filesystems)
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

if [[ -n "${LABEL}" ]]; then
    # sanitise label — only safe filename chars
    LABEL="$(printf '%s' "${LABEL}" | tr -c 'A-Za-z0-9._-' '-')"
    [[ -z "${LABEL}" ]] && { echo "Label becomes empty after sanitisation" >&2; exit 1; }
    ARCHIVE="${BACKUP_DIR}/ticket-platform-${STAMP}-${LABEL}.tar.gz"
else
    ARCHIVE="${BACKUP_DIR}/ticket-platform-${STAMP}.tar.gz"
fi

# Collect what to include. Only paths that exist, in a fixed order.
INCLUDE=(data)
[[ -f "${REPO_ROOT}/.env" ]]      && INCLUDE+=(.env)
[[ -f "${REPO_ROOT}/Caddyfile" ]] && INCLUDE+=(Caddyfile)

echo "→ Creating ${ARCHIVE}"
echo "  source: ${REPO_ROOT}"
echo "  includes: ${INCLUDE[*]}"
echo

tar -czf "${ARCHIVE}" \
    --transform 's|^data|ticket-platform/data|' \
    --transform 's|^\.env$|ticket-platform/.env|' \
    --transform 's|^Caddyfile$|ticket-platform/Caddyfile|' \
    -C "${REPO_ROOT}" \
    "${INCLUDE[@]}"

chmod 600 "${ARCHIVE}"

SIZE="$(du -h "${ARCHIVE}" | cut -f1)"
echo "✓ Wrote ${ARCHIVE} (${SIZE})"