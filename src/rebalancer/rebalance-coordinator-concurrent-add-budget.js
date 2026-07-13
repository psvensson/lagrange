import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  classifyPriorityRecoveryAdmissionPartitionClass,
  resolvePlacementCureBudgetScope,
  resolvePlacementCureBudgetScopeFromAdmissionPlan,
} from './replica-placement-cure-policy.js';

const LOCAL_STR_ADD = 'add';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

const {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  OperationType,
  UNIFIED_SERVICE_TYPE,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  isPriorityRecoveryEmergencyPartition,
  resolveTrackedPriorityRecoveryAdmissionPlan,
} = REBALANCE_COORDINATOR_SHARED;

/**
 * The number of plain-ADD budget slots held in fair-share reserve for genuine
 * runtime-service replica-creates (quest
 * formation-runtime-service-create-lane-budget-starvation). The global plain-ADD
 * lane is shared by every non-priority ADD + non-dispatch-phase REPLACE, so a
 * service's replica-create is otherwise starved by ordinary spread/REPLACE churn.
 * @param {Object} coordinator
 * @return {number}
 */
function getReservedCreateAddSlots(coordinator) {
  const reserved = Number(coordinator?.config?.reservedCreateAddSlots);
  return Number.isFinite(reserved) && reserved > 0 ? Math.floor(reserved) : 0;
}

/**
 * A genuine runtime-service replica-create admission: an ADD move for a
 * runtime_service entity. REPLACE/self-move of a service is count-neutral and is
 * NOT a create, so it cannot consume the reserved create slot.
 * @param {string} normalizedMoveType
 * @param {string} entityType
 * @return {boolean}
 */
function isGenuineServiceCreateAdmission(normalizedMoveType, entityType) {
  if (normalizedMoveType !== OperationType.ADD) {
    return false;
  }
  return (
    String(entityType || '').toLowerCase() ===
    UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE
  );
}

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
  // Scope selection is an owner row (replica-placement-cure-policy.js);
  // this resolver owns only the lazy plan read: the tracked admission plan
  // is consulted exactly when a priority-class creation needs the overflow
  // lane state, as before.
  const partitionId = String(budgetContext?.partitionId || '').trim();
  const isPriorityPartition =
    coordinator.isPriorityControlPlanePartition.bind(coordinator);
  const scopeWithoutOverflow = resolvePlacementCureBudgetScope({
    moveType: normalizedMoveType,
    partitionClass: classifyPriorityRecoveryAdmissionPartitionClass(
      partitionId,
      {isPriorityPartition},
    ),
    usesEmergencyPriorityOverflow: false,
  });
  if (scopeWithoutOverflow !== CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD) {
    return scopeWithoutOverflow;
  }
  return resolvePlacementCureBudgetScopeFromAdmissionPlan({
    moveType: normalizedMoveType,
    partitionId,
    admissionPlan: getPriorityRecoveryAdmissionPlan(coordinator),
    isPriorityPartition,
  });
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
    // Reference-pass, not a re-derived conjunct: the plan owner resolves
    // lane classes through the owner classification.
    isEmergencyPriorityPartition:
      coordinator.isEmergencyPriorityControlPlanePartition.bind(coordinator),
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
  getReservedCreateAddSlots,
  getReservedPriorityRecoveryAddSlots,
  isGenuineServiceCreateAdmission,
  isEmergencyPriorityControlPlanePartition,
  isEmergencyPriorityControlPlaneRecoveryActive,
  isGlobalPriorityControlPlaneRecoveryActive,
  resolveConcurrentBudgetReadMode,
  resolveConcurrentCreateBudgetScope,
  runConcurrentCreateBudgetGate,
  shouldBypassConcurrentBudgetEmptyBackoff,
  shouldUsePriorityConcurrentAddLane,
};
