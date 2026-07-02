/**
 * Evidence normalizer for priority-recovery visibility cache events.
 */

import {
  UNIFIED_REBALANCER_SHARED,
} from './unified-rebalancer-shared.js';

const {
  RECONCILE_REASON,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD = Object.freeze({
  ENTITY_ID: 'entityId',
  ENTITY_ID_SNAKE: 'entity_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  SERVICE_TYPE: 'serviceType',
  SERVICE_TYPE_SNAKE: 'service_type',
  STATUS: 'status',
});

const PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD = Object.freeze({
  ENTITY_ID: 'entityId',
  ENTITY_ID_SNAKE: 'entity_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  STATUS: 'status',
  TYPE: 'type',
  WORKFLOW_STEP: 'workflowStep',
  WORKFLOW_STEP_SNAKE: 'workflow_step',
});

const PRIORITY_RECOVERY_VISIBILITY_SERVICE_TYPE = Object.freeze({
  PARTITION: 'partition',
});

const PRIORITY_RECOVERY_VISIBILITY_SERVICE_STATUS = Object.freeze({
  ACTIVE: SERVICE_STATUS.ACTIVE,
  FAILED: 'failed',
  REMOVED: 'removed',
});

const PRIORITY_RECOVERY_VISIBILITY_PROGRESS_SERVICE_STATUS_SET = new Set([
  PRIORITY_RECOVERY_VISIBILITY_SERVICE_STATUS.ACTIVE,
  PRIORITY_RECOVERY_VISIBILITY_SERVICE_STATUS.FAILED,
  PRIORITY_RECOVERY_VISIBILITY_SERVICE_STATUS.REMOVED,
]);

function toVisibilityString(value, transform = (v) => v) {
  return transform(String(value || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).trim());
}

/**
 * Build the visibility-based reconcile decision for priority-recovery.
 *
 * @param {Object} event
 * @param {Object} context
 * @param {string} context.entityId
 * @param {boolean} [context.isLeader]
 * @param {boolean} [context.isPriorityPartition]
 * @param {boolean} [options.requireLeader=true]
 * @param {Function} context.isCoordinatorOwnedOperationType
 * @param {Function} context.isTerminalReplicaOperationRecord
 */
function buildPriorityRecoveryVisibilityRebalanceDecision(
  event = {},
  context = {},
  options = {},
) {
  const normalizedEvent =
    event && typeof event === 'object' ? event : {};
  const visibilityRow =
    normalizedEvent?.data && typeof normalizedEvent.data === 'object' ?
      normalizedEvent.data :
      {};
  const servicePartitionId = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.PARTITION_ID] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.PARTITION_ID_SNAKE] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.ENTITY_ID] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.ENTITY_ID_SNAKE] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  );
  const serviceType = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.SERVICE_TYPE] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.SERVICE_TYPE_SNAKE] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    (value) => value.toLowerCase(),
  );
  const serviceStatus = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.STATUS] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    (value) => value.toLowerCase(),
  );
  const operationPartitionId = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.PARTITION_ID] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.PARTITION_ID_SNAKE] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.ENTITY_ID] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.ENTITY_ID_SNAKE] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  );
  const operationStatus = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.STATUS] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    (value) => value.toLowerCase(),
  );
  const operationType = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.TYPE] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    (value) => value.toUpperCase(),
  );
  const operationWorkflowStep = toVisibilityString(
    visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.WORKFLOW_STEP] ||
      visibilityRow[PRIORITY_RECOVERY_VISIBILITY_OPERATION_FIELD.WORKFLOW_STEP_SNAKE] ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    (value) => value.toUpperCase(),
  );

  const serviceTableMatches =
    normalizedEvent.tableName === SYSTEM_TABLE_NAME.SERVICES;
  const servicePartitionMatches = servicePartitionId === context.entityId;
  const progressPartitionService =
    serviceType === PRIORITY_RECOVERY_VISIBILITY_SERVICE_TYPE.PARTITION &&
    PRIORITY_RECOVERY_VISIBILITY_PROGRESS_SERVICE_STATUS_SET.has(serviceStatus);
  const operationTableMatches =
    normalizedEvent.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
  const operationPartitionMatches = operationPartitionId === context.entityId;
  const coordinatorOwnedOperation =
    typeof context.isCoordinatorOwnedOperationType === 'function' &&
    context.isCoordinatorOwnedOperationType(operationType);
  const terminalReplicaOperation =
    coordinatorOwnedOperation &&
    operationPartitionMatches &&
    typeof context.isTerminalReplicaOperationRecord === 'function' &&
    context.isTerminalReplicaOperationRecord({
      type: operationType,
      workflowStep: operationWorkflowStep,
      status: operationStatus,
    });

  const evidence = {
    isLeader: context.isLeader === true,
    priorityPartition: context.isPriorityPartition === true,
    tableMatches: serviceTableMatches,
    partitionMatches: servicePartitionMatches,
    progressPartitionService,
    operationTableMatches,
    operationPartitionMatches,
    coordinatorOwnedOperation,
    terminalReplicaOperation,
  };
  const serviceVisibilityProgress =
    serviceTableMatches &&
    servicePartitionMatches &&
    progressPartitionService;
  const operationVisibilityProgress =
    operationTableMatches &&
    terminalReplicaOperation;

  const visibilityProgress =
    evidence.priorityPartition &&
    (serviceVisibilityProgress || operationVisibilityProgress);
  const shouldEnqueue =
    visibilityProgress &&
    (options.requireLeader === false || evidence.isLeader);

  return {
    shouldEnqueue,
    visibilityProgress,
    reconcileReason: RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
    evidence,
  };
}

export {buildPriorityRecoveryVisibilityRebalanceDecision};
