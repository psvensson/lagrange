import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  classifyPriorityRecoveryAdmissionPartitionClass,
} from './replica-placement-cure-policy.js';
import {
  shouldAllowPriorityRecoveryDeferredObservation,
} from './rebalance-coordinator-pressure-helper.js';
import {
  resolveRuntimeServicePlacementReservedAddLimit,
} from './rebalance-coordinator-runtime-placement-slot-reservation.js';
import {
  PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD,
  REBALANCE_COORDINATOR_OPERATION_FIELD,
  REBALANCE_COORDINATOR_SEGMENT_5_LITERAL,
  REBALANCE_COORDINATOR_TYPE,
} from './rebalance-coordinator-helper-common.js';

const {
  OperationType,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  classifySystemPartition,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldPriorityRecoveryOperationBlockPlanning,
} = REBALANCE_COORDINATOR_SHARED;

async function getConcurrentAddCount(coordinator, options = {}) {
  const inFlight = await coordinator.queryIncompleteOperations(options);
  return (await filterConcurrentAddBudgetOperations(
    coordinator,
    inFlight,
    options,
  )).length;
}

function getAddBudgetOperationPartitionId(coordinator, operation = null) {
  return String(
    operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.PARTITION_ID] ||
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.PARTITION_ID_SNAKE] ||
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.ENTITY_ID] ||
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.ENTITY_ID_SNAKE] ||
      REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
  ).trim();
}

function buildConcurrentAddCountByPriorityClass(coordinator, operations = []) {
  let ordinaryPriorityCount = 0;
  let emergencyPriorityCount = 0;
  let nonPriorityCount = 0;
  for (const operation of operations) {
    if (!isConcurrentAddBudgetOperation(coordinator, operation)) {
      continue;
    }
    const partitionId = getAddBudgetOperationPartitionId(coordinator, operation);
    // Lane classification is an owner row (replica-placement-cure-policy.js);
    // this helper owns only the counting.
    const partitionClass = classifyPriorityRecoveryAdmissionPartitionClass(
      partitionId,
      {
        isPriorityPartition: (candidatePartitionId) =>
          classifySystemPartition({partitionId: candidatePartitionId})
            .priorityControlPlane,
        isEmergencyPriorityPartition:
          coordinator.isEmergencyPriorityControlPlanePartition.bind(
            coordinator,
          ),
      },
    );
    if (
      partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY
    ) {
      emergencyPriorityCount += 1;
    } else if (
      partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY
    ) {
      ordinaryPriorityCount += 1;
    } else {
      nonPriorityCount += 1;
    }
  }
  return {
    priorityCount: ordinaryPriorityCount + emergencyPriorityCount,
    ordinaryPriorityCount,
    emergencyPriorityCount,
    nonPriorityCount,
  };
}

function addConcurrentPriorityBudgetOperation(
  coordinator,
  priorityOperationsByPartitionId,
  operation,
) {
  const partitionId = getAddBudgetOperationPartitionId(coordinator, operation);
  if (
    partitionId.length === 0 ||
    !classifySystemPartition({partitionId}).priorityControlPlane
  ) {
    return false;
  }
  if (!priorityOperationsByPartitionId.has(partitionId)) {
    priorityOperationsByPartitionId.set(partitionId, []);
  }
  priorityOperationsByPartitionId.get(partitionId).push(operation);
  return true;
}

async function appendConcurrentPriorityPartitionOperations(
  coordinator,
  filteredOperations,
  partitionId,
  partitionOperations,
  options = {},
) {
  const partitionAssessment =
    await buildPriorityPartitionAddBudgetAssessment(
      coordinator,
      partitionId,
      partitionOperations,
    );
  if (
    partitionAssessment &&
    !shouldPriorityRecoveryOperationBlockPlanning(partitionAssessment)
  ) {
    return;
  }
  if (partitionAssessment) {
    filteredOperations.push(...partitionOperations);
    return;
  }
  if (
    shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
      coordinator,
      partitionId,
      partitionOperations,
      options,
    )
  ) {
    return;
  }
  for (const operation of partitionOperations) {
    if (await coordinator.shouldIgnoreCriticalAddBudgetOperation(operation)) {
      continue;
    }
    filteredOperations.push(operation);
  }
}

