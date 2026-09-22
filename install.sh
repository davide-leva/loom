#!/usr/bin/env bash
# install.sh — bootstrap the stack on a fresh host.
#
# Downloads the minimum files required to deploy with Docker Compose
# (compose.yml + .env.example + scripts/configure.sh) from GitHub and
# then runs configure.sh, which generates .env and the Caddyfile.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/master/install.sh | bash
#
# Environment overrides:
#   REPO              owner/repo on GitHub (default: davide-leva/ticket-platform)
#   BRANCH            git ref to fetch from   (default: master)
#   DIR               target directory        (default: current directory)
#   NONINTERACTIVE=1  pass --non-interactive to configure.sh
#
# Requirements on the host: bash, curl, openssl, docker (with the compose plugin).

set -euo pipefail

REPO="${REPO:-davide-leva/ticket-platform}"
BRANCH="${BRANCH:-master}"
DIR="${DIR:-$(pwd)}"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

echo "→ Bootstrapping ${REPO} @ ${BRANCH} into ${DIR}"

command -v curl >/dev/null 2>&1   || { echo "curl is required" >&2;   exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }

mkdir -p "${DIR}"
cd "${DIR}"

for f in compose.yml .env.example scripts/configure.sh; do
    echo "  fetching ${f}"
    mkdir -p "$(dirname "${f}")"
    curl -fsSL "${RAW}/${f}" -o "${f}"
done

chmod +x scripts/configure.sh

ARGS=()
if [[ "${NONINTERACTIVE:-0}" == "1" ]]; then
    ARGS+=(--non-interactive)
fi

echo
echo "→ Running scripts/configure.sh ${ARGS[*]:-}"
bash scripts/configure.sh "${ARGS[@]}"

cat <<EOF

✓ Stack files are in place in ${DIR}.

Next:
  cd ${DIR}
  docker compose up -d

Then open:
  - http://localhost/          (TLS_ENABLED=false)
  - https://<your-domain>/     (TLS_ENABLED=true)
EOF
