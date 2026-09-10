import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {
  buildPriorityRecoveryOperationContextFromRecord,
} from '../control-plane/priority-recovery-snapshot-rebalancer.js';
import {
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
} from './replica-operation-liveness.js';

const DIRECT_PARTITION_ID_FIELDS = Object.freeze([
  'partition_group_id',
  'partitionGroupId',
  'partition_id',
  'partitionId',
  'entity_id',
  'entityId',
]);

function readDirectOperationPartitionId(operation) {
  for (const fieldName of DIRECT_PARTITION_ID_FIELDS) {
    const value = operation?.[fieldName];
    if (typeof value === 'string' && value.length > 0) {
      return value.trim();
    }
  }
  return null;
}

function buildPriorityRecoveryFollowUpOperationContexts({
  cache,
  isTrackedInFlightOperation,
  nowMs,
  partitionId,
}) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (
    normalizedPartitionId.length === 0 ||
    typeof cache?.getAll !== 'function'
  ) {
    return Object.freeze([]);
  }
  const operationContexts = [];
  const replicaOperationRows = readAllSharedRows(
    cache,
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  );
  for (const operation of replicaOperationRows) {
    const directPartitionId = readDirectOperationPartitionId(operation);
    if (
      directPartitionId !== null &&
      directPartitionId !== normalizedPartitionId
    ) {
      continue;
    }
    if (!isTrackedInFlightOperation(operation)) {
      continue;
    }
    const normalizedOperation = normalizeReplicaOperationRecord(
      operation,
      {nowMs},
    );
    if (isReplicaOperationStale(normalizedOperation, {
      nowMs,
      staleTimeoutLookbackMs: Number.MAX_SAFE_INTEGER,
    })) {
      continue;
    }
    const operationContext =
      buildPriorityRecoveryOperationContextFromRecord(operation);
    if (operationContext?.partitionId === normalizedPartitionId) {
      operationContexts.push(operationContext);
    }
  }
  return Object.freeze(operationContexts);
}

export {buildPriorityRecoveryFollowUpOperationContexts};
