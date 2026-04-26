import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
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
const OPERATION_NO_PROGRESS_ELAPSED_MS = 30_000;
const OPERATION_NO_PROGRESS_TIMEOUT_MS = 15_000;
const SNAPSHOT_PRESSURE_ERROR = 'Admin API query timed out';
const SNAPSHOT_OBSERVATION_ERROR = 'snapshot rows unavailable';
const CRITICAL_SPREAD_GAP = 2;
const READY_CRITICAL_SYSTEM_TOPOLOGY = Object.freeze({
  enabled: true,
  ready: true,
  totalSpreadGap: 0,
});
const OPEN_CRITICAL_SYSTEM_TOPOLOGY = Object.freeze({
  enabled: true,
  ready: false,
  totalSpreadGap: CRITICAL_SPREAD_GAP,
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
