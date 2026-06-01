#!/usr/bin/env bash
# Reference agent adapter for the solver's generic executor contract.
#
# The solver invokes:  <this script> <requestFile> <responseFile>
# (it also exports SOLVE_REQUEST_FILE / SOLVE_RESPONSE_FILE).
#
# Contract:
#   - Read the dossier (JSON) from the request file: questId, statement, frontier,
#     rung, rungPrompt, repoRoot, metricName, findings[], constraints.
#   - Do the work however you like (call any CLI, model API, or human).
#   - Write a JSON response { "changeRef": "...", "summary": "...", "notes": "..." }.
#     changeRef must be "diff:<path>" (an existing patch file).
#   - Report ONLY what you did. Never claim success — the solver re-measures via the
#     probe, so a failed or dishonest run simply shows no metric movement.
#
# This stub just echoes the dossier and emits an empty (no-op) response, which the
# honesty check treats as "no change". Replace the middle with a real agent call.
set -euo pipefail

REQUEST_FILE="${1:-${SOLVE_REQUEST_FILE:?request file required}}"
RESPONSE_FILE="${2:-${SOLVE_RESPONSE_FILE:?response file required}}"

echo "agent adapter received dossier:" >&2
cat "$REQUEST_FILE" >&2

# --- replace this block with your agent invocation -------------------------------
# e.g. produce a patch and: CHANGE_REF="diff:/abs/path/to.patch"
CHANGE_REF=""
SUMMARY="reference stub: no change made"
# ---------------------------------------------------------------------------------

if [ -z "$CHANGE_REF" ]; then
  # Emit nothing resolvable; the solver records a no-op attempt and escalates the rung.
  printf '{"changeRef": null, "summary": %s}\n' "\"$SUMMARY\"" > "$RESPONSE_FILE"
else
  printf '{"changeRef": "%s", "summary": %s}\n' "$CHANGE_REF" "\"$SUMMARY\"" \
    > "$RESPONSE_FILE"
fi
