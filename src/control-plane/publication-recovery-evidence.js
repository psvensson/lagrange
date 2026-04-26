import {NUM} from '../constants/index.js';
import {buildPriorityRecoveryObservationSnapshot} from
  './priority-recovery-observation-snapshot.js';
import {buildPublicationRecoveryGateSnapshot} from
  './publication-recovery-gate.js';

const PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_RECOVERY_EVIDENCE_TYPEOF = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});

function isRecord(value) {
  return Boolean(value) &&
    typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > NUM.ZERO),
    )],
  );
}

function normalizePublicationEpoch(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_RECOVERY_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeBoolean(value) {
  return value === true;
}

function resolveRawPublicationConvergenceGate(
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  if (isRecord(publicationConvergenceGate)) {
    return publicationConvergenceGate;
  }
  if (isRecord(publicationConvergence?.publicationRecoveryGate)) {
    return publicationConvergence.publicationRecoveryGate;
  }
  return null;
}

function resolvePriorityRecoveryClosureWitness(
  publicationConvergence = null,
  rawPublicationConvergenceGate = null,
  priorityRecoveryDecisionSnapshots = null,
) {
  if (isRecord(priorityRecoveryDecisionSnapshots?.closureWitness)) {
    return priorityRecoveryDecisionSnapshots.closureWitness;
  }
  if (isRecord(rawPublicationConvergenceGate?.priorityRecoveryClosureWitness)) {
    return rawPublicationConvergenceGate.priorityRecoveryClosureWitness;
  }
  if (isRecord(publicationConvergence?.priorityRecoveryClosureWitness)) {
    return publicationConvergence.priorityRecoveryClosureWitness;
  }
  return null;
}

function buildCanonicalPublicationConvergenceGate(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const priorityRecoveryObservation = isRecord(
    options.priorityRecoveryObservation,
  ) ?
    options.priorityRecoveryObservation :
    null;
  const priorityRecoveryDecisionSnapshots = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  ) ?
    options.priorityRecoveryDecisionSnapshots :
    null;
  const rawPublicationConvergenceGate = resolveRawPublicationConvergenceGate(
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const priorityRecoveryClosureWitness = isRecord(
    options.priorityRecoveryClosureWitness,
  ) ?
    options.priorityRecoveryClosureWitness :
    resolvePriorityRecoveryClosureWitness(
      publicationConvergence,
      rawPublicationConvergenceGate,
      priorityRecoveryDecisionSnapshots,
    );

  if (
    !publicationConvergence &&
    !rawPublicationConvergenceGate &&
    !priorityRecoveryDecisionSnapshots &&
    !priorityRecoveryObservation
  ) {
    return null;
  }

  const canonicalPublicationConvergenceGate = buildPublicationRecoveryGateSnapshot({
    ...(rawPublicationConvergenceGate || {}),
    publicationEpoch:
      rawPublicationConvergenceGate?.publicationEpoch ??
      publicationConvergence?.publicationEpoch ??
      priorityRecoveryObservation?.publicationEpoch ??
      null,
    publicationStatus:
      rawPublicationConvergenceGate?.publicationStatus ??
      publicationConvergence?.publicationStatus ??
      publicationConvergence?.status ??
      priorityRecoveryObservation?.publicationStatus ??
      null,
    publicationObservationState:
      rawPublicationConvergenceGate?.publicationObservationState ??
      publicationConvergence?.publicationObservationState ??
      null,
    recoveryProtocolState:
      rawPublicationConvergenceGate?.recoveryProtocolState ??
      publicationConvergence?.recoveryProtocolState ??
      publicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState ??
      priorityRecoveryObservation?.recoveryProtocolState ??
      null,
    priorityRecoveryReasonCodes:
      rawPublicationConvergenceGate?.reasonCodes ??
      rawPublicationConvergenceGate?.reasons ??
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    priorityPartitionSummary:
      rawPublicationConvergenceGate?.priorityPartitionSummary ??
      publicationConvergence?.priorityPartitionSummary ??
      priorityRecoveryObservation?.priorityPartitionSummary ??
      null,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness,
    requiredAckNodeIds:
      rawPublicationConvergenceGate?.requiredAckNodeIds ??
      publicationConvergence?.requiredAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    acknowledgedNodeIds:
      rawPublicationConvergenceGate?.acknowledgedNodeIds ??
      publicationConvergence?.acknowledgedNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckNodeIds:
      rawPublicationConvergenceGate?.pendingAckNodeIds ??
      publicationConvergence?.pendingAckNodeIds ??
      priorityRecoveryObservation?.pendingAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedNodeIds:
      rawPublicationConvergenceGate?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  });

  return Array.isArray(rawPublicationConvergenceGate?.reasons) ?
    {
      ...canonicalPublicationConvergenceGate,
      reasons: normalizeDistinctStringArray(rawPublicationConvergenceGate.reasons),
    } :
    canonicalPublicationConvergenceGate;
}

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
  const hasCanonicalObservationSource =
    Boolean(publicationConvergence) ||
    hasExplicitPublicationConvergenceGate ||
    Boolean(priorityRecoveryDecisionSnapshots) ||
    Boolean(priorityRecoveryInvariants) ||
    Boolean(logsTable);

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

  const derivedPriorityRecoveryObservation = buildPriorityRecoveryObservationSnapshot({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    activeGate: options.activeGate || existingPriorityRecoveryObservation?.activeGate || null,
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
    closureRecordId:
      normalizeOptionalString(existingPriorityRecoveryObservation?.closureRecordId) ||
      null,
    closureWitnessClass:
      normalizeOptionalString(
        existingPriorityRecoveryObservation?.closureWitnessClass,
      ) ||
      null,
  });

  if (
    !existingPriorityRecoveryObservation ||
    !derivedPriorityRecoveryObservation
  ) {
    return derivedPriorityRecoveryObservation ||
      existingPriorityRecoveryObservation;
  }

  return samePriorityRecoveryObservationContract(
    existingPriorityRecoveryObservation,
    derivedPriorityRecoveryObservation,
  ) ?
    existingPriorityRecoveryObservation :
    derivedPriorityRecoveryObservation;
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
  return normalizeOptionalString(leftObservationGate.state) ===
      normalizeOptionalString(rightObservationGate.state) &&
    normalizeBoolean(leftObservationGate.publicationPending) ===
      normalizeBoolean(rightObservationGate.publicationPending) &&
    normalizeBoolean(leftObservationGate.prioritySpreadPending) ===
      normalizeBoolean(rightObservationGate.prioritySpreadPending) &&
    leftPendingAckNodeIds.length === rightPendingAckNodeIds.length &&
    leftPendingAckNodeIds.every((nodeId, index) =>
      nodeId === rightPendingAckNodeIds[index],
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

function buildCanonicalPublicationConvergence(options = {}) {
  const rawPublicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = isRecord(options.publicationConvergenceGate) ?
    options.publicationConvergenceGate :
    null;
  const priorityRecoveryObservation = isRecord(options.priorityRecoveryObservation) ?
    options.priorityRecoveryObservation :
    null;

  if (
    !rawPublicationConvergence &&
    !publicationConvergenceGate &&
    !priorityRecoveryObservation
  ) {
    return null;
  }

  const publicationEpoch =
    normalizePublicationEpoch(priorityRecoveryObservation?.publicationEpoch) ??
    normalizePublicationEpoch(publicationConvergenceGate?.publicationEpoch) ??
    normalizePublicationEpoch(rawPublicationConvergence?.publicationEpoch);
  const publicationStatus =
    normalizeOptionalString(priorityRecoveryObservation?.publicationStatus) ||
    normalizeOptionalString(publicationConvergenceGate?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.publicationStatus) ||
    normalizeOptionalString(rawPublicationConvergence?.status);
  const recoveryProtocolState =
    normalizeOptionalString(priorityRecoveryObservation?.recoveryProtocolState) ||
    normalizeOptionalString(publicationConvergenceGate?.recoveryProtocolState) ||
    normalizeOptionalString(rawPublicationConvergence?.recoveryProtocolState) ||
    normalizeOptionalString(
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.recoveryProtocolState,
    );
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    priorityRecoveryObservation?.priorityRecoveryReasonCodes ??
      publicationConvergenceGate?.reasonCodes ??
      publicationConvergenceGate?.reasons ??
      rawPublicationConvergence?.priorityRecoveryReasonCodes ??
      rawPublicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const priorityPartitionSummary =
    priorityRecoveryObservation?.priorityPartitionSummary ??
    publicationConvergenceGate?.priorityPartitionSummary ??
    rawPublicationConvergence?.priorityPartitionSummary ??
    null;
  const publishedActiveNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.publishedActiveNodeIds ??
      rawPublicationConvergence?.publishedActiveNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.requiredAckNodeIds ??
      rawPublicationConvergence?.requiredAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.acknowledgedNodeIds ??
      rawPublicationConvergence?.acknowledgedNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    priorityRecoveryObservation?.pendingAckNodeIds ??
      publicationConvergenceGate?.pendingAckNodeIds ??
      rawPublicationConvergence?.pendingAckNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.missingPublishedNodeIds ??
      rawPublicationConvergence?.missingPublishedNodeIds ??
      rawPublicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  );
  const closureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(rawPublicationConvergence?.closureRecordId);
  const closureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(rawPublicationConvergence?.closureWitnessClass);
  const priorityRecoveryClosureWitness =
    publicationConvergenceGate?.priorityRecoveryClosureWitness ||
    rawPublicationConvergence?.priorityRecoveryClosureWitness ||
    null;
  const priorityRecoveryCurrentSummary = isRecord(
    priorityRecoveryObservation?.priorityRecoveryCurrentSummary,
  ) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;

  return {
    ...(rawPublicationConvergence || {}),
    ...(publicationEpoch !== null ? {publicationEpoch} : {}),
    ...(publicationStatus ? {status: publicationStatus, publicationStatus} : {}),
    ...(recoveryProtocolState ? {recoveryProtocolState} : {}),
    priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    missingPublishedNodeIds,
    missingPublishedCount: missingPublishedNodeIds.length,
    publicationPending:
      priorityRecoveryObservation?.publicationPending === true ||
      publicationConvergenceGate?.publicationPending === true,
    prioritySpreadPending:
      priorityRecoveryObservation?.prioritySpreadPending === true ||
      publicationConvergenceGate?.prioritySpreadPending === true,
    ...(priorityRecoveryCurrentSummary ?
      {priorityRecoveryCurrentSummary} :
      {}),
    closureRecordId,
    closureWitnessClass,
    ...(publicationConvergenceGate ?
      {publicationRecoveryGate: publicationConvergenceGate} :
      {}),
  };
}

function buildCanonicalPublicationRecoveryEvidence(options = {}) {
  const publicationConvergenceGate = buildCanonicalPublicationConvergenceGate({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate: options.publicationConvergenceGate,
    priorityRecoveryObservation: options.priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      options.priorityRecoveryClosureWitness,
  });
  const priorityRecoveryObservation = buildCanonicalPriorityRecoveryObservation({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate,
    hasExplicitPublicationConvergenceGate:
      isRecord(options.publicationConvergenceGate) ||
      isRecord(options.publicationConvergence?.publicationRecoveryGate),
    priorityRecoveryObservation: options.priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants: options.priorityRecoveryInvariants,
    activeGate: options.activeGate,
    activeGateProgress: options.activeGateProgress,
    activeGateBestProgress: options.activeGateBestProgress,
    activeGateNoProgress: options.activeGateNoProgress,
    activeGateBlockerHistory: options.activeGateBlockerHistory,
    logsTable: options.logsTable,
  });
  const publicationConvergence = buildCanonicalPublicationConvergence({
    publicationConvergence: options.publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });

  return Object.freeze({
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryObservation,
  });
}

export {
  buildCanonicalPublicationRecoveryEvidence,
};
