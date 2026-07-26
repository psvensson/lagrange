#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-retention-compaction (S5 of
// solve/specs/raft-snapshot-transfer-install/tasks.md). The scenario proves
// bounded generation retention (pins, the newest-survives floor,
// descriptor-first deletion, the opportunistic post-creation sweep), the
// full proof-gated compaction decision table with its no-proof-cannot-remove
// red direction, and the compaction-catchup integration (a compacted leader
// closing the S4 loop, the refuted stale-facade hazard pinned via
// refresh-on-row-miss, HLC seal non-regression, prepared-gate transitivity)
// — AND re-runs the unmodified gated-compaction guard files plus the S1-S4
// suites so the cutover demonstrably weakens none of them.
const SCENARIOS = {
  'raft-snapshot-retention-compaction': [
    'test/raft/snapshot-retention-sweep.test.js',
    'test/raft/snapshot-proof-gated-compaction.test.js',
    'test/raft/snapshot-compaction-catchup-integration.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
    'test/raft/snapshot-gated-compaction-malformed-index.test.js',
    'test/raft/in-memory-log-adapter-contract.test.js',
    'test/raft/snapshot-catchup-dispatch.test.js',
    'test/raft/snapshot-catchup-end-to-end.test.js',
    'test/raft/snapshot-boundary-observability.test.js',
    'test/raft/snapshot-checkpoint-sqlite-payload.test.js',
    'test/raft/snapshot-install-transition.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
