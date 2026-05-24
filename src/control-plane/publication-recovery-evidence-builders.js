import {NUM} from '../constants/index.js';
import {buildPriorityRecoveryObservationSnapshot} from
  './priority-recovery-observation-snapshot.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from
  './publication-recovery-gate.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';

import {
  isRecord,
  isPublicationRecoveryAckNodeListProvided,
  resolvePublicationRecoveryAckNodeListInput,
  resolvePublicationRecoveryGateRequiredAckNodeListInput,
  resolvePublicationRecoveryGateAcknowledgedNodeListInput,
  resolvePublicationRecoveryConvergenceRequiredAckNodeListInput,
  resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput,
  hasAuthoritativeEmptyPendingAckGate,
  hasAuthoritativeEmptyMissingPublishedGate,
  hasPublicationRecoveryPressureDeferredEvidence,
  normalizeDistinctStringArray,
  normalizePublicationEpoch,
  normalizeNonNegativeInteger,
  normalizeMaximumNonNegativeInteger,
  normalizePublicationRecoveryAckEvidence,
  resolvePublicationRecoveryPendingAckNodeIds,
  resolveActiveGateSelectedMissingPublishedEvidence,
  resolveActiveGateSelectedPublicationMembershipNodeIds,
  hasActiveGateSelectedPublicationMembershipOpenEvidence,
  hasActiveGateSelectedPublicationMembershipCohortProof,
  hasSelectedPublicationMembershipClosureEvidence,
  resolveEffectivePublicationMembershipNodeIds,
  hasSteadyPublishedSelectedPublicationMembershipOpen,
  hasActiveGateSelectedMissingPublishedEvidence,
  normalizeOptionalString,
  normalizeBoolean,
  normalizeClosedUnknownNoDebtPriorityRecoveryObservation,
  normalizePriorityRecoveryObservationFromPublicationGate,
  hasCountOnlyUnknownPublicationDeficit,
  resolveOwnerReconcileNarrowedMissingPublishedNodeIds,
  hasOwnerReconcilePublicationHandoff,
  resolvePublicationMissingPublishedNodeIds,
  resolvePublicationMissingPublishedCount,
  activeGateOpenDebtOutrunsPublicationOwnerStream,
  ownerReconcileNarrowingRefreshesPublicationOwnerStream,
  alignPublicationRecoveryGateOwnerStreamWithOpenDebt,
  normalizeActiveGateProgressRecords,
  resolvePublicationRecoveryActiveGateHandoff,
  enrichPublicationRecoveryActiveGateHandoff,
  resolvePublicationRecoveryEmittedActiveGateHandoff,
  resolveActiveGateProgressString,
  resolvePublicationRecoveryPublishedActiveNodeIds,
  normalizeActiveGateProgressNodeIds,
  normalizeActiveGateProgressCount,
  normalizePriorityRecoveryDecisionPendingAckNodeIds,
  resolveRawPublicationConvergenceGate,
  resolvePriorityRecoveryClosureWitness,
  resolveAuthoritativePublicationMembershipNodeIds,
  resolveRelevantPublicationMembershipNodeIds,

  // Constants
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PUBLICATION_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
} from './publication-recovery-evidence-normalizers.js';
import {
  buildCanonicalPublicationConvergence,
} from './publication-recovery-convergence-builder.js';
import {
  buildCanonicalPublicationConvergenceGate,
} from './publication-recovery-convergence-gate-builder.js';

