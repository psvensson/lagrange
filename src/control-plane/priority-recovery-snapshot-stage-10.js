import {
  NUM,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  buildPriorityRecoveryCompletion,
} from './priority-recovery-completion.js';
import {
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
import {PRIORITY_RECOVERY_SNAPSHOT_LITERAL} from './priority-recovery-snapshot-stage-shared.js';
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry} from './priority-recovery-snapshot-stage-1.js';
import {buildPriorityRecoveryConditionsContract, selectLatestPriorityRecoveryOperationContext} from './priority-recovery-snapshot-stage-7.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-stage-8.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract, buildPriorityRecoveryPublicationNodeDecisions, isPriorityRecoverySnapshotObject, resolvePriorityRecoveryDecisionPublicationConvergence, resolvePriorityRecoveryDecisionReadinessByNodeId} from './priority-recovery-snapshot-stage-9.js';
import {buildPriorityRecoveryPartitionAssessment} from './priority-recovery-snapshot-stage-11.js';

const PRIORITY_RECOVERY_EMPTY_BLOCKER_REASONS = Object.freeze([]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE = Object.freeze({
  ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT: 'advance_owner_progress_from_timeout',
  ADVANCE_OWNER_PROGRESS_FROM_WAIT: 'advance_owner_progress_from_wait',
  RETAIN_SNAPSHOT: 'retain_snapshot',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT,
      matches: (evidence) =>
        evidence.currentOwner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        evidence.actuationOwner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        evidence.nextRequiredAction ===
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
            .RECONCILE_STALE_OPERATION_PROGRESS &&
        evidence.blockingBoundary ===
          PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT &&
        evidence.waitMode ===
          PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE &&
        evidence.actuationState ===
          PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED &&
        evidence.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
        evidence.latestWorkflowStep ===
          WORKFLOW_STEP.PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
          .ADVANCE_OWNER_PROGRESS_FROM_WAIT,
      matches: (evidence) =>
        evidence.currentOwner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        evidence.actuationOwner ===
          PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
        evidence.nextRequiredAction ===
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS &&
        evidence.blockingBoundary ===
          PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
        evidence.actuationState ===
          PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED &&
        evidence.workflowProgressPhaseId ===
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE.RETAIN_SNAPSHOT,
      matches: () => true,
    }),
  ]);

function resolvePriorityRecoveryDispatchPendingNormalizationState(
  snapshot = null,
) {
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_TABLE.find((entry) =>
      entry.matches({
        currentOwner:
          snapshot?.progress?.currentOwner ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        actuationOwner:
          snapshot?.actuation?.owner || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        nextRequiredAction:
          snapshot?.progress?.nextRequiredAction ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        waitMode:
          snapshot?.progress?.waitMode || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        blockingBoundary:
          snapshot?.progress?.blockingBoundary ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        actuationState:
          snapshot?.actuation?.state || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        workflowProgressPhaseId:
          snapshot?.progress?.workflowProgressPhaseId ||
          snapshot?.actuation?.workflowProgressPhaseId ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        latestWorkflowStep: String(
          snapshot?.coordinator?.operation?.workflowStep ||
            PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
        ).trim().toUpperCase(),
      }),
    )?.state ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE.RETAIN_SNAPSHOT
  );
}

function normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
  snapshot = null,
) {
  if (!isPriorityRecoverySnapshotObject(snapshot)) {
    return snapshot;
  }
  const normalizationState =
    resolvePriorityRecoveryDispatchPendingNormalizationState(snapshot);
  if (
    normalizationState !==
      PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT &&
    normalizationState !==
      PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_WAIT
  ) {
    return snapshot;
  }
  const progress = isPriorityRecoverySnapshotObject(snapshot.progress) ?
    snapshot.progress :
    {};
  const actuation = isPriorityRecoverySnapshotObject(snapshot.actuation) ?
    snapshot.actuation :
    {};
  const reclassifiedProgress =
    normalizationState ===
    PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
      .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
      Object.freeze({
        ...progress,
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
        blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      }) :
      Object.freeze({
        ...progress,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      });
  return Object.freeze({
    ...snapshot,
    blockerReasons:
      normalizationState ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
        PRIORITY_RECOVERY_EMPTY_BLOCKER_REASONS :
        snapshot.blockerReasons,
    semanticState:
      normalizationState ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
        PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT :
        snapshot.semanticState,
    actuation:
      normalizationState ===
      PRIORITY_RECOVERY_DISPATCH_PENDING_NORMALIZATION_STATE
        .ADVANCE_OWNER_PROGRESS_FROM_TIMEOUT ?
        Object.freeze({
          ...actuation,
          state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
        }) :
        snapshot.actuation,
    progress: reclassifiedProgress,
  });
}

