/**
 * Repair diagnostics and deferred repair helpers for admin control snapshots.
 */
import {NUM} from '../constants/index.js';
import {ADMIN_CACHE_DUMP} from './admin-constants.js';
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
});
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  'leader_resolution_gap';
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT = 'query_timeout';
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_PARTICIPANT_FAILURE =
  'query_participant_failure';
const AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE =
  'control_plane_backpressure';
const CONTROL_SNAPSHOT_REPAIR_CAUSE_TIMEOUT =
  AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT;
const CONTROL_SNAPSHOT_REPAIR_CAUSE_PARTICIPANT_FAILURE =
  AUTHORITATIVE_REPAIR_CAUSE_QUERY_PARTICIPANT_FAILURE;
const CONTROL_SNAPSHOT_EMPTY_REPAIR_CAUSE_CHAIN = ADMIN_CACHE_DUMP.EMPTY;
const CONTROL_SNAPSHOT_ABSENT_REPAIR_DETAIL = null;
const CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT = null;
const CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_METHOD =
  'ensureAuthoritativeDiscoveryCacheRepair';
const CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION = 'queryTimeoutMs';
const CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD = 'localQueryTransport';
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
  'websocket was closed before the connection was established',
]);
const CONTROL_SNAPSHOT_NODES_FIELD = 'nodes';
const CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD = 'projectedNodes';
const CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD =
  'publicationConvergence';
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD =
  'activeGateOwnerCohort';
const CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_NODE_FIELD = Object.freeze({
  EXPECTED_NODE_IDS: 'expectedNodeIds',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
});
const CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_SIGNAL_FIELD = Object.freeze({
  NEXT_ACTION: 'nextAction',
  PENDING_RECOVERY_COUNT: 'pendingRecoveryCount',
});
const CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_RECOVERY_NEXT_ACTION =
  'wait_owner_recovery';
const CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD = Object.freeze({
  ALLOW_AUTHORITATIVE_REPAIR: 'allowAuthoritativeRepair',
  ALLOW_AUTHORITATIVE_READINESS_REFRESH: 'allowAuthoritativeReadinessRefresh',
  FORCE_AUTHORITATIVE_REPAIR: 'forceAuthoritativeRepair',
  PREFER_AUTHORITATIVE_PUBLICATION_READ: 'preferAuthoritativePublicationRead',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  RECONCILE_AUTHORITATIVE_MEMBERSHIP_PUBLICATION:
    'reconcileAuthoritativeMembershipPublication',
});
const CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR = ':';
const CONTROL_SNAPSHOT_REPAIR_CONNECTION_CLOSED_PREFIX =
  'Connection to node ';
const CONTROL_SNAPSHOT_REPAIR_CONNECTION_CLOSED_SUFFIX = ' closed';
const CONTROL_SNAPSHOT_REPAIR_WEBSOCKET_MATCH_LOWER = 'websocket';
const CONTROL_SNAPSHOT_REPAIR_CLOSED_MATCH_LOWER = 'closed';
const CONTROL_SNAPSHOT_REPAIR_CLOSED_MESSAGE_FRAGMENTS = Object.freeze([
  'connection closed',
  'transport closed',
  'connection closed before response',
]);
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_ERROR_FIELD = 'error';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_MESSAGE_FIELD = 'message';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_FAILED_TABLE_FIELD =
  'failedTable';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_TABLE_NAME_FIELD =
  'tableName';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_SKIPPED_DETAIL = 'repair_skipped';
const CONTROL_SNAPSHOT_REPAIR_FAILURE_NOT_APPLIED_DETAIL =
  'repair_not_applied';