async function filterConcurrentAddBudgetOperations(coordinator, operations = [], options = {}) {
  const filteredOperations = [];
  const priorityOperationsByPartitionId = new Map();
  for (const operation of Array.isArray(operations) ? operations : []) {
    if (!isConcurrentAddBudgetOperation(coordinator, operation)) {
      continue;
    }
    if (
      addConcurrentPriorityBudgetOperation(
        coordinator,
        priorityOperationsByPartitionId,
        operation,
      )
    ) {
      continue;
    }
    if (await coordinator.shouldIgnoreCriticalAddBudgetOperation(operation)) {
      continue;
    }
    filteredOperations.push(operation);
  }
  for (const [partitionId, partitionOperations] of
    priorityOperationsByPartitionId.entries()) {
    await appendConcurrentPriorityPartitionOperations(
      coordinator,
      filteredOperations,
      partitionId,
      partitionOperations,
      options,
    );
  }
  return filteredOperations;
}

async function buildPriorityPartitionAddBudgetAssessment(
  coordinator,
  partitionId,
  operations = [],
) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return null;
  }
  const partitionOperations = Array.isArray(operations) ?
    operations.filter((operation) => {
      const operationPartitionId =
        getAddBudgetOperationPartitionId(coordinator, operation);
      return operationPartitionId === normalizedPartitionId;
    }) :
    [];
  if (partitionOperations.length === 0) {
    return null;
  }
  const representativeOperation = partitionOperations.find(Boolean) || null;
  if (!representativeOperation) {
    return null;
  }
  if (
    typeof coordinator.workflowOwner
      ?.getPriorityRecoveryDecisionSnapshotForPartitionOperations ===
    REBALANCE_COORDINATOR_TYPE.FUNCTION
  ) {
    const decisionSnapshot =
      await coordinator.workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        normalizedPartitionId,
        partitionOperations,
      );
    if (
      decisionSnapshot &&
      typeof decisionSnapshot === REBALANCE_COORDINATOR_TYPE.OBJECT
    ) {
      return decisionSnapshot;
    }
  }
  if (
    typeof coordinator.workflowOwner
      ?.getPriorityRecoveryPlanningSnapshotForOperation !==
    REBALANCE_COORDINATOR_TYPE.FUNCTION
  ) {
    return null;
  }
  const planningSnapshot =
    await coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation(
      representativeOperation,
    );
  if (
    !planningSnapshot ||
    typeof planningSnapshot !== REBALANCE_COORDINATOR_TYPE.OBJECT
  ) {
    return null;
  }
  const effectiveEligibleNodeIds =
    resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
  const operationContexts = partitionOperations
    .map((operation) =>
      buildPriorityRecoveryOperationContextFromRecord(operation),
    )
    .filter(Boolean);
  return buildPriorityRecoveryPartitionAssessment({
    partitionId: normalizedPartitionId,
    priorityPartitionSummary:
      planningSnapshot.priorityPartitionSummary || null,
    admission: {
      effectiveEligibleNodeIds,
      effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
      ineligibleNodes: [],
    },
    operationContexts,
  });
}

function shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
  coordinator,
  partitionId,
  partitionOperations = [],
  options = {},
) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return false;
  }
  if (
    !arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(
      coordinator,
      partitionOperations,
    )
  ) {
    return false;
  }
  const admissionPlan = coordinator.getPriorityRecoveryAdmissionPlan();
  if (
    admissionPlan?.[PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.RECOVERY_ACTIVE] !==
      true ||
    admissionPlan?.[
      PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD
        .BLOCKED_PARTITION_DETAIL_UNAVAILABLE
    ] === true ||
    typeof admissionPlan?.[
      PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
    ] !== REBALANCE_COORDINATOR_TYPE.FUNCTION
  ) {
    return false;
  }
  const requestedPartitionId =
    resolveRequestedPriorityAddBudgetPartitionId(coordinator, options);
  const requestedDifferentBlockedPartition =
    requestedPartitionId.length > 0 &&
    requestedPartitionId !== normalizedPartitionId &&
    admissionPlan[
      PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
    ](requestedPartitionId) === true;
  const currentPartitionStillBlocked =
    admissionPlan[
      PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.HAS_BLOCKED_PARTITION
    ](normalizedPartitionId) === true;
  return (
    requestedDifferentBlockedPartition ||
    currentPartitionStillBlocked !== true
  );
}

