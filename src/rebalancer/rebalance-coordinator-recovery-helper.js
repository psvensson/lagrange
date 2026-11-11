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

async function reconcileOperationProgress(coordinator, operation) {
  return coordinator.workflowOwner.reconcileOperationProgress(operation);
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

async function reconcileMessageGroupMembershipDebt(coordinator, census) {
  return coordinator.workflowOwner.reconcileMessageGroupMembershipDebt(census);
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
  return coordinator.queryOperationProjectionById(operationId);
}

async function getAllOperations(coordinator) {
  return coordinator.repository.getAllOperations();
}

/**
 * The entity's operation rows as the operation ledger owner answers them
 * (strict owner read). A read the owner did not answer throws the typed
 * deferred-visibility error; no cache projection stands in. The one
 * entity-scoped list read a decision may consume; the projection is the
 * repository's getOperationsByEntityProjection, an advisory supplement.
 * @param {Object} coordinator
 * @param {string} entityType
 * @param {string} entityId
 * @return {Promise<Array<Object>>}
 */
async function getAuthoritativeOperationsByEntity(coordinator, entityType, entityId) {
  const observation = await coordinator.getEntityAuthoritativeOperationObservation(
    entityType, entityId,
  );
  return coordinator.requireEntityOperationRows(observation, entityType, entityId);
}

/**
 * This node's in-flight operations as the owner answers them: the typed
 * list observation (no list when DEFERRED).
 * @param {Object} coordinator
 * @return {Promise<Object>}
 */
async function getInFlightOperations(coordinator) {
  return coordinator.queryIncompleteOperations();
}

export {
  checkTimeouts,
  reconcileOrphanedOperations,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationProgress,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  isPreSyncStep,
  reconcileMessageGroupMembershipDebt,
  getObservedReplicaStatusFromCache,
  getActualReplicaStatus,
  emitReplicaStatusDivergence,
  getOperation,
  getAllOperations,
  getAuthoritativeOperationsByEntity,
  getInFlightOperations,
};