const CONTROL_SNAPSHOT_REPAIR_EVALUATION_FIELD = Object.freeze({
  NODE_COVERAGE: 'nodeCoverage',
  SHARED_METADATA: 'sharedMetadata',
  REFERENCED_NODE_IDS: 'referencedNodeIds',
});
const CONTROL_SNAPSHOT_REPAIR_DEFERRED_MIN_NODE_COVERAGE = NUM.THREE;
const CONTROL_SNAPSHOT_REPAIR_QUERY_TIMEOUT_DIVISOR = 2;
const CONTROL_SNAPSHOT_ORDINARY_REPAIR_QUERY_TIMEOUT_MIN_MS = NUM.HUNDRED;
function normalizeControlSnapshotNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) =>
        typeof value === 'string' ?
          value.trim() :
          ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      )
      .filter((value) => value.length > 0),
  )].sort((left, right) => left.localeCompare(right));
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > 0 &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    CONTROL_SNAPSHOT_EMPTY_REPAIR_CAUSE_CHAIN;
  return (
    causeChain.includes(CONTROL_SNAPSHOT_REPAIR_CAUSE_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE)
  );
}
function hasParticipantFailureRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    CONTROL_SNAPSHOT_EMPTY_REPAIR_CAUSE_CHAIN;
  return (
    causeChain.includes(
      CONTROL_SNAPSHOT_REPAIR_CAUSE_PARTICIPANT_FAILURE,
    ) ||
    hasConnectionClosedParticipantRepairCause(repair) ||
    (
      repair?.firstFailedParticipant &&
      typeof repair.firstFailedParticipant === 'object' &&
      !Array.isArray(repair.firstFailedParticipant)
    )
  );
}
function hasConnectionClosedParticipantRepairCause(repair = null) {
  return normalizeControlSnapshotRepairMessageList(repair).some((message) =>
    message.includes(CONTROL_SNAPSHOT_REPAIR_CONNECTION_CLOSED_PREFIX) &&
    message.includes(CONTROL_SNAPSHOT_REPAIR_CONNECTION_CLOSED_SUFFIX),
  );
}
function resolveDeferredRepairMinNodeCoverage(
  snapshot = null,
  repairEvaluation = null,
) {
  if (!snapshot || typeof snapshot !== 'object') {
    return CONTROL_SNAPSHOT_REPAIR_DEFERRED_MIN_NODE_COVERAGE;
  }
  const coverageNodeIds = normalizeControlSnapshotNodeIdList([
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_NODES_FIELD],
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD],
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.publishedNodes,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.suspectedOrTransitioningNodes,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.controlPlaneDiagnostics?.activeNodeViews
        ?.authoritativeActiveNodeIds,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.controlPlaneDiagnostics?.activeNodeViews?.effectiveActiveNodeIds,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.controlPlaneDiagnostics?.activeNodeViews?.locallyEligibleNodeIds,
    ),
    ...selectDeferredRepairActiveGateHandoffProjectionNodeIds(snapshot),
    ...selectDeferredRepairProjectionNodeIds(repairEvaluation),
  ]);
  const totalKnownNodes = coverageNodeIds.length;
  if (totalKnownNodes === 0) {
    return CONTROL_SNAPSHOT_REPAIR_DEFERRED_MIN_NODE_COVERAGE;
  }
  const quorumCount = Math.floor(totalKnownNodes / 2) + 1;
  return Math.max(2, quorumCount);
}
function hasDeferredRepairLocalControlSnapshotCoverage(
  snapshot = null,
  repairEvaluation = null,
) {
  const minNodeCoverage = resolveDeferredRepairMinNodeCoverage(
    snapshot,
    repairEvaluation,
  );
  return resolveControlSnapshotCoverageNodeCount(snapshot) >= minNodeCoverage;
}
function selectDeferredRepairProjectionNodeIds(repairEvaluation = null) {
  return normalizeControlSnapshotNodeIdList(
    repairEvaluation?.[
      CONTROL_SNAPSHOT_REPAIR_EVALUATION_FIELD.NODE_COVERAGE
    ]?.[
      CONTROL_SNAPSHOT_REPAIR_EVALUATION_FIELD.SHARED_METADATA
    ]?.[
      CONTROL_SNAPSHOT_REPAIR_EVALUATION_FIELD.REFERENCED_NODE_IDS
    ],
  );
}
function selectDeferredRepairActiveGateHandoffContracts(snapshot = null) {
  const diagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (!diagnostics || typeof diagnostics !== 'object') {
    return ADMIN_CACHE_DUMP.EMPTY;
  }
  return [
    diagnostics[CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD],
    diagnostics[CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD],
    diagnostics[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD]?.[
      CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
    ],
  ].filter((handoff) =>
    handoff && typeof handoff === 'object' && !Array.isArray(handoff),
  );
}
function hasDeferredRepairActiveGateRecoveryProjectionSignal(handoff = null) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    return false;
  }
  const pendingRecoveryNodeIds = normalizeControlSnapshotNodeIdList(
    handoff[
      CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_NODE_FIELD.PENDING_RECOVERY_NODE_IDS
    ],
  );
  return (
    pendingRecoveryNodeIds.length > 0 ||
    Number(
      handoff[
        CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_SIGNAL_FIELD.PENDING_RECOVERY_COUNT
      ],
    ) > 0 ||
    handoff[CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_SIGNAL_FIELD.NEXT_ACTION] ===
      CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_RECOVERY_NEXT_ACTION
  );
}
function selectDeferredRepairActiveGateHandoffProjectionNodeIds(
  snapshot = null,
) {
  return normalizeControlSnapshotNodeIdList(
    selectDeferredRepairActiveGateHandoffContracts(snapshot)
      .filter(hasDeferredRepairActiveGateRecoveryProjectionSignal)
      .flatMap((handoff) => [
        ...normalizeControlSnapshotNodeIdList(
          handoff[
            CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_NODE_FIELD.EXPECTED_NODE_IDS
          ],
        ),
        ...normalizeControlSnapshotNodeIdList(
          handoff[
            CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_NODE_FIELD
              .PUBLISHED_ACTIVE_NODE_IDS
          ],
        ),
        ...normalizeControlSnapshotNodeIdList(
          handoff[
            CONTROL_SNAPSHOT_ACTIVE_GATE_HANDOFF_NODE_FIELD
              .PENDING_RECOVERY_NODE_IDS
          ],
        ),
      ]),
  );
}
function resolveControlSnapshotCoverageNodeCount(snapshot = null) {
  const nodeIds = snapshot?.[CONTROL_SNAPSHOT_NODES_FIELD];
  return Array.isArray(nodeIds) ? nodeIds.length : 0;
}
function projectDeferredRepairCoverageSnapshot(
  snapshot = null,
  repairEvaluation = null,
) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }
  const coverageNodeIds = normalizeControlSnapshotNodeIdList([
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_NODES_FIELD],
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD],
    ),
    ...selectDeferredRepairActiveGateHandoffProjectionNodeIds(snapshot),
    ...selectDeferredRepairProjectionNodeIds(repairEvaluation),
  ]);
  const minNodeCoverage = resolveDeferredRepairMinNodeCoverage(
    snapshot,
    repairEvaluation,
  );
  if (
    coverageNodeIds.length < minNodeCoverage ||
    coverageNodeIds.length <= resolveControlSnapshotCoverageNodeCount(snapshot)
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    [CONTROL_SNAPSHOT_NODES_FIELD]: coverageNodeIds,
    [CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD]:
      normalizeControlSnapshotNodeIdList([
        ...normalizeControlSnapshotNodeIdList(
          snapshot[CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD],
        ),
        ...coverageNodeIds,
      ]),
  };
}
function selectDeferredRepairLocalControlSnapshot(
  snapshot = null,
  repairEvaluation = null,
) {
  const projectedSnapshot = projectDeferredRepairCoverageSnapshot(
    snapshot,
    repairEvaluation,
  );
  return hasDeferredRepairLocalControlSnapshotCoverage(
    projectedSnapshot,
    repairEvaluation,
  ) ?
    projectedSnapshot :
    null;
}
function hasWebSocketClosedRepairCause(repair = null) {
  return normalizeControlSnapshotRepairMessageList(repair).some((message) => {
    const lowerMessage = message.toLowerCase();
    return (
      (lowerMessage.includes(CONTROL_SNAPSHOT_REPAIR_WEBSOCKET_MATCH_LOWER) &&
       lowerMessage.includes(CONTROL_SNAPSHOT_REPAIR_CLOSED_MATCH_LOWER)) ||
      CONTROL_SNAPSHOT_REPAIR_CLOSED_MESSAGE_FRAGMENTS.some((fragment) =>
        lowerMessage.includes(fragment),
      )
    );
  });
}
function hasForcedRepairDeferredFailureCause(repair = null) {
  return (
    hasParticipantFailureRepairCause(repair) ||
    hasPressureOrTimeoutRepairCause(repair) ||
    hasWebSocketClosedRepairCause(repair)
  );
}
function shouldAttemptForcedRepairFailureLocalFallback(options = {}) {
  return (
    options.forceAuthoritativeRepair === true &&
    hasForcedRepairDeferredFailureCause(options.repair)
  );
}
function resolveAuthoritativeRepairQueryTimeoutMs(options = {}) {
  const queryTimeoutMs = Number(options.queryTimeoutMs);
  if (
    !Number.isFinite(queryTimeoutMs) ||
    queryTimeoutMs <= 1
  ) {
    return options.queryTimeoutMs;
  }
  const reservedRepairTimeoutMs = Math.max(
    1,
    Math.floor(
      queryTimeoutMs / CONTROL_SNAPSHOT_REPAIR_QUERY_TIMEOUT_DIVISOR,
    ),
  );
  if (options.forceAuthoritativeRepair === true) {
    return reservedRepairTimeoutMs;
  }
  const boundedRepairTimeoutMs = Math.max(
    CONTROL_SNAPSHOT_ORDINARY_REPAIR_QUERY_TIMEOUT_MIN_MS,
    reservedRepairTimeoutMs,
  );
  const callerResponseReserveMs = Math.max(
    1,
    Math.floor(queryTimeoutMs - 1),
  );
  return Math.min(callerResponseReserveMs, boundedRepairTimeoutMs);
}
function buildRepairFailureLocalSnapshotOptions(options = {}) {
  return {
    ...options,
    [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD.ALLOW_AUTHORITATIVE_REPAIR]: false,
    [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD.FORCE_AUTHORITATIVE_REPAIR]: false,
    [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
      .PREFER_AUTHORITATIVE_PUBLICATION_READ]: false,
    [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
      .ALLOW_AUTHORITATIVE_READINESS_REFRESH]: false,
    [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
      .RECONCILE_AUTHORITATIVE_MEMBERSHIP_PUBLICATION]: false,
  };
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.length > 0 &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildAuthoritativeControlSnapshotRepairFailure(detail, cause = null) {
  const error = new Error(
    'Authoritative control snapshot repair failed: ' +
      String(detail || 'unknown_error'),
  );
  if (cause) {
    error.cause = cause;
  }
  return error;
}
function normalizeControlSnapshotRepairDetailList(values = []) {
  return (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
    .map((value) =>
      typeof value === 'string' ?
        value.trim() :
        ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    )
    .filter((value) => value.length > 0);
}
function normalizeControlSnapshotRepairMessageList(repair = null) {
  const repairValue = typeof repair === 'string' ?
    repair :
    ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE;
  return normalizeControlSnapshotRepairDetailList([
    repairValue,
    repair?.message,
    repair?.error,
    repair?.cause?.message,
    repair?.cause?.error,
  ]);
}
function firstControlSnapshotRepairDetail(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}
function extractControlSnapshotRepairTableNameFromDetail(detail = null) {
  const normalizedDetail = firstControlSnapshotRepairDetail(detail);
  if (!normalizedDetail) {
    return null;
  }
  const separatorIndex = normalizedDetail.indexOf(
    CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR,
  );
  if (separatorIndex <= 0) {
    return null;
  }
  return normalizedDetail.slice(0, separatorIndex);
}
function resolveControlSnapshotRepairFailureTableName(repair = null) {
  const errorDetails = normalizeControlSnapshotRepairDetailList(
    repair?.errors,
  );
  const failedTables = normalizeControlSnapshotRepairDetailList(
    repair?.failedTables,
  );
  return firstControlSnapshotRepairDetail(
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_FAILED_TABLE_FIELD
    ],
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_TABLE_NAME_FIELD
    ],
    failedTables[0],
    extractControlSnapshotRepairTableNameFromDetail(errorDetails[0]),
  );
}
function resolveControlSnapshotRepairParticipantFailureDetail(repair = null) {
  const participantError = firstControlSnapshotRepairDetail(
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_ERROR_FIELD
    ],
    repair?.firstFailedParticipant?.[
      CONTROL_SNAPSHOT_REPAIR_FAILURE_PARTICIPANT_MESSAGE_FIELD
    ],
  );
  if (!participantError) {
    return CONTROL_SNAPSHOT_ABSENT_REPAIR_DETAIL;
  }
  const tableName = resolveControlSnapshotRepairFailureTableName(repair);
  return tableName ?
    `${tableName}${CONTROL_SNAPSHOT_REPAIR_FAILURE_DETAIL_SEPARATOR}` +
      participantError :
    participantError;
}
function resolveControlSnapshotRepairFailureDetail(repair = null) {
  const participantFailureDetail =
    resolveControlSnapshotRepairParticipantFailureDetail(repair);
  if (participantFailureDetail) {
    return participantFailureDetail;
  }
  const errorDetails = normalizeControlSnapshotRepairDetailList(
    repair?.errors,
  );
  return firstControlSnapshotRepairDetail(
    errorDetails[0],
    repair?.error,
  ) ||
    (
      repair?.skipped === true ?
        CONTROL_SNAPSHOT_REPAIR_FAILURE_SKIPPED_DETAIL :
        CONTROL_SNAPSHOT_REPAIR_FAILURE_NOT_APPLIED_DETAIL
    );
}
function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== 'object') {
    return false;
  }
  if (localQueryTransport.ready === true) {
    return true;
  }
  return (
    String(
      localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    ).toLowerCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.READY
  );
}
function isReadyLocalTransportDiagnostic(localTransport = null) {
  return isReadyLocalQueryTransportDiagnostic(localTransport);
}
function resolveAuthoritativeRepairTimeoutMs(options = {}) {
  return resolveAuthoritativeRepairQueryTimeoutMs({
    forceAuthoritativeRepair: options.forceAuthoritativeRepair,
    queryTimeoutMs: options[CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION],
  });
}
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }
  const activeProjection =
    options.repairEvaluation?.nodeCoverage?.activeProjection || null;
  snapshot.authoritativeRepair = {
    applied: options.repair?.applied === true,
    forced: options.forceAuthoritativeRepair === true,
    triggerCodes: Array.isArray(options.repairEvaluation?.triggerCodes) ?
      [...options.repairEvaluation.triggerCodes] :
      ADMIN_CACHE_DUMP.EMPTY,
    activeProjectionCoverageGap: activeProjection?.hasCoverageGap === true,
    activeProjectionMissingNodeIds: Array.isArray(
      activeProjection?.missingNodeIds,
    ) ?
      [...activeProjection.missingNodeIds] :
      ADMIN_CACHE_DUMP.EMPTY,
  };
  return snapshot;
}
const CONTROL_SNAPSHOT_SELECTED_TRANSPORT_CLOSED_REASON =
  'selected_transport_closed';
