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
import {isLoadReadyReplicaRaftRole} from '../node/replica-state-machine-constants.js';
import {summarizeReplicaOperationLiveness} from '../rebalancer/replica-operation-liveness.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {AdminControlSnapshotPart6} from './admin-control-snapshot-class-part-6.js';
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
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_LEADER_AUTHORITY_SCHEMA_VERSION = 1;
const PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS = TABLES.PARTITIONS;
const PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_VERSION =
  'partition_version';
const PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_VERSION_CAMEL =
  'partitionVersion';
const PARTITION_LEADER_AUTHORITY_FIELD_ACTIVE_PARTITION_VERSION =
  'active_partition_version';
const PARTITION_LEADER_AUTHORITY_FIELD_ACTIVE_PARTITION_VERSION_CAMEL =
  'activePartitionVersion';
const PARTITION_LEADER_AUTHORITY_FIELD_PUBLICATION_EPOCH =
  'publicationEpoch';
const PARTITION_LEADER_AUTHORITY_INTEGER_STATE_AVAILABLE = 'available';
const PARTITION_LEADER_AUTHORITY_INTEGER_STATE_UNAVAILABLE = 'unavailable';
const PARTITION_LEADER_AUTHORITY_LEADER_STATE_AVAILABLE = 'available';
const PARTITION_LEADER_AUTHORITY_LEADER_STATE_UNAVAILABLE = 'unavailable';
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */

function firstNonNegativeIntegerField(row, ...fieldNames) {
  for (const fieldName of fieldNames) {
    const value = row?.[fieldName];
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue >= NUM.ZERO) {
      return {
        state: PARTITION_LEADER_AUTHORITY_INTEGER_STATE_AVAILABLE,
        value: Math.floor(numericValue),
      };
    }
  }
  return {
    state: PARTITION_LEADER_AUTHORITY_INTEGER_STATE_UNAVAILABLE,
  };
}

function buildPartitionLeaderAuthorityCertificate({
  partitionId,
  leaderNodeId,
  leaderSource = PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS,
  partitionRow,
  publicationEpoch,
  replicaLeaderNodeIds,
  inconsistentReplicaRoles,
}) {
  const certificate = {
    schemaVersion: PARTITION_LEADER_AUTHORITY_SCHEMA_VERSION,
    partitionId,
    leaderNodeId,
    leaderSource,
    replicaRoleConsistent: inconsistentReplicaRoles !== true,
    replicaLeaderNodeIds,
  };
  const topologyEpoch = firstNonNegativeIntegerField(
    partitionRow,
    PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_VERSION,
    PARTITION_LEADER_AUTHORITY_FIELD_PARTITION_VERSION_CAMEL,
    PARTITION_LEADER_AUTHORITY_FIELD_ACTIVE_PARTITION_VERSION,
    PARTITION_LEADER_AUTHORITY_FIELD_ACTIVE_PARTITION_VERSION_CAMEL,
  );
  if (
    topologyEpoch.state === PARTITION_LEADER_AUTHORITY_INTEGER_STATE_AVAILABLE
  ) {
    certificate.topologyEpoch = topologyEpoch.value;
  }
  if (
    publicationEpoch?.state ===
    PARTITION_LEADER_AUTHORITY_INTEGER_STATE_AVAILABLE
  ) {
    certificate.membershipEpoch = publicationEpoch.value;
  }
  return certificate;
}

function normalizeControlSnapshotCanonicalLeader(canonicalLeaderNodeId) {
  if (
    typeof canonicalLeaderNodeId === TYPEOF.STRING &&
    canonicalLeaderNodeId.length > NUM.ZERO
  ) {
    return {
      state: PARTITION_LEADER_AUTHORITY_LEADER_STATE_AVAILABLE,
      value: canonicalLeaderNodeId,
    };
  }
  return {
    state: PARTITION_LEADER_AUTHORITY_LEADER_STATE_UNAVAILABLE,
  };
}

