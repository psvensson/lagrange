import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
} from './priority-recovery-completion.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry, buildPriorityRecoverySemanticPartitionSetMap, buildPriorityRecoverySpreadCompletion, buildPriorityRecoverySpreadRelevantOperationContexts, hasPriorityRecoverySpreadGap, resolvePriorityRecoverySemanticState} from './priority-recovery-snapshot-stage-1.js';
import {buildPriorityRecoverySerialWaitOperationContexts, buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts} from './priority-recovery-snapshot-stage-3.js';
import {buildPriorityRecoveryClosureWitness} from './priority-recovery-snapshot-stage-4.js';
import {buildPriorityRecoveryOperationContextFromRecord, buildPriorityRecoveryReplicaOperationContexts, isPriorityRecoveryCompletedPlacementOperationContext, isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-stage-6.js';
import {arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions} from './priority-recovery-snapshot-stage-7.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryAdmissionByPartitionId, buildPriorityRecoveryLearnerPromotionByPartitionId, buildPriorityRecoveryPublicationNodeDecisions} from './priority-recovery-snapshot-stage-9.js';
import {appendPriorityRecoveryPartitionSnapshots, buildPriorityRecoveryBlockerPartitionSetMap, buildPriorityRecoveryCompletionPartitionSetMap, buildPriorityRecoveryDecisionSnapshot, normalizePriorityRecoveryBlockerPartitionIdsByReason, normalizePriorityRecoveryPartitionIdSetMap, recordPriorityRecoveryDecisionSnapshotSummary} from './priority-recovery-snapshot-stage-10.js';

function buildPriorityRecoveryDecisionSnapshots(options = {}) {
  const publicationConvergence =
    options.publicationConvergence &&
    typeof options.publicationConvergence === TYPEOF.OBJECT ?
      options.publicationConvergence :
      null;
  const publicationEpoch = normalizePriorityRecoveryInteger(
    publicationConvergence?.publicationEpoch,
  );
  const readinessByNodeId =
    options.readinessByNodeId &&
    typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const priorityPartitionSummary =
    publicationConvergence?.priorityPartitionSummary || null;
  const plannerByPartitionId = buildPriorityRecoveryPlannerByPartitionId(
    priorityPartitionSummary,
  );
  const publicationContext = buildPriorityRecoveryPublicationContext(
    publicationConvergence,
  );
  const admissionByPartitionId = buildPriorityRecoveryAdmissionByPartitionId(
    options.workflowAdmissionsByWorkflowId,
  );
  const replicaOperationContexts =
    buildPriorityRecoveryReplicaOperationContexts(
      options.replicaOperationRows,
      options.replicaOperations,
      options.serviceRows,
      {
        nowMs: options.capturedAt,
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      },
    );
  const serialLaneOperationContexts =
    buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts(
      replicaOperationContexts,
    );
  const learnerPromotionByPartitionId =
    buildPriorityRecoveryLearnerPromotionByPartitionId(
      options.serviceRows,
      readinessByNodeId,
      publicationContext.recoveryActiveNodeIds,
    );
  const publicationNodeDecisions =
    buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence);

  const allPartitionIds = new Set([
    ...Object.keys(plannerByPartitionId),
    ...Object.keys(admissionByPartitionId),
    ...Object.keys(replicaOperationContexts.byPartitionId),
    ...Object.keys(learnerPromotionByPartitionId),
  ]);
  const snapshots = [];
  const blockerPartitionIdsByReason =
    buildPriorityRecoveryBlockerPartitionSetMap();
  const partitionIdsBySemanticState =
    buildPriorityRecoverySemanticPartitionSetMap();
  const partitionIdsByCompletionState =
    buildPriorityRecoveryCompletionPartitionSetMap();

  for (const partitionId of [...allPartitionIds].sort()) {
    const planner = buildPriorityRecoveryPlannerEntry(
      partitionId,
      priorityPartitionSummary,
      plannerByPartitionId,
    );
    const admission = buildEffectivePriorityRecoveryAdmission(
      admissionByPartitionId[partitionId] || null,
      {
        publicationEligibleNodeIds: publicationContext.concreteEligibleNodeIds,
        publicationExcludedNodeIds: Object.keys(
          publicationNodeDecisions.exclusionReasonsByNodeId || {},
        ),
        recoveryEligibleIncludedNodeIds:
          publicationContext.recoveryEligibleIncludedNodeIds,
        prioritySummaryReadyEligibleNodeCount:
          priorityPartitionSummary?.readyEligibleNodeCount,
      },
    );
    const learnerPromotion = learnerPromotionByPartitionId[partitionId] || {
      activeLearnerNodeIds: [],
      promotableLearnerNodeIds: [],
      activeLearnerNodeCount: 0,
      promotableLearnerNodeCount: 0,
      learnerHoldByNodeId: {},
    };
    const operationContexts = Array.isArray(
      replicaOperationContexts.byPartitionId[partitionId],
    ) ?
      replicaOperationContexts.byPartitionId[partitionId] :
      [];
    const partitionSnapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId,
      publicationEpoch,
      capturedAt: options.capturedAt,
      publicationConvergence,
      publicationContext,
      publicationNodeDecisions,
      readinessByNodeId,
      priorityPartitionSummary,
      planner,
      admission,
      learnerPromotion,
      operationContexts,
      serialLaneOperationContexts,
      stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred: false,
      logsTable: options.logsTable,
    });
    if (!partitionSnapshot) {
      continue;
    }
    recordPriorityRecoveryDecisionSnapshotSummary(
      partitionId,
      partitionSnapshot,
      blockerPartitionIdsByReason,
      partitionIdsBySemanticState,
      partitionIdsByCompletionState,
    );
    appendPriorityRecoveryPartitionSnapshots(
      snapshots,
      partitionSnapshot,
      partitionId,
      publicationEpoch,
      operationContexts,
      replicaOperationContexts.byOperationId,
    );
  }

  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsBySemanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const normalizedPartitionIdsByCompletionState =
    normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsByCompletionState,
      PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
    );
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > NUM.ZERO,
    );
  const unresolvedSemanticPartitionIds = normalizePriorityRecoveryStringList(
    unresolvedSemanticStateIds.flatMap(
      (semanticState) => normalizedPartitionIdsBySemanticState[semanticState],
    ),
  );

  const decisionSnapshotSummary = {
    schemaVersion: options.schemaVersion || NUM.ONE,
    capturedAt: options.capturedAt || null,
    publicationEpoch,
    priorityPartitionSummary,
    snapshotCount: snapshots.length,
    partitionCount: allPartitionIds.size,
    snapshots,
    blockerPartitionIdsByReason:
      normalizePriorityRecoveryBlockerPartitionIdsByReason(
        blockerPartitionIdsByReason,
      ),
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    partitionIdsByCompletionState: normalizedPartitionIdsByCompletionState,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    unresolvedSemanticBlockedPartitionIds: unresolvedSemanticPartitionIds,
    unresolvedSemanticBlockedPartitionCount:
      unresolvedSemanticPartitionIds.length,
    hasExplicitSemanticStateContract: true,
  };
  return {
    ...decisionSnapshotSummary,
    closureWitness: buildPriorityRecoveryClosureWitness({
      decisionSnapshots: decisionSnapshotSummary,
      priorityPartitionSummary,
    }),
  };
}