const CONTROL_SNAPSHOT_SELECTED_TIMEOUT_REASON = 'selected_timeout';
const CONTROL_SNAPSHOT_DEFERRED_REPAIR_TRIGGER_RULES = Object.freeze([
  Object.freeze({
    reasonCode: CONTROL_SNAPSHOT_SELECTED_TRANSPORT_CLOSED_REASON,
    matches: hasWebSocketClosedRepairCause,
  }),
  Object.freeze({
    reasonCode: CONTROL_SNAPSHOT_SELECTED_TIMEOUT_REASON,
    matches: hasPressureOrTimeoutRepairCause,
  }),
]);
function resolveControlSnapshotDeferredRepairTriggerCode(repair = null) {
  return CONTROL_SNAPSHOT_DEFERRED_REPAIR_TRIGGER_RULES.find((rule) =>
    rule.matches(repair),
  )?.reasonCode || null;
}
function appendControlSnapshotRepairEvaluationTriggerCode(
  evaluation = null,
  triggerCode = null,
) {
  if (
    !evaluation ||
    typeof evaluation !== 'object' ||
    typeof triggerCode !== 'string' ||
    triggerCode.length === 0
  ) {
    return evaluation;
  }
  const currentCodes = Array.isArray(evaluation.triggerCodes) ?
    evaluation.triggerCodes :
    ADMIN_CACHE_DUMP.EMPTY;
  if (currentCodes.includes(triggerCode)) {
    return evaluation;
  }
  return Object.freeze({
    ...evaluation,
    triggerCodes: Object.freeze([...currentCodes, triggerCode]),
  });
}
export {
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT,
  CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_METHOD,
  CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD,
  CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD,
  CONTROL_SNAPSHOT_REPAIR_REASON,
  CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION,
  appendControlSnapshotRepairEvaluationTriggerCode,
  attachAuthoritativeRepairDiagnostics,
  buildAuthoritativeControlSnapshotRepairFailure,
  buildRepairFailureLocalSnapshotOptions,
  hasDeferredRepairLocalControlSnapshotCoverage,
  hasForcedRepairDeferredFailureCause,
  hasOnlyLeaderResolutionGapRepairCause,
  hasPressureOrTimeoutRepairCause,
  isRecoverableControlSnapshotPublicationReadError,
  isReadyLocalTransportDiagnostic,
  resolveAuthoritativeRepairTimeoutMs,
  resolveControlSnapshotDeferredRepairTriggerCode,
  resolveControlSnapshotRepairFailureDetail,
  selectDeferredRepairLocalControlSnapshot,
  shouldAttemptForcedRepairFailureLocalFallback,
};
