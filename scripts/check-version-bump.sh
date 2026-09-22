#!/usr/bin/env bash
# scripts/check-version-bump.sh — verify VERSION was bumped with code changes.
#
# Compares the current HEAD against the last git tag (or first commit if
# no tag exists) and fails if production code changed without VERSION
# being touched in the same range.
#
# Production code paths scanned:
#   backend/src/main/**        (Java source, resources, migrations)
#   frontend/src/**            (TypeScript, templates, styles)
#
# Excluded paths (changes here don't require a VERSION bump):
#   backend/src/test/**, frontend/src/**/*.spec.ts
#   anything under data/, backups/, scripts/, .vscode/, .github/, *.md
#
# Exit codes:
#   0   OK (no code change, or VERSION bumped together with code)
#   1   Code changed without VERSION bump
#
# Used by lefthook (pre-push) and the GitHub Actions version-check workflow.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

CODE_PATTERN='^(backend/src/main/|frontend/src/)'
EXCLUDE_PATTERN='(backend/src/test/|frontend/src/.*\.spec\.ts$|\.md$|^data/|^backups/|^scripts/|\.vscode/|^\.github/)'

LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
if [[ -z "${LAST_TAG}" ]]; then
    BASE="$(git rev-list --max-parents=0 HEAD | tail -n1)"
    RANGE="${BASE}..HEAD"
    BASE_LABEL="(initial commit ${BASE:0:8})"
else
    RANGE="${LAST_TAG}..HEAD"
    BASE_LABEL="tag ${LAST_TAG}"
fi

CHANGED="$(git diff --name-only "${RANGE}")"
if [[ -z "${CHANGED}" ]]; then
    echo "  no changes since ${BASE_LABEL}"
    exit 0
fi

CODE_CHANGED="$(echo "${CHANGED}" | grep -E "${CODE_PATTERN}" | grep -vE "${EXCLUDE_PATTERN}" || true)"
VERSION_CHANGED="$(echo "${CHANGED}" | grep -E '^VERSION$' || true)"

if [[ -n "${CODE_CHANGED}" && -z "${VERSION_CHANGED}" ]]; then
    CURRENT="$(cat "${REPO_ROOT}/VERSION" 2>/dev/null || echo "(missing)")"
    echo "  ✗ Code modified since ${BASE_LABEL}, but VERSION (current: ${CURRENT}) was not bumped." >&2
    echo "    Files changed:" >&2
    echo "${CODE_CHANGED}" | sed 's/^/      /' >&2
    echo "    Fix: ./scripts/bump.sh [major|minor|patch]" >&2
    exit 1
fi

if [[ -n "${VERSION_CHANGED}" ]]; then
    echo "  ✓ VERSION bumped together with code since ${BASE_LABEL}"
fi
exit 0
