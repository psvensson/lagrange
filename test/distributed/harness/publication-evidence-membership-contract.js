import {
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from '../../../src/control-plane/priority-recovery-snapshot.js';
import {
  PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_RULES,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE,
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
  PUBLICATION_EVIDENCE_ZERO,
  hasPublicationMembershipGateReason,
  hasStaleGenericPublicationEpochClosure,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  resolvePublicationGateReasons,
} from './publication-evidence-shared.js';

function resolveSelectedMissingPublishedNodeIds(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  const selectedPublishedMembershipDeficitNodeIds =
    resolveSelectedPublishedMembershipDeficitNodeIds(progress);
  if (Array.isArray(progress.selectedMissingPublishedNodeIds)) {
    const selectedMissingPublishedNodeIds = normalizeDistinctStringArray(
      progress.selectedMissingPublishedNodeIds,
    );
    return selectedMissingPublishedNodeIds.length === PUBLICATION_EVIDENCE_ZERO &&
      selectedPublishedMembershipDeficitNodeIds !== null ?
      selectedPublishedMembershipDeficitNodeIds :
      selectedMissingPublishedNodeIds;
  }
  if (selectedPublishedMembershipDeficitNodeIds !== null) {
    return selectedPublishedMembershipDeficitNodeIds;
  }
  const expectedNodeCount = normalizePositiveInteger(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedPublishedActiveCount =
    normalizeNonNegativeInteger(progress.selectedPublishedActiveCount) ??
    selectedPublishedActiveNodeIds.length;
  return expectedNodeCount !== null &&
    selectedPublishedActiveCount === expectedNodeCount ?
    PUBLICATION_EVIDENCE_EMPTY_LIST :
    null;
}

function resolveSelectedPublishedMembershipDeficitNodeIds(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  const expectedNodeCount = normalizePositiveInteger(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedPublishedActiveCount =
    normalizeNonNegativeInteger(progress.selectedPublishedActiveCount) ??
    selectedPublishedActiveNodeIds.length;
  if (
    expectedNodeCount === null ||
    selectedPublishedActiveNodeIds.length === PUBLICATION_EVIDENCE_ZERO ||
    selectedPublishedActiveCount >= expectedNodeCount
  ) {
    return null;
  }
  const perNodePublicationDisagreementSet = isRecord(
    progress.perNodePublicationDisagreementSet,
  ) ?
    progress.perNodePublicationDisagreementSet :
    null;
  if (perNodePublicationDisagreementSet === null) {
    return null;
  }
  const expectedNodeIds = normalizeDistinctStringArray(
    Object.keys(perNodePublicationDisagreementSet),
  );
  if (expectedNodeIds.length <= selectedPublishedActiveNodeIds.length) {
    return null;
  }
  const selectedPublishedActiveNodeIdSet = new Set(selectedPublishedActiveNodeIds);
  const missingPublishedNodeIds = expectedNodeIds.filter((nodeId) =>
    selectedPublishedActiveNodeIdSet.has(nodeId) !== true,
  );
  return missingPublishedNodeIds.length > PUBLICATION_EVIDENCE_ZERO ?
    missingPublishedNodeIds :
    null;
}

function resolveSelectedPublicationMembershipNodeIds(progress = null) {
  if (!isRecord(progress)) {
    return null;
  }
  const expectedNodeCount = normalizePositiveInteger(progress.expectedNodeCount);
  const selectedPublishedActiveNodeIds = normalizeDistinctStringArray(
    progress.selectedPublishedActiveNodeIds,
  );
  const selectedMissingPublishedNodeIds =
    resolveSelectedMissingPublishedNodeIds(progress);
  const selectedPublicationMembershipNodeIds = normalizeDistinctStringArray([
    ...selectedPublishedActiveNodeIds,
    ...(selectedMissingPublishedNodeIds ?? PUBLICATION_EVIDENCE_EMPTY_LIST),
  ]);
  return expectedNodeCount !== null &&
    selectedPublishedActiveNodeIds.length > PUBLICATION_EVIDENCE_ZERO &&
    selectedPublicationMembershipNodeIds.length === expectedNodeCount ?
    selectedPublicationMembershipNodeIds :
    null;
}

function resolveAuthoritativePublicationMembershipNodeIds({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  rawPublicationConvergenceGate = null,
  requiredAckNodeIds = PUBLICATION_EVIDENCE_EMPTY_LIST,
  acknowledgedNodeIds = PUBLICATION_EVIDENCE_EMPTY_LIST,
  pendingAckNodeIds = PUBLICATION_EVIDENCE_EMPTY_LIST,
} = {}) {
  return normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(requiredAckNodeIds),
    ...normalizeDistinctStringArray(acknowledgedNodeIds),
    ...normalizeDistinctStringArray(pendingAckNodeIds),
    ...normalizeDistinctStringArray(rawPublicationConvergenceGate?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergenceGate?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.publishedActiveNodeIds),
  ]);
}

function resolveRelevantPublicationMembershipNodeIds(
  nodeIds = null,
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_EVIDENCE_EMPTY_LIST,
) {
  if (!Array.isArray(nodeIds)) {
    return null;
  }
  const authoritativeNodeIdSet = new Set(
    normalizeDistinctStringArray(authoritativePublicationMembershipNodeIds),
  );
  const normalizedNodeIds = normalizeDistinctStringArray(nodeIds);
  return authoritativeNodeIdSet.size > PUBLICATION_EVIDENCE_ZERO ?
    normalizeDistinctStringArray(
      normalizedNodeIds.filter((nodeId) => authoritativeNodeIdSet.has(nodeId)),
    ) :
    normalizedNodeIds;
}

function resolveEffectivePublicationMembershipNodeIds({
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  selectedPublicationMembershipNodeIds = null,
  selectedPublicationMembershipOpen = false,
} = {}) {
  return selectedPublicationMembershipOpen === true &&
    Array.isArray(selectedPublicationMembershipNodeIds) &&
    selectedPublicationMembershipNodeIds.length > PUBLICATION_EVIDENCE_ZERO ?
    normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(
        authoritativePublicationMembershipNodeIds,
      ),
      ...selectedPublicationMembershipNodeIds,
    ]) :
    normalizeDistinctStringArray(authoritativePublicationMembershipNodeIds);
}

