// Witness for the lease-liveness-watermark-observed quest, receipt 4.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. The admission observer of the traced run recorded 55 observations,
// 53 of them `observation_unavailable`, and carried the ready-lease witness
// only on the snapshot it failed with. Reading the recorded transition
// history afterwards therefore could not say which node held the lapsed
// lease at any point before the end.
//
// A repeated observation is not a transition, so the FIRST witness of a
// merged run is kept - but the named node can change inside that run, and
// that was invisible too. The latest witness is carried beside the first,
// each stamped with the observation it belongs to, plus how often it changed.
// None of it enters the fingerprint, so what merges with what is unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_SNAPSHOT_LEASE_AGE_STATE,
} from '../../src/admin/admin-control-snapshot-stale-watermark-record.js';
import {
  waitForAffinityDemoSchemaAdmission,
} from '../../examples/service-data-affinity/affinity-demo-preload-gate.js';

const BASE_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const NOW_MS = 500_000;
const OBSERVER_TIMEOUT_MS = 12;
const OBSERVER_STABLE_WINDOW_MS = 1_000_000;
const QUERY_ERROR = 'Admin API query timed out';
const SEED_NODE_ID = 'node-0';
const VICTIM_NODE_ID = 'node-1';
const THIRD_NODE_ID = 'node-2';
const RATINGS_LEADER_PARTITION_ID = 'ratings-p1';
const BLOCKED_PARTITION_ID = 'replica_operations-p1';
const PRIORITY_PARTITION_COUNT = 6;
const WITNESS_SCHEMA_VERSION = 1;
const WITNESS_AVAILABLE = 'available';
const WITNESS_UNAVAILABLE = 'unavailable';
const WITNESS_NO_STALE_ACTIVE_NODE = 'no_stale_active_node';
const WITNESS_SNAPSHOT_UNAVAILABLE = 'control_snapshot_witness_unavailable';
const OBSERVATION_SOURCE = 'control_snapshot_captured_rows';
const NODE_STATUS_ACTIVE = 'active';
const CONNECTION_STATE_READY = 'ready';
const SPREAD_GAP_OPEN = 2;
const FIRST_LEASE_AGE_MS = 41_000;
const SECOND_LEASE_AGE_MS = 43_000;
const THIRD_LEASE_AGE_MS = 90_000;
const FOURTH_LEASE_AGE_MS = 91_000;
const FINAL_LEASE_AGE_MS = 166_000;
const LIVE_LEASE_AGE_MS = -30_000;
const MERGED_RUN_OBSERVATION_COUNT = 3;
// Three observations, two witness updates: one changes the named node, the
// other only the lease age. Only the first is a change of what is observed.
const MERGED_RUN_WITNESS_CHANGES = 1;
const SCRIPTED_TRANSITION_COUNT = 5;

const UNAVAILABLE_WITNESS = Object.freeze({
  schemaVersion: WITNESS_SCHEMA_VERSION,
  state: WITNESS_UNAVAILABLE,
  reason: WITNESS_NO_STALE_ACTIVE_NODE,
});

function availableWitness(nodeId, ageMs) {
  return {
    schemaVersion: WITNESS_SCHEMA_VERSION,
    state: WITNESS_AVAILABLE,
    nodeId,
    status: NODE_STATUS_ACTIVE,
    connectionState: CONNECTION_STATE_READY,
    snapshotObservedAtMs: NOW_MS,
    readyLease: {
      state: WITNESS_AVAILABLE,
      expiresAtMs: NOW_MS - ageMs,
      ageMs,
    },
  };
}

function expectedRecordedWitness(nodeId, ageMs, observedAtMs) {
  const expired = ageMs >= 0;
  return {
    observedAtMs,
    state: WITNESS_AVAILABLE,
    reason: null,
    staleNodeId: nodeId,
    status: NODE_STATUS_ACTIVE,
    connectionState: CONNECTION_STATE_READY,
    readyLeaseState: WITNESS_AVAILABLE,
    leaseAgeState: expired ?
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.EXPIRED :
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.NOT_EXPIRED,
    readyLeaseAgeMs: ageMs,
    leaseExpiredForMs: expired ? ageMs : null,
  };
}

