import {CLUSTER_SEGMENT_7_CLASS_SHARED} from './cluster-segment-7-class-shared.js';
import {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from '../../../src/admin/admin-constants.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../../src/control-plane/control-plane-snapshot-owner.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../src/control-plane/owner-contract-outcome.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  buildPublicationActiveGateHandoffContract,
} from '../../../src/control-plane/publication-active-gate-handoff-contract.js';

const {
  ADMIN_SOCKET_LANE_SNAPSHOT,
  CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  ONE,
  ZERO,
  isTimeoutShapedProbeError,
  normalizeDistinctStringArray,
  normalizeProbeError,
  parseFiniteNumberField,
} = CLUSTER_SEGMENT_7_CLASS_SHARED;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_FUNCTION = 'function';
const CONTROL_SNAPSHOT_OBSERVATION_MODE_FIELD = 'observationMode';
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD = 'adminObservation';
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_FIELD = 'repair';
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_DEFERRED_FIELD = 'deferred';
const CONTROL_SNAPSHOT_OBSERVATION_FIELD = 'snapshotObservation';
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD = 'state';
const CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD = 'contractState';
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_STATE_FIELD = 'refreshState';
const CONTROL_SNAPSHOT_OBSERVATION_NEXT_ACTION_FIELD = 'nextAction';
const CONTROL_SNAPSHOT_OBSERVATION_REASON_CODES_FIELD = 'reasonCodes';
const CONTROL_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS_FIELD = 'retryAfterMs';
const CONTROL_SNAPSHOT_REACHABILITY_SOURCE = 'control_snapshot';
const CONTROL_SNAPSHOT_MISSING_ROWS_ERROR = 'control snapshot missing rows';
const CONTROL_SNAPSHOT_NO_CANDIDATES_ERROR = 'no_control_snapshot_candidates';
const CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILED_TEXT =
  'authoritative control snapshot repair failed';
const CONTROL_SNAPSHOT_CONNECTION_TO_NODE_TEXT = 'connection to node';
const CONTROL_SNAPSHOT_CONNECTION_CLOSED_TEXT = 'closed';
const CONTROL_SNAPSHOT_WEBSOCKET_TEXT = 'websocket';
const CONTROL_SNAPSHOT_CONNECTION_NOT_ESTABLISHED_TEXT =
  'closed before the connection was established';
const CONTROL_SNAPSHOT_ADMIN_QUERY_CLOSED_BEFORE_RESPONSE_TEXT =
  'admin api query connection closed before response';
const CONTROL_SNAPSHOT_LANE_SNAPSHOT_TEXT =
  `on lane ${ADMIN_SOCKET_LANE_SNAPSHOT}`;
const CONTROL_SNAPSHOT_RETRY_REASON_SELECTED_TIMEOUT = 'selected_timeout';
const CONTROL_SNAPSHOT_RETRY_REASON_AUTHORITATIVE_REPAIR_PRESSURE =
  'authoritative_repair_pressure';
const CONTROL_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED =
  'selected_transport_closed';
const CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE = 'not_applicable';
const CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_RECOVERY_REASON_CODES =
  Object.freeze([
    CONTROL_SNAPSHOT_RETRY_REASON_SELECTED_TIMEOUT,
    CONTROL_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED,
  ]);
const CONTROL_SNAPSHOT_REVISION_STATE_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_GATE_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_UNAVAILABLE =
  null;
const CONTROL_SNAPSHOT_PRIORITY_RECOVERY_DECISION_SNAPSHOTS_UNAVAILABLE =
  null;
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION =
  ONE;
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  Object.freeze({
    ENQUEUED: 'enqueued',
    REASON_CODE: 'reasonCode',
    RETRY_AFTER_MS: 'retryAfterMs',
    STATE: 'state',
  });
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE =
  Object.freeze({
    WRITE_DEFERRED: 'write_deferred',
  });
const CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD = 'pendingWrites';
const CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD =
  'pendingWriteGrowthCount';
const CONTROL_SNAPSHOT_OWNER_QUEUE_RETAINED_BACKLOG_GROWTH_COUNT_FIELD =
  'retainedBacklogGrowthCount';
const CONTROL_SNAPSHOT_OWNER_QUEUE_SHARED_PRESSURE_BACKPRESSURED_FIELD =
  'sharedPressureBackpressured';
const CONTROL_SNAPSHOT_OWNER_QUEUE_TRANSPORT_PRESSURE_BACKPRESSURED_FIELD =
  'transportPressureBackpressured';