function resolvePriorityRecoveryDecisionPriorityPartitionSummary(
  options = {},
  publicationConvergence = null,
) {
  return isPriorityRecoverySnapshotObject(options.priorityPartitionSummary) ?
    options.priorityPartitionSummary :
    publicationConvergence?.priorityPartitionSummary || null;
}

function resolvePriorityRecoveryDecisionPlanner(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.planner)) {
    return options.planner;
  }
  return buildPriorityRecoveryPlannerEntry(
    options.partitionId,
    options.priorityPartitionSummary,
    buildPriorityRecoveryPlannerByPartitionId(options.priorityPartitionSummary),
  );
}

function resolvePriorityRecoveryDecisionPublicationContext(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationContext) ?
    options.publicationContext :
    buildPriorityRecoveryPublicationContext(options.publicationConvergence);
}

function resolvePriorityRecoveryDecisionPublicationNodeDecisions(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationNodeDecisions) ?
    options.publicationNodeDecisions :
    buildPriorityRecoveryPublicationNodeDecisions(
      options.publicationConvergence,
    );
}

function resolvePriorityRecoveryDecisionAdmission(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.admission)) {
    return options.admission;
  }
  return buildEffectivePriorityRecoveryAdmission(
    options.workflowAdmission || null,
    {
      publicationEligibleNodeIds:
        options.publicationContext.concreteEligibleNodeIds,
      publicationExcludedNodeIds: Object.keys(
        options.publicationNodeDecisions.exclusionReasonsByNodeId || {},
      ),
      recoveryEligibleIncludedNodeIds:
        options.publicationContext.recoveryEligibleIncludedNodeIds,
      prioritySummaryReadyEligibleNodeCount:
        options.priorityPartitionSummary?.readyEligibleNodeCount,
    },
  );
}

function buildPriorityRecoveryDefaultLearnerPromotion() {
  return {
    activeLearnerNodeIds: [],
    promotableLearnerNodeIds: [],
    activeLearnerNodeCount: NUM.ZERO,
    promotableLearnerNodeCount: NUM.ZERO,
    learnerHoldByNodeId: {},
  };
}

function resolvePriorityRecoveryDecisionLearnerPromotion(options = {}) {
  return isPriorityRecoverySnapshotObject(options.learnerPromotion) ?
    options.learnerPromotion :
    buildPriorityRecoveryDefaultLearnerPromotion();
}

function resolvePriorityRecoveryDecisionOperationContexts(options = {}) {
  const partitionId = String(
    options.partitionId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).trim();
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  return operationContexts.filter(
    (operationContext) =>
      isPriorityRecoverySnapshotObject(operationContext) &&
      String(
        operationContext.partitionId ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
      ).trim() === partitionId,
  );
}

