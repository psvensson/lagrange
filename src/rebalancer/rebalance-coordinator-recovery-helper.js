import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {filterConcurrentAddBudgetOperations} from './rebalance-coordinator-priority-budget-helper.js';

const {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  OperationType,
  SERVICE_TYPE,
} = REBALANCE_COORDINATOR_SHARED;

function checkTimeouts(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.checkTimeouts();
}

function reconcileOrphanedOperations(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.reconcileOrphanedOperations();
}

function getTimeoutForStep(coordinator, step, operation = null) {
  return coordinator.workflowOwner.getTimeoutForStep(step, operation);
}

async function reconcileTimeoutOperation(coordinator, operation, now) {
  return coordinator.workflowOwner.reconcileTimeoutOperation(operation, now);
}

async function reconcileOperationLifecycle(coordinator, operation) {
  return coordinator.workflowOwner.reconcileOperationLifecycle(operation);
}

function handleExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.handleExecutorOutcome(outcome);
}

async function reconcileExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.reconcileExecutorOutcome(outcome);
}

function isPreSyncStep(coordinator, step) {
  return coordinator.workflowOwner.isPreSyncStep(step);
}

async function reconcileRecoveryOperation(coordinator, op) {
  return coordinator.workflowOwner.reconcileRecoveryOperation(op);
}

async function reconcileMessageGroupMembershipDebt(coordinator) {
  return coordinator.workflowOwner.reconcileMessageGroupMembershipDebt();
}

async function reconcileSyncingOperation(coordinator, operation) {
  return coordinator.workflowOwner.reconcileSyncingOperation(operation);
}

function getObservedReplicaStatusFromCache(
  coordinator,
  replicaId,
  partitionId,
  targetNodeId,
  options = {},
) {
  return coordinator.repository.getObservedReplicaStatusFromCache(
    replicaId,
    partitionId,
    targetNodeId,
    options,
  );
}

async function getActualReplicaStatus(coordinator, replicaId, partitionId, targetNodeId) {
  return coordinator.repository.getActualReplicaStatus(
    replicaId,
    partitionId,
    targetNodeId,
  );
}

function emitReplicaStatusDivergence(
  coordinator,
  replicaId,
  authoritativeStatus,
  reason,
) {
  return coordinator.repository.emitReplicaStatusDivergence(
    replicaId,
    authoritativeStatus,
    reason,
  );
}

async function getOperation(coordinator, operationId) {
  return coordinator.queryOperationById(operationId);
}

async function getAllOperations(coordinator) {
  return coordinator.repository.getAllOperations();
}

async function getOperationsByPartition(coordinator, partitionId) {
  return coordinator.getOperationsByEntity(SERVICE_TYPE.PARTITION, partitionId);
}

async function getOperationsByEntity(coordinator, entityType, entityId, options = {}) {
  if (options?.visibilityReadMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
    const observation = await coordinator.getEntityAuthoritativeOperationObservation(
      entityType, entityId,
    );
    return coordinator.requireEntityOperationRows(observation, entityType, entityId);
  }
  return coordinator.repository.getOperationsByEntity(entityType, entityId);
}

async function getInFlightOperations(coordinator) {
  return coordinator.queryIncompleteOperations();
}

function getConcurrentAddCount(coordinator, options = {}) {
  return coordinator.queryIncompleteOperations(options).then((inFlight) =>
    filterConcurrentAddBudgetOperations(coordinator, inFlight, options),
  ).then((operations) => operations.length);
}

function getConcurrentRemoveCount(coordinator, options = {}) {
  return coordinator.queryIncompleteOperations(options).then((inFlight) =>
    inFlight.filter((operation) => operation?.type === OperationType.REMOVE).length,
  );
}

export {
  checkTimeouts,
  reconcileOrphanedOperations,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationLifecycle,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  isPreSyncStep,
  reconcileRecoveryOperation,
  reconcileMessageGroupMembershipDebt,
  reconcileSyncingOperation,
  getObservedReplicaStatusFromCache,
  getActualReplicaStatus,
  emitReplicaStatusDivergence,
  getOperation,
  getAllOperations,
  getOperationsByPartition,
  getOperationsByEntity,
  getInFlightOperations,
  getConcurrentAddCount,
  getConcurrentRemoveCount,
};
