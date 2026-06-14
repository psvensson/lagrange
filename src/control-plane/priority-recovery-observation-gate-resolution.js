import {NUM, TYPEOF} from '../constants/index.js';
import {buildPublicationRecoveryGateSnapshot} from './publication-recovery-gate.js';
import {LOCAL_EMPTY_LIST, LOCAL_STR_EMPTY, PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD, PRIORITY_RECOVERY_OBSERVATION_GATE_FIELD, PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE, PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE, isRecord, normalizeDistinctStringArray, normalizeNonNegativeInteger, normalizePriorityPartitionSummary} from './priority-recovery-observation-normalization.js';

function resolveProjectionDiagnostics(publicationConvergence = null) {
  const projectionDiagnostics =
    isRecord(publicationConvergence?.projectionDiagnostics) ?
      publicationConvergence.projectionDiagnostics :
      isRecord(publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics) ?
        publicationConvergence.membershipLifecycleSummary.projectionDiagnostics :
        null;
  if (!isRecord(projectionDiagnostics)) {
    return null;
  }
  return Object.freeze({
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.readinessDecisionDimensions,
      ),
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.recoveryEligibleIncludedNodeIds,
      ),
    ),
    readinessExcludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.readinessExcludedNodeIds,
      ),
    ),
    clusterMemberUnhealthyExcludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
      ),
    ),
  });
}

function resolvePriorityRecoveryReasonCodes(
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  const reasonCodes = [
    ...normalizeDistinctStringArray(
      publicationConvergence?.priorityRecoveryReasonCodes ||
        publicationConvergence?.membershipLifecycleSummary?.priorityRecoveryReasonCodes,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergenceGate?.reasonCodes ||
        publicationConvergenceGate?.reasons,
    ),
  ];
  return Object.freeze(normalizeDistinctStringArray(reasonCodes));
}

function shouldApplyObservationClosureWitness(
  priorityRecoveryClosureWitness = null,
) {
  return priorityRecoveryClosureWitness?.prioritySpreadPending === false;
}

function resolveObservationPublicationConvergenceGate(
  options = {},
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  const providedPublicationConvergenceGate =
    isRecord(publicationConvergenceGate) ?
      publicationConvergenceGate :
      null;
  const priorityRecoveryClosureWitness =
    isRecord(options.priorityRecoveryClosureWitness) ?
      options.priorityRecoveryClosureWitness :
      isRecord(providedPublicationConvergenceGate?.priorityRecoveryClosureWitness) ?
        providedPublicationConvergenceGate.priorityRecoveryClosureWitness :
        isRecord(options.priorityRecoveryDecisionSnapshots?.closureWitness) ?
          options.priorityRecoveryDecisionSnapshots.closureWitness :
          isRecord(publicationConvergence?.priorityRecoveryClosureWitness) ?
            publicationConvergence.priorityRecoveryClosureWitness :
            null;
  const hasDecisionSnapshotContext = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  );
  const providedGateIsCanonical =
    typeof providedPublicationConvergenceGate?.[
      PRIORITY_RECOVERY_OBSERVATION_GATE_FIELD.PRIORITY_SPREAD_DECISION_SOURCE
    ] === TYPEOF.STRING;
  if (providedPublicationConvergenceGate && providedGateIsCanonical) {
    return providedPublicationConvergenceGate;
  }
  if (
    providedPublicationConvergenceGate &&
    !hasDecisionSnapshotContext &&
    !priorityRecoveryClosureWitness
  ) {
    return providedPublicationConvergenceGate;
  }
  if (
    !providedPublicationConvergenceGate &&
    !isRecord(publicationConvergence) &&
    !hasDecisionSnapshotContext
  ) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch:
      providedPublicationConvergenceGate?.publicationEpoch ??
      publicationConvergence?.publicationEpoch,
    publicationStatus:
      providedPublicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus ||
      publicationConvergence?.status ||
      null,
    publicationObservationState:
      providedPublicationConvergenceGate?.publicationObservationState ||
      publicationConvergence?.publicationObservationState ||
      null,
    recoveryProtocolState:
      providedPublicationConvergenceGate?.recoveryProtocolState ||
      publicationConvergence?.recoveryProtocolState ||
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState,
    priorityRecoveryReasonCodes:
      providedPublicationConvergenceGate?.reasonCodes ||
      providedPublicationConvergenceGate?.reasons ||
      publicationConvergence?.priorityRecoveryReasonCodes ||
      publicationConvergence?.membershipLifecycleSummary?.priorityRecoveryReasonCodes,
    priorityPartitionSummary:
      providedPublicationConvergenceGate?.priorityPartitionSummary ||
      publicationConvergence?.priorityPartitionSummary,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      priorityRecoveryClosureWitness,
    pendingAckNodeIds:
      providedPublicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
    missingPublishedNodeIds:
      providedPublicationConvergenceGate?.missingPublishedNodeIds ||
      publicationConvergence?.missingPublishedNodeIds ||
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
  });
}

function resolveObservationPriorityRecoveryClosureWitness(
  options = {},
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  return isRecord(options.priorityRecoveryClosureWitness) ?
    options.priorityRecoveryClosureWitness :
    isRecord(options.priorityRecoveryDecisionSnapshots?.closureWitness) ?
      options.priorityRecoveryDecisionSnapshots.closureWitness :
      isRecord(publicationConvergenceGate?.priorityRecoveryClosureWitness) ?
        publicationConvergenceGate.priorityRecoveryClosureWitness :
        isRecord(publicationConvergence?.priorityRecoveryClosureWitness) ?
          publicationConvergence.priorityRecoveryClosureWitness :
          null;
}