function resolvePriorityRecoveryDecisionAssessment(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.assessment)) {
    return options.assessment;
  }
  return buildPriorityRecoveryPartitionAssessment({
    partitionId: options.partitionId,
    priorityPartitionSummary: options.priorityPartitionSummary,
    planner: options.planner,
    admission: options.admission,
    learnerPromotion: options.learnerPromotion,
    operationContexts: options.operationContexts,
    serialLaneOperationContexts: options.serialLaneOperationContexts,
    nowMs: options.nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
}

function resolvePriorityRecoveryDecisionCompletion(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.completion)) {
    return options.completion;
  }
  return buildPriorityRecoveryCompletion({
    assessment: options.assessment,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
}

function resolvePriorityRecoveryDecisionObservation(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.observation)) {
    return options.observation;
  }
  return buildPriorityRecoveryPartitionObservation({
    capturedAt: options.capturedAt,
    assessment: options.assessment,
    completion: options.completion,
    operationContexts: options.operationContexts,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
}

function resolvePriorityRecoveryDecisionOperationId(options = {}) {
  return typeof options.operationId === TYPEOF.STRING &&
    options.operationId.length > NUM.ZERO ?
    options.operationId :
    null;
}

function resolvePriorityRecoveryDecisionOperationContext(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.operationContext)) {
    return options.operationContext;
  }
  if (!options.operationId) {
    return null;
  }
  return (
    options.operationContexts.find(
      (candidate) => candidate.operationId === options.operationId,
    ) || null
  );
}

function buildPriorityRecoveryDecisionPublicationSnapshot(options = {}) {
  return {
    publicationStatus:
      options.publicationConvergence?.publicationStatus || null,
    publishedActiveNodeIds: options.publicationContext.publishedActiveNodeIds,
    projectedServingNodeIds: options.publicationContext.projectedServingNodeIds,
    locallyEligibleNodeIds: options.publicationContext.locallyEligibleNodeIds,
    concreteEligibleNodeIds: options.publicationContext.concreteEligibleNodeIds,
    recoveryActiveNodeIds: options.publicationContext.recoveryActiveNodeIds,
    recoveryActiveNodeSource:
      options.publicationContext.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      options.publicationContext.missingPublishedRecoveryActiveNodeIds,
    missingPublishedEligibleNodeIds:
      options.publicationContext.missingPublishedEligibleNodeIds,
    pendingAckNodeIds: normalizePriorityRecoveryStringList(
      options.publicationConvergence?.pendingAckNodeIds,
    ),
    inclusionReasonsByNodeId:
      options.publicationNodeDecisions.inclusionReasonsByNodeId,
    exclusionReasonsByNodeId:
      options.publicationNodeDecisions.exclusionReasonsByNodeId,
  };
}

function isPriorityRecoveryReadinessRecoveryEligibleOnly(readinessEntry) {
  const dimensions =
    readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      {};
  return (
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true
  );
}

function buildPriorityRecoveryDecisionReadinessSnapshot(
  readinessByNodeId,
  learnerPromotion,
) {
  return {
    recoveryEligibleOnlyNodeIds: normalizePriorityRecoveryStringList(
      Object.entries(readinessByNodeId)
        .filter(([_nodeId, readinessEntry]) =>
          isPriorityRecoveryReadinessRecoveryEligibleOnly(readinessEntry),
        )
        .map(([nodeId]) => nodeId),
    ),
    learnerPromotion,
  };
}

