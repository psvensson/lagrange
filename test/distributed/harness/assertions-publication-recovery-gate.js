import {buildPublicationRecoveryGateSnapshot} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {ASSERTIONS_SEGMENT_2} from './assertions-segment-2.js';
import {
  BOOLEAN_FALSE,
  BOOLEAN_TRUE,
  CONSISTENCY_GATE_SUMMARY_PREFIX,
  CONSISTENCY_GATE_SUMMARY_SUFFIX,
  EMPTY_LIST_LENGTH,
  NO_RECOVERY_BLOCKER_COUNT,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_NOT_PENDING,
  PUBLICATION_RECOVERY_GATE_REASON_SEPARATOR,
  PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE_PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE_READY,
  VALUE_UNKNOWN,
  isConsistencyRecord,
  normalizeConsistencyStringList,
} from './assertions-consistency-shared.js';
const {
  VALUE_NONE,
} = ASSERTIONS_SEGMENT_2;

function hasCanonicalPublicationRecoveryGateEvidence(publicationConvergence) {
  if (!isConsistencyRecord(publicationConvergence)) {
    return false;
  }
  return (
    (typeof publicationConvergence.publicationStatus === 'string' &&
      publicationConvergence.publicationStatus.length > 0) ||
    (typeof publicationConvergence.recoveryProtocolState === 'string' &&
      publicationConvergence.recoveryProtocolState.length > 0) ||
    isConsistencyRecord(publicationConvergence.priorityPartitionSummary) ||
    isConsistencyRecord(publicationConvergence.priorityRecoveryClosureWitness) ||
    isConsistencyRecord(publicationConvergence.publicationRecoveryGate) ||
    Array.isArray(publicationConvergence.priorityRecoveryReasonCodes) ||
    Array.isArray(publicationConvergence.pendingAckNodeIds) ||
    Array.isArray(publicationConvergence.requiredAckNodeIds) ||
    Array.isArray(publicationConvergence.acknowledgedNodeIds) ||
    Array.isArray(publicationConvergence.missingPublishedNodeIds) ||
    Array.isArray(publicationConvergence.missingPublishedRecoveryActiveNodeIds)
  );
}

function hasPriorityPartitionSummarySpreadPending(priorityPartitionSummary) {
  if (!isConsistencyRecord(priorityPartitionSummary)) {
    return false;
  }
  return (
    priorityPartitionSummary.satisfied === false ||
    hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary.blockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary.largestSpreadGap) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary.totalSpreadGap) ||
    hasRecoveryBlockerIdList(priorityPartitionSummary.blockedPartitionIds) ||
    hasRecoveryBlockerReasonMap(
      priorityPartitionSummary.blockerPartitionIdsByReason,
    )
  );
}

function resolvePrioritySpreadPendingFromObservation(
  priorityRecoveryObservation,
  priorityPartitionSummary,
) {
  if (
    typeof priorityRecoveryObservation.prioritySpreadPending === 'boolean'
  ) {
    return priorityRecoveryObservation.prioritySpreadPending === true;
  }
  if (isConsistencyRecord(priorityPartitionSummary)) {
    return hasPriorityPartitionSummarySpreadPending(priorityPartitionSummary);
  }
  if (
    priorityRecoveryObservation.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED &&
    !hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation)
  ) {
    return PRIORITY_RECOVERY_CLOSURE_WITNESS_NOT_PENDING.prioritySpreadPending;
  }
  return null;
}