function buildPriorityRecoveryPartitionAssessment(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const planner =
    options.planner ||
    buildPriorityRecoveryPlannerEntry(
      partitionId,
      options.priorityPartitionSummary,
      options.plannerByPartitionId,
    );
  const admission =
    options.admission && typeof options.admission === TYPEOF.OBJECT ?
      options.admission :
      {};
  const learnerPromotion =
    options.learnerPromotion &&
    typeof options.learnerPromotion === TYPEOF.OBJECT ?
      options.learnerPromotion :
      {
        activeLearnerNodeIds: [],
        promotableLearnerNodeIds: [],
        activeLearnerNodeCount: NUM.ZERO,
        promotableLearnerNodeCount: NUM.ZERO,
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
  const spreadCompletion = buildPriorityRecoverySpreadCompletion({
    plannerReady: planner.ready === true,
    activeOperationContexts: spreadRelevantOperationContexts,
    eligibleTargetNodeIds: admission.effectiveEligibleNodeIds,
  });
  const blockingOperationIdSet = new Set(spreadCompletion.blockingOperationIds);
  const hasActiveOperationContexts = activeOperationContexts.length > NUM.ZERO;
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
      .length > NUM.ZERO &&
    activeOperationContexts
      .filter((context) => blockingOperationIdSet.has(context.operationId))
      .some((context) => {
        const targetNodeId = String(context?.targetNodeId || '').trim();
        return (
          targetNodeId.length > NUM.ZERO &&
          !admission.effectiveEligibleNodeIds.includes(targetNodeId)
        );
      });
  const eligibleButNoOperation =
    planner.ready === false &&
    admission.effectiveEligibleNodeCount !== NUM.ZERO &&
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
    serialWaitOperationContexts.length > NUM.ZERO;
  const operationCreatedNoStepTransitions =
    spreadCompletion.satisfied !== true &&
    hasActiveOperationContexts &&
    spreadCompletion.blockingOperationCount > NUM.ZERO &&
    arePriorityRecoveryBlockingOperationsWithoutOwnedTransitions(
      blockingActiveOperationContexts,
      {
        nowMs: options.nowMs,
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      },
    );
  const learnerActiveNeverPromotable =
    learnerPromotion.activeLearnerNodeCount > NUM.ZERO &&
    learnerPromotion.promotableLearnerNodeCount === NUM.ZERO;
  const spreadCompletionUnsatisfied = spreadCompletion.satisfied !== true;
  const publicationRecoveryEligibleButCoordinatorExcludesNode =
    spreadCompletionUnsatisfied &&
    (
      recoveryEligibleExcludedNodeIds.length > NUM.ZERO ||
      operationTargetsOutsideEligibleCohort
    );
  const blockerReasons = [];
  if (priorityOperationSerialWait) {
    blockerReasons.push(
      PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
    );
  } else if (eligibleButNoOperation) {
    blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION);
  }
  if (operationCreatedNoStepTransitions) {
    blockerReasons.push(
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    );
  }
  if (learnerActiveNeverPromotable) {
    blockerReasons.push(
      PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
    );
  }
  if (publicationRecoveryEligibleButCoordinatorExcludesNode) {
    blockerReasons.push(
      PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
    );
  }
  const semanticState = resolvePriorityRecoverySemanticState({
    blockerReasons,
    plannerReady: planner.ready === true,
    hasActiveOperationContexts,
    spreadCompletion,
  });
  return {
    planner,
    spreadCompletion,
    blockerReasons,
    semanticState,
    activeOperationContexts,
    serialWaitOperationContexts,
    ineligibleNodeIds,
    recoveryEligibleExcludedNodeIds,
    publicationRecoveryEligibleButCoordinatorExcludesNode,
  };
}

