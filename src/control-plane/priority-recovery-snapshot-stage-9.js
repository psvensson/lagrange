import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
} from './priority-recovery-diagnostics-constants.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from './priority-recovery-completion.js';
import {
  PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
  PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
} from './priority-recovery-admission-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_PROGRESS_DECISION,
  PRIORITY_RECOVERY_PROVENANCE_SOURCE,
  PRIORITY_RECOVERY_RAFT_ROLE_LEARNER,
  PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
  PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
  PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_STATUS_ACTIVE,
} from './priority-recovery-snapshot-stage-shared.js';
import {readFirstStringField, resolvePriorityRecoveryReasonCodesFromReadiness} from './priority-recovery-snapshot-stage-1.js';
import {resolvePriorityRecoveryConvergenceState, resolvePriorityRecoveryVisibilityState, resolvePriorityRecoveryWorkflowState} from './priority-recovery-snapshot-stage-7.js';
import {buildPriorityRecoveryBlockedDescriptor, buildPriorityRecoveryPendingDescriptor, buildPriorityRecoveryProgressContext, buildPriorityRecoveryProgressDecisionDescriptor, buildPriorityRecoveryProgressDecisionEvidence, buildPriorityRecoveryProgressOutcome, buildPriorityRecoveryReadyDescriptor, buildPriorityRecoveryRetryScheduledDescriptor} from './priority-recovery-snapshot-stage-8.js';

const PRIORITY_RECOVERY_PROGRESS_DECISION_TABLE = Object.freeze([
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.VISIBILITY_DEFERRED,
    matches: (evidence) => evidence.observationDeferred === true,
    build: () => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: {
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE.DEFERRED_VISIBILITY,
      },
      currentOwner:
        PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.OBSERVE_AUTHORITATIVE_VISIBILITY,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.AUTHORITATIVE_VISIBILITY,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.SERIAL_WAIT,
    matches: (evidence) => evidence.priorityOperationSerialWait === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryPendingDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.FOLLOWUP_OPERATION,
    matches: (evidence) =>
      evidence.transitionDeferredSchedulingActuation === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryRetryScheduledDescriptor(
        evidence.scheduledRetry ?
          PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED :
          PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.FOLLOWUP_OPERATION,
    matches: (evidence) => evidence.missingFollowupOperation === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryPendingDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.IN_FLIGHT_OPERATION,
    matches: (evidence) => Boolean(evidence.inFlightDescriptor),
    build: (evidence) => evidence.inFlightDescriptor,
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.CONVERGED,
    matches: (evidence) =>
      evidence.completionState === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
    build: () => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryReadyDescriptor(),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      nextRequiredAction: PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.NONE,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.SPREAD_SATISFIED_IN_FLIGHT,
    matches: (evidence) => evidence.spreadSatisfiedInFlight === true,
    build: () => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryReadyDescriptor(),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      nextRequiredAction: PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.NONE,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.OPERATION_NO_TRANSITIONS,
    matches: (evidence) => evidence.operationNoTransitions === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryBlockedDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.RECOVERY_ELIGIBLE_EXCLUDED,
    matches: (evidence) => evidence.recoveryEligibleExcluded === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryBlockedDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.ADMISSION_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_ELIGIBLE_COHORT,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.ELIGIBLE_COHORT,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.LEARNER_NEVER_PROMOTABLE,
    matches: (evidence) => evidence.learnerNeverPromotable === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryBlockedDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.ADMISSION_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RESTORE_PROMOTABLE_TARGET,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.LEARNER_PROMOTION,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.TERMINAL_OR_BLOCKED,
    matches: (evidence) => evidence.terminalOrBlocked === true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryBlockedDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
    }),
  }),
  Object.freeze({
    decision: PRIORITY_RECOVERY_PROGRESS_DECISION.DEFAULT_FOLLOWUP,
    matches: () => true,
    build: (evidence) => buildPriorityRecoveryProgressDecisionDescriptor({
      contractDescriptor: buildPriorityRecoveryBlockedDescriptor(
        evidence.scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    }),
  }),
]);

