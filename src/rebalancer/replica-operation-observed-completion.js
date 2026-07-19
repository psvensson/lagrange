import {OperationType} from './replica-status.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_STATUS = 'status';
const LOCAL_STR_NODE_ID = 'node_id';
const LOCAL_STR_NODEID = 'nodeId';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_GROUP_ID = 'group_id';
const LOCAL_STR_GROUPID = 'groupId';
const LOCAL_STR_PARTITION_ID = 'partition_id';
const LOCAL_STR_PARTITIONID = 'partitionId';

const REPLICA_OPERATION_STATUS_ACTIVE = 'active';
const REPLICA_OPERATION_STATUS_REMOVING = 'removing';
const SERVICE_TYPE_PARTITION = 'partition';
const SERVICE_TYPE_MESSAGE_GROUP = 'message_group';
const BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE = 'MOVE_ASSIGNMENT';

const REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES = new Set([
  REPLICA_OPERATION_STATUS_ACTIVE,
  REPLICA_OPERATION_STATUS_REMOVING,
]);

function firstStringField(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === LOCAL_STR_STRING && value.length > 0) {
      return value;
    }
  }
  return null;
}

function doesObservedTargetReplicaServiceRowMatch(
  serviceRow,
  entityType,
  entityId,
  targetNodeId,
  replicaId,
) {
  const serviceType = String(firstStringField(
    serviceRow,
    'service_type',
    'serviceType',
    'type',
  ) || '').toLowerCase();
  if (serviceType && serviceType !== entityType) {
    return false;
  }
  if (String(firstStringField(
    serviceRow,
    LOCAL_STR_NODE_ID,
    LOCAL_STR_NODEID,
  ) || '') !== targetNodeId) {
    return false;
  }
  const serviceReplicaId = firstStringField(
    serviceRow,
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
    'id',
  );
  if (serviceReplicaId !== replicaId) {
    return false;
  }
  if (entityType === SERVICE_TYPE_PARTITION) {
    return String(firstStringField(
      serviceRow,
      LOCAL_STR_PARTITION_ID,
      LOCAL_STR_PARTITIONID,
      LOCAL_STR_ID,
    ) || '') === entityId;
  }
  if (entityType === SERVICE_TYPE_MESSAGE_GROUP) {
    return String(firstStringField(
      serviceRow,
      LOCAL_STR_GROUP_ID,
      LOCAL_STR_GROUPID,
      LOCAL_STR_ID,
    ) || '') === entityId;
  }
  return true;
}

