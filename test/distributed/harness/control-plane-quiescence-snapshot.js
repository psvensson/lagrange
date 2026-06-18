import {
  RUNTIME_AUTHORITY_REPAIR_STATE,
} from '../../../src/control-plane/control-plane-readiness-constants.js';

const ZERO = 0;
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const PRESSURE_SIGNAL_KEY_SEPARATOR = '=';

const CONTROL_PLANE_QUIESCENCE_STATE = Object.freeze({
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  CONTROL_PLANE_PRESSURE: 'control_plane_pressure',
  OPERATION_DRAIN_PROGRESSING: 'operation_drain_progressing',
  OPERATION_DRAIN_STALLED: 'operation_drain_stalled',
  LEADERSHIP_CHURN: 'leadership_churn',
  CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE:
    'critical_spread_observation_unavailable',
  CRITICAL_SPREAD_OPEN: 'critical_spread_open',
  QUIESCENCE_CANDIDATE: 'quiescence_candidate',
  QUIESCENT: 'quiescent',
});

const CONTROL_PLANE_QUIESCENCE_REASON = Object.freeze({
  CONTROL_PLANE_PRESSURE: 'control_plane_pressure',
  OPERATION_DRAIN_STALLED: 'operation_drain_stalled',
  SNAPSHOT_QUERY_ERROR: 'snapshot_query_error',
  DISCOVERY_REPAIR_TIMEOUT: 'discovery_repair_timeout',
  NODE_STATE_PUBLICATION_PRESSURE: 'node_state_publication_pressure',
  REPLICA_OPERATIONS_IN_FLIGHT: 'replica_operations_in_flight',
  LEADERSHIP_UNSTABLE: 'leadership_unstable',
  CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE:
    'critical_system_snapshot_reachability_unavailable',
  CRITICAL_SYSTEM_SPREAD_OPEN: 'critical_system_spread_open',
});

const CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE =
  Object.freeze({
    AVAILABLE: 'available',
    SNAPSHOT_LANE_UNAVAILABLE: 'snapshot_lane_unavailable',
  });

const CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON = Object.freeze({
  NONE: 'none',
  OBSERVATION_UNAVAILABLE:
    CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_PRESSURE:
    CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
  OPERATION_DRAIN_PROGRESSING:
    CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
  OPERATION_DRAIN_STALLED:
    CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_STALLED,
  LEADERSHIP_CHURN:
    CONTROL_PLANE_QUIESCENCE_STATE.LEADERSHIP_CHURN,
  CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE:
    CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
  CRITICAL_SPREAD_OPEN:
    CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OPEN,
});

const CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON_SET =
  Object.freeze(new Set([
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.NONE,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
      .OBSERVATION_UNAVAILABLE,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
      .CONTROL_PLANE_PRESSURE,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
      .OPERATION_DRAIN_PROGRESSING,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
      .OPERATION_DRAIN_STALLED,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.LEADERSHIP_CHURN,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON
      .CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.CRITICAL_SPREAD_OPEN,
  ]));

const CONTROL_PLANE_QUIESCENCE_REASON_PREFIX = Object.freeze({
  [CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE]:
    'control_plane_pressure=',
  [CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED]:
    'operation_drain_stalled=',
  [CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR]:
    'snapshot_query_error=',
  [CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT]:
    'discovery_repair_timeout=',
  [CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE]:
    'node_state_publication_pressure=',
  [CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT]:
    'replica_operations_in_flight=',
  [CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE]:
    'leadership_unstable=',
  [CONTROL_PLANE_QUIESCENCE_REASON
    .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE]:
    'critical_system_snapshot_reachability_unavailable=',
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

const CONTROL_PLANE_QUIESCENCE_PRESSURE_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
  CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
]));

const SNAPSHOT_PRESSURE_ERROR_FRAGMENTS = Object.freeze([
  PRESSURE_ERROR_FRAGMENT.BACKPRESSURE,
  PRESSURE_ERROR_FRAGMENT.CLOSED,
  PRESSURE_ERROR_FRAGMENT.CONNECTION,
  PRESSURE_ERROR_FRAGMENT.PARTICIPANT_FAILURE,
  PRESSURE_ERROR_FRAGMENT.PRESSURE,
  PRESSURE_ERROR_FRAGMENT.TIMEOUT,
  PRESSURE_ERROR_FRAGMENT.TIMED_OUT,
]);

