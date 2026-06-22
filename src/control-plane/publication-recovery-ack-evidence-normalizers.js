import {NUM} from '../constants/index.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';
import {
  hasPublicationRecoveryPressureDeferredEvidence,
} from './publication-recovery-pressure-evidence.js';
import {
  isRecord,
  normalizeDistinctStringArray,
  normalizeMaximumNonNegativeInteger,
  normalizeOptionalString,
  PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT,
  PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_PUBLICATION_STATUS,
} from './publication-recovery-evidence-values.js';

function buildPublicationRecoveryAckNodeListInput(value) {
  return Array.isArray(value) ?
    Object.freeze({
      state: PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED,
      value,
    }) :
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function isPublicationRecoveryAckNodeListProvided(input) {
  return input?.state ===
    PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT_STATE.PROVIDED;
}

function resolvePublicationRecoveryAckNodeListInput(inputs = []) {
  return inputs.find((input) =>
    isPublicationRecoveryAckNodeListProvided(input),
  ) || PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
}

function resolvePublicationRecoveryGateRequiredAckNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.requiredAckNodeIds);
}

function resolvePublicationRecoveryGateAcknowledgedNodeListInput(gate = null) {
  if (
    !isRecord(gate) ||
    gate.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(gate.acknowledgedNodeIds);
}

function resolvePublicationRecoveryConvergenceRequiredAckNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.requiredAckNodeIds,
  );
}

function resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput(
  publicationConvergence = null,
) {
  if (
    !isRecord(publicationConvergence) ||
    publicationConvergence.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT.UNAVAILABLE;
  }
  return buildPublicationRecoveryAckNodeListInput(
    publicationConvergence.acknowledgedNodeIds,
  );
}

function hasAuthoritativeEmptyPendingAckGate(gate = null) {
  return isRecord(gate) &&
    Array.isArray(gate.pendingAckNodeIds) &&
    normalizeDistinctStringArray(gate.pendingAckNodeIds).length === NUM.ZERO &&
    (
      gate.publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS
        .PUBLISHED ||
      hasPublicationRecoveryPressureDeferredEvidence(gate)
    );
}

function hasAuthoritativeEmptyMissingPublishedGate(gate = null) {
  return isRecord(gate) &&
    Array.isArray(gate.missingPublishedNodeIds) &&
    normalizeDistinctStringArray(gate.missingPublishedNodeIds).length ===
      NUM.ZERO &&
    (
      gate.publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS
        .PUBLISHED ||
      hasPublicationRecoveryPressureDeferredEvidence(gate)
    );
}

function resolvePendingRequiredAckNodeIds(
  requiredAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  acknowledgedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function normalizePublicationRecoveryAckEvidence(options = {}) {
  const requiredAckNodeListInput = isRecord(options.requiredAckNodeListInput) ?
    options.requiredAckNodeListInput :
    buildPublicationRecoveryAckNodeListInput(options.requiredAckNodeIds);
  const requiredAckNodeIds = normalizeDistinctStringArray(
    requiredAckNodeListInput.value,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    options.acknowledgedNodeIds,
  );
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const publicationStatus = normalizeOptionalString(options.publicationStatus);
  const openCountOnlyAckIsStale =
    options.openCountOnlyAckIsStale !== false;
  const hasClosedPublishedPendingAckList =
    publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS.PUBLISHED &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO;
  const hasOpenCountOnlyPendingAckList =
    openCountOnlyAckIsStale &&
    publicationStatus === PUBLICATION_RECOVERY_PUBLICATION_STATUS.OPEN &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO;
  const hasCountOnlyDebt =
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    explicitPendingAckNodeIds.length === NUM.ZERO &&
    Math.max(
      normalizeMaximumNonNegativeInteger(options.pendingAckCountValues),
      Number.isFinite(Number(options.pendingAckCount)) ? Number(options.pendingAckCount) : NUM.ZERO,
    ) > NUM.ZERO;
  const evidenceState =
    (
      hasClosedPublishedPendingAckList ||
      isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) &&
        (
          requiredAckNodeIds.length > NUM.ZERO ||
          explicitPendingAckNodeIds.length === NUM.ZERO
        )
    ) &&
    !hasCountOnlyDebt ?
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST :
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      resolvePendingRequiredAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds) :
      PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  const pendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      derivedPendingAckNodeIds :
      explicitPendingAckNodeIds;
  const countOnlyPendingAckCount =
    hasOpenCountOnlyPendingAckList ?
      NUM.ZERO :
      Math.max(
        pendingAckNodeIds.length,
        normalizeMaximumNonNegativeInteger(options.pendingAckCountValues),
        Number.isFinite(Number(options.pendingAckCount)) ?
          Number(options.pendingAckCount) :
          NUM.ZERO,
      );
  const pendingAckCountByState = Object.freeze({
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      countOnlyPendingAckCount,
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST]:
      pendingAckNodeIds.length,
  });

  return Object.freeze({
    evidenceState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckCountByState[evidenceState],
  });
}

function resolvePublicationRecoveryPendingAckNodeIds({
  requiredAckNodeListInput = PUBLICATION_RECOVERY_ACK_NODE_LIST_INPUT
    .UNAVAILABLE,
  ownerPendingAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  fallbackPendingAckNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
} = {}) {
  const normalizedOwnerPendingAckNodeIds = normalizeDistinctStringArray(
    ownerPendingAckNodeIds,
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    requiredAckNodeListInput.value,
  );
  if (
    isPublicationRecoveryAckNodeListProvided(requiredAckNodeListInput) &&
    (
      requiredAckNodeIds.length > NUM.ZERO ||
      normalizedOwnerPendingAckNodeIds.length === NUM.ZERO
    )
  ) {
    return PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST;
  }
  return normalizeDistinctStringArray([
    ...normalizedOwnerPendingAckNodeIds,
    ...normalizeDistinctStringArray(fallbackPendingAckNodeIds),
  ]);
}

export {
  buildPublicationRecoveryAckNodeListInput,
  isPublicationRecoveryAckNodeListProvided,
  resolvePublicationRecoveryAckNodeListInput,
  resolvePublicationRecoveryGateRequiredAckNodeListInput,
  resolvePublicationRecoveryGateAcknowledgedNodeListInput,
  resolvePublicationRecoveryConvergenceRequiredAckNodeListInput,
  resolvePublicationRecoveryConvergenceAcknowledgedNodeListInput,
  hasAuthoritativeEmptyPendingAckGate,
  hasAuthoritativeEmptyMissingPublishedGate,
  resolvePendingRequiredAckNodeIds,
  normalizePublicationRecoveryAckEvidence,
  resolvePublicationRecoveryPendingAckNodeIds,
};