function hasSteadyPublishedSelectedPublicationMembershipOpen({
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  activeGateProgress = null,
  pendingAckCount = PUBLICATION_EVIDENCE_ZERO,
} = {}) {
  if (pendingAckCount > PUBLICATION_EVIDENCE_ZERO) {
    return false;
  }
  const publicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(activeGateProgress?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.publicationStatus) ||
    normalizeOptionalString(publicationConvergence?.status);
  const recoveryProtocolState =
    normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
    normalizeOptionalString(activeGateProgress?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergence?.recoveryProtocolState) ||
    normalizeOptionalString(
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState,
    );
  const prioritySpreadPending =
    priorityRecoveryObservation?.prioritySpreadPending === true ||
    publicationConvergenceGate?.prioritySpreadPending === true ||
    publicationConvergence?.prioritySpreadPending === true ||
    activeGateProgress?.prioritySpreadSatisfied === false;
  const selectedPublicationMembershipNodeIds =
    resolveSelectedPublicationMembershipNodeIds(activeGateProgress);
  const selectedMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...(resolveSelectedMissingPublishedNodeIds(activeGateProgress) ??
      PUBLICATION_EVIDENCE_EMPTY_LIST),
    ...(Array.isArray(priorityRecoveryObservation?.missingPublishedNodeIds) ?
      priorityRecoveryObservation.missingPublishedNodeIds :
      PUBLICATION_EVIDENCE_EMPTY_LIST),
  ]);
  const unresolvedClassCount =
    normalizeNonNegativeInteger(
      activeGateProgress?.priorityRecoveryProgressClasses?.unresolvedClassCount ??
      activeGateProgress?.priorityRecoveryUnresolvedClassCount ??
      priorityRecoveryObservation?.priorityRecoveryProgressClassCount,
    ) ??
    PUBLICATION_EVIDENCE_ZERO;
  const unresolvedSemanticStateCount =
    normalizeNonNegativeInteger(
      activeGateProgress?.priorityRecoveryProgressClasses
        ?.unresolvedSemanticStateCount ??
      activeGateProgress?.priorityRecoveryUnresolvedSemanticStateCount ??
      priorityRecoveryObservation?.priorityRecoverySemanticStateCount,
    ) ??
    PUBLICATION_EVIDENCE_ZERO;
  const blockedPartitionCount =
    normalizeNonNegativeInteger(
      activeGateProgress?.priorityRecoveryProgressClasses?.blockedPartitionCount ??
      activeGateProgress?.priorityRecoveryBlockedPartitionCount ??
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
    ) ??
    PUBLICATION_EVIDENCE_ZERO;
  return Array.isArray(selectedPublicationMembershipNodeIds) &&
    selectedPublicationMembershipNodeIds.length > PUBLICATION_EVIDENCE_ZERO &&
    selectedMissingPublishedNodeIds.length > PUBLICATION_EVIDENCE_ZERO &&
    publicationStatus === PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED &&
    recoveryProtocolState ===
      PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED &&
    prioritySpreadPending !== true &&
    activeGateProgress?.prioritySpreadSatisfied === true &&
    unresolvedClassCount === PUBLICATION_EVIDENCE_ZERO &&
    unresolvedSemanticStateCount === PUBLICATION_EVIDENCE_ZERO &&
    blockedPartitionCount === PUBLICATION_EVIDENCE_ZERO;
}

