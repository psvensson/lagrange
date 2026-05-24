import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from '../../../src/control-plane/priority-recovery-snapshot.js';

const PUBLICATION_EVIDENCE_EMPTY_LIST = Object.freeze([]);
const PUBLICATION_EVIDENCE_ZERO = 0;
const PUBLICATION_EVIDENCE_READY_BLOCKER = 'ready';
const PUBLICATION_EVIDENCE_PUBLICATION_STATUS_OPEN = 'OPEN';
const PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED =
  'steady_published';
const PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON = Object.freeze({
  PUBLICATION_EPOCH_PENDING: 'publication_epoch_pending',
  MISSING_ACTIVE_NODE_PREFIX: 'publication_missing_active_node=',
  PENDING_ACK_PREFIX: 'publication_pending_ack=',
});
const PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX = Object.freeze({
  PUBLICATION_GATE: 'publication_gate=',
  PRIORITY_RECOVERY_PROGRESS_CLASS: 'priority_recovery_progress_class=',
});
const PUBLICATION_EVIDENCE_SOURCE_SELECTION = Object.freeze({
  OBSERVED: 'observed',
  BEST_PROGRESS_CLOSED_PUBLICATION: 'best_progress_closed_publication',
});
const PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE =
  Object.freeze({
    CLOSED_STALE_SELECTED_SNAPSHOT: 'closed_stale_selected_snapshot',
    PROGRESS_SNAPSHOT: 'progress_snapshot',
  });
const PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_RULES =
  Object.freeze([
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE
          .CLOSED_STALE_SELECTED_SNAPSHOT,
      matches: (evidence) =>
        evidence.stalePublicationClosure === true &&
        evidence.currentPublicationGateClosed === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE
          .PROGRESS_SNAPSHOT,
      matches: () => true,
    }),
  ]);
const PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  STATE: 'publicationActiveGateHandoffState',
  REASON_CODE: 'publicationActiveGateHandoffReasonCode',
  NEXT_ACTION: 'publicationActiveGateHandoffNextAction',
  RUNTIME_PROMOTION_ALLOWED:
    'publicationActiveGateHandoffRuntimePromotionAllowed',
  PENDING_RECONCILE_NODE_IDS:
    'publicationActiveGateHandoffPendingReconcileNodeIds',
});
const PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF = Object.freeze({
  STATE_PENDING: 'pending',
  REASON_OWNER_RECONCILE_PENDING: 'owner_reconcile_pending',
  ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION:
    'reconcile_owner_membership_publication',
});
const PUBLICATION_EVIDENCE_TYPEOF = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const PUBLICATION_EVIDENCE_TEXT = Object.freeze({
  EMPTY: '',
  FALSE: 'false',
  VALUE_SEPARATOR: '|',
});
const PUBLICATION_EVIDENCE_EMPTY_RECORD = Object.freeze({});
const PUBLICATION_EVIDENCE_STALE_PUBLICATION_FIELD_NAMES = Object.freeze(
  new Set([
    'closureRecordId',
    'closureWitnessClass',
    'priorityRecoveryClosureState',
    'priorityRecoveryClosureWitness',
    'publicationRecoveryGate',
  ]),
);
const PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY =
  Object.freeze({
    unresolvedClassIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    unresolvedClassCount: PUBLICATION_EVIDENCE_ZERO,
    unresolvedSemanticStateIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    unresolvedSemanticStateCount: PUBLICATION_EVIDENCE_ZERO,
    blockedPartitionIds: PUBLICATION_EVIDENCE_EMPTY_LIST,
    blockedPartitionCount: PUBLICATION_EVIDENCE_ZERO,
    blockerPartitionIdsByReason: PUBLICATION_EVIDENCE_EMPTY_RECORD,
    partitionIdsBySemanticState: PUBLICATION_EVIDENCE_EMPTY_RECORD,
    partitionBlockerHistory: PUBLICATION_EVIDENCE_EMPTY_LIST,
  });
const PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_DECISION_SNAPSHOTS =
  Object.freeze({
    snapshots: PUBLICATION_EVIDENCE_EMPTY_LIST,
  });

function isRecord(value) {
  return Boolean(value) &&
    typeof value === PUBLICATION_EVIDENCE_TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || PUBLICATION_EVIDENCE_TEXT.EMPTY).trim())
        .filter((value) => value.length > PUBLICATION_EVIDENCE_ZERO),
    )],
  );
}

function normalizePublicationEpoch(value) {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeOptionalString(value) {
  return typeof value === PUBLICATION_EVIDENCE_TYPEOF.STRING &&
    value.trim().length > PUBLICATION_EVIDENCE_ZERO ?
    value.trim() :
    null;
}

function shouldClearStaleActiveGatePrioritySpreadClosure({
  closureRecordId = null,
  closureWitnessClass = null,
  gateReasons = PUBLICATION_EVIDENCE_EMPTY_LIST,
  prioritySpreadSatisfied = null,
  snapshotCoverageComplete = false,
} = {}) {
  return closureRecordId === PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD &&
    closureWitnessClass ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
        .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING &&
    normalizeDistinctStringArray(gateReasons).length ===
      PUBLICATION_EVIDENCE_ZERO &&
    prioritySpreadSatisfied === true &&
    snapshotCoverageComplete !== true;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeExplicitFalse(value) {
  return value === false ||
    value === PUBLICATION_EVIDENCE_TEXT.FALSE;
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= PUBLICATION_EVIDENCE_ZERO ?
    value :
    null;
}

function pendingAckEvidenceAllowsOwnerReconcileNarrowing({
  pendingAckCount = PUBLICATION_EVIDENCE_ZERO,
  pendingAckNodeIds = PUBLICATION_EVIDENCE_EMPTY_LIST,
  pendingAckEvidenceState = null,
} = {}) {
  const normalizedPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  if (
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    normalizedPendingAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO
  ) {
    return true;
  }
  return pendingAckEvidenceState ===
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    normalizedPendingAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO;
}

function resolveOwnerReconcileHandoffMissingPublishedNodeIds({
  activeGateProgress = null,
  publicationStatus = null,
  pendingAckCount = PUBLICATION_EVIDENCE_ZERO,
  pendingAckNodeIds = PUBLICATION_EVIDENCE_EMPTY_LIST,
  pendingAckEvidenceState = null,
} = {}) {
  if (
    !isRecord(activeGateProgress) ||
    publicationStatus !== PUBLICATION_EVIDENCE_PUBLICATION_STATUS_OPEN ||
    pendingAckEvidenceAllowsOwnerReconcileNarrowing({
      pendingAckCount,
      pendingAckNodeIds,
      pendingAckEvidenceState,
    }) !== true
  ) {
    return PUBLICATION_EVIDENCE_EMPTY_LIST;
  }
  const matchesOwnerReconcileHandoff = [
    activeGateProgress[
      PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD.STATE
    ] === PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF.STATE_PENDING,
    activeGateProgress[
      PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD.REASON_CODE
    ] ===
      PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF
        .REASON_OWNER_RECONCILE_PENDING,
    activeGateProgress[
      PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD.NEXT_ACTION
    ] ===
      PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF
        .ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    normalizeExplicitFalse(
      activeGateProgress[
        PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD
          .RUNTIME_PROMOTION_ALLOWED
      ],
    ),
  ].every(Boolean);
  return matchesOwnerReconcileHandoff ?
    normalizeDistinctStringArray(
      activeGateProgress[
        PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD
          .PENDING_RECONCILE_NODE_IDS
      ],
    ) :
    PUBLICATION_EVIDENCE_EMPTY_LIST;
}

function normalizePositiveInteger(value) {
  return Number.isInteger(value) && value > PUBLICATION_EVIDENCE_ZERO ?
    value :
    null;
}

function omitStalePublicationFields(record = null) {
  if (!isRecord(record)) {
    return {};
  }
  const filteredRecord = {};
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    if (PUBLICATION_EVIDENCE_STALE_PUBLICATION_FIELD_NAMES.has(fieldName)) {
      continue;
    }
    filteredRecord[fieldName] = fieldValue;
  }
  return filteredRecord;
}

function hasStaleGenericPublicationEpochClosure({
  publicationStatus = null,
  pendingAckCount = PUBLICATION_EVIDENCE_ZERO,
  gateReasons = PUBLICATION_EVIDENCE_EMPTY_LIST,
  priorityRecoveryObservation = null,
  publicationConvergenceGate = null,
} = {}) {
  const closureRecordId =
    normalizeOptionalString(priorityRecoveryObservation?.closureRecordId) ||
    normalizeOptionalString(publicationConvergenceGate?.closureRecordId) ||
    normalizeOptionalString(
      publicationConvergenceGate?.priorityRecoveryClosureWitness
        ?.closureRecordId,
    );
  const closureWitnessClass =
    normalizeOptionalString(priorityRecoveryObservation?.closureWitnessClass) ||
    normalizeOptionalString(publicationConvergenceGate?.closureWitnessClass) ||
    normalizeOptionalString(
      publicationConvergenceGate?.priorityRecoveryClosureWitness
        ?.closureWitnessClass,
    );
  const closureState =
    normalizeOptionalString(
      priorityRecoveryObservation?.priorityRecoveryClosureState,
    ) ||
    normalizeOptionalString(
      publicationConvergenceGate?.priorityRecoveryClosureWitness?.state,
    );
  const stalePublicationClosure =
    closureState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION ||
    (
      closureRecordId ===
        PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD &&
      closureWitnessClass ===
        PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
          .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING
    );
  return stalePublicationClosure === true &&
    publicationStatus === PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO &&
    hasOnlyGenericPublicationEpochGateReason(gateReasons) &&
    normalizeDistinctStringArray(gateReasons).some((reason) =>
      isPublicationMissingActiveGateReason(reason),
    ) !== true;
}

function resolvePendingRequiredAckNodeIds(pendingAckSource = null) {
  if (
    !Array.isArray(pendingAckSource?.requiredAckNodeIds) ||
    !Array.isArray(pendingAckSource?.acknowledgedNodeIds)
  ) {
    return null;
  }
  const acknowledgedNodeIdSet = new Set(
    normalizeDistinctStringArray(pendingAckSource.acknowledgedNodeIds),
  );
  const requiredAckNodeIds = normalizeDistinctStringArray(
    pendingAckSource.requiredAckNodeIds,
  );
  return requiredAckNodeIds.length > PUBLICATION_EVIDENCE_ZERO ?
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)) :
    null;
}

