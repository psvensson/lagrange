#!/usr/bin/env bash
# Bootstrap one agent worktree for the parallel-session architecture
# (solve/epics/parallel-session-architecture.md, item 1):
#
#   one agent, one worktree, one branch; the main checkout is
#   integration-only. Agents work on agent/<name>/<quest-id> branches,
#   never detached (a landing on detached HEAD commits unreachable garbage).
#
# What this script does, in order:
#   1. Creates branch agent/<name>/<quest-id> from the current main checkout
#      HEAD (never reusing an existing branch) and a sibling worktree at
#      ../<repo>-<name>-<quest-id>.
#   2. Installs repo hooks with the RELATIVE core.hooksPath (.githooks) so
#      the worktree runs its own hook copies at its own commit.
#   3. Copies the gitignored solve/config.json and any .env* files from the
#      main checkout — without them agent executor runs silently disable.
#   4. Symlinks node_modules from the main checkout so test runners resolve
#      (same pattern session-worktree.js uses; the pre-commit eslint cache
#      lives in the worktree-private git dir, so no cache sharing results).
#
# Usage:
#   bash scripts/worktree-setup.sh <agent-name> <quest-id> [base-ref]
#
# Examples:
#   bash scripts/worktree-setup.sh claude parallel-session-quest-leases
#   bash scripts/worktree-setup.sh gpt my-quest origin/main
#
# The script is idempotent-safe by refusal: it fails rather than reusing an
# existing branch or worktree path. Run from the main (integration) checkout.

set -euo pipefail

usage() {
  echo "usage: bash scripts/worktree-setup.sh <agent-name> <quest-id> [base-ref]" >&2
  exit 2
}

sanitize() {
  # Branch and path component: keep alphanumerics, dot, underscore, dash.
  local value="${1:-}"
  value="${value//[^A-Za-z0-9._-]/-}"
  value="${value#-}"
  value="${value%-}"
  if [ -z "${value}" ]; then
    echo "error: empty component after sanitization" >&2
    exit 2
  fi
  printf '%s' "${value}"
}

[ -n "${1:-}" ] && [ -n "${2:-}" ] || usage
AGENT_NAME="$(sanitize "${1}")"
QUEST_ID="$(sanitize "${2}")"
BASE_REF="${3:-HEAD}"

MAIN_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "${MAIN_ROOT}")"
BRANCH="agent/${AGENT_NAME}/${QUEST_ID}"
WORKTREE_PATH="${MAIN_ROOT}/../${REPO_NAME}-${AGENT_NAME}-${QUEST_ID}"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "error: branch ${BRANCH} already exists — refusing to reuse it" >&2
  exit 1
fi
if [ -e "${WORKTREE_PATH}" ]; then
  echo "error: worktree path ${WORKTREE_PATH} already exists — refusing to reuse it" >&2
  exit 1
fi
if git worktree list --porcelain | grep -q "^branch refs/heads/${BRANCH}$"; then
  echo "error: branch ${BRANCH} is already checked out in another worktree" >&2
  exit 1
fi

echo "[worktree-setup] creating worktree ${WORKTREE_PATH} on branch ${BRANCH} (base: ${BASE_REF})"
git worktree add --quiet -b "${BRANCH}" "${WORKTREE_PATH}" "${BASE_REF}"

# Hooks: relative core.hooksPath is config local to each worktree's private
# git dir, so install inside the new worktree (epic: each worktree runs its
# own hook copies at its own commit).
(
  cd "${WORKTREE_PATH}"
  node scripts/install-git-hooks.js
)

# Gitignored configuration: the agent executor reads solve/config.json and
# silently disables when it is absent; .env* carry node/admin settings.
COPIED=()
for candidate in solve/config.json .env .env.local .env.development; do
  if [ -f "${MAIN_ROOT}/${candidate}" ]; then
    cp "${MAIN_ROOT}/${candidate}" "${WORKTREE_PATH}/${candidate}"
    COPIED+=("${candidate}")
  fi
done
if [ "${#COPIED[@]}" -gt 0 ]; then
  echo "[worktree-setup] copied config: ${COPIED[*]}"
else
  echo "[worktree-setup] no gitignored config found to copy (solve/config.json, .env*)"
fi

# node_modules: symlink the main checkout's install so runners resolve
# without a multi-minute npm ci; it is gitignored and identical at base-ref.
if [ -d "${MAIN_ROOT}/node_modules" ] && [ ! -e "${WORKTREE_PATH}/node_modules" ]; then
  ln -s "${MAIN_ROOT}/node_modules" "${WORKTREE_PATH}/node_modules"
  echo "[worktree-setup] symlinked node_modules from main checkout"
fi

echo "[worktree-setup] done. Work in ${WORKTREE_PATH}; the session registry"
echo "[worktree-setup] (git common dir) coordinates this worktree automatically"
echo "[worktree-setup] on the first solve start/continue."
