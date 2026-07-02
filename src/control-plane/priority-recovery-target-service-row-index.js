import {
  FIELD,
  SERVICE_DESCRIPTOR_FIELD,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE,
  PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION,
} from './priority-recovery-snapshot-contract.js';
import {readFirstStringField} from './priority-recovery-snapshot-ingress.js';

function priorityRecoveryTargetServiceIndexNodeEntry() {
  return {wildcardPartitionRows: [], byPartitionId: new Map()};
}

function readPriorityRecoveryTargetServiceRowIndexFields(serviceRow) {
  if (!serviceRow || typeof serviceRow !== 'object') {
    return null;
  }
  const serviceType = String(
    readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE,
      SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE,
    ) || PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  if (serviceType !== PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION) {
    return null;
  }
  const serviceNodeId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
    FIELD.NODE_ID,
  );
  return serviceNodeId ? {
    serviceNodeId,
    servicePartitionId: readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
      FIELD.PARTITION_ID,
    ),
  } : null;
}

function priorityRecoveryTargetServiceIndexNodeEntryFor(
  byTargetNodeId,
  serviceNodeId,
) {
  let nodeEntry = byTargetNodeId.get(serviceNodeId);
  if (!nodeEntry) {
    nodeEntry = priorityRecoveryTargetServiceIndexNodeEntry();
    byTargetNodeId.set(serviceNodeId, nodeEntry);
  }
  return nodeEntry;
}

function addPriorityRecoveryTargetServiceRowToIndex(
  byTargetNodeId,
  serviceRow,
) {
  const indexFields = readPriorityRecoveryTargetServiceRowIndexFields(
    serviceRow,
  );
  if (!indexFields) {
    return;
  }
  const nodeEntry = priorityRecoveryTargetServiceIndexNodeEntryFor(
    byTargetNodeId,
    indexFields.serviceNodeId,
  );
  if (!indexFields.servicePartitionId) {
    nodeEntry.wildcardPartitionRows.push(serviceRow);
    return;
  }
  const partitionRows =
    nodeEntry.byPartitionId.get(indexFields.servicePartitionId) || [];
  partitionRows.push(serviceRow);
  nodeEntry.byPartitionId.set(indexFields.servicePartitionId, partitionRows);
}

function buildPriorityRecoveryTargetServiceRowIndex(serviceRows = []) {
  const byTargetNodeId = new Map();
  if (!Array.isArray(serviceRows)) {
    return byTargetNodeId;
  }
  for (const serviceRow of serviceRows) {
    addPriorityRecoveryTargetServiceRowToIndex(byTargetNodeId, serviceRow);
  }
  return byTargetNodeId;
}

function resolvePriorityRecoveryTargetServiceIndexLookup(
  operationContext,
  targetServiceRowIndex,
) {
  if (!(targetServiceRowIndex instanceof Map)) {
    return null;
  }
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  const partitionId = String(operationContext?.partitionId || '').trim();
  if (targetNodeId.length === 0 || partitionId.length === 0) {
    return null;
  }
  const nodeEntry = targetServiceRowIndex.get(targetNodeId);
  return nodeEntry ? {nodeEntry, partitionId} : null;
}

function mergePriorityRecoveryTargetServiceIndexRows(
  exactRows,
  wildcardRows,
) {
  if (exactRows.length === 0) {
    return wildcardRows;
  }
  if (wildcardRows.length === 0) {
    return exactRows;
  }
  return [...exactRows, ...wildcardRows];
}

function selectPriorityRecoveryTargetServiceRowsFromIndex(
  operationContext,
  targetServiceRowIndex,
) {
  const lookup = resolvePriorityRecoveryTargetServiceIndexLookup(
    operationContext,
    targetServiceRowIndex,
  );
  if (!lookup) {
    return [];
  }
  const exactRows = lookup.nodeEntry.byPartitionId.get(lookup.partitionId) || [];
  return mergePriorityRecoveryTargetServiceIndexRows(
    exactRows,
    lookup.nodeEntry.wildcardPartitionRows,
  );
}

export {
  buildPriorityRecoveryTargetServiceRowIndex,
  selectPriorityRecoveryTargetServiceRowsFromIndex,
};
