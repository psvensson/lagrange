import {NUM} from '../constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';
import {
  hasOwnerReconcilePublicationHandoff,
} from './publication-recovery-handoff-evidence-normalizers.js';
import {
  hasPublicationRecoveryPressureCoalescedEvidence,
  hasPublicationRecoveryPressureDeferredEvidence,
} from './publication-recovery-pressure-evidence.js';
import {
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePublicationEpoch,
  PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON,
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  PUBLICATION_RECOVERY_PROTOCOL_STATE,
} from './publication-recovery-evidence-values.js';

function hasClosedUnknownNoDebtPublicationGate(
  publicationConvergenceGate = null,
) {
  if (!isRecord(publicationConvergenceGate)) {
    return false;
  }
  const publicationStatus =
    normalizeOptionalString(
      publicationConvergenceGate.publicationStatusNormalized,
    ) ||
    normalizeOptionalString(publicationConvergenceGate.publicationStatus);
  return publicationConvergenceGate.publicationPending !== true &&
    hasUnknownPublicationRecoveryStatus(publicationStatus) &&
    normalizeOptionalString(publicationConvergenceGate.recoveryProtocolState) ===
      PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION &&
    normalizeOptionalString(publicationConvergenceGate.ackState) ===
      PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED &&
    normalizeOptionalString(publicationConvergenceGate.streamOutcome) ===
      PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED &&
    normalizeOptionalString(publicationConvergenceGate.recoveryOutcome) ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED &&
    normalizeNonNegativeInteger(publicationConvergenceGate.pendingAckCount) ===
      NUM.ZERO &&
    normalizeDistinctStringArray(publicationConvergenceGate.pendingAckNodeIds)
      .length === NUM.ZERO &&
    normalizeNonNegativeInteger(
      publicationConvergenceGate.missingPublishedCount,
    ) === NUM.ZERO &&
    normalizeDistinctStringArray(
      publicationConvergenceGate.missingPublishedNodeIds,
    ).length === NUM.ZERO &&
    publicationConvergenceGate.prioritySpreadPending !== true &&
    publicationConvergenceGate.prioritySpreadEvidenceUnavailable !== true;
}

function isClosedUnknownNoDebtReasonCode(reasonCode) {
  const normalizedReasonCode = normalizeOptionalString(reasonCode);
  return normalizedReasonCode ===
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING ||
    normalizedReasonCode ===
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_CONVERGENCE_MISSING ||
    normalizedReasonCode?.startsWith(
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_MISSING_ACTIVE_NODE_PREFIX,
    ) === true ||
    normalizedReasonCode?.startsWith(
      PUBLICATION_RECOVERY_CLOSED_UNPUBLISHED_REASON
        .PUBLICATION_NOT_PUBLISHED_PREFIX,
    ) === true;
}

function filterClosedUnknownNoDebtReasonCodes(reasonCodes = []) {
  return Object.freeze(
    normalizeDistinctStringArray(reasonCodes).filter((reasonCode) =>
      isClosedUnknownNoDebtReasonCode(reasonCode) !== true,
    ),
  );
}

function normalizeClosedUnknownNoDebtPriorityRecoveryObservation(
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
) {
  if (
    !isRecord(priorityRecoveryObservation) ||
    hasClosedUnknownNoDebtPublicationGate(publicationConvergenceGate) !== true
  ) {
    return priorityRecoveryObservation;
  }
  return Object.freeze({
    ...priorityRecoveryObservation,
    publicationPending: false,
    recoveryProtocolState:
      PUBLICATION_RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    priorityRecoveryReasonCodes: filterClosedUnknownNoDebtReasonCodes(
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
    ),
    publicationConvergenceGateReasons: filterClosedUnknownNoDebtReasonCodes(
      priorityRecoveryObservation.publicationConvergenceGateReasons,
    ),
    pendingAckNodeIds: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    pendingAckCount: NUM.ZERO,
    missingPublishedNodeIds: PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
    missingPublishedCount: NUM.ZERO,
  });
}

