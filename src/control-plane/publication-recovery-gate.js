import {NUM} from '../constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {
  buildPublicationOwnerStreamState,
} from './publication-owner-state.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate-constants.js';
import {
  buildPendingAckEvidence,
  buildPublicationStreamCompatibilityEvidence,
  hasPublicationStatusPendingMeaning,
  isPublicationOwnerStreamPendingForRecoveryGate,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizeProvidedPublicationOwnerStream,
  normalizePublicationStatus,
  resolvePublicationPressureEvidence,
  resolvePublicationRecoveryProtocolState,
} from './publication-recovery-stream-evidence.js';
import {
  buildPrioritySpreadDecision,
  filterProvidedPriorityRecoveryReasonCodes,
} from './publication-recovery-priority-spread.js';

const PUBLICATION_RECOVERY_GATE_STATE = Object.freeze({
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
  PUBLICATION_PENDING: 'publication_pending',
  ACK_PENDING: 'ack_pending',
  CONSUMER_LAG: 'consumer_lag',
  PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE:
    'priority_spread_evidence_unavailable',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  PRESSURE_DEFERRED: 'pressure_deferred',
  READY: 'ready',
});

const PUBLICATION_RECOVERY_GATE_STREAM_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.PRESSURE_DEFERRED,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.PRESSURE_DEFERRED ||
      context.publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.PRESSURE_DEFERRED,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING ||
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.CONSUMER_LAG,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE
      .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    matches: (context) =>
      context.publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE ||
      context.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING ||
      context.prioritySpreadPending === true,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.READY,
    matches: () => true,
  }),
]);