const CONTROL_SNAPSHOT_OWNER_QUEUE_QUERY_PRESSURE_BACKPRESSURED_FIELD =
  'queryPressureBackpressured';
const CRITICAL_SYSTEM_READY_NODE_IDS_UNAVAILABLE = Object.freeze([]);
const SERVICE_DISCOVERY_NO_CANDIDATES_ERROR = 'no_service_discovery_candidates';
const ACTIVE_WAIT_TIMEOUT_EVENT_INTERVAL_DIVISOR = 2;
const CONTROL_SNAPSHOT_STARTUP_PROBE_TIMEOUT_SCALE = 2;
const CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE = ONE;
const CONTROL_SNAPSHOT_SELECTED_RETRY_TIMEOUT_DIVISOR = 2;
const TYPEOF_BOOLEAN = 'boolean';
const SELECTED_SNAPSHOT_TRANSPORT_CLOSED_RULES = Object.freeze([
  Object.freeze({
    matches: (normalizedError) =>
      normalizedError.includes(CONTROL_SNAPSHOT_WEBSOCKET_TEXT) &&
      normalizedError.includes(
        CONTROL_SNAPSHOT_CONNECTION_NOT_ESTABLISHED_TEXT,
      ),
  }),
  Object.freeze({
    matches: (normalizedError) =>
      normalizedError.includes(
        CONTROL_SNAPSHOT_ADMIN_QUERY_CLOSED_BEFORE_RESPONSE_TEXT,
      ) &&
      normalizedError.includes(CONTROL_SNAPSHOT_LANE_SNAPSHOT_TEXT),
  }),
]);
const WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_OUTCOME_KEEP = Object.freeze({
  project: false,
});
const WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_OUTCOME_DEFER = Object.freeze({
  project: true,
});
const WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_OUTCOME_DEFER,
    matches: (evidence) =>
      evidence.waitOwnerRecovery === true &&
      evidence.ownerReconcilePending === true &&
      evidence.pendingRecoveryCount > ZERO &&
      evidence.retryAfterMs !== null &&
      evidence.outcomeWritable === true &&
      evidence.outcomeEnqueued !== true &&
      evidence.outcomeBounded !== true,
  }),
]);

function normalizeControlSnapshotObservationString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO ? value : null;
}

function buildControlSnapshotObservationSummary(snapshotPayload = null) {
  const snapshotObservation =
    snapshotPayload?.[CONTROL_SNAPSHOT_OBSERVATION_FIELD] &&
    typeof snapshotPayload[CONTROL_SNAPSHOT_OBSERVATION_FIELD] ===
      TYPEOF_OBJECT ?
      snapshotPayload[CONTROL_SNAPSHOT_OBSERVATION_FIELD] :
      null;
  const adminObservation =
    snapshotPayload?.[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD] &&
    typeof snapshotPayload[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD] ===
      TYPEOF_OBJECT ?
      snapshotPayload[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_FIELD] :
      null;
  const adminRepair =
    adminObservation?.[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_FIELD] &&
    typeof adminObservation[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_FIELD] ===
      TYPEOF_OBJECT ?
      adminObservation[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_FIELD] :
      null;
  return {
    snapshotObservationMode: normalizeControlSnapshotObservationString(
      snapshotPayload?.[CONTROL_SNAPSHOT_OBSERVATION_MODE_FIELD],
    ),
    snapshotObservationState: normalizeControlSnapshotObservationString(
      snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_STATE_FIELD],
    ),
    snapshotObservationContractState:
      normalizeControlSnapshotObservationString(
        snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_CONTRACT_STATE_FIELD],
      ),
    snapshotObservationRefreshState:
      normalizeControlSnapshotObservationString(
        snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_REFRESH_STATE_FIELD],
      ),
    snapshotObservationNextAction: normalizeControlSnapshotObservationString(
      snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_NEXT_ACTION_FIELD],
    ),
    snapshotObservationReasonCodes: normalizeDistinctStringArray(
      snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_REASON_CODES_FIELD],
    ),
    snapshotObservationRetryAfterMs: parseFiniteNumberField(
      snapshotObservation?.[CONTROL_SNAPSHOT_OBSERVATION_RETRY_AFTER_MS_FIELD],
    ),
    snapshotRepairDeferred:
      adminRepair?.[CONTROL_SNAPSHOT_ADMIN_OBSERVATION_REPAIR_DEFERRED_FIELD] ===
        true,
  };
}

