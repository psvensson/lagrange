/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from './admin-constants.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {
  buildPublicationActiveGateOwnerOutcomeEnvelope,
  hasPublicationActiveGateOwnerReconcileSignal,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../control-plane/control-plane-error-classification.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
} from '../control-plane/owner-outcome-contract.js';
import {AdminControlSnapshotPart1} from './admin-control-snapshot-class-part-1.js';
// ── file-local constants ────────────────────────────────────────────────────
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
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
  'websocket was closed before the connection was established',
]);
const CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD =
  'publicationConvergence';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD =
  'activeGateOwnerCohort';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  'membershipPublicationHandoffOutcome';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE =
  Object.freeze({
    PUBLISHED_VISIBLE: 'published_visible',
    WRITE_DEFERRED: 'write_deferred',
  });
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD =
  Object.freeze({
    ENQUEUED: 'enqueued',
    PUBLICATION_ROW: 'publicationRow',
    RETRY_AFTER_MS: 'retryAfterMs',
    STATE: 'state',
  });
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  NEXT_ACTION: 'nextAction',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  REASON_CODE: 'reasonCode',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
  STATE: 'state',
});
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON =
  Object.freeze({
    OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
  });
const CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD =
  'controlPlaneConvergence';
const CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD =
  'criticalConvergenceDeferred';
const CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD =
  'ordinaryRepairDeferred';
const CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD = 'pressureOutcome';
const CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD = 'retryAfterMs';
const CONTROL_SNAPSHOT_NODES_FIELD = 'nodes';
const CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD = 'projectedNodes';
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
const CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK = Object.freeze({
  [OWNER_OUTCOME_STATE.FAILED]: NUM.ZERO,
  [OWNER_OUTCOME_STATE.BLOCKED]: NUM.ONE,
  [OWNER_OUTCOME_STATE.DEFERRED]: NUM.TWO,
  [OWNER_OUTCOME_STATE.PENDING]: NUM.THREE,
  [OWNER_OUTCOME_STATE.READY]: NUM.FOUR,
});
const CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK = Object.freeze({
  [OWNER_OUTCOME_FRESHNESS.UNKNOWN]: NUM.ZERO,
  [OWNER_OUTCOME_FRESHNESS.STALE]: NUM.ONE,
  [OWNER_OUTCOME_FRESHNESS.FRESH]: NUM.TWO,
});
const CONTROL_SNAPSHOT_REPAIR_DEFERRED_MIN_NODE_COVERAGE = NUM.THREE;
const CONTROL_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_DIVISOR = NUM.TWO;
function normalizeControlSnapshotNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : ADMIN_CACHE_DUMP.EMPTY)
      .map((value) =>
        typeof value === TYPEOF.STRING ?
          value.trim() :
          ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      )
      .filter((value) => value.length > NUM.ZERO),
  )].sort((left, right) => left.localeCompare(right));
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > NUM.ZERO &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE)
  );
}
function hasParticipantFailureRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.includes(
      AUTHORITATIVE_REPAIR_CAUSE_QUERY_PARTICIPANT_FAILURE,
    ) ||
    hasConnectionClosedParticipantRepairCause(repair) ||
    (
      repair?.firstFailedParticipant &&
      typeof repair.firstFailedParticipant === TYPEOF.OBJECT &&
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
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
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
      snapshot.controlPlaneDiagnostics?.activeNodeViews?.authoritativeNodeIds,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.controlPlaneDiagnostics?.activeNodeViews?.effectiveNodeIds,
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot.controlPlaneDiagnostics?.activeNodeViews?.locallyEligibleNodeIds,
    ),
    ...selectDeferredRepairProjectionNodeIds(repairEvaluation),
  ]);
  const totalKnownNodes = coverageNodeIds.length;
  if (totalKnownNodes === NUM.ZERO) {
    return CONTROL_SNAPSHOT_REPAIR_DEFERRED_MIN_NODE_COVERAGE;
  }
  const quorumCount = Math.floor(totalKnownNodes / NUM.TWO) + NUM.ONE;
  return Math.max(NUM.TWO, quorumCount);
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
function projectDeferredRepairCoverageSnapshot(
  snapshot = null,
  repairEvaluation = null,
) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  const coverageNodeIds = normalizeControlSnapshotNodeIdList([
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_NODES_FIELD],
    ),
    ...normalizeControlSnapshotNodeIdList(
      snapshot[CONTROL_SNAPSHOT_PROJECTED_NODES_FIELD],
    ),
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
  return normalizeControlSnapshotRepairMessageList(repair).some((message) =>
    message.includes('websocket') &&
    message.includes('closed'),
  );
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
    options.forceAuthoritativeRepair !== true ||
    !Number.isFinite(queryTimeoutMs) ||
    queryTimeoutMs <= NUM.ONE
  ) {
    return options.queryTimeoutMs;
  }
  return Math.max(
    NUM.ONE,
    Math.floor(
      queryTimeoutMs / CONTROL_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_DIVISOR,
    ),
  );
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
    message.length > NUM.ZERO &&
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
      typeof value === TYPEOF.STRING ?
        value.trim() :
        ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    )
    .filter((value) => value.length > NUM.ZERO);
}
function normalizeControlSnapshotRepairMessageList(repair = null) {
  const repairValue = typeof repair === TYPEOF.STRING ?
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
    if (typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO) {
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
  if (separatorIndex <= NUM.ZERO) {
    return null;
  }
  return normalizedDetail.slice(NUM.ZERO, separatorIndex);
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
    failedTables[NUM.ZERO],
    extractControlSnapshotRepairTableNameFromDetail(errorDetails[NUM.ZERO]),
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
    return null;
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
    errorDetails[NUM.ZERO],
    repair?.error,
  ) ||
    (
      repair?.skipped === true ?
        CONTROL_SNAPSHOT_REPAIR_FAILURE_SKIPPED_DETAIL :
        CONTROL_SNAPSHOT_REPAIR_FAILURE_NOT_APPLIED_DETAIL
    );
}
function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
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
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
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
function attachMembershipPublicationHandoffOutcome(snapshot, outcome) {
  if (
    !snapshot ||
    typeof snapshot !== TYPEOF.OBJECT ||
    !outcome ||
    typeof outcome !== TYPEOF.OBJECT
  ) {
    return snapshot;
  }
  const controlPlaneDiagnostics =
    snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] &&
      typeof snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] ===
        TYPEOF.OBJECT ?
      snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] :
      {};
  const activeGateOwnerCohort =
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD] &&
      typeof controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
      ] === TYPEOF.OBJECT ?
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
      ] :
      {};
  const publicationConvergence =
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD] &&
      typeof controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
      ] === TYPEOF.OBJECT &&
      !Array.isArray(
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ],
      ) ?
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
      ] :
      null;
  const controlPlaneConvergence =
    outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] &&
      typeof outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] ===
        TYPEOF.OBJECT ?
      outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD] :
      null;
  const pressureOutcome =
    typeof controlPlaneConvergence?.[
      CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD
    ] === TYPEOF.STRING ?
      controlPlaneConvergence[CONTROL_SNAPSHOT_PRESSURE_OUTCOME_FIELD] :
      outcome.controlPlanePressureOutcome;
  const criticalConvergenceDeferred =
    pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_DEFERRED ||
    pressureOutcome ===
      CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED;
  snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] = {
    ...controlPlaneDiagnostics,
    [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
      outcome,
    ...(controlPlaneConvergence ?
      {
        [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
          controlPlaneConvergence,
        [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
          criticalConvergenceDeferred,
        [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
      } :
      {}),
    ...(publicationConvergence ?
      {
        [CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD]: {
          ...publicationConvergence,
          [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
            outcome,
          ...(controlPlaneConvergence ?
            {
              [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
                controlPlaneConvergence,
              [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
                criticalConvergenceDeferred,
              [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
            } :
            {}),
        },
      } :
      {}),
    [CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD]: {
      ...activeGateOwnerCohort,
      [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
        outcome,
      ...(controlPlaneConvergence ?
        {
          [CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]:
            controlPlaneConvergence,
          [CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD]:
            criticalConvergenceDeferred,
          [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]: false,
        } :
        {}),
    },
  };
  return snapshot;
}

function selectMembershipPublicationHandoffOutcome(snapshot = null) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (
    !controlPlaneDiagnostics ||
    typeof controlPlaneDiagnostics !== TYPEOF.OBJECT ||
    Array.isArray(controlPlaneDiagnostics)
  ) {
    return null;
  }
  const outcomeCandidates = [
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
    ],
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
    ]?.[CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD],
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
    ]?.[CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD],
  ];
  return outcomeCandidates.find((candidate) =>
    candidate &&
    typeof candidate === TYPEOF.OBJECT &&
    !Array.isArray(candidate),
  ) || null;
}

function isVisibleMembershipPublicationHandoffOutcome(outcome = null) {
  return (
    outcome &&
    typeof outcome === TYPEOF.OBJECT &&
    !Array.isArray(outcome) &&
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD.STATE
    ] ===
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .PUBLISHED_VISIBLE &&
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .PUBLICATION_ROW
    ] &&
    typeof outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .PUBLICATION_ROW
    ] === TYPEOF.OBJECT &&
    !Array.isArray(
      outcome[
        CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
          .PUBLICATION_ROW
      ],
    )
  );
}

function normalizeControlSnapshotRetryAfterMs(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > NUM.ZERO ?
    Math.floor(numericValue) :
    null;
}

function selectMembershipPublicationHandoffRetryAfterMs(snapshot = null) {
  const outcome = selectMembershipPublicationHandoffOutcome(snapshot);
  if (
    !outcome ||
    typeof outcome !== TYPEOF.OBJECT ||
    Array.isArray(outcome) ||
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD.STATE
    ] !==
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE
        .WRITE_DEFERRED ||
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .ENQUEUED
    ] !== false
  ) {
    return null;
  }
  return normalizeControlSnapshotRetryAfterMs(
    outcome[
      CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_DATA_FIELD
        .RETRY_AFTER_MS
    ],
  ) ||
    normalizeControlSnapshotRetryAfterMs(
      outcome[CONTROL_SNAPSHOT_CONTROL_PLANE_CONVERGENCE_FIELD]?.[
        CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD
      ],
    );
}

