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
import {evaluateAuthoritativeRepairPolicy} from
  './admin-authoritative-repair-policy.js';
import {summarizeReplicaOperationLiveness} from
  '../rebalancer/replica-operation-liveness.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';

// ── file-local constants ────────────────────────────────────────────────────
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_STATE_NORMAL = 'NORMAL';
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const MANAGED_SPLIT_WORKFLOW_TYPE = 'managed_split';
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});

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
    this.cdcIntegrationService =
      deps.cdcIntegrationService || null;
    this.controlPlaneReadinessService =
      deps.controlPlaneReadinessService || null;
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
  async buildLocalControlSnapshot() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE,
      );
    }

    const nodeRows =
      this.systemTableCache.getAll(TABLES.NODES);
    const tableRows =
      this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    const capturedAt = this.nowFn();

    const nodeIds = uniqueSorted(nodeRows
      .map((row) => firstStringField(row, COLUMN.NODE_ID, 'id'))
      .filter(Boolean));
    const partitionIds = uniqueSorted(partitionRows
      .map((row) =>
        firstStringField(row, COLUMN.PARTITION_ID, 'id'))
      .filter(Boolean));

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

    return {
      schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      nodes: nodeIds,
      partitions: partitionIds,
      cdcTelemetry: this.buildLocalCdcTelemetry(),
      controlPlaneDiagnostics:
        await this.buildControlPlaneDiagnosticsSnapshot({
          capturedAt,
          tableRows,
        }),
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
    const snapshot = await this.buildLocalControlSnapshot();
    const forceAuthoritativeRepair =
      options.forceAuthoritativeRepair === true;
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return snapshot;
    }
    if (!forceAuthoritativeRepair &&
        !this.shouldAttemptAuthoritativeControlSnapshotRepair()) {
      return snapshot;
    }

    let repair = null;
    try {
      repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: CONTROL_SNAPSHOT_REPAIR_REASON,
        bypassReuse: forceAuthoritativeRepair,
      });
    } catch (_error) {
      repair = null;
    }

    if (repair?.applied !== true) {
      return snapshot;
    }
    return this.buildLocalControlSnapshot();
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
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return false;
    }

    const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const topologyGap = this.hasControlSnapshotPartitionTopologyGap(
      tableRows,
      partitionRows,
    );
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
    const replicaOperationSummary =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );
    const evaluation = evaluateAuthoritativeRepairPolicy({
      topologyGap,
      staleReplicaOpsInFlightCount:
        replicaOperationSummary.staleInFlightCount,
    });
    return evaluation.shouldRepair;
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
   * Build structured control-plane diagnostics for admin snapshots.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildControlPlaneDiagnosticsSnapshot(options = {}) {
    const capturedAt = Number.isFinite(options.capturedAt) ?
      options.capturedAt :
      this.nowFn();
    const readinessEntries = await this.resolveControlPlaneReadinessEntries();
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
    const readinessTransitionsByNodeId =
      this.resolveReadinessTransitionHistory();
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
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows,
      );
    const splitEvaluation = this.resolveSplitEvaluationDiagnostics();

    return {
      schemaVersion: CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      publicationMode,
      heartbeatPublication,
      readinessByNodeId,
      nodeLivenessByNodeId,
      readinessTransitionsByNodeId,
      placementEligibilityByNodeId,
      workflowAdmissionsByWorkflowId:
        workflowDiagnostics.workflowAdmissionsByWorkflowId,
      timeoutClassifications:
        workflowDiagnostics.timeoutClassifications,
      replicaOperations,
      splitEvaluation,
    };
  }

  /**
   * Resolve canonical readiness vectors when the owner is available.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async resolveControlPlaneReadinessEntries() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getAllNodeReadiness !==
          TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    try {
      const readiness =
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh: true,
          allowStaleOnCacheChange: true,
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
    const livenessSummary = summarizeReplicaOperationLiveness(
      replicaOperationRows,
      {
        partitionIds: scopedPartitionIds,
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
        {forceAuthoritativeRepair: true} :
        {},
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
