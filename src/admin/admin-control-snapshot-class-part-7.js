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
import { COLUMN, NUM, TABLES, TIME_MS, TYPEOF } from "../constants/index.js";
import { PARTITION_TRANSITION_METADATA_FIELD } from "../partition/partition-constants.js";
import { isLoadReadyReplicaRaftRole } from "../node/replica-state-machine-constants.js";
import { CONTROL_PLANE_READINESS_DIMENSION } from "../control-plane/control-plane-readiness-constants.js";
import { evaluateAuthoritativeRepairPolicy } from "./admin-authoritative-repair-policy.js";
import { AUTHORITATIVE_REPAIR_TRIGGER } from "./admin-authoritative-repair-policy.js";
import { summarizeReplicaOperationLiveness } from "../rebalancer/replica-operation-liveness.js";
import {
  TERMINAL_STATUSES as REPLICA_OPERATION_TERMINAL_STATUSES,
  isTerminalStep as isTerminalReplicaOperationStep,
  isValidWorkflowStep as isValidReplicaOperationStep,
} from "../rebalancer/replica-status.js";
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CONSISTENCY_MISMATCH_KIND,
} from "./admin-constants.js";
import {
  filterActiveServingPartitionRows,
  firstStringField,
  uniqueSorted,
} from "./admin-helpers.js";
import {
  resolveActiveNodeViews,
  buildReadinessByNodeId,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
} from "../control-plane/active-node-projection.js";
import { buildPublicationRecoveryProtocolSnapshot } from "../control-plane/recovery-protocol-snapshot.js";
import { normalizeControlPlanePublicationRow } from "../control-plane/system-row-normalizers.js";
import { buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots } from "../control-plane/priority-recovery-snapshot.js";
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from "../control-plane/priority-recovery-diagnostics-constants.js";
import { evaluateSharedMetadataNodeCoverage } from "./admin-shared-metadata-consistency.js";
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from "./admin-authoritative-repair-evaluation.js";
import { LogsTableService } from "../logging/logs-table-service.js";
import { StartupRecoveryCoordinator } from "../bootstrap/startup-recovery-coordinator.js";
import { assignAdminControlSnapshotReadinessDiagnosticsMethods } from "./admin-control-snapshot-readiness-diagnostics-methods.js";
import { assignAdminControlSnapshotLocalDiagnosticsMethods } from "./admin-control-snapshot-local-diagnostics-methods.js";
import { AdminControlSnapshotPart6 } from './admin-control-snapshot-class-part-6.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: "",
  READY: "ready",
  UPDATEDAT: "updatedAt",
  UPDATED_AT: "updated_at",
  UNKNOWN_ERROR: "unknown_error",
  PUBLISHED: "PUBLISHED",
  NODEID: "nodeId",
  ID: "id",
  NAME: "name",
  CAPTUREDAT: "capturedAt",
  SOURCELEADERNODEID: "sourceLeaderNodeId",
  DECISIONTIMESTAMP: "decisionTimestamp",
  FAILEDAT: "failedAt",
  NEXTATTEMPTAT: "nextAttemptAt",
  TABLEID: "tableId",
  TABLE_NAME: "table_name",
  TABLENAME: "tableName",
  PARTITIONSTATE: "partitionState",
  REPLICAID: "replicaId",
  RAFTROLE: "raftRole",
  STATUS: "status",
  ADDRESS: "address",
});
const LEADER_RAFT_ROLE = "leader";
const SERVICE_TYPE_PARTITION = "partition";
const STATUS_ACTIVE = "active";
const PARTITION_STATE_NORMAL = "NORMAL";
const PARTITION_STATE_UNKNOWN = "unknown";
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT = 64;
const CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS = 5000;
const MANAGED_SPLIT_WORKFLOW_TYPE = "managed_split";
const CONTROL_SNAPSHOT_REPAIR_REASON = "control_snapshot";
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: "steady",
  CATCHUP: "catchup",
});
const CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT = 5;
const MEMBERSHIP_PUBLICATION_KIND = "cluster_membership";
const CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD = "nodeStatePublication";
const CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD =
  "getControlPlanePublicationStorySync";
