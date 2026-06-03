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
const CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  NEXT_ACTION: 'nextAction',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REASON_CODE: 'reasonCode',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
});
const CRITICAL_SYSTEM_READY_NODE_IDS_UNAVAILABLE = Object.freeze([]);
const SERVICE_DISCOVERY_NO_CANDIDATES_ERROR = 'no_service_discovery_candidates';
const ACTIVE_WAIT_TIMEOUT_EVENT_INTERVAL_DIVISOR = 2;
const CONTROL_SNAPSHOT_STARTUP_PROBE_TIMEOUT_SCALE = 2;
const CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE = ONE;
const CONTROL_SNAPSHOT_SELECTED_RETRY_TIMEOUT_DIVISOR = 2;
const CONTROL_SNAPSHOT_OWNER_RECOVERY_RETRY_TIMEOUT_DIVISOR = 6;
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
const OWNER_RECOVERY_HANDOFF_RETURN_OUTCOME_KEEP = Object.freeze({
  returnAfterHandoff: false,
});
const OWNER_RECOVERY_HANDOFF_RETURN_OUTCOME_APPLY = Object.freeze({
  returnAfterHandoff: true,
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
const OWNER_RECOVERY_HANDOFF_RETURN_DECISION_TABLE = Object.freeze([
  Object.freeze({
    outcome: OWNER_RECOVERY_HANDOFF_RETURN_OUTCOME_APPLY,
    matches: (evidence) =>
      evidence.snapshotErrorPresent === true &&
      evidence.snapshotRepairDeferred === true &&
      evidence.selectedRetryBounded === true &&
      evidence.selectedReasonAllowsActiveGateHandoff === true &&
      evidence.controlPlaneDiagnosticsAvailable === true &&
      evidence.adminReady === true &&
      evidence.waitOwnerRecovery === true &&
      evidence.ownerReconcilePending === true &&
      evidence.runtimePromotionAllowed !== true &&
      evidence.pendingRecoveryCount > ZERO &&
      evidence.publishedCoversExpected === true &&
      evidence.missingPublishedCount === ZERO &&
      evidence.ownerQueueBounded === true &&
      evidence.alternativeSnapshotWitnessAvailable !== true &&
      evidence.handoffOutcomeBounded === true,
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
  forceProjection = false,
} = {}) {
  if (
    forceProjection !== true &&
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
      ] === true ||
      (activeGateHandoff?.pendingReconcileCount ?? 0) === 0,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS]:
      retryAfterMs,
  });
}

function normalizeControlSnapshotPendingRecoveryNodeIds(result = null) {
  return normalizeDistinctStringArray(
    result?.publicationActiveGateHandoff?.pendingRecoveryNodeIds,
  );
}

function isControlSnapshotBoundedOwnerRecoveryWitness(result = null) {
  const pendingRecoveryNodeIds =
    normalizeControlSnapshotPendingRecoveryNodeIds(result);
  const handoffOutcome =
    result?.membershipPublicationHandoffOutcome &&
      typeof result.membershipPublicationHandoffOutcome === TYPEOF_OBJECT &&
      Array.isArray(result.membershipPublicationHandoffOutcome) !== true ?
      result.membershipPublicationHandoffOutcome :
      null;
  const ownerQueueDepth =
    result?.controlPlaneOwnerQueueDepth &&
      typeof result.controlPlaneOwnerQueueDepth === TYPEOF_OBJECT &&
      Array.isArray(result.controlPlaneOwnerQueueDepth) !== true ?
      result.controlPlaneOwnerQueueDepth :
      null;
  const ownerQueuePendingWrites = normalizeControlSnapshotHandoffDebtCount(
    ownerQueueDepth?.[CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD],
    pendingRecoveryNodeIds,
  );
  const ownerQueuePendingWriteGrowthCount =
    normalizeControlSnapshotHandoffDebtCount(
      ownerQueueDepth?.[
        CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD
      ],
      [],
    );
  return (
    result?.snapshotTimeoutEncountered === true &&
    result?.snapshotRepairDeferred === true &&
    result?.adminReady === true &&
    controlSnapshotReasonAllowsActiveGateHandoff(
      result?.snapshotObservationReasonCodes,
    ) === true &&
    result?.publicationActiveGateHandoff?.nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    result?.publicationActiveGateHandoff?.reasonCode ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING &&
    result?.publicationActiveGateHandoff?.runtimePromotionAllowed !== true &&
    pendingRecoveryNodeIds.length > ZERO &&
    ownerQueueDepth !== null &&
    ownerQueuePendingWrites >= pendingRecoveryNodeIds.length &&
    ownerQueuePendingWriteGrowthCount === ZERO &&
    handoffOutcome?.[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE
    ] ===
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .WRITE_DEFERRED &&
    handoffOutcome?.[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
    ] === PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING &&
    handoffOutcome?.[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED
    ] === true &&
    normalizeControlSnapshotBoundedRetryAfterMs(
      handoffOutcome?.[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
          .RETRY_AFTER_MS
      ],
    ) !== null
  );
}

function buildAggregatedControlSnapshotActiveGateHandoff({
  baseHandoff = null,
  expectedNodeIds = [],
  pendingRecoveryNodeIds = [],
  retryAfterMs,
} = {}) {
  const normalizedExpectedNodeIds = normalizeDistinctStringArray([
    ...expectedNodeIds,
    ...normalizeDistinctStringArray(baseHandoff?.expectedNodeIds),
  ]);
  const normalizedPublishedActiveNodeIds = normalizeDistinctStringArray([
    ...normalizedExpectedNodeIds,
    ...normalizeDistinctStringArray(baseHandoff?.publishedActiveNodeIds),
  ]);
  return buildPublicationActiveGateHandoffContract({
    expectedNodeIds: normalizedExpectedNodeIds,
    publishedActiveNodeIds: normalizedPublishedActiveNodeIds,
    pendingRecoveryNodeIds,
    pendingReconcileNodeIds: normalizeDistinctStringArray(
      baseHandoff?.pendingReconcileNodeIds,
    ),
    retryAfterMs,
  });
}

function aggregateControlSnapshotOwnerRecoveryWitnesses({
  selectedResult = null,
  snapshotProbeResults = [],
  expectedNodeIds = [],
} = {}) {
  if (!isControlSnapshotBoundedOwnerRecoveryWitness(selectedResult)) {
    return selectedResult;
  }
  const ownerRecoveryWitnesses = snapshotProbeResults.filter(
    isControlSnapshotBoundedOwnerRecoveryWitness,
  );
  const pendingRecoveryNodeIds = normalizeDistinctStringArray(
    ownerRecoveryWitnesses.flatMap(normalizeControlSnapshotPendingRecoveryNodeIds),
  );
  const selectedPendingRecoveryNodeIds =
    normalizeControlSnapshotPendingRecoveryNodeIds(selectedResult);
  if (pendingRecoveryNodeIds.length <= selectedPendingRecoveryNodeIds.length) {
    return selectedResult;
  }
  const selectedRetryAfterMs = normalizeControlSnapshotBoundedRetryAfterMs(
    selectedResult?.snapshotObservationRetryAfterMs,
  );
  const activeGateHandoff = buildAggregatedControlSnapshotActiveGateHandoff({
    baseHandoff: selectedResult?.publicationActiveGateHandoff,
    expectedNodeIds,
    pendingRecoveryNodeIds,
    retryAfterMs: selectedRetryAfterMs,
  });
  return Object.freeze({
    ...selectedResult,
    publicationActiveGateHandoff: activeGateHandoff,
    activeGateOwnerCohort: activeGateHandoff,
    membershipPublicationHandoffOutcome:
      buildBoundedWaitOwnerRecoveryMembershipPublicationHandoffOutcome({
        activeGateHandoff,
        membershipPublicationHandoffOutcome:
          selectedResult?.membershipPublicationHandoffOutcome,
        retryAfterMs: selectedRetryAfterMs,
      }),
    controlPlaneOwnerQueueDepth:
      buildControlSnapshotOwnerRecoveryQueueDepth({
        pendingRecoveryCount: pendingRecoveryNodeIds.length,
        forceProjection: true,
      }),
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
  const projectedOutcome =
    buildBoundedWaitOwnerRecoveryMembershipPublicationHandoffOutcome({
      activeGateHandoff,
      membershipPublicationHandoffOutcome,
      retryAfterMs: evidence.retryAfterMs,
    });
  if (
    activeGateHandoff &&
    (activeGateHandoff.pendingReconcileCount ?? 0) === 0 &&
    (projectedOutcome?.enqueued !== true)
  ) {
    throw new Error('Write-deferred active-gate owner recovery must schedule reconcile admission or queue progress');
  }
  return {
    membershipPublicationHandoffOutcome: projectedOutcome,
    controlPlaneOwnerQueueDepth: buildControlSnapshotOwnerRecoveryQueueDepth({
      controlPlaneOwnerQueueDepth,
      pendingRecoveryCount: evidence.pendingRecoveryCount,
    }),
  };
}

function normalizeOwnerRecoveryHandoffReturnEvidence({
  result = null,
  expectedNodeIds = [],
  alternativeSnapshotWitnessAvailable = false,
} = {}) {
  const activeGateHandoff =
    result?.publicationActiveGateHandoff &&
      typeof result.publicationActiveGateHandoff === TYPEOF_OBJECT &&
      Array.isArray(result.publicationActiveGateHandoff) !== true ?
      result.publicationActiveGateHandoff :
      null;
  const handoffOutcome =
    result?.membershipPublicationHandoffOutcome &&
      typeof result.membershipPublicationHandoffOutcome === TYPEOF_OBJECT &&
      Array.isArray(result.membershipPublicationHandoffOutcome) !== true ?
      result.membershipPublicationHandoffOutcome :
      null;
  const ownerQueueDepth =
    result?.controlPlaneOwnerQueueDepth &&
      typeof result.controlPlaneOwnerQueueDepth === TYPEOF_OBJECT &&
      Array.isArray(result.controlPlaneOwnerQueueDepth) !== true ?
      result.controlPlaneOwnerQueueDepth :
      null;
  const expectedIds = normalizeDistinctStringArray(expectedNodeIds);
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    activeGateHandoff?.[
      CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    activeGateHandoff?.[
      CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_NODE_IDS
    ],
  );
  const pendingRecoveryNodeIds = normalizeDistinctStringArray(
    activeGateHandoff?.[
      CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.PENDING_RECOVERY_NODE_IDS
    ],
  );
  const pendingRecoveryCount = Math.max(
    pendingRecoveryNodeIds.length,
    normalizeControlSnapshotHandoffDebtCount(
      activeGateHandoff?.pendingRecoveryCount,
      pendingRecoveryNodeIds,
    ),
  );
  const missingPublishedCount = Math.max(
    missingPublishedNodeIds.length,
    normalizeControlSnapshotHandoffDebtCount(
      activeGateHandoff?.[
        CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.MISSING_PUBLISHED_COUNT
      ],
      missingPublishedNodeIds,
    ),
  );
  const ownerQueuePendingWrites = normalizeControlSnapshotHandoffDebtCount(
    ownerQueueDepth?.[CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITES_FIELD],
    pendingRecoveryNodeIds,
  );
  const ownerQueuePendingWriteGrowthCount =
    normalizeControlSnapshotHandoffDebtCount(
      ownerQueueDepth?.[
        CONTROL_SNAPSHOT_OWNER_QUEUE_PENDING_WRITE_GROWTH_COUNT_FIELD
      ],
      [],
    );
  return Object.freeze({
    snapshotErrorPresent:
      typeof result?.error === TYPEOF_STRING && result.error.length > ZERO,
    snapshotRepairDeferred: result?.snapshotRepairDeferred === true,
    selectedRetryBounded:
      normalizeControlSnapshotBoundedRetryAfterMs(
        result?.snapshotObservationRetryAfterMs,
      ) !== null,
    selectedReasonAllowsActiveGateHandoff:
      controlSnapshotReasonAllowsActiveGateHandoff(
        result?.snapshotObservationReasonCodes,
      ),
    controlPlaneDiagnosticsAvailable:
      result?.controlPlaneDiagnosticsAvailable === true,
    adminReady: result?.adminReady === true,
    waitOwnerRecovery:
      activeGateHandoff?.[
        CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.NEXT_ACTION
      ] === PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    ownerReconcilePending:
      activeGateHandoff?.[
        CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE
      ] === PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    runtimePromotionAllowed:
      activeGateHandoff?.[
        CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_FIELD.RUNTIME_PROMOTION_ALLOWED
      ] === true,
    pendingRecoveryCount,
    publishedCoversExpected:
      expectedIds.length > ZERO &&
      expectedIds.every((nodeId) => publishedActiveNodeIds.includes(nodeId)),
    missingPublishedCount,
    alternativeSnapshotWitnessAvailable:
      alternativeSnapshotWitnessAvailable === true,
    ownerQueueBounded:
      ownerQueueDepth !== null &&
      ownerQueuePendingWrites >= Math.max(ONE, pendingRecoveryCount) &&
      ownerQueuePendingWriteGrowthCount === ZERO,
    handoffOutcomeBounded:
      handoffOutcome?.[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE
      ] ===
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
          .WRITE_DEFERRED &&
      handoffOutcome?.[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
          .REASON_CODE
      ] === PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING &&
      normalizeControlSnapshotBoundedRetryAfterMs(
        handoffOutcome?.[
          CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
            .RETRY_AFTER_MS
        ],
      ) !== null,
  });
}

function decideOwnerRecoveryHandoffReturn(evidence) {
  const decision = OWNER_RECOVERY_HANDOFF_RETURN_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return decision?.outcome || OWNER_RECOVERY_HANDOFF_RETURN_OUTCOME_KEEP;
}

function controlSnapshotOwnerRecoveryAllowsBoundedReturn({
  result = null,
  expectedNodeIds = [],
  alternativeSnapshotWitnessAvailable = false,
} = {}) {
  const evidence = normalizeOwnerRecoveryHandoffReturnEvidence({
    result,
    expectedNodeIds,
    alternativeSnapshotWitnessAvailable,
  });
  return decideOwnerRecoveryHandoffReturn(evidence).returnAfterHandoff === true;
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
  options = {},
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
  const ownerRecoveryRetryTimeoutMs = Math.max(
    selectedRetryTimeoutFloorMs,
    Math.floor(
      CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS /
        CONTROL_SNAPSHOT_OWNER_RECOVERY_RETRY_TIMEOUT_DIVISOR,
    ),
  );
  const ownerRecoveryReconcilePending =
    options?.ownerRecoveryReconcilePending === true;
  if (
    ownerRecoveryReconcilePending &&
    normalizedSnapshotTimeoutMs <= CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS
  ) {
    return ownerRecoveryRetryTimeoutMs;
  }
  if (
    normalizedProbeTimeoutScale > CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE
  ) {
    return boundedScaledRetryTimeoutMs;
  }
  return ownerRecoveryReconcilePending ?
    Math.min(boundedScaledRetryTimeoutMs, ownerRecoveryRetryTimeoutMs) :
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
  aggregateControlSnapshotOwnerRecoveryWitnesses,
  buildControlSnapshotObservationSummary,
  buildControlSnapshotRetryObservationSummary,
  buildTerminalControlSnapshotActiveGateHandoff,
  buildTerminalControlSnapshotRecoveryProgress,
  buildWaitOwnerRecoveryQueueProjection,
  controlSnapshotOwnerRecoveryAllowsBoundedReturn,
  controlSnapshotReasonAllowsActiveGateHandoff,
  hasControlSnapshotReachabilityFallback,
  resetSnapshotLaneAfterTimeout,
  resolveSnapshotRetryReason,
  resolveSnapshotRetryTimeoutMs,
  resolveSnapshotTerminalObservationReason,
  resolveTerminalSnapshotRetryReason,
  selectAlternativeSnapshotWitness,
};
