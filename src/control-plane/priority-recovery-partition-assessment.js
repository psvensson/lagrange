import {WORKFLOW_STEP} from '../constants/index.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from './priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  isPriorityRecoveryCompletedPlacementOperationContext,
  isPriorityRecoveryOperationContextTerminal,
} from './priority-recovery-operation-context-state.js';
import {
  buildPriorityRecoveryPlannerEntry,
  buildPriorityRecoverySpreadCompletion,
  buildPriorityRecoverySpreadRelevantOperationContexts,
  resolvePriorityRecoverySemanticState,
} from './priority-recovery-snapshot-ingress.js';
import {
  arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions,
} from './priority-recovery-snapshot-observation.js';
import {
  buildPriorityRecoverySerialWaitOperationContexts,
} from './priority-recovery-serial-wait-operation-contexts.js';

function isPriorityRecoveryFailedOperationContext(operationContext) {
  const status = String(operationContext?.status || '').toLowerCase();
  const workflowStep = String(operationContext?.workflowStep || '')
    .toUpperCase();
  const latestTimelineStatus = String(
    operationContext?.latestTimelineStatus || '',
  ).toLowerCase();
  const latestTimelineStep = String(
    operationContext?.latestTimelineStep || '',
  ).toUpperCase();
  return (
    status === ReplicaStatus.FAILED ||
    latestTimelineStatus === ReplicaStatus.FAILED ||
    workflowStep === WORKFLOW_STEP.FAILED ||
    latestTimelineStep === WORKFLOW_STEP.FAILED
  );
}

export function buildPriorityRecoveryPartitionAssessment(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const planner =
    options.planner ||
    buildPriorityRecoveryPlannerEntry(
      partitionId,
      options.priorityPartitionSummary,
      options.plannerByPartitionId,
    );
  const admission =
    options.admission && typeof options.admission === 'object' ?
      options.admission :
      {};
  const learnerPromotion =
    options.learnerPromotion &&
    typeof options.learnerPromotion === 'object' ?
      options.learnerPromotion :
      {
        activeLearnerNodeIds: [],
        promotableLearnerNodeIds: [],
        activeLearnerNodeCount: 0,
        promotableLearnerNodeCount: 0,
        learnerHoldByNodeId: {},
      };
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const spreadRelevantOperationContexts =
    buildPriorityRecoverySpreadRelevantOperationContexts(operationContexts);
  const activeOperationContexts = spreadRelevantOperationContexts.filter(
    (context) => !isPriorityRecoveryOperationContextTerminal(context),
  );
  const hasFailedOperationContext = operationContexts.some(
    isPriorityRecoveryFailedOperationContext,
  );
  const hasOpenNonFailedOperationContext = activeOperationContexts.some(
    (context) => isPriorityRecoveryFailedOperationContext(context) !== true,
  );
  const spreadCompletion = buildPriorityRecoverySpreadCompletion({
    plannerReady: planner.ready === true,
    activeOperationContexts: spreadRelevantOperationContexts,
    eligibleTargetNodeIds: admission.effectiveEligibleNodeIds,
  });
  const blockingOperationIdSet = new Set(spreadCompletion.blockingOperationIds);
  const hasActiveOperationContexts = activeOperationContexts.length > 0;
  const blockingActiveOperationContexts = activeOperationContexts.filter(
    (context) => blockingOperationIdSet.has(context.operationId),
  );
  const hasCompletedPlacementOperationContext = operationContexts.some(
    (context) => isPriorityRecoveryCompletedPlacementOperationContext(context),
  );
  const ineligibleNodeIds = normalizePriorityRecoveryStringList(
    admission.ineligibleNodes?.map((entry) => entry?.nodeId),
  );
  const recoveryEligibleExcludedNodeIds = normalizePriorityRecoveryStringList(
    admission.effectiveEligibleNodeIds,
  ).filter((nodeId) => ineligibleNodeIds.includes(nodeId));
  const operationTargetsOutsideEligibleCohort =
    normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds)
      .length > 0 &&
    activeOperationContexts
      .filter((context) => blockingOperationIdSet.has(context.operationId))
      .some((context) => {
        const targetNodeId = String(context?.targetNodeId || '').trim();
        return (
          targetNodeId.length > 0 &&
          !admission.effectiveEligibleNodeIds.includes(targetNodeId)
        );
      });
  const eligibleButNoOperation =
    planner.ready === false &&
    admission.effectiveEligibleNodeCount !== 0 &&
    hasActiveOperationContexts === false &&
    hasCompletedPlacementOperationContext === false;
  const serialWaitOperationContexts =
    buildPriorityRecoverySerialWaitOperationContexts({
      partitionId,
      serialLaneOperationContexts: options.serialLaneOperationContexts,
      eligibleTargetNodeIds: admission.effectiveEligibleNodeIds,
    });
  const priorityOperationSerialWait =
    eligibleButNoOperation &&
    serialWaitOperationContexts.length > 0;
  const operationCreatedNoStepTransitions =
    spreadCompletion.satisfied !== true &&
    hasActiveOperationContexts &&
    spreadCompletion.blockingOperationCount > 0 &&
    arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions(
      blockingActiveOperationContexts,
      {
        nowMs: options.nowMs,
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      },
    );
  const learnerActiveNeverPromotable =
    learnerPromotion.activeLearnerNodeCount > 0 &&
    learnerPromotion.promotableLearnerNodeCount === 0;
  const spreadCompletionUnsatisfied = spreadCompletion.satisfied !== true;
  const publicationRecoveryEligibleButCoordinatorExcludesNode =
    spreadCompletionUnsatisfied &&
    (
      recoveryEligibleExcludedNodeIds.length > 0 ||
      operationTargetsOutsideEligibleCohort
    );
  const blockerReasonSet = new Set();
  if (priorityOperationSerialWait) {
    blockerReasonSet.add(
      PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
    );
  } else if (eligibleButNoOperation) {
    blockerReasonSet.add(
      PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
    );
  }
  if (operationCreatedNoStepTransitions) {
    blockerReasonSet.add(
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    );
  }
  if (learnerActiveNeverPromotable) {
    blockerReasonSet.add(
      PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
    );
  }
  if (publicationRecoveryEligibleButCoordinatorExcludesNode) {
    blockerReasonSet.add(
      PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
    );
  }
  const blockerReasons = [...blockerReasonSet];
  const failedWorkflowOpen =
    hasActiveOperationContexts &&
    hasFailedOperationContext &&
    hasOpenNonFailedOperationContext;
  const resolvedSemanticState = resolvePriorityRecoverySemanticState({
    blockerReasons,
    plannerReady: planner.ready === true,
    hasActiveOperationContexts,
    spreadCompletion,
  });
  const semanticState =
    failedWorkflowOpen &&
    resolvedSemanticState ===
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT ?
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED :
      resolvedSemanticState;
  return {
    planner,
    spreadCompletion,
    blockerReasons,
    semanticState,
    activeOperationContexts,
    hasFailedOperationContext,
    hasOpenNonFailedOperationContext,
    serialWaitOperationContexts,
    ineligibleNodeIds,
    recoveryEligibleExcludedNodeIds,
    publicationRecoveryEligibleButCoordinatorExcludesNode,
  };
}