function buildPriorityRecoveryClosureWitnessFromObservation(
  priorityRecoveryObservation,
) {
  if (!isConsistencyRecord(priorityRecoveryObservation)) {
    return null;
  }
  const priorityPartitionSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityPartitionSummary,
  ) ?
    priorityRecoveryObservation.priorityPartitionSummary :
    null;
  const prioritySpreadPending = resolvePrioritySpreadPendingFromObservation(
    priorityRecoveryObservation,
    priorityPartitionSummary,
  );
  const hasPrioritySpreadPending = typeof prioritySpreadPending === 'boolean';
  const closureState =
    typeof priorityRecoveryObservation.priorityRecoveryClosureState ===
      'string' &&
    priorityRecoveryObservation.priorityRecoveryClosureState.length > 0 ?
      priorityRecoveryObservation.priorityRecoveryClosureState :
      null;
  const closureRecordId =
    typeof priorityRecoveryObservation.closureRecordId === 'string' &&
    priorityRecoveryObservation.closureRecordId.length > 0 ?
      priorityRecoveryObservation.closureRecordId :
      null;
  const closureWitnessClass =
    typeof priorityRecoveryObservation.closureWitnessClass === 'string' &&
    priorityRecoveryObservation.closureWitnessClass.length > 0 ?
      priorityRecoveryObservation.closureWitnessClass :
      null;
  if (
    !priorityPartitionSummary &&
    !hasPrioritySpreadPending &&
    closureState === null &&
    closureRecordId === null &&
    closureWitnessClass === null
  ) {
    return null;
  }
  return {
    ...(closureState ? {state: closureState} : {}),
    ...(hasPrioritySpreadPending ?
      {
        prioritySpreadPending,
      } :
      {}),
    ...(priorityPartitionSummary ?
      {refreshedPriorityPartitionSummary: priorityPartitionSummary} :
      {}),
    ...(closureRecordId ? {closureRecordId} : {}),
    ...(closureWitnessClass ? {closureWitnessClass} : {}),
  };
}

function buildCanonicalPublicationRecoveryGateFromObservation(
  controlPlaneDiagnostics,
) {
  const diagnostics = isConsistencyRecord(controlPlaneDiagnostics) ?
    controlPlaneDiagnostics :
    null;
  if (!diagnostics) {
    return null;
  }
  const priorityRecoveryObservation = isConsistencyRecord(
    diagnostics.priorityRecoveryObservation,
  ) ?
    diagnostics.priorityRecoveryObservation :
    null;
  if (!priorityRecoveryObservation) {
    return null;
  }
  const hasObservationEvidence =
    (typeof priorityRecoveryObservation.publicationStatus === 'string' &&
      priorityRecoveryObservation.publicationStatus.length > 0) ||
    (typeof priorityRecoveryObservation.recoveryProtocolState === 'string' &&
      priorityRecoveryObservation.recoveryProtocolState.length > 0) ||
    isConsistencyRecord(priorityRecoveryObservation.priorityPartitionSummary) ||
    Array.isArray(priorityRecoveryObservation.priorityRecoveryReasonCodes) ||
    Array.isArray(priorityRecoveryObservation.pendingAckNodeIds) ||
    typeof priorityRecoveryObservation.prioritySpreadPending === 'boolean' ||
    typeof priorityRecoveryObservation.closureRecordId === 'string' ||
    typeof priorityRecoveryObservation.closureWitnessClass === 'string';
  if (!hasObservationEvidence) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: Number.isInteger(priorityRecoveryObservation.publicationEpoch) ?
      priorityRecoveryObservation.publicationEpoch :
      null,
    publicationStatus:
      typeof priorityRecoveryObservation.publicationStatus === 'string' &&
      priorityRecoveryObservation.publicationStatus.length > 0 ?
        priorityRecoveryObservation.publicationStatus :
        null,
    recoveryProtocolState:
      typeof priorityRecoveryObservation.recoveryProtocolState === 'string' &&
      priorityRecoveryObservation.recoveryProtocolState.length > 0 ?
        priorityRecoveryObservation.recoveryProtocolState :
        null,
    priorityRecoveryReasonCodes: Array.isArray(
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
    ) ?
      priorityRecoveryObservation.priorityRecoveryReasonCodes :
      [],
    priorityPartitionSummary: isConsistencyRecord(
      priorityRecoveryObservation.priorityPartitionSummary,
    ) ?
      priorityRecoveryObservation.priorityPartitionSummary :
      null,
    priorityRecoveryClosureWitness:
      buildPriorityRecoveryClosureWitnessFromObservation(
        priorityRecoveryObservation,
      ),
    pendingAckNodeIds: Array.isArray(priorityRecoveryObservation.pendingAckNodeIds) ?
      priorityRecoveryObservation.pendingAckNodeIds :
      [],
  });
}