function resolveObservationPriorityPartitionSummary(
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryClosureWitness = null,
) {
  const publicationSummary = normalizePriorityPartitionSummary(
    publicationConvergence?.priorityPartitionSummary,
  );
  const gateSummary = normalizePriorityPartitionSummary(
    publicationConvergenceGate?.priorityPartitionSummary,
  );
  const closureWitnessSummary = normalizePriorityPartitionSummary(
    priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
  );
  return shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness) ?
    gateSummary || closureWitnessSummary || publicationSummary :
    publicationSummary || gateSummary || closureWitnessSummary;
}

function resolveObservationPriorityRecoveryReasonCodes(
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryClosureWitness = null,
) {
  if (shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness)) {
    return Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergenceGate?.reasonCodes ||
          publicationConvergenceGate?.reasons,
      ),
    );
  }
  return resolvePriorityRecoveryReasonCodes(
    publicationConvergence,
    publicationConvergenceGate,
  );
}

function resolveObservationPriorityRecoveryBlockedPartitionIds(
  priorityPartitionSummary = null,
  decisionSnapshotSummary = null,
) {
  const decisionBlockedPartitionIds = normalizeDistinctStringArray(
    decisionSnapshotSummary?.blockedPartitionIds,
  );
  if (decisionBlockedPartitionIds.length > NUM.ZERO) {
    return decisionBlockedPartitionIds;
  }
  const convergenceBlockedPartitionIds = Object.freeze(
    normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(priorityPartitionSummary?.missingPartitionIds),
      ...(Array.isArray(priorityPartitionSummary?.blockedPartitions) ?
        priorityPartitionSummary.blockedPartitions.map(
          (entry) => entry?.partitionId,
        ) :
        []),
    ]),
  );
  return convergenceBlockedPartitionIds.length > NUM.ZERO ?
    convergenceBlockedPartitionIds :
    decisionBlockedPartitionIds;
}

function resolveObservationActiveGateContext(options = {}) {
  const activeGateProgress = isRecord(options.activeGateProgress) ?
    options.activeGateProgress :
    null;
  const activeGateBestProgress = isRecord(options.activeGateBestProgress) ?
    options.activeGateBestProgress :
    null;
  const activeGateNoProgress = isRecord(options.activeGateNoProgress) ?
    options.activeGateNoProgress :
    null;
  const activeGateBlockerHistory = Array.isArray(options.activeGateBlockerHistory) ?
    Object.freeze([...options.activeGateBlockerHistory]) :
    null;
  return {
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateBlockerHistory,
  };
}

function buildSelectedMissingPublishedEvidence(state, nodeIds) {
  return Object.freeze({
    state,
    nodeIds: normalizeDistinctStringArray(nodeIds),
  });
}

function resolveSelectedMissingPublishedEvidence(progress = null) {
  if (!isRecord(progress)) {
    return PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE.UNAVAILABLE;
  }
  if (
    Array.isArray(
      progress[
        PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_MISSING_PUBLISHED_NODE_IDS
      ],
    )
  ) {
    return buildSelectedMissingPublishedEvidence(
      PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.EXPLICIT_NODE_LIST,
      progress[
        PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_MISSING_PUBLISHED_NODE_IDS
      ],
    );
  }
  const expectedNodeCount = normalizeNonNegativeInteger(
    progress[PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD.EXPECTED_NODE_COUNT],
  );
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress[
      PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
        .SELECTED_PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
  const selectedPublishedActiveCount = Math.max(
    normalizeNonNegativeInteger(
      progress[
        PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD
          .SELECTED_PUBLISHED_ACTIVE_COUNT
      ],
    ) ?? NUM.ZERO,
    selectedPublishedActiveNodeIds.length,
  );
  return expectedNodeCount !== null &&
    expectedNodeCount > NUM.ZERO &&
    selectedPublishedActiveCount === expectedNodeCount ?
    buildSelectedMissingPublishedEvidence(
      PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.FULL_SELECTED_COVERAGE,
      LOCAL_EMPTY_LIST,
    ) :
    PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE.UNAVAILABLE;
}

function hasSelectedMissingPublishedEvidence(evidence) {
  return evidence?.state !==
    PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE;
}

function resolveObservationClosureField(
  options = {},
  fieldName = LOCAL_STR_EMPTY,
  priorityRecoveryClosureWitness = null,
  activeGateContext = {},
) {
  return typeof options[fieldName] === TYPEOF.STRING ?
    options[fieldName] :
    priorityRecoveryClosureWitness?.[fieldName] ||
      activeGateContext.activeGateProgress?.[fieldName] ||
      activeGateContext.activeGateBestProgress?.[fieldName] ||
      activeGateContext.activeGateNoProgress?.[fieldName] ||
      null;
}

export {
  buildSelectedMissingPublishedEvidence,
  hasSelectedMissingPublishedEvidence,
  resolveObservationActiveGateContext,
  resolveObservationClosureField,
  resolveObservationPriorityPartitionSummary,
  resolveObservationPriorityRecoveryBlockedPartitionIds,
  resolveObservationPriorityRecoveryClosureWitness,
  resolveObservationPriorityRecoveryReasonCodes,
  resolveObservationPublicationConvergenceGate,
  resolvePriorityRecoveryReasonCodes,
  resolveProjectionDiagnostics,
  resolveSelectedMissingPublishedEvidence,
  shouldApplyObservationClosureWitness,
};
