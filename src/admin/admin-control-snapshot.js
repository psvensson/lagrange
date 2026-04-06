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

import {
  COLUMN,
  NUM,
  TABLES,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from '../partition/partition-constants.js';
import {isLoadReadyReplicaRaftRole} from
  '../node/replica-state-machine-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../control-plane/control-plane-readiness-constants.js';
import {
  evaluateAuthoritativeRepairPolicy,
} from
  './admin-authoritative-repair-policy.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from
  './admin-authoritative-repair-policy.js';
import {summarizeReplicaOperationLiveness} from
  '../rebalancer/replica-operation-liveness.js';
import {
  TERMINAL_STATUSES as REPLICA_OPERATION_TERMINAL_STATUSES,
} from '../rebalancer/replica-status.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {
  filterActiveServingPartitionRows,
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {
  resolveActiveNodeViews,
  buildReadinessByNodeId,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
} from '../control-plane/active-node-projection.js';
import {
  normalizeControlPlanePublicationRow,
} from '../control-plane/system-row-normalizers.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {evaluateSharedMetadataNodeCoverage} from
  './admin-shared-metadata-consistency.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {LogsTableService} from '../logging/logs-table-service.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';

// ── file-local constants ────────────────────────────────────────────────────
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_STATE_NORMAL = 'NORMAL';
const PARTITION_STATE_UNKNOWN = 'unknown';
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT = 64;
const CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS = 5000;
const MANAGED_SPLIT_WORKFLOW_TYPE = 'managed_split';
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});
const CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT = 5;
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  'leader_resolution_gap';
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION = 1;
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = 'partition';
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = 'learner';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = 'operation_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID = 'entity_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE = 'entity_type';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP = 'workflow_step';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID = 'target_node_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID = 'source_node_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID = 'replica_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = 'created_at';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = 'updated_at';
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = 'raft_role';
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = 'node_id';
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE =
  'not_control_plane_recovery_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY =
  'recovery_eligible_not_repair_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS =
  'readiness_unknown';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP = 'priority_spread_gap';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING =
  'priority_partition_missing';
const PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED =
  'recovery_eligible_projection_included';
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED =
  'readiness_projection_excluded';
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY =
  'cluster_member_unhealthy';
const PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET = new Set(
  REPLICA_OPERATION_TERMINAL_STATUSES.map((status) =>
    String(status || '').toLowerCase(),
  ),
);

/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function toNonNegativeInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < NUM.ZERO) {
    return NUM.ZERO;
  }
  return Math.floor(parsedValue);
}

function buildLogsTableRetentionDiagnostics() {
  const stats = LogsTableService.instance &&
    typeof LogsTableService.instance.getStats === TYPEOF.FUNCTION ?
    LogsTableService.instance.getStats() :
    null;
  if (!stats || typeof stats !== TYPEOF.OBJECT) {
    return null;
  }
  return {
    pendingWrites: toNonNegativeInteger(stats.pendingWrites),
    pendingWriteGrowthCount:
      toNonNegativeInteger(stats.pendingWriteGrowthCount),
    retainedBacklogGrowthCount:
      toNonNegativeInteger(stats.retainedBacklogGrowthCount),
    retainedPressureBacklogCap:
      toNonNegativeInteger(stats.retainedPressureBacklogCap),
    maxPendingWrites: toNonNegativeInteger(stats.maxPendingWrites),
    isWriting: stats.isWriting === true,
    consecutiveDeferredWriteFailures:
      toNonNegativeInteger(stats.consecutiveDeferredWriteFailures),
    sharedPressureBackpressured:
      stats.sharedPressureBackpressured === true,
  };
}

function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter((value) =>
      typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return causeChain.length > NUM.ZERO &&
    causeChain.every((value) =>
      value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    );
}

function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.length > NUM.ZERO &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS
      .some((fragment) => message.includes(fragment));
}

function buildAuthoritativeControlSnapshotRepairFailure(
  detail,
  cause = null,
) {
  const error = new Error(
    'Authoritative control snapshot repair failed: ' +
    String(detail || 'unknown_error'),
  );
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
    return false;
  }
  if (localQueryTransport.ready === true) {
    return true;
  }
  return String(localQueryTransport.state || '').toLowerCase() === 'ready';
}

function buildCdcReplayRetentionDiagnostics(partitionServices) {
  if (!(partitionServices instanceof Map) || partitionServices.size === NUM.ZERO) {
    return null;
  }

  const entries = [];
  for (const partitionService of partitionServices.values()) {
    if (!partitionService ||
        typeof partitionService.getStats !== TYPEOF.FUNCTION) {
      continue;
    }
    const stats = partitionService.getStats();
    const replay = stats?.cdcReplay &&
      typeof stats.cdcReplay === TYPEOF.OBJECT ?
      stats.cdcReplay :
      null;
    if (!replay) {
      continue;
    }
    entries.push({
      partitionId: String(stats?.partitionId || ''),
      bufferedEvents: toNonNegativeInteger(replay.bufferedEvents),
      replayBufferGrowthCount:
        toNonNegativeInteger(replay.replayBufferGrowthCount),
      replayRetryDepth: toNonNegativeInteger(replay.replayRetryDepth),
      replayInFlight: replay.replayInFlight === true,
    });
  }

  if (entries.length === NUM.ZERO) {
    return null;
  }

  entries.sort((left, right) => {
    const leftPressureScore =
      left.bufferedEvents + left.replayBufferGrowthCount + left.replayRetryDepth;
    const rightPressureScore =
      right.bufferedEvents + right.replayBufferGrowthCount + right.replayRetryDepth;
    if (leftPressureScore !== rightPressureScore) {
      return rightPressureScore - leftPressureScore;
    }
    return left.partitionId.localeCompare(right.partitionId);
  });

  const byPartitionId = {};
  let bufferedEvents = NUM.ZERO;
  let replayBufferGrowthCount = NUM.ZERO;
  let replayRetryDepth = NUM.ZERO;
  for (const entry of entries) {
    bufferedEvents += entry.bufferedEvents;
    replayBufferGrowthCount += entry.replayBufferGrowthCount;
    replayRetryDepth = Math.max(replayRetryDepth, entry.replayRetryDepth);
  }
  for (const entry of entries.slice(NUM.ZERO,
    CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT)) {
    byPartitionId[entry.partitionId] = entry;
  }

  return {
    bufferedEvents,
    replayBufferGrowthCount,
    replayRetryDepth,
    partitionCount: entries.length,
    replayInFlightPartitionCount:
      entries.filter((entry) => entry.replayInFlight).length,
    byPartitionId,
  };
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
    activeProjectionCoverageGap:
      activeProjection?.hasCoverageGap === true,
    activeProjectionMissingNodeIds: Array.isArray(
      activeProjection?.missingNodeIds,
    ) ?
      [...activeProjection.missingNodeIds] :
      ADMIN_CACHE_DUMP.EMPTY,
  };
  return snapshot;
}

function resolvePublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return NUM.ZERO;
}

function isMembershipPublicationRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  const publicationKind = String(normalizedRow.publicationKind || '').toLowerCase();
  return publicationKind.length === NUM.ZERO ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND;
}

function resolveLatestMembershipPublicationRow(
  publicationRows = [],
  options = {},
) {
  const expectedStatus = typeof options.status === TYPEOF.STRING ?
    options.status.toUpperCase() :
    null;
  const normalizedRows = (Array.isArray(publicationRows) ? publicationRows : [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .filter((row) => isMembershipPublicationRow(row))
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(
        row.publicationId ||
        row.publicationEpoch ||
        row.status ||
        (Array.isArray(row.publishedActiveNodeIds) &&
          row.publishedActiveNodeIds.length > NUM.ZERO),
      );
    });
  if (normalizedRows.length === NUM.ZERO) {
    return null;
  }
  normalizedRows.sort((left, right) => {
    const publicationEpochDelta =
      resolvePublicationOrderingValue(
        right,
        ['publicationEpoch', 'publication_epoch'],
      ) -
      resolvePublicationOrderingValue(
        left,
        ['publicationEpoch', 'publication_epoch'],
      );
    if (publicationEpochDelta !== NUM.ZERO) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      resolvePublicationOrderingValue(
        right,
        ['publishedAt', 'published_at'],
      ) -
      resolvePublicationOrderingValue(
        left,
        ['publishedAt', 'published_at'],
      );
    if (publishedAtDelta !== NUM.ZERO) {
      return publishedAtDelta;
    }
    return resolvePublicationOrderingValue(
      right,
      ['updatedAt', 'updated_at'],
    ) -
      resolvePublicationOrderingValue(
        left,
        ['updatedAt', 'updated_at'],
      );
  });
  return normalizedRows[NUM.ZERO] || null;
}

function normalizePriorityRecoveryInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function normalizePriorityRecoveryStringList(values = []) {
  return uniqueSorted(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > NUM.ZERO),
  );
}

function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || '');
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const partitionSuffixIndex = normalizedPartitionId.lastIndexOf('-p');
  if (partitionSuffixIndex <= NUM.ZERO) {
    return normalizedPartitionId;
  }
  const suffix = normalizedPartitionId.slice(partitionSuffixIndex + 2);
  if (!/^\d+$/.test(suffix)) {
    return normalizedPartitionId;
  }
  return normalizedPartitionId.slice(NUM.ZERO, partitionSuffixIndex);
}

function buildPriorityRecoveryCorrelationKey(partitionId, epoch, operationId) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const normalizedEpoch = Number.isInteger(epoch) ?
    String(epoch) :
    PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId =
    typeof operationId === TYPEOF.STRING && operationId.length > NUM.ZERO ?
      operationId :
      PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
  return [
    normalizedPartitionId,
    normalizedEpoch,
    normalizedOperationId,
  ].join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
}

function buildPriorityRecoverySemanticPartitionSetMap() {
  const partitionSetsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionSetsBySemanticState[semanticState] = new Set();
  }
  return partitionSetsBySemanticState;
}

function resolvePriorityRecoverySemanticState(options = {}) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    options.blockerReasons,
  );
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
  }

  if (options.plannerReady === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (options.hasActiveOperationContexts === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  const reasons = Array.isArray(readinessEntry?.reasons) ?
    readinessEntry.reasons :
    [];
  return normalizePriorityRecoveryStringList(reasons.map((reason) =>
    String(reason?.code || '').trim(),
  ));
}

function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
      typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      priorityPartitionSummary :
      null;
  const blockedPartitions = Array.isArray(normalizedSummary?.blockedPartitions) ?
    normalizedSummary.blockedPartitions :
    [];
  const missingPartitionIds = normalizePriorityRecoveryStringList(
    normalizedSummary?.missingPartitionIds,
  );
  const plannerByPartitionId = {};

  for (const partition of blockedPartitions) {
    const partitionId = String(partition?.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const spreadGap = Math.max(
      NUM.ZERO,
      normalizePriorityRecoveryInteger(partition?.spreadGap) || NUM.ZERO,
    );
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount:
        normalizePriorityRecoveryInteger(partition?.requiredDistinctNodeCount),
      readyDistinctNodeCount:
        normalizePriorityRecoveryInteger(partition?.readyDistinctNodeCount),
      spreadGap,
      ready: spreadGap === NUM.ZERO,
      reasons: spreadGap > NUM.ZERO ?
        [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP] :
        [],
    };
  }

  for (const partitionId of missingPartitionIds) {
    if (plannerByPartitionId[partitionId]) {
      if (!plannerByPartitionId[partitionId].reasons.includes(
        PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
      )) {
        plannerByPartitionId[partitionId].reasons.push(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        );
      }
      continue;
    }
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount:
        normalizePriorityRecoveryInteger(normalizedSummary?.requiredDistinctNodeCount),
      readyDistinctNodeCount: NUM.ZERO,
      spreadGap: normalizePriorityRecoveryInteger(
        normalizedSummary?.requiredDistinctNodeCount,
      ) || NUM.ONE,
      ready: false,
      reasons: [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING],
    };
  }

  return plannerByPartitionId;
}

