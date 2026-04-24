import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';
import {
  buildPriorityRecoveryClosureWitness,
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-snapshot.js';

const EMPTY_STRING = '';
const PUBLICATION_OBSERVATION_STATE_UNPUBLISHED = 'unpublished';

const PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE = Object.freeze({
  CLOSURE_WITNESS: 'closure_witness',
  LEGACY_SIGNALS: 'legacy_signals',
  PRIORITY_PARTITION_SUMMARY: 'priority_partition_summary',
});

const PUBLICATION_RECOVERY_GATE_STATE = Object.freeze({
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
  PUBLICATION_PENDING: 'publication_pending',
  ACK_PENDING: 'ack_pending',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  READY: 'ready',
});

function normalizeOptionalString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
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

function normalizePublicationStatus(status) {
  const normalizedStatus = normalizeOptionalString(status);
  return normalizedStatus !== null ?
    normalizedStatus.toUpperCase() :
    EMPTY_STRING;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function resolvePendingAckNodeIds(requiredAckNodeIds = [], acknowledgedNodeIds = []) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function normalizePriorityPartitionSummary(value) {
  return value && typeof value === TYPEOF.OBJECT ?
    value :
    null;
}

function normalizePriorityRecoveryClosureWitness(value) {
  return value && typeof value === TYPEOF.OBJECT ?
    value :
    null;
}

function buildPrioritySpreadDecision(options = {}) {
  const durablePriorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  const priorityRecoveryClosureWitness = normalizePriorityRecoveryClosureWitness(
    options.priorityRecoveryClosureWitness,
  ) || buildPriorityRecoveryClosureWitness({
    decisionSnapshots: options.priorityRecoveryDecisionSnapshots,
    priorityPartitionSummary: durablePriorityPartitionSummary,
  });
  const priorityPartitionSummary =
    normalizePriorityPartitionSummary(
      priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
    ) || durablePriorityPartitionSummary;
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  const legacyPrioritySpreadPending =
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING ||
    reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    );
  const closureWitnessPrioritySpreadPending =
    typeof priorityRecoveryClosureWitness?.prioritySpreadPending === TYPEOF.BOOLEAN ?
      priorityRecoveryClosureWitness.prioritySpreadPending :
      null;
  const summaryPrioritySpreadPending =
    priorityPartitionSummary ?
      hasPriorityRecoverySpreadGap(priorityPartitionSummary) :
      null;
  const decisionSource = priorityRecoveryClosureWitness ?
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.CLOSURE_WITNESS :
    priorityPartitionSummary ?
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY :
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.LEGACY_SIGNALS;

  return Object.freeze({
    decisionSource,
    priorityPartitionSummary,
    durablePriorityPartitionSummary,
    priorityRecoveryClosureWitness,
    prioritySpreadPending:
      priorityRecoveryClosureWitness ?
        closureWitnessPrioritySpreadPending :
      priorityPartitionSummary ?
        summaryPrioritySpreadPending :
        legacyPrioritySpreadPending,
  });
}

function shouldRetainPriorityRecoveryReasonCode(reasonCode, prioritySpreadDecision) {
  if (
    reasonCode !==
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD
  ) {
    return true;
  }
  return prioritySpreadDecision.prioritySpreadPending === true;
}

function filterProvidedPriorityRecoveryReasonCodes(
  providedReasonCodes,
  prioritySpreadDecision,
) {
  return Object.freeze(
    providedReasonCodes.filter((reasonCode) =>
      shouldRetainPriorityRecoveryReasonCode(reasonCode, prioritySpreadDecision),
    ),
  );
}

function resolvePublicationPending(options = {}) {
  const missingPublishedCount = normalizeNonNegativeInteger(
    options.missingPublishedCount,
  );
  if (missingPublishedCount > NUM.ZERO) {
    return true;
  }
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  if (publicationStatusNormalized.length > NUM.ZERO) {
    return publicationStatusNormalized !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  if (
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING ||
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION
  ) {
    return true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  );
}

function resolvePublicationRecoveryGateState(context = {}) {
  const observationState = normalizeOptionalString(
    context.publicationObservationState,
  );
  if (observationState === PUBLICATION_OBSERVATION_STATE_UNPUBLISHED) {
    return PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION;
  }
  const recoveryProtocolState = normalizeOptionalString(
    context.recoveryProtocolState,
  );
  if (context.publicationStatusNormalized.length === NUM.ZERO &&
      recoveryProtocolState ===
        RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION) {
    return PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION;
  }
  if (context.pendingAckCount > NUM.ZERO ||
      context.publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING) {
    return PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING;
  }
  if (context.publicationPending === true) {
    return PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING;
  }
  if (context.prioritySpreadPending === true) {
    return PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING;
  }
  return PUBLICATION_RECOVERY_GATE_STATE.READY;
}

function buildPublicationRecoveryGateSnapshot(options = {}) {
  const requiredAckNodeIds = normalizeDistinctStringArray(
    options.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    options.acknowledgedNodeIds,
  );
  const derivedPendingAckNodeIds = resolvePendingAckNodeIds(
    requiredAckNodeIds,
    acknowledgedNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const effectivePendingAckNodeIds =
    pendingAckNodeIds.length > NUM.ZERO ?
      pendingAckNodeIds :
      derivedPendingAckNodeIds;
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    options.missingPublishedNodeIds ??
      options.missingPublishedRecoveryActiveNodeIds,
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
  const retainedProvidedReasonCodes = filterProvidedPriorityRecoveryReasonCodes(
    providedReasonCodes,
    prioritySpreadDecision,
  );
  const publicationPending = resolvePublicationPending({
    publicationStatus: options.publicationStatus,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: retainedProvidedReasonCodes,
    missingPublishedCount: missingPublishedNodeIds.length,
  });
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  const reasonCodes = [
    ...retainedProvidedReasonCodes,
    ...(publicationPending || effectivePendingAckNodeIds.length > NUM.ZERO ? [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    ] : []),
    ...(prioritySpreadPending ? [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ] : []),
  ];
  const dedupedReasonCodes = normalizeDistinctStringArray(reasonCodes);
  const state = resolvePublicationRecoveryGateState({
    publicationObservationState: options.publicationObservationState,
    recoveryProtocolState: options.recoveryProtocolState,
    publicationStatusNormalized,
    publicationPending,
    prioritySpreadPending,
    pendingAckCount: effectivePendingAckNodeIds.length,
  });

  return Object.freeze({
    state,
    ready: state === PUBLICATION_RECOVERY_GATE_STATE.READY,
    active: state !== PUBLICATION_RECOVERY_GATE_STATE.READY,
    publicationEpoch:
      Number.isFinite(options.publicationEpoch) ?
        Math.floor(options.publicationEpoch) :
        null,
    publicationStatus:
      normalizeOptionalString(options.publicationStatus),
    publicationStatusNormalized,
    publicationObservationState:
      normalizeOptionalString(options.publicationObservationState),
    recoveryProtocolState:
      normalizeOptionalString(options.recoveryProtocolState),
    reasonCodes: dedupedReasonCodes,
    priorityPartitionSummary:
      prioritySpreadDecision.priorityPartitionSummary ?
        Object.freeze({...prioritySpreadDecision.priorityPartitionSummary}) :
        null,
    priorityRecoveryClosureWitness:
      prioritySpreadDecision.priorityRecoveryClosureWitness ?
        Object.freeze({...prioritySpreadDecision.priorityRecoveryClosureWitness}) :
        null,
    closureRecordId:
      prioritySpreadDecision.priorityRecoveryClosureWitness?.closureRecordId ||
      null,
    closureWitnessClass:
      prioritySpreadDecision.priorityRecoveryClosureWitness?.closureWitnessClass ||
      null,
    requiredAckNodeIds,
    requiredAckCount: normalizeNonNegativeInteger(requiredAckNodeIds.length),
    acknowledgedNodeIds,
    acknowledgedCount: normalizeNonNegativeInteger(acknowledgedNodeIds.length),
    pendingAckNodeIds: effectivePendingAckNodeIds,
    pendingAckCount:
      normalizeNonNegativeInteger(effectivePendingAckNodeIds.length),
    missingPublishedNodeIds,
    missingPublishedCount:
      normalizeNonNegativeInteger(missingPublishedNodeIds.length),
    publicationPending:
      publicationPending || effectivePendingAckNodeIds.length > NUM.ZERO,
    ackPending: effectivePendingAckNodeIds.length > NUM.ZERO,
    prioritySpreadPending,
  });
}

export {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
};
