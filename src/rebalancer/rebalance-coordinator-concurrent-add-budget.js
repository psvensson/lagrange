import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_ADD = 'add';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

const {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  OperationType,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  isPriorityRecoveryEmergencyPartition,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} = REBALANCE_COORDINATOR_SHARED;

async function runConcurrentCreateBudgetGate(
  coordinator,
  normalizedMoveType,
  budgetContext = {},
  executionFactory,
) {
  const scope = resolveConcurrentCreateBudgetScope(
    coordinator,
    normalizedMoveType,
    budgetContext,
  );
  return coordinator.operationWorkflowRunExclusive(
    coordinator.getCreateBudgetSingleFlightKey(scope),
    async () => {
      await coordinator.ensureConcurrentOperationBudgetAllowed(
        normalizedMoveType,
        budgetContext,
      );
      return executionFactory();
    },
  );
}

function resolveConcurrentCreateBudgetScope(
  coordinator,
  normalizedMoveType,
  budgetContext = {},
) {
  if (normalizedMoveType === OperationType.REMOVE) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE;
  }
  if (
    !shouldUsePriorityConcurrentAddLane(
      coordinator,
      normalizedMoveType,
      budgetContext,
    )
  ) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.ADD;
  }
  const priorityRecoveryAdmissionPlan =
    getPriorityRecoveryAdmissionPlan(coordinator);
  if (
    priorityRecoveryAdmissionPlan.usesEmergencyPriorityOverflow(
      budgetContext?.partitionId,
    ) === true
  ) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD;
  }
  return CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD;
}

function shouldBypassConcurrentBudgetEmptyBackoff(
  coordinator,
  normalizedMoveType,
  options = {},
) {
  if (
    normalizedMoveType !== OperationType.ADD &&
    normalizedMoveType !== OperationType.REPLACE &&
    normalizedMoveType !== OperationType.REMOVE
  ) {
    return false;
  }
  const partitionId = String(options.partitionId || '').trim();
  if (partitionId.length === 0) {
    return false;
  }
  return coordinator.isCriticalSystemPartition(partitionId);
}

function resolveConcurrentBudgetReadMode(
  coordinator,
  normalizedMoveType,
  options = {},
) {
  if (
    options.concurrentBudgetReadMode ===
    REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
  ) {
    return REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION;
  }
  if (
    normalizedMoveType !== OperationType.ADD &&
    normalizedMoveType !== OperationType.REPLACE &&
    normalizedMoveType !== OperationType.REMOVE
  ) {
    return REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
  }
  const partitionId = String(options.partitionId || '').trim();
  if (partitionId.length === 0) {
    return REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
  }
  return coordinator.isPriorityControlPlanePartition(partitionId) ?
    REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION :
    REBALANCER_CONCURRENT_BUDGET_READ_MODE.CACHE_ONLY;
}

function shouldUsePriorityConcurrentAddLane(
  coordinator,
  normalizedMoveType,
  options = {},
) {
  if (
    normalizedMoveType !== OperationType.ADD &&
    normalizedMoveType !== OperationType.REPLACE
  ) {
    return false;
  }
  const partitionId = String(options.partitionId || '').trim();
  if (partitionId.length === 0) {
    return false;
  }
  return coordinator.isPriorityControlPlanePartition(partitionId);
}

function isEmergencyPriorityControlPlanePartition(partitionId) {
  return isPriorityRecoveryEmergencyPartition(partitionId);
}

function getLatestMembershipPublicationRow(coordinator) {
  const publicationService =
    coordinator.controlPlaneReadinessService?.membershipPublicationService;
  let publicationRow = null;
  if (
    publicationService &&
    typeof publicationService.getLatestClusterPublicationSync ===
      LOCAL_STR_FUNCTION
  ) {
    publicationRow = publicationService.getLatestClusterPublicationSync();
  } else if (
    publicationService &&
    typeof publicationService.getLatestPublicationRowSync === LOCAL_STR_FUNCTION
  ) {
    publicationRow = publicationService.getLatestPublicationRowSync();
  }
  return publicationRow && typeof publicationRow === LOCAL_STR_OBJECT ?
    publicationRow :
    null;
}

function getPriorityRecoveryAdmissionPlan(coordinator) {
  const publicationRow =
    typeof coordinator.getLatestMembershipPublicationRow ===
      LOCAL_STR_FUNCTION ?
      coordinator.getLatestMembershipPublicationRow() :
      getLatestMembershipPublicationRow(coordinator);
  return resolveTrackedPriorityRecoveryAdmissionPlan({
    tracker: coordinator.priorityRecoveryAdmissionTracker,
    publicationRow,
    nowMs: coordinator.nowFn(),
    staleGraceMs: coordinator.priorityRecoveryActivityStaleGraceMs,
    maxConcurrentAdds: coordinator.config.maxConcurrentAdds,
    isPriorityPartition: (partitionId) =>
      coordinator.isPriorityControlPlanePartition(partitionId),
    isEmergencyPriorityPartition: (partitionId) =>
      coordinator.isEmergencyPriorityControlPlanePartition(partitionId),
  });
}

function isGlobalPriorityControlPlaneRecoveryActive(coordinator) {
  return getPriorityRecoveryAdmissionPlan(coordinator).recoveryActive === true;
}

function isEmergencyPriorityControlPlaneRecoveryActive(coordinator) {
  return (
    getPriorityRecoveryAdmissionPlan(coordinator).emergencyRecoveryActive ===
    true
  );
}

function getReservedPriorityRecoveryAddSlots(coordinator, options = {}) {
  return getPriorityRecoveryAdmissionPlan(
    coordinator,
  ).getReservedNonPrioritySlots(
    options.partitionId,
    LOCAL_STR_ADD,
  );
}

function getConcurrentAddBudgetLimit(coordinator, options = {}) {
  return Math.max(
    0,
    coordinator.config.maxConcurrentAdds -
      getReservedPriorityRecoveryAddSlots(coordinator, options),
  );
}

function getPriorityConcurrentAddBudgetLimit(coordinator, options = {}) {
  return getPriorityRecoveryAdmissionPlan(
    coordinator,
  ).getPriorityAddBudgetLimit(options.partitionId);
}

export {
  getConcurrentAddBudgetLimit,
  getLatestMembershipPublicationRow,
  getPriorityConcurrentAddBudgetLimit,
  getPriorityRecoveryAdmissionPlan,
  getReservedPriorityRecoveryAddSlots,
  isEmergencyPriorityControlPlanePartition,
  isEmergencyPriorityControlPlaneRecoveryActive,
  isGlobalPriorityControlPlaneRecoveryActive,
  resolveConcurrentBudgetReadMode,
  resolveConcurrentCreateBudgetScope,
  runConcurrentCreateBudgetGate,
  shouldBypassConcurrentBudgetEmptyBackoff,
  shouldUsePriorityConcurrentAddLane,
};
