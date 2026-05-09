import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../rebalancer/operation-workflow-owner-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  buildPriorityRecoveryCompletion,
} from './priority-recovery-completion.js';
import {
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {normalizePriorityRecoverySnapshotFromOperationOwnerOutcome} from './priority-recovery-operation-owner-observation.js';
import {PRIORITY_RECOVERY_SNAPSHOT_LITERAL} from './priority-recovery-snapshot-stage-shared.js';
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry} from './priority-recovery-snapshot-stage-1.js';
import {buildPriorityRecoveryConditionsContract, selectLatestPriorityRecoveryOperationContext} from './priority-recovery-snapshot-stage-7.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-stage-8.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract, buildPriorityRecoveryPublicationNodeDecisions, isPriorityRecoverySnapshotObject, resolvePriorityRecoveryDecisionPublicationConvergence, resolvePriorityRecoveryDecisionReadinessByNodeId} from './priority-recovery-snapshot-stage-9.js';
import {buildPriorityRecoveryPartitionAssessment} from './priority-recovery-snapshot-stage-11.js';

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE = Object.freeze({
  NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
  NOT_DISPATCH_PENDING: 'not_dispatch_pending',
  NOT_EVENT_DRIVEN_ADVANCE: 'not_event_driven_advance',
  PERSISTED_TIMEOUT_RECONCILE: 'persisted_timeout_reconcile',
  OPERATION_STALL_BLOCKED: 'operation_stall_blocked',
  EVENT_DRIVEN_ADVANCE: 'event_driven_advance',
});

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_DISPATCH_STATES =
  Object.freeze(
    new Set([
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    ]),
  );

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .NOT_OPERATION_WORKFLOW_OWNER,
      matches: (evidence) => evidence.operationWorkflowOwner !== true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .NOT_DISPATCH_PENDING,
      matches: (evidence) => evidence.dispatchPending !== true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .NOT_EVENT_DRIVEN_ADVANCE,
      matches: (evidence) => evidence.eventDrivenAdvance !== true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .PERSISTED_TIMEOUT_RECONCILE,
      matches: (evidence) =>
        evidence.persistedNotDispatched === true &&
        evidence.timeoutReconcileDue === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .OPERATION_STALL_BLOCKED,
      matches: (evidence) => evidence.operationNoTransitionsBlocked === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .EVENT_DRIVEN_ADVANCE,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_OUTCOME_BY_STATE =
  Object.freeze(
    new Map([
      [
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .PERSISTED_TIMEOUT_RECONCILE,
        Object.freeze({
          outcome:
            OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
          effectCommand:
            OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
              .RECONCILE_STALE_PROGRESS_COMMAND,
          reasons: Object.freeze([
            OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
            OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
          ]),
        }),
      ],
      [
        PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
          .EVENT_DRIVEN_ADVANCE,
        Object.freeze({
          outcome:
            OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
          effectCommand:
            OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
              .ADVANCE_EXISTING_OPERATION_COMMAND,
          reasons: Object.freeze([
            OPERATION_WORKFLOW_REASON_CODE_VALUES
              .WORKFLOW_TRANSITION_AVAILABLE,
          ]),
        }),
      ],
    ]),
  );

function buildPriorityRecoveryDispatchPendingOwnerReentryEvidence(
  snapshot,
) {
  return Object.freeze({
    operationWorkflowOwner:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    dispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_DISPATCH_STATES.has(
        snapshot?.actuation?.state,
      ) &&
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    persistedNotDispatched:
      snapshot?.actuation?.state ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    timeoutReconcileDue: snapshot?.actuation?.timeoutReconcileDue === true,
    operationNoTransitionsBlocked:
      Array.isArray(snapshot?.blockerReasons) &&
      snapshot.blockerReasons.includes(
        PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
      ),
    eventDrivenAdvance:
      snapshot?.progress?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  });
}

function resolvePriorityRecoveryDispatchPendingOwnerReentryState(
  snapshot,
) {
  const evidence =
    buildPriorityRecoveryDispatchPendingOwnerReentryEvidence(snapshot);
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE_TABLE.find(
      (entry) => entry.matches(evidence),
    )?.state ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_STATE
      .NOT_OPERATION_WORKFLOW_OWNER
  );
}

function buildPriorityRecoveryDispatchPendingOwnerReentryOutcome(snapshot) {
  const reentryState =
    resolvePriorityRecoveryDispatchPendingOwnerReentryState(snapshot);
  const outcomeDescriptor =
    PRIORITY_RECOVERY_DISPATCH_PENDING_OWNER_REENTRY_OUTCOME_BY_STATE.get(
      reentryState,
    );
  if (!outcomeDescriptor) {
    return null;
  }
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: snapshot?.operationId,
    correlationKey: snapshot?.correlationKey,
    sourceRevision: snapshot?.actuation?.lastProgressAtMs,
    outcome: outcomeDescriptor.outcome,
    nextRequiredAction: outcomeDescriptor.outcome,
    effectCommand: outcomeDescriptor.effectCommand,
    reasons: outcomeDescriptor.reasons,
  });
}

function normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
  snapshot = null,
  operationOwnerOutcome = null,
) {
  return normalizePriorityRecoverySnapshotFromOperationOwnerOutcome(
    snapshot,
    operationOwnerOutcome ||
      buildPriorityRecoveryDispatchPendingOwnerReentryOutcome(snapshot),
  );
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

  return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
    {
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
    },
    options.operationOwnerOutcome,
  );
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
  const appendedSnapshots = [];
  const operationIds =
    operationContexts.length > NUM.ZERO ?
      operationContexts.map((context) => context.operationId) :
      [null];
  for (const operationId of operationIds) {
    const operationContext =
      operationId && byOperationId[operationId] ?
        byOperationId[operationId] :
        null;
    const appendedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot({
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
    snapshots.push(appendedSnapshot);
    appendedSnapshots.push(appendedSnapshot);
  }
  return appendedSnapshots;
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