const DISCOVERY_REPAIR_TIMEOUT_ERROR_FRAGMENTS = Object.freeze([
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

function normalizeOptionalString(value) {
  return typeof value === TYPEOF_STRING && value.trim().length > ZERO ?
    value.trim() :
    null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const normalizedValues = [];
  const seenValues = new Set();
  for (const entry of value) {
    const normalizedEntry = normalizeOptionalString(entry);
    if (!normalizedEntry || seenValues.has(normalizedEntry)) {
      continue;
    }
    seenValues.add(normalizedEntry);
    normalizedValues.push(normalizedEntry);
  }
  return Object.freeze(normalizedValues);
}

function normalizeCandidateWindowResetReason(value) {
  const reason = normalizeOptionalString(value);
  return CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON_SET.has(
    reason,
  ) ?
    reason :
    CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.NONE;
}

function normalizeOptionalTimestampMs(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function normalizeCandidateWindowReset(value = null) {
  if (!value || typeof value !== TYPEOF_OBJECT || Array.isArray(value)) {
    return Object.freeze({
      reason: CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.NONE,
      state: null,
      canonicalBlocker: null,
      reasonCodes: Object.freeze([]),
      reasons: Object.freeze([]),
      observedAtMs: null,
    });
  }
  const state = normalizeOptionalString(value.state);
  return Object.freeze({
    reason: normalizeCandidateWindowResetReason(value.reason || state),
    state,
    canonicalBlocker: normalizeOptionalString(value.canonicalBlocker),
    reasonCodes: normalizeStringArray(value.reasonCodes),
    reasons: normalizeStringArray(value.reasons),
    observedAtMs: normalizeOptionalTimestampMs(value.observedAtMs),
  });
}

function buildControlPlaneQuiescenceCandidateWindowReset(
  quiescenceSnapshot,
  observedAtMs,
) {
  return normalizeCandidateWindowReset({
    reason: quiescenceSnapshot?.state,
    state: quiescenceSnapshot?.state,
    canonicalBlocker: quiescenceSnapshot?.canonicalBlocker,
    reasonCodes: quiescenceSnapshot?.reasonCodes,
    reasons: quiescenceSnapshot?.reasons,
    observedAtMs,
  });
}

function isPressureShapedError(value) {
  const normalizedValue = String(value || '').toLowerCase();
  return SNAPSHOT_PRESSURE_ERROR_FRAGMENTS.some((fragment) =>
    normalizedValue.includes(fragment),
  );
}

function isDiscoveryRepairTimeoutError(value) {
  const normalizedValue = String(value || '').toLowerCase();
  return DISCOVERY_REPAIR_TIMEOUT_ERROR_FRAGMENTS.some((fragment) =>
    normalizedValue.includes(fragment),
  );
}

function normalizePressureSignalReasonCode(value) {
  const reasonCode = normalizeOptionalString(value);
  return CONTROL_PLANE_QUIESCENCE_PRESSURE_REASON_SET.has(reasonCode) ?
    reasonCode :
    null;
}

function normalizeControlPlanePressureSignal(signal = null) {
  if (!signal || typeof signal !== TYPEOF_OBJECT || Array.isArray(signal)) {
    return null;
  }
  const reasonCode = normalizePressureSignalReasonCode(signal.reasonCode);
  const detail = normalizeOptionalString(signal.detail);
  return reasonCode && detail ?
    Object.freeze({reasonCode, detail}) :
    null;
}

function normalizeControlPlanePressureSignals(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const pressureSignals = [];
  const seenSignals = new Set();
  for (const entry of value) {
    const pressureSignal = normalizeControlPlanePressureSignal(entry);
    if (!pressureSignal) {
      continue;
    }
    const signalKey =
      pressureSignal.reasonCode + PRESSURE_SIGNAL_KEY_SEPARATOR +
        pressureSignal.detail;
    if (seenSignals.has(signalKey)) {
      continue;
    }
    seenSignals.add(signalKey);
    pressureSignals.push(pressureSignal);
  }
  return Object.freeze(pressureSignals);
}

function appendControlPlanePressureSignal(signals, reasonCode, detail) {
  const normalizedSignal = normalizeControlPlanePressureSignal({
    reasonCode,
    detail,
  });
  if (normalizedSignal) {
    signals.push(normalizedSignal);
  }
}

function appendDiscoveryRepairPressureSignals(signals, readinessByNodeId) {
  if (!readinessByNodeId ||
      typeof readinessByNodeId !== TYPEOF_OBJECT ||
      Array.isArray(readinessByNodeId)) {
    return;
  }
  for (const readiness of Object.values(readinessByNodeId)) {
    const repair =
      readiness?.runtimeAuthority &&
      typeof readiness.runtimeAuthority === TYPEOF_OBJECT ?
        readiness.runtimeAuthority.repair :
        null;
    const repairError = normalizeOptionalString(repair?.error);
    if (
      repair?.state === RUNTIME_AUTHORITY_REPAIR_STATE.FAILED &&
      isDiscoveryRepairTimeoutError(repairError)
    ) {
      appendControlPlanePressureSignal(
        signals,
        CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
        repairError,
      );
    }
  }
}

function appendNodeStatePublicationPressureSignal(
  signals,
  heartbeatPublication,
) {
  if (!heartbeatPublication ||
      typeof heartbeatPublication !== TYPEOF_OBJECT ||
      Array.isArray(heartbeatPublication)) {
    return;
  }
  const consecutiveFailures = normalizeNonNegativeInteger(
    heartbeatPublication.consecutiveFailures,
  );
  const failureReason = normalizeOptionalString(
    heartbeatPublication.lastFailureReason,
  );
  if (consecutiveFailures > ZERO && isPressureShapedError(failureReason)) {
    appendControlPlanePressureSignal(
      signals,
      CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
      failureReason,
    );
  }
}

function buildControlPlaneQuiescencePressureSignalsFromDiagnostics(
  controlPlaneDiagnostics = null,
) {
  if (!controlPlaneDiagnostics ||
      typeof controlPlaneDiagnostics !== TYPEOF_OBJECT ||
      Array.isArray(controlPlaneDiagnostics)) {
    return Object.freeze([]);
  }
  const pressureSignals = [];
  appendDiscoveryRepairPressureSignals(
    pressureSignals,
    controlPlaneDiagnostics.readinessByNodeId,
  );
  appendNodeStatePublicationPressureSignal(
    pressureSignals,
    controlPlaneDiagnostics.heartbeatPublication,
  );
  return normalizeControlPlanePressureSignals(pressureSignals);
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

function isCriticalSystemSnapshotLaneUnavailable(criticalSystemTopology) {
  if (
    criticalSystemTopology?.observationState ===
    CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
      .SNAPSHOT_LANE_UNAVAILABLE
  ) {
    return true;
  }
  const tables = Array.isArray(criticalSystemTopology?.tables) ?
    criticalSystemTopology.tables :
    [];
  return tables.some((table) =>
    table?.observationState ===
      CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
        .SNAPSHOT_LANE_UNAVAILABLE,
  );
}

function countCriticalSystemSnapshotLaneUnavailableTables(
  criticalSystemTopology,
) {
  if (Number.isInteger(
    criticalSystemTopology?.snapshotLaneUnavailableTableCount,
  )) {
    return normalizeNonNegativeInteger(
      criticalSystemTopology.snapshotLaneUnavailableTableCount,
    );
  }
  const tables = Array.isArray(criticalSystemTopology?.tables) ?
    criticalSystemTopology.tables :
    [];
  return tables.filter((table) =>
    table?.observationState ===
      CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
        .SNAPSHOT_LANE_UNAVAILABLE,
  ).length;
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
  const staleInFlightCount = normalizeNonNegativeInteger(
    snapshotProbe.staleInFlightCount,
  );
  const cacheVisibleSatisfiedPriorityRecoveryOperationCount =
    normalizeNonNegativeInteger(
      snapshotProbe.cacheVisibleSatisfiedPriorityRecoveryOperationCount,
    );
  const rawAdditionalInFlightDiscountCount =
    Number.isInteger(snapshotProbe.additionalInFlightDiscountCount) &&
    snapshotProbe.additionalInFlightDiscountCount >= ZERO ?
      snapshotProbe.additionalInFlightDiscountCount :
      cacheVisibleSatisfiedPriorityRecoveryOperationCount;
  const additionalInFlightDiscountCount =
    normalizeNonNegativeInteger(rawAdditionalInFlightDiscountCount);
  const appliedAdditionalInFlightDiscountCount =
    criticalSystemTopology.ready === true ?
      additionalInFlightDiscountCount :
      ZERO;
  const staleInFlightDiscountCount = Math.min(
    inFlightCount,
    staleInFlightCount + appliedAdditionalInFlightDiscountCount,
  );
  const ignoreStaleInFlightReplicaOperations =
    options.ignoreStaleInFlightReplicaOperations === true;
  const effectiveInFlightCount = ignoreStaleInFlightReplicaOperations ?
    Math.max(ZERO, inFlightCount - staleInFlightDiscountCount) :
    inFlightCount;
  const leaderCount = normalizeNonNegativeInteger(snapshotProbe.leaderCount);
  const stableElapsedMs = resolveStableElapsedMs(
    nowMs,
    stableWindowStartedAtMs,
  );
  const reasonCodes = [];
  const reasons = [];
  const controlPlanePressureSignals =
    normalizeControlPlanePressureSignals(
      snapshotProbe.controlPlanePressureSignals,
    );
  const candidateWindowReset = normalizeCandidateWindowReset(
    options.candidateWindowReset,
  );

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
      candidateWindowReset,
    });
  }

  if (controlPlanePressureSignals.length > ZERO) {
    for (const pressureSignal of controlPlanePressureSignals) {
      reasonCodes.push(pressureSignal.reasonCode);
      reasons.push(buildReason(
        pressureSignal.reasonCode,
        pressureSignal.detail,
      ));
    }
    return Object.freeze({
      state: CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
      canonicalBlocker: reasonCodes[ZERO],
      reasonCodes: Object.freeze([...reasonCodes]),
      reasons: Object.freeze([...reasons]),
      ready: false,
      stableElapsedMs: ZERO,
      leaderQuietElapsedMs,
      criticalSystemTopology,
      effectiveInFlightCount,
      staleInFlightCount,
      cacheVisibleSatisfiedPriorityRecoveryOperationCount,
      additionalInFlightDiscountCount,
      appliedAdditionalInFlightDiscountCount,
      staleInFlightDiscountCount,
      ignoreStaleInFlightReplicaOperations,
      controlPlanePressureSignals,
      candidateWindowReset,
    });
  }

  if (effectiveInFlightCount > maxInFlightCount) {
    reasonCodes.push(
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
    );
    reasons.push(buildReason(
      CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
      effectiveInFlightCount,
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
    if (isCriticalSystemSnapshotLaneUnavailable(criticalSystemTopology)) {
      reasonCodes.push(
        CONTROL_PLANE_QUIESCENCE_REASON
          .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
      );
      reasons.push(buildReason(
        CONTROL_PLANE_QUIESCENCE_REASON
          .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
        countCriticalSystemSnapshotLaneUnavailableTables(criticalSystemTopology),
      ));
    } else {
      reasonCodes.push(
        CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
      );
      reasons.push(buildReason(
        CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
        normalizeNonNegativeInteger(criticalSystemTopology.totalSpreadGap),
      ));
    }
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
    CONTROL_PLANE_QUIESCENCE_REASON
      .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
  )) {
    state =
      CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE;
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
    effectiveInFlightCount,
    staleInFlightCount,
    cacheVisibleSatisfiedPriorityRecoveryOperationCount,
    additionalInFlightDiscountCount,
    appliedAdditionalInFlightDiscountCount,
    staleInFlightDiscountCount,
    ignoreStaleInFlightReplicaOperations,
    controlPlanePressureSignals,
    candidateWindowReset,
  });
}

export {
  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
  CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescenceCandidateWindowReset,
  buildControlPlaneQuiescenceSnapshot,
  buildControlPlaneQuiescencePressureSignalsFromDiagnostics,
};