function buildControlSnapshotHandoffRetryOptions(
  snapshot = null,
  options = {},
) {
  const retryAfterMs =
    selectMembershipPublicationHandoffRetryAfterMs(snapshot);
  if (retryAfterMs === null) {
    return options;
  }
  const repair =
    options.repair &&
      typeof options.repair === TYPEOF.OBJECT &&
      !Array.isArray(options.repair) ?
      {
        ...options.repair,
        [CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD]: retryAfterMs,
      } :
      null;
  return {
    ...options,
    [CONTROL_SNAPSHOT_RETRY_AFTER_MS_FIELD]: retryAfterMs,
    ...(repair ? {repair} : {}),
  };
}

function buildControlSnapshotHandoffProgressOptions(options = {}) {
  return options.forceAuthoritativeRepair === true ?
    {
      ...options,
      forceAuthoritativeRepair: false,
    } :
    options;
}

function buildControlSnapshotHandoffDeferredOptions(
  snapshot = null,
  options = {},
) {
  const retryOptions = buildControlSnapshotHandoffRetryOptions(
    snapshot,
    options,
  );
  if (retryOptions === options) {
    return options;
  }
  return {
    ...retryOptions,
    observationMode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
    repairAttempted: true,
    repairDeferred: true,
  };
}

function resolveControlSnapshotCoverageNodeCount(snapshot = null) {
  const nodeIds = snapshot?.[CONTROL_SNAPSHOT_NODES_FIELD];
  return Array.isArray(nodeIds) ? nodeIds.length : NUM.ZERO;
}

function buildControlSnapshotHandoffRefreshResult(snapshot, refreshed) {
  return Object.freeze({
    snapshot,
    refreshed,
  });
}

function normalizeControlSnapshotHandoffText(value) {
  return typeof value === TYPEOF.STRING ?
    value.trim() :
    ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE;
}

function normalizeControlSnapshotHandoffInteger(value, fallback = NUM.ZERO) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ?
    Math.max(NUM.ZERO, Math.floor(numericValue)) :
    fallback;
}