function normalizePublicationRecoveryGateEpoch(value) {
  return Number.isInteger(value) ? value : null;
}

function hasPositiveRecoveryBlockerCount(value) {
  return Number.isFinite(value) && value > NO_RECOVERY_BLOCKER_COUNT;
}

function hasRecoveryBlockerIdList(value) {
  return normalizeConsistencyStringList(value).length > EMPTY_LIST_LENGTH;
}

function hasRecoveryBlockerReasonMap(value) {
  if (!isConsistencyRecord(value)) {
    return false;
  }
  return Object.values(value).some((entry) => hasRecoveryBlockerIdList(entry));
}

function hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation) {
  if (!isConsistencyRecord(priorityRecoveryObservation)) {
    return false;
  }
  const priorityPartitionSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityPartitionSummary,
  ) ?
    priorityRecoveryObservation.priorityPartitionSummary :
    null;
  const currentSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityRecoveryCurrentSummary,
  ) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
  const partitionSummarySatisfied =
    priorityPartitionSummary?.satisfied === true &&
    !hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary.blockedPartitionCount,
    ) &&
    !hasPositiveRecoveryBlockerCount(priorityPartitionSummary.largestSpreadGap) &&
    !hasPositiveRecoveryBlockerCount(priorityPartitionSummary.totalSpreadGap);
  if (partitionSummarySatisfied) {
    return false;
  }
  if (
    priorityPartitionSummary?.satisfied === false ||
    hasPositiveRecoveryBlockerCount(
      priorityRecoveryObservation.priorityRecoveryBlockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(
      priorityRecoveryObservation.priorityRecoveryUnresolvedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(currentSummary?.blockedPartitionCount) ||
    hasPositiveRecoveryBlockerCount(currentSummary?.unresolvedClassCount) ||
    hasPositiveRecoveryBlockerCount(
      currentSummary?.unresolvedSemanticStateCount,
    ) ||
    hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary?.blockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary?.largestSpreadGap) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary?.totalSpreadGap) ||
    hasRecoveryBlockerIdList(
      priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
    ) ||
    hasRecoveryBlockerIdList(
      priorityRecoveryObservation.priorityRecoveryUnresolvedPartitionIds,
    ) ||
    hasRecoveryBlockerIdList(currentSummary?.blockedPartitionIds) ||
    hasRecoveryBlockerReasonMap(
      priorityRecoveryObservation.priorityRecoveryBlockerPartitionIdsByReason,
    ) ||
    hasRecoveryBlockerReasonMap(currentSummary?.blockerPartitionIdsByReason)
  ) {
    return true;
  }
  const reasonCodes = normalizeConsistencyStringList(
    priorityRecoveryObservation.priorityRecoveryReasonCodes,
  );
  return (
    priorityRecoveryObservation.prioritySpreadPending === true &&
    reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    )
  );
}

function selectPublicationConvergenceGate(
  canonicalPublicationRecoveryGate,
  explicitPublicationRecoveryGate,
) {
  if (!canonicalPublicationRecoveryGate) {
    return explicitPublicationRecoveryGate;
  }
  if (!explicitPublicationRecoveryGate) {
    return canonicalPublicationRecoveryGate;
  }
  const canonicalEpoch = normalizePublicationRecoveryGateEpoch(
    canonicalPublicationRecoveryGate.publicationEpoch,
  );
  const explicitEpoch = normalizePublicationRecoveryGateEpoch(
    explicitPublicationRecoveryGate.publicationEpoch,
  );
  if (
    canonicalEpoch !== null &&
    explicitEpoch !== null &&
    explicitEpoch > canonicalEpoch
  ) {
    return explicitPublicationRecoveryGate;
  }
  return canonicalPublicationRecoveryGate;
}

