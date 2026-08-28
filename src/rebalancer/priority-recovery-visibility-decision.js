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

// The node-ready-lease publication lane. The topology-settling gate
// (`buildTransitionalNodeBlocker`) clears on the seed's cached NODES row the
// moment a joining node's ready-lease becomes live; the endpoint-visibility
// blocker clears on the canonical WebSocket / postgres-wire endpoint rows.
// Those publications are exactly the state transitions that release a
// deferred next-partition CREATE_REPLICA, so they must level-trigger the
// priority lane the same way a SERVICES / REPLICA_OPERATIONS transition does.
const PRIORITY_RECOVERY_VISIBILITY_NODE_FIELD = Object.freeze({
  NODE_ID: 'nodeId',
  NODE_ID_SNAKE: 'node_id',
  CONNECTION_STATE: 'connectionState',
  CONNECTION_STATE_SNAKE: 'connection_state',
  READY_LEASE_EXPIRES_AT: 'readyLeaseExpiresAt',
  READY_LEASE_EXPIRES_AT_SNAKE: 'ready_lease_expires_at',
});

const PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_FIELD = Object.freeze({
  NODE_ID: 'nodeId',
  NODE_ID_SNAKE: 'node_id',
  STATUS: 'status',
  HEALTH_STATUS: 'healthStatus',
  HEALTH_STATUS_SNAKE: 'health_status',
});

const PRIORITY_RECOVERY_VISIBILITY_NODE_CONNECTION_STATE = Object.freeze({
  READY: 'ready',
});

const PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_STATUS = Object.freeze({
  ACTIVE: SERVICE_STATUS.ACTIVE,
  HEALTHY: 'healthy',
});

const PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_TABLE_SET = new Set([
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
]);

function toVisibilityString(value, transform = (v) => v) {
  return transform(String(value || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).trim());
}

function readVisibilityRowField(row, camelField, snakeField) {
  return row?.[camelField] ?? row?.[snakeField];
}

// A NODES row carries a live ready-lease once the node is connection-READY
// with a positive lease expiry; both fields ride the same heartbeat update
// (the joiner's ready promotion), so either is sufficient evidence that the
// node-ready transition became true in the store.
function isNodeReadyLeasePublishedRow(row) {
  const connectionState = toVisibilityString(
    readVisibilityRowField(
      row,
      PRIORITY_RECOVERY_VISIBILITY_NODE_FIELD.CONNECTION_STATE,
      PRIORITY_RECOVERY_VISIBILITY_NODE_FIELD.CONNECTION_STATE_SNAKE,
    ),
    (value) => value.toLowerCase(),
  );
  if (
    connectionState ===
    PRIORITY_RECOVERY_VISIBILITY_NODE_CONNECTION_STATE.READY
  ) {
    return true;
  }
  return Number(
    readVisibilityRowField(
      row,
      PRIORITY_RECOVERY_VISIBILITY_NODE_FIELD.READY_LEASE_EXPIRES_AT,
      PRIORITY_RECOVERY_VISIBILITY_NODE_FIELD.READY_LEASE_EXPIRES_AT_SNAKE,
    ),
  ) > 0;
}

// An endpoint row makes its node visible once it is ACTIVE (the canonical
// WebSocket node endpoint) or reports a HEALTHY sync (the postgres-wire
// service endpoint) — the two facts the endpoint-visibility blocker reads.
function isEndpointVisibleRow(row) {
  const status = toVisibilityString(
    row?.[PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_FIELD.STATUS],
    (value) => value.toLowerCase(),
  );
  const healthStatus = toVisibilityString(
    readVisibilityRowField(
      row,
      PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_FIELD.HEALTH_STATUS,
      PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_FIELD.HEALTH_STATUS_SNAKE,
    ),
    (value) => value.toLowerCase(),
  );
  return (
    status === PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_STATUS.ACTIVE ||
    healthStatus === PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_STATUS.HEALTHY
  );
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

  const nodeTableMatches =
    normalizedEvent.tableName === SYSTEM_TABLE_NAME.NODES;
  const endpointTableMatches = PRIORITY_RECOVERY_VISIBILITY_ENDPOINT_TABLE_SET
    .has(normalizedEvent.tableName);
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
  const nodeReadyLeasePublished =
    nodeTableMatches && isNodeReadyLeasePublishedRow(visibilityRow);
  const endpointVisibilityPublished =
    endpointTableMatches && isEndpointVisibleRow(visibilityRow);

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
    nodeTableMatches,
    endpointTableMatches,
    nodeReadyLeasePublished,
    endpointVisibilityPublished,
  };
  const serviceVisibilityProgress =
    serviceTableMatches &&
    servicePartitionMatches &&
    progressPartitionService;
  const operationVisibilityProgress =
    operationTableMatches &&
    terminalReplicaOperation;
  const nodeReadinessVisibilityProgress =
    nodeReadyLeasePublished || endpointVisibilityPublished;

  const visibilityProgress =
    evidence.priorityPartition &&
    (
      serviceVisibilityProgress ||
      operationVisibilityProgress ||
      nodeReadinessVisibilityProgress
    );
  const shouldEnqueue =
    visibilityProgress &&
    (options.requireLeader === false || evidence.isLeader);
  const reconcileReason = nodeReadinessVisibilityProgress === true ?
    RECONCILE_REASON.NODE_BECAME_READY :
    RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS;

  return {
    shouldEnqueue,
    visibilityProgress,
    reconcileReason,
    evidence,
  };
}

export {buildPriorityRecoveryVisibilityRebalanceDecision};
