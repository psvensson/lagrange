import {
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
} from '../../src/diagnostics/control-plane-quiescence-snapshot.js';

const ZERO = 0;
const SCHEMA_STABILITY_WINDOW_PHASE = Object.freeze({
  INACTIVE: 'inactive',
  OBSERVING: 'observing',
});
const INACTIVE_SCHEMA_STABILITY_WINDOW = Object.freeze({
  phase: SCHEMA_STABILITY_WINDOW_PHASE.INACTIVE,
  startedAtMs: ZERO,
});

// Observer-side failure states: the poll could not SEE the control plane
// (admin query timeout, snapshot lane hiccup). These are evidence about the
// observer, not the system - monotone-progress rule (the HDFS safe-mode /
// ES delayed-allocation lesson): they HOLD an accumulated stability window
// instead of resetting it, bounded below by observation-blindness tolerance.
const SCHEMA_STABILITY_OBSERVATION_FAILURE_STATES = new Set([
  CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
]);

function isSchemaStabilityObservationFailure(snapshot) {
  if (SCHEMA_STABILITY_OBSERVATION_FAILURE_STATES.has(snapshot.state)) {
    return true;
  }
  // CONTROL_PLANE_PRESSURE is observer-side only when it came from a
  // pressure-shaped snapshot QUERY error, not from system pressure signals.
  return (
    snapshot.state === CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE &&
    Array.isArray(snapshot.reasonCodes) &&
    snapshot.reasonCodes.includes(
      CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
    )
  );
}

function isOperationOnlySchemaBlocker(snapshot) {
  return (
    snapshot.state ===
      CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING &&
    snapshot.criticalSystemTopology?.ready === true &&
    Array.isArray(snapshot.reasonCodes) &&
    snapshot.reasonCodes.length === 1 &&
    snapshot.reasonCodes[ZERO] ===
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT
  );
}

function buildInactiveSchemaStabilityWindow(snapshot, nowMs) {
  if (!isOperationOnlySchemaBlocker(snapshot)) {
    return INACTIVE_SCHEMA_STABILITY_WINDOW;
  }
  return Object.freeze({
    ...INACTIVE_SCHEMA_STABILITY_WINDOW,
    operationDrainAnchorEligible: true,
    lastBlockedObservedAtMs: nowMs,
  });
}

function resolveSchemaStabilityStartedAt(snapshot, stabilityWindow, nowMs) {
  const latestTopologyDrainAtMs = snapshot.latestTopologyDrainAtMs;
  if (
    stabilityWindow.operationDrainAnchorEligible === true &&
    Number.isFinite(stabilityWindow.lastBlockedObservedAtMs) &&
    Number.isFinite(latestTopologyDrainAtMs) &&
    latestTopologyDrainAtMs >= stabilityWindow.lastBlockedObservedAtMs &&
    latestTopologyDrainAtMs <= nowMs
  ) {
    return latestTopologyDrainAtMs;
  }
  return nowMs;
}

function advanceSchemaStabilityWindow(
  snapshot,
  stabilityWindow,
  nowMs,
  stableWindowMs,
) {
  if (
    snapshot.state === CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT &&
    snapshot.ready === true
  ) {
    if (stabilityWindow.phase === SCHEMA_STABILITY_WINDOW_PHASE.OBSERVING) {
      return Object.freeze({
        ...stabilityWindow,
        lastQuiescentObservationAtMs: nowMs,
      });
    }
    return Object.freeze({
      phase: SCHEMA_STABILITY_WINDOW_PHASE.OBSERVING,
      startedAtMs: resolveSchemaStabilityStartedAt(
        snapshot,
        stabilityWindow,
        nowMs,
      ),
      lastQuiescentObservationAtMs: nowMs,
    });
  }
  // Hold through observer hiccups while the accumulated window is still
  // backed by a recent real quiescent observation; a blind stretch longer
  // than the stable window itself can no longer support a stability claim.
  if (
    stabilityWindow.phase === SCHEMA_STABILITY_WINDOW_PHASE.OBSERVING &&
    isSchemaStabilityObservationFailure(snapshot) &&
    nowMs - (stabilityWindow.lastQuiescentObservationAtMs ?? ZERO) <=
      stableWindowMs
  ) {
    return stabilityWindow;
  }
  return buildInactiveSchemaStabilityWindow(snapshot, nowMs);
}

function projectSchemaStabilityWindow(
  snapshot,
  stabilityWindow,
  nowMs,
  stableWindowMs,
) {
  if (stabilityWindow.phase !== SCHEMA_STABILITY_WINDOW_PHASE.OBSERVING) {
    return snapshot;
  }
  // A held window (observer hiccup) must not project QUIESCENT: stability
  // may only be CONFIRMED by a poll that actually observed the control
  // plane. The hold preserves accumulated elapsed time; confirmation waits
  // for the next real observation.
  if (
    snapshot.state !== CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT ||
    snapshot.ready !== true
  ) {
    return Object.freeze({
      ...snapshot,
      stableElapsedMs: Math.max(ZERO, nowMs - stabilityWindow.startedAtMs),
      stabilityWindowHeld: true,
    });
  }
  const stableElapsedMs = Math.max(
    ZERO,
    nowMs - stabilityWindow.startedAtMs,
  );
  return Object.freeze({
    ...snapshot,
    state: stableElapsedMs >= stableWindowMs ?
      CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT :
      CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
    stableElapsedMs,
    leaderQuietElapsedMs: stableElapsedMs,
  });
}

function buildSchemaStabilityObservation(
  observedSnapshot,
  stabilityWindow,
  stableConfirmationCount,
  stableWindowMs,
  nowMs,
) {
  const nextStabilityWindow = advanceSchemaStabilityWindow(
    observedSnapshot,
    stabilityWindow,
    nowMs,
    stableWindowMs,
  );
  const snapshot = projectSchemaStabilityWindow(
    observedSnapshot,
    nextStabilityWindow,
    nowMs,
    stableWindowMs,
  );
  // Held polls (observer hiccup with the window preserved) neither confirm
  // nor forfeit accumulated confirmations.
  const held = snapshot.stabilityWindowHeld === true;
  return Object.freeze({
    snapshot,
    stabilityWindow: nextStabilityWindow,
    stableConfirmationCount:
      snapshot.state === CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT ?
        stableConfirmationCount + 1 :
        (held ? stableConfirmationCount : ZERO),
  });
}

export {
  INACTIVE_SCHEMA_STABILITY_WINDOW,
  buildSchemaStabilityObservation,
};