function normalizeControlSnapshotHandoffOwnerOutcomeRevision(value) {
  if (Number.isFinite(value)) {
    return Math.max(NUM.ZERO, Math.floor(value));
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ?
    Math.max(NUM.ZERO, Math.floor(numericValue)) :
    NUM.ZERO;
}

function resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
  state = ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
) {
  return Number.isFinite(
    CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK[state],
  ) ?
    CONTROL_SNAPSHOT_OWNER_OUTCOME_STATE_PROGRESS_RANK[state] :
    NUM.ZERO;
}

function resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
  freshness = ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
) {
  return Number.isFinite(
    CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK[freshness],
  ) ?
    CONTROL_SNAPSHOT_OWNER_OUTCOME_FRESHNESS_PROGRESS_RANK[freshness] :
    NUM.ZERO;
}

function hasControlSnapshotHandoffOwnerOutcomeProgress(
  currentOutcome = null,
  refreshedOutcome = null,
) {
  const currentStateRank =
    resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
      currentOutcome?.state,
    );
  const refreshedStateRank =
    resolveControlSnapshotHandoffOwnerOutcomeStateProgressRank(
      refreshedOutcome?.state,
    );
  if (refreshedStateRank > currentStateRank) {
    return true;
  }
  const currentFreshnessRank =
    resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
      currentOutcome?.freshness,
    );
  const refreshedFreshnessRank =
    resolveControlSnapshotHandoffOwnerOutcomeFreshnessProgressRank(
      refreshedOutcome?.freshness,
    );
  if (refreshedFreshnessRank > currentFreshnessRank) {
    return true;
  }
  return normalizeControlSnapshotHandoffOwnerOutcomeRevision(
    refreshedOutcome?.revision,
  ) >
    normalizeControlSnapshotHandoffOwnerOutcomeRevision(
      currentOutcome?.revision,
    );
}

function selectControlSnapshotHandoffEvidence(snapshot = null) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  const handoff = selectPublicationActiveGateHandoffContract(
    controlPlaneDiagnostics,
  );
  const ownerOutcome =
    buildPublicationActiveGateOwnerOutcomeEnvelope(controlPlaneDiagnostics);
  const hasHandoff =
    handoff &&
    typeof handoff === TYPEOF.OBJECT &&
    !Array.isArray(handoff);
  const pendingReconcileNodeIds = hasHandoff ?
    normalizeControlSnapshotNodeIdList(
      handoff[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECONCILE_NODE_IDS
      ],
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return Object.freeze({
    available: hasHandoff === true,
    state: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE
      ],
    ),
    reasonCode: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE
      ],
    ),
    nextAction: normalizeControlSnapshotHandoffText(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_ACTION
      ],
    ),
    runtimePromotionAllowed:
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .RUNTIME_PROMOTION_ALLOWED
      ] === true,
    pendingReconcileCount: normalizeControlSnapshotHandoffInteger(
      handoff?.[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECONCILE_COUNT
      ],
      pendingReconcileNodeIds.length,
    ),
    ownerOutcome,
    pendingReconcileNodeIds,
  });
}

function buildControlSnapshotHandoffProgressComparison(
  snapshot = null,
  refreshedSnapshot = null,
) {
  const current = selectControlSnapshotHandoffEvidence(snapshot);
  const refreshed = selectControlSnapshotHandoffEvidence(refreshedSnapshot);
  const comparable = current.available === true && refreshed.available === true;
  const ownerOutcomeProgressed =
    hasControlSnapshotHandoffOwnerOutcomeProgress(
      current.ownerOutcome,
      refreshed.ownerOutcome,
    );
  const progressSignals = Object.freeze({
    ownerOutcomeProgressed,
    pendingReconcileCountDecreased:
      comparable &&
      refreshed.pendingReconcileCount < current.pendingReconcileCount,
    pendingReconcileNodeIdsDecreased:
      comparable &&
      refreshed.pendingReconcileNodeIds.length <
        current.pendingReconcileNodeIds.length,
    ownerReconcilePendingChanged:
      comparable &&
      current.reasonCode ===
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
          .OWNER_RECONCILE_PENDING &&
      (
        refreshed.reasonCode !== current.reasonCode ||
        refreshed.state !== current.state ||
        refreshed.nextAction !== current.nextAction
      ),
    runtimePromotionAllowed:
      comparable &&
      current.runtimePromotionAllowed !== true &&
      refreshed.runtimePromotionAllowed === true,
  });
  return Object.freeze({
    current,
    refreshed,
    progressSignals,
    handoffProgressed: ownerOutcomeProgressed,
  });
}

