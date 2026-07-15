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
import {COLUMN, TABLES} from '../constants/index.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {
  ADMIN_CACHE_DUMP,
} from './admin-constants.js';
import {
  firstStringField,
} from './admin-helpers.js';
import {buildCanonicalPublicationRecoveryEvidence} from '../control-plane/publication-recovery-evidence.js';
import {buildPriorityRecoveryDecisionSnapshots as buildSharedPriorityRecoveryDecisionSnapshots} from '../control-plane/priority-recovery-snapshot.js';
import {LogsTableService} from '../logging/logs-table-service.js';
import {AdminControlSnapshotCoverageGapEvaluation} from './admin-control-snapshot-coverage-gap-evaluation.js';
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
const CONTROL_SNAPSHOT_RUNTIME_READER_FIELD = 'sqlQueryEngine';
const CONTROL_SNAPSHOT_RUNTIME_READER_EXECUTE_REQUEST_METHOD = 'executeRequest';
const CONTROL_SNAPSHOT_PUBLICATION_READER_AVAILABLE_FIELD =
  'queryEngineAvailable';
const PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OPTIONS = Object.freeze({
  allowOwnerLaneRetry: true,
});
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function toNonNegativeInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }
  return Math.floor(parsedValue);
}
function buildLogsTableRetentionDiagnostics() {
  const stats =
    LogsTableService.instance &&
    typeof LogsTableService.instance.getStats === 'function' ?
      LogsTableService.instance.getStats() :
      null;
  if (!stats || typeof stats !== 'object') {
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
function buildMembershipPublicationOwnerQueueDiagnostics(readinessService) {
  const membershipPublicationService =
    readinessService?.membershipPublicationService;
  if (
    !membershipPublicationService ||
    typeof membershipPublicationService.getControlPlaneOwnerQueueDepth !==
      'function'
  ) {
    return null;
  }
  const ownerQueueDepth =
    membershipPublicationService.getControlPlaneOwnerQueueDepth();
  return ownerQueueDepth && typeof ownerQueueDepth === 'object' ?
    ownerQueueDepth :
    null;
}
function mergeLogsTableOwnerQueueDiagnostics(logsTable, ownerQueueDepth) {
  if (!ownerQueueDepth) {
    return logsTable;
  }
  const base = logsTable && typeof logsTable === 'object' ?
    logsTable :
    {};
  return {
    ...base,
    ...ownerQueueDepth,
    pendingWrites: Math.max(
      toNonNegativeInteger(base.pendingWrites),
      toNonNegativeInteger(ownerQueueDepth.pendingWrites),
    ),
    pendingWriteGrowthCount: Math.max(
      toNonNegativeInteger(base.pendingWriteGrowthCount),
      toNonNegativeInteger(ownerQueueDepth.pendingWriteGrowthCount),
    ),
    retainedBacklogGrowthCount: Math.max(
      toNonNegativeInteger(base.retainedBacklogGrowthCount),
      toNonNegativeInteger(ownerQueueDepth.retainedBacklogGrowthCount),
    ),
    sharedPressureBackpressured:
      base.sharedPressureBackpressured === true ||
      ownerQueueDepth.sharedPressureBackpressured === true,
    transportPressureBackpressured:
      base.transportPressureBackpressured === true ||
      ownerQueueDepth.transportPressureBackpressured === true,
    queryPressureBackpressured:
      base.queryPressureBackpressured === true ||
      ownerQueueDepth.queryPressureBackpressured === true,
  };
}
function buildCdcReplayRetentionDiagnostics(partitionServices) {
  if (
    !(partitionServices instanceof Map) ||
    partitionServices.size === 0
  ) {
    return null;
  }
  const entries = [];
  for (const partitionService of partitionServices.values()) {
    if (
      !partitionService ||
      typeof partitionService.getStats !== 'function'
    ) {
      continue;
    }
    const stats = partitionService.getStats();
    const replay =
      stats?.cdcReplay && typeof stats.cdcReplay === 'object' ?
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
  if (entries.length === 0) {
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
  let bufferedEvents = 0;
  let replayBufferGrowthCount = 0;
  let replayRetryDepth = 0;
  for (const entry of entries) {
    bufferedEvents += entry.bufferedEvents;
    replayBufferGrowthCount += entry.replayBufferGrowthCount;
    replayRetryDepth = Math.max(replayRetryDepth, entry.replayRetryDepth);
  }
  for (const entry of entries.slice(
    0,
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
function hasControlSnapshotRuntimeReaderAvailable(runtimeReader = null) {
  return Boolean(
    runtimeReader &&
    typeof runtimeReader[
      CONTROL_SNAPSHOT_RUNTIME_READER_EXECUTE_REQUEST_METHOD
    ] === 'function',
  );
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotControlPlaneDiagnostics
  extends AdminControlSnapshotCoverageGapEvaluation {
  /**
   * Resolve whether the cached active-node projection has crossed the
   * heartbeat owner's explicit ready-lease boundary. Heartbeat rows are
   * intentionally coalesced, so raw heartbeat age cannot independently make
   * a snapshot stale while its owner-authored lease is still valid.
   * @param {Array<Object>} nodeRows
   * @param {number} capturedAtMs
   * @return {boolean}
   * @private
   */
  resolveControlSnapshotCacheStaleWatermark(
    nodeRows = [],
    capturedAtMs = null,
  ) {
    const observedAtMs = Number.isFinite(capturedAtMs) ?
      capturedAtMs :
      this.nowFn();
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
      if (!isNodeRecordReady(nodeRow, {
        now: observedAtMs,
        requireActiveStatus: status === STATUS_ACTIVE,
      })) {
        return true;
      }
    }
    return false;
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
    const allowAuthoritativePublishedMembershipRecovery =
      options.allowAuthoritativePublishedMembershipRecovery === true ||
      options.preferAuthoritativePublicationRead === true ||
      options.reconcileAuthoritativeMembershipPublication === true;
    const boundedObservationProbe = options.boundedObservationProbe === true;
    const observedMembershipPublication =
      await this.ensureMembershipPublicationObservation({
        preferAuthoritativeRead:
          options.preferAuthoritativePublicationRead === true,
        reconcileAuthoritativeMembershipPublication:
          options.reconcileAuthoritativeMembershipPublication === true,
        publicationActiveGateHandoff:
          options.publicationActiveGateHandoff,
        boundedObservationProbe,
      });
    let observedPublishedMembership =
      await this.ensurePublishedMembershipObservation(
        observedMembershipPublication,
        {
          preferAuthoritativeRead:
            options.preferAuthoritativePublicationRead === true,
          boundedObservationProbe,
        },
      );
    if (
      !boundedObservationProbe &&
      !observedPublishedMembership &&
      allowAuthoritativePublishedMembershipRecovery === true &&
      options.preferAuthoritativePublicationRead !== true &&
      observedMembershipPublication &&
      typeof observedMembershipPublication === 'object' &&
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
        !boundedObservationProbe &&
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
    const readerAvailable = hasControlSnapshotRuntimeReaderAvailable(
      this[CONTROL_SNAPSHOT_RUNTIME_READER_FIELD],
    );
    const publicationConvergence =
      this.resolvePublicationConvergenceDiagnostics(
        readinessEntries,
        observedMembershipPublication,
        {
          preferAuthoritativePublicationRead:
            options.preferAuthoritativePublicationRead === true,
          reconcileAuthoritativeMembershipPublication:
            options.reconcileAuthoritativeMembershipPublication === true,
          publicationActiveGateHandoff:
            options.publicationActiveGateHandoff,
          [CONTROL_SNAPSHOT_PUBLICATION_READER_AVAILABLE_FIELD]:
            readerAvailable,
        },
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
      typeof this.startupRecoveryCoordinator.evaluate === 'function' ?
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
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, {
        controlPlaneDiagnostics: {
          publicationConvergence,
        },
      });
    const logsTable = mergeLogsTableOwnerQueueDiagnostics(
      buildLogsTableRetentionDiagnostics(),
      buildMembershipPublicationOwnerQueueDiagnostics(
        this.controlPlaneReadinessService,
      ),
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
        logsTable,
      });
    this.schedulePriorityRecoveryDispatchPendingReentries(
      priorityRecoveryDecisionSnapshots,
    );
    const publicationEvidence =
      this.resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
        readinessEntries,
        publicationConvergence,
        priorityRecoveryDecisionSnapshots,
        {
          logsTable,
          publicationActiveGateHandoff: options.publicationActiveGateHandoff,
        },
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
        publicationActiveGateHandoff: options.publicationActiveGateHandoff,
      }).priorityRecoveryObservation;
    const splitEvaluation = this.resolveSplitEvaluationDiagnostics();
    const partitionServices =
      this.resolveLocalPartitionServices &&
      typeof this.resolveLocalPartitionServices === 'function' ?
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
          {
            [CONTROL_SNAPSHOT_PUBLICATION_READER_AVAILABLE_FIELD]:
              readerAvailable,
          },
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

  resolvePriorityRecoveryDispatchPendingWorkflowOwner() {
    const workflowOwner =
      this.sqlQueryEngine?.rebalanceCoordinator?.workflowOwner || null;
    return (
      workflowOwner &&
      typeof workflowOwner.schedulePriorityRecoveryDispatchPendingReentry ===
        'function'
    ) ?
      workflowOwner :
      null;
  }

  schedulePriorityRecoveryDispatchPendingReentries(
    priorityRecoveryDecisionSnapshots,
  ) {
    const workflowOwner =
      this.resolvePriorityRecoveryDispatchPendingWorkflowOwner();
    if (!workflowOwner) {
      return 0;
    }
    const snapshots = Array.isArray(
      priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      priorityRecoveryDecisionSnapshots.snapshots :
      ADMIN_CACHE_DUMP.EMPTY;
    let scheduledCount = 0;
    for (const decisionSnapshot of snapshots) {
      const operation = decisionSnapshot?.coordinator?.operation || null;
      const operations = operation ? [operation] : ADMIN_CACHE_DUMP.EMPTY;
      if (
        workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
          decisionSnapshot,
          operations,
          PRIORITY_RECOVERY_DISPATCH_PENDING_REENTRY_OPTIONS,
        ) === true
      ) {
        scheduledCount += 1;
      }
    }
    return scheduledCount;
  }
}
export {AdminControlSnapshotControlPlaneDiagnostics};