function isCurrentPublicationMembershipGateClosed(
  publicationConvergenceGate = null,
  fallbackPublicationStatus = null,
  fallbackPendingAckCount = PUBLICATION_EVIDENCE_ZERO,
) {
  if (!isRecord(publicationConvergenceGate)) {
    return false;
  }
  const publicationStatus =
    normalizeOptionalString(publicationConvergenceGate.publicationStatus) ||
    fallbackPublicationStatus;
  const pendingAckCount =
    normalizeNonNegativeInteger(publicationConvergenceGate.pendingAckCount) ??
    fallbackPendingAckCount;
  const missingPublishedCount =
    normalizeNonNegativeInteger(publicationConvergenceGate.missingPublishedCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const gateReasons =
    publicationConvergenceGate.reasons ??
    publicationConvergenceGate.reasonCodes ??
    PUBLICATION_EVIDENCE_EMPTY_LIST;
  return publicationConvergenceGate.ready === true &&
    publicationConvergenceGate.publicationPending !== true &&
    publicationStatus === PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    missingPublishedCount === PUBLICATION_EVIDENCE_ZERO &&
    hasPublicationMembershipGateReason(gateReasons) !== true;
}

function buildActiveGatePublicationMembershipEvidence({
  progress = null,
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
  rawPublicationConvergenceGate = null,
  pendingAckCount = PUBLICATION_EVIDENCE_ZERO,
} = {}) {
  const publicationStatus =
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(progress?.publicationStatus);
  const closureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(progress?.closureRecordId);
  const closureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(progress?.closureWitnessClass);
  const closureWitnessSatisfiesPublication =
    closureRecordId ===
      PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD &&
    closureWitnessClass ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
        .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING;
  const stalePublicationClosure =
    normalizeOptionalString(
      priorityRecoveryObservation?.priorityRecoveryClosureState,
    ) ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE
        .SATISFIED_STALE_PUBLICATION ||
    closureWitnessSatisfiesPublication;
  const currentPublicationGateReasons = resolvePublicationGateReasons({
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });
  const currentPublicationGateMissingPublishedCount =
    normalizeNonNegativeInteger(publicationConvergenceGate?.missingPublishedCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  const rawPublicationGateReasons = resolvePublicationGateReasons({
    publicationConvergenceGate: rawPublicationConvergenceGate,
  });
  const rawPublicationGateStatus =
    normalizeOptionalString(rawPublicationConvergenceGate?.publicationStatus) ||
    publicationStatus;
  const rawPublicationGatePendingAckCount =
    normalizeNonNegativeInteger(rawPublicationConvergenceGate?.pendingAckCount) ??
    pendingAckCount;
  const staleGenericPublicationEpochGateClosed =
    hasStaleGenericPublicationEpochClosure({
      publicationStatus: rawPublicationGateStatus,
      pendingAckCount: rawPublicationGatePendingAckCount,
      gateReasons: rawPublicationGateReasons,
      priorityRecoveryObservation,
      publicationConvergenceGate: rawPublicationConvergenceGate,
    });
  const staleGenericCurrentPublicationEpochGateClosed =
    hasStaleGenericPublicationEpochClosure({
      publicationStatus,
      pendingAckCount,
      gateReasons: currentPublicationGateReasons,
      priorityRecoveryObservation,
      publicationConvergenceGate,
    });
  return Object.freeze({
    stalePublicationClosure,
    publicationStatusPublished:
      publicationStatus === PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
    pendingAckClosed: pendingAckCount === PUBLICATION_EVIDENCE_ZERO,
    currentPublicationGateClosed:
      isCurrentPublicationMembershipGateClosed(
        rawPublicationConvergenceGate,
        publicationStatus,
        pendingAckCount,
      ) ||
      staleGenericPublicationEpochGateClosed ||
      staleGenericCurrentPublicationEpochGateClosed ||
      (
        currentPublicationGateMissingPublishedCount ===
          PUBLICATION_EVIDENCE_ZERO &&
        hasPublicationMembershipGateReason(currentPublicationGateReasons) !==
          true &&
        isCurrentPublicationMembershipGateClosed(
          publicationConvergenceGate,
          publicationStatus,
          pendingAckCount,
        )
      ),
  });
}

function resolveActiveGatePublicationMembershipState(evidence) {
  return PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_RULES
    .find((rule) => rule.matches(evidence))
    .state;
}

function isClosedActiveGatePublicationMembershipState(state) {
  return state ===
    PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE
      .CLOSED_STALE_SELECTED_SNAPSHOT;
}


export {
  resolveSelectedMissingPublishedNodeIds,
  resolveSelectedPublishedMembershipDeficitNodeIds,
  resolveSelectedPublicationMembershipNodeIds,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,
  resolveEffectivePublicationMembershipNodeIds,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  buildActiveGatePublicationMembershipEvidence,
  resolveActiveGatePublicationMembershipState,
  isClosedActiveGatePublicationMembershipState,
};