function hasPublishedPendingAckNodeListClosure(pendingAckSource = null) {
  const publicationStatus =
    normalizeOptionalString(pendingAckSource?.publicationStatus) ||
    normalizeOptionalString(pendingAckSource?.status);
  const pendingAckNodeIds = normalizeDistinctStringArray(
    pendingAckSource?.pendingAckNodeIds,
  );
  const pendingAckCount =
    normalizeNonNegativeInteger(pendingAckSource?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  return publicationStatus ===
      PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED &&
    Array.isArray(pendingAckSource?.pendingAckNodeIds) &&
    pendingAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO &&
    pendingAckCount > PUBLICATION_EVIDENCE_ZERO;
}

function hasPendingAckNodeListClosure(pendingAckSource = null) {
  const pendingAckNodeIds = normalizeDistinctStringArray(
    pendingAckSource?.pendingAckNodeIds,
  );
  const pendingAckCount =
    normalizeNonNegativeInteger(pendingAckSource?.pendingAckCount) ??
    PUBLICATION_EVIDENCE_ZERO;
  return Array.isArray(pendingAckSource?.pendingAckNodeIds) &&
    pendingAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO &&
    pendingAckCount === PUBLICATION_EVIDENCE_ZERO;
}

function hasCurrentActiveGatePendingAckClosure(progress = null) {
  if (!isRecord(progress)) {
    return false;
  }
  const pendingAckNodeIds = Array.isArray(progress.pendingAckNodeIds) ?
    normalizeDistinctStringArray(progress.pendingAckNodeIds) :
    null;
  const pendingRequiredAckNodeIds = resolvePendingRequiredAckNodeIds(progress);
  const closureEvidence = Object.freeze({
    countClosed:
      normalizeNonNegativeInteger(progress.pendingAckCount) ===
      PUBLICATION_EVIDENCE_ZERO,
    nodeListClosed:
      pendingAckNodeIds !== null &&
      pendingAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO,
    requiredAckListClosed:
      pendingRequiredAckNodeIds !== null &&
      pendingRequiredAckNodeIds.length === PUBLICATION_EVIDENCE_ZERO,
    countOnlyClosed:
      pendingAckNodeIds === null && pendingRequiredAckNodeIds === null,
  });
  return (
    closureEvidence.countClosed === true &&
    (
      closureEvidence.nodeListClosed === true ||
      closureEvidence.requiredAckListClosed === true ||
      closureEvidence.countOnlyClosed === true
    )
  );
}

function resolveCurrentPendingAckNodeIds({
  progress = null,
  priorityRecoveryObservation = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
} = {}) {
  const pendingAckNodeIdSources = [
    publicationConvergenceGate,
    publicationConvergence,
    priorityRecoveryObservation,
    progress,
  ];
  for (const pendingAckSource of pendingAckNodeIdSources) {
    if (!Array.isArray(pendingAckSource?.pendingAckNodeIds)) {
      continue;
    }
    const pendingAckNodeIds = normalizeDistinctStringArray(
      pendingAckSource.pendingAckNodeIds,
    );
    if (pendingAckNodeIds.length > PUBLICATION_EVIDENCE_ZERO) {
      return pendingAckNodeIds;
    }
    if (hasPublishedPendingAckNodeListClosure(pendingAckSource)) {
      return pendingAckNodeIds;
    }
    if (hasPendingAckNodeListClosure(pendingAckSource)) {
      return pendingAckNodeIds;
    }
    const pendingRequiredAckNodeIds =
      resolvePendingRequiredAckNodeIds(pendingAckSource);
    if (pendingRequiredAckNodeIds !== null) {
      return pendingRequiredAckNodeIds;
    }
  }
  return null;
}

function filterPublicationDerivedBlockers(blockers = []) {
  return normalizeDistinctStringArray(blockers).filter((blocker) =>
    blocker !== PUBLICATION_EVIDENCE_READY_BLOCKER &&
    !blocker.startsWith(
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX.PUBLICATION_GATE,
    ) &&
    !blocker.startsWith(
      PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX
        .PRIORITY_RECOVERY_PROGRESS_CLASS,
    ),
  );
}

function isPublicationMembershipGateReason(reason) {
  return reason ===
    PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON.PUBLICATION_EPOCH_PENDING ||
    reason.startsWith(
      PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON.PENDING_ACK_PREFIX,
    ) ||
    reason.startsWith(
      PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON
        .MISSING_ACTIVE_NODE_PREFIX,
    );
}

function hasPublicationMembershipGateReason(reasons) {
  return normalizeDistinctStringArray(reasons).some((reason) =>
    isPublicationMembershipGateReason(reason),
  );
}

function isPublicationPendingAckGateReason(reason) {
  return String(reason || PUBLICATION_EVIDENCE_TEXT.EMPTY).startsWith(
    PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON.PENDING_ACK_PREFIX,
  );
}

function isPublicationMissingActiveGateReason(reason) {
  return String(reason || PUBLICATION_EVIDENCE_TEXT.EMPTY).startsWith(
    PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON.MISSING_ACTIVE_NODE_PREFIX,
  );
}

function hasOnlyGenericPublicationEpochGateReason(reasons) {
  const normalizedReasons = normalizeDistinctStringArray(reasons);
  return normalizedReasons.length > PUBLICATION_EVIDENCE_ZERO &&
    normalizedReasons.every((reason) =>
      reason ===
        PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON.PUBLICATION_EPOCH_PENDING,
    );
}

function resolvePublicationGateReasons({
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  progress = null,
} = {}) {
  const reasonCandidates = [
    publicationConvergenceGate?.reasons,
    publicationConvergenceGate?.reasonCodes,
    priorityRecoveryObservation?.publicationConvergenceGateReasons,
    progress?.gateReasons,
  ];
  for (const candidate of reasonCandidates) {
    const reasons = normalizeDistinctStringArray(candidate);
    if (reasons.length > PUBLICATION_EVIDENCE_ZERO) {
      return reasons;
    }
  }
  return PUBLICATION_EVIDENCE_EMPTY_LIST;
}

function resolveActiveGateProgressGateReasons({
  publicationConvergenceGate = null,
  priorityRecoveryObservation = null,
  progress = null,
} = {}) {
  return Array.isArray(progress?.gateReasons) ?
    normalizeDistinctStringArray(progress.gateReasons) :
    resolvePublicationGateReasons({
      publicationConvergenceGate,
      priorityRecoveryObservation,
      progress,
    });
}

function resolveRawPublicationConvergenceGate(controlPlane = null) {
  if (isRecord(controlPlane?.publicationConvergenceGate)) {
    return controlPlane.publicationConvergenceGate;
  }
  if (isRecord(controlPlane?.publicationConvergence?.publicationRecoveryGate)) {
    return controlPlane.publicationConvergence.publicationRecoveryGate;
  }
  return null;
}


export {
  PUBLICATION_EVIDENCE_EMPTY_LIST,
  PUBLICATION_EVIDENCE_ZERO,
  PUBLICATION_EVIDENCE_READY_BLOCKER,
  PUBLICATION_EVIDENCE_PUBLICATION_STATUS_OPEN,
  PUBLICATION_EVIDENCE_PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_EVIDENCE_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
  PUBLICATION_EVIDENCE_PUBLICATION_GATE_REASON,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_BLOCKER_PREFIX,
  PUBLICATION_EVIDENCE_SOURCE_SELECTION,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_STATE,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_PUBLICATION_MEMBERSHIP_RULES,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_EVIDENCE_ACTIVE_GATE_HANDOFF,
  PUBLICATION_EVIDENCE_TYPEOF,
  PUBLICATION_EVIDENCE_TEXT,
  PUBLICATION_EVIDENCE_EMPTY_RECORD,
  PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_CURRENT_SUMMARY,
  PUBLICATION_EVIDENCE_CLOSED_PRIORITY_RECOVERY_DECISION_SNAPSHOTS,
  isRecord,
  normalizeDistinctStringArray,
  normalizePublicationEpoch,
  normalizeOptionalString,
  shouldClearStaleActiveGatePrioritySpreadClosure,
  normalizeBoolean,
  normalizeExplicitFalse,
  normalizeNonNegativeInteger,
  pendingAckEvidenceAllowsOwnerReconcileNarrowing,
  resolveOwnerReconcileHandoffMissingPublishedNodeIds,
  normalizePositiveInteger,
  omitStalePublicationFields,
  hasStaleGenericPublicationEpochClosure,
  resolvePendingRequiredAckNodeIds,
  hasPublishedPendingAckNodeListClosure,
  hasPendingAckNodeListClosure,
  hasCurrentActiveGatePendingAckClosure,
  resolveCurrentPendingAckNodeIds,
  filterPublicationDerivedBlockers,
  isPublicationMembershipGateReason,
  hasPublicationMembershipGateReason,
  isPublicationPendingAckGateReason,
  isPublicationMissingActiveGateReason,
  hasOnlyGenericPublicationEpochGateReason,
  resolvePublicationGateReasons,
  resolveActiveGateProgressGateReasons,
  resolveRawPublicationConvergenceGate,
};
