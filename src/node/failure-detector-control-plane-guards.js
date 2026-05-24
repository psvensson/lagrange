import {NUM, TYPEOF} from '../constants/index.js';

function buildObservedNodeWhereClause(node) {
  const whereClause = {
    node_id: node.node_id,
  };
  if (typeof node?.status === TYPEOF.STRING && node.status.length > NUM.ZERO) {
    whereClause.status = node.status;
  }
  if (Number.isFinite(node?.last_heartbeat)) {
    whereClause.last_heartbeat = node.last_heartbeat;
  }
  if (Number.isFinite(node?.failed_at)) {
    whereClause.failed_at = node.failed_at;
  }
  if (Number.isFinite(node?.recovered_at)) {
    whereClause.recovered_at = node.recovered_at;
  }
  return whereClause;
}

function buildObservedReplicaWhereClause(replica) {
  const whereClause = {
    service_id: replica.service_id,
  };
  if (
    typeof replica?.node_id === TYPEOF.STRING &&
    replica.node_id.length > NUM.ZERO
  ) {
    whereClause.node_id = replica.node_id;
  }
  if (
    typeof replica?.status === TYPEOF.STRING &&
    replica.status.length > NUM.ZERO
  ) {
    whereClause.status = replica.status;
  }
  if (Number.isFinite(replica?.updated_at)) {
    whereClause.updated_at = replica.updated_at;
  }
  return whereClause;
}

function guardedUpdateApplied(result) {
  if (result?.success === false) {
    return false;
  }
  const affectedRows = Number(result?.partitionResult?.affectedRows);
  return !Number.isFinite(affectedRows) || affectedRows > NUM.ZERO;
}

export {
  buildObservedNodeWhereClause,
  buildObservedReplicaWhereClause,
  guardedUpdateApplied,
};
