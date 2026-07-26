#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-atomic-install (S2 of
// solve/specs/raft-snapshot-transfer-install/tasks.md). The scenario proves
// the atomic install transition, restart-state machine, and boundary
// observability, AND re-runs the S1 checkpoint suite plus the
// gated-compaction regression files so S2 demonstrably weakens neither.
const SCENARIOS = {
  'raft-snapshot-atomic-install': [
    'test/raft/snapshot-install-transition.test.js',
    'test/raft/snapshot-install-restart-states.test.js',
    'test/raft/snapshot-boundary-observability.test.js',
    'test/raft/snapshot-checkpoint-format-contract.test.js',
    'test/raft/snapshot-checkpoint-sqlite-payload.test.js',
    'test/raft/snapshot-checkpoint-restart-read.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
    'test/raft/snapshot-gated-compaction-malformed-index.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
