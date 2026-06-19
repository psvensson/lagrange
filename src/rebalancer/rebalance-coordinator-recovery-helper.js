import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {filterConcurrentAddBudgetOperations} from './rebalance-coordinator-priority-budget-helper.js';
import {
  REBALANCE_COORDINATOR_TYPE,
} from './rebalance-coordinator-helper-common.js';

const {
  NUM,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  OperationType,
  SERVICE_TYPE,
  WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

function checkTimeouts(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.checkTimeouts();
}

function reconcileCompletedSyncingOperations(coordinator) {
  if (!coordinator.workflowOwner) {
    return;
  }
  return coordinator.workflowOwner.reconcileCompletedSyncingOperations();
}

function getTimeoutForStep(coordinator, step, operation = null) {
  return coordinator.workflowOwner.getTimeoutForStep(step, operation);
}

async function reconcileTimeoutOperation(coordinator, operation, now) {
  return coordinator.workflowOwner.reconcileTimeoutOperation(operation, now);
}

async function reconcileOperationProgress(coordinator, operation) {
  return coordinator.workflowOwner.reconcileOperationProgress(operation);
}

function handleExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.handleExecutorOutcome(outcome);
}

async function reconcileExecutorOutcome(coordinator, outcome) {
  return coordinator.workflowOwner.reconcileExecutorOutcome(outcome);
}

async function handleRecovery(coordinator) {
  coordinator.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
    nodeId: coordinator.nodeId,
  });

  const result = {
    totalIncomplete: NUM.ZERO,
    markedFailed: NUM.ZERO,
    reconciled: NUM.ZERO,
    errors: [],
  };

  const canUseCacheObservationBoundary =
    coordinator.repository.hasReplicaOperationCacheObservationBoundary();
  const cachedIncompleteOps = canUseCacheObservationBoundary ?
    await coordinator.queryCachedIncompleteOperations() :
    [];
  const incompleteOperationObservation =
    await coordinator.repository.getIncompleteOperationVisibilityObservation({
      cachedOperations: cachedIncompleteOps,
      visibilityReadMode:
        REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK,
    });
  const incompleteOps = Array.isArray(incompleteOperationObservation?.operations) ?
    incompleteOperationObservation.operations :
    [];
  result.totalIncomplete = incompleteOps.length;

  coordinator.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
    count: incompleteOps.length,
    nodeId: coordinator.nodeId,
  });

  for (const op of incompleteOps) {
    if (!coordinator.isOperationLocallyOwned(op)) {
      continue;
    }

    const originalStep = op.workflowStep;
    const singleFlightKey = coordinator.getOperationOwnerSingleFlightKey(
      op.operationId,
    );

    try {
      await coordinator.operationWorkflowRunExclusive(singleFlightKey, () =>
        coordinator.reconcileRecoveryOperation(op),
      );
    } catch (error) {
      result.errors.push({
        operationId: op.operationId,
        error: error.message,
      });
      coordinator.logger.error(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
        operationId: op.operationId,
        workflowStep: originalStep,
        partitionId: op.partitionId,
        error: error.message,
      });
      continue;
    }

    if (
      coordinator.isPreSyncStep(originalStep) ||
      originalStep === WORKFLOW_STEP.STOPPING
    ) {
      result.markedFailed++;
    } else if (originalStep === WORKFLOW_STEP.SYNCING) {
      result.reconciled++;
    }
  }

  coordinator.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, {
    nodeId: coordinator.nodeId,
    ...result,
  });

  const reservationResult = await coordinator.reconcileReservations();
  result.reservationsExpired = reservationResult.expired;
  result.reservationsOrphansReleased = reservationResult.orphansReleased;

  coordinator.emit(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED, result);

  return result;
}

function isPreSyncStep(coordinator, step) {
  return coordinator.workflowOwner.isPreSyncStep(step);
}

async function reconcileRecoveryOperation(coordinator, op) {
  return coordinator.workflowOwner.reconcileRecoveryOperation(op);
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
  if (
    options?.visibilityReadMode ===
      REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED &&
    typeof coordinator.repository?.getOperationsByEntityAuthoritative ===
      REBALANCE_COORDINATOR_TYPE.FUNCTION
  ) {
    return coordinator.repository.getOperationsByEntityAuthoritative(
      entityType,
      entityId,
    );
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
  reconcileCompletedSyncingOperations,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationProgress,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  handleRecovery,
  isPreSyncStep,
  reconcileRecoveryOperation,
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
