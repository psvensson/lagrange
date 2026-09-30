import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';

const READ_REPLICA_LIFECYCLE_SQL = `SELECT
  service_id,
  partition_id,
  node_id,
  service_type,
  status,
  address,
  trigger_reason,
  error_message,
  cleanup_token,
  created_at,
  state_entered_at,
  updated_at
FROM services
WHERE service_id = ?`;
const READ_PARTITION_LEADER_SQL = `SELECT
  partition_id,
  leader_node_id,
  updated_at
FROM partitions
WHERE partition_id = ?`;

async function readOneAuthoritativeRow(
  stateMachine,
  tableName,
  sql,
  key,
  coalescingKey,
) {
  const result = await readAuthoritativeControlPlaneRows(
    stateMachine.getControlPlaneSystemTableGateway(),
    tableName,
    sql,
    [key],
    {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      coalescingKey,
      deliveryPriority: 'critical',
      workClass: 'critical',
    },
  );
  if (result?.success !== true || !Array.isArray(result.rows) ||
      result.rows.length > 1) {
    return Object.freeze({available: false, row: null});
  }
  return Object.freeze({
    available: true,
    row: result.rows.length === 1 ? result.rows[0] : null,
  });
}

async function observeAuthoritativeReplicaLifecycle(stateMachine, replicaId) {
  return readOneAuthoritativeRow(
    stateMachine,
    TABLES.SERVICES,
    READ_REPLICA_LIFECYCLE_SQL,
    replicaId,
    `replica-state-authority:${replicaId}`,
  );
}

async function readAuthoritativeReplicaLifecycle(stateMachine, replicaId) {
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  return observation.available ? observation.row : null;
}

async function readAuthoritativePartitionLeader(stateMachine, partitionId) {
  const observation = await readOneAuthoritativeRow(
    stateMachine,
    TABLES.PARTITIONS,
    READ_PARTITION_LEADER_SQL,
    partitionId,
    `partition-leader-authority:${partitionId}`,
  );
  return observation.available ? observation.row : null;
}

function rowMatchesReplicaLifecycle(row, replicaState) {
  if (!row || !replicaState) return false;
  const versionColumn = replicaState.durableVersionColumn ||
    'state_entered_at';
  return row.service_id ===
      (replicaState.serviceId || replicaState.replicaId) &&
    row.partition_id === replicaState.partitionId &&
    row.node_id === replicaState.nodeId &&
    row.service_type === replicaState.serviceType &&
    row.status === replicaState.state &&
    row[versionColumn] === replicaState.durableVersion;
}

export {
  observeAuthoritativeReplicaLifecycle,
  readAuthoritativePartitionLeader,
  readAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecycle,
};
