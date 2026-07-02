#!/bin/bash
# One-shot setup for the self-hosted Codeberg runner (Forgejo 15 model).
#
#   ./setup.sh <UUID> <TOKEN>
#
# UUID + TOKEN come from the Codeberg "Create new runner" screen
# (repo Settings -> Actions -> Runners -> Create new runner). Both are shown
# once. There is no separate `register` step in Forgejo 15 — the daemon
# connects using the credentials declared in the config.
set -euo pipefail

UUID="${1:?usage: ./setup.sh <UUID> <TOKEN>}"
TOKEN="${2:?usage: ./setup.sh <UUID> <TOKEN>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

mkdir -p data
# Drop any state from a prior/failed attempt so we start clean.
rm -f data/.runner
cp config-template.yml data/config.yml

# Append the connection block (2-space indented, top-level `server:` key).
cat >> data/config.yml <<EOF

server:
  connections:
    codeberg:
      url: https://codeberg.org/
      uuid: ${UUID}
      token: ${TOKEN}
EOF

docker compose up -d
echo
echo "Runner started. It should appear as Idle under Settings -> Actions -> Runners."
echo "Logs: docker logs -f lagrange-forgejo-runner"
