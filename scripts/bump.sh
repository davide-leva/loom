#!/usr/bin/env bash
# scripts/bump.sh — bump the VERSION file using SemVer.
#
# Usage:
#   ./scripts/bump.sh                         # interactive
#   ./scripts/bump.sh patch                   # bump patch, then ask about commit
#   ./scripts/bump.sh minor --no-commit       # only rewrite VERSION
#   ./scripts/bump.sh major --commit          # rewrite VERSION and commit
#
# Reads VERSION at the repo root, applies the bump, syncs backend/frontend
# manifests, and optionally creates a single commit titled "release: bump <new>".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION_FILE="${REPO_ROOT}/VERSION"
BACKEND_POM="${REPO_ROOT}/backend/pom.xml"
FRONTEND_PACKAGE="${REPO_ROOT}/frontend/package.json"
FRONTEND_LOCK="${REPO_ROOT}/frontend/package-lock.json"

PART=""
COMMIT=""
PROMPT_FD=0
for arg in "$@"; do
    case "${arg}" in
        --commit) COMMIT=1 ;;
        --no-commit) COMMIT=0 ;;
        major|minor|patch)
            if [[ -n "${PART}" ]]; then
                echo "uso: $0 [major|minor|patch] [--commit|--no-commit]" >&2
                exit 1
            fi
            PART="${arg}"
            ;;
        --help|-h)
            sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "uso: $0 [major|minor|patch] [--commit|--no-commit]" >&2; exit 1 ;;
    esac
done

if [[ (! -t 0) && (-z "${PART}" || -z "${COMMIT}") ]]; then
    if { exec 3</dev/tty; } 2>/dev/null; then
        PROMPT_FD=3
    fi
fi

[[ -f "${VERSION_FILE}" ]] || { echo "${VERSION_FILE} not found" >&2; exit 1; }
CURRENT="$(tr -d '[:space:]' < "${VERSION_FILE}")"
[[ "${CURRENT}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "VERSION must be SemVer (got: ${CURRENT})" >&2
    exit 1
}

IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT}"

bumped_version() {
    local part="$1" major="$2" minor="$3" patch="$4"
    case "${part}" in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
    esac
    printf '%s.%s.%s\n' "${major}" "${minor}" "${patch}"
}

sync_manifest_versions() {
    local version="$1"
    local backend_version="${version}-SNAPSHOT"

    if [[ -f "${BACKEND_POM}" ]]; then
        perl -0pi -e 's|(<artifactId>loom</artifactId>\s*)<version>[^<]+</version>|$1<version>'"${backend_version}"'</version>|s' "${BACKEND_POM}"
    fi

    for json_file in "${FRONTEND_PACKAGE}" "${FRONTEND_LOCK}"; do
        if [[ -f "${json_file}" ]]; then
            command -v node >/dev/null 2>&1 || { echo "node is required to update ${json_file}" >&2; exit 1; }
            LOOM_NEW_VERSION="${version}" node -e '
const fs = require("node:fs");
const file = process.argv[1];
const nextVersion = process.env.LOOM_NEW_VERSION;
const data = JSON.parse(fs.readFileSync(file, "utf8"));

data.version = nextVersion;
if (data.packages && data.packages[""]) {
  data.packages[""].version = nextVersion;
}

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
' "${json_file}"
        fi
    done
}

prompt_part() {
    local reply
    echo "Versione corrente: ${CURRENT}" >&2
    echo "Scegli il tipo di bump:" >&2
    echo "  1) patch -> $(bumped_version patch "${MAJOR}" "${MINOR}" "${PATCH}")" >&2
    echo "  2) minor -> $(bumped_version minor "${MAJOR}" "${MINOR}" "${PATCH}")" >&2
    echo "  3) major -> $(bumped_version major "${MAJOR}" "${MINOR}" "${PATCH}")" >&2
    while true; do
        read -r -u "${PROMPT_FD}" -p "Tipo [patch/minor/major, default patch]: " reply
        reply="${reply:-patch}"
        case "${reply}" in
            1|patch) echo "patch"; return ;;
            2|minor) echo "minor"; return ;;
            3|major) echo "major"; return ;;
            *) echo "  Valore non valido. Usa patch, minor o major." >&2 ;;
        esac
    done
}

prompt_commit() {
    local reply
    while true; do
        read -r -u "${PROMPT_FD}" -p "Creare commit per VERSION? [y/N]: " reply
        reply="${reply:-n}"
        case "${reply}" in
            y|Y|yes|YES|s|S|si|SI) echo "1"; return ;;
            n|N|no|NO) echo "0"; return ;;
            *) echo "  Rispondi y oppure n." >&2 ;;
        esac
    done
}

if [[ -z "${PART}" ]]; then
    if [[ "${PROMPT_FD}" -eq 0 && ! -t 0 ]]; then
        echo "stdin is not interactive; pass major, minor or patch explicitly" >&2
        exit 1
    fi
    PART="$(prompt_part)"
fi

NEW="$(bumped_version "${PART}" "${MAJOR}" "${MINOR}" "${PATCH}")"

printf '%s\n' "${NEW}" > "${VERSION_FILE}"
sync_manifest_versions "${NEW}"

OLD_PRETTY=$(git -C "${REPO_ROOT}" describe --tags --dirty 2>/dev/null || echo "(none)")
echo "VERSION: ${CURRENT} -> ${NEW}  (last tag: ${OLD_PRETTY})"

if [[ -z "${COMMIT}" ]]; then
    if [[ "${PROMPT_FD}" -eq 0 && ! -t 0 ]]; then
        COMMIT=0
    else
        COMMIT="$(prompt_commit)"
    fi
fi

if [[ "${COMMIT}" -eq 1 ]]; then
    cd "${REPO_ROOT}"
    git commit -m "release: bump ${NEW}" -- VERSION backend/pom.xml frontend/package.json frontend/package-lock.json
    echo "  committed."
fi
