import {buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext} from './active-node-projection.js';
import {
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
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry, buildPriorityRecoverySemanticPartitionSetMap, hasPriorityRecoverySpreadGap} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts} from './priority-recovery-snapshot-publication.js';
import {buildPriorityRecoveryClosureWitness} from './priority-recovery-snapshot-active-gate.js';
import {
  buildPriorityRecoveryPartitionAssessment,
} from './priority-recovery-partition-assessment.js';
import {
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryReplicaOperationContexts,
} from './priority-recovery-snapshot-rebalancer.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryAdmissionByPartitionId, buildPriorityRecoveryLearnerPromotionByPartitionId, buildPriorityRecoveryPublicationNodeDecisions} from './priority-recovery-snapshot-burndown.js';
import {appendPriorityRecoveryPartitionSnapshots, buildPriorityRecoveryBlockerPartitionSetMap, buildPriorityRecoveryCompletionPartitionSetMap, buildPriorityRecoveryDecisionSnapshot, normalizePriorityRecoveryBlockerPartitionIdsByReason, normalizePriorityRecoveryPartitionIdSetMap, recordPriorityRecoveryDecisionSnapshotSummary} from './priority-recovery-dispatch-snapshot.js';

function buildPriorityRecoveryDecisionSnapshots(options = {}) {
  const publicationConvergence =
    options.publicationConvergence &&
    typeof options.publicationConvergence === 'object' ?
      options.publicationConvergence :
      null;
  const publicationEpoch = normalizePriorityRecoveryInteger(
    publicationConvergence?.publicationEpoch,
  );
  const readinessByNodeId =
    options.readinessByNodeId &&
    typeof options.readinessByNodeId === 'object' ?
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
    const appendedSnapshots = appendPriorityRecoveryPartitionSnapshots(
      snapshots,
      partitionSnapshot,
      partitionId,
      publicationEpoch,
      operationContexts,
      replicaOperationContexts.byOperationId,
    );
    for (const appendedSnapshot of appendedSnapshots) {
      recordPriorityRecoveryDecisionSnapshotSummary(
        partitionId,
        appendedSnapshot,
        blockerPartitionIdsByReason,
        partitionIdsBySemanticState,
        partitionIdsByCompletionState,
      );
    }
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
        normalizedPartitionIdsBySemanticState[semanticState].length > 0,
    );
  const unresolvedSemanticPartitionIds = normalizePriorityRecoveryStringList(
    unresolvedSemanticStateIds.flatMap(
      (semanticState) => normalizedPartitionIdsBySemanticState[semanticState],
    ),
  );

  const decisionSnapshotSummary = {
    schemaVersion: options.schemaVersion || 1,
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
  if (!assessment || typeof assessment !== 'object') {
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
    typeof options.publicationConvergence === 'object' ?
      options.publicationConvergence :
      null;
  const priorityPartitionSummary =
    options.priorityPartitionSummary &&
    typeof options.priorityPartitionSummary === 'object' ?
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
    nodeId.length > 0 &&
    publicationContext.concreteEligibleNodeIds.includes(nodeId);
  const targetNodePublishedActive =
    nodeId.length > 0 &&
    publicationContext.publishedActiveNodeIds.includes(nodeId);
  const targetNodeMissingPublished =
    nodeId.length > 0 &&
    publicationContext.missingPublishedEligibleNodeIds.includes(nodeId);
  const requiresAuthoritativeRediscovery =
    options.cacheVisible !== true &&
    spreadGapPending &&
    (publicationContext.concreteEligibleNodeIds.length === 0 ||
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
