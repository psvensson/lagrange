#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-bulk-transfer (S3 of
// solve/specs/raft-snapshot-transfer-install/tasks.md). The scenario proves
// the bulk-transfer protocol (resume-from-verified-boundary, tamper,
// truncation, whole-digest, version/geometry/epoch aborts, publication token
// semantics), the transport lane-isolation guard (critical enqueue+dispatch
// and quarantine untouched under bulk saturation; IDENTIFY fork leaves the
// primary connection intact), and the DT6 cost-table convergence guard
// (bounded chunk charges keep heartbeat/election budgets; the unbounded
// negative control blows them), AND re-runs the S1/S2 suites plus the
// gated-compaction regression files so S3 demonstrably weakens neither.
const SCENARIOS = {
  'raft-snapshot-bulk-transfer': [
    'test/raft/snapshot-transfer-protocol.test.js',
    'test/transport/bulk-transfer-lane-isolation.test.js',
    'test/convergence/dt6-bulk-transfer-budget.test.js',
    'test/raft/snapshot-install-transition.test.js',
    'test/raft/snapshot-install-restart-states.test.js',
    'test/raft/snapshot-boundary-observability.test.js',
    'test/raft/snapshot-checkpoint-format-contract.test.js',
    'test/raft/snapshot-checkpoint-sqlite-payload.test.js',
    'test/raft/snapshot-checkpoint-restart-read.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