function buildCanonicalPriorityRecoveryObservation(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const existingPriorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const priorityRecoveryInvariants = isRecord(
    options.priorityRecoveryInvariants,
  ) ?
    options.priorityRecoveryInvariants :
    null;
  const logsTable = isRecord(options.logsTable) ? options.logsTable : null;
  const hasExplicitPublicationConvergenceGate =
    options.hasExplicitPublicationConvergenceGate === true;
  const hasActiveGateEvidenceSource =
    isRecord(options.activeGate) ||
    isRecord(options.activeGateProgress) ||
    isRecord(options.activeGateBestProgress) ||
    isRecord(options.activeGateNoProgress) ||
    Array.isArray(options.activeGateBlockerHistory);
  const hasCanonicalObservationSource =
    Boolean(publicationConvergence) ||
    hasExplicitPublicationConvergenceGate ||
    Boolean(priorityRecoveryDecisionSnapshots) ||
    Boolean(priorityRecoveryInvariants) ||
    Boolean(logsTable) ||
    hasActiveGateEvidenceSource;

  if (
    !publicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryInvariants &&
    !logsTable &&
    !existingPriorityRecoveryObservation
  ) {
    return null;
  }

  if (!hasCanonicalObservationSource && existingPriorityRecoveryObservation) {
    return existingPriorityRecoveryObservation;
  }

  const baseDerivedPriorityRecoveryObservation =
    buildPriorityRecoveryObservationSnapshot({
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate:
        options.activeGate ||
        existingPriorityRecoveryObservation?.activeGate ||
        null,
      activeGateProgress:
        options.activeGateProgress ||
        existingPriorityRecoveryObservation?.activeGateProgress ||
        null,
      activeGateBestProgress:
        options.activeGateBestProgress ||
        existingPriorityRecoveryObservation?.activeGateBestProgress ||
        null,
      activeGateNoProgress:
        options.activeGateNoProgress ||
        existingPriorityRecoveryObservation?.activeGateNoProgress ||
        null,
      activeGateBlockerHistory:
        options.activeGateBlockerHistory ||
        existingPriorityRecoveryObservation?.activeGateBlockerHistory ||
        null,
      logsTable,
      closureRecordId: null,
      closureWitnessClass: null,
    });
  const existingClosureRecordId = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureRecordId,
  );
  const existingClosureWitnessClass = normalizeOptionalString(
    existingPriorityRecoveryObservation?.closureWitnessClass,
  );
  const shouldRetainClosureDiagnostics =
    (existingClosureRecordId || existingClosureWitnessClass) &&
    shouldRetainPriorityRecoveryClosureDiagnostics(
      baseDerivedPriorityRecoveryObservation,
    );
  const derivedPriorityRecoveryObservation =
    shouldRetainClosureDiagnostics ?
      {
        ...baseDerivedPriorityRecoveryObservation,
        ...(existingClosureRecordId ?
          {closureRecordId: existingClosureRecordId} :
          {}),
        ...(existingClosureWitnessClass ?
          {closureWitnessClass: existingClosureWitnessClass} :
          {}),
      } :
      baseDerivedPriorityRecoveryObservation;
  const normalizedDerivedPriorityRecoveryObservation =
    normalizePriorityRecoveryObservationFromPublicationGate(
      normalizeClosedUnknownNoDebtPriorityRecoveryObservation(
        derivedPriorityRecoveryObservation,
        publicationConvergenceGate,
      ),
      publicationConvergenceGate,
    );

  if (
    !existingPriorityRecoveryObservation ||
    !normalizedDerivedPriorityRecoveryObservation
  ) {
    return normalizedDerivedPriorityRecoveryObservation ||
      existingPriorityRecoveryObservation;
  }

  return samePriorityRecoveryObservationContract(
    existingPriorityRecoveryObservation,
    normalizedDerivedPriorityRecoveryObservation,
  ) ?
    existingPriorityRecoveryObservation :
    normalizedDerivedPriorityRecoveryObservation;
}

function buildObservationPublicationGate(priorityRecoveryObservation = null) {
  if (!isRecord(priorityRecoveryObservation)) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: priorityRecoveryObservation.publicationEpoch ?? null,
    publicationStatus: priorityRecoveryObservation.publicationStatus ?? null,
    recoveryProtocolState:
      priorityRecoveryObservation.recoveryProtocolState ?? null,
    priorityRecoveryReasonCodes:
      priorityRecoveryObservation.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      priorityRecoveryObservation.priorityPartitionSummary ?? null,
    pendingAckNodeIds:
      priorityRecoveryObservation.pendingAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckCount: priorityRecoveryObservation.pendingAckCount,
    missingPublishedNodeIds:
      priorityRecoveryObservation.missingPublishedNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: priorityRecoveryObservation.missingPublishedCount,
    pressureState: priorityRecoveryObservation.pressureState,
    pressureDeferred: priorityRecoveryObservation.pressureDeferred,
    pressureCoalesced: priorityRecoveryObservation.pressureCoalesced,
    pressureRetryAfterMs: priorityRecoveryObservation.pressureRetryAfterMs,
    pressureReasonCodes: priorityRecoveryObservation.pressureReasonCodes,
  });
}

function samePublicationGateState(leftObservationGate = null, rightObservationGate = null) {
  if (!leftObservationGate && !rightObservationGate) {
    return true;
  }
  if (!leftObservationGate || !rightObservationGate) {
    return false;
  }
  const leftPendingAckNodeIds = normalizeDistinctStringArray(
    leftObservationGate.pendingAckNodeIds,
  );
  const rightPendingAckNodeIds = normalizeDistinctStringArray(
    rightObservationGate.pendingAckNodeIds,
  );
  const leftMissingPublishedNodeIds = normalizeDistinctStringArray(
    leftObservationGate.missingPublishedNodeIds,
  );
  const rightMissingPublishedNodeIds = normalizeDistinctStringArray(
    rightObservationGate.missingPublishedNodeIds,
  );
  return normalizeOptionalString(leftObservationGate.state) ===
      normalizeOptionalString(rightObservationGate.state) &&
    normalizeBoolean(leftObservationGate.publicationPending) ===
      normalizeBoolean(rightObservationGate.publicationPending) &&
    normalizeBoolean(leftObservationGate.prioritySpreadPending) ===
      normalizeBoolean(rightObservationGate.prioritySpreadPending) &&
    normalizeNonNegativeInteger(leftObservationGate.pendingAckCount) ===
      normalizeNonNegativeInteger(rightObservationGate.pendingAckCount) &&
    normalizeNonNegativeInteger(leftObservationGate.missingPublishedCount) ===
      normalizeNonNegativeInteger(rightObservationGate.missingPublishedCount) &&
    leftPendingAckNodeIds.length === rightPendingAckNodeIds.length &&
    leftPendingAckNodeIds.every((nodeId, index) =>
      nodeId === rightPendingAckNodeIds[index],
    ) &&
    leftMissingPublishedNodeIds.length === rightMissingPublishedNodeIds.length &&
    leftMissingPublishedNodeIds.every((nodeId, index) =>
      nodeId === rightMissingPublishedNodeIds[index],
    );
}

