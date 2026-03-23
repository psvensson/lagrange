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
  ENDPOINT_STATUS,
  NUM,
  TABLES,
  TIME_MS,
  TRANSPORT_TYPE,
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
  buildReadinessByNodeId,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
  resolveCanonicalActiveNodeIds,
} from '../control-plane/active-node-projection.js';
import {evaluateSharedMetadataNodeCoverage} from
  './admin-shared-metadata-consistency.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {LogsTableService} from '../logging/logs-table-service.js';

// ── file-local constants ────────────────────────────────────────────────────
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_STATE_NORMAL = 'NORMAL';
const PARTITION_STATE_UNKNOWN = 'unknown';
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_SCHEMA_VERSION = 1;
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS = 5000;
const MANAGED_SPLIT_WORKFLOW_TYPE = 'managed_split';
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});
const CONTROL_PLANE_DIAGNOSTICS_CDC_REPLAY_LIMIT = 5;

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
    const controlPlaneDiagnostics =
      await this.buildControlPlaneDiagnosticsSnapshot({
        capturedAt,
        tableRows,
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
    const nodeIds = this.resolveControlSnapshotActiveNodeIds(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
    );
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
      nodes: nodeIds,
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
    const snapshot = await this.buildLocalControlSnapshot(options);
    const forceAuthoritativeRepair =
      options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair =
      options.allowAuthoritativeRepair === true;
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return snapshot;
    }
    if (!shouldAttemptAuthoritativeRepair({
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
      const wrappedError = new Error(
        'Authoritative control snapshot repair failed: ' +
        String(
          error?.message ||
          error ||
          'unknown_error',
        ),
      );
      wrappedError.cause = error;
      throw wrappedError;
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
      throw new Error(
        'Authoritative control snapshot repair failed: ' +
        String(detail),
      );
    }
    const repairedSnapshot =
      await this.buildLocalControlSnapshot(options);
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(
        repairedSnapshot,
      );
    if (forceAuthoritativeRepair &&
        hasAuthoritativeRepairTrigger(
          repairedEvaluation,
          AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
        )) {
      const missingNodeIds = Array.isArray(
        repairedEvaluation?.nodeCoverage?.activeProjection?.missingNodeIds,
      ) ?
        repairedEvaluation.nodeCoverage.activeProjection.missingNodeIds :
        ADMIN_CACHE_DUMP.EMPTY;
      throw new Error(
        'Authoritative control snapshot repair left active-node ' +
        'projection undercovered' +
        (
          missingNodeIds.length > NUM.ZERO ?
            ': ' + missingNodeIds.join(',') :
            ''
        ),
      );
    }
    return repairedSnapshot;
  }

  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
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
  ) {
    return resolveCanonicalActiveNodeIds({
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      readinessByNodeId: buildReadinessByNodeId({
        readinessByNodeId:
          controlPlaneDiagnostics?.readinessByNodeId || null,
      }),
      nowMs: this.nowFn(),
    });
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
    const activeNodeIds = new Set(this.resolveControlSnapshotActiveNodeIds(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      options.controlPlaneDiagnostics || null,
    ));
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
      logsTable,
      cdcReplay,
      cdcReplayByPartitionId: cdcReplay?.byPartitionId || null,
    };
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