function resolvePriorityRecoveryProgressDecision(evidence = {}) {
  const decisionRule = PRIORITY_RECOVERY_PROGRESS_DECISION_TABLE.find((rule) =>
    rule.matches(evidence),
  );
  return Object.freeze(decisionRule.build(evidence));
}

function buildPriorityRecoveryProgressContract(options = {}) {
  const progressContext = buildPriorityRecoveryProgressContext(options);
  const decision = resolvePriorityRecoveryProgressDecision(
    buildPriorityRecoveryProgressDecisionEvidence(progressContext, {
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
  );
  return buildPriorityRecoveryProgressOutcome({
    ...decision,
    progressShape: progressContext.progressShape,
    lastProgressAtMs: progressContext.lastProgressAtMs,
    retryAfterMs: progressContext.retryAfterMs,
    evidenceSourceIds: progressContext.evidenceSourceIds,
  });
}

function buildPriorityRecoveryPartitionObservation(options = {}) {
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const capturedAt = normalizePriorityRecoveryInteger(options.capturedAt);
  const hasTimelineEvidence = operationContexts.some(
    (operationContext) =>
      Number(operationContext?.timelineLength || NUM.ZERO) > NUM.ZERO,
  );
  return {
    workflowState: resolvePriorityRecoveryWorkflowState(operationContexts),
    visibilityState: resolvePriorityRecoveryVisibilityState({
      completion: options.completion,
      operationContexts,
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
    convergenceState: resolvePriorityRecoveryConvergenceState(
      options.assessment,
    ),
    provenance: {
      capturedAt,
      workflowSource:
        operationContexts.length > NUM.ZERO ?
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.SYSTEM_TABLE_CACHE :
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.NONE,
      timelineSource:
        hasTimelineEvidence === true ?
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.REPLICA_OPERATION_TIMELINE :
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.NONE,
      semanticSource:
        PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT,
    },
  };
}

function buildPriorityRecoveryAdmissionByPartitionId(
  workflowAdmissionsByWorkflowId = {},
) {
  const admissionByPartitionId = {};
  for (const workflow of Object.values(workflowAdmissionsByWorkflowId || {})) {
    if (!workflow || typeof workflow !== TYPEOF.OBJECT) {
      continue;
    }
    const workflowId = String(workflow.workflowId || '').trim();
    if (workflowId.length === NUM.ZERO) {
      continue;
    }
    const admission =
      workflow.admission && typeof workflow.admission === TYPEOF.OBJECT ?
        workflow.admission :
        null;
    const partitionIds = normalizePriorityRecoveryStringList([
      workflow.sourcePartitionId,
      ...(Array.isArray(workflow.targetPartitionIds) ?
        workflow.targetPartitionIds :
        []),
    ]);
    for (const partitionId of partitionIds) {
      admissionByPartitionId[partitionId] = {
        workflowId,
        workflowType: workflow.workflowType || null,
        transitionState: workflow.transitionState || null,
        decisionType: admission?.decisionType || null,
        decisionDimension: admission?.decisionDimension || null,
        admissionDecisionAt: workflow.admissionDecisionAt || null,
        eligibleNodeIds: normalizePriorityRecoveryStringList(
          admission?.eligibleNodeIds,
        ),
        ineligibleNodes: Array.isArray(admission?.ineligibleNodes) ?
          admission.ineligibleNodes
            .map((entry) => ({
              nodeId: String(
                entry?.nodeId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
              ),
              reasonCodes: normalizePriorityRecoveryStringList(
                entry?.reasonCodes,
              ),
            }))
            .filter((entry) => entry.nodeId.length > NUM.ZERO) :
          [],
        blockingReasons: normalizePriorityRecoveryStringList(
          workflow.blockingReasons,
        ),
      };
    }
  }
  return admissionByPartitionId;
}

function buildPriorityRecoveryLearnerPromotionByPartitionId(
  serviceRows = [],
  readinessByNodeId = {},
  recoveryActiveNodeIds = [],
) {
  const learnerByPartitionId = {};
  for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
      'partitionId',
    );
    if (!partitionId) {
      continue;
    }
    const status = String(
      readFirstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
        'status',
      ) || '',
    ).toLowerCase();
    const raftRole = String(
      readFirstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
        'raftRole',
      ) || '',
    ).toLowerCase();
    if (
      status !== PRIORITY_RECOVERY_STATUS_ACTIVE ||
      raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER
    ) {
      continue;
    }
    const nodeId = readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
      'nodeId',
    );
    if (!nodeId) {
      continue;
    }
    if (!learnerByPartitionId[partitionId]) {
      learnerByPartitionId[partitionId] = [];
    }
    learnerByPartitionId[partitionId].push(nodeId);
  }

  const learnerPromotionByPartitionId = {};
  for (const [partitionId, learnerNodeIds] of Object.entries(
    learnerByPartitionId,
  )) {
    learnerPromotionByPartitionId[partitionId] =
      buildPriorityRecoveryLearnerPromotion({
        activeLearnerNodeIds: learnerNodeIds,
        readinessByNodeId,
        recoveryActiveNodeIds,
      });
  }

  return learnerPromotionByPartitionId;
}

