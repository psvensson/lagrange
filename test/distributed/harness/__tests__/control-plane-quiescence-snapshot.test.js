import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
  CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescenceCandidateWindowReset,
  buildControlPlaneQuiescenceSnapshot,
} from '../control-plane-quiescence-snapshot.js';

const NOW_MS = 10_000;
const STABLE_WINDOW_STARTED_AT_MS = 4_000;
const STABLE_WINDOW_MS = 5_000;
const MAX_IN_FLIGHT_COUNT = 0;
const LEADER_QUIET_ELAPSED_MS = 6_000;
const SNAPSHOT_NODE_ID = 'node-a';
const SNAPSHOT_CAPTURED_AT_MS = 9_000;
const LEADER_SIGNATURE = 'leader-signature';
const LEADER_COUNT = 1;
const IN_FLIGHT_COUNT = 1;
const STALE_IN_FLIGHT_COUNT = IN_FLIGHT_COUNT;
const CACHE_VISIBLE_SATISFIED_PRIORITY_RECOVERY_OPERATION_COUNT =
  IN_FLIGHT_COUNT;
const OPERATION_NO_PROGRESS_ELAPSED_MS = 30_000;
const OPERATION_NO_PROGRESS_TIMEOUT_MS = 15_000;
const SNAPSHOT_PRESSURE_ERROR = 'Admin API query timed out';
const SNAPSHOT_OBSERVATION_ERROR = 'snapshot rows unavailable';
const DISCOVERY_REPAIR_TIMEOUT_DETAIL =
  'Authoritative discovery repair timed out after 1500ms';
const NODE_STATE_PUBLICATION_PRESSURE_DETAIL =
  'Distributed operation failed due to participant failures';
const CRITICAL_SPREAD_GAP = 2;
const CRITICAL_SYSTEM_SNAPSHOT_LANE_UNAVAILABLE_TABLE_COUNT = 1;
const CRITICAL_SYSTEM_SNAPSHOT_LANE_UNAVAILABLE_ERROR =
  'Admin API query timed out for node seed-b on lane snapshot after 1ms';
const CRITICAL_SYSTEM_TABLE_NAME = 'replica_operations';
const CANDIDATE_WINDOW_RESET_OBSERVED_AT_MS = 9_500;
const READY_CRITICAL_SYSTEM_TOPOLOGY = Object.freeze({
  enabled: true,
  ready: true,
  totalSpreadGap: 0,
});
const OPEN_CRITICAL_SYSTEM_TOPOLOGY = Object.freeze({
  enabled: true,
  ready: false,
  observationState:
    CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE.AVAILABLE,
  totalSpreadGap: CRITICAL_SPREAD_GAP,
});
const SNAPSHOT_LANE_UNAVAILABLE_CRITICAL_SYSTEM_TOPOLOGY = Object.freeze({
  enabled: true,
  ready: false,
  observationState:
    CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
      .SNAPSHOT_LANE_UNAVAILABLE,
  snapshotLaneUnavailableTableCount:
    CRITICAL_SYSTEM_SNAPSHOT_LANE_UNAVAILABLE_TABLE_COUNT,
  totalSpreadGap: CRITICAL_SPREAD_GAP,
  tables: Object.freeze([
    Object.freeze({
      tableName: CRITICAL_SYSTEM_TABLE_NAME,
      observationState:
        CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
          .SNAPSHOT_LANE_UNAVAILABLE,
      error: CRITICAL_SYSTEM_SNAPSHOT_LANE_UNAVAILABLE_ERROR,
    }),
  ]),
});

function buildSnapshotProbe(overrides = {}) {
  return {
    nodeId: SNAPSHOT_NODE_ID,
    capturedAtMs: SNAPSHOT_CAPTURED_AT_MS,
    inFlightCount: 0,
    leaderSignature: LEADER_SIGNATURE,
    leaderCount: LEADER_COUNT,
    operationTimelineSignature: null,
    error: null,
    ...overrides,
  };
}

test('control-plane quiescence snapshot emits quiescent state after stable window',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe(),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(snapshot.state, CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT);
    assert.equal(snapshot.ready, true);
    assert.deepEqual(snapshot.reasonCodes, []);
  });

test('control-plane quiescence snapshot names operation drain blocker',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({inFlightCount: IN_FLIGHT_COUNT}),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
    );
  });

test('control-plane quiescence snapshot discounts stale replica operations when requested',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        inFlightCount: IN_FLIGHT_COUNT,
        staleInFlightCount: STALE_IN_FLIGHT_COUNT,
      }),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      ignoreStaleInFlightReplicaOperations: true,
    });

    assert.equal(snapshot.state, CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT);
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.effectiveInFlightCount, MAX_IN_FLIGHT_COUNT);
    assert.equal(snapshot.staleInFlightCount, STALE_IN_FLIGHT_COUNT);
  });

test('control-plane quiescence snapshot discounts cache-visible satisfied priority recovery operations when requested',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        inFlightCount: IN_FLIGHT_COUNT,
        cacheVisibleSatisfiedPriorityRecoveryOperationCount:
          CACHE_VISIBLE_SATISFIED_PRIORITY_RECOVERY_OPERATION_COUNT,
      }),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      ignoreStaleInFlightReplicaOperations: true,
    });

    assert.equal(snapshot.state, CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT);
    assert.equal(snapshot.ready, true);
    assert.equal(snapshot.effectiveInFlightCount, MAX_IN_FLIGHT_COUNT);
    assert.equal(
      snapshot.cacheVisibleSatisfiedPriorityRecoveryOperationCount,
      CACHE_VISIBLE_SATISFIED_PRIORITY_RECOVERY_OPERATION_COUNT,
    );
    assert.equal(
      snapshot.staleInFlightDiscountCount,
      CACHE_VISIBLE_SATISFIED_PRIORITY_RECOVERY_OPERATION_COUNT,
    );
  });