function buildPriorityRecoveryReplicaOperationContexts(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
) {
  const operationTimelineById =
    replicaOperationsSummary?.operationTimelineById &&
      typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT ?
      replicaOperationsSummary.operationTimelineById :
      {};
  const byOperationId = {};
  const byPartitionId = {};

  for (const replicaOperationRow of Array.isArray(replicaOperationRows) ?
    replicaOperationRows :
    []) {
    const operationId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
      'operationId',
    );
    if (!operationId) {
      continue;
    }
    const entityType = String(firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE,
      'entityType',
      'service_type',
      'serviceType',
    ) || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION).toLowerCase();
    if (entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION) {
      continue;
    }
    const partitionId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID,
      'partitionId',
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID,
      'entityId',
    );
    if (!partitionId) {
      continue;
    }

    const timeline = Array.isArray(operationTimelineById[operationId]) ?
      operationTimelineById[operationId] :
      [];
    const timelineSteps = normalizePriorityRecoveryStringList(
      timeline.map((entry) => String(entry?.step || '').trim()),
    );
    const latestTimelineEntry = timeline.length > NUM.ZERO ?
      timeline[timeline.length - 1] :
      null;

    const context = {
      operationId,
      partitionId,
      tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
      status: String(firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS,
        'status',
      ) || '').toLowerCase(),
      workflowStep: String(firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP,
        'workflowStep',
      ) || '').toUpperCase(),
      sourceNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID,
        'sourceNodeId',
      ),
      targetNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID,
        'targetNodeId',
      ),
      replicaId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID,
        'replicaId',
        'service_id',
        'serviceId',
      ),
      createdAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ??
        replicaOperationRow.createdAt,
      ),
      updatedAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ??
        replicaOperationRow.updatedAt,
      ),
      timelineLength: timeline.length,
      timelineStepCount: timelineSteps.length,
      latestTimelineStep: String(latestTimelineEntry?.step || '').toUpperCase() || null,
      latestTimelineStatus: String(latestTimelineEntry?.status || '').toLowerCase() || null,
      latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    };
    byOperationId[operationId] = context;
    if (!byPartitionId[partitionId]) {
      byPartitionId[partitionId] = [];
    }
    byPartitionId[partitionId].push(context);
  }

  for (const partitionId of Object.keys(byPartitionId)) {
    byPartitionId[partitionId].sort((left, right) =>
      String(left.operationId).localeCompare(String(right.operationId)),
    );
  }

  return {
    byOperationId,
    byPartitionId,
  };
}

function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const status = String(operationContext.status || '').toLowerCase();
  if (status.length === NUM.ZERO) {
    return false;
  }
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
}

function buildPriorityRecoveryAdmissionByPartitionId(workflowAdmissionsByWorkflowId = {}) {
  const admissionByPartitionId = {};
  for (const workflow of Object.values(
    workflowAdmissionsByWorkflowId || {},
  )) {
    if (!workflow || typeof workflow !== TYPEOF.OBJECT) {
      continue;
    }
    const workflowId = String(workflow.workflowId || '').trim();
    if (workflowId.length === NUM.ZERO) {
      continue;
    }
    const admission =
      workflow.admission && typeof workflow.admission === TYPEOF.OBJECT ?
        workflow.admission :
        null;
    const partitionIds = normalizePriorityRecoveryStringList([
      workflow.sourcePartitionId,
      ...(Array.isArray(workflow.targetPartitionIds) ?
        workflow.targetPartitionIds :
        []),
    ]);
    for (const partitionId of partitionIds) {
      admissionByPartitionId[partitionId] = {
        workflowId,
        workflowType: workflow.workflowType || null,
        transitionState: workflow.transitionState || null,
        decisionType: admission?.decisionType || null,
        decisionDimension: admission?.decisionDimension || null,
        admissionDecisionAt: workflow.admissionDecisionAt || null,
        eligibleNodeIds: normalizePriorityRecoveryStringList(admission?.eligibleNodeIds),
        ineligibleNodes: Array.isArray(admission?.ineligibleNodes) ?
          admission.ineligibleNodes.map((entry) => ({
            nodeId: String(entry?.nodeId || ''),
            reasonCodes: normalizePriorityRecoveryStringList(entry?.reasonCodes),
          })).filter((entry) => entry.nodeId.length > NUM.ZERO) :
          [],
        blockingReasons: normalizePriorityRecoveryStringList(
          workflow.blockingReasons,
        ),
      };
    }
  }
  return admissionByPartitionId;
}

function buildPriorityRecoveryLearnerPromotionByPartitionId(
  serviceRows = [],
  readinessByNodeId = {},
) {
  const learnerByPartitionId = {};
  for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
      'partitionId',
    );
    if (!partitionId) {
      continue;
    }
    const status = String(firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
      'status',
    ) || '').toLowerCase();
    const raftRole = String(firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
      'raftRole',
    ) || '').toLowerCase();
    if (status !== PRIORITY_RECOVERY_STATUS_ACTIVE ||
        raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER) {
      continue;
    }
    const nodeId = firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
      'nodeId',
    );
    if (!nodeId) {
      continue;
    }
    if (!learnerByPartitionId[partitionId]) {
      learnerByPartitionId[partitionId] = [];
    }
    learnerByPartitionId[partitionId].push(nodeId);
  }

  const learnerPromotionByPartitionId = {};
  for (const [partitionId, learnerNodeIds] of Object.entries(
    learnerByPartitionId,
  )) {
    const learnerHoldByNodeId = {};
    const promotableLearnerNodeIds = [];
    for (const nodeId of normalizePriorityRecoveryStringList(learnerNodeIds)) {
      const readiness = readinessByNodeId[nodeId] || null;
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
          readiness.dimensions :
          {};
      const repairEligible =
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
      const recoveryEligible =
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true;
      if (repairEligible) {
        promotableLearnerNodeIds.push(nodeId);
        continue;
      }
      const reasonCodes = resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
      learnerHoldByNodeId[nodeId] = {
        holdReason:
          readiness ?
            (recoveryEligible ?
              PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY :
              PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE) :
            PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
        reasonCodes,
      };
    }
    learnerPromotionByPartitionId[partitionId] = {
      activeLearnerNodeIds: normalizePriorityRecoveryStringList(learnerNodeIds),
      promotableLearnerNodeIds,
      activeLearnerNodeCount: learnerNodeIds.length,
      promotableLearnerNodeCount: promotableLearnerNodeIds.length,
      learnerHoldByNodeId,
    };
  }

  return learnerPromotionByPartitionId;
}

function buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence) {
  const projectionDiagnostics =
    publicationConvergence?.projectionDiagnostics &&
      typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT ?
      publicationConvergence.projectionDiagnostics :
      null;
  const inclusionReasonsByNodeId = {};
  const exclusionReasonsByNodeId = {};
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.recoveryEligibleIncludedNodeIds,
  )) {
    inclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.readinessExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      ...(Array.isArray(exclusionReasonsByNodeId[nodeId]) ?
        exclusionReasonsByNodeId[nodeId] :
        []),
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
    ];
  }
  return {
    inclusionReasonsByNodeId,
    exclusionReasonsByNodeId,
  };
}

// ── AdminControlSnapshot class ──────────────────────────────────────────────

