const ZERO = 0;

const CONTROL_PLANE_QUIESCENCE_STATE = Object.freeze({
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  CONTROL_PLANE_PRESSURE: 'control_plane_pressure',
  OPERATION_DRAIN_PROGRESSING: 'operation_drain_progressing',
  OPERATION_DRAIN_STALLED: 'operation_drain_stalled',
  LEADERSHIP_CHURN: 'leadership_churn',
  CRITICAL_SPREAD_OPEN: 'critical_spread_open',
  QUIESCENCE_CANDIDATE: 'quiescence_candidate',
  QUIESCENT: 'quiescent',
});

const CONTROL_PLANE_QUIESCENCE_REASON = Object.freeze({
  CONTROL_PLANE_PRESSURE: 'control_plane_pressure',
  OPERATION_DRAIN_STALLED: 'operation_drain_stalled',
  SNAPSHOT_QUERY_ERROR: 'snapshot_query_error',
  REPLICA_OPERATIONS_IN_FLIGHT: 'replica_operations_in_flight',
  LEADERSHIP_UNSTABLE: 'leadership_unstable',
  CRITICAL_SYSTEM_SPREAD_OPEN: 'critical_system_spread_open',
});

const CONTROL_PLANE_QUIESCENCE_REASON_PREFIX = Object.freeze({
  [CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE]:
    'control_plane_pressure=',
  [CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED]:
    'operation_drain_stalled=',
  [CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR]:
    'snapshot_query_error=',
  [CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT]:
    'replica_operations_in_flight=',
  [CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE]:
    'leadership_unstable=',
  [CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN]:
    'critical_system_spread_gap=',
});

const PRESSURE_ERROR_FRAGMENT = Object.freeze({
  BACKPRESSURE: 'backpressure',
  CLOSED: 'closed',
  CONNECTION: 'connection',
  PARTICIPANT_FAILURE: 'participant failure',
  PRESSURE: 'pressure',
  TIMEOUT: 'timeout',
  TIMED_OUT: 'timed out',
});

const SNAPSHOT_PRESSURE_ERROR_FRAGMENTS = Object.freeze([
  PRESSURE_ERROR_FRAGMENT.BACKPRESSURE,
  PRESSURE_ERROR_FRAGMENT.CLOSED,
  PRESSURE_ERROR_FRAGMENT.CONNECTION,
  PRESSURE_ERROR_FRAGMENT.PARTICIPANT_FAILURE,
  PRESSURE_ERROR_FRAGMENT.PRESSURE,
  PRESSURE_ERROR_FRAGMENT.TIMEOUT,
  PRESSURE_ERROR_FRAGMENT.TIMED_OUT,
]);

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= ZERO ? value : ZERO;
}