function resolveRequestedPriorityAddBudgetPartitionId(
  coordinator,
  options = {},
) {
  return String(
    options?.[PRIORITY_RECOVERY_ADMISSION_PLAN_FIELD.PARTITION_ID] ||
      REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
  ).trim();
}

function arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(
  coordinator,
  operations = [],
) {
  const partitionOperations = Array.isArray(operations) ? operations : [];
  if (partitionOperations.length === 0) {
    return false;
  }
  return partitionOperations.every((operation) =>
    isAddBudgetOperationPastWorkflowTimeout(coordinator, operation),
  );
}

function isAddBudgetOperationPastWorkflowTimeout(coordinator, operation = null) {
  const workflowStep = String(
    operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.WORKFLOW_STEP] ||
      operation?.[
        REBALANCE_COORDINATOR_OPERATION_FIELD.WORKFLOW_STEP_SNAKE
      ] ||
      '',
  ).trim();
  if (workflowStep.length === 0) {
    return false;
  }
  const operationId = operation?.operationId || operation?.operation_id;
  if (
    operationId &&
    typeof coordinator.workflowOwner?.hasActiveTransitionRetryGrace === 'function' &&
    coordinator.workflowOwner.hasActiveTransitionRetryGrace(operationId, coordinator.nowFn())
  ) {
    return false;
  }
  // Prefer time-in-current-step over updatedAt (CL-044): a wedged add-budget op
  // whose dispatch retry loop keeps re-stamping updatedAt would otherwise never
  // read as past its workflow timeout, so it would hold a concurrent-add budget
  // slot forever and starve other partitions. The step-entry anchor is immune to
  // that churn; fall back to updatedAt -> createdAt when no step entry is present.
  const stepEnteredAtMs =
    coordinator.workflowOwner?.resolveOperationStepEnteredAtMs?.(operation);
  const observedAtMs = Number.isFinite(stepEnteredAtMs) ?
    stepEnteredAtMs :
    Number(
      operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.UPDATED_AT] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.UPDATED_AT_SNAKE] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.CREATED_AT] ??
        operation?.[REBALANCE_COORDINATOR_OPERATION_FIELD.CREATED_AT_SNAKE],
    );
  if (!Number.isFinite(observedAtMs)) {
    return false;
  }
  const timeoutMs = coordinator.getTimeoutForStep(workflowStep, operation);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }
  return coordinator.nowFn() - observedAtMs >= timeoutMs;
}

async function getConcurrentAddCountByPriorityClass(coordinator, options = {}) {
  const inFlight = await coordinator.queryIncompleteOperations(options);
  return buildConcurrentAddCountByPriorityClass(
    coordinator,
    await filterConcurrentAddBudgetOperations(coordinator, inFlight, options),
  );
}

function isConcurrentAddBudgetOperation(coordinator, operation) {
  if (!operation || typeof operation !== REBALANCE_COORDINATOR_TYPE.OBJECT) {
    return false;
  }
  const type = String(
    operation.type || REBALANCE_COORDINATOR_SEGMENT_5_LITERAL.EMPTY_STRING,
  ).toUpperCase();
  if (type === OperationType.ADD) {
    return true;
  }
  if (type !== OperationType.REPLACE) {
    return false;
  }
  return !coordinator.isReplaceRemoveDispatchPhase(operation);
}

