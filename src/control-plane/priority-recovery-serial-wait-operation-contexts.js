import {PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS} from './priority-recovery-admission-constants.js';
import {normalizePriorityRecoveryStringList} from './priority-recovery-helpers.js';
import {
  isReplaceRemoveDispatchPhase,
} from '../rebalancer/replica-status.js';
import {
  classifyPriorityRecoveryAdmissionPartitionClass,
  isOrdinarySerialLaneCureMove,
} from '../rebalancer/replica-placement-cure-policy.js';
import {
  LOCAL_STR_EMPTY,
} from './priority-recovery-snapshot-contract.js';
import {
  isPriorityRecoverySpreadSatisfyingOperationContext,
  isPriorityRecoveryTrackedPartitionId,
} from './priority-recovery-snapshot-ingress.js';
import {
  isPriorityRecoveryOperationContextTerminal,
} from './priority-recovery-operation-context-state.js';

// Ordinary serial lane membership is an owner row
// (replica-placement-cure-policy.js): tracked recovery membership is this
// domain's priority predicate, and ORDINARY_PRIORITY is exactly
// tracked-and-not-emergency under the owner's classification order.
function isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId) {
  return (
    classifyPriorityRecoveryAdmissionPartitionClass(partitionId, {
      isPriorityPartition: isPriorityRecoveryTrackedPartitionId,
    }) === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY
  );
}

function isPriorityRecoveryOrdinarySerialLaneOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  const partitionId = String(operationContext.partitionId || '').trim();
  if (!isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId)) {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return false;
  }
  return isOrdinarySerialLaneCureMove(
    operationContext.type,
    isReplaceRemoveDispatchPhase(operationContext) === true,
  );
}

function isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  const partitionId = String(operationContext.partitionId || '').trim();
  if (
    !isPriorityRecoveryTrackedPartitionId(partitionId) ||
    isPriorityRecoveryOperationContextTerminal(operationContext)
  ) {
    return false;
  }
  return isOrdinarySerialLaneCureMove(
    operationContext.type,
    isReplaceRemoveDispatchPhase(operationContext) === true,
  );
}

function buildPriorityRecoveryOrdinarySerialLaneOperationContexts(
  replicaOperationContexts,
) {
  const byPartitionId =
    replicaOperationContexts?.byPartitionId &&
    typeof replicaOperationContexts.byPartitionId === 'object' ?
      replicaOperationContexts.byPartitionId :
      {};
  return Object.values(byPartitionId)
    .flatMap((operationContexts) =>
      Array.isArray(operationContexts) ? operationContexts : [],
    )
    .filter((operationContext) =>
      isPriorityRecoveryOrdinarySerialLaneOperationContext(operationContext),
    )
    .sort((left, right) =>
      String(left.operationId || LOCAL_STR_EMPTY).localeCompare(
        String(right.operationId || LOCAL_STR_EMPTY),
      ),
    );
}

function buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts(
  replicaOperationContexts,
) {
  const byPartitionId =
    replicaOperationContexts?.byPartitionId &&
    typeof replicaOperationContexts.byPartitionId === 'object' ?
      replicaOperationContexts.byPartitionId :
      {};
  return Object.values(byPartitionId)
    .flatMap((operationContexts) =>
      Array.isArray(operationContexts) ? operationContexts : [],
    )
    .filter((operationContext) =>
      isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
        operationContext,
      ),
    )
    .sort((left, right) =>
      String(left.operationId || LOCAL_STR_EMPTY).localeCompare(
        String(right.operationId || LOCAL_STR_EMPTY),
      ),
    );
}

function buildPriorityRecoverySerialWaitOperationContexts(options = {}) {
  const partitionId = String(options.partitionId || LOCAL_STR_EMPTY).trim();
  if (!isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId)) {
    return [];
  }
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(
    options.eligibleTargetNodeIds,
  );
  return (Array.isArray(options.serialLaneOperationContexts) ?
    options.serialLaneOperationContexts :
    []).filter((operationContext) =>
    isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
      operationContext,
    ) &&
      isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, {
        eligibleTargetNodeIds,
      }) !== true &&
      String(operationContext.partitionId || LOCAL_STR_EMPTY).trim() !==
        partitionId,
  );
}

export {
  buildPriorityRecoveryOrdinarySerialLaneOperationContexts,
  buildPriorityRecoverySerialWaitOperationContexts,
  buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts,
  isPriorityRecoveryOrdinarySerialLaneOperationContext,
  isPriorityRecoveryOrdinarySerialLanePartitionId,
  isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext,
};