function normalizeOptionalStartedAtMs(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function buildReason(reasonCode, value) {
  return (
    CONTROL_PLANE_QUIESCENCE_REASON_PREFIX[reasonCode] + String(value)
  );
}

function isPressureShapedError(value) {
  const normalizedValue = String(value || '').toLowerCase();
  return SNAPSHOT_PRESSURE_ERROR_FRAGMENTS.some((fragment) =>
    normalizedValue.includes(fragment),
  );
}

function isOperationDrainStalled(options = {}) {
  const noProgressElapsedMs = normalizeNonNegativeInteger(
    options.operationNoProgressElapsedMs,
  );
  const noProgressTimeoutMs = normalizeNonNegativeInteger(
    options.operationNoProgressTimeoutMs,
  );
  return noProgressTimeoutMs > ZERO && noProgressElapsedMs >= noProgressTimeoutMs;
}

function resolveStableElapsedMs(nowMs, stableWindowStartedAtMs) {
  if (stableWindowStartedAtMs === null) {
    return ZERO;
  }
  return Math.max(ZERO, nowMs - stableWindowStartedAtMs);
}

function buildControlPlaneQuiescenceSnapshot(options = {}) {
  const snapshotProbe = options.snapshotProbe || {};
  const criticalSystemTopology = options.criticalSystemTopology || {
    enabled: false,
    ready: true,
    totalSpreadGap: ZERO,
  };
  const nowMs = Number.isFinite(options.nowMs) ?
    Math.floor(options.nowMs) :
    Date.now();
  const stableWindowStartedAtMs = normalizeOptionalStartedAtMs(
    options.stableWindowStartedAtMs,
  );
  const stableWindowMs = normalizeNonNegativeInteger(options.stableWindowMs);
  const maxInFlightCount = normalizeNonNegativeInteger(
    options.maxInFlightCount,
  );
  const leaderQuietElapsedMs = normalizeNonNegativeInteger(
    options.leaderQuietElapsedMs,
  );
  const inFlightCount = Number.isInteger(snapshotProbe.inFlightCount) ?
    snapshotProbe.inFlightCount :
    ZERO;
  const leaderCount = normalizeNonNegativeInteger(snapshotProbe.leaderCount);
  const stableElapsedMs = resolveStableElapsedMs(
    nowMs,
    stableWindowStartedAtMs,
  );
  const reasonCodes = [];
  const reasons = [];

  if (snapshotProbe.error) {
    const pressureShapedError = isPressureShapedError(snapshotProbe.error);
    if (pressureShapedError) {
      reasonCodes.push(
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
      );
      reasons.push(buildReason(
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
        snapshotProbe.error,
      ));
    }
    reasonCodes.push(
      CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
    );
    reasons.push(buildReason(
      CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
      snapshotProbe.error,
    ));
    return Object.freeze({
      state: pressureShapedError ?
        CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE :
        CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
      canonicalBlocker: pressureShapedError ?
        CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE :
        CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
      reasonCodes: Object.freeze([...reasonCodes]),
      reasons: Object.freeze([...reasons]),
      ready: false,
      stableElapsedMs: ZERO,
      leaderQuietElapsedMs: ZERO,
      criticalSystemTopology,
    });
  }

  if (inFlightCount > maxInFlightCount) {
    reasonCodes.push(
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
    );
    reasons.push(buildReason(
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
      inFlightCount,
    ));
  }

  const leadershipStable =
    leaderCount > ZERO && leaderQuietElapsedMs >= stableWindowMs;
  if (!leadershipStable) {
    reasonCodes.push(CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE);
    reasons.push(buildReason(
      CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE,
      leaderQuietElapsedMs,
    ));
  }

  if (
    criticalSystemTopology.enabled === true &&
    criticalSystemTopology.ready !== true
  ) {
    reasonCodes.push(
      CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
    );
    reasons.push(buildReason(
      CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
      normalizeNonNegativeInteger(criticalSystemTopology.totalSpreadGap),
    ));
  }

  const ready = reasons.length === ZERO;
  let state = CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE;
  if (reasonCodes.includes(
    CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
  )) {
    if (isOperationDrainStalled(options)) {
      reasonCodes.unshift(
        CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED,
      );
      reasons.unshift(buildReason(
        CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED,
        options.operationNoProgressElapsedMs,
      ));
      state = CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_STALLED;
    } else {
      state = CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING;
    }
  } else if (reasonCodes.includes(
    CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE,
  )) {
    state = CONTROL_PLANE_QUIESCENCE_STATE.LEADERSHIP_CHURN;
  } else if (reasonCodes.includes(
    CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
  )) {
    state = CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OPEN;
  } else if (ready && stableElapsedMs >= stableWindowMs) {
    state = CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT;
  }

  return Object.freeze({
    state,
    canonicalBlocker: reasonCodes[ZERO] || null,
    reasonCodes: Object.freeze([...reasonCodes]),
    reasons: Object.freeze([...reasons]),
    ready,
    stableElapsedMs,
    leaderQuietElapsedMs,
    criticalSystemTopology,
  });
}

export {
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescenceSnapshot,
};