function buildPriorityRecoveryLearnerPromotion(options = {}) {
  const activeLearnerNodeIds = normalizePriorityRecoveryStringList(
    options.activeLearnerNodeIds,
  );
  const normalizedReadinessByNodeId =
    options.readinessByNodeId &&
    typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const recoveryActiveNodeIdSet = new Set(
    normalizePriorityRecoveryStringList(options.recoveryActiveNodeIds),
  );
  const learnerHoldByNodeId = {};
  const promotableLearnerNodeIds = [];

  for (const nodeId of activeLearnerNodeIds) {
    const readiness = normalizedReadinessByNodeId[nodeId] || null;
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
        readiness.dimensions :
        {};
    const repairEligible =
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
    const recoveryCohortIncludesNode = recoveryActiveNodeIdSet.has(nodeId);
    if (repairEligible || recoveryCohortIncludesNode) {
      promotableLearnerNodeIds.push(nodeId);
      continue;
    }
    const recoveryEligible =
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true;
    const reasonCodes =
      resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
    learnerHoldByNodeId[nodeId] = {
      holdReason: readiness ?
        recoveryEligible ?
          PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY :
          PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE :
        PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
      reasonCodes,
    };
  }

  return {
    activeLearnerNodeIds,
    promotableLearnerNodeIds,
    activeLearnerNodeCount: activeLearnerNodeIds.length,
    promotableLearnerNodeCount: promotableLearnerNodeIds.length,
    learnerHoldByNodeId,
  };
}

function buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence) {
  const projectionDiagnostics =
    publicationConvergence?.projectionDiagnostics &&
    typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT ?
      publicationConvergence.projectionDiagnostics :
      publicationConvergence?.membershipLifecycleSummary
        ?.projectionDiagnostics &&
          typeof publicationConvergence.membershipLifecycleSummary
            .projectionDiagnostics === TYPEOF.OBJECT ?
        publicationConvergence.membershipLifecycleSummary
          .projectionDiagnostics :
        null;
  const inclusionReasonsByNodeId = {};
  const exclusionReasonsByNodeId = {};
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.recoveryEligibleIncludedNodeIds,
  )) {
    inclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.readinessExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      ...(Array.isArray(exclusionReasonsByNodeId[nodeId]) ?
        exclusionReasonsByNodeId[nodeId] :
        []),
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
    ];
  }
  return {
    inclusionReasonsByNodeId,
    exclusionReasonsByNodeId,
  };
}

function normalizePriorityRecoveryFallbackEligibleNodeIds(
  candidateNodeIds = [],
  excludedNodeIds = [],
) {
  const excludedNodeIdSet = new Set(
    normalizePriorityRecoveryStringList(excludedNodeIds),
  );
  return normalizePriorityRecoveryStringList(candidateNodeIds).filter(
    (nodeId) => !excludedNodeIdSet.has(nodeId),
  );
}