async function getConcurrentRemoveCount(coordinator, options = {}) {
  const inFlight = await coordinator.queryIncompleteOperations(options);
  return inFlight.filter(
    (operation) => operation?.type === OperationType.REMOVE,
  ).length;
}

async function executeReplicaOperationsRead(coordinator, sql, params = []) {
  return coordinator.repository.executeReplicaOperationsRead(sql, params);
}

async function resolveAuthoritativeAddAdmission(
  coordinator,
  options,
  concurrentAddLimit,
  visibilityReadMode = REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
) {
  const authoritativeReadOptions = {
    partitionId: options.partitionId,
    visibilityReadMode,
  };
  const authoritativeOperations = await filterConcurrentAddBudgetOperations(
    coordinator,
    await coordinator.queryIncompleteOperations(authoritativeReadOptions),
    authoritativeReadOptions,
  );
  const authoritativeCount = authoritativeOperations.length;
  const authoritativeObservation =
    coordinator.getIncompleteOperationObservation();
  coordinator.reconcileIncompleteOperationEmptyQueryDelay(
    authoritativeObservation,
  );
  if (
    coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
      authoritativeObservation,
    )
  ) {
    return false;
  }
  return authoritativeCount < resolveRuntimeServicePlacementReservedAddLimit(
    coordinator,
    authoritativeOperations,
    concurrentAddLimit,
    options,
  );
}

async function canStartAddOperation(coordinator, options = {}) {
  if (coordinator.shouldPauseAdmissionReadForLocalRouterPressure(options)) {
    return false;
  }
  const concurrentAddLimit = coordinator.getConcurrentAddBudgetLimit(options);
  if (concurrentAddLimit <= 0) {
    return false;
  }
  // Check the runtime-placement reservation only where cache would admit,
  // preserving cache saturation and empty-query backoff while blocking stale
  // undercounts.
  const hasReservedRuntimeServicePlacementSlot =
    typeof coordinator.getReservedRuntimeServicePlacementSlots ===
      'function' &&
    coordinator.getReservedRuntimeServicePlacementSlots(options) > 0;
  if (coordinator.getReservedPriorityRecoveryAddSlots(options) > 0) {
    return resolveAuthoritativeAddAdmission(
      coordinator,
      options,
      concurrentAddLimit,
    );
  }
  const cachedIncompleteOperations =
    await coordinator.queryCachedIncompleteOperations();
  const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
    cachedIncompleteOperations.length :
    0;
  // Reserve one fair-share plain-ADD slot for runtime-service placement so
  // ordinary partition spread/REPLACE churn cannot starve runtime ADD or
  // affinity REPLACE.
  const cachedCandidateEffectiveLimit =
    resolveRuntimeServicePlacementReservedAddLimit(
      coordinator,
      cachedIncompleteOperations,
      concurrentAddLimit,
      options,
    );
  const cachedAddBudgetCandidateCount = (
    Array.isArray(cachedIncompleteOperations) ?
      cachedIncompleteOperations :
      []
  ).filter((operation) =>
    isConcurrentAddBudgetOperation(coordinator, operation),
  ).length;
  if (
    cachedAddBudgetCandidateCount >= cachedCandidateEffectiveLimit &&
    options?.concurrentBudgetReadMode !==
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
  ) {
    return false;
  }
  const cachedFilteredOperations = await filterConcurrentAddBudgetOperations(
    coordinator,
    cachedIncompleteOperations,
    options,
  );
  const cachedCount = cachedFilteredOperations.length;
  const cachedEffectiveLimit = resolveRuntimeServicePlacementReservedAddLimit(
    coordinator,
    cachedFilteredOperations,
    concurrentAddLimit,
    options,
  );
  if (cachedOperationCount > 0) {
    coordinator.clearEmptyIncompleteOperationQueryDelay();
  }
  if (cachedCount > 0) {
    if (cachedCount < cachedEffectiveLimit) {
      if (hasReservedRuntimeServicePlacementSlot) {
        return resolveAuthoritativeAddAdmission(
          coordinator,
          options,
          concurrentAddLimit,
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_SINGLE_ATTEMPT,
        );
      }
      return true;
    }
    if (
      options?.concurrentBudgetReadMode !==
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
    ) {
      return false;
    }
    return resolveAuthoritativeAddAdmission(
      coordinator,
      options,
      concurrentAddLimit,
    );
  }
  const bypassEmptyQueryDelay =
    options?.bypassEmptyQueryDelay === true ||
    cachedOperationCount > 0;
  if (
    !bypassEmptyQueryDelay &&
    coordinator.shouldDelayEmptyIncompleteOperationQuery()
  ) {
    return false;
  }
  if (hasReservedRuntimeServicePlacementSlot) {
    return resolveAuthoritativeAddAdmission(
      coordinator,
      options,
      concurrentAddLimit,
      REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_SINGLE_ATTEMPT,
    );
  }
  const count = await getConcurrentAddCount(coordinator, {
    partitionId: options.partitionId,
  });
  const incompleteOperationObservation =
    coordinator.getIncompleteOperationObservation();
  coordinator.reconcileIncompleteOperationEmptyQueryDelay(
    incompleteOperationObservation,
  );
  if (
    shouldAllowPriorityRecoveryDeferredObservation(
      coordinator,
      options.partitionId,
      incompleteOperationObservation,
    )
  ) {
    return count < cachedCandidateEffectiveLimit;
  }
  if (
    coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
      incompleteOperationObservation,
    )
  ) {
    return false;
  }
  return count < cachedCandidateEffectiveLimit;
}

