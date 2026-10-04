#!/usr/bin/env bash

# The complete CI proof has one deterministic order. Analysis/model writers
# finish before behavioural readers start, and the behavioural corpus has one
# resource-aware scheduler. No environment switch can select a second meaning
# of "complete".
set -euo pipefail
# It takes no argument: one it does not know refuses before anything runs.
if [ "$#" -gt 0 ]; then
  echo "unknown argument $1" >&2
  echo "usage: run-test-ci.sh" >&2
  exit 2
fi

npm run test:static
npm run model:contracts
npm run test:all
npm run test:chart:endpoint-sync
