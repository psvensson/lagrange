
const REPLICA_IDENTITY_FIELDS = Object.freeze([
  'service_type',
  'partition_id',
  'group_id',
  'replica_id',
  'node_id',
  'status',
]);

function copyObservedStringFields(target, source, fields) {
  for (const field of fields) {
    if (typeof source?.[field] === 'string' && source[field].length > 0) {
      target[field] = source[field];
    }
  }
}

function buildObservedNodeWhereClause(node) {
  const whereClause = {
    node_id: node.node_id,
  };
  if (typeof node?.status === 'string' && node.status.length > 0) {
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
  copyObservedStringFields(whereClause, replica, REPLICA_IDENTITY_FIELDS);
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
  return !Number.isFinite(affectedRows) || affectedRows > 0;
}

export {
  buildObservedNodeWhereClause,
  buildObservedReplicaWhereClause,
  guardedUpdateApplied,
};