function isPublicationGateAtLeastAsRecent(candidate, reference) {
  const candidateEpoch = normalizePublicationRecoveryGateEpoch(
    candidate?.publicationEpoch,
  );
  const referenceEpoch = normalizePublicationRecoveryGateEpoch(
    reference?.publicationEpoch,
  );
  return (
    candidateEpoch === null ||
    referenceEpoch === null ||
    candidateEpoch >= referenceEpoch
  );
}

function selectCanonicalPublicationRecoveryGate({
  canonicalObservationGate,
  publicationGate,
  priorityRecoveryObservation,
}) {
  if (!canonicalObservationGate) {
    return publicationGate;
  }
  if (!publicationGate) {
    return canonicalObservationGate;
  }
  if (
    publicationGate.ready === true &&
    isPublicationGateAtLeastAsRecent(
      publicationGate,
      canonicalObservationGate,
    ) &&
    !hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation)
  ) {
    return publicationGate;
  }
  return canonicalObservationGate;
}

function buildCanonicalPublicationRecoveryGate(controlPlaneDiagnostics) {
  const diagnostics = isConsistencyRecord(controlPlaneDiagnostics) ?
    controlPlaneDiagnostics :
    null;
  if (!diagnostics) {
    return null;
  }
  const priorityRecoveryObservation = isConsistencyRecord(
    diagnostics.priorityRecoveryObservation,
  ) ?
    diagnostics.priorityRecoveryObservation :
    null;
  const canonicalObservationGate =
    buildCanonicalPublicationRecoveryGateFromObservation(diagnostics);
  const publicationConvergence = isConsistencyRecord(
    diagnostics.publicationConvergence,
  ) ?
    diagnostics.publicationConvergence :
    null;
  const explicitPublicationRecoveryGate = isConsistencyRecord(
    diagnostics.publicationConvergenceGate,
  ) ?
    diagnostics.publicationConvergenceGate :
    isConsistencyRecord(publicationConvergence?.publicationRecoveryGate) ?
      publicationConvergence.publicationRecoveryGate :
      null;
  if (!hasCanonicalPublicationRecoveryGateEvidence(publicationConvergence)) {
    return selectCanonicalPublicationRecoveryGate({
      canonicalObservationGate,
      publicationGate: explicitPublicationRecoveryGate,
      priorityRecoveryObservation,
    });
  }
  const canonicalPublicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch:
      publicationConvergence?.publicationEpoch ??
      explicitPublicationRecoveryGate?.publicationEpoch,
    publicationStatus:
      publicationConvergence?.publicationStatus ??
      explicitPublicationRecoveryGate?.publicationStatus,
    publicationObservationState:
      publicationConvergence?.publicationObservationState ??
      explicitPublicationRecoveryGate?.publicationObservationState,
    recoveryProtocolState:
      publicationConvergence?.recoveryProtocolState ??
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState ??
      explicitPublicationRecoveryGate?.recoveryProtocolState,
    priorityRecoveryReasonCodes:
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      explicitPublicationRecoveryGate?.reasonCodes ??
      explicitPublicationRecoveryGate?.reasons,
    priorityPartitionSummary:
      publicationConvergence?.priorityPartitionSummary ??
      explicitPublicationRecoveryGate?.priorityPartitionSummary,
    priorityRecoveryClosureWitness:
      publicationConvergence?.priorityRecoveryClosureWitness ??
      explicitPublicationRecoveryGate?.priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots:
      diagnostics.priorityRecoveryDecisionSnapshots ??
      publicationConvergence?.priorityRecoveryDecisionSnapshots ??
      explicitPublicationRecoveryGate?.priorityRecoveryDecisionSnapshots,
    requiredAckNodeIds:
      publicationConvergence?.requiredAckNodeIds ??
      explicitPublicationRecoveryGate?.requiredAckNodeIds,
    acknowledgedNodeIds:
      publicationConvergence?.acknowledgedNodeIds ??
      explicitPublicationRecoveryGate?.acknowledgedNodeIds,
    pendingAckNodeIds:
      publicationConvergence?.pendingAckNodeIds ??
      explicitPublicationRecoveryGate?.pendingAckNodeIds,
    missingPublishedNodeIds:
      publicationConvergence?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      explicitPublicationRecoveryGate?.missingPublishedNodeIds,
  });
  return selectCanonicalPublicationRecoveryGate({
    canonicalObservationGate,
    publicationGate: selectPublicationConvergenceGate(
      canonicalPublicationRecoveryGate,
      explicitPublicationRecoveryGate,
    ),
    priorityRecoveryObservation,
  });
}

