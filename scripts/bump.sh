#!/usr/bin/env bash
# scripts/bump.sh — bump the VERSION file using SemVer.
#
# Usage:
#   ./scripts/bump.sh              # patch (default)
#   ./scripts/bump.sh patch
#   ./scripts/bump.sh minor
#   ./scripts/bump.sh major
#   ./scripts/bump.sh patch --no-commit   # only rewrite VERSION, don't commit
#
# Reads VERSION at the repo root, applies the bump, writes it back, and
# creates a single commit titled "release: bump <new>".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION_FILE="${REPO_ROOT}/VERSION"

PART="${1:-patch}"
COMMIT=1
for arg in "$@"; do
    case "${arg}" in
        --no-commit) COMMIT=0 ;;
        major|minor|patch) ;;
        *) echo "uso: $0 [major|minor|patch] [--no-commit]" >&2; exit 1 ;;
    esac
done

[[ -f "${VERSION_FILE}" ]] || { echo "${VERSION_FILE} not found" >&2; exit 1; }
CURRENT="$(tr -d '[:space:]' < "${VERSION_FILE}")"
[[ "${CURRENT}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "VERSION must be SemVer (got: ${CURRENT})" >&2
    exit 1
}

IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT}"

case "${PART}" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac

NEW="${MAJOR}.${MINOR}.${PATCH}"
printf '%s\n' "${NEW}" > "${VERSION_FILE}"

OLD_PRETTY=$(git -C "${REPO_ROOT}" describe --tags --dirty 2>/dev/null || echo "(none)")
echo "VERSION: ${CURRENT} → ${NEW}  (last tag: ${OLD_PRETTY})"

if [[ "${COMMIT}" -eq 1 ]]; then
    cd "${REPO_ROOT}"
    git add VERSION
    git commit -m "release: bump ${NEW}"
    echo "  committed."
fi
