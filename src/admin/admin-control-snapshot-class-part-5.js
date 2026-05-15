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
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  ADMIN_CACHE_DUMP,
} from './admin-constants.js';
import {
  firstStringField,
} from './admin-helpers.js';
import {buildCanonicalPublicationRecoveryEvidence} from '../control-plane/publication-recovery-evidence.js';
import {buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots} from '../control-plane/priority-recovery-snapshot.js';
import {LogsTableService} from '../logging/logs-table-service.js';
import {AdminControlSnapshotPart4} from './admin-control-snapshot-class-part-4.js';
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
const STATUS_ACTIVE = 'active';
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT = 5;
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION = 1;
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
    typeof LogsTableService.instance.getStats === TYPEOF.FUNCTION ?
      LogsTableService.instance.getStats() :
      null;
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
    transportPressureBackpressured:
      stats.transportPressureBackpressured === true,
    queryPressureBackpressured:
      stats.queryPressureBackpressured === true,
  };
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
      stats?.cdcReplay && typeof stats.cdcReplay === TYPEOF.OBJECT ?
        stats.cdcReplay :
        null;
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
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart5 extends AdminControlSnapshotPart4 {
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
      const status = String(
        firstStringField(nodeRow, COLUMN.STATUS, 'status') || '',
      ).toLowerCase();
      const connectionState = String(
        firstStringField(
          nodeRow,
          COLUMN.CONNECTION_STATE,
          'connection_state',
          'connectionState',
        ) || '',
      ).toLowerCase();
      const considerForStaleness =
        status === STATUS_ACTIVE ||
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
        reconcileAuthoritativeMembershipPublication:
          options.reconcileAuthoritativeMembershipPublication === true,
        publicationActiveGateHandoff:
          options.publicationActiveGateHandoff,
      });
    let observedPublishedMembership =
      await this.ensurePublishedMembershipObservation(
        observedMembershipPublication,
        {
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
        },
      );
    if (
      !observedPublishedMembership &&
      options.preferAuthoritativePublicationRead !== true &&
      observedMembershipPublication &&
      typeof observedMembershipPublication === TYPEOF.OBJECT &&
      String(
        observedMembershipPublication.status ||
          ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
      ).toUpperCase() !== ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED
    ) {
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
    const recoveryEpochsByNodeId = this.resolveRecoveryEpochDiagnostics();
    const controlPlaneOperations =
      this.resolveControlPlaneOperationDiagnostics();
    const startupRecovery =
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION ?
        this.startupRecoveryCoordinator.evaluate() :
        null;
    const heartbeatPublication = this.resolveHeartbeatPublicationDiagnostics();
    const workflowDiagnostics = this.buildWorkflowAdmissionDiagnostics(
      Array.isArray(options.tableRows) ?
        options.tableRows :
        this.systemTableCache?.getAll(TABLES.TABLES),
    );
    const replicaOperationRows =
      this.systemTableCache?.getAll(TABLES.REPLICA_OPERATIONS) ||
      ADMIN_CACHE_DUMP.EMPTY;
    const serviceRows =
      this.systemTableCache?.getAll(TABLES.SERVICES) || ADMIN_CACHE_DUMP.EMPTY;
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);
    const logsTable = buildLogsTableRetentionDiagnostics();
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
        logsTable,
      });
    const publicationEvidence =
      this.resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
        readinessEntries,
        publicationConvergence,
        priorityRecoveryDecisionSnapshots,
        {logsTable},
      );
    const publicationConvergenceGate =
      publicationEvidence.publicationConvergenceGate;
    const resolvedPublicationConvergence =
      publicationEvidence.publicationConvergence || publicationConvergence;
    const priorityRecoveryObservation =
      publicationEvidence.priorityRecoveryObservation ||
      buildCanonicalPublicationRecoveryEvidence({
        publicationConvergence: resolvedPublicationConvergence,
        publicationConvergenceGate,
        priorityRecoveryDecisionSnapshots,
        logsTable,
      }).priorityRecoveryObservation;
    const splitEvaluation = this.resolveSplitEvaluationDiagnostics();
    const partitionServices =
      this.resolveLocalPartitionServices &&
      typeof this.resolveLocalPartitionServices === TYPEOF.FUNCTION ?
        this.resolveLocalPartitionServices() :
        null;
    const cdcReplay = buildCdcReplayRetentionDiagnostics(partitionServices);
    return {
      schemaVersion: CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      publicationMode,
      publicationConvergence: resolvedPublicationConvergence,
      publicationConvergenceGate,
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
      timeoutClassifications: workflowDiagnostics.timeoutClassifications,
      controlPlaneOperations,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryObservation,
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
    return buildSharedPriorityRecoveryDecisionSnapshots({
      ...options,
      schemaVersion: PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION,
    });
  }
}
export {AdminControlSnapshotPart5};