async function canStartPriorityAddOperation(coordinator, options = {}) {
  if (coordinator.shouldPausePriorityAddAdmissionReadForLocalRouterPressure(
    options,
  )) {
    return false;
  }
  const priorityRecoveryAdmissionPlan =
    coordinator.getPriorityRecoveryAdmissionPlan();
  const maximumPriorityConcurrentAddLimit =
    priorityRecoveryAdmissionPlan.emergencyPriorityAddBudgetLimit;
  if (maximumPriorityConcurrentAddLimit <= 0) {
    return false;
  }
  const isPriorityCountsAdmitted = (counts = {}) => {
    return (
      priorityRecoveryAdmissionPlan.evaluatePriorityAddAdmission(
        options.partitionId,
        counts,
      ).allowed === true
    );
  };
  const cachedIncompleteOperations =
    await coordinator.queryCachedIncompleteOperations();
  const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
    cachedIncompleteOperations.length :
    0;
  const cachedCounts = buildConcurrentAddCountByPriorityClass(
    coordinator,
    await filterConcurrentAddBudgetOperations(
      coordinator,
      cachedIncompleteOperations,
      options,
    ),
  );
  const cachedTotalCount =
    cachedCounts.priorityCount + cachedCounts.nonPriorityCount;
  if (cachedOperationCount > 0) {
    coordinator.clearEmptyIncompleteOperationQueryDelay();
  }
  if (cachedTotalCount > 0) {
    if (isPriorityCountsAdmitted(cachedCounts)) {
      return true;
    }
    if (
      options?.concurrentBudgetReadMode !==
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
    ) {
      return false;
    }
    const authoritativeCounts =
      await getConcurrentAddCountByPriorityClass(coordinator, {
        partitionId: options.partitionId,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
    const authoritativeObservation = coordinator.getIncompleteOperationObservation();
    coordinator.reconcileIncompleteOperationEmptyQueryDelay(
      authoritativeObservation,
    );
    if (
      shouldAllowPriorityRecoveryDeferredObservation(
        coordinator,
        options.partitionId,
        authoritativeObservation,
      )
    ) {
      return isPriorityCountsAdmitted(authoritativeCounts);
    }
    if (
      coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        authoritativeObservation,
      )
    ) {
      return false;
    }
    return isPriorityCountsAdmitted(authoritativeCounts);
  }
  const bypassEmptyQueryDelay =
    options?.bypassEmptyQueryDelay === true ||
    cachedOperationCount > 0;
  if (
    !bypassEmptyQueryDelay &&
    coordinator.shouldDelayEmptyIncompleteOperationQuery()
  ) {
    return false;
  }
  const counts = await getConcurrentAddCountByPriorityClass(coordinator, {
    partitionId: options.partitionId,
  });
  const incompleteOperationObservation =
    coordinator.getIncompleteOperationObservation();
  coordinator.reconcileIncompleteOperationEmptyQueryDelay(
    incompleteOperationObservation,
  );
  if (
    shouldAllowPriorityRecoveryDeferredObservation(
      coordinator,
      options.partitionId,
      incompleteOperationObservation,
    )
  ) {
    return isPriorityCountsAdmitted(counts);
  }
  if (
    coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
      incompleteOperationObservation,
    )
  ) {
    return false;
  }
  return isPriorityCountsAdmitted(counts);
}