function buildControlSnapshotHandoffRefreshDecision(
  snapshot = null,
  refreshedSnapshot = null,
) {
  const handoffComparison =
    buildControlSnapshotHandoffProgressComparison(snapshot, refreshedSnapshot);
  const decisionSignals = Object.freeze({
    coverageIncreased:
      handoffComparison.handoffProgressed === true &&
      resolveControlSnapshotCoverageNodeCount(refreshedSnapshot) >
        resolveControlSnapshotCoverageNodeCount(snapshot),
    ownerOutcomeProgressed: handoffComparison.handoffProgressed === true,
  });
  return Object.freeze({
    refreshed: decisionSignals.ownerOutcomeProgressed === true,
    decisionSignals,
    handoffComparison,
  });
}

function attachOrdinaryRepairDeferralDiagnostics(snapshot, repairDeferred) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  const controlPlaneDiagnostics =
    snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] &&
      typeof snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] ===
        TYPEOF.OBJECT ?
      snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] :
      {};
  const criticalConvergenceDeferred =
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_CRITICAL_CONVERGENCE_DEFERRED_FIELD
    ] === true;
  const ordinaryRepairDeferred =
    repairDeferred === true ||
    (
      criticalConvergenceDeferred !== true &&
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD
      ] === true
    );
  snapshot[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD] = {
    ...controlPlaneDiagnostics,
    [CONTROL_SNAPSHOT_ORDINARY_REPAIR_DEFERRED_FIELD]:
      ordinaryRepairDeferred,
  };
  return snapshot;
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart2 extends AdminControlSnapshotPart1 {
  async buildForcedRepairFailureLocalFallbackSnapshot(options = {}) {
    try {
      return await this.buildLocalControlSnapshot(
        buildRepairFailureLocalSnapshotOptions(options),
      );
    } catch (_error) {
      return null;
    }
  }

  async resolveForcedRepairFailureDeferredSnapshot(
    localSnapshot = null,
    options = {},
  ) {
    if (
      shouldAttemptForcedRepairFailureLocalFallback({
        forceAuthoritativeRepair: options.forceAuthoritativeRepair,
        repair: options.repair,
      }) !== true
    ) {
      return null;
    }
    let deferredSnapshot = selectDeferredRepairLocalControlSnapshot(
      localSnapshot,
      options.repairEvaluation,
    );
    if (!deferredSnapshot) {
      const fallbackSnapshot =
        await this.buildForcedRepairFailureLocalFallbackSnapshot(options);
      const fallbackEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(fallbackSnapshot, options);
      deferredSnapshot =
        selectDeferredRepairLocalControlSnapshot(
          fallbackSnapshot,
          fallbackEvaluation,
        );
    }
    if (!deferredSnapshot) {
      return null;
    }
    const deferredEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(deferredSnapshot, options);
    let finalEvaluation = deferredEvaluation;
    if (hasWebSocketClosedRepairCause(options.repair)) {
      const currentCodes = Array.isArray(deferredEvaluation?.triggerCodes) ?
        deferredEvaluation.triggerCodes :
        [];
      if (!currentCodes.includes('selected_transport_closed')) {
        finalEvaluation = Object.freeze({
          ...deferredEvaluation,
          triggerCodes: Object.freeze([...currentCodes, 'selected_transport_closed']),
        });
      }
    }
    const triggeredSnapshot =
      await this.triggerMembershipPublicationHandoffOwnerCommand(
        attachOrdinaryRepairDeferralDiagnostics(
          deferredSnapshot,
          true,
        ),
        options,
      );
    const handoffRefresh =
      await this.prepareVisibleMembershipPublicationHandoffRefresh(
        triggeredSnapshot,
        options,
      );
    return this.resolveSharedControlSnapshot(
      handoffRefresh.refreshed === true ?
        handoffRefresh.snapshot :
        attachOrdinaryRepairDeferralDiagnostics(
          handoffRefresh.snapshot,
          true,
        ),
      handoffRefresh.refreshed === true ?
        buildControlSnapshotHandoffProgressOptions(options) :
        buildControlSnapshotHandoffRetryOptions(
          handoffRefresh.snapshot,
          {
            ...options,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repairEvaluation: finalEvaluation,
            repairAttempted: true,
            repairDeferred: true,
            retryAfterMs: options.repair?.retryAfterMs,
          },
        ),
    );
  }

  async prepareVisibleMembershipPublicationHandoffRefresh(
    snapshot = null,
    options = {},
  ) {
    const outcome = selectMembershipPublicationHandoffOutcome(snapshot);
    if (isVisibleMembershipPublicationHandoffOutcome(outcome) !== true) {
      return buildControlSnapshotHandoffRefreshResult(snapshot, false);
    }
    const controlPlaneDiagnostics =
      snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
    const publicationActiveGateHandoff =
      selectPublicationActiveGateHandoffContract(controlPlaneDiagnostics) ||
      options[
        CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
      ];
    let refreshedSnapshot = null;
    try {
      refreshedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .PREFER_AUTHORITATIVE_PUBLICATION_READ]: true,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .ALLOW_AUTHORITATIVE_READINESS_REFRESH]: false,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .RECONCILE_AUTHORITATIVE_MEMBERSHIP_PUBLICATION]: false,
        ...(publicationActiveGateHandoff ?
          {
            [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
              .PUBLICATION_ACTIVE_GATE_HANDOFF]: publicationActiveGateHandoff,
          } :
          {}),
      });
    } catch (_error) {
      return buildControlSnapshotHandoffRefreshResult(snapshot, false);
    }
    const refreshedWithOutcome =
      attachMembershipPublicationHandoffOutcome(refreshedSnapshot, outcome);
    const refreshDecision = buildControlSnapshotHandoffRefreshDecision(
      snapshot,
      refreshedWithOutcome,
    );
    return buildControlSnapshotHandoffRefreshResult(
      refreshDecision.refreshed === true ? refreshedWithOutcome : snapshot,
      refreshDecision.refreshed,
    );
  }

  async triggerMembershipPublicationHandoffOwnerCommand(
    snapshot = null,
    options = {},
  ) {
    const controlPlaneDiagnostics =
      snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
    if (
      hasPublicationActiveGateOwnerReconcileSignal(
        controlPlaneDiagnostics,
      ) !== true ||
      typeof this.reconcileAuthoritativeMembershipPublicationFromHandoff !==
        TYPEOF.FUNCTION
    ) {
      return snapshot;
    }
    const publicationActiveGateHandoff =
      selectPublicationActiveGateHandoffContract(controlPlaneDiagnostics) ||
      controlPlaneDiagnostics;
    try {
      const outcome =
        await this.reconcileAuthoritativeMembershipPublicationFromHandoff(
          publicationActiveGateHandoff,
          {
            ...options,
            reconcileAuthoritativeMembershipPublication: true,
          },
        );
      return attachMembershipPublicationHandoffOutcome(snapshot, outcome);
    } catch (_error) {
      const failureOutcome =
        typeof this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome ===
          TYPEOF.FUNCTION ?
          this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome(
            _error,
            publicationActiveGateHandoff,
          ) :
          null;
      return attachMembershipPublicationHandoffOutcome(
        snapshot,
        failureOutcome,
      );
    }
  }

  /**
   * Resolve one local control snapshot with optional authoritative
   * cache repair when partition topology appears incomplete.
   * @return {Promise<Object>}
   */
  async resolveLocalControlSnapshot(options = {}) {
    const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair = options.allowAuthoritativeRepair === true;
    let snapshot = null;
    try {
      snapshot = await this.buildLocalControlSnapshot(options);
    } catch (error) {
      if (
        !forceAuthoritativeRepair ||
        !this.canRunAuthoritativeControlSnapshotRepair() ||
        !isRecoverableControlSnapshotPublicationReadError(error)
      ) {
        throw error;
      }
      let repair = null;
      try {
        repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
          reason: CONTROL_SNAPSHOT_REPAIR_REASON,
          bypassReuse: true,
          queryTimeoutMs: resolveAuthoritativeRepairQueryTimeoutMs({
            forceAuthoritativeRepair,
            queryTimeoutMs: options.queryTimeoutMs,
          }),
        });
      } catch (repairError) {
        const forcedRepairDeferredSnapshot =
          await this.resolveForcedRepairFailureDeferredSnapshot(null, {
            ...options,
            forceAuthoritativeRepair,
            repair: repairError,
          });
        if (forcedRepairDeferredSnapshot) {
          return forcedRepairDeferredSnapshot;
        }
        throw buildAuthoritativeControlSnapshotRepairFailure(
          repairError?.message || repairError,
          repairError,
        );
      }
      if (repair?.applied !== true) {
        const forcedRepairDeferredSnapshot =
          await this.resolveForcedRepairFailureDeferredSnapshot(null, {
            ...options,
            forceAuthoritativeRepair,
            repair,
          });
        if (forcedRepairDeferredSnapshot) {
          return forcedRepairDeferredSnapshot;
        }
        throw buildAuthoritativeControlSnapshotRepairFailure(
          resolveControlSnapshotRepairFailureDetail(repair),
          repair,
        );
      }
      const repairedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
        reconcileAuthoritativeMembershipPublication: true,
      });
      const repairedEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot, options);
      return this.resolveSharedControlSnapshot(
        attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
          repair,
          repairEvaluation: repairedEvaluation,
          forceAuthoritativeRepair,
        }),
        {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR,
          repair,
          repairEvaluation: repairedEvaluation,
        },
      );
    }
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot, options);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      const handoffRefresh =
        await this.prepareVisibleMembershipPublicationHandoffRefresh(
          triggeredSnapshot,
          options,
        );
      const deferredHandoffOptions =
        buildControlSnapshotHandoffDeferredOptions(
          handoffRefresh.snapshot,
          options,
        );
      return this.resolveSharedControlSnapshot(
        handoffRefresh.snapshot,
        deferredHandoffOptions,
      );
    }
    if (
      forceAuthoritativeRepair !== true &&
      !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair,
      })
    ) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      const handoffRefresh =
        await this.prepareVisibleMembershipPublicationHandoffRefresh(
          triggeredSnapshot,
          options,
        );
      const deferredHandoffOptions =
        buildControlSnapshotHandoffDeferredOptions(
          handoffRefresh.snapshot,
          options,
        );
      const shouldEmitDeferredObservation =
        deferredHandoffOptions !== options ||
        repairEvaluation?.shouldRepair === true;
      const sharedSnapshotOptions = handoffRefresh.refreshed === true ?
        options :
        (shouldEmitDeferredObservation ?
          {
            ...deferredHandoffOptions,
            repairEvaluation,
            repairDeferred: true,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          } :
          options);
      return this.resolveSharedControlSnapshot(
        handoffRefresh.refreshed === true ?
          handoffRefresh.snapshot :
          attachOrdinaryRepairDeferralDiagnostics(
            handoffRefresh.snapshot,
            repairEvaluation?.shouldRepair === true,
          ),
        sharedSnapshotOptions,
      );
    }
    const canDegradeRepairFailure =
      this.canDegradeAuthoritativeControlSnapshotRepairFailure({
        forceAuthoritativeRepair,
        repairEvaluation,
      });
    let repair = null;
    try {
      repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: CONTROL_SNAPSHOT_REPAIR_REASON,
        bypassReuse: forceAuthoritativeRepair,
        queryTimeoutMs: resolveAuthoritativeRepairQueryTimeoutMs({
          forceAuthoritativeRepair,
          queryTimeoutMs: options.queryTimeoutMs,
        }),
        triggerCodes: repairEvaluation?.triggerCodes,
      });
    } catch (error) {
      const canDegradeThrownRepairFailure =
        canDegradeRepairFailure === true ||
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          localSnapshot: snapshot,
          repair: error,
          repairEvaluation,
        });
      const forcedRepairDeferredSnapshot =
        await this.resolveForcedRepairFailureDeferredSnapshot(snapshot, {
          ...options,
          forceAuthoritativeRepair,
          repair: error,
          repairEvaluation,
        });
      if (forcedRepairDeferredSnapshot) {
        return forcedRepairDeferredSnapshot;
      }
      if (canDegradeThrownRepairFailure) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        const handoffRefresh =
          await this.prepareVisibleMembershipPublicationHandoffRefresh(
            triggeredSnapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          handoffRefresh.refreshed === true ?
            handoffRefresh.snapshot :
            attachOrdinaryRepairDeferralDiagnostics(
              handoffRefresh.snapshot,
              true,
            ),
          handoffRefresh.refreshed === true ?
            buildControlSnapshotHandoffProgressOptions(options) :
            buildControlSnapshotHandoffRetryOptions(
              handoffRefresh.snapshot,
              {
                ...options,
                observationMode:
                  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
                repairEvaluation,
                repairAttempted: true,
                repairDeferred: true,
                retryAfterMs: error?.retryAfterMs,
              },
            ),
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        error?.message || error || ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR,
        error,
      );
    }
    if (repair?.applied !== true) {
      const forcedRepairDeferredSnapshot =
        await this.resolveForcedRepairFailureDeferredSnapshot(snapshot, {
          ...options,
          forceAuthoritativeRepair,
          repair,
          repairEvaluation,
        });
      if (forcedRepairDeferredSnapshot) {
        return forcedRepairDeferredSnapshot;
      }
      const canDegradeUnappliedRepair =
        canDegradeRepairFailure === true ||
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          localSnapshot: snapshot,
          repairEvaluation,
          repair,
        });
      if (canDegradeUnappliedRepair) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        const handoffRefresh =
          await this.prepareVisibleMembershipPublicationHandoffRefresh(
            triggeredSnapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          handoffRefresh.refreshed === true ?
            handoffRefresh.snapshot :
            attachOrdinaryRepairDeferralDiagnostics(
              handoffRefresh.snapshot,
              true,
            ),
          handoffRefresh.refreshed === true ?
            buildControlSnapshotHandoffProgressOptions(options) :
            buildControlSnapshotHandoffRetryOptions(
              handoffRefresh.snapshot,
              {
                ...options,
                observationMode:
                  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
                repair,
                repairEvaluation,
                repairAttempted: true,
                repairDeferred: true,
              },
            ),
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        resolveControlSnapshotRepairFailureDetail(repair),
        repair,
      );
    }
    const repairedSnapshot = await this.buildLocalControlSnapshot({
      ...options,
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot, options);
    return this.resolveSharedControlSnapshot(
      attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair,
      }),
      {
        ...options,
        observationMode: forceAuthoritativeRepair ?
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR :
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR,
        repair,
        repairEvaluation: repairedEvaluation,
      },
    );
  }
  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (
      options.forceAuthoritativeRepair === true &&
      hasForcedRepairDeferredFailureCause(options.repair) &&
      hasDeferredRepairLocalControlSnapshotCoverage(
        options.localSnapshot,
        options.repairEvaluation,
      )
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasOnlyLeaderResolutionGapRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasPressureOrTimeoutRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      hasAuthoritativeRepairTrigger(
        options.repairEvaluation,
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ) ||
      options.repairEvaluation?.nodeCoverage?.activeProjection
        ?.hasCoverageGap === true
    ) {
      return false;
    }
    if (isReplicaOperationsOnlyRepairScope(options.repairEvaluation)) {
      return true;
    }
    const failedTables = Array.isArray(options.repair?.failedTables) ?
      options.repair.failedTables.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ) :
      ADMIN_CACHE_DUMP.EMPTY;
    return isReplicaOperationsOnlyTableSet(failedTables);
  }
  resolveControlSnapshotActiveNodeIds(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    return this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRows,
    ).authoritativeActiveNodeIds;
  }
}
export {AdminControlSnapshotPart2};