function buildObservedTargetReplicaIdentity(record) {
  const replicaId = firstStringField(record, 'replicaId') || '';
  const entityType = String(
    firstStringField(record, 'entityType') || SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  const entityId =
    firstStringField(record, 'entityId', 'partitionGroupId') || '';
  const targetNodeId = firstStringField(record, 'targetNodeId') || '';
  const hasMissingIdentity = [replicaId, entityId, targetNodeId]
    .some((value) => value.length === 0);
  if (hasMissingIdentity) {
    return null;
  }
  return {replicaId, entityType, entityId, targetNodeId};
}

function findObservedTargetReplicaServiceRows(record, options = {}) {
  const supportsExactTarget =
    record?.type === OperationType.ADD ||
    record?.type === OperationType.REPLACE;
  const targetIdentity = supportsExactTarget ?
    buildObservedTargetReplicaIdentity(record) :
    null;
  if (!targetIdentity) {
    return [];
  }
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  return serviceRows.filter((serviceRow) =>
    doesObservedTargetReplicaServiceRowMatch(
      serviceRow,
      targetIdentity.entityType,
      targetIdentity.entityId,
      targetIdentity.targetNodeId,
      targetIdentity.replicaId,
    ),
  );
}

function hasObservedActiveTargetServiceOwnership(record, options = {}) {
  if (record?.type !== BOOTSTRAP_MOVE_ASSIGNMENT_OPERATION_TYPE) {
    return false;
  }

  const replicaId = String(record?.replicaId || '');
  const targetNodeId = String(record?.targetNodeId || '');
  if (!replicaId || !targetNodeId) {
    return false;
  }

  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  for (const serviceRow of serviceRows) {
    if (String(firstStringField(
      serviceRow,
      LOCAL_STR_STATUS,
    ) || '').toLowerCase() !== REPLICA_OPERATION_STATUS_ACTIVE) {
      continue;
    }
    if (String(firstStringField(
      serviceRow,
      LOCAL_STR_NODE_ID,
      LOCAL_STR_NODEID,
    ) || '') !== targetNodeId) {
      continue;
    }
    const serviceReplicaId = firstStringField(
      serviceRow,
      'replica_id',
      'replicaId',
      'service_id',
      'serviceId',
      'id',
    );
    if (serviceReplicaId === replicaId) {
      return true;
    }
  }

  return false;
}

function hasObservedActiveTargetReplica(record, options = {}) {
  if (
    record?.type !== OperationType.ADD &&
    record?.type !== OperationType.REPLACE
  ) {
    return hasObservedActiveTargetServiceOwnership(record, options);
  }

  return findObservedTargetReplicaServiceRows(record, options)
    .some((serviceRow) =>
      String(firstStringField(
        serviceRow,
        LOCAL_STR_STATUS,
      ) || '').toLowerCase() === REPLICA_OPERATION_STATUS_ACTIVE,
    );
}

function doesObservedSourceReplicaServiceRowBlockRetirement(
  serviceRow,
  entityType,
  entityId,
  sourceReplicaId,
) {
  const serviceType = String(firstStringField(
    serviceRow,
    'service_type',
    'serviceType',
    'type',
  ) || '').toLowerCase();
  if (serviceType && serviceType !== entityType) {
    return false;
  }
  const status = String(firstStringField(
    serviceRow,
    'status',
  ) || '').toLowerCase();
  if (!REPLACE_SOURCE_RETIREMENT_BLOCKING_STATUSES.has(status)) {
    return false;
  }
  const serviceReplicaId = firstStringField(
    serviceRow,
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
    'id',
  );
  if (serviceReplicaId !== sourceReplicaId) {
    return false;
  }
  if (entityType === SERVICE_TYPE_PARTITION) {
    return String(firstStringField(
      serviceRow,
      LOCAL_STR_PARTITION_ID,
      LOCAL_STR_PARTITIONID,
      LOCAL_STR_ID,
    ) || '') === entityId;
  }
  if (entityType === SERVICE_TYPE_MESSAGE_GROUP) {
    return String(firstStringField(
      serviceRow,
      LOCAL_STR_GROUP_ID,
      LOCAL_STR_GROUPID,
      LOCAL_STR_ID,
    ) || '') === entityId;
  }
  return true;
}

function hasObservedRetiredReplaceSourceReplica(record, options = {}) {
  if (record?.type !== OperationType.REPLACE) {
    return false;
  }
  const sourceReplicaId = String(record?.sourceReplicaId || '');
  const entityType = String(
    record?.entityType || SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  const entityId = String(
    record?.entityId || record?.partitionGroupId || '',
  );
  if (!sourceReplicaId || !entityId) {
    return false;
  }
  const serviceRows = Array.isArray(options.serviceRows) ?
    options.serviceRows :
    [];
  return !serviceRows.some((serviceRow) =>
    doesObservedSourceReplicaServiceRowBlockRetirement(
      serviceRow,
      entityType,
      entityId,
      sourceReplicaId,
    ),
  );
}

function hasObservedCompletedReplicaOperation(record, options = {}) {
  if (record?.type === OperationType.REPLACE) {
    return (
      hasObservedActiveTargetReplica(record, options) &&
      hasObservedRetiredReplaceSourceReplica(record, options)
    );
  }
  return hasObservedActiveTargetReplica(record, options);
}

export {
  findObservedTargetReplicaServiceRows,
  hasObservedCompletedReplicaOperation,
};