test('control-plane quiescence snapshot combines stale and explicit additional operation discounts',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        inFlightCount: 2,
        staleInFlightCount: 1,
        cacheVisibleSatisfiedPriorityRecoveryOperationCount: 3,
        additionalInFlightDiscountCount: 1,
      }),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      ignoreStaleInFlightReplicaOperations: true,
    });

    assert.equal(snapshot.state, CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT);
    assert.equal(snapshot.effectiveInFlightCount, 0);
    assert.equal(snapshot.staleInFlightDiscountCount, 2);
    assert.equal(snapshot.additionalInFlightDiscountCount, 1);
    assert.equal(snapshot.appliedAdditionalInFlightDiscountCount, 1);
  });

test('control-plane quiescence snapshot keeps additional operation discounts gated by critical topology',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        inFlightCount: IN_FLIGHT_COUNT,
        additionalInFlightDiscountCount: IN_FLIGHT_COUNT,
      }),
      criticalSystemTopology: OPEN_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      ignoreStaleInFlightReplicaOperations: true,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
    );
    assert.equal(snapshot.effectiveInFlightCount, IN_FLIGHT_COUNT);
    assert.equal(snapshot.staleInFlightDiscountCount, 0);
    assert.equal(snapshot.appliedAdditionalInFlightDiscountCount, 0);
  });

test('control-plane quiescence candidate preserves prior stable-window reset',
  () => {
    const blockedSnapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({inFlightCount: IN_FLIGHT_COUNT}),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });
    const candidateWindowReset =
      buildControlPlaneQuiescenceCandidateWindowReset(
        blockedSnapshot,
        CANDIDATE_WINDOW_RESET_OBSERVED_AT_MS,
      );
    const candidateSnapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe(),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: NOW_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      candidateWindowReset,
    });

    assert.equal(
      candidateSnapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
    );
    assert.equal(candidateSnapshot.canonicalBlocker, null);
    assert.equal(
      candidateSnapshot.candidateWindowReset.reason,
      CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
        .OPERATION_DRAIN_PROGRESSING,
    );
    assert.equal(
      candidateSnapshot.candidateWindowReset.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
    );
  });

test('control-plane quiescence snapshot names stalled operation drain blocker',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({inFlightCount: IN_FLIGHT_COUNT}),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
      operationNoProgressElapsedMs: OPERATION_NO_PROGRESS_ELAPSED_MS,
      operationNoProgressTimeoutMs: OPERATION_NO_PROGRESS_TIMEOUT_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_STALLED,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED,
    );
  });

test('control-plane quiescence snapshot names pressure-shaped observation failures',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({error: SNAPSHOT_PRESSURE_ERROR}),
      criticalSystemTopology: OPEN_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
    );
  });

test('control-plane quiescence snapshot preserves non-pressure observation failures',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({error: SNAPSHOT_OBSERVATION_ERROR}),
      criticalSystemTopology: OPEN_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
    );
  });

test('control-plane quiescence snapshot names discovery repair timeout pressure',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        controlPlanePressureSignals: [{
          reasonCode:
            CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
          detail: DISCOVERY_REPAIR_TIMEOUT_DETAIL,
        }],
      }),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
    );
    assert.deepEqual(
      snapshot.reasonCodes,
      [CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT],
    );
  });

test('control-plane quiescence snapshot names node-state publication pressure',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe({
        controlPlanePressureSignals: [{
          reasonCode:
            CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
          detail: NODE_STATE_PUBLICATION_PRESSURE_DETAIL,
        }],
      }),
      criticalSystemTopology: READY_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
    );
    assert.deepEqual(
      snapshot.reasonCodes,
      [CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE],
    );
  });

test('control-plane quiescence snapshot names critical spread blockers',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe(),
      criticalSystemTopology: OPEN_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OPEN,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
    );
  });

test('control-plane quiescence snapshot separates critical spread observation gaps',
  () => {
    const snapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe(),
      criticalSystemTopology:
        SNAPSHOT_LANE_UNAVAILABLE_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    assert.equal(
      snapshot.state,
      CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
    );
    assert.equal(
      snapshot.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON
        .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
    );
    assert.deepEqual(
      snapshot.reasonCodes,
      [
        CONTROL_PLANE_QUIESCENCE_REASON
          .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
      ],
    );
  });

test('control-plane quiescence candidate reset preserves critical spread observation gaps',
  () => {
    const blockedSnapshot = buildControlPlaneQuiescenceSnapshot({
      snapshotProbe: buildSnapshotProbe(),
      criticalSystemTopology:
        SNAPSHOT_LANE_UNAVAILABLE_CRITICAL_SYSTEM_TOPOLOGY,
      nowMs: NOW_MS,
      stableWindowStartedAtMs: STABLE_WINDOW_STARTED_AT_MS,
      stableWindowMs: STABLE_WINDOW_MS,
      maxInFlightCount: MAX_IN_FLIGHT_COUNT,
      leaderQuietElapsedMs: LEADER_QUIET_ELAPSED_MS,
    });

    const candidateWindowReset =
      buildControlPlaneQuiescenceCandidateWindowReset(
        blockedSnapshot,
        CANDIDATE_WINDOW_RESET_OBSERVED_AT_MS,
      );

    assert.equal(
      candidateWindowReset.reason,
      CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
        .CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
    );
    assert.equal(
      candidateWindowReset.canonicalBlocker,
      CONTROL_PLANE_QUIESCENCE_REASON
        .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
    );
  });
