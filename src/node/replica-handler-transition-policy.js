/**
 * Pure transition / readiness policy helpers shared by the ReplicaHandler
 * lifecycle methods and the runtime metadata assembly. Extracted so the
 * status, voter-readiness, and runtime mixins can share a single definition.
 *
 * Requirements: 10.2, 3.1
 */
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {STATE} from '../constants/index.js';
import {OperationType, ReplicaStatus} from '../rebalancer/replica-status.js';
import {isNodeRecordReady} from './node-readiness-policy.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const REPLICA_HANDLER_LITERAL = Object.freeze({
  READY_LEASE_EXPIRES_AT: 'ready_lease_expires_at',
  READYLEASEEXPIRESAT: 'readyLeaseExpiresAt',
  READYLEASEEXPIRESATMS: 'readyLeaseExpiresAtMs',
  READYLEASEEXPIRES: 'readyLeaseExpires',
  REPLICAHANDLER: 'ReplicaHandler',
  READ: 'read',
  SYSTEM_TABLE_QUERY_FAILED: 'system table query failed',
});
const VOTER_READY_CHECK_INTERVAL_MS = 250;
const METADATA_RESOLUTION_POLL_INTERVAL_MS = 50;
const partitionMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
const tableMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
const PARTITION_METADATA_MISSING_PREFIX = partitionMetadataMissingError('');
const TABLE_METADATA_MISSING_PREFIX = tableMetadataMissingError('');
const CRITICAL_VOTER_READY_GATED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES = new Set([
  OperationType.REMOVE,
  OperationType.REPLACE,
]);
const SYSTEM_TABLE_HYDRATION_SQL = Object.freeze({
  PARTITION_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.PARTITIONS} WHERE partition_id = ?`,
  TABLE_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.TABLES} WHERE table_id = ?`,
  PARTITION_SERVICES:
    `SELECT * FROM ${SYSTEM_TABLE_NAME.SERVICES} ` +
    'WHERE partition_id = ? AND service_type = ?',
});
function resolveSnapshotStateForTransition(
  existingStatus,
  localStatus,
  targetStatus,
) {
  if (existingStatus) {
    return existingStatus;
  }
  if (localStatus && localStatus !== targetStatus) {
    return localStatus;
  }
  switch (targetStatus) {
  case ReplicaStatus.CREATING:
    return ReplicaStatus.PENDING;
  case ReplicaStatus.SYNCING:
    return ReplicaStatus.CREATING;
  case ReplicaStatus.ACTIVE:
    return ReplicaStatus.SYNCING;
  case ReplicaStatus.REMOVING:
    return ReplicaStatus.ACTIVE;
  case ReplicaStatus.REMOVED:
    return ReplicaStatus.REMOVING;
  default:
    return localStatus || ReplicaStatus.ACTIVE;
  }
}
function isFreshPartitionBootstrapWindow(partition) {
  if (!partition || partition.leader_node_id) {
    return false;
  }
  return (
    Number.isFinite(partition.created_at) &&
    Number.isFinite(partition.updated_at) &&
    partition.created_at === partition.updated_at
  );
}
function hasExplicitReadyLeaseMetadata(nodeRow) {
  return Boolean(
    nodeRow &&
    typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT &&
    (Object.prototype.hasOwnProperty.call(
      nodeRow,
      REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT,
    ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES,
      )),
  );
}
function isReplicaJoinNodeViable(nodeRow, options = {}) {
  const nodeId =
    typeof options.nodeId === REPLICA_HANDLER_TYPEOF.STRING ?
      options.nodeId :
      nodeRow?.node_id || nodeRow?.nodeId || null;
  const localNodeId =
    typeof options.localNodeId === REPLICA_HANDLER_TYPEOF.STRING ?
      options.localNodeId :
      null;
  const router = options.messageRouter || null;
  if (
    nodeId &&
    nodeId !== localNodeId &&
    router &&
    typeof router.getConnectionState === REPLICA_HANDLER_TYPEOF.FUNCTION &&
    router.getConnectionState(nodeId) !== STATE.CONNECTED
  ) {
    return false;
  }
  if (!nodeRow) {
    return true;
  }
  if (nodeRow.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  if (!hasExplicitReadyLeaseMetadata(nodeRow)) {
    return true;
  }
  return isNodeRecordReady(nodeRow, {
    now: options.now,
    requireActiveStatus: true,
  });
}

export {
  CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES,
  CRITICAL_VOTER_READY_GATED_OPERATION_TYPES,
  METADATA_RESOLUTION_POLL_INTERVAL_MS,
  PARTITION_METADATA_MISSING_PREFIX,
  REPLICA_HANDLER_LITERAL,
  SYSTEM_TABLE_HYDRATION_SQL,
  TABLE_METADATA_MISSING_PREFIX,
  VOTER_READY_CHECK_INTERVAL_MS,
  hasExplicitReadyLeaseMetadata,
  isFreshPartitionBootstrapWindow,
  isReplicaJoinNodeViable,
  partitionMetadataMissingError,
  resolveSnapshotStateForTransition,
  tableMetadataMissingError,
};