function resolvePublicationPending(options = {}) {
  const ackClosureSatisfied = options.ackClosureSatisfied === true;
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  if (
    publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING
  ) {
    return ackClosureSatisfied !== true;
  }
  if (hasPublicationStatusPendingMeaning(publicationStatusNormalized)) {
    return publicationStatusNormalized !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  if (recoveryProtocolState === RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION) {
    return false;
  }
  if (
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING
  ) {
    if (options.publicationExcludesTargetNode === true) {
      return true;
    }
    return ackClosureSatisfied !== true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  ) && (options.publicationExcludesTargetNode === true || ackClosureSatisfied !== true);
}

function resolvePublicationRecoveryGateState(context = {}) {
  return PUBLICATION_RECOVERY_GATE_STREAM_RULES.find((rule) =>
    rule.matches(context),
  ).state;
}

function buildPublicationRecoveryGateSnapshot(options = {}) {
  const providedPublicationOwnerStream = normalizeProvidedPublicationOwnerStream(
    options.publicationOwnerStream,
  );
  const pressureEvidence = resolvePublicationPressureEvidence(
    providedPublicationOwnerStream,
    options,
  );
  const pressureDeferred = pressureEvidence.pressureDeferred === true;
  const pendingAckEvidence = buildPendingAckEvidence(
    pressureDeferred ?
      {
        ...options,
        requiredAckNodeIds: PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
        acknowledgedNodeIds: PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
        pendingAckNodeIds: PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
        pendingAckCount: NUM.ZERO,
      } :
      options,
  );
  const requiredAckNodeIds = pendingAckEvidence.requiredAckNodeIds;
  const acknowledgedNodeIds = pendingAckEvidence.acknowledgedNodeIds;
  const effectivePendingAckNodeIds = pendingAckEvidence.pendingAckNodeIds;
  const pendingAckCount = pendingAckEvidence.pendingAckCount;
  const ackClosureSatisfied =
    pendingAckEvidence.evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST &&
    pendingAckCount === NUM.ZERO;
  const missingPublishedNodeIds = pressureDeferred ?
    PUBLICATION_RECOVERY_GATE_EMPTY_LIST :
    normalizeDistinctStringArray(
      options.missingPublishedNodeIds ??
        options.missingPublishedRecoveryActiveNodeIds,
    );
  const missingPublishedCount = pressureDeferred ?
    NUM.ZERO :
    Math.max(
      missingPublishedNodeIds.length,
      normalizeNonNegativeInteger(options.missingPublishedCount),
    );
  const providedReasonCodes = normalizeDistinctStringArray(
    options.priorityRecoveryReasonCodes ??
      options.reasonCodes,
  );
  const prioritySpreadDecision = buildPrioritySpreadDecision({
    priorityPartitionSummary: options.priorityPartitionSummary,
    priorityRecoveryClosureWitness: options.priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots: options.priorityRecoveryDecisionSnapshots,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: providedReasonCodes,
  });
  const prioritySpreadPending = prioritySpreadDecision.prioritySpreadPending;
  const prioritySpreadEvidenceUnavailable =
    prioritySpreadDecision.prioritySpreadEvidenceUnavailable === true;
  const publicationPendingEvidenceActive = pressureDeferred ?
    false :
    resolvePublicationPending({
      publicationStatus: options.publicationStatus,
      recoveryProtocolState: options.recoveryProtocolState,
      reasonCodes: providedReasonCodes,
      missingPublishedCount,
      ackClosureSatisfied,
      publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
    });
  const prioritySpreadEvidenceUnavailableReasonActive =
    prioritySpreadEvidenceUnavailable === true &&
    publicationPendingEvidenceActive !== true &&
    pendingAckCount === NUM.ZERO;
  const publicationEpochReasonActive =
    publicationPendingEvidenceActive === true ||
    pendingAckCount > NUM.ZERO;
  const retainedProvidedReasonCodes = filterProvidedPriorityRecoveryReasonCodes(
    providedReasonCodes,
    prioritySpreadDecision,
    prioritySpreadEvidenceUnavailableReasonActive,
    publicationEpochReasonActive,
  );
  const publicationPending = pressureDeferred ?
    false :
    resolvePublicationPending({
      publicationStatus: options.publicationStatus,
      recoveryProtocolState: options.recoveryProtocolState,
      reasonCodes: retainedProvidedReasonCodes,
      missingPublishedCount,
      ackClosureSatisfied,
      publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
    });
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  const fallbackPublicationOwnerStream = buildPublicationOwnerStreamState({
    publicationRevision: options.publicationRevision ?? options.publicationEpoch,
    desiredPublicationRevision:
      options.desiredPublicationRevision ?? options.desiredRevision ??
      providedPublicationOwnerStream?.revision?.desired?.value ??
      options.publicationEpoch,
    committedPublicationRevision:
      options.committedPublicationRevision ?? options.committedRevision ??
      providedPublicationOwnerStream?.revision?.committed?.value,
    publicationStatus: options.publicationStatus,
    publicationObservationState: options.publicationObservationState,
    recoveryProtocolState: options.recoveryProtocolState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds: effectivePendingAckNodeIds,
    pendingAckCount,
    pendingAckEvidenceState: pendingAckEvidence.evidenceState,
    missingPublishedNodeIds,
    missingPublishedCount,
    priorityRecoveryReasonCodes: retainedProvidedReasonCodes,
    prioritySpreadPending,
    prioritySpreadEvidenceUnavailable,
    pressureState: options.pressureState,
    pressureDeferred: options.pressureDeferred,
    pressureCoalesced: options.pressureCoalesced,
    pressureRetryAfterMs: options.pressureRetryAfterMs,
    pressureReasonCodes: options.pressureReasonCodes,
    publicationPendingHint: publicationPending,
  });
  const publicationOwnerStream =
    providedPublicationOwnerStream || fallbackPublicationOwnerStream;
  const streamCompatibilityEvidence =
    providedPublicationOwnerStream ?
      buildPublicationStreamCompatibilityEvidence({
        publicationOwnerStream,
        pendingAckEvidence,
        missingPublishedNodeIds,
        missingPublishedCount,
        publicationEpoch:
          Number.isFinite(options.publicationEpoch) ?
            Math.floor(options.publicationEpoch) :
            null,
        publicationStatus: normalizeOptionalString(options.publicationStatus),
        publicationObservationState:
          normalizeOptionalString(options.publicationObservationState),
        recoveryProtocolState: resolvePublicationRecoveryProtocolState({
          publicationOwnerStream,
          prioritySpreadPending,
          prioritySpreadEvidenceUnavailable,
          publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
        }),
        publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
        prioritySpreadPending,
        prioritySpreadEvidenceUnavailable,
        prioritySpreadDecisionSource: prioritySpreadDecision.decisionSource,
        pressureState: options.pressureState,
        pressureDeferred: options.pressureDeferred,
        pressureCoalesced: options.pressureCoalesced,
        pressureRetryAfterMs: options.pressureRetryAfterMs,
        pressureReasonCodes: options.pressureReasonCodes,
      }) :
      Object.freeze({
        publicationEpoch:
          Number.isFinite(options.publicationEpoch) ?
            Math.floor(options.publicationEpoch) :
            null,
        publicationStatus: normalizeOptionalString(options.publicationStatus),
        publicationObservationState:
          normalizeOptionalString(options.publicationObservationState),
        recoveryProtocolState: resolvePublicationRecoveryProtocolState({
          publicationOwnerStream,
          prioritySpreadPending,
          prioritySpreadEvidenceUnavailable,
          publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
        }),
        requiredAckNodeIds,
        acknowledgedNodeIds,
        pendingAckNodeIds: effectivePendingAckNodeIds,
        pendingAckCount,
        pendingAckEvidenceState: pendingAckEvidence.evidenceState,
        missingPublishedNodeIds,
        missingPublishedCount,
        publicationPending:
          options.publicationExcludesTargetNode === true ||
          isPublicationOwnerStreamPendingForRecoveryGate(
            publicationOwnerStream,
            pendingAckCount,
            missingPublishedCount,
          ) ||
          pendingAckCount > NUM.ZERO,
        ackPending: pendingAckCount > NUM.ZERO,
        prioritySpreadPending,
        prioritySpreadEvidenceUnavailable,
        ...pressureEvidence,
      });
  const effectivePrioritySpreadDecision = Object.freeze({
    ...prioritySpreadDecision,
    prioritySpreadPending:
      streamCompatibilityEvidence.prioritySpreadPending,
    prioritySpreadEvidenceUnavailable:
      streamCompatibilityEvidence.prioritySpreadEvidenceUnavailable,
  });
  const effectivePrioritySpreadEvidenceUnavailableReasonActive =
    streamCompatibilityEvidence.prioritySpreadEvidenceUnavailable === true &&
    streamCompatibilityEvidence.publicationPending !== true &&
    streamCompatibilityEvidence.pendingAckCount === NUM.ZERO;
  const effectiveRetainedProvidedReasonCodes =
    filterProvidedPriorityRecoveryReasonCodes(
      providedReasonCodes,
      effectivePrioritySpreadDecision,
      effectivePrioritySpreadEvidenceUnavailableReasonActive,
      streamCompatibilityEvidence.publicationPending,
    );
  const effectiveAppendPrioritySpreadEvidenceUnavailableReason =
    effectivePrioritySpreadEvidenceUnavailableReasonActive === true &&
    !effectiveRetainedProvidedReasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    );
  const reasonCodes = [
    ...(streamCompatibilityEvidence.publicationPending ? [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ] : []),
    ...effectiveRetainedProvidedReasonCodes,
    ...(effectiveAppendPrioritySpreadEvidenceUnavailableReason ? [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON
        .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    ] : []),
    ...(streamCompatibilityEvidence.prioritySpreadPending ? [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ] : []),
  ];
  const dedupedReasonCodes = normalizeDistinctStringArray(reasonCodes);
  const state = resolvePublicationRecoveryGateState({
    publicationOwnerStream,
    prioritySpreadPending: streamCompatibilityEvidence.prioritySpreadPending,
    prioritySpreadEvidenceUnavailable:
      streamCompatibilityEvidence.prioritySpreadEvidenceUnavailable,
  });

  return Object.freeze({
    state,
    ready: state === PUBLICATION_RECOVERY_GATE_STATE.READY,
    active: state !== PUBLICATION_RECOVERY_GATE_STATE.READY,
    publicationEpoch: streamCompatibilityEvidence.publicationEpoch,
    publicationStatus: streamCompatibilityEvidence.publicationStatus,
    publicationStatusNormalized:
      providedPublicationOwnerStream ?
        normalizePublicationStatus(streamCompatibilityEvidence.publicationStatus) :
        publicationStatusNormalized,
    publicationObservationState:
      streamCompatibilityEvidence.publicationObservationState,
    recoveryProtocolState: streamCompatibilityEvidence.recoveryProtocolState,
    reasonCodes: dedupedReasonCodes,
    priorityPartitionSummary:
      prioritySpreadDecision.priorityPartitionSummary ?
        Object.freeze({...prioritySpreadDecision.priorityPartitionSummary}) :
        null,
    publicationOwnerStream,
    streamOutcome: publicationOwnerStream.streamOutcome,
    ackState: publicationOwnerStream.ackState,
    freshnessFence: publicationOwnerStream.freshnessFence,
    recoveryOutcome: publicationOwnerStream.recoveryOutcome,
    pressureState: streamCompatibilityEvidence.pressureState,
    pressureDeferred: streamCompatibilityEvidence.pressureDeferred,
    pressureCoalesced: streamCompatibilityEvidence.pressureCoalesced,
    pressureRetryAfterMs: streamCompatibilityEvidence.pressureRetryAfterMs,
    pressureReasonCodes: streamCompatibilityEvidence.pressureReasonCodes,
    priorityRecoveryClosureWitness:
      prioritySpreadDecision.priorityRecoveryClosureWitness ?
        Object.freeze({...prioritySpreadDecision.priorityRecoveryClosureWitness}) :
        null,
    prioritySpreadDecisionSource: prioritySpreadDecision.decisionSource,
    prioritySpreadEvidenceUnavailable:
      streamCompatibilityEvidence.prioritySpreadEvidenceUnavailable,
    closureRecordId:
      prioritySpreadDecision.priorityRecoveryClosureWitness?.closureRecordId ||
      null,
    closureWitnessClass:
      prioritySpreadDecision.priorityRecoveryClosureWitness?.closureWitnessClass ||
      null,
    requiredAckNodeIds: streamCompatibilityEvidence.requiredAckNodeIds,
    requiredAckCount:
      normalizeNonNegativeInteger(
        streamCompatibilityEvidence.requiredAckNodeIds.length,
      ),
    acknowledgedNodeIds: streamCompatibilityEvidence.acknowledgedNodeIds,
    acknowledgedCount:
      normalizeNonNegativeInteger(
        streamCompatibilityEvidence.acknowledgedNodeIds.length,
      ),
    pendingAckNodeIds: streamCompatibilityEvidence.pendingAckNodeIds,
    pendingAckCount:
      normalizeNonNegativeInteger(streamCompatibilityEvidence.pendingAckCount),
    pendingAckEvidenceState: streamCompatibilityEvidence.pendingAckEvidenceState,
    missingPublishedNodeIds: streamCompatibilityEvidence.missingPublishedNodeIds,
    missingPublishedCount:
      normalizeNonNegativeInteger(
        streamCompatibilityEvidence.missingPublishedCount,
      ),
    publicationPending: streamCompatibilityEvidence.publicationPending,
    ackPending: streamCompatibilityEvidence.ackPending,
    prioritySpreadPending: streamCompatibilityEvidence.prioritySpreadPending,
    publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
  });
}

export {
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
};