const CONTROL_PLANE_SNAPSHOT_OWNER_RESOLVE_METHOD = "resolveControlSnapshot";
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  "leader_resolution_gap";
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT = "query_timeout";
const AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE =
  "control_plane_backpressure";
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  "leader is unknown",
  "leader unknown",
  "no handler",
  "no leader",
  "partition_service_not_found",
  "partition service not found",
]);
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION = 1;
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = "partition";
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = "learner";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = "operation_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID = "partition_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID = "entity_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE = "entity_type";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS = "status";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP = "workflow_step";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID =
  "target_node_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID =
  "source_node_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID = "replica_id";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = "created_at";
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = "updated_at";
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = "raft_role";
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = "node_id";
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = "status";
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = "partition_id";
const PRIORITY_RECOVERY_STATUS_ACTIVE = "active";
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE =
  "not_control_plane_recovery_eligible";
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY =
  "recovery_eligible_not_repair_eligible";
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS = "readiness_unknown";
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP =
  "priority_spread_gap";
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING =
  "priority_partition_missing";
const PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED =
  "recovery_eligible_projection_included";
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED =
  "readiness_projection_excluded";
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY =
  "cluster_member_unhealthy";
const PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET = new Set(
  REPLICA_OPERATION_TERMINAL_STATUSES.map((status) =>
    String(status || "").toLowerCase(),
  ),
);
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = "diagnostics";
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
  const stats =
    LogsTableService.instance &&
    typeof LogsTableService.instance.getStats === TYPEOF.FUNCTION
      ? LogsTableService.instance.getStats()
      : null;
  if (!stats || typeof stats !== TYPEOF.OBJECT) {
    return null;
  }
  return {
    pendingWrites: toNonNegativeInteger(stats.pendingWrites),
    pendingWriteGrowthCount: toNonNegativeInteger(
      stats.pendingWriteGrowthCount,
    ),
    retainedBacklogGrowthCount: toNonNegativeInteger(
      stats.retainedBacklogGrowthCount,
    ),
    retainedPressureBacklogCap: toNonNegativeInteger(
      stats.retainedPressureBacklogCap,
    ),
    maxPendingWrites: toNonNegativeInteger(stats.maxPendingWrites),
    isWriting: stats.isWriting === true,
    consecutiveDeferredWriteFailures: toNonNegativeInteger(
      stats.consecutiveDeferredWriteFailures,
    ),
    sharedPressureBackpressured: stats.sharedPressureBackpressured === true,
  };
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain)
    ? repair.causeChain.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      )
    : ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > NUM.ZERO &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain)
    ? repair.causeChain.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      )
    : ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE)
  );
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.length > NUM.ZERO &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildAuthoritativeControlSnapshotRepairFailure(detail, cause = null) {
  const error = new Error(
    "Authoritative control snapshot repair failed: " +
      String(detail || "unknown_error"),
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
  return (
    String(
      localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    ).toLowerCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.READY
  );
}
function buildMembershipPublicationReadOptions(options = {}) {
  return options.preferAuthoritativeRead === true
    ? {
        preferAuthoritativeRead: true,
        readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
      }
    : { readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS };
}
function buildCdcReplayRetentionDiagnostics(partitionServices) {
  if (
    !(partitionServices instanceof Map) ||
    partitionServices.size === NUM.ZERO
  ) {
    return null;
  }
  const entries = [];
  for (const partitionService of partitionServices.values()) {
    if (
      !partitionService ||
      typeof partitionService.getStats !== TYPEOF.FUNCTION
    ) {
      continue;
    }
    const stats = partitionService.getStats();
    const replay =
      stats?.cdcReplay && typeof stats.cdcReplay === TYPEOF.OBJECT
        ? stats.cdcReplay
        : null;
    if (!replay) {
      continue;
    }
    entries.push({
      partitionId: String(
        stats?.partitionId || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      ),
      bufferedEvents: toNonNegativeInteger(replay.bufferedEvents),
      replayBufferGrowthCount: toNonNegativeInteger(
        replay.replayBufferGrowthCount,
      ),
      replayRetryDepth: toNonNegativeInteger(replay.replayRetryDepth),
      replayInFlight: replay.replayInFlight === true,
    });
  }
  if (entries.length === NUM.ZERO) {
    return null;
  }
  entries.sort((left, right) => {
    const leftPressureScore =
      left.bufferedEvents +
      left.replayBufferGrowthCount +
      left.replayRetryDepth;
    const rightPressureScore =
      right.bufferedEvents +
      right.replayBufferGrowthCount +
      right.replayRetryDepth;
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
  for (const entry of entries.slice(
    NUM.ZERO,
    CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT,
  )) {
    byPartitionId[entry.partitionId] = entry;
  }
  return {
    bufferedEvents,
    replayBufferGrowthCount,
    replayRetryDepth,
    partitionCount: entries.length,
    replayInFlightPartitionCount: entries.filter(
      (entry) => entry.replayInFlight,
    ).length,
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
    triggerCodes: Array.isArray(options.repairEvaluation?.triggerCodes)
      ? [...options.repairEvaluation.triggerCodes]
      : ADMIN_CACHE_DUMP.EMPTY,
    activeProjectionCoverageGap: activeProjection?.hasCoverageGap === true,
    activeProjectionMissingNodeIds: Array.isArray(
      activeProjection?.missingNodeIds,
    )
      ? [...activeProjection.missingNodeIds]
      : ADMIN_CACHE_DUMP.EMPTY,
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
  const publicationKind = String(
    normalizedRow.publicationKind || "",
  ).toLowerCase();
  return (
    publicationKind.length === NUM.ZERO ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND
  );
}
function resolveLatestMembershipPublicationRow(
  publicationRows = [],
  options = {},
) {
  const expectedStatus =
    typeof options.status === TYPEOF.STRING
      ? options.status.toUpperCase()
      : null;
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
      resolvePublicationOrderingValue(right, [
        "publicationEpoch",
        "publication_epoch",
      ]) -
      resolvePublicationOrderingValue(left, [
        "publicationEpoch",
        "publication_epoch",
      ]);
    if (publicationEpochDelta !== NUM.ZERO) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      resolvePublicationOrderingValue(right, ["publishedAt", "published_at"]) -
      resolvePublicationOrderingValue(left, ["publishedAt", "published_at"]);
    if (publishedAtDelta !== NUM.ZERO) {
      return publishedAtDelta;
    }
    return (
      resolvePublicationOrderingValue(right, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ]) -
      resolvePublicationOrderingValue(left, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ])
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
      .map((value) =>
        String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).trim(),
      )
      .filter((value) => value.length > NUM.ZERO),
  );
}
function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || "");
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const partitionSuffixIndex = normalizedPartitionId.lastIndexOf("-p");
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
  const normalizedPartitionId = String(partitionId || "").trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return null;
  }
  const normalizedEpoch = Number.isInteger(epoch)
    ? String(epoch)
    : PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId =
    typeof operationId === TYPEOF.STRING && operationId.length > NUM.ZERO
      ? operationId
      : PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN;
  return [normalizedPartitionId, normalizedEpoch, normalizedOperationId].join(
    PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR,
  );
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
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
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
  const reasons = Array.isArray(readinessEntry?.reasons)
    ? readinessEntry.reasons
    : [];
  return normalizePriorityRecoveryStringList(
    reasons.map((reason) =>
      String(reason?.code || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).trim(),
    ),
  );
}
function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT
      ? priorityPartitionSummary
      : null;
  const blockedPartitions = Array.isArray(normalizedSummary?.blockedPartitions)
    ? normalizedSummary.blockedPartitions
    : [];
  const missingPartitionIds = normalizePriorityRecoveryStringList(
    normalizedSummary?.missingPartitionIds,
  );
  const plannerByPartitionId = {};
  for (const partition of blockedPartitions) {
    const partitionId = String(partition?.partitionId || "").trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const spreadGap = Math.max(
      NUM.ZERO,
      normalizePriorityRecoveryInteger(partition?.spreadGap) || NUM.ZERO,
    );
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.readyDistinctNodeCount,
      ),
      spreadGap,
      ready: spreadGap === NUM.ZERO,
      reasons:
        spreadGap > NUM.ZERO
          ? [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP]
          : [],
    };
  }
  for (const partitionId of missingPartitionIds) {
    if (plannerByPartitionId[partitionId]) {
      if (
        !plannerByPartitionId[partitionId].reasons.includes(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        )
      ) {
        plannerByPartitionId[partitionId].reasons.push(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        );
      }
      continue;
    }
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        normalizedSummary?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: NUM.ZERO,
      spreadGap:
        normalizePriorityRecoveryInteger(
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
    typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT
      ? replicaOperationsSummary.operationTimelineById
      : {};
  const byOperationId = {};
  const byPartitionId = {};
  for (const replicaOperationRow of Array.isArray(replicaOperationRows)
    ? replicaOperationRows
    : []) {
    const operationId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
      "operationId",
    );
    if (!operationId) {
      continue;
    }
    const entityType = String(
      firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE,
        "entityType",
        "service_type",
        "serviceType",
      ) || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
    ).toLowerCase();
    if (
      entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION
    ) {
      continue;
    }
    const partitionId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID,
      "partitionId",
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID,
      "entityId",
    );
    if (!partitionId) {
      continue;
    }
    const timeline = Array.isArray(operationTimelineById[operationId])
      ? operationTimelineById[operationId]
      : [];
    const timelineSteps = normalizePriorityRecoveryStringList(
      timeline.map((entry) => String(entry?.step || "").trim()),
    );
    const latestTimelineEntry =
      timeline.length > NUM.ZERO ? timeline[timeline.length - 1] : null;
    const context = {
      operationId,
      partitionId,
      tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
      type: String(
        firstStringField(
          replicaOperationRow,
          "type",
          "operation_type",
          "operationType",
        ) || "",
      ).toUpperCase(),
      status: String(
        firstStringField(
          replicaOperationRow,
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS,
          "status",
        ) || "",
      ).toLowerCase(),
      workflowStep: String(
        firstStringField(
          replicaOperationRow,
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP,
          "workflowStep",
        ) || "",
      ).toUpperCase(),
      sourceNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID,
        "sourceNodeId",
      ),
      targetNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID,
        "targetNodeId",
      ),
      replicaId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID,
        "replicaId",
        "service_id",
        "serviceId",
      ),
      createdAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT
        ] ?? replicaOperationRow.createdAt,
      ),
      updatedAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT
        ] ?? replicaOperationRow.updatedAt,
      ),
      timelineLength: timeline.length,
      timelineStepCount: timelineSteps.length,
      latestTimelineStep:
        String(latestTimelineEntry?.step || "").toUpperCase() || null,
      latestTimelineStatus:
        String(latestTimelineEntry?.status || "").toLowerCase() || null,
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
  const operationType = String(operationContext.type || "").toUpperCase();
  const workflowStep = String(
    operationContext.workflowStep || "",
  ).toUpperCase();
  if (
    operationType.length > NUM.ZERO &&
    workflowStep.length > NUM.ZERO &&
    isValidReplicaOperationStep(operationType, workflowStep)
  ) {
    return isTerminalReplicaOperationStep(operationType, workflowStep);
  }
  const status = String(operationContext.status || "").toLowerCase();
  if (status.length === NUM.ZERO) {
    return false;
  }
  if (status === STATUS_ACTIVE) {
    return false;
  }
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
}
function buildPriorityRecoveryAdmissionByPartitionId(
  workflowAdmissionsByWorkflowId = {},
) {
  const admissionByPartitionId = {};
  for (const workflow of Object.values(workflowAdmissionsByWorkflowId || {})) {
    if (!workflow || typeof workflow !== TYPEOF.OBJECT) {
      continue;
    }
    const workflowId = String(workflow.workflowId || "").trim();
    if (workflowId.length === NUM.ZERO) {
      continue;
    }
    const admission =
      workflow.admission && typeof workflow.admission === TYPEOF.OBJECT
        ? workflow.admission
        : null;
    const partitionIds = normalizePriorityRecoveryStringList([
      workflow.sourcePartitionId,
      ...(Array.isArray(workflow.targetPartitionIds)
        ? workflow.targetPartitionIds
        : []),
    ]);
    for (const partitionId of partitionIds) {
      admissionByPartitionId[partitionId] = {
        workflowId,
        workflowType: workflow.workflowType || null,
        transitionState: workflow.transitionState || null,
        decisionType: admission?.decisionType || null,
        decisionDimension: admission?.decisionDimension || null,
        admissionDecisionAt: workflow.admissionDecisionAt || null,
        eligibleNodeIds: normalizePriorityRecoveryStringList(
          admission?.eligibleNodeIds,
        ),
        ineligibleNodes: Array.isArray(admission?.ineligibleNodes)
          ? admission.ineligibleNodes
              .map((entry) => ({
                nodeId: String(
                  entry?.nodeId || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
                ),
                reasonCodes: normalizePriorityRecoveryStringList(
                  entry?.reasonCodes,
                ),
              }))
              .filter((entry) => entry.nodeId.length > NUM.ZERO)
          : [],
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
      "partitionId",
    );
    if (!partitionId) {
      continue;
    }
    const status = String(
      firstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
        "status",
      ) || "",
    ).toLowerCase();
    const raftRole = String(
      firstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
        "raftRole",
      ) || "",
    ).toLowerCase();
    if (
      status !== PRIORITY_RECOVERY_STATUS_ACTIVE ||
      raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER
    ) {
      continue;
    }
    const nodeId = firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
      "nodeId",
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
        readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT
          ? readiness.dimensions
          : {};
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
      const reasonCodes =
        resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
      learnerHoldByNodeId[nodeId] = {
        holdReason: readiness
          ? recoveryEligible
            ? PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY
            : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE
          : PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
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
    typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT
      ? publicationConvergence.projectionDiagnostics
      : null;
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
      ...(Array.isArray(exclusionReasonsByNodeId[nodeId])
        ? exclusionReasonsByNodeId[nodeId]
        : []),
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
    ];
  }
  return {
    inclusionReasonsByNodeId,
    exclusionReasonsByNodeId,
  };
}
const CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: "available",
});
function hasDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  if (
    !publicationDiagnostics ||
    typeof publicationDiagnostics !== TYPEOF.OBJECT
  ) {
    return false;
  }
  if (
    publicationDiagnostics?.publicationObservation?.state ===
    CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE.AVAILABLE
  ) {
    return true;
  }
  if (
    publicationDiagnostics?.publishedActiveNodeIdsPresent === true ||
    Array.isArray(publicationDiagnostics?.publishedActiveNodeIds)
  ) {
    return true;
  }
  const publicationStatus = String(
    publicationDiagnostics?.status ||
      publicationDiagnostics?.publicationStatus ||
      publicationDiagnostics?.publicationObservation?.status ||
      ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  return publicationStatus === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED;
}
function selectDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  return hasDurablePublishedMembershipObservation(publicationDiagnostics)
    ? publicationDiagnostics
    : null;
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshot extends AdminControlSnapshotPart6 {
  buildControlSnapshotLeaderSummary(partitionRows = [], serviceRows = []) {
    const leaders = {};
    const replicaRoles = {};
    const replicaLeaderNodeIdsByPartition = new Map();
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        "type",
        "serviceType",
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        "partitionId",
      );
      if (!partitionId) {
        continue;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        "raftRole",
      );
      const normalizedRaftRole = String(raftRole || "").toLowerCase();
      if (!normalizedRaftRole) {
        continue;
      }
      const replicaId = firstStringField(
        serviceRow,
        COLUMN.REPLICA_ID,
        COLUMN.SERVICE_ID,
        "replicaId",
        "id",
      );
      if (!replicaId) {
        continue;
      }
      replicaRoles[partitionId] = replicaRoles[partitionId] || {};
      replicaRoles[partitionId][replicaId] = normalizedRaftRole;
      if (normalizedRaftRole !== LEADER_RAFT_ROLE) {
        continue;
      }
      const leaderNodeId = firstStringField(
        serviceRow,
        COLUMN.LEADER_NODE_ID,
        COLUMN.NODE_ID,
        "nodeId",
      );
      if (!leaderNodeId) {
        continue;
      }
      let partitionLeaderNodeIds =
        replicaLeaderNodeIdsByPartition.get(partitionId);
      if (!partitionLeaderNodeIds) {
        partitionLeaderNodeIds = new Set();
        replicaLeaderNodeIdsByPartition.set(
          partitionId,
          partitionLeaderNodeIds,
        );
      }
      partitionLeaderNodeIds.add(leaderNodeId);
    }
    const replicaRoleDiagnostics = {};
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        "partitionId",
        "id",
      );
      if (!partitionId) {
        continue;
      }
      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        "leaderNodeId",
      );
      if (canonicalLeaderNodeId) {
        leaders[partitionId] = canonicalLeaderNodeId;
      }
      const replicaLeaderNodeIds = uniqueSorted(
        Array.from(replicaLeaderNodeIdsByPartition.get(partitionId) || []),
      );
      const inconsistentReplicaRoles =
        replicaLeaderNodeIds.length > NUM.ONE ||
        (canonicalLeaderNodeId &&
          replicaLeaderNodeIds.length > NUM.ZERO &&
          !replicaLeaderNodeIds.includes(canonicalLeaderNodeId));
      replicaRoleDiagnostics[partitionId] = {
        canonicalLeaderNodeId: canonicalLeaderNodeId || null,
        source: TABLES.PARTITIONS,
        inconsistentReplicaRoles,
        replicaLeaderNodeIds,
        issues: inconsistentReplicaRoles
          ? [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE]
          : [],
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
        "type",
        "serviceType",
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, "status");
      if (
        String(status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() !==
        STATUS_ACTIVE
      ) {
        continue;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        "raftRole",
      );
      const normalizedRaftRole = String(raftRole || "").toLowerCase();
      if (
        !normalizedRaftRole ||
        !isLoadReadyReplicaRaftRole(normalizedRaftRole)
      ) {
        continue;
      }
      const address = firstStringField(serviceRow, COLUMN.ADDRESS, "address");
      if (!address) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        "partitionId",
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
    replicaOperationRows = [],
    options = {},
  ) {
    const scopedPartitionIds =
      options.partitionIds instanceof Set &&
      options.partitionIds.size > NUM.ZERO
        ? options.partitionIds
        : null;
    const serviceRows = Array.isArray(options.serviceRows)
      ? options.serviceRows
      : typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ? this.systemTableCache.getAll(TABLES.SERVICES)
        : ADMIN_CACHE_DUMP.EMPTY;
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
      rows: livenessSummary.rows,
      inFlightExcludedStatuses:
        ADMIN_CONTROL_SNAPSHOT.IN_FLIGHT_EXCLUDED_STATUSES,
    };
  } /**
   * Build node-local CDC telemetry with authoritative fallback
   * diagnostics.
   * @return {Object}
   */
}
export { AdminControlSnapshot };
