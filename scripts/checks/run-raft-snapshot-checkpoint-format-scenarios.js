#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-checkpoint-format (S1 of
// solve/specs/raft-snapshot-transfer-install/tasks.md). The scenario proves
// the versioned checkpoint format AND re-runs the gated-compaction regression
// files, so S1 demonstrably does not weaken the S5-retired safety guard.
const SCENARIOS = {
  'raft-snapshot-checkpoint-format': [
    'test/raft/snapshot-checkpoint-format-contract.test.js',
    'test/raft/snapshot-checkpoint-sqlite-payload.test.js',
    'test/raft/snapshot-checkpoint-restart-read.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
    'test/raft/snapshot-gated-compaction-malformed-index.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