function buildControlSnapshotRetryObservationSummary({
  retryAfterMs,
  retryReason,
}) {
  if (retryReason === CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE) {
    return buildControlSnapshotObservationSummary();
  }
  const normalizedRetryAfterMs = Number.isFinite(retryAfterMs) ?
    Math.max(MIN_TIMEOUT_MS, Math.floor(retryAfterMs)) :
    MIN_TIMEOUT_MS;
  return {
    snapshotObservationMode:
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    snapshotObservationState:
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
    snapshotObservationContractState: OWNER_CONTRACT_STATE.DEFERRED,
    snapshotObservationRefreshState:
      CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
    snapshotObservationNextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    snapshotObservationReasonCodes: normalizeDistinctStringArray([
      retryReason,
    ]),
    snapshotObservationRetryAfterMs: normalizedRetryAfterMs,
    snapshotRepairDeferred: true,
  };
}

function controlSnapshotReasonAllowsActiveGateHandoff(reasonCodes) {
  return normalizeDistinctStringArray(reasonCodes).some((reasonCode) =>
    CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_RECOVERY_REASON_CODES.includes(
      reasonCode,
    ),
  );
}

function buildTerminalControlSnapshotActiveGateHandoff({
  expectedNodeIds = [],
  nodeId = null,
  terminalObservationSummary = null,
  selectedAdminReady = false,
} = {}) {
  const normalizedNodeId =
    typeof nodeId === TYPEOF_STRING && nodeId.length > ZERO ? nodeId : null;
  const reasonCodes = normalizeDistinctStringArray(
    terminalObservationSummary?.snapshotObservationReasonCodes,
  );
  if (
    !normalizedNodeId ||
    selectedAdminReady !== true ||
    controlSnapshotReasonAllowsActiveGateHandoff(reasonCodes) !== true
  ) {
    return CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_UNAVAILABLE;
  }
  const normalizedExpectedNodeIds = normalizeDistinctStringArray([
    ...expectedNodeIds,
    normalizedNodeId,
  ]);
  return buildPublicationActiveGateHandoffContract({
    expectedNodeIds: normalizedExpectedNodeIds,
    publishedActiveNodeIds: normalizedExpectedNodeIds,
    pendingRecoveryNodeIds: [normalizedNodeId],
    readinessByNodeId: {
      [normalizedNodeId]: {
        reasonCodes,
      },
    },
  });
}

function buildTerminalControlSnapshotRecoveryProgress({
  activeGateHandoff = null,
  expectedNodeIds = [],
} = {}) {
  const pendingRecoveryNodeIds = normalizeDistinctStringArray(
    activeGateHandoff?.pendingRecoveryNodeIds,
  );
  const expectedNodeCount = normalizeDistinctStringArray(expectedNodeIds).length;
  const observedNodeCount = pendingRecoveryNodeIds.length;
  return {
    observedNodeCount,
    missingExpectedNodeCount: Math.max(
      ZERO,
      expectedNodeCount - observedNodeCount,
    ),
    observedNodeIds: pendingRecoveryNodeIds,
  };
}

function normalizeControlSnapshotBoundedRetryAfterMs(value) {
  const parsedValue = parseFiniteNumberField(value);
  return Number.isFinite(parsedValue) && parsedValue > ZERO ?
    Math.max(MIN_TIMEOUT_MS, Math.floor(parsedValue)) :
    null;
}

function normalizeControlSnapshotHandoffDebtCount(value, nodeIds = []) {
  const parsedValue = parseFiniteNumberField(value);
  return Number.isFinite(parsedValue) ?
    Math.max(ZERO, Math.floor(parsedValue)) :
    nodeIds.length;
}