function resolveControlSnapshotLeaderDecision({
  canonicalLeaderNodeId,
  replicaLeaderNodeIds,
}) {
  const canonicalLeader =
    normalizeControlSnapshotCanonicalLeader(canonicalLeaderNodeId);
  const normalizedReplicaLeaderNodeIds = uniqueSorted(
    Array.isArray(replicaLeaderNodeIds) ? replicaLeaderNodeIds : [],
  );
  const hasSingleReplicaLeader =
    normalizedReplicaLeaderNodeIds.length === NUM.ONE;
  const hasMultipleReplicaLeaders =
    normalizedReplicaLeaderNodeIds.length > NUM.ONE;
  const hasCanonicalLeader =
    canonicalLeader.state === PARTITION_LEADER_AUTHORITY_LEADER_STATE_AVAILABLE;
  const replicaLeaderDisagrees =
    hasCanonicalLeader &&
    hasSingleReplicaLeader &&
    canonicalLeader.value !== normalizedReplicaLeaderNodeIds[NUM.ZERO];
  const decision = {
    leaderState: canonicalLeader.state,
    leaderSource: PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS,
    inconsistentReplicaRoles:
      hasMultipleReplicaLeaders || replicaLeaderDisagrees === true,
    replicaLeaderNodeIds: normalizedReplicaLeaderNodeIds,
  };
  if (hasCanonicalLeader) {
    decision.leaderNodeId = canonicalLeader.value;
  }
  return Object.freeze(decision);
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshot extends AdminControlSnapshotPart6 {
  buildControlSnapshotLeaderSummary(
    partitionRows = [],
    serviceRows = [],
    options = {},
  ) {
    const leaders = {};
    const replicaRoles = {};
    const partitionLeaderAuthority = {};
    const publicationEpoch = Number.isInteger(
      options?.[PARTITION_LEADER_AUTHORITY_FIELD_PUBLICATION_EPOCH],
    ) ?
      {
        state: PARTITION_LEADER_AUTHORITY_INTEGER_STATE_AVAILABLE,
        value: options[PARTITION_LEADER_AUTHORITY_FIELD_PUBLICATION_EPOCH],
      } :
      {
        state: PARTITION_LEADER_AUTHORITY_INTEGER_STATE_UNAVAILABLE,
      };
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
      const normalizedRaftRole = String(raftRole || '').toLowerCase();
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
      replicaRoles[partitionId] = replicaRoles[partitionId] || {};
      replicaRoles[partitionId][replicaId] = normalizedRaftRole;
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
      const replicaLeaderNodeIds = uniqueSorted(
        Array.from(replicaLeaderNodeIdsByPartition.get(partitionId) || []),
      );
      const leaderDecision = resolveControlSnapshotLeaderDecision({
        canonicalLeaderNodeId,
        replicaLeaderNodeIds,
      });
      if (
        leaderDecision.leaderState ===
        PARTITION_LEADER_AUTHORITY_LEADER_STATE_AVAILABLE
      ) {
        leaders[partitionId] = leaderDecision.leaderNodeId;
      }
      replicaRoleDiagnostics[partitionId] = {
        canonicalLeaderNodeId: canonicalLeaderNodeId || null,
        source: TABLES.PARTITIONS,
        inconsistentReplicaRoles: leaderDecision.inconsistentReplicaRoles,
        replicaLeaderNodeIds: leaderDecision.replicaLeaderNodeIds,
        issues: leaderDecision.inconsistentReplicaRoles ?
          [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE] :
          [],
      };
      if (
        leaderDecision.leaderState ===
        PARTITION_LEADER_AUTHORITY_LEADER_STATE_AVAILABLE
      ) {
        partitionLeaderAuthority[partitionId] =
          buildPartitionLeaderAuthorityCertificate({
            partitionId,
            leaderNodeId: leaderDecision.leaderNodeId,
            leaderSource: leaderDecision.leaderSource,
            partitionRow,
            publicationEpoch,
            replicaLeaderNodeIds: leaderDecision.replicaLeaderNodeIds,
            inconsistentReplicaRoles: leaderDecision.inconsistentReplicaRoles,
          });
      }
    }
    return {
      leaders,
      replicaRoles,
      replicaRoleDiagnostics,
      partitionLeaderAuthority,
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
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (
        String(status || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toLowerCase() !==
        STATUS_ACTIVE
      ) {
        continue;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raftRole',
      );
      const normalizedRaftRole = String(raftRole || '').toLowerCase();
      if (
        !normalizedRaftRole ||
        !isLoadReadyReplicaRaftRole(normalizedRaftRole)
      ) {
        continue;
      }
      const address = firstStringField(serviceRow, COLUMN.ADDRESS, 'address');
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
    replicaOperationRows = [],
    options = {},
  ) {
    const scopedPartitionIds =
      options.partitionIds instanceof Set &&
      options.partitionIds.size > NUM.ZERO ?
        options.partitionIds :
        null;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICES) :
        ADMIN_CACHE_DUMP.EMPTY;
    const isStartup =
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION ?
        this.startupRecoveryCoordinator.evaluate()?.ready !== true :
        false;
    const livenessSummary = summarizeReplicaOperationLiveness(
      replicaOperationRows,
      {
        partitionIds: scopedPartitionIds,
        serviceRows,
        nowMs: this.nowFn(),
        includeTimeline: true,
        ignorePreRestart: isStartup || options.ignorePreRestart === true,
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
export {AdminControlSnapshot};