function sameStringArray(leftValues = [], rightValues = []) {
  const left = normalizeDistinctStringArray(leftValues);
  const right = normalizeDistinctStringArray(rightValues);
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation = null) {
  return isRecord(priorityRecoveryObservation?.priorityRecoveryCurrentSummary) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
}

function isEmptyPriorityRecoveryCurrentSummary(currentSummary = null) {
  if (!currentSummary) {
    return true;
  }
  return normalizeDistinctStringArray(currentSummary.unresolvedClassIds)
    .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.unresolvedSemanticStateIds)
      .length === NUM.ZERO &&
    normalizeDistinctStringArray(currentSummary.blockedPartitionIds)
      .length === NUM.ZERO;
}

function shouldRetainPriorityRecoveryClosureDiagnostics(
  priorityRecoveryObservation = null,
) {
  const priorityRecoveryCurrentSummary =
    resolvePriorityRecoveryCurrentSummary(priorityRecoveryObservation);
  return priorityRecoveryObservation?.prioritySpreadPending === true ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryReasonCodes,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeDistinctStringArray(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionIds,
    ).length > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryBlockedPartitionCount,
    ) > NUM.ZERO ||
    normalizeNonNegativeInteger(
      priorityRecoveryObservation?.priorityRecoveryUnresolvedPartitionCount,
    ) > NUM.ZERO ||
    !isEmptyPriorityRecoveryCurrentSummary(priorityRecoveryCurrentSummary);
}

function samePriorityRecoveryCurrentSummary(
  leftObservation = null,
  rightObservation = null,
) {
  const leftCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    leftObservation,
  );
  const rightCurrentSummary = resolvePriorityRecoveryCurrentSummary(
    rightObservation,
  );
  if (!leftCurrentSummary && !rightCurrentSummary) {
    return true;
  }
  if (!leftCurrentSummary || !rightCurrentSummary) {
    return isEmptyPriorityRecoveryCurrentSummary(leftCurrentSummary) &&
      isEmptyPriorityRecoveryCurrentSummary(rightCurrentSummary);
  }
  return normalizeOptionalString(leftCurrentSummary.scope) ===
      normalizeOptionalString(rightCurrentSummary.scope) &&
    sameStringArray(
      leftCurrentSummary.unresolvedClassIds,
      rightCurrentSummary.unresolvedClassIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.unresolvedSemanticStateIds,
      rightCurrentSummary.unresolvedSemanticStateIds,
    ) &&
    sameStringArray(
      leftCurrentSummary.blockedPartitionIds,
      rightCurrentSummary.blockedPartitionIds,
    );
}

function samePriorityRecoveryObservationContract(
  leftObservation = null,
  rightObservation = null,
) {
  return samePublicationGateState(
    buildObservationPublicationGate(leftObservation),
    buildObservationPublicationGate(rightObservation),
  ) &&
    normalizeOptionalString(leftObservation?.closureRecordId) ===
      normalizeOptionalString(rightObservation?.closureRecordId) &&
    normalizeOptionalString(leftObservation?.closureWitnessClass) ===
      normalizeOptionalString(rightObservation?.closureWitnessClass) &&
    normalizeOptionalString(leftObservation?.priorityRecoveryClosureState) ===
      normalizeOptionalString(rightObservation?.priorityRecoveryClosureState) &&
    sameStringArray(
      leftObservation?.priorityRecoveryReasonCodes,
      rightObservation?.priorityRecoveryReasonCodes,
    ) &&
    samePriorityRecoveryCurrentSummary(leftObservation, rightObservation) &&
    sameStringArray(
      leftObservation?.priorityRecoveryProgressClassIds,
      rightObservation?.priorityRecoveryProgressClassIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoverySemanticStateIds,
      rightObservation?.priorityRecoverySemanticStateIds,
    ) &&
    sameStringArray(
      leftObservation?.priorityRecoveryBlockedPartitionIds,
      rightObservation?.priorityRecoveryBlockedPartitionIds,
    );
}

function resolveCanonicalPublicationPrioritySpreadPending({
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
} = {}) {
  return isRecord(publicationConvergenceGate) ?
    publicationConvergenceGate.prioritySpreadPending === true :
    priorityRecoveryObservation?.prioritySpreadPending === true;
}

export {
  buildCanonicalPublicationConvergenceGate,
  buildCanonicalPriorityRecoveryObservation,
  buildCanonicalPublicationConvergence,
};
