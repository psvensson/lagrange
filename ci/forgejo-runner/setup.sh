#!/bin/bash
# One-shot setup for the self-hosted Codeberg runner.
#
#   ./setup.sh <REGISTRATION_TOKEN>
#
# Token: codeberg.org repo (or account) Settings -> Actions -> Runners ->
# "Create new runner" — the token is shown ONCE.
#
# Registers the runner with the labels our workflows target and starts the
# daemon via docker compose. Idempotent-ish: re-running re-registers.
set -euo pipefail

TOKEN="${1:?usage: ./setup.sh <REGISTRATION_TOKEN>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

mkdir -p data
cp config-template.yml data/config.yml

# Labels:
#  - docker: what ci.yml and release.yml use (runs-on: docker). The
#    catthehacker image ships docker CLI, curl, git — release.yml's
#    setup-node/helm/docker steps all work in it.
#  - ubuntu-latest: convenience alias for future third-party workflows.
docker run --rm \
  -v "$DIR/data":/data \
  --workdir /data \
  data.forgejo.org/forgejo/runner:12 \
  forgejo-runner register --no-interactive \
    --instance https://codeberg.org \
    --token "$TOKEN" \
    --name "$(hostname)-lagrange" \
    --labels "docker:docker://ghcr.io/catthehacker/ubuntu:act-latest,ubuntu-latest:docker://ghcr.io/catthehacker/ubuntu:act-latest"

docker compose up -d
echo
echo "Runner started. It should appear as Idle under Settings -> Actions -> Runners."
echo "Logs: docker logs -f lagrange-forgejo-runner"