/**
 * Control snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshot {
  /**
   * @param {Object} deps
   * @param {Object} deps.systemTableCache
   * @param {string} deps.nodeId
   * @param {Object|null} deps.cdcIntegrationService
   * @param {Function|null} deps.resolveLocalPartitionServices
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
    this.messageRouter = deps.messageRouter || null;
    this.cdcIntegrationService =
      deps.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      deps.controlPlaneSystemTableGateway || null;
    this.controlPlaneReadinessService =
      deps.controlPlaneReadinessService || null;
    this.startupRecoveryCoordinator =
      deps.startupRecoveryCoordinator ||
      new StartupRecoveryCoordinator({
        readinessState: deps.bootstrapReadinessState || null,
        now: deps.nowFn,
      });
    this.heartbeatService = deps.heartbeatService || null;
    this.readinessSnapshotCacheMaxAgeMs =
      Number.isFinite(deps.readinessSnapshotCacheMaxAgeMs) &&
        deps.readinessSnapshotCacheMaxAgeMs > NUM.ZERO ?
        Math.floor(deps.readinessSnapshotCacheMaxAgeMs) :
        CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS;
    this.ensureAuthoritativeDiscoveryCacheRepair =
      typeof deps.ensureAuthoritativeDiscoveryCacheRepair === TYPEOF.FUNCTION ?
        deps.ensureAuthoritativeDiscoveryCacheRepair :
        null;
    this.resolveLocalPartitionServices =
      typeof deps.resolveLocalPartitionServices === TYPEOF.FUNCTION ?
        deps.resolveLocalPartitionServices :
        null;
    this.nowFn =
      typeof deps.nowFn === TYPEOF.FUNCTION ?
        deps.nowFn :
        () => Date.now();
  }

  /**
   * Build local control snapshot payload from system cache only.
   * @return {Object}
   */
  async buildLocalControlSnapshot(options = {}) {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE,
      );
    }

    const tableRows =
      this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    const capturedAt = this.nowFn();
    const preferAuthoritativePublicationRead =
      options.preferAuthoritativePublicationRead === true ||
      options.allowAuthoritativeRepair === true ||
      options.forceAuthoritativeRepair === true;
    const reconcileAuthoritativeMembershipPublication =
      options.reconcileAuthoritativeMembershipPublication === true ||
      options.forceAuthoritativeRepair === true;
    const controlPlaneDiagnostics =
      await this.buildControlPlaneDiagnosticsSnapshot({
        capturedAt,
        tableRows,
        preferAuthoritativePublicationRead,
        reconcileAuthoritativeMembershipPublication,
        allowAuthoritativeReadinessRefresh:
          options.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange:
          options.allowStaleReadinessOnCacheChange,
      });
    const nodeRows =
      this.systemTableCache.getAll(TABLES.NODES);
    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const nodeEndpointRows =
      this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS);
    const publicationRows =
      this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS);
    const publicationRowsForActiveNodeResolution = Array.isArray(publicationRows) ?
      publicationRows.slice() :
      [];
    if (controlPlaneDiagnostics?.publishedMembershipObservation &&
        typeof controlPlaneDiagnostics.publishedMembershipObservation === TYPEOF.OBJECT) {
      publicationRowsForActiveNodeResolution.push(
        controlPlaneDiagnostics.publishedMembershipObservation,
      );
    }
    const activeNodeViews = this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRowsForActiveNodeResolution,
    );
    if (controlPlaneDiagnostics && typeof controlPlaneDiagnostics === TYPEOF.OBJECT) {
      controlPlaneDiagnostics.activeNodeViews = {
        authoritativeSource: activeNodeViews.authoritativeSource,
        authoritativeNodeIds: [...activeNodeViews.authoritativeActiveNodeIds],
        projectedServingNodeIds: [...activeNodeViews.projectedServingNodeIds],
        locallyEligibleNodeIds: [...activeNodeViews.locallyEligibleNodeIds],
        suspectedOrTransitioningNodeIds: [
          ...activeNodeViews.suspectedOrTransitioningNodeIds,
        ],
        membershipFreeze: activeNodeViews.membershipFreeze,
        effectiveSource: activeNodeViews.effectiveSource,
        effectiveNodeIds: [...activeNodeViews.effectiveActiveNodeIds],
        projectedNodeIds: [...activeNodeViews.projectedActiveNodeIds],
        publishedNodeIds: Array.isArray(activeNodeViews.publishedActiveNodeIds) ?
          [...activeNodeViews.publishedActiveNodeIds] :
          [],
        publishedMembershipAvailable:
          activeNodeViews.publishedMembershipAvailable === true,
      };
    }
    const activePartitionRows =
      filterActiveServingPartitionRows(
        partitionRows,
        tableRows,
      );
    const activePartitionIdSet = new Set(activePartitionRows
      .map((row) =>
        firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id'))
      .filter(Boolean));
    const activePartitionServiceRows = serviceRows.filter((serviceRow) => {
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      return partitionId && activePartitionIdSet.has(partitionId);
    });
    const partitionIds = uniqueSorted(activePartitionRows
      .map((row) =>
        firstStringField(row, COLUMN.PARTITION_ID, 'id'))
      .filter(Boolean));

    const leaderSummary =
      this.buildControlSnapshotLeaderSummary(
        activePartitionRows,
        activePartitionServiceRows,
      );
    const voterCounts =
      this.buildControlSnapshotVoterCounts(
        activePartitionServiceRows,
      );
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );

    return {
      schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      nodes: [...activeNodeViews.authoritativeActiveNodeIds],
      publishedNodes: Array.isArray(activeNodeViews.publishedActiveNodeIds) ?
        [...activeNodeViews.publishedActiveNodeIds] :
        [],
      projectedNodes: [...activeNodeViews.projectedServingNodeIds],
      suspectedOrTransitioningNodes: [
        ...activeNodeViews.suspectedOrTransitioningNodeIds,
      ],
      partitions: partitionIds,
      cdcTelemetry: this.buildLocalCdcTelemetry(),
      controlPlaneDiagnostics,
      leaders: leaderSummary.leaders,
      replicaRoles: leaderSummary.replicaRoles,
      replicaRoleDiagnostics:
        leaderSummary.replicaRoleDiagnostics,
      voterCounts,
      replicaOperations,
    };
  }

  /**
   * Resolve one local control snapshot with optional authoritative
   * cache repair when partition topology appears incomplete.
   * @return {Promise<Object>}
   */
  async resolveLocalControlSnapshot(options = {}) {
    const forceAuthoritativeRepair =
      options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair =
      options.allowAuthoritativeRepair === true;
    let snapshot = null;
    try {
      snapshot = await this.buildLocalControlSnapshot(options);
    } catch (error) {
      if (!forceAuthoritativeRepair ||
          !this.canRunAuthoritativeControlSnapshotRepair() ||
          !isRecoverableControlSnapshotPublicationReadError(error)) {
        throw error;
      }
      let repair = null;
      try {
        repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
          reason: CONTROL_SNAPSHOT_REPAIR_REASON,
          bypassReuse: true,
        });
      } catch (repairError) {
        throw buildAuthoritativeControlSnapshotRepairFailure(
          repairError?.message || repairError,
          repairError,
        );
      }
      if (repair?.applied !== true) {
        const errors = Array.isArray(repair?.errors) ?
          repair.errors :
          ADMIN_CACHE_DUMP.EMPTY;
        const detail =
          errors[NUM.ZERO] ||
          repair?.error ||
          (repair?.skipped === true ?
            'repair_skipped' :
            'repair_not_applied');
        throw buildAuthoritativeControlSnapshotRepairFailure(detail);
      }
      const repairedSnapshot =
        await this.buildLocalControlSnapshot({
          ...options,
          preferAuthoritativePublicationRead: true,
        });
      const repairedEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(
          repairedSnapshot,
        );
      return attachAuthoritativeRepairDiagnostics(
        repairedSnapshot,
        {
          repair,
          repairEvaluation: repairedEvaluation,
          forceAuthoritativeRepair,
        },
      );
    }
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return snapshot;
    }
    if (forceAuthoritativeRepair !== true &&
        !shouldAttemptAuthoritativeRepair({
          repairEvaluation,
          forceAuthoritativeRepair,
          allowAuthoritativeRepair,
        })) {
      return snapshot;
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
        triggerCodes: repairEvaluation?.triggerCodes,
      });
    } catch (error) {
      if (canDegradeRepairFailure) {
        return snapshot;
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        error?.message ||
        error ||
        'unknown_error',
        error,
      );
    }

    if (repair?.applied !== true) {
      if (canDegradeRepairFailure) {
        return snapshot;
      }
      if (this.canDegradeAuthoritativeControlSnapshotRepairFailure({
        forceAuthoritativeRepair,
        repairEvaluation,
        repair,
      })) {
        return snapshot;
      }
      const errors = Array.isArray(repair?.errors) ?
        repair.errors :
        ADMIN_CACHE_DUMP.EMPTY;
      const detail =
        errors[NUM.ZERO] ||
        repair?.error ||
        (repair?.skipped === true ?
          'repair_skipped' :
          'repair_not_applied');
      throw buildAuthoritativeControlSnapshotRepairFailure(detail);
    }
    const repairedSnapshot =
      await this.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
      });
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(
        repairedSnapshot,
      );
    return attachAuthoritativeRepairDiagnostics(
      repairedSnapshot,
      {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair,
      },
    );
  }

  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (options.forceAuthoritativeRepair !== true &&
        hasOnlyLeaderResolutionGapRepairCause(options.repair) &&
        isReadyLocalQueryTransportDiagnostic(
          options.repair?.localQueryTransport,
        )) {
      return true;
    }

    if (hasAuthoritativeRepairTrigger(
      options.repairEvaluation,
      AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
    ) ||
        options.repairEvaluation?.nodeCoverage?.activeProjection
          ?.hasCoverageGap === true) {
      return false;
    }

    if (isReplicaOperationsOnlyRepairScope(
      options.repairEvaluation,
    )) {
      return true;
    }

    const failedTables = Array.isArray(options.repair?.failedTables) ?
      options.repair.failedTables.filter((value) =>
        typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
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

  resolveControlSnapshotNodeViews(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    const latestPublishedMembershipObservation =
      controlPlaneDiagnostics?.publishedMembershipObservation || null;
    const publicationConvergence =
      controlPlaneDiagnostics?.publicationConvergence || null;
    const latestPublishedPublicationObservation =
      latestPublishedMembershipObservation ||
      (String(publicationConvergence?.status || '').toUpperCase() ===
        'PUBLISHED' ?
        publicationConvergence :
        null);
    const readinessByNodeId = buildReadinessByNodeId({
      readinessByNodeId:
        controlPlaneDiagnostics?.readinessByNodeId || null,
    });
    const activeNodeViews = resolveActiveNodeViews({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      publicationRows,
      latestPublicationRow: latestPublishedPublicationObservation,
      readinessByNodeId,
      nowMs: this.nowFn(),
    });

    return {
      authoritativeSource: activeNodeViews.authoritativeSource,
      authoritativeActiveNodeIds: [...activeNodeViews.authoritativeActiveNodeIds],
      projectedServingNodeIds: [...activeNodeViews.projectedServingNodeIds],
      locallyEligibleNodeIds: [...activeNodeViews.locallyEligibleNodeIds],
      suspectedOrTransitioningNodeIds: [
        ...activeNodeViews.suspectedOrTransitioningNodeIds,
      ],
      membershipFreeze: activeNodeViews.membershipFreeze,
      effectiveSource: activeNodeViews.effectiveSource,
      effectiveActiveNodeIds: [...activeNodeViews.effectiveActiveNodeIds],
      projectedActiveNodeIds: [...activeNodeViews.projectedActiveNodeIds],
      publishedActiveNodeIds: Array.isArray(activeNodeViews.publishedActiveNodeIds) ?
        [...activeNodeViews.publishedActiveNodeIds] :
        null,
      publishedMembershipAvailable:
        Array.isArray(activeNodeViews.publishedActiveNodeIds),
    };
  }

  isControlSnapshotActiveNode(
    nodeRow,
    readinessByNodeId,
    nodeEndpointRows,
    options = {},
  ) {
    return isCanonicallyActiveNode(nodeRow, {
      readinessByNodeId,
      nodeEndpointRows,
      nowMs: this.nowFn(),
      requireWebSocketEndpoint: options.requireWebSocketEndpoint,
    });
  }

  hasAnyActiveWebSocketEndpoint(nodeEndpointRows = []) {
    return hasCanonicalWebSocketEndpoints(nodeEndpointRows);
  }

  hasActiveWebSocketEndpoint(nodeId, nodeEndpointRows = []) {
    return hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows);
  }

  isActiveWebSocketEndpoint(endpointRow) {
    return isCanonicalWebSocketEndpointRow(endpointRow);
  }

  /**
   * Determine whether one authoritative control-snapshot repair path
   * can run with current dependencies.
   * @return {boolean}
   * @private
   */
  canRunAuthoritativeControlSnapshotRepair() {
    return Boolean(
      this.systemTableCache &&
      typeof this.systemTableCache.getAll === TYPEOF.FUNCTION &&
      this.cacheMutationTarget &&
      typeof this.cacheMutationTarget.applySystemTableChange ===
        TYPEOF.FUNCTION &&
      this.ensureAuthoritativeDiscoveryCacheRepair,
    );
  }

  /**
   * Determine whether local control snapshot should attempt
   * authoritative cache repair.
   * @return {boolean}
   * @private
   */
  shouldAttemptAuthoritativeControlSnapshotRepair() {
    return shouldAttemptAuthoritativeRepair({
      repairEvaluation:
        this.evaluateAuthoritativeControlSnapshotRepair(),
      allowAuthoritativeRepair: true,
    });
  }

  /**
   * Evaluate whether local control snapshot should attempt
   * authoritative cache repair.
   * @return {Object|null}
   * @private
   */
  evaluateAuthoritativeControlSnapshotRepair(snapshot = null) {
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return null;
    }

    const capturedAt = Number.isFinite(snapshot?.capturedAt) ?
      snapshot.capturedAt :
      this.nowFn();
    const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
    const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const nodeEndpointRows =
      this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS);
    const controlPlaneDiagnostics =
      snapshot?.controlPlaneDiagnostics || null;
    const topologyGap = this.hasControlSnapshotPartitionTopologyGap(
      tableRows,
      partitionRows,
    );
    const nodeCoverage = evaluateSharedMetadataNodeCoverage({
      nodeRows,
      serviceRows,
      partitionRows,
      nodeEndpointRows,
    });
    const connectedNodeCoverage =
      this.evaluateConnectedNodeCoverageGap(nodeRows);
    const activeProjectionCoverage =
      this.evaluateActiveNodeProjectionCoverageGap({
        nodeRows,
        serviceRows,
        nodeEndpointRows,
        controlPlaneDiagnostics,
      });
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    const replicaOperationSummary =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );
    const evaluation = evaluateAuthoritativeRepairPolicy({
      cacheStalenessMs: this.resolveControlSnapshotCacheStalenessMs(
        nodeRows,
        capturedAt,
      ),
      staleThresholdMs: CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS,
      nodeCoverageGap:
        nodeCoverage.hasCoverageGap ||
        connectedNodeCoverage.hasCoverageGap ||
        activeProjectionCoverage.hasCoverageGap,
      topologyGap,
      staleReplicaOpsInFlightCount:
        replicaOperationSummary.staleInFlightCount,
    });
    return Object.freeze({
      ...evaluation,
      nodeCoverage: Object.freeze({
        sharedMetadata: nodeCoverage,
        connectedNodes: connectedNodeCoverage,
        activeProjection: activeProjectionCoverage,
      }),
    });
  }

  evaluateConnectedNodeCoverageGap(nodeRows = []) {
    if (!this.messageRouter ||
        typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION) {
      return Object.freeze({
        hasCoverageGap: false,
        missingNodeIds: Object.freeze([]),
      });
    }

    const observedNodeIds = new Set();
    for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : []) {
      const nodeId = firstStringField(
        nodeRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
        'id',
      );
      if (nodeId) {
        observedNodeIds.add(nodeId);
      }
    }

    const connectedNodeIds = uniqueSorted(
      (this.messageRouter.getConnectedNodes() || [])
        .filter((nodeId) =>
          typeof nodeId === TYPEOF.STRING &&
          nodeId.length > NUM.ZERO &&
          nodeId !== this.nodeId,
        ),
    );
    const missingNodeIds = connectedNodeIds
      .filter((nodeId) => !observedNodeIds.has(nodeId));

    return Object.freeze({
      hasCoverageGap: missingNodeIds.length > NUM.ZERO,
      missingNodeIds: Object.freeze(missingNodeIds),
    });
  }

  evaluateActiveNodeProjectionCoverageGap(options = {}) {
    const nodeRows = Array.isArray(options.nodeRows) ?
      options.nodeRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
      options.nodeEndpointRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const readinessByNodeId = buildReadinessByNodeId({
      readinessByNodeId:
        options.controlPlaneDiagnostics?.readinessByNodeId || null,
    });
    const activeNodeViews = this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      options.controlPlaneDiagnostics || null,
    );
    const activeNodeIds = new Set(activeNodeViews.projectedActiveNodeIds);
    const visibleNodeIds = new Set();

    for (const [nodeId, readinessEntry] of Object.entries(
      readinessByNodeId || {},
    )) {
      const readinessDimensions = readinessEntry?.dimensions &&
        typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
        readinessEntry.dimensions :
        null;
      if (!readinessDimensions ||
          readinessDimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
          ] !== true) {
        continue;
      }
      visibleNodeIds.add(nodeId);
    }

    for (const endpointRow of nodeEndpointRows) {
      if (!this.isActiveWebSocketEndpoint(endpointRow)) {
        continue;
      }
      const nodeId = firstStringField(
        endpointRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (nodeId) {
        visibleNodeIds.add(nodeId);
      }
    }

    if (this.messageRouter &&
        typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION) {
      for (const nodeId of this.messageRouter.getConnectedNodes() || []) {
        if (typeof nodeId === TYPEOF.STRING &&
            nodeId.length > NUM.ZERO) {
          visibleNodeIds.add(nodeId);
        }
      }
    }

    const missingNodeIds = uniqueSorted(
      [...visibleNodeIds].filter((nodeId) => !activeNodeIds.has(nodeId)),
    );
    return Object.freeze({
      hasCoverageGap: missingNodeIds.length > NUM.ZERO,
      missingNodeIds: Object.freeze(missingNodeIds),
    });
  }

  /**
   * Detect local partition-topology gaps that indicate stale cache
   * state for control snapshot consumers.
   * @param {Array<Object>} tableRows
   * @param {Array<Object>} partitionRows
   * @return {boolean}
   * @private
   */
  hasControlSnapshotPartitionTopologyGap(tableRows, partitionRows) {
    const normalizedTableRows = Array.isArray(tableRows) ?
      tableRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const normalizedPartitionRows = Array.isArray(partitionRows) ?
      partitionRows :
      ADMIN_CACHE_DUMP.EMPTY;
    if (normalizedTableRows.length === NUM.ZERO ||
        normalizedPartitionRows.length === NUM.ZERO) {
      return false;
    }

    const partitionIds = new Set();
    const activePartitionCountByTableVersion = new Map();

    for (const partitionRow of normalizedPartitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'id',
      );
      if (partitionId) {
        partitionIds.add(partitionId);
      }

      const tableId = firstStringField(partitionRow, COLUMN.TABLE_ID);
      const partitionVersion = Number(
        partitionRow?.partition_version ??
          partitionRow?.partitionVersion,
      );
      if (!tableId ||
          !Number.isInteger(partitionVersion) ||
          partitionVersion < NUM.ONE) {
        continue;
      }

      const state = String(
        partitionRow?.state ?? partitionRow?.partition_state ??
          PARTITION_STATE_NORMAL,
      ).toUpperCase();
      if (state !== PARTITION_STATE_NORMAL) {
        continue;
      }

      const key = `${tableId}:${partitionVersion}`;
      activePartitionCountByTableVersion.set(
        key,
        (activePartitionCountByTableVersion.get(key) || NUM.ZERO) + NUM.ONE,
      );
    }

    for (const tableRow of normalizedTableRows) {
      const tableId = firstStringField(tableRow, COLUMN.TABLE_ID, 'id');
      if (!tableId) {
        continue;
      }

      const activePartitionVersion = Number(
        tableRow?.active_partition_version ??
          tableRow?.activePartitionVersion,
      );
      const expectedPartitionCount = Number(
        tableRow?.partition_count ??
          tableRow?.partitionCount,
      );
      if (Number.isInteger(activePartitionVersion) &&
          activePartitionVersion >= NUM.ONE &&
          Number.isInteger(expectedPartitionCount) &&
          expectedPartitionCount > NUM.ZERO) {
        const key = `${tableId}:${activePartitionVersion}`;
        const observedPartitionCount =
          activePartitionCountByTableVersion.get(key) || NUM.ZERO;
        if (observedPartitionCount !== expectedPartitionCount) {
          return true;
        }
      }

      const transitionMetadata = this.parseWorkflowTransitionMetadata(tableRow);
      const targetPartitionIds = Array.isArray(
        transitionMetadata?.[
          PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
        ],
      ) ?
        transitionMetadata[
          PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
        ] :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const targetPartitionId of targetPartitionIds) {
        const normalizedTargetPartitionId = String(targetPartitionId || '');
        if (!normalizedTargetPartitionId) {
          continue;
        }
        if (!partitionIds.has(normalizedTargetPartitionId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Compute local cache staleness for active node heartbeat rows.
   * Stale live-node rows indicate the control snapshot should rebuild from
   * the authoritative owner path before consumers trust the local projection.
   * @param {Array<Object>} nodeRows
   * @param {number} capturedAtMs
   * @return {number}
   * @private
   */
  resolveControlSnapshotCacheStalenessMs(nodeRows = [], capturedAtMs = null) {
    const observedAtMs = Number.isFinite(capturedAtMs) ?
      capturedAtMs :
      this.nowFn();
    let maxStalenessMs = NUM.ZERO;

    for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : []) {
      const status = String(firstStringField(
        nodeRow,
        COLUMN.STATUS,
        'status',
      ) || '').toLowerCase();
      const connectionState = String(firstStringField(
        nodeRow,
        COLUMN.CONNECTION_STATE,
        'connection_state',
        'connectionState',
      ) || '').toLowerCase();
      const considerForStaleness = status === STATUS_ACTIVE ||
        connectionState === 'ready' ||
        connectionState === 'connected';
      if (!considerForStaleness) {
        continue;
      }

      const lastHeartbeatMs = Number(
        nodeRow?.[COLUMN.LAST_HEARTBEAT] ??
          nodeRow?.last_heartbeat ??
          nodeRow?.updated_at ??
          nodeRow?.updatedAt ??
          nodeRow?.created_at ??
          nodeRow?.createdAt,
      );
      if (!Number.isFinite(lastHeartbeatMs)) {
        return Number.POSITIVE_INFINITY;
      }

      maxStalenessMs = Math.max(
        maxStalenessMs,
        Math.max(NUM.ZERO, observedAtMs - lastHeartbeatMs),
      );
    }

    return maxStalenessMs;
  }

  /**
   * Build structured control-plane diagnostics for admin snapshots.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildControlPlaneDiagnosticsSnapshot(options = {}) {
    const capturedAt = Number.isFinite(options.capturedAt) ?
      options.capturedAt :
      this.nowFn();
    const observedMembershipPublication =
      await this.ensureMembershipPublicationObservation({
        preferAuthoritativeRead:
          options.preferAuthoritativePublicationRead === true,
        reconcileAuthoritativeMembership:
          options.reconcileAuthoritativeMembershipPublication === true,
      });
    let observedPublishedMembership =
      await this.ensurePublishedMembershipObservation(
        observedMembershipPublication,
        {
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
        },
      );
    if (!observedPublishedMembership &&
        options.preferAuthoritativePublicationRead !== true &&
        observedMembershipPublication &&
        typeof observedMembershipPublication === TYPEOF.OBJECT &&
        String(observedMembershipPublication.status || '').toUpperCase() !==
          'PUBLISHED') {
      observedPublishedMembership =
        await this.ensurePublishedMembershipObservation(
          observedMembershipPublication,
          {preferAuthoritativeRead: true},
        );
    }
    const readinessEntries = await this.resolveControlPlaneReadinessEntries({
      allowAuthoritativeRefresh:
        options.allowAuthoritativeReadinessRefresh !== false,
      allowStaleOnCacheChange:
        options.allowStaleReadinessOnCacheChange !== false,
    });
    const readinessByNodeId = {};
    const nodeLivenessByNodeId = {};
    const placementEligibilityByNodeId = {};

    for (const readiness of readinessEntries) {
      const nodeId = firstStringField(readiness, COLUMN.NODE_ID, 'nodeId');
      if (!nodeId) {
        continue;
      }
      readinessByNodeId[nodeId] = readiness;
      nodeLivenessByNodeId[nodeId] = readiness?.nodeEvidence || null;
      placementEligibilityByNodeId[nodeId] =
        this.buildPlacementEligibilityExplanation(readiness);
    }

    const publicationMode =
      this.resolvePublicationModeDiagnostics(readinessEntries);
    const publicationConvergence =
      this.resolvePublicationConvergenceDiagnostics(
        readinessEntries,
        observedMembershipPublication,
      );
    const readinessTransitionsByNodeId =
      this.resolveReadinessTransitionHistory();
    const priorityControlPlaneRecoveryByNodeId =
      this.resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries);
    const participationDecisions =
      this.resolveParticipationDecisionDiagnostics();
    const authoritativeReadinessRepairs =
      this.resolveAuthoritativeReadinessRepairDiagnostics();
    const recoveryEpochsByNodeId =
      this.resolveRecoveryEpochDiagnostics();
    const controlPlaneOperations =
      this.resolveControlPlaneOperationDiagnostics();
    const startupRecovery =
      this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION ?
        this.startupRecoveryCoordinator.evaluate() :
        null;
    const heartbeatPublication =
      this.resolveHeartbeatPublicationDiagnostics();
    const workflowDiagnostics =
      this.buildWorkflowAdmissionDiagnostics(
        Array.isArray(options.tableRows) ?
          options.tableRows :
          this.systemTableCache?.getAll(TABLES.TABLES),
      );
    const replicaOperationRows =
      this.systemTableCache?.getAll(TABLES.REPLICA_OPERATIONS) ||
      ADMIN_CACHE_DUMP.EMPTY;
    const serviceRows =
      this.systemTableCache?.getAll(TABLES.SERVICES) ||
      ADMIN_CACHE_DUMP.EMPTY;
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );
    const priorityRecoveryDecisionSnapshots =
      this.buildPriorityRecoveryDecisionSnapshots({
        capturedAt,
        publicationConvergence,
        readinessByNodeId,
        placementEligibilityByNodeId,
        workflowAdmissionsByWorkflowId:
          workflowDiagnostics.workflowAdmissionsByWorkflowId,
        controlPlaneOperations,
        replicaOperationRows,
        replicaOperations,
        serviceRows,
      });
    const splitEvaluation = this.resolveSplitEvaluationDiagnostics();
    const partitionServices = this.resolveLocalPartitionServices &&
      typeof this.resolveLocalPartitionServices === TYPEOF.FUNCTION ?
      this.resolveLocalPartitionServices() :
      null;
    const logsTable = buildLogsTableRetentionDiagnostics();
    const cdcReplay =
      buildCdcReplayRetentionDiagnostics(partitionServices);

    return {
      schemaVersion: CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      publicationMode,
      publicationConvergence,
      publishedMembershipObservation:
        this.resolvePublicationConvergenceDiagnostics(
          ADMIN_CACHE_DUMP.EMPTY,
          observedPublishedMembership,
        ),
      heartbeatPublication,
      readinessByNodeId,
      nodeLivenessByNodeId,
      priorityControlPlaneRecoveryByNodeId,
      readinessTransitionsByNodeId,
      participationDecisions,
      authoritativeReadinessRepairs,
      recoveryEpochsByNodeId,
      startupRecovery,
      placementEligibilityByNodeId,
      workflowAdmissionsByWorkflowId:
        workflowDiagnostics.workflowAdmissionsByWorkflowId,
      timeoutClassifications:
        workflowDiagnostics.timeoutClassifications,
      controlPlaneOperations,
      priorityRecoveryDecisionSnapshots,
      replicaOperations,
      splitEvaluation,
      logsTable,
      cdcReplay,
      cdcReplayByPartitionId: cdcReplay?.byPartitionId || null,
    };
  }

  /**
   * Build priority-recovery cross-service decision snapshots keyed by
   * partition/epoch/op.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPriorityRecoveryDecisionSnapshots(options = {}) {
    const publicationConvergence =
      options.publicationConvergence &&
        typeof options.publicationConvergence === TYPEOF.OBJECT ?
        options.publicationConvergence :
        null;
    const publicationEpoch = normalizePriorityRecoveryInteger(
      publicationConvergence?.publicationEpoch,
    );
    const readinessByNodeId =
      options.readinessByNodeId &&
        typeof options.readinessByNodeId === TYPEOF.OBJECT ?
        options.readinessByNodeId :
        {};
    const plannerByPartitionId = buildPriorityRecoveryPlannerByPartitionId(
      publicationConvergence?.priorityPartitionSummary,
    );
    const admissionByPartitionId = buildPriorityRecoveryAdmissionByPartitionId(
      options.workflowAdmissionsByWorkflowId,
    );
    const replicaOperationContexts = buildPriorityRecoveryReplicaOperationContexts(
      options.replicaOperationRows,
      options.replicaOperations,
    );
    const learnerPromotionByPartitionId = buildPriorityRecoveryLearnerPromotionByPartitionId(
      options.serviceRows,
      readinessByNodeId,
    );
    const publicationNodeDecisions =
      buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence);

    const allPartitionIds = new Set([
      ...Object.keys(plannerByPartitionId),
      ...Object.keys(admissionByPartitionId),
      ...Object.keys(replicaOperationContexts.byPartitionId),
      ...Object.keys(learnerPromotionByPartitionId),
    ]);
    const recoveryEligibleIncludedNodeIds = normalizePriorityRecoveryStringList(
      publicationConvergence?.projectionDiagnostics
        ?.recoveryEligibleIncludedNodeIds,
    );
    const snapshots = [];
    const blockerPartitionIdsByReason = {};
    for (const blockerReason of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
      blockerPartitionIdsByReason[blockerReason] = new Set();
    }
    const partitionIdsBySemanticState =
      buildPriorityRecoverySemanticPartitionSetMap();

    for (const partitionId of [...allPartitionIds].sort()) {
      const planner = plannerByPartitionId[partitionId] || {
        partitionId,
        requiredDistinctNodeCount: null,
        readyDistinctNodeCount: null,
        spreadGap: null,
        ready: null,
        reasons: [],
      };
      const admission = admissionByPartitionId[partitionId] || {
        workflowId: null,
        workflowType: null,
        transitionState: null,
        decisionType: null,
        decisionDimension: null,
        admissionDecisionAt: null,
        eligibleNodeIds: [],
        ineligibleNodes: [],
        blockingReasons: [],
      };
      const learnerPromotion = learnerPromotionByPartitionId[partitionId] || {
        activeLearnerNodeIds: [],
        promotableLearnerNodeIds: [],
        activeLearnerNodeCount: 0,
        promotableLearnerNodeCount: 0,
        learnerHoldByNodeId: {},
      };
      const operationContexts = Array.isArray(
        replicaOperationContexts.byPartitionId[partitionId],
      ) ? replicaOperationContexts.byPartitionId[partitionId] : [];
      const activeOperationContexts = operationContexts.filter((context) =>
        !isPriorityRecoveryOperationContextTerminal(context),
      );
      const hasActiveOperationContexts = activeOperationContexts.length > NUM.ZERO;
      const operationIds = operationContexts.length > NUM.ZERO ?
        operationContexts.map((context) => context.operationId) :
        [null];

      const ineligibleNodeIds = normalizePriorityRecoveryStringList(
        admission.ineligibleNodes.map((entry) => entry.nodeId),
      );
      const recoveryEligibleExcludedNodeIds = recoveryEligibleIncludedNodeIds
        .filter((nodeId) => ineligibleNodeIds.includes(nodeId));
      const admissionDecisionMissing =
        admission.decisionType === null &&
        admission.decisionDimension === null &&
        admission.eligibleNodeIds.length === NUM.ZERO &&
        ineligibleNodeIds.length === NUM.ZERO &&
        admission.blockingReasons.length === NUM.ZERO;

      const eligibleButNoOperation =
        planner.ready === false &&
        (admission.eligibleNodeIds.length > NUM.ZERO ||
          admissionDecisionMissing) &&
        !hasActiveOperationContexts;
      const operationCreatedNoStepTransitions =
        hasActiveOperationContexts &&
        activeOperationContexts.every((context) =>
          context.timelineStepCount <= NUM.ONE,
        );
      const learnerActiveNeverPromotable =
        learnerPromotion.activeLearnerNodeCount > NUM.ZERO &&
        learnerPromotion.promotableLearnerNodeCount === NUM.ZERO;
      const publicationRecoveryEligibleButCoordinatorExcludesNode =
        recoveryEligibleExcludedNodeIds.length > NUM.ZERO;
      const blockerReasons = [];
      if (eligibleButNoOperation) {
        blockerReasons.push(
          PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
        );
      }
      if (operationCreatedNoStepTransitions) {
        blockerReasons.push(
          PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
        );
      }
      if (learnerActiveNeverPromotable) {
        blockerReasons.push(
          PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
        );
      }
      if (publicationRecoveryEligibleButCoordinatorExcludesNode) {
        blockerReasons.push(
          PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
        );
      }
      for (const blockerReason of blockerReasons) {
        blockerPartitionIdsByReason[blockerReason].add(partitionId);
      }
      const semanticState = resolvePriorityRecoverySemanticState({
        blockerReasons,
        plannerReady: planner.ready === true,
        hasActiveOperationContexts,
      });
      if (partitionIdsBySemanticState[semanticState] instanceof Set) {
        partitionIdsBySemanticState[semanticState].add(partitionId);
      }

      for (const operationId of operationIds) {
        const operationContext =
          operationId && replicaOperationContexts.byOperationId[operationId] ?
            replicaOperationContexts.byOperationId[operationId] :
            null;
        snapshots.push({
          partitionId,
          epoch: publicationEpoch,
          operationId,
          correlationKey: buildPriorityRecoveryCorrelationKey(
            partitionId,
            publicationEpoch,
            operationId,
          ),
          semanticState,
          planner,
          admission: {
            ...admission,
            ineligibleNodeIds,
            recoveryEligibleExcludedNodeIds,
          },
          coordinator: {
            operationCount: operationContexts.length,
            operationIds: operationContexts.map((context) => context.operationId),
            operation: operationContext,
          },
          publication: {
            publicationStatus: publicationConvergence?.publicationStatus || null,
            pendingAckNodeIds: normalizePriorityRecoveryStringList(
              publicationConvergence?.pendingAckNodeIds,
            ),
            inclusionReasonsByNodeId:
              publicationNodeDecisions.inclusionReasonsByNodeId,
            exclusionReasonsByNodeId:
              publicationNodeDecisions.exclusionReasonsByNodeId,
          },
          readiness: {
            recoveryEligibleOnlyNodeIds: normalizePriorityRecoveryStringList(
              Object.entries(readinessByNodeId)
                .filter(([_nodeId, readinessEntry]) => {
                  const dimensions =
                    readinessEntry?.dimensions &&
                      typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
                      readinessEntry.dimensions :
                      {};
                  return dimensions[
                    CONTROL_PLANE_READINESS_DIMENSION
                      .CONTROL_PLANE_RECOVERY_ELIGIBLE
                  ] === true &&
                    dimensions[
                      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
                    ] !== true;
                })
                .map(([nodeId]) => nodeId),
            ),
            learnerPromotion,
          },
          blockerReasons,
        });
      }
    }

    const normalizedPartitionIdsBySemanticState = {};
    for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
      normalizedPartitionIdsBySemanticState[semanticState] = [
        ...partitionIdsBySemanticState[semanticState],
      ].sort();
    }
    const unresolvedSemanticStateIds =
      PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS
        .filter((semanticState) =>
          normalizedPartitionIdsBySemanticState[semanticState].length > NUM.ZERO,
        );
    const unresolvedSemanticPartitionIds = normalizePriorityRecoveryStringList(
      unresolvedSemanticStateIds.flatMap((semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState],
      ),
    );

    return {
      schemaVersion: PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION,
      capturedAt: options.capturedAt || null,
      publicationEpoch,
      snapshotCount: snapshots.length,
      partitionCount: allPartitionIds.size,
      snapshots,
      blockerPartitionIdsByReason: PRIORITY_RECOVERY_PROGRESS_CLASS_IDS
        .reduce((accumulator, blockerReason) => {
          accumulator[blockerReason] = [
            ...(blockerPartitionIdsByReason[blockerReason] || []),
          ].sort();
          return accumulator;
        }, {}),
      partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
      unresolvedSemanticStateIds,
      unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
      unresolvedSemanticBlockedPartitionIds: unresolvedSemanticPartitionIds,
      unresolvedSemanticBlockedPartitionCount:
        unresolvedSemanticPartitionIds.length,
    };
  }

  async ensureMembershipPublicationObservation(options = {}) {
    const membershipPublicationService =
      this.controlPlaneReadinessService?.membershipPublicationService || null;
    const hasMembershipPublicationService =
      membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT;
    const preferAuthoritativeRead =
      options.preferAuthoritativeRead === true;
    const reconcileAuthoritativeMembership =
      options.reconcileAuthoritativeMembership === true ||
      (preferAuthoritativeRead &&
        Object.hasOwn(options, 'reconcileAuthoritativeMembership') !== true);

    let publicationRow = null;
    if (hasMembershipPublicationService &&
        !preferAuthoritativeRead &&
        typeof membershipPublicationService.getLatestClusterPublicationSync ===
        TYPEOF.FUNCTION) {
      publicationRow =
        membershipPublicationService.getLatestClusterPublicationSync();
    }
    if (hasMembershipPublicationService &&
        (preferAuthoritativeRead || !publicationRow) &&
        typeof membershipPublicationService.getLatestClusterPublication ===
          TYPEOF.FUNCTION) {
      publicationRow =
        await membershipPublicationService.getLatestClusterPublication(
          preferAuthoritativeRead ? {preferAuthoritativeRead} : {},
        );
    }
    if (hasMembershipPublicationService &&
        typeof membershipPublicationService.reconcileClusterMembership ===
          TYPEOF.FUNCTION &&
        preferAuthoritativeRead &&
        reconcileAuthoritativeMembership) {
      const reconcileResult =
        await membershipPublicationService.reconcileClusterMembership({
          preferAuthoritativeRead: true,
          latestPublicationRow: publicationRow,
        });
      publicationRow = reconcileResult?.publicationRow || publicationRow;
    } else if (hasMembershipPublicationService &&
        !publicationRow &&
        typeof membershipPublicationService.reconcileClusterMembership ===
          TYPEOF.FUNCTION) {
      const reconcileResult =
        await membershipPublicationService.reconcileClusterMembership();
      publicationRow = reconcileResult?.publicationRow || null;
    }
    if (!publicationRow) {
      publicationRow = resolveLatestMembershipPublicationRow(
        this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
      );
    }
    const publicationId = publicationRow?.publicationId ||
      publicationRow?.publication_id ||
      null;
    const requiredAckNodeIds = Array.isArray(
      publicationRow?.requiredAckNodeIds ?? publicationRow?.required_ack_node_ids,
    ) ?
      (publicationRow.requiredAckNodeIds ?? publicationRow.required_ack_node_ids) :
      [];
    if (publicationId &&
        requiredAckNodeIds.includes(this.nodeId) &&
        hasMembershipPublicationService &&
        typeof membershipPublicationService.acknowledgePublication ===
          TYPEOF.FUNCTION) {
      publicationRow = await membershipPublicationService.acknowledgePublication(
        publicationId,
        this.nodeId,
        {publicationRow},
      ) || publicationRow;
    }
    return publicationRow;
  }

  async ensurePublishedMembershipObservation(
    fallbackPublication = null,
    options = {},
  ) {
    if (fallbackPublication && typeof fallbackPublication === TYPEOF.OBJECT &&
        String(fallbackPublication.status || '').toUpperCase() === 'PUBLISHED') {
      return fallbackPublication;
    }

    const membershipPublicationService =
      this.controlPlaneReadinessService?.membershipPublicationService || null;
    const hasMembershipPublicationService =
      membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT;

    if (options.preferAuthoritativeRead !== true &&
        hasMembershipPublicationService &&
        typeof membershipPublicationService.getLatestPublishedClusterPublicationSync ===
        TYPEOF.FUNCTION) {
      const publicationRow =
        membershipPublicationService.getLatestPublishedClusterPublicationSync();
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    if (hasMembershipPublicationService &&
        typeof membershipPublicationService.getLatestPublishedClusterPublication ===
        TYPEOF.FUNCTION) {
      const publicationRow =
        await membershipPublicationService.getLatestPublishedClusterPublication(
          options.preferAuthoritativeRead === true ?
            {preferAuthoritativeRead: true} :
            {},
        );
      if (publicationRow && typeof publicationRow === TYPEOF.OBJECT) {
        return publicationRow;
      }
    }
    return resolveLatestMembershipPublicationRow(
      this.systemTableCache?.getAll?.(TABLES.CONTROL_PLANE_PUBLICATIONS),
      {
        status: 'PUBLISHED',
      },
    );
  }

  resolvePublicationConvergenceDiagnostics(
    readinessEntries = [],
    fallbackPublication = null,
  ) {
    for (const readiness of Array.isArray(readinessEntries) ? readinessEntries : []) {
      const membershipPublication = readiness?.membershipPublication;
      if (!membershipPublication || typeof membershipPublication !== TYPEOF.OBJECT) {
        continue;
      }
      const requiredAckNodeIds = Array.isArray(
        membershipPublication.requiredAckNodeIds,
      ) ? membershipPublication.requiredAckNodeIds : [];
      const acknowledgedNodeIds = Array.isArray(
        membershipPublication.acknowledgedNodeIds,
      ) ? membershipPublication.acknowledgedNodeIds : [];
      const membershipLifecycleSummary =
        membershipPublication.membershipLifecycleSummary &&
        typeof membershipPublication.membershipLifecycleSummary ===
          TYPEOF.OBJECT ?
          membershipPublication.membershipLifecycleSummary :
          null;
      const projectionDiagnostics =
        membershipLifecycleSummary?.projectionDiagnostics &&
        typeof membershipLifecycleSummary.projectionDiagnostics ===
          TYPEOF.OBJECT ?
          membershipLifecycleSummary.projectionDiagnostics :
          null;
      return {
        publicationEpoch: membershipPublication.publicationEpoch ?? null,
        status: membershipPublication.status || null,
        publicationStatus: membershipPublication.status || null,
        publishedActiveNodeIds: Array.isArray(
          membershipPublication.publishedActiveNodeIds,
        ) ? [...membershipPublication.publishedActiveNodeIds] : [],
        requiredAckNodeIds: [...requiredAckNodeIds],
        acknowledgedNodeIds: [...acknowledgedNodeIds],
        pendingAckNodeIds: requiredAckNodeIds.filter(
          (nodeId) => !acknowledgedNodeIds.includes(nodeId),
        ),
        priorityPartitionSummary:
          membershipPublication.priorityPartitionSummary || null,
        sourceTopologyEpoch:
          membershipPublication.sourceTopologyEpoch ?? null,
        sourceSnapshotVersion:
          membershipPublication.sourceSnapshotVersion ?? null,
        publishedAt: membershipPublication.publishedAt || null,
        updatedAt: membershipPublication.updatedAt || null,
        membershipLifecycleSummary,
        projectionDiagnostics,
      };
    }
    if (fallbackPublication && typeof fallbackPublication === TYPEOF.OBJECT) {
      const requiredAckNodeIds = Array.isArray(
        fallbackPublication.requiredAckNodeIds ??
          fallbackPublication.required_ack_node_ids,
      ) ?
        (fallbackPublication.requiredAckNodeIds ??
          fallbackPublication.required_ack_node_ids) :
        [];
      const acknowledgedNodeIds = Array.isArray(
        fallbackPublication.acknowledgedNodeIds ??
          fallbackPublication.acknowledged_node_ids,
      ) ?
        (fallbackPublication.acknowledgedNodeIds ??
          fallbackPublication.acknowledged_node_ids) :
        [];
      const membershipLifecycleSummary =
        fallbackPublication.membershipLifecycleSummary &&
        typeof fallbackPublication.membershipLifecycleSummary === TYPEOF.OBJECT ?
          fallbackPublication.membershipLifecycleSummary :
          (fallbackPublication.membership_lifecycle_summary &&
          typeof fallbackPublication.membership_lifecycle_summary ===
            TYPEOF.OBJECT ?
            fallbackPublication.membership_lifecycle_summary :
            null);
      const projectionDiagnostics =
        membershipLifecycleSummary?.projectionDiagnostics &&
        typeof membershipLifecycleSummary.projectionDiagnostics ===
          TYPEOF.OBJECT ?
          membershipLifecycleSummary.projectionDiagnostics :
          null;
      return {
        publicationEpoch:
          fallbackPublication.publicationEpoch ??
          fallbackPublication.publication_epoch ??
          null,
        status:
          fallbackPublication.status || null,
        publicationStatus:
          fallbackPublication.status || null,
        publishedActiveNodeIds: Array.isArray(
          fallbackPublication.publishedActiveNodeIds ??
            fallbackPublication.published_active_node_ids,
        ) ?
          [
            ...(fallbackPublication.publishedActiveNodeIds ??
              fallbackPublication.published_active_node_ids),
          ] :
          [],
        requiredAckNodeIds: [...requiredAckNodeIds],
        acknowledgedNodeIds: [...acknowledgedNodeIds],
        pendingAckNodeIds: requiredAckNodeIds.filter(
          (nodeId) => !acknowledgedNodeIds.includes(nodeId),
        ),
        priorityPartitionSummary:
          fallbackPublication.priorityPartitionSummary ??
          fallbackPublication.priority_partition_summary ??
          null,
        sourceTopologyEpoch:
          fallbackPublication.sourceTopologyEpoch ??
          fallbackPublication.source_topology_epoch ??
          null,
        sourceSnapshotVersion:
          fallbackPublication.sourceSnapshotVersion ??
          fallbackPublication.source_snapshot_version ??
          null,
        publishedAt:
          fallbackPublication.publishedAt ??
          fallbackPublication.published_at ??
          null,
        updatedAt:
          fallbackPublication.updatedAt ??
          fallbackPublication.updated_at ??
          null,
        membershipLifecycleSummary,
        projectionDiagnostics,
      };
    }
    return null;
  }

  resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries = []) {
    const entries = {};
    for (const readiness of Array.isArray(readinessEntries) ? readinessEntries : []) {
      const nodeId = firstStringField(readiness, COLUMN.NODE_ID, 'nodeId');
      if (!nodeId) {
        continue;
      }
      const priorityControlPlaneRecovery =
        readiness?.priorityControlPlaneRecovery;
      if (!priorityControlPlaneRecovery ||
          typeof priorityControlPlaneRecovery !== TYPEOF.OBJECT) {
        continue;
      }
      entries[nodeId] = priorityControlPlaneRecovery;
    }
    return entries;
  }

  /**
   * Resolve canonical readiness vectors when the owner is available.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async resolveControlPlaneReadinessEntries(options = {}) {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getAllNodeReadiness !==
          TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    try {
      const readiness =
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh:
            options.allowAuthoritativeRefresh !== false,
          allowStaleOnCacheChange:
            options.allowStaleOnCacheChange !== false,
          maxCachedAgeMs: this.readinessSnapshotCacheMaxAgeMs,
        });
      return Array.isArray(readiness) ? readiness : ADMIN_CACHE_DUMP.EMPTY;
    } catch (_error) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
  }

  /**
   * Build one placement-eligibility explanation from canonical readiness.
   * @param {Object} readiness
   * @return {Object}
   * @private
   */
  buildPlacementEligibilityExplanation(readiness) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === TYPEOF.OBJECT ?
      readiness.dimensions :
      {};
    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      ADMIN_CACHE_DUMP.EMPTY;
    return {
      nodeId: firstStringField(readiness, COLUMN.NODE_ID, 'nodeId'),
      placementEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE] ===
        true,
      failedDimensions: uniqueSorted(
        Object.entries(dimensions)
          .filter(([_dimension, value]) => value !== true)
          .map(([dimension]) => dimension),
      ),
      reasonCodes: uniqueSorted(
        reasons
          .map((reason) => String(reason?.code || ''))
          .filter(Boolean),
      ),
      reasons,
    };
  }

  /**
   * Resolve the current publication-mode diagnostics.
   * @param {Array<Object>} readinessEntries
   * @return {Object|null}
   * @private
   */
  resolvePublicationModeDiagnostics(readinessEntries = []) {
    for (const readiness of readinessEntries) {
      const publication = readiness?.publication;
      if (publication && typeof publication === TYPEOF.OBJECT) {
        return publication;
      }
    }
    const publicationService =
      this.controlPlaneReadinessService?.cdcGroupPropagationService || null;
    if (publicationService &&
        typeof publicationService.getPublicationModeDiagnostics ===
          TYPEOF.FUNCTION) {
      return publicationService.getPublicationModeDiagnostics();
    }
    return null;
  }

  /**
   * Resolve recent readiness transitions recorded by the canonical owner.
   * @return {Object}
   * @private
   */
  resolveReadinessTransitionHistory() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getReadinessTransitionHistoryByNodeId !== TYPEOF.FUNCTION) {
      return {};
    }
    try {
      const history =
        this.controlPlaneReadinessService
          .getReadinessTransitionHistoryByNodeId();
      return history && typeof history === TYPEOF.OBJECT ?
        history :
        {};
    } catch (_error) {
      return {};
    }
  }

  /**
   * Resolve recent canonical participation decisions.
   * @return {Object[]}
   * @private
   */
  resolveParticipationDecisionDiagnostics() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getParticipationDecisionLedgerEntries !== TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    try {
      const entries =
        this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries({
          limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
        });
      return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
    } catch (_error) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
  }

  /**
   * Resolve recent authoritative readiness repair attempts.
   * @return {Object[]}
   * @private
   */
  resolveAuthoritativeReadinessRepairDiagnostics() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getAuthoritativeReadinessRepairLedgerEntries !==
            TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    try {
      const entries =
        this.controlPlaneReadinessService
          .getAuthoritativeReadinessRepairLedgerEntries({
            limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
          });
      return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
    } catch (_error) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
  }

  /**
   * Resolve bounded recovery epoch history by node.
   * @return {Object}
   * @private
   */
  resolveRecoveryEpochDiagnostics() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION) {
      return {};
    }
    try {
      const history =
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId();
      return history && typeof history === TYPEOF.OBJECT ?
        history :
        {};
    } catch (_error) {
      return {};
    }
  }

  /**
   * Resolve recent control-plane system-table operations.
   * @return {Object[]}
   * @private
   */
  resolveControlPlaneOperationDiagnostics() {
    if (!this.controlPlaneSystemTableGateway ||
        typeof this.controlPlaneSystemTableGateway
          .getControlPlaneOperationLedgerEntries !== TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    try {
      const entries =
        this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries({
          limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
        });
      return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
    } catch (_error) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
  }

  /**
   * Resolve heartbeat publication diagnostics from the local owner.
   * @return {Object|null}
   * @private
   */
  resolveHeartbeatPublicationDiagnostics() {
    if (!this.heartbeatService ||
        typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
          TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const diagnostics =
        this.heartbeatService.getHeartbeatPublicationDiagnostics();
      return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Resolve split-evaluation diagnostics from the canonical owner.
   * @return {Object|null}
   * @private
   */
  resolveSplitEvaluationDiagnostics() {
    const splitManager = this.sqlQueryEngine?.partitionSplitMergeManager;
    if (!splitManager ||
        typeof splitManager.getEvaluationDiagnostics !== TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const diagnostics = splitManager.getEvaluationDiagnostics();
      return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Build persisted workflow-admission diagnostics from table metadata.
   * @param {Array<Object>} tableRows
   * @return {Object}
   * @private
   */
  buildWorkflowAdmissionDiagnostics(tableRows = []) {
    const workflowAdmissionsByWorkflowId = {};
    const timeoutClassifications = [];

    for (const tableRow of Array.isArray(tableRows) ? tableRows : []) {
      const workflow = this.buildWorkflowAdmissionEntry(tableRow);
      if (!workflow) {
        continue;
      }
      workflowAdmissionsByWorkflowId[workflow.workflowId] = workflow;
      if (workflow.timeoutClassification &&
          typeof workflow.timeoutClassification === TYPEOF.OBJECT) {
        timeoutClassifications.push({
          workflowId: workflow.workflowId,
          workflowType: workflow.workflowType,
          tableId: workflow.tableId,
          tableName: workflow.tableName,
          transitionState: workflow.transitionState,
          timeoutClassification: workflow.timeoutClassification,
        });
      }
    }

    return {
      workflowAdmissionsByWorkflowId,
      timeoutClassifications,
    };
  }

  /**
   * Build one workflow-admission record from table transition metadata.
   * @param {Object} tableRow
   * @return {Object|null}
   * @private
   */
  buildWorkflowAdmissionEntry(tableRow) {
    const transitionState = firstStringField(
      tableRow,
      'partition_transition_state',
      'partitionTransitionState',
    );
    const metadata = this.parseWorkflowTransitionMetadata(tableRow);
    const workflowId = firstStringField(
      metadata,
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID,
    );
    if (!transitionState || !metadata || !workflowId) {
      return null;
    }

    const admission = metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] &&
      typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] ===
        TYPEOF.OBJECT ?
      metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] :
      null;
    const failure = metadata?.[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] &&
      typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] ===
        TYPEOF.OBJECT ?
      metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE] :
      null;
    const blockingReasons = Array.isArray(admission?.blockingReasons) ?
      admission.blockingReasons :
      ADMIN_CACHE_DUMP.EMPTY;
    const timeoutClassification = failure?.timeoutClassification &&
      typeof failure.timeoutClassification === TYPEOF.OBJECT ?
      failure.timeoutClassification :
      null;
    const retry = metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY] &&
      typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] ===
        TYPEOF.OBJECT ?
      metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] :
      null;
    const topologySnapshot =
      metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] &&
      typeof metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] ===
        TYPEOF.OBJECT ?
        metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT] :
        null;

    return {
      workflowId,
      workflowType: MANAGED_SPLIT_WORKFLOW_TYPE,
      transitionState,
      tableId: firstStringField(tableRow, COLUMN.TABLE_ID, 'id'),
      tableName: firstStringField(tableRow, COLUMN.TABLE_NAME, 'name'),
      sourcePartitionId: firstStringField(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID,
      ),
      targetPartitionIds: Array.isArray(
        metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
      ) ?
        metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] :
        ADMIN_CACHE_DUMP.EMPTY,
      topologySnapshotCapturedAt:
        firstStringField(topologySnapshot, 'capturedAt'),
      sourceLeaderNodeId:
        firstStringField(topologySnapshot, 'sourceLeaderNodeId'),
      candidateTargetNodeIds: Array.isArray(
        admission?.candidateTargetNodeIds,
      ) ?
        admission.candidateTargetNodeIds :
        (Array.isArray(topologySnapshot?.candidateTargetNodeIds) ?
          topologySnapshot.candidateTargetNodeIds :
          ADMIN_CACHE_DUMP.EMPTY),
      sourceRoutableNodeIds: Array.isArray(
        admission?.sourceRoutableNodeIds,
      ) ?
        admission.sourceRoutableNodeIds :
        (Array.isArray(topologySnapshot?.sourceRoutableNodeIds) ?
          topologySnapshot.sourceRoutableNodeIds :
          ADMIN_CACHE_DUMP.EMPTY),
      eligibleNodeIds: Array.isArray(admission?.eligibleNodeIds) ?
        admission.eligibleNodeIds :
        ADMIN_CACHE_DUMP.EMPTY,
      ineligibleNodes: Array.isArray(admission?.ineligibleNodes) ?
        admission.ineligibleNodes :
        ADMIN_CACHE_DUMP.EMPTY,
      estimatedBytes: Number.isFinite(Number(admission?.estimatedBytes)) ?
        Number(admission.estimatedBytes) :
        null,
      admissionDecisionAt:
        firstStringField(admission, 'decisionTimestamp'),
      admission,
      blockingReasons,
      failure,
      failedAt: firstStringField(failure, 'failedAt'),
      nextAttemptAt: firstStringField(retry, 'nextAttemptAt'),
      timeoutClassification,
    };
  }

  /**
   * Parse table transition metadata.
   * @param {Object} tableRow
   * @return {Object|null}
   * @private
   */
  parseWorkflowTransitionMetadata(tableRow) {
    const rawMetadata = tableRow?.partition_transition_metadata ??
      tableRow?.partitionTransitionMetadata ??
      null;
    if (!rawMetadata) {
      return null;
    }
    if (rawMetadata && typeof rawMetadata === TYPEOF.OBJECT) {
      return rawMetadata;
    }
    if (typeof rawMetadata !== TYPEOF.STRING) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawMetadata);
      return parsed && typeof parsed === TYPEOF.OBJECT ?
        parsed :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Build canonical leader summary from owner rows plus
   * replica-role detail.
   * Canonical leader identity comes from
   * partitions.leader_node_id.
   * Replica rows are attached only as supporting diagnostics.
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotLeaderSummary(
    partitionRows = [], serviceRows = [],
  ) {
    const leaders = {};
    const replicaRoles = {};
    const replicaLeaderNodeIdsByPartition = new Map();

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'type',
        'serviceType',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }

      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
      );
      if (!partitionId) {
        continue;
      }

      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raftRole',
      );
      const normalizedRaftRole =
        String(raftRole || '').toLowerCase();
      if (!normalizedRaftRole) {
        continue;
      }

      const replicaId = firstStringField(
        serviceRow,
        COLUMN.REPLICA_ID,
        COLUMN.SERVICE_ID,
        'replicaId',
        'id',
      );
      if (!replicaId) {
        continue;
      }
      replicaRoles[partitionId] =
        replicaRoles[partitionId] || {};
      replicaRoles[partitionId][replicaId] =
        normalizedRaftRole;

      if (normalizedRaftRole !== LEADER_RAFT_ROLE) {
        continue;
      }

      const leaderNodeId = firstStringField(
        serviceRow,
        COLUMN.LEADER_NODE_ID,
        COLUMN.NODE_ID,
        'nodeId',
      );
      if (!leaderNodeId) {
        continue;
      }
      let partitionLeaderNodeIds =
        replicaLeaderNodeIdsByPartition.get(partitionId);
      if (!partitionLeaderNodeIds) {
        partitionLeaderNodeIds = new Set();
        replicaLeaderNodeIdsByPartition.set(
          partitionId, partitionLeaderNodeIds,
        );
      }
      partitionLeaderNodeIds.add(leaderNodeId);
    }

    const replicaRoleDiagnostics = {};
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }

      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        'leaderNodeId',
      );
      if (canonicalLeaderNodeId) {
        leaders[partitionId] = canonicalLeaderNodeId;
      }

      const replicaLeaderNodeIds = uniqueSorted(Array.from(
        replicaLeaderNodeIdsByPartition.get(partitionId) ||
          [],
      ));
      const inconsistentReplicaRoles =
        replicaLeaderNodeIds.length > NUM.ONE ||
        (canonicalLeaderNodeId &&
          replicaLeaderNodeIds.length > NUM.ZERO &&
          !replicaLeaderNodeIds.includes(
            canonicalLeaderNodeId,
          ));

      replicaRoleDiagnostics[partitionId] = {
        canonicalLeaderNodeId:
          canonicalLeaderNodeId || null,
        source: TABLES.PARTITIONS,
        inconsistentReplicaRoles,
        replicaLeaderNodeIds,
        issues: inconsistentReplicaRoles ?
          [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE] :
          [],
      };
    }

    return {
      leaders,
      replicaRoles,
      replicaRoleDiagnostics,
    };
  }

  /**
   * Build voter-count map per partition from local services rows.
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotVoterCounts(serviceRows = []) {
    const voterCounts = {};
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'type',
        'serviceType',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }

      const status = firstStringField(
        serviceRow, COLUMN.STATUS, 'status',
      );
      if (String(status || '').toLowerCase() !==
          STATUS_ACTIVE) {
        continue;
      }

      const raftRole = firstStringField(
        serviceRow, COLUMN.RAFT_ROLE, 'raftRole',
      );
      const normalizedRaftRole =
        String(raftRole || '').toLowerCase();
      if (!normalizedRaftRole ||
          !isLoadReadyReplicaRaftRole(normalizedRaftRole)) {
        continue;
      }

      const address = firstStringField(
        serviceRow,
        COLUMN.ADDRESS,
        'address',
      );
      if (!address) {
        continue;
      }

      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
      );
      if (!partitionId) {
        continue;
      }

      voterCounts[partitionId] =
        (voterCounts[partitionId] || NUM.ZERO) + NUM.ONE;
    }
    return voterCounts;
  }

  /**
   * Build replica operation in-flight summary.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildControlSnapshotReplicaOperationSummary(
    replicaOperationRows = [], options = {},
  ) {
    const scopedPartitionIds =
      options.partitionIds instanceof Set &&
      options.partitionIds.size > NUM.ZERO ?
        options.partitionIds :
        null;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICES) :
        ADMIN_CACHE_DUMP.EMPTY);
    const livenessSummary = summarizeReplicaOperationLiveness(
      replicaOperationRows,
      {
        partitionIds: scopedPartitionIds,
        serviceRows,
        nowMs: this.nowFn(),
        includeTimeline: true,
      },
    );
    return {
      inFlightCount: livenessSummary.inFlightCount,
      statusHistogram: livenessSummary.statusHistogram,
      partitionGroupInFlight: livenessSummary.partitionGroupInFlight,
      stepHistogram: livenessSummary.stepHistogram,
      oldestInFlightAgeMs: livenessSummary.oldestInFlightAgeMs,
      staleInFlightCount: livenessSummary.staleInFlightCount,
      inFlightOperationIds: livenessSummary.inFlightOperationIds,
      operationTimelineById: livenessSummary.operationTimelineById,
      inFlightExcludedStatuses:
        ADMIN_CONTROL_SNAPSHOT.IN_FLIGHT_EXCLUDED_STATUSES,
    };
  }

  /**
   * Build node-local CDC telemetry with authoritative fallback
   * diagnostics.
   * @return {Object}
   */
  buildLocalCdcTelemetry() {
    const partitionServices =
      this.resolveLocalPartitionServices ?
        this.resolveLocalPartitionServices() :
        null;
    let subscriberCount = NUM.ZERO;
    let bufferedEvents = NUM.ZERO;
    let catchupLagEvents = NUM.ZERO;
    const catchupThroughputEventsPerSec = NUM.ZERO;
    let catchupDetected = false;

    if (partitionServices instanceof Map) {
      for (const partitionService of
        partitionServices.values()) {
        if (!partitionService ||
            typeof partitionService
              .getCDCSubscriptionDiagnostics !==
              TYPEOF.FUNCTION) {
          continue;
        }
        const diagnostics =
          partitionService.getCDCSubscriptionDiagnostics();
        if (!diagnostics ||
            typeof diagnostics !== TYPEOF.OBJECT) {
          continue;
        }
        const partitionSubscriberCount = Number(
          diagnostics.subscriberCount || NUM.ZERO,
        );
        const partitionBufferedEvents = Number(
          diagnostics.bufferedEvents || NUM.ZERO,
        );
        subscriberCount += partitionSubscriberCount;
        bufferedEvents += partitionBufferedEvents;
        catchupLagEvents = Math.max(
          catchupLagEvents, partitionBufferedEvents,
        );
        if (partitionBufferedEvents > NUM.ZERO ||
            diagnostics.bufferReplayInFlight === true) {
          catchupDetected = true;
        }
      }
    }

    const authoritativeFallback =
      typeof this.cdcIntegrationService
        ?.getAuthoritativeFallbackDiagnostics ===
          TYPEOF.FUNCTION ?
        this.cdcIntegrationService
          .getAuthoritativeFallbackDiagnostics() :
        {
          schemaVersion: NUM.ONE,
          nodeId: this.nodeId,
          windowMs: TIME_MS.MINUTE,
          totalCount: NUM.ZERO,
          windowCount: NUM.ZERO,
          windowRatePerMinute: NUM.ZERO,
          phases: {
            bootstrap: {
              windowCount: NUM.ZERO,
              totalCount: NUM.ZERO,
            },
            recovery: {
              windowCount: NUM.ZERO,
              totalCount: NUM.ZERO,
            },
            steady_state: {
              windowCount: NUM.ZERO,
              totalCount: NUM.ZERO,
            },
          },
          outcomes: {
            recovered: {
              windowCount: NUM.ZERO,
              totalCount: NUM.ZERO,
            },
            failed: {
              windowCount: NUM.ZERO,
              totalCount: NUM.ZERO,
            },
          },
          byTable: {},
          recentEvents: ADMIN_CACHE_DUMP.EMPTY,
        };

    return {
      subscriberCount,
      bufferedEvents,
      catchupLagEvents,
      catchupThroughputEventsPerSec,
      mode: catchupDetected ?
        CDC_TELEMETRY_MODE.CATCHUP :
        CDC_TELEMETRY_MODE.STEADY,
      authoritativeFallback,
    };
  }

  /**
   * Build node-local CDC diagnostics payload.
   * @return {Object}
   */
  buildLocalCdcDiagnostics() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.CDC_DIAGNOSTICS_UNAVAILABLE,
      );
    }
    const capturedAt = this.nowFn();
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const clusterPartitionIds = uniqueSorted(
      partitionRows
        .map((row) =>
          firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id'))
        .filter(Boolean),
    );
    const partitionDiagnosticsById = {};
    const missingDiagnosticsPartitionIds = [];
    const noSubscriberPartitionIds = [];
    const bufferedPartitionIds = [];
    const partitionServices =
      this.resolveLocalPartitionServices ?
        this.resolveLocalPartitionServices() :
        null;

    if (partitionServices instanceof Map) {
      for (const [partitionServiceKey, partitionService] of
        partitionServices.entries()) {
        const partitionId = firstStringField(
          partitionService,
          COLUMN.PARTITION_ID,
          'partitionId',
          'id',
        ) || String(partitionServiceKey || '');
        if (!partitionId) {
          continue;
        }

        if (!partitionService ||
            typeof partitionService.getCDCSubscriptionDiagnostics !==
              TYPEOF.FUNCTION) {
          partitionDiagnosticsById[partitionId] = {
            diagnosticsAvailable: false,
            ready: false,
            subscriberCount: NUM.ZERO,
            bufferedEvents: NUM.ZERO,
            bufferReplayInFlight: false,
          };
          missingDiagnosticsPartitionIds.push(partitionId);
          continue;
        }

        const diagnostics =
          partitionService.getCDCSubscriptionDiagnostics();
        if (!diagnostics ||
            typeof diagnostics !== TYPEOF.OBJECT) {
          partitionDiagnosticsById[partitionId] = {
            diagnosticsAvailable: false,
            ready: false,
            subscriberCount: NUM.ZERO,
            bufferedEvents: NUM.ZERO,
            bufferReplayInFlight: false,
          };
          missingDiagnosticsPartitionIds.push(partitionId);
          continue;
        }

        const subscriberCount =
          toNonNegativeInteger(diagnostics.subscriberCount);
        const bufferedEvents =
          toNonNegativeInteger(diagnostics.bufferedEvents);
        const bufferReplayInFlight =
          diagnostics.bufferReplayInFlight === true;
        const ready = subscriberCount > NUM.ZERO &&
          bufferedEvents === NUM.ZERO &&
          bufferReplayInFlight !== true;

        partitionDiagnosticsById[partitionId] = {
          diagnosticsAvailable: true,
          ready,
          subscriberCount,
          bufferedEvents,
          bufferReplayInFlight,
          diagnostics,
        };
        if (subscriberCount <= NUM.ZERO) {
          noSubscriberPartitionIds.push(partitionId);
        }
        if (bufferedEvents > NUM.ZERO ||
            bufferReplayInFlight === true) {
          bufferedPartitionIds.push(partitionId);
        }
      }
    }

    const localPartitionIds =
      uniqueSorted(Object.keys(partitionDiagnosticsById));
    const diagnosticsAvailablePartitionCount =
      Object.values(partitionDiagnosticsById)
        .filter((entry) => entry?.diagnosticsAvailable === true)
        .length;
    const readyLocalPartitionCount =
      Object.values(partitionDiagnosticsById)
        .filter((entry) => entry?.ready === true)
        .length;

    return {
      schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.CDC_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      telemetry: this.buildLocalCdcTelemetry(),
      clusterPartitionCount: clusterPartitionIds.length,
      clusterPartitionIds,
      localPartitionCount: localPartitionIds.length,
      localPartitionIds,
      diagnosticsAvailablePartitionCount,
      readyLocalPartitionCount,
      missingDiagnosticsPartitionIds:
        uniqueSorted(missingDiagnosticsPartitionIds),
      noSubscriberPartitionIds:
        uniqueSorted(noSubscriberPartitionIds),
      bufferedPartitionIds:
        uniqueSorted(bufferedPartitionIds),
      partitionDiagnosticsById,
    };
  }

  /**
   * Build node-local partition diagnostics payload.
   * @return {Object}
   */
  buildLocalPartitionDiagnostics() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.PARTITION_DIAGNOSTICS_UNAVAILABLE,
      );
    }
    const capturedAt = this.nowFn();
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    const leaderSummary =
      this.buildControlSnapshotLeaderSummary(
        partitionRows,
        serviceRows,
      );
    const voterCounts =
      this.buildControlSnapshotVoterCounts(serviceRows);
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );

    const partitionMetadataById = {};
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }
      partitionMetadataById[partitionId] = {
        tableId: firstStringField(partitionRow, COLUMN.TABLE_ID, 'tableId'),
        tableName: firstStringField(partitionRow, 'table_name', 'tableName'),
        state: firstStringField(partitionRow, COLUMN.STATE, 'partitionState'),
      };
    }

    const replicasByPartitionId = {};
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'type',
        'serviceType',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }

      replicasByPartitionId[partitionId] =
        replicasByPartitionId[partitionId] || [];
      replicasByPartitionId[partitionId].push({
        replicaId: firstStringField(
          serviceRow,
          COLUMN.REPLICA_ID,
          COLUMN.SERVICE_ID,
          'replicaId',
          'id',
        ),
        nodeId: firstStringField(
          serviceRow,
          COLUMN.NODE_ID,
          'nodeId',
        ),
        raftRole: firstStringField(
          serviceRow,
          COLUMN.RAFT_ROLE,
          'raftRole',
        ),
        status: firstStringField(serviceRow, COLUMN.STATUS, 'status'),
        address: firstStringField(serviceRow, COLUMN.ADDRESS, 'address'),
      });
    }

    const partitionIds = uniqueSorted([
      ...Object.keys(partitionMetadataById),
      ...Object.keys(replicasByPartitionId),
    ]);
    const partitionsById = {};
    for (const partitionId of partitionIds) {
      const metadata =
        partitionMetadataById[partitionId] || {};
      const replicas =
        replicasByPartitionId[partitionId] ||
        ADMIN_CACHE_DUMP.EMPTY;
      const activeReplicaCount = replicas
        .filter((replica) =>
          String(replica?.status || '').toLowerCase() === STATUS_ACTIVE)
        .length;
      partitionsById[partitionId] = {
        partitionId,
        tableId: metadata.tableId || null,
        tableName: metadata.tableName || null,
        state: metadata.state || PARTITION_STATE_UNKNOWN,
        leaderNodeId:
          leaderSummary.leaders[partitionId] || null,
        voterCount:
          toNonNegativeInteger(voterCounts[partitionId]),
        replicaCount: replicas.length,
        activeReplicaCount,
        replicaRoles:
          leaderSummary.replicaRoles[partitionId] || {},
        replicaRoleDiagnostics:
          leaderSummary.replicaRoleDiagnostics[partitionId] || {
            canonicalLeaderNodeId: null,
            source: TABLES.PARTITIONS,
            inconsistentReplicaRoles: false,
            replicaLeaderNodeIds: ADMIN_CACHE_DUMP.EMPTY,
            issues: ADMIN_CACHE_DUMP.EMPTY,
          },
        replicas,
      };
    }

    return {
      schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      partitionCount: partitionIds.length,
      leaders: leaderSummary.leaders,
      voterCounts,
      replicaRoleDiagnostics:
        leaderSummary.replicaRoleDiagnostics,
      replicaOperations,
      partitionsById,
    };
  }

  /**
   * Build node-local cluster SQL diagnostics payload.
   * @return {Object}
   */
  buildLocalSqlDiagnostics() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.SQL_DIAGNOSTICS_UNAVAILABLE,
      );
    }
    const capturedAt = this.nowFn();
    const nodeRows =
      this.systemTableCache.getAll(TABLES.NODES);
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const tableRows =
      this.systemTableCache.getAll(TABLES.TABLES);
    const sqlQueryEngine = this.sqlQueryEngine;
    const queryEngineAvailable =
      Boolean(sqlQueryEngine &&
        typeof sqlQueryEngine.executeRequest ===
          TYPEOF.FUNCTION);
    const queryExecutor =
      sqlQueryEngine?.queryExecutor || null;
    const lastCoordinatorMetrics =
      queryExecutor &&
      typeof queryExecutor.getLastCoordinatorMetrics === TYPEOF.FUNCTION ?
        queryExecutor.getLastCoordinatorMetrics() :
        null;

    let provisionTargetDiagnostics = null;
    if (sqlQueryEngine &&
        typeof sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics ===
          TYPEOF.FUNCTION) {
      const diagnosticsResult =
        sqlQueryEngine.resolveProvisionTargetNodeIdsWithDiagnostics(
          SQL_DIAGNOSTICS_REPLICA_COUNT,
        );
      if (diagnosticsResult?.diagnostics &&
          typeof diagnosticsResult.diagnostics === TYPEOF.OBJECT) {
        provisionTargetDiagnostics = diagnosticsResult.diagnostics;
      }
    } else if (sqlQueryEngine &&
      typeof sqlQueryEngine.resolveProvisionTargetNodeDiagnostics ===
        TYPEOF.FUNCTION) {
      provisionTargetDiagnostics =
        sqlQueryEngine.resolveProvisionTargetNodeDiagnostics(
          SQL_DIAGNOSTICS_REPLICA_COUNT,
        );
    }

    const activeNodeCount = nodeRows
      .filter((row) =>
        String(firstStringField(row, COLUMN.STATUS, 'state') || '')
          .toLowerCase() === STATUS_ACTIVE)
      .length;

    return {
      schemaVersion: ADMIN_OPERATIONAL_DIAGNOSTICS.SQL_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      queryEngineAvailable,
      cluster: {
        nodeCount: nodeRows.length,
        activeNodeCount,
        partitionCount: partitionRows.length,
        tableCount: tableRows.length,
      },
      queryEngine: {
        timeoutMs:
          Number.isFinite(Number(sqlQueryEngine?.queryTimeoutMs)) ?
            Number(sqlQueryEngine.queryTimeoutMs) :
            null,
        fanoutMetricsAvailable:
          lastCoordinatorMetrics !== null,
        lastCoordinatorMetrics,
        provisionTargetDiagnostics,
        transactionRecovery:
          sqlQueryEngine?.lastTransactionRecoveryReplayResult &&
            typeof sqlQueryEngine.lastTransactionRecoveryReplayResult ===
              TYPEOF.OBJECT ?
            sqlQueryEngine.lastTransactionRecoveryReplayResult :
            null,
        trackedWriteSplitEvaluations:
          sqlQueryEngine?.lastWriteSplitEvaluationByTable instanceof Map ?
            sqlQueryEngine.lastWriteSplitEvaluationByTable.size :
            NUM.ZERO,
      },
      splitEvaluation: this.resolveSplitEvaluationDiagnostics(),
    };
  }

  /**
   * Build canonical query_result payload for control snapshot
   * query.
   * @param {Object} [options={}]
   * @return {Object}
   */
  async buildControlSnapshotQueryResult(options = {}) {
    const forceAuthoritativeRepair =
      options.forceAuthoritativeRepair === true;
    const snapshot = await this.resolveLocalControlSnapshot(
      forceAuthoritativeRepair ?
        {
          forceAuthoritativeRepair: true,
          allowAuthoritativeRepair:
            options.allowAuthoritativeRepair,
          allowAuthoritativeReadinessRefresh:
            options.allowAuthoritativeReadinessRefresh,
          allowStaleReadinessOnCacheChange:
            options.allowStaleReadinessOnCacheChange,
        } :
        {
          allowAuthoritativeRepair:
            options.allowAuthoritativeRepair,
          allowAuthoritativeReadinessRefresh:
            options.allowAuthoritativeReadinessRefresh,
          allowStaleReadinessOnCacheChange:
            options.allowStaleReadinessOnCacheChange,
        },
    );
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName: ADMIN_CONTROL_SNAPSHOT.TABLE_NAME,
    };
  }
}

export {AdminControlSnapshot};