function normalizePriorityRecoveryObservationFromPublicationGate(
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
) {
  if (
    !isRecord(priorityRecoveryObservation) ||
    !isRecord(publicationConvergenceGate)
  ) {
    return priorityRecoveryObservation;
  }
  const publicationGateReasonCodes = normalizeDistinctStringArray(
    publicationConvergenceGate.reasonCodes ??
      publicationConvergenceGate.reasons ??
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
  );
  const pressureDeferred =
    hasPublicationRecoveryPressureDeferredEvidence(publicationConvergenceGate);
  const pressureCoalesced =
    hasPublicationRecoveryPressureCoalescedEvidence(publicationConvergenceGate);
  return Object.freeze({
    ...priorityRecoveryObservation,
    publicationEpoch:
      publicationConvergenceGate.publicationEpoch ??
      priorityRecoveryObservation.publicationEpoch,
    publicationStatus:
      publicationConvergenceGate.publicationStatus ??
      priorityRecoveryObservation.publicationStatus,
    recoveryProtocolState:
      publicationConvergenceGate.recoveryProtocolState ??
      priorityRecoveryObservation.recoveryProtocolState,
    priorityRecoveryReasonCodes: publicationGateReasonCodes,
    publicationConvergenceGateReasons: publicationGateReasonCodes,
    pendingAckNodeIds: normalizeDistinctStringArray(
      publicationConvergenceGate.pendingAckNodeIds,
    ),
    pendingAckCount: normalizeNonNegativeInteger(
      publicationConvergenceGate.pendingAckCount,
    ),
    missingPublishedNodeIds: normalizeDistinctStringArray(
      publicationConvergenceGate.missingPublishedNodeIds,
    ),
    missingPublishedCount: normalizeNonNegativeInteger(
      publicationConvergenceGate.missingPublishedCount,
    ),
    publicationPending: publicationConvergenceGate.publicationPending === true,
    prioritySpreadPending:
      publicationConvergenceGate.prioritySpreadPending === true,
    pressureState:
      publicationConvergenceGate.pressureState ??
      priorityRecoveryObservation.pressureState,
    pressureDeferred,
    pressureCoalesced,
    pressureRetryAfterMs: normalizeNonNegativeInteger(
      publicationConvergenceGate.pressureRetryAfterMs,
    ),
    pressureReasonCodes: normalizeDistinctStringArray(
      publicationConvergenceGate.pressureReasonCodes,
    ),
    priorityPartitionSummary:
      publicationConvergenceGate.priorityPartitionSummary ??
      priorityRecoveryObservation.priorityPartitionSummary,
  });
}

function hasUnavailablePublicationRecoveryEpoch(value) {
  const publicationEpoch = normalizePublicationEpoch(value);
  return publicationEpoch === null || publicationEpoch === NUM.ZERO;
}

function hasUnknownPublicationRecoveryStatus(value) {
  const publicationStatus = normalizeOptionalString(value);
  return publicationStatus === null ||
    publicationStatus === PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function hasPublicationRecoveryNodeListEvidence(...nodeIdLists) {
  return nodeIdLists.some((nodeIds) =>
    normalizeDistinctStringArray(nodeIds).length > NUM.ZERO,
  );
}

function hasCountOnlyUnknownPublicationDeficit({
  publicationEpoch = null,
  publicationStatus = null,
  pendingAckEvidence = null,
  authoritativePublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  authoritativeMissingPublishedNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  observedMissingPublishedNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  selectedPublicationMembershipNodeIds =
  PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  publishedActiveNodeIds = PUBLICATION_RECOVERY_EVIDENCE_EMPTY_LIST,
  prioritySpreadPending = false,
  publicationActiveGateHandoff = null,
} = {}) {
  if (hasOwnerReconcilePublicationHandoff(publicationActiveGateHandoff)) {
    return false;
  }
  return hasUnknownPublicationRecoveryStatus(publicationStatus) &&
    hasUnavailablePublicationRecoveryEpoch(publicationEpoch) &&
    prioritySpreadPending !== true &&
    normalizeNonNegativeInteger(pendingAckEvidence?.pendingAckCount) ===
      NUM.ZERO &&
    hasPublicationRecoveryNodeListEvidence(
      pendingAckEvidence?.requiredAckNodeIds,
      pendingAckEvidence?.acknowledgedNodeIds,
      pendingAckEvidence?.pendingAckNodeIds,
      authoritativePublicationMembershipNodeIds,
      authoritativeMissingPublishedNodeIds,
      observedMissingPublishedNodeIds,
      selectedPublicationMembershipNodeIds,
      publishedActiveNodeIds,
    ) !== true;
}

export {
  hasClosedUnknownNoDebtPublicationGate,
  isClosedUnknownNoDebtReasonCode,
  filterClosedUnknownNoDebtReasonCodes,
  normalizeClosedUnknownNoDebtPriorityRecoveryObservation,
  normalizePriorityRecoveryObservationFromPublicationGate,
  hasUnavailablePublicationRecoveryEpoch,
  hasUnknownPublicationRecoveryStatus,
  hasPublicationRecoveryNodeListEvidence,
  hasCountOnlyUnknownPublicationDeficit,
};
