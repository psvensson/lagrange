import {
  COLUMN,
  NUM,
} from '../../constants/index.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_COLON = ':';

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE_LOCAL_PARTITION: 'authoritative_local_partition',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  RETAINED_CACHE_OWNER: 'retained_cache_owner',
  AUTHORITATIVE_OWNER_MISSING: 'authoritative_owner_missing',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON = Object.freeze({
  NO_LOCAL_ROWSETS: 'no_local_rowsets',
  EMPTY_LOCAL_AUTHORITATIVE_ROWS: 'empty_local_authoritative_rows',
  AUTHORITATIVE_ROWS_AVAILABLE: 'authoritative_rows_available',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG = Object.freeze({
  NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE:
    'No partition leaders found in system cache',
  SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE:
    'Bootstrap snapshot diverged from local authoritative partition state',
  AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE:
    'Bootstrap authoritative partition snapshot preserved missing leader ownership while local rows converge',
  RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE:
    'Bootstrap authoritative partition snapshot retained cached leader ownership for a priority control-plane partition while local rows converge',
  EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE:
    'Bootstrap authoritative snapshot was empty; retaining cached system-table rows',
  FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION:
    'Failed to read authoritative snapshot rows from local partition',
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_FIELD = Object.freeze({
  LEADER_NODE_ID: COLUMN.LEADER_NODE_ID,
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD =
  Object.freeze({
    PARTITION_COUNT: 'partitionCount',
    PARTITION_IDS: 'partitionIds',
  });

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS = NUM.FIVE;

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE = Object.freeze({
  AUTHORITATIVE_SNAPSHOT_TTL_MS: 250,
  WARNING_THROTTLE_MS: 5000,
});

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY = Object.freeze({
  NO_PARTITION_LEADERS_FOUND_IN_SYSTEM_CACHE:
    'no_partition_leaders_found_in_system_cache',
  EMPTY_LOCAL_AUTHORITATIVE_SNAPSHOT_RETAINING_CACHE:
    'empty_local_authoritative_snapshot_retaining_cache',
  SNAPSHOT_DIVERGED_FROM_LOCAL_AUTHORITATIVE_PARTITION_STATE:
    'snapshot_diverged_from_local_authoritative_partition_state',
  AUTHORITATIVE_PARTITION_OWNER_MISSING_DURING_CONVERGENCE:
    'authoritative_partition_owner_missing_during_convergence',
  RETAINED_CACHED_PARTITION_OWNER_DURING_CONVERGENCE:
    'retained_cached_partition_owner_during_convergence',
  FAILED_TO_READ_AUTHORITATIVE_SNAPSHOT_ROWS_FROM_LOCAL_PARTITION:
    'failed_to_read_authoritative_snapshot_rows_from_local_partition',
});

function normalizeBootstrapTopologySnapshotRowKey(value) {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }
  const normalizedValue = String(value).trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readBootstrapTopologySnapshotRowKey(tableName, row) {
  const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
  return normalizeBootstrapTopologySnapshotRowKey(row?.[keyField] ?? row?.id);
}

function readBootstrapTopologySnapshotPartitionLeaderNodeId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_FIELD.LEADER_NODE_ID] ??
      row?.leaderNodeId,
  );
}

function readBootstrapTopologySnapshotPartitionId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.PARTITION_ID] ??
      row?.partition_id ??
      row?.partitionId,
  );
}

function readBootstrapTopologySnapshotServicePartitionId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.PARTITION_ID] ??
      row?.partition_id ??
      row?.partitionId,
  );
}

function readBootstrapTopologySnapshotServiceNodeId(row) {
  return normalizeBootstrapTopologySnapshotRowKey(
    row?.[COLUMN.NODE_ID] ??
      row?.node_id ??
      row?.nodeId,
  );
}

function readBootstrapTopologySnapshotServiceType(row) {
  const serviceType =
    row?.[COLUMN.SERVICE_TYPE] ??
    row?.service_type ??
    row?.serviceType ??
    null;
  return typeof serviceType === 'string' &&
    serviceType.length > 0 ?
    serviceType :
    null;
}

function readBootstrapTopologySnapshotServiceStatus(row) {
  const status =
    row?.[COLUMN.STATUS] ??
    row?.status ??
    null;
  return typeof status === 'string' &&
    status.length > 0 ?
    status :
    null;
}

function readBootstrapTopologySnapshotServiceRaftRole(row) {
  const raftRole =
    row?.[COLUMN.RAFT_ROLE] ??
    row?.raft_role ??
    row?.raftRole ??
    null;
  return typeof raftRole === 'string' &&
    raftRole.length > 0 ?
    raftRole.toLowerCase() :
    null;
}

function resolveAuthoritativeSystemTableRowSourceSelection(options = {}) {
  const cacheRows = Array.isArray(options.cacheRows) ? options.cacheRows : [];
  const localRowSets = Array.isArray(options.localRowSets) ?
    options.localRowSets :
    [];
  const mergedRows = Array.isArray(options.mergedRows) ? options.mergedRows : [];

  if (localRowSets.length === 0) {
    return Object.freeze({
      source: BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.CACHE,
      reason:
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON.NO_LOCAL_ROWSETS,
      rows: cacheRows,
    });
  }

  if (mergedRows.length === 0 && cacheRows.length > 0) {
    return Object.freeze({
      source: BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.CACHE,
      reason:
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON
          .EMPTY_LOCAL_AUTHORITATIVE_ROWS,
      rows: cacheRows,
    });
  }

  return Object.freeze({
    source:
      BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE.AUTHORITATIVE_LOCAL_PARTITION,
    reason:
      BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON
        .AUTHORITATIVE_ROWS_AVAILABLE,
    rows: mergedRows,
  });
}

function resolveBootstrapTopologySnapshotPositiveInteger(
  value,
  fallbackValue,
) {
  if (!Number.isFinite(value)) {
    return fallbackValue;
  }
  const normalizedValue = Math.floor(value);
  if (normalizedValue <= 0) {
    return fallbackValue;
  }
  return normalizedValue;
}

export {
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_CACHE,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_LOG,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_MAX_IDS,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_PARTITION_STABILIZATION_PAYLOAD,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SELECTION_REASON,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_SOURCE,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE,
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_WARNING_KEY,
  LOCAL_STR_COLON,
  LOCAL_STR_EMPTY,
  readBootstrapTopologySnapshotPartitionId,
  readBootstrapTopologySnapshotPartitionLeaderNodeId,
  readBootstrapTopologySnapshotRowKey,
  readBootstrapTopologySnapshotServiceNodeId,
  readBootstrapTopologySnapshotServicePartitionId,
  readBootstrapTopologySnapshotServiceRaftRole,
  readBootstrapTopologySnapshotServiceStatus,
  readBootstrapTopologySnapshotServiceType,
  resolveAuthoritativeSystemTableRowSourceSelection,
  resolveBootstrapTopologySnapshotPositiveInteger,
};
