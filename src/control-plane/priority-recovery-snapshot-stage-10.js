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
import {normalizePriorityRecoverySnapshotFromOperationOwnerOutcome} from './priority-recovery-operation-owner-observation.js';
import {
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from './priority-recovery-snapshot-stage-shared.js';
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry} from './priority-recovery-snapshot-stage-1.js';
import {buildPriorityRecoveryConditionsContract, selectLatestPriorityRecoveryOperationContext} from './priority-recovery-snapshot-stage-7.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-stage-8.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract, buildPriorityRecoveryPublicationNodeDecisions, isPriorityRecoverySnapshotObject, resolvePriorityRecoveryDecisionPublicationConvergence, resolvePriorityRecoveryDecisionReadinessByNodeId} from './priority-recovery-snapshot-stage-9.js';
import {buildPriorityRecoveryPartitionAssessment} from './priority-recovery-snapshot-stage-11.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../rebalancer/operation-workflow-owner-constants.js';

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE =
  Object.freeze({
    ABSENT: 'diagnostic_dispatch_pending_owner_absent',
    ADVANCE_EXISTING_OPERATION:
      'diagnostic_dispatch_pending_owner_advance_existing_operation',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS =
  Object.freeze(new Set([WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_ACTUATION_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_PROGRESS_ACTIONS =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_EXCLUDED_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE =
  Object.freeze({
    COMPATIBLE: 'diagnostic_dispatch_pending_target_compatible',
    MISMATCH: 'diagnostic_dispatch_pending_target_mismatch',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) => evidence.workflowStep === WORKFLOW_STEP.PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) =>
        evidence.workflowStep === WORKFLOW_STEP.SENDING &&
        evidence.targetVisibilityState ===
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) =>
        evidence.workflowStep === WORKFLOW_STEP.SENDING &&
        evidence.targetVisibilityState ===
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE &&
        evidence.targetServiceTerminalState !==
          PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.MISMATCH,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT =
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE.ABSENT,
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE
          .ADVANCE_EXISTING_OPERATION,
      matches: (evidence) =>
        evidence.operationContextAvailable === true &&
        evidence.operationOwnerObservationAbsent === true &&
        evidence.ownerDiagnosticAllowed === true &&
        evidence.workflowStepDispatchPending === true &&
        evidence.operationStatusPending === true &&
        evidence.targetVisibilityDispatchPending === true &&
        evidence.actuationOwnerWorkflow === true &&
        evidence.actuationStateDispatchPending === true &&
        evidence.actuationPhaseDispatchPending === true &&
        evidence.progressOwnerWorkflow === true &&
        evidence.progressDispatchPendingAction === true &&
        evidence.progressBoundaryWorkflow === true &&
        evidence.progressWaitEventDriven === true &&
        evidence.progressPhaseDispatchPending === true,
      build: (evidence) => Object.freeze({
        owner: OPERATION_WORKFLOW_OWNER,
        boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
        state:
          PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE
            .ADVANCE_EXISTING_OPERATION,
        outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        nextRequiredAction:
          OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        effectCommand:
          OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
            .ADVANCE_EXISTING_OPERATION_COMMAND,
        reasons: Object.freeze([
          OPERATION_WORKFLOW_REASON_CODE_VALUES
            .WORKFLOW_TRANSITION_AVAILABLE,
        ]),
        correlationKey: evidence.correlationKey,
        sourceRevision: evidence.sourceRevision,
      }),
    }),
    Object.freeze({
      state: PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE.ABSENT,
      matches: () => true,
      build: () => PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT,
    }),
  ]);

function normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
  snapshot = null,
  operationOwnerOutcome = null,
) {
  return normalizePriorityRecoverySnapshotFromOperationOwnerOutcome(
    snapshot,
    operationOwnerOutcome,
  );
}

function normalizePriorityRecoveryDiagnosticOwnerText(value, fallback) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}

function resolvePriorityRecoveryDispatchPendingDiagnosticTargetState(
  evidence,
) {
  return PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_TABLE
    .find((entry) => entry.matches(evidence)).state;
}

function resolvePriorityRecoveryDiagnosticOwnerRevision(
  snapshot,
  operationContext,
) {
  const revision = normalizePriorityRecoveryInteger(
    operationContext?.updatedAtMs ||
      operationContext?.createdAtMs ||
      snapshot?.capturedAt,
  );
  return Number.isFinite(revision) ?
    String(revision) :
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
}

function buildPriorityRecoveryDispatchPendingDiagnosticOwnerEvidence(
  snapshot,
  operationContext,
) {
  const workflowStep = String(
    operationContext?.workflowStep || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  const operationStatus = String(
    operationContext?.status || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toLowerCase();
  const targetVisibilityState = normalizePriorityRecoveryDiagnosticOwnerText(
    operationContext?.targetVisibilityState,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  );
  const targetServiceTerminalState =
    normalizePriorityRecoveryDiagnosticOwnerText(
      operationContext?.targetServiceTerminalState,
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
    );
  const targetState =
    resolvePriorityRecoveryDispatchPendingDiagnosticTargetState(
      Object.freeze({
        workflowStep,
        targetVisibilityState,
        targetServiceTerminalState,
      }),
    );
  return Object.freeze({
    operationContextAvailable:
      operationContext && typeof operationContext === TYPEOF.OBJECT,
    operationOwnerObservationAbsent:
      !isPriorityRecoverySnapshotObject(snapshot?.operationOwnerObservation),
    ownerDiagnosticAllowed:
      !PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_EXCLUDED_STATES
        .has(snapshot?.semanticState),
    workflowStepDispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS.has(
        workflowStep,
      ),
    operationStatusPending: operationStatus === ReplicaStatus.PENDING,
    targetVisibilityDispatchPending:
      targetState ===
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
    actuationOwnerWorkflow:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    actuationStateDispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ),
    actuationPhaseDispatchPending:
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    progressOwnerWorkflow:
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    progressDispatchPendingAction:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_PROGRESS_ACTIONS.has(
        snapshot?.progress?.nextRequiredAction,
      ),
    progressBoundaryWorkflow:
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    progressWaitEventDriven:
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    progressPhaseDispatchPending:
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    correlationKey: normalizePriorityRecoveryDiagnosticOwnerText(
      snapshot?.correlationKey,
      buildPriorityRecoveryCorrelationKey(
        snapshot?.partitionId,
        snapshot?.publicationEpoch,
        operationContext?.operationId,
      ),
    ),
    sourceRevision: resolvePriorityRecoveryDiagnosticOwnerRevision(
      snapshot,
      operationContext,
    ),
  });
}

function buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome(
  snapshot,
  operationContext,
) {
  const evidence =
    buildPriorityRecoveryDispatchPendingDiagnosticOwnerEvidence(
      snapshot,
      operationContext,
    );
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.build(evidence) ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT
  );
}

function resolvePriorityRecoveryDecisionOperationOwnerOutcome(
  options,
  snapshot,
  operationContext,
) {
  return options.operationOwnerOutcome ||
    buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome(
      snapshot,
      operationContext,
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

  const snapshot = {
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
  return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
    snapshot,
    resolvePriorityRecoveryDecisionOperationOwnerOutcome(
      options,
      snapshot,
      operationContext || latestOperationContext,
    ),
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
    const snapshotWithOperationContext = {
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
    };
    const appendedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        snapshotWithOperationContext,
        buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome(
          snapshotWithOperationContext,
          operationContext,
        ),
      );
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