function buildPriorityRecoveryDecisionSnapshot(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  if (partitionId.length === NUM.ZERO) {
    return null;
  }
  const publicationConvergence =
    resolvePriorityRecoveryDecisionPublicationConvergence(options);
  const publicationEpoch = normalizePriorityRecoveryInteger(
    options.publicationEpoch ?? publicationConvergence?.publicationEpoch,
  );
  const readinessByNodeId =
    resolvePriorityRecoveryDecisionReadinessByNodeId(options);
  const priorityPartitionSummary =
    resolvePriorityRecoveryDecisionPriorityPartitionSummary(
      options,
      publicationConvergence,
    );
  const planner = resolvePriorityRecoveryDecisionPlanner({
    partitionId,
    priorityPartitionSummary,
    planner: options.planner,
  });
  const publicationContext = resolvePriorityRecoveryDecisionPublicationContext({
    publicationConvergence,
    publicationContext: options.publicationContext,
  });
  const publicationNodeDecisions =
    resolvePriorityRecoveryDecisionPublicationNodeDecisions({
      publicationConvergence,
      publicationNodeDecisions: options.publicationNodeDecisions,
    });
  const admission = resolvePriorityRecoveryDecisionAdmission({
    admission: options.admission,
    workflowAdmission: options.workflowAdmission,
    publicationContext,
    publicationNodeDecisions,
    priorityPartitionSummary,
  });
  const learnerPromotion = resolvePriorityRecoveryDecisionLearnerPromotion({
    learnerPromotion: options.learnerPromotion,
  });
  const operationContexts = resolvePriorityRecoveryDecisionOperationContexts({
    partitionId,
    operationContexts: options.operationContexts,
  });
  const assessment = resolvePriorityRecoveryDecisionAssessment({
    assessment: options.assessment,
    partitionId,
    priorityPartitionSummary,
    planner,
    admission,
    learnerPromotion,
    operationContexts,
    serialLaneOperationContexts: options.serialLaneOperationContexts,
    nowMs: options.capturedAt,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
  const semanticState = assessment.semanticState;
  const completion = resolvePriorityRecoveryDecisionCompletion({
    completion: options.completion,
    assessment,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const observation = resolvePriorityRecoveryDecisionObservation({
    observation: options.observation,
    capturedAt: options.capturedAt,
    assessment,
    completion,
    operationContexts,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const operationId = resolvePriorityRecoveryDecisionOperationId(options);
  const operationContext = resolvePriorityRecoveryDecisionOperationContext({
    operationContext: options.operationContext,
    operationId,
    operationContexts,
  });
  const latestOperationContext =
    selectLatestPriorityRecoveryOperationContext(operationContexts);
  const serialWaitOperationContexts = Array.isArray(
    assessment.serialWaitOperationContexts,
  ) ?
    assessment.serialWaitOperationContexts :
    [];
  const conditions = buildPriorityRecoveryConditionsContract({
    observation,
    assessment,
    admission,
    latestOperationContext,
    logsTable: options.logsTable,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const actuation = buildPriorityRecoveryActuationContract({
    completion,
    observation,
    assessment,
    admission,
    conditions,
    operationContexts,
    latestOperationContext,
    logsTable: options.logsTable,
    nowMs: options.capturedAt,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const progress = buildPriorityRecoveryProgressContract({
    completion,
    observation,
    assessment,
    actuation,
    operationContexts,
    latestOperationContext,
    nowMs: options.capturedAt,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });

  return {
    partitionId,
    epoch: publicationEpoch,
    operationId,
    correlationKey: buildPriorityRecoveryCorrelationKey(
      partitionId,
      publicationEpoch,
      operationId,
    ),
    semanticState,
    completion,
    observation,
    conditions,
    actuation,
    progress,
    planner,
    admission: {
      ...admission,
      ineligibleNodeIds: assessment.ineligibleNodeIds,
      recoveryEligibleExcludedNodeIds:
        assessment.recoveryEligibleExcludedNodeIds,
    },
    spreadCompletion: assessment.spreadCompletion,
    coordinator: {
      operationCount: operationContexts.length,
      operationIds: operationContexts.map((context) => context.operationId),
      operation: operationContext || latestOperationContext,
      serialWaitOperationCount: serialWaitOperationContexts.length,
      serialWaitOperationIds:
        serialWaitOperationContexts.map(
          (context) => context.operationId,
        ),
      serialWaitPartitionIds: normalizePriorityRecoveryStringList(
        serialWaitOperationContexts.map(
          (context) => context.partitionId,
        ),
      ),
    },
    publication: buildPriorityRecoveryDecisionPublicationSnapshot({
      publicationConvergence,
      publicationContext,
      publicationNodeDecisions,
    }),
    readiness: buildPriorityRecoveryDecisionReadinessSnapshot(
      readinessByNodeId,
      learnerPromotion,
    ),
    blockerReasons: assessment.blockerReasons,
  };
}

function buildPriorityRecoveryCompletionPartitionSetMap() {
  const partitionIdsByCompletionState = {};
  for (const completionState of PRIORITY_RECOVERY_COMPLETION_STATE_IDS) {
    partitionIdsByCompletionState[completionState] = new Set();
  }
  return partitionIdsByCompletionState;
}

function buildPriorityRecoveryBlockerPartitionSetMap() {
  const blockerPartitionIdsByReason = {};
  for (const blockerReason of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    blockerPartitionIdsByReason[blockerReason] = new Set();
  }
  return blockerPartitionIdsByReason;
}

function recordPriorityRecoveryDecisionSnapshotSummary(
  partitionId,
  partitionSnapshot,
  blockerPartitionIdsByReason,
  partitionIdsBySemanticState,
  partitionIdsByCompletionState,
) {
  for (const blockerReason of partitionSnapshot.blockerReasons) {
    blockerPartitionIdsByReason[blockerReason].add(partitionId);
  }
  if (
    partitionIdsBySemanticState[partitionSnapshot.semanticState] instanceof Set
  ) {
    partitionIdsBySemanticState[partitionSnapshot.semanticState].add(
      partitionId,
    );
  }
  if (
    partitionIdsByCompletionState[partitionSnapshot.completion.state] instanceof
    Set
  ) {
    partitionIdsByCompletionState[partitionSnapshot.completion.state].add(
      partitionId,
    );
  }
}

function appendPriorityRecoveryPartitionSnapshots(
  snapshots,
  partitionSnapshot,
  partitionId,
  publicationEpoch,
  operationContexts,
  byOperationId,
) {
  const operationIds =
    operationContexts.length > NUM.ZERO ?
      operationContexts.map((context) => context.operationId) :
      [null];
  for (const operationId of operationIds) {
    const operationContext =
      operationId && byOperationId[operationId] ?
        byOperationId[operationId] :
        null;
    snapshots.push({
      ...partitionSnapshot,
      operationId,
      correlationKey: buildPriorityRecoveryCorrelationKey(
        partitionId,
        publicationEpoch,
        operationId,
      ),
      coordinator: {
        ...partitionSnapshot.coordinator,
        operation: operationContext,
      },
    });
  }
}

function normalizePriorityRecoveryPartitionIdSetMap(
  partitionIdsByState,
  orderedStateIds,
) {
  const normalizedPartitionIdsByState = {};
  for (const stateId of orderedStateIds) {
    normalizedPartitionIdsByState[stateId] = [
      ...partitionIdsByState[stateId],
    ].sort();
  }
  return normalizedPartitionIdsByState;
}

function normalizePriorityRecoveryBlockerPartitionIdsByReason(
  blockerPartitionIdsByReason,
) {
  return PRIORITY_RECOVERY_PROGRESS_CLASS_IDS.reduce(
    (accumulator, blockerReason) => {
      accumulator[blockerReason] = [
        ...(blockerPartitionIdsByReason[blockerReason] || []),
      ].sort();
      return accumulator;
    },
    {},
  );
}

export {
  appendPriorityRecoveryPartitionSnapshots,
  buildPriorityRecoveryBlockerPartitionSetMap,
  buildPriorityRecoveryCompletionPartitionSetMap,
  buildPriorityRecoveryDecisionPublicationSnapshot,
  buildPriorityRecoveryDecisionReadinessSnapshot,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryDefaultLearnerPromotion,
  isPriorityRecoveryReadinessRecoveryEligibleOnly,
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
  normalizePriorityRecoveryBlockerPartitionIdsByReason,
  normalizePriorityRecoveryPartitionIdSetMap,
  recordPriorityRecoveryDecisionSnapshotSummary,
  resolvePriorityRecoveryDecisionAdmission,
  resolvePriorityRecoveryDecisionAssessment,
  resolvePriorityRecoveryDecisionCompletion,
  resolvePriorityRecoveryDecisionLearnerPromotion,
  resolvePriorityRecoveryDecisionObservation,
  resolvePriorityRecoveryDecisionOperationContext,
  resolvePriorityRecoveryDecisionOperationContexts,
  resolvePriorityRecoveryDecisionOperationId,
  resolvePriorityRecoveryDecisionPlanner,
  resolvePriorityRecoveryDecisionPriorityPartitionSummary,
  resolvePriorityRecoveryDecisionPublicationContext,
  resolvePriorityRecoveryDecisionPublicationNodeDecisions,
};