async function canStartRemoveOperation(coordinator, options = {}) {
  if (coordinator.shouldPauseAdmissionReadForLocalRouterPressure(options)) {
    return false;
  }
  const cachedIncompleteOperations =
    await coordinator.queryCachedIncompleteOperations();
  const cachedOperationCount = Array.isArray(cachedIncompleteOperations) ?
    cachedIncompleteOperations.length :
    0;
  const cachedCount = cachedIncompleteOperations.filter(
    (operation) => operation?.type === OperationType.REMOVE,
  ).length;
  if (cachedOperationCount > 0) {
    coordinator.clearEmptyIncompleteOperationQueryDelay();
  }
  if (cachedCount > 0) {
    if (cachedCount < coordinator.config.maxConcurrentRemoves) {
      return true;
    }
    if (
      options?.concurrentBudgetReadMode !==
      REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION
    ) {
      return false;
    }
    const authoritativeCount = await getConcurrentRemoveCount(coordinator, {
      partitionId: options.partitionId,
      visibilityReadMode:
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
    });
    const authoritativeObservation = coordinator.getIncompleteOperationObservation();
    coordinator.reconcileIncompleteOperationEmptyQueryDelay(
      authoritativeObservation,
    );
    if (
      coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
        authoritativeObservation,
      )
    ) {
      return false;
    }
    return authoritativeCount < coordinator.config.maxConcurrentRemoves;
  }
  const bypassEmptyQueryDelay =
    options?.bypassEmptyQueryDelay === true ||
    cachedOperationCount > 0;
  if (
    !bypassEmptyQueryDelay &&
    coordinator.shouldDelayEmptyIncompleteOperationQuery()
  ) {
    return false;
  }
  const count = await getConcurrentRemoveCount(coordinator, {
    partitionId: options.partitionId,
  });
  const incompleteOperationObservation =
    coordinator.getIncompleteOperationObservation();
  coordinator.reconcileIncompleteOperationEmptyQueryDelay(
    incompleteOperationObservation,
  );
  if (
    shouldAllowPriorityRecoveryDeferredObservation(
      coordinator,
      options.partitionId,
      incompleteOperationObservation,
    )
  ) {
    return count < coordinator.config.maxConcurrentRemoves;
  }
  if (
    coordinator.shouldBlockOperationAdmissionOnIncompleteOperationObservation(
      incompleteOperationObservation,
    )
  ) {
    return false;
  }
  return count < coordinator.config.maxConcurrentRemoves;
}

export {
  getConcurrentAddCount,
  getConcurrentAddCountByPriorityClass,
  getConcurrentRemoveCount,
  getAddBudgetOperationPartitionId,
  buildConcurrentAddCountByPriorityClass,
  addConcurrentPriorityBudgetOperation,
  appendConcurrentPriorityPartitionOperations,
  filterConcurrentAddBudgetOperations,
  buildPriorityPartitionAddBudgetAssessment,
  shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan,
  resolveRequestedPriorityAddBudgetPartitionId,
  arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout,
  isAddBudgetOperationPastWorkflowTimeout,
  isConcurrentAddBudgetOperation,
  executeReplicaOperationsRead,
  canStartAddOperation,
  canStartPriorityAddOperation,
  canStartRemoveOperation,
};
