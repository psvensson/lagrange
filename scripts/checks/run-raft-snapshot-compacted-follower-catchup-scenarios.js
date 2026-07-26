#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-compacted-follower-catchup (S4 of
// solve/specs/raft-snapshot-transfer-install/tasks.md). The scenario proves
// the leader decision sites (b1/b2 install_snapshot, the DISTINCT
// catchup_range_empty corruption decision, absent-callback no-op,
// non-boundary catch-up unchanged), the full deterministic end-to-end loop
// (installed leader, fresh follower, dispatch -> transfer -> shutdown ->
// install -> recreate -> resume exactly at boundary+1 with state
// convergence, plus the scenario (a) installed-follower regression and the
// durable-term boot seeding), and the five recorded-gap pins — AND re-runs
// the S1/S2/S3 suites plus the gated-compaction regressions so S4
// demonstrably weakens none of them.
const SCENARIOS = {
  'raft-snapshot-compacted-follower-catchup': [
    'test/raft/snapshot-catchup-dispatch.test.js',
    'test/raft/snapshot-catchup-end-to-end.test.js',
    'test/raft/snapshot-recorded-gaps.test.js',
    'test/raft/snapshot-transfer-protocol.test.js',
    'test/transport/bulk-transfer-lane-isolation.test.js',
    'test/raft/snapshot-install-transition.test.js',
    'test/raft/snapshot-install-restart-states.test.js',
    'test/raft/snapshot-boundary-observability.test.js',
    'test/raft/snapshot-checkpoint-sqlite-payload.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
