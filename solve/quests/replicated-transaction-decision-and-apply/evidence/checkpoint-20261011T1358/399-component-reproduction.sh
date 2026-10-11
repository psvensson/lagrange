#!/usr/bin/env bash
set -euo pipefail
# Reproduction from the retained exact commit and canonical per-file ledger.
# Uses lab placement/locking; this file does not assert integrated acceptance.
LAGRANGE_WORKSPACE_INJECTIONS=node_modules LAGRANGE_LAB_AGENT=codex-freshmg-component-reproduction \
node /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-proof/run-lab-files.mjs \
  /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011 \
  b16e932497d123c982a13f864503dd9ad668ec75 tv-dator \
  test/raft/raft-rs-backend/snapshot-staging-lifecycle-operation.test.js \
  test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js \
  test/message-group/message-group-fresh-learner-snapshot.test.js \
  test/node/replica-lifecycle-durable-generation.test.js \
  test/raft/raft-rs-backend/operation-port-lifecycle.test.js \
  test/raft/snapshot-install-transition.test.js \
  test/raft/snapshot-install-restart-states.test.js \
  test/raft/raft-rs-backend/operation-port-boundary.test.js
