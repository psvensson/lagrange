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
import {isLoadReadyReplicaRaftRole} from
  '../node/replica-state-machine-constants.js';
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
const STATUS_UNKNOWN = 'unknown';
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
    this.cdcIntegrationService =
      deps.cdcIntegrationService || null;
    this.resolveLocalPartitionServices =
      typeof deps.resolveLocalPartitionServices === TYPEOF.FUNCTION ?
        deps.resolveLocalPartitionServices :
        null;
  }

  /**
   * Build local control snapshot payload from system cache only.
   * @return {Object}
   */
  buildLocalControlSnapshot() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE,
      );
    }

    const nodeRows =
      this.systemTableCache.getAll(TABLES.NODES);
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);

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
      capturedAt: Date.now(),
      nodes: nodeIds,
      partitions: partitionIds,
      cdcTelemetry: this.buildLocalCdcTelemetry(),
      leaders: leaderSummary.leaders,
      replicaRoles: leaderSummary.replicaRoles,
      replicaRoleDiagnostics:
        leaderSummary.replicaRoleDiagnostics,
      voterCounts,
      replicaOperations,
    };
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
    const statusHistogram = {};
    let inFlightCount = NUM.ZERO;
    const partitionGroupInFlight = {};
    for (const row of replicaOperationRows) {
      const partitionGroupId = firstStringField(
        row,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'entity_id',
        'entityId',
      ) || STATUS_UNKNOWN;
      if (scopedPartitionIds &&
          !scopedPartitionIds.has(partitionGroupId)) {
        continue;
      }
      const status = firstStringField(
        row, COLUMN.STATUS, 'status',
      ) || STATUS_UNKNOWN;
      statusHistogram[status] =
        (statusHistogram[status] || NUM.ZERO) + NUM.ONE;
      if (!ADMIN_CONTROL_SNAPSHOT
        .IN_FLIGHT_EXCLUDED_STATUSES.includes(status)) {
        inFlightCount += NUM.ONE;
        partitionGroupInFlight[partitionGroupId] =
          (partitionGroupInFlight[partitionGroupId] ||
            NUM.ZERO) + NUM.ONE;
      }
    }

    return {
      inFlightCount,
      statusHistogram,
      partitionGroupInFlight,
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
   * @return {Object}
   */
  buildControlSnapshotQueryResult() {
    const snapshot = this.buildLocalControlSnapshot();
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