function normalizeWaitOwnerRecoveryQueueProjectionEvidence({
  activeGateHandoff = null,
  membershipPublicationHandoffOutcome = null,
  snapshotObservationSummary = null,
} = {}) {
  const handoffRecord =
    activeGateHandoff &&
      typeof activeGateHandoff === TYPEOF_OBJECT &&
      Array.isArray(activeGateHandoff) !== true ?
      activeGateHandoff :
      null;
  const handoffOutcome =
    membershipPublicationHandoffOutcome &&
      typeof membershipPublicationHandoffOutcome === TYPEOF_OBJECT &&
      Array.isArray(membershipPublicationHandoffOutcome) !== true ?
      membershipPublicationHandoffOutcome :
      null;
  const pendingRecoveryNodeIds = normalizeDistinctStringArray(
    handoffRecord?.pendingRecoveryNodeIds,
  );
  const pendingRecoveryCount = Math.max(
    pendingRecoveryNodeIds.length,
    normalizeControlSnapshotHandoffDebtCount(
      handoffRecord?.pendingRecoveryCount,
      pendingRecoveryNodeIds,
    ),
  );
  const outcomeState =
    handoffOutcome?.[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE
    ] || null;
  const outcomeRetryAfterMs = normalizeControlSnapshotBoundedRetryAfterMs(
    handoffOutcome?.[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
        .RETRY_AFTER_MS
    ],
  );
  return Object.freeze({
    waitOwnerRecovery:
      handoffRecord?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    ownerReconcilePending:
      handoffRecord?.reasonCode ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    pendingRecoveryCount,
    retryAfterMs: normalizeControlSnapshotBoundedRetryAfterMs(
      snapshotObservationSummary?.snapshotObservationRetryAfterMs,
    ),
    outcomeWritable:
      outcomeState === null ||
      outcomeState ===
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
          .WRITE_DEFERRED,
    outcomeEnqueued:
      handoffOutcome?.[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED
      ] === true,
    outcomeBounded: outcomeRetryAfterMs !== null,
  });
}

function decideWaitOwnerRecoveryQueueProjection(evidence) {
  const decision = WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || WAIT_OWNER_RECOVERY_QUEUE_PROJECTION_OUTCOME_KEEP;
}

function buildControlSnapshotOwnerRecoveryQueueDepth({
  controlPlaneOwnerQueueDepth = null,
  pendingRecoveryCount = ZERO,
} = {}) {
  if (
    controlPlaneOwnerQueueDepth &&
    typeof controlPlaneOwnerQueueDepth === TYPEOF_OBJECT &&
    Array.isArray(controlPlaneOwnerQueueDepth) !== true
  ) {
    return controlPlaneOwnerQueueDepth;
  }
  return Object.freeze({
    [CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD]:
      Math.max(ONE, pendingRecoveryCount),
    [CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD]: ZERO,
    [CONTROL_SNAPSHOT_OWNER_QUEUE_RETAINED_BACKLOG_GROWTH_COUNT_FIELD]: ZERO,
    [CONTROL_SNAPSHOT_OWNER_QUEUE_SHARED_PRESSURE_BACKPRESSURED_FIELD]: false,
    [CONTROL_SNAPSHOT_OWNER_QUEUE_TRANSPORT_PRESSURE_BACKPRESSURED_FIELD]: false,
    [CONTROL_SNAPSHOT_OWNER_QUEUE_QUERY_PRESSURE_BACKPRESSURED_FIELD]: false,
  });
}

function buildBoundedWaitOwnerRecoveryMembershipPublicationHandoffOutcome({
  activeGateHandoff = null,
  membershipPublicationHandoffOutcome = null,
  retryAfterMs,
} = {}) {
  const baseOutcome =
    membershipPublicationHandoffOutcome &&
      typeof membershipPublicationHandoffOutcome === TYPEOF_OBJECT &&
      Array.isArray(membershipPublicationHandoffOutcome) !== true ?
      membershipPublicationHandoffOutcome :
      {};
  const reasonCode =
    typeof baseOutcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
    ] === TYPEOF_STRING &&
      baseOutcome[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
      ].length > ZERO ?
      baseOutcome[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
      ] :
      typeof activeGateHandoff?.reasonCode === TYPEOF_STRING &&
        activeGateHandoff.reasonCode.length > ZERO ?
        activeGateHandoff.reasonCode :
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING;
  return Object.freeze({
    ...baseOutcome,
    schemaVersion:
      Number.isFinite(baseOutcome.schemaVersion) ?
        Math.floor(baseOutcome.schemaVersion) :
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_SCHEMA_VERSION,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE]:
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .WRITE_DEFERRED,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE]:
      reasonCode,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED]:
      baseOutcome[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED
      ] === true,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS]:
      retryAfterMs,
  });
}