function buildPriorityRecoveryOperationAssessment(options = {}) {
  const operationContext = buildPriorityRecoveryOperationContextFromRecord(
    options.operation,
  );
  const effectiveEligibleNodeIds = normalizePriorityRecoveryStringList(
    options.effectiveEligibleNodeIds,
  );
  const assessment = buildPriorityRecoveryPartitionAssessment({
    partitionId: operationContext?.partitionId || options.partitionId || '',
    priorityPartitionSummary: options.priorityPartitionSummary,
    nowMs: options.nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    admission: {
      effectiveEligibleNodeIds,
      effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
      ineligibleNodes: [],
    },
    operationContexts: operationContext ? [operationContext] : [],
  });
  return {
    ...assessment,
    operationContext,
  };
}

function shouldPriorityRecoveryOperationBlockPlanning(assessment) {
  if (!assessment || typeof assessment !== TYPEOF.OBJECT) {
    return true;
  }
  if (
    assessment.completion?.state ===
    PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED
  ) {
    return true;
  }
  if (assessment.spreadCompletion?.satisfied === true) {
    return false;
  }
  return (
    assessment.semanticState !==
    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH
  );
}

function buildPriorityRecoveryRediscoveryState(options = {}) {
  const publicationConvergence =
    options.publicationConvergence &&
    typeof options.publicationConvergence === TYPEOF.OBJECT ?
      options.publicationConvergence :
      null;
  const priorityPartitionSummary =
    options.priorityPartitionSummary &&
    typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
      options.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary || null;
  const publicationContext = buildPriorityRecoveryPublicationContext(
    publicationConvergence,
  );
  const nodeId = String(options.nodeId || '').trim();
  const spreadGapPending = hasPriorityRecoverySpreadGap(
    priorityPartitionSummary,
  );
  const targetNodeInConcreteEligibleCohort =
    nodeId.length > NUM.ZERO &&
    publicationContext.concreteEligibleNodeIds.includes(nodeId);
  const targetNodePublishedActive =
    nodeId.length > NUM.ZERO &&
    publicationContext.publishedActiveNodeIds.includes(nodeId);
  const targetNodeMissingPublished =
    nodeId.length > NUM.ZERO &&
    publicationContext.missingPublishedEligibleNodeIds.includes(nodeId);
  const requiresAuthoritativeRediscovery =
    options.cacheVisible !== true &&
    spreadGapPending &&
    (publicationContext.concreteEligibleNodeIds.length === NUM.ZERO ||
      targetNodeInConcreteEligibleCohort ||
      targetNodePublishedActive ||
      targetNodeMissingPublished);

  return Object.freeze({
    nodeId: nodeId || null,
    spreadGapPending,
    concreteEligibleNodeIds: Object.freeze([
      ...publicationContext.concreteEligibleNodeIds,
    ]),
    publishedActiveNodeIds: Object.freeze([
      ...publicationContext.publishedActiveNodeIds,
    ]),
    missingPublishedEligibleNodeIds: Object.freeze([
      ...publicationContext.missingPublishedEligibleNodeIds,
    ]),
    targetNodeInConcreteEligibleCohort,
    targetNodePublishedActive,
    targetNodeMissingPublished,
    requiresAuthoritativeRediscovery,
  });
}

function shouldUseAuthoritativePriorityRecoveryRediscovery(
  nodeId,
  options = {},
) {
  return buildPriorityRecoveryRediscoveryState({
    ...options,
    nodeId,
  }).requiresAuthoritativeRediscovery;
}

export {
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryPartitionAssessment,
  buildPriorityRecoveryRediscoveryState,
  shouldPriorityRecoveryOperationBlockPlanning,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
};
