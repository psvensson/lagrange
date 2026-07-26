#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Quest raft-snapshot-live-rebuild (S6 of
// solve/specs/raft-snapshot-transfer-install/tasks.md), Phase A. The
// scenario proves every previously-dead production link of the S1-S5
// snapshot chain is wired with a red-on-revert guard: the leader checkpoint
// cadence riding the 1s prepared-state-hold sweep, the
// onSnapshotCatchupNeeded dispatcher seam on BOTH production factories, the
// bulk-channel registry bootstrap at the shared MessageRouter setup, the
// bulk-connection/transfer-socket adapter (token bucket authoritative,
// non-SENT fatal), the peek-then-replay follower offer router with the
// replaceLocalReplicaService swap, and the scaled multi-chunk fixture
// (dozens of chunks, resume-from-boundary, the attack battery, one
// tens-of-MiB default-geometry case) — AND re-runs the unmodified
// gated-compaction guard files plus the S1-S5 suites so the wiring
// demonstrably weakens none of them.
const SCENARIOS = {
  'raft-snapshot-live-rebuild': [
    'test/raft/snapshot-cadence.test.js',
    'test/raft/snapshot-dispatcher-wiring.test.js',
    'test/transport/bulk-registry-bootstrap.test.js',
    'test/raft/bulk-transfer-socket-adapter.test.js',
    'test/raft/snapshot-offer-router.test.js',
    'test/raft/snapshot-multichunk-transfer.test.js',
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
    'test/raft/snapshot-gated-compaction-malformed-index.test.js',
    'test/raft/in-memory-log-adapter-contract.test.js',
    'test/raft/snapshot-catchup-dispatch.test.js',
    'test/raft/snapshot-catchup-end-to-end.test.js',
    'test/raft/snapshot-proof-gated-compaction.test.js',
    'test/raft/snapshot-boundary-observability.test.js',
    'test/raft/snapshot-install-transition.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