function extractPublicationRecoveryGateContract(controlPlaneDiagnostics) {
  const gate = buildCanonicalPublicationRecoveryGate(controlPlaneDiagnostics);
  if (!gate) {
    return {
      contractPresent: false,
      ready: null,
      state: null,
      publicationEpoch: null,
      publicationStatus: null,
      reasonCodes: [],
    };
  }
  const normalizedReasonCodes = normalizeConsistencyStringList(
    Array.isArray(gate?.reasonCodes) ? gate.reasonCodes : gate?.reasons,
  );
  const state =
    typeof gate?.state === 'string' && gate.state.length > 0 ?
      gate.state :
      typeof gate?.recoveryProtocolState === 'string' &&
            gate.recoveryProtocolState.length > 0 ?
        gate.recoveryProtocolState :
        gate?.ready === true ?
          PUBLICATION_RECOVERY_GATE_STATE_READY :
          gate?.publicationPending === true ?
            PUBLICATION_RECOVERY_GATE_STATE_PUBLICATION_PENDING :
            gate?.prioritySpreadEvidenceUnavailable === true ?
              PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE :
              gate?.prioritySpreadPending === true ?
                PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING :
                VALUE_UNKNOWN;
  return {
    contractPresent: true,
    ready: gate?.ready === true,
    state,
    publicationEpoch: Number.isInteger(gate?.publicationEpoch) ?
      gate.publicationEpoch :
      null,
    publicationStatus:
      typeof gate?.publicationStatus === 'string' &&
      gate.publicationStatus.length > 0 ?
        gate.publicationStatus :
        typeof gate?.publicationStatusNormalized === 'string' &&
            gate.publicationStatusNormalized.length > 0 ?
          gate.publicationStatusNormalized :
          null,
    reasonCodes: normalizedReasonCodes,
  };
}

function formatPublicationRecoveryGateContract(contract) {
  const normalizedContract =
    contract && typeof contract === 'object' ?
      contract :
      extractPublicationRecoveryGateContract(null);
  const reasonCodes =
    normalizedContract.reasonCodes.length > 0 ?
      normalizedContract.reasonCodes.join(
        PUBLICATION_RECOVERY_GATE_REASON_SEPARATOR,
      ) :
      VALUE_NONE;
  return (
    CONSISTENCY_GATE_SUMMARY_PREFIX +
    'ready=' +
    (normalizedContract.ready === true ? BOOLEAN_TRUE : BOOLEAN_FALSE) +
    ',state=' +
    String(normalizedContract.state || VALUE_UNKNOWN) +
    ',epoch=' +
    String(
      Number.isInteger(normalizedContract.publicationEpoch) ?
        normalizedContract.publicationEpoch :
        VALUE_UNKNOWN,
    ) +
    ',status=' +
    String(normalizedContract.publicationStatus || VALUE_UNKNOWN) +
    ',reasons=' +
    reasonCodes +
    CONSISTENCY_GATE_SUMMARY_SUFFIX
  );
}

export {
  buildCanonicalPublicationRecoveryGate,
  buildCanonicalPublicationRecoveryGateFromObservation,
  extractPublicationRecoveryGateContract,
  formatPublicationRecoveryGateContract,
  hasConcretePriorityRecoveryBlocker,
};