function expectedUnavailableRecordedWitness(reason, observedAtMs) {
  return {
    observedAtMs,
    state: WITNESS_UNAVAILABLE,
    reason,
    staleNodeId: null,
    status: null,
    connectionState: null,
    readyLeaseState: null,
    leaseAgeState: CONTROL_SNAPSHOT_LEASE_AGE_STATE.UNAVAILABLE,
    readyLeaseAgeMs: null,
    leaseExpiredForMs: null,
  };
}

function placementObservation(totalSpreadGap) {
  const satisfied = totalSpreadGap === 0;
  return {
    state: WITNESS_AVAILABLE,
    source: OBSERVATION_SOURCE,
    capturedAt: NOW_MS,
    satisfied,
    priorityPartitionSummary: {
      satisfied,
      blockedPartitionCount: satisfied ? 0 : 1,
      largestSpreadGap: totalSpreadGap,
      totalSpreadGap,
      missingPartitionIds: satisfied ? [] : [BLOCKED_PARTITION_ID],
      blockedPartitions: satisfied ?
        [] :
        [{partitionId: BLOCKED_PARTITION_ID, spreadGap: totalSpreadGap}],
    },
    leaderCoverage: {
      satisfied: true,
      requiredPartitionCount: PRIORITY_PARTITION_COUNT,
      observedLeaderPartitionCount: PRIORITY_PARTITION_COUNT,
      missingLeaderPartitionCount: 0,
      missingLeaderPartitionIds: [],
    },
  };
}

function snapshotRow(totalSpreadGap, readyLeaseAgeWitness) {
  return {
    capturedAt: NOW_MS,
    snapshotObservation: {state: 'fresh', reasonCodes: []},
    replicaOperations: {inFlightCount: 0, staleInFlightCount: 0, rows: []},
    leaders: {[RATINGS_LEADER_PARTITION_ID]: SEED_NODE_ID},
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation:
        placementObservation(totalSpreadGap),
      readyLeaseAgeWitness,
    },
  };
}

// usable -> spread open -> the same blocker observed three more times, the
// named node changing once inside that merged run and the age advancing
// twice -> observer blindness ->
// usable again with a lease that has NOT lapsed.
const POLL_SCRIPT = Object.freeze([
  {spreadGap: 0, witness: UNAVAILABLE_WITNESS},
  {
    spreadGap: SPREAD_GAP_OPEN,
    witness: availableWitness(VICTIM_NODE_ID, FIRST_LEASE_AGE_MS),
  },
  {
    spreadGap: SPREAD_GAP_OPEN,
    witness: availableWitness(VICTIM_NODE_ID, SECOND_LEASE_AGE_MS),
  },
  {
    spreadGap: SPREAD_GAP_OPEN,
    witness: availableWitness(THIRD_NODE_ID, THIRD_LEASE_AGE_MS),
  },
  {
    spreadGap: SPREAD_GAP_OPEN,
    witness: availableWitness(THIRD_NODE_ID, FOURTH_LEASE_AGE_MS),
  },
  {throws: true},
  {
    spreadGap: 0,
    witness: availableWitness(VICTIM_NODE_ID, LIVE_LEASE_AGE_MS),
  },
  {
    spreadGap: 0,
    witness: availableWitness(THIRD_NODE_ID, FINAL_LEASE_AGE_MS),
  },
]);

async function runObserver() {
  let pollIndex = 0;
  let nowMs = NOW_MS;
  try {
    return await waitForAffinityDemoSchemaAdmission({
      target: BASE_TARGET,
      now: () => nowMs,
      sleep: async () => {
        nowMs += 1;
      },
      timeoutMs: OBSERVER_TIMEOUT_MS,
      pollIntervalMs: 0,
      stableWindowMs: OBSERVER_STABLE_WINDOW_MS,
      query: async () => {
        const step = POLL_SCRIPT[
          Math.min(pollIndex, POLL_SCRIPT.length - 1)
        ];
        pollIndex += 1;
        if (step.throws) {
          throw new Error(QUERY_ERROR);
        }
        return {rows: [snapshotRow(step.spreadGap, step.witness)]};
      },
    });
  } catch (error) {
    return error.schemaAdmission;
  }
}

