import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
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
  buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome,
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from './priority-recovery-dispatch-pending-diagnostic-owner.js';
import {PRIORITY_RECOVERY_SNAPSHOT_LITERAL} from './priority-recovery-snapshot-contract.js';
import {buildTopologyOperatorWitnessFromWorkflowProgress} from './topology-operator-witness.js';
import {buildPriorityRecoveryPlannerByPartitionId, buildPriorityRecoveryPlannerEntry} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryConditionsContract, selectLatestPriorityRecoveryOperationContext} from './priority-recovery-snapshot-observation.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-actuation.js';
import {buildEffectivePriorityRecoveryAdmission, buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract, buildPriorityRecoveryPublicationNodeDecisions, isPriorityRecoverySnapshotObject, resolvePriorityRecoveryDecisionPublicationConvergence, resolvePriorityRecoveryDecisionReadinessByNodeId} from './priority-recovery-snapshot-burndown.js';
import {buildPriorityRecoveryPartitionAssessment} from './priority-recovery-snapshot-closure.js';

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

function shouldAttachPriorityRecoveryTopologyOperatorWitness(snapshot = {}) {
  return (
    snapshot?.progress?.currentOwner ===
    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER
  );
}

function attachPriorityRecoveryTopologyOperatorWitness(snapshot = {}) {
  if (!shouldAttachPriorityRecoveryTopologyOperatorWitness(snapshot)) {
    return snapshot;
  }
  const topologyOperatorWitness =
    buildTopologyOperatorWitnessFromWorkflowProgress(snapshot);
  return {
    ...snapshot,
    topologyOperatorWitness,
    progress: {
      ...snapshot.progress,
      topologyOperatorWitness,
    },
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
  const snapshotWithTopologyOperatorWitness =
    attachPriorityRecoveryTopologyOperatorWitness(snapshot);
  return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
    snapshotWithTopologyOperatorWitness,
    resolvePriorityRecoveryDecisionOperationOwnerOutcome(
      options,
      snapshotWithTopologyOperatorWitness,
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

function stripInheritedPriorityRecoveryOperationOwnerObservation(snapshot) {
  const sanitizedSnapshot = {...snapshot};
  delete sanitizedSnapshot.operationOwnerObservation;
  delete sanitizedSnapshot.progressContract;
  if (isPriorityRecoverySnapshotObject(sanitizedSnapshot.progress)) {
    sanitizedSnapshot.progress = {...sanitizedSnapshot.progress};
    delete sanitizedSnapshot.progress.progressContract;
  }
  if (isPriorityRecoverySnapshotObject(sanitizedSnapshot.progressSummary)) {
    sanitizedSnapshot.progressSummary = {...sanitizedSnapshot.progressSummary};
    delete sanitizedSnapshot.progressSummary.progressContract;
  }
  return sanitizedSnapshot;
}

function resolvePriorityRecoveryOperationSnapshotCapturedAt(snapshot) {
  return normalizePriorityRecoveryInteger(
    snapshot?.observation?.provenance?.capturedAt,
  );
}

function resolvePriorityRecoveryOperationSnapshotLearnerPromotion(snapshot) {
  return isPriorityRecoverySnapshotObject(snapshot?.readiness?.learnerPromotion) ?
    snapshot.readiness.learnerPromotion :
    null;
}

function buildPriorityRecoveryOperationSnapshotAssessment(
  snapshot,
  operationContexts,
  capturedAt,
) {
  return buildPriorityRecoveryPartitionAssessment({
    partitionId: snapshot.partitionId,
    planner: snapshot.planner,
    admission: snapshot.admission,
    learnerPromotion:
      resolvePriorityRecoveryOperationSnapshotLearnerPromotion(snapshot),
    operationContexts,
    nowMs: capturedAt,
  });
}

function preservePriorityRecoveryOperationSnapshotPressure(
  conditions,
  snapshot,
) {
  if (!isPriorityRecoverySnapshotObject(snapshot?.conditions?.pressure)) {
    return conditions;
  }
  return Object.freeze({
    ...conditions,
    pressure: snapshot.conditions.pressure,
  });
}

function buildPriorityRecoveryOperationSpecificSnapshotBase(
  partitionSnapshot,
  operationContext,
) {
  const sanitizedSnapshot =
    stripInheritedPriorityRecoveryOperationOwnerObservation(
      partitionSnapshot,
    );
  if (!isPriorityRecoverySnapshotObject(operationContext)) {
    return sanitizedSnapshot;
  }
  const operationContexts = [operationContext];
  const capturedAt =
    resolvePriorityRecoveryOperationSnapshotCapturedAt(sanitizedSnapshot);
  const authoritativeOperationReadDeferred =
    sanitizedSnapshot.conditions?.authoritativeOperationReadDeferred === true;
  const assessment = buildPriorityRecoveryOperationSnapshotAssessment(
    sanitizedSnapshot,
    operationContexts,
    capturedAt,
  );
  const completion =
    isPriorityRecoverySnapshotObject(sanitizedSnapshot.completion) ?
      sanitizedSnapshot.completion :
      buildPriorityRecoveryCompletion({
        assessment,
        authoritativeOperationReadDeferred,
      });
  const observation = buildPriorityRecoveryPartitionObservation({
    capturedAt,
    assessment,
    completion,
    operationContexts,
    authoritativeOperationReadDeferred,
  });
  const conditions = preservePriorityRecoveryOperationSnapshotPressure(
    buildPriorityRecoveryConditionsContract({
      observation,
      assessment,
      admission: sanitizedSnapshot.admission,
      latestOperationContext: operationContext,
      authoritativeOperationReadDeferred,
    }),
    sanitizedSnapshot,
  );
  const actuation = buildPriorityRecoveryActuationContract({
    completion,
    observation,
    assessment,
    admission: sanitizedSnapshot.admission,
    conditions,
    operationContexts,
    latestOperationContext: operationContext,
    nowMs: capturedAt,
    authoritativeOperationReadDeferred,
  });
  const progress = buildPriorityRecoveryProgressContract({
    completion,
    observation,
    assessment,
    actuation,
    operationContexts,
    latestOperationContext: operationContext,
    nowMs: capturedAt,
    authoritativeOperationReadDeferred,
  });
  return {
    ...sanitizedSnapshot,
    observation,
    conditions,
    actuation,
    progress,
  };
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
    const operationSnapshotBase =
      buildPriorityRecoveryOperationSpecificSnapshotBase(
        partitionSnapshot,
        operationContext,
      );
    const snapshotWithOperationContext = {
      ...operationSnapshotBase,
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
    const snapshotWithTopologyOperatorWitness =
      attachPriorityRecoveryTopologyOperatorWitness(
        snapshotWithOperationContext,
      );
    const appendedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        snapshotWithTopologyOperatorWitness,
        buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome(
          snapshotWithTopologyOperatorWitness,
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