function buildEffectivePriorityRecoveryAdmission(admission, options = {}) {
  const normalizedAdmission =
    admission && typeof admission === TYPEOF.OBJECT ? admission : {};
  const publicationExcludedNodeIds = normalizePriorityRecoveryStringList(
    options.publicationExcludedNodeIds,
  );
  const explicitEligibleNodeIds = normalizePriorityRecoveryStringList(
    normalizedAdmission.eligibleNodeIds,
  );
  const publicationEligibleNodeIds =
    normalizePriorityRecoveryFallbackEligibleNodeIds(
      options.publicationEligibleNodeIds,
      publicationExcludedNodeIds,
    );
  const projectionEligibleNodeIds =
    normalizePriorityRecoveryFallbackEligibleNodeIds(
      options.recoveryEligibleIncludedNodeIds,
      publicationExcludedNodeIds,
    );
  const readyEligibleNodeCount = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(
      options.prioritySummaryReadyEligibleNodeCount,
    ) || NUM.ZERO,
  );

  let effectiveEligibleNodeIds = explicitEligibleNodeIds;
  let effectiveEligibleNodeCount = explicitEligibleNodeIds.length;
  let eligibilityEvidenceSource =
    PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.UNKNOWN;
  if (effectiveEligibleNodeCount > NUM.ZERO) {
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.WORKFLOW_ADMISSION;
  } else if (publicationEligibleNodeIds.length > NUM.ZERO) {
    effectiveEligibleNodeIds = publicationEligibleNodeIds;
    effectiveEligibleNodeCount = publicationEligibleNodeIds.length;
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_MEMBERSHIP;
  } else if (projectionEligibleNodeIds.length > NUM.ZERO) {
    effectiveEligibleNodeIds = projectionEligibleNodeIds;
    effectiveEligibleNodeCount = projectionEligibleNodeIds.length;
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_RECOVERY_PROJECTION;
  } else if (readyEligibleNodeCount > NUM.ZERO) {
    effectiveEligibleNodeCount = readyEligibleNodeCount;
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PRIORITY_SUMMARY_READY_ELIGIBLE;
  }

  return {
    workflowId: normalizedAdmission.workflowId || null,
    workflowType: normalizedAdmission.workflowType || null,
    transitionState: normalizedAdmission.transitionState || null,
    decisionType: normalizedAdmission.decisionType || null,
    decisionDimension: normalizedAdmission.decisionDimension || null,
    admissionDecisionAt: normalizedAdmission.admissionDecisionAt || null,
    eligibleNodeIds: explicitEligibleNodeIds,
    ineligibleNodes: Array.isArray(normalizedAdmission.ineligibleNodes) ?
      normalizedAdmission.ineligibleNodes :
      [],
    blockingReasons: normalizePriorityRecoveryStringList(
      normalizedAdmission.blockingReasons,
    ),
    effectiveEligibleNodeIds,
    effectiveEligibleNodeCount,
    eligibilityEvidenceSource,
    eligibilityCohortComplete:
      effectiveEligibleNodeIds.length === effectiveEligibleNodeCount,
    decisionMissing:
      normalizedAdmission.decisionType === null &&
      normalizedAdmission.decisionDimension === null &&
      explicitEligibleNodeIds.length === NUM.ZERO &&
      (!Array.isArray(normalizedAdmission.ineligibleNodes) ||
        normalizedAdmission.ineligibleNodes.length === NUM.ZERO) &&
      (!Array.isArray(normalizedAdmission.blockingReasons) ||
        normalizedAdmission.blockingReasons.length === NUM.ZERO),
  };
}

function isPriorityRecoverySnapshotObject(value) {
  return value && typeof value === TYPEOF.OBJECT;
}

function resolvePriorityRecoveryDecisionPublicationConvergence(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
}

function resolvePriorityRecoveryDecisionReadinessByNodeId(options = {}) {
  return isPriorityRecoverySnapshotObject(options.readinessByNodeId) ?
    options.readinessByNodeId :
    {};
}

export {
  PRIORITY_RECOVERY_PROGRESS_DECISION_TABLE,
  buildEffectivePriorityRecoveryAdmission,
  buildPriorityRecoveryAdmissionByPartitionId,
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryLearnerPromotionByPartitionId,
  buildPriorityRecoveryPartitionObservation,
  buildPriorityRecoveryProgressContract,
  buildPriorityRecoveryPublicationNodeDecisions,
  isPriorityRecoverySnapshotObject,
  resolvePriorityRecoveryDecisionPublicationConvergence,
  resolvePriorityRecoveryDecisionReadinessByNodeId,
  resolvePriorityRecoveryProgressDecision,
};