function buildWaitOwnerRecoveryQueueProjection({
  activeGateHandoff = null,
  membershipPublicationHandoffOutcome = null,
  controlPlaneOwnerQueueDepth = null,
  snapshotObservationSummary = null,
} = {}) {
  const evidence = normalizeWaitOwnerRecoveryQueueProjectionEvidence({
    activeGateHandoff,
    membershipPublicationHandoffOutcome,
    snapshotObservationSummary,
  });
  const outcome = decideWaitOwnerRecoveryQueueProjection(evidence);
  if (outcome.project !== true) {
    return {
      membershipPublicationHandoffOutcome,
      controlPlaneOwnerQueueDepth,
    };
  }
  return {
    membershipPublicationHandoffOutcome:
      buildBoundedWaitOwnerRecoveryMembershipPublicationHandoffOutcome({
        activeGateHandoff,
        membershipPublicationHandoffOutcome,
        retryAfterMs: evidence.retryAfterMs,
      }),
    controlPlaneOwnerQueueDepth: buildControlSnapshotOwnerRecoveryQueueDepth({
      controlPlaneOwnerQueueDepth,
      pendingRecoveryCount: evidence.pendingRecoveryCount,
    }),
  };
}

function hasControlSnapshotReachabilityFallback(result = null) {
  return (
    result?.error === null &&
    result?.controlPlaneDiagnosticsAvailable === true &&
    isTimeoutShapedProbeError(result?.reachabilityError)
  );
}

function resetSnapshotLaneAfterTimeout(node, error) {
  const normalizedError = String(normalizeProbeError(error)).toLowerCase();
  const isTransientOrClosed =
    isTimeoutShapedProbeError(error) === true ||
    isSelectedSnapshotTransportClosedProbeError(error) === true ||
    normalizedError.includes('enotfound') ||
    normalizedError.includes('eaddrnotavail') ||
    normalizedError.includes('econnrefused');
  if (
    isTransientOrClosed !== true ||
    typeof node?._resetAdminSocket !== TYPEOF_FUNCTION
  ) {
    return false;
  }
  node._resetAdminSocket(ADMIN_SOCKET_LANE_SNAPSHOT);
  return true;
}

function isAuthoritativeRepairParticipantConnectionClosedProbeError(error) {
  const normalizedError = String(normalizeProbeError(error)).toLowerCase();
  return (
    normalizedError.includes(
      CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILED_TEXT,
    ) &&
    normalizedError.includes(CONTROL_SNAPSHOT_CONNECTION_TO_NODE_TEXT) &&
    normalizedError.includes(CONTROL_SNAPSHOT_CONNECTION_CLOSED_TEXT)
  );
}

function isSelectedSnapshotTransportClosedProbeError(error) {
  const normalizedError = String(normalizeProbeError(error)).toLowerCase();
  return SELECTED_SNAPSHOT_TRANSPORT_CLOSED_RULES.some((rule) =>
    rule.matches(normalizedError),
  );
}

function resolveSnapshotRetryReason({
  forceRepair,
  reachabilityDiagnostics,
  snapshotError,
}) {
  const snapshotRetryEvidence = {
    adminReady: reachabilityDiagnostics?.adminReady === true,
    authoritativeRepairPressure:
      isAuthoritativeRepairParticipantConnectionClosedProbeError(snapshotError),
    forceRepair: forceRepair === true,
    selectedTimeout: isTimeoutShapedProbeError(snapshotError) === true,
    selectedTransportClosed: isSelectedSnapshotTransportClosedProbeError(snapshotError),
  };
  if (snapshotRetryEvidence.adminReady !== true) {
    return CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE;
  }
  if (
    snapshotRetryEvidence.forceRepair === true &&
    snapshotRetryEvidence.authoritativeRepairPressure
  ) {
    return CONTROL_SNAPSHOT_RETRY_REASON_AUTHORITATIVE_REPAIR_PRESSURE;
  }
  if (snapshotRetryEvidence.selectedTimeout) {
    return CONTROL_SNAPSHOT_RETRY_REASON_SELECTED_TIMEOUT;
  }
  if (snapshotRetryEvidence.selectedTransportClosed) {
    return CONTROL_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED;
  }
  return CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE;
}

function resolveSnapshotTerminalObservationReason({
  reachabilityDiagnostics,
  snapshotError,
}) {
  if (
    reachabilityDiagnostics?.adminReady === true &&
    isSelectedSnapshotTransportClosedProbeError(snapshotError)
  ) {
    return CONTROL_SNAPSHOT_OBSERVATION_REASON_SELECTED_TRANSPORT_CLOSED;
  }
  return CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE;
}

function resolveTerminalSnapshotRetryReason({
  retryReason,
  reachabilityDiagnostics,
  snapshotError,
}) {
  const terminalObservationReason = resolveSnapshotTerminalObservationReason({
    reachabilityDiagnostics,
    snapshotError,
  });
  return terminalObservationReason !==
    CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE ?
    terminalObservationReason :
    retryReason;
}

