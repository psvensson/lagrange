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

const EMPTY_STRING = '';
const PUBLICATION_OBSERVATION_STATE_UNPUBLISHED = 'unpublished';

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

function resolvePrioritySpreadPending(options = {}) {
  const priorityPartitionSummary =
    options.priorityPartitionSummary &&
      typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
      options.priorityPartitionSummary :
      null;
  if (priorityPartitionSummary?.satisfied === false) {
    return true;
  }
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  if (recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING) {
    return true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
  );
}

function resolvePublicationPending(options = {}) {
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
  const prioritySpreadPending = resolvePrioritySpreadPending({
    priorityPartitionSummary: options.priorityPartitionSummary,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: providedReasonCodes,
  });
  const publicationPending = resolvePublicationPending({
    publicationStatus: options.publicationStatus,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: providedReasonCodes,
  });
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  const reasonCodes = [
    ...providedReasonCodes,
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
      options.priorityPartitionSummary &&
        typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
        Object.freeze({...options.priorityPartitionSummary}) :
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
