/**
 * Scenario runner for the release-0-2-snapshot-integration quest.
 *
 * Replays the S1-S6 snapshot lineage guards on current HEAD as the two
 * release frontier scenarios:
 *  - release-0-2-snapshot-compacted-follower-catchup: the compacted-follower
 *    catch-up guard union from the terminal
 *    raft-snapshot-compacted-follower-catchup quest (catch-up dispatch and
 *    end-to-end, recorded gaps, transfer protocol and lane isolation,
 *    install transition/restart states, boundary observability, checkpoint
 *    payload, and gated-compaction contract).
 *  - release-0-2-snapshot-production-wiring-live-safety: the production
 *    wiring and live-safety guard union from the terminal
 *    raft-snapshot-live-rebuild and raft-snapshot-retention-compaction
 *    quests (cadence, dispatcher wiring, bulk registry bootstrap, socket
 *    adapter, offer router, multichunk transfer, proof-gated compaction,
 *    retention sweep, compaction catch-up integration, and log-adapter
 *    contract).
 * The aggregate scenario unions all guards and matches the quest doneWhen.
 * The S1-S6 receipts themselves are provenance; this replay binds the claim
 * to current production bytes as required by the release-0-2 epic (G3).
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const COMPACTED_FOLLOWER_CATCHUP_GUARDS = Object.freeze([
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
]);
const PRODUCTION_WIRING_LIVE_SAFETY_GUARDS = Object.freeze([
  'test/raft/snapshot-cadence.test.js',
  'test/raft/snapshot-dispatcher-wiring.test.js',
  'test/transport/bulk-registry-bootstrap.test.js',
  'test/raft/bulk-transfer-socket-adapter.test.js',
  'test/raft/snapshot-offer-router.test.js',
  'test/raft/snapshot-multichunk-transfer.test.js',
  'test/raft/snapshot-proof-gated-compaction.test.js',
  'test/raft/snapshot-retention-sweep.test.js',
  'test/raft/snapshot-compaction-catchup-integration.test.js',
  'test/raft/snapshot-gated-compaction-malformed-index.test.js',
  'test/raft/in-memory-log-adapter-contract.test.js',
]);

const SCENARIOS = Object.freeze({
  'release-0-2-snapshot-compacted-follower-catchup':
    COMPACTED_FOLLOWER_CATCHUP_GUARDS,
  'release-0-2-snapshot-production-wiring-live-safety':
    PRODUCTION_WIRING_LIVE_SAFETY_GUARDS,
  'release-0-2-snapshot-integration': Object.freeze([
    ...COMPACTED_FOLLOWER_CATCHUP_GUARDS,
    ...PRODUCTION_WIRING_LIVE_SAFETY_GUARDS,
  ]),
});

runGuardTestScenarios(SCENARIOS);