function resolveSnapshotRetryTimeoutMs(
  snapshotTimeoutMs,
  probeTimeoutScale = CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE,
) {
  const normalizedSnapshotTimeoutMs = Number.isFinite(snapshotTimeoutMs) ?
    Math.max(MIN_TIMEOUT_MS, Math.floor(snapshotTimeoutMs)) :
    MIN_TIMEOUT_MS;
  const normalizedProbeTimeoutScale = Number.isFinite(probeTimeoutScale) ?
    Math.max(CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE, probeTimeoutScale) :
    CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE;
  const scaledProbeTimeoutMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.floor(CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS * normalizedProbeTimeoutScale),
  );
  const defaultRetryTimeoutMs = Math.max(
    normalizedSnapshotTimeoutMs,
    scaledProbeTimeoutMs,
  );
  const selectedRetryTimeoutFloorMs =
    normalizedSnapshotTimeoutMs <= CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS ?
      CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS :
      MIN_TIMEOUT_MS;
  const boundedScaledRetryTimeoutMs = Math.max(
    selectedRetryTimeoutFloorMs,
    Math.floor(
      normalizedSnapshotTimeoutMs /
        CONTROL_SNAPSHOT_SELECTED_RETRY_TIMEOUT_DIVISOR,
    ),
  );
  return normalizedProbeTimeoutScale >
    CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE ?
    boundedScaledRetryTimeoutMs :
    defaultRetryTimeoutMs;
}

function selectAlternativeSnapshotWitness(
  snapshotProbeResults,
  selectedResult,
) {
  if (
    selectedResult?.snapshotTimeoutEncountered !== true ||
    selectedResult?.adminReady !== true
  ) {
    return selectedResult;
  }
  let alternativeResult = null;
  for (const result of snapshotProbeResults) {
    if (result?.nodeId === selectedResult?.nodeId || result?.error !== null) {
      continue;
    }
    if (!alternativeResult) {
      alternativeResult = result;
      continue;
    }
    if (
      result.missingExpectedNodeCount !==
      alternativeResult.missingExpectedNodeCount
    ) {
      if (
        result.missingExpectedNodeCount <
        alternativeResult.missingExpectedNodeCount
      ) {
        alternativeResult = result;
      }
      continue;
    }
    if (result.observedNodeCount !== alternativeResult.observedNodeCount) {
      if (result.observedNodeCount > alternativeResult.observedNodeCount) {
        alternativeResult = result;
      }
      continue;
    }
    if (
      Number.isFinite(result.capturedAtMs) &&
      (!Number.isFinite(alternativeResult.capturedAtMs) ||
        result.capturedAtMs > alternativeResult.capturedAtMs)
    ) {
      alternativeResult = result;
    }
  }
  return alternativeResult || selectedResult;
}

export {
  ACTIVE_WAIT_TIMEOUT_EVENT_INTERVAL_DIVISOR,
  CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE,
  CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_UNAVAILABLE,
  CONTROL_SNAPSHOT_MISSING_ROWS_ERROR,
  CONTROL_SNAPSHOT_NO_CANDIDATES_ERROR,
  CONTROL_SNAPSHOT_PRIORITY_RECOVERY_DECISION_SNAPSHOTS_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_GATE_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_UNAVAILABLE,
  CONTROL_SNAPSHOT_REACHABILITY_SOURCE,
  CONTROL_SNAPSHOT_REVISION_STATE_UNAVAILABLE,
  CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE,
  CONTROL_SNAPSHOT_STARTUP_PROBE_TIMEOUT_SCALE,
  CRITICAL_SYSTEM_READY_NODE_IDS_UNAVAILABLE,
  SERVICE_DISCOVERY_NO_CANDIDATES_ERROR,
  TYPEOF_BOOLEAN,
  TYPEOF_STRING,
  buildControlSnapshotObservationSummary,
  buildControlSnapshotRetryObservationSummary,
  buildTerminalControlSnapshotActiveGateHandoff,
  buildTerminalControlSnapshotRecoveryProgress,
  buildWaitOwnerRecoveryQueueProjection,
  hasControlSnapshotReachabilityFallback,
  resetSnapshotLaneAfterTimeout,
  resolveSnapshotRetryReason,
  resolveSnapshotRetryTimeoutMs,
  resolveSnapshotTerminalObservationReason,
  resolveTerminalSnapshotRetryReason,
  selectAlternativeSnapshotWitness,
};