test('every admission observer transition records the ready-lease witness',
  async () => {
    const evidence = await runObserver();
    const transitions = evidence.transitionHistory.transitions;

    assert.ok(transitions.length >= SCRIPTED_TRANSITION_COUNT,
      `the script produced ${transitions.length} transitions`);
    for (const transition of transitions) {
      assert.ok(transition.readyLeaseWitness,
        `every transition carries a witness: ${JSON.stringify(transition)}`);
      assert.ok(transition.latestReadyLeaseWitness,
        'and the latest witness of its run');
      assert.equal(transition.readyLeaseWitness.observedAtMs,
        transition.firstObservedAtMs,
        'the first witness belongs to the observation that opened the run');
      assert.equal(transition.latestReadyLeaseWitness.observedAtMs,
        transition.lastObservedAtMs,
        'the latest witness belongs to the run\'s last observation');
    }

    assert.deepEqual(transitions[0].readyLeaseWitness,
      expectedUnavailableRecordedWitness(
        WITNESS_NO_STALE_ACTIVE_NODE,
        transitions[0].firstObservedAtMs,
      ),
      'the first usable observation records its unavailable witness');

    assert.equal(transitions[1].state, 'critical_spread_open');
    assert.deepEqual(transitions[1].readyLeaseWitness,
      expectedRecordedWitness(
        VICTIM_NODE_ID,
        FIRST_LEASE_AGE_MS,
        transitions[1].firstObservedAtMs,
      ),
      'the transition into a spread-open denial names the lapsed node');

    // The merged run: three observations, one transition, two node changes.
    const merged = transitions[2];
    assert.equal(merged.observationCount, MERGED_RUN_OBSERVATION_COUNT,
      'the repeated observations collapse into the transition they repeat');
    assert.deepEqual(merged.readyLeaseWitness,
      expectedRecordedWitness(
        VICTIM_NODE_ID,
        SECOND_LEASE_AGE_MS,
        merged.firstObservedAtMs,
      ),
      'the first witness of the run is kept');
    assert.deepEqual(merged.latestReadyLeaseWitness,
      expectedRecordedWitness(
        THIRD_NODE_ID,
        FOURTH_LEASE_AGE_MS,
        merged.lastObservedAtMs,
      ),
      'and the latest one is carried beside it, so a node change is visible');
    assert.equal(merged.readyLeaseWitnessChangeCount,
      MERGED_RUN_WITNESS_CHANGES,
      'with how many times the OBSERVED CLUSTER changed inside the run: the ' +
      'node changed once, and the age advancing is not a change');
    assert.notEqual(
      merged.readyLeaseWitness.readyLeaseAgeMs,
      merged.latestReadyLeaseWitness.readyLeaseAgeMs,
      'even though the age did advance between the two witnesses');

    assert.equal(transitions[3].state, 'control_plane_pressure');
    assert.deepEqual(transitions[3].readyLeaseWitness,
      expectedUnavailableRecordedWitness(
        WITNESS_SNAPSHOT_UNAVAILABLE,
        transitions[3].firstObservedAtMs,
      ),
      'observer blindness records an explicitly unavailable witness');

    // The watermark predicate also admits rows whose lease has NOT lapsed, so
    // a lease age is a named state rather than a negative "expired for".
    assert.deepEqual(transitions[4].readyLeaseWitness,
      expectedRecordedWitness(
        VICTIM_NODE_ID,
        LIVE_LEASE_AGE_MS,
        transitions[4].firstObservedAtMs,
      ),
      'a lease that has not lapsed is named, never a negative expiry age');
    assert.equal(transitions[4].readyLeaseWitness.leaseExpiredForMs, null);

    assert.deepEqual(evidence.snapshot.readyLeaseAgeWitness,
      availableWitness(THIRD_NODE_ID, FINAL_LEASE_AGE_MS),
      'the final snapshot still carries the whole witness, unchanged');
  });
