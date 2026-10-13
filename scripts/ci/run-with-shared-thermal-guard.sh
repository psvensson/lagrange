#!/usr/bin/env bash
# One machine-local thermal authority shared with Spelunk. This adapter owns
# only runner/environment routing and the cross-repository machine lock; it
# never interprets a temperature or weakens Lagrange's proof taxonomy.
set -euo pipefail
if (( $# == 0 )); then
  echo "usage: run-with-shared-thermal-guard.sh COMMAND [ARGS...]" >&2
  exit 2
fi
if [[ "${LAGRANGE_RUNNER_ENVIRONMENT:-github-hosted}" != "self-hosted" ]]; then
  exec "$@"
fi
lab_dir="${LAB_LOCK_DIR:-$HOME/.lab}"
mkdir -p "$lab_dir"
exec 9>"$lab_dir/machine.lock"
flock -w 3600 9 || { echo "::error::Shared home runner remained busy for 60 minutes." >&2; exit 98; }
guard="$lab_dir/runner-thermal-guard.mjs"
pin="53ec4f0bcc0601522ba64a4b3d352a906206a7af"
if [[ ! -r "$guard" ]] || [[ "$(git hash-object "$guard")" != "$pin" ]]; then
  echo "::error::Missing or mismatched pinned shared thermal guard: $guard" >&2
  exit 97
fi
node "$guard" probe
exec node "$guard" run -- "$@"
