import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_SEMANTIC_OWNER,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';
import {
  buildPriorityRecoveryClosureWitness,
  hasPriorityRecoverySpreadGap,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from './priority-recovery-snapshot.js';

const LOCAL_STR_EMPTY = '';

const EMPTY_STRING = '';

const PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE = Object.freeze({
  CLOSURE_WITNESS: 'closure_witness',
  OWNER_EVIDENCE_UNAVAILABLE: 'owner_evidence_unavailable',
  PRIORITY_PARTITION_SUMMARY: 'priority_partition_summary',
});

const PUBLICATION_RECOVERY_GATE_STATE = Object.freeze({
  UNPUBLISHED_OBSERVATION: 'unpublished_observation',
  PUBLICATION_PENDING: 'publication_pending',
  ACK_PENDING: 'ack_pending',
  CONSUMER_LAG: 'consumer_lag',
  PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE:
    'priority_spread_evidence_unavailable',
  PRIORITY_SPREAD_PENDING: 'priority_spread_pending',
  READY: 'ready',
});

const PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE = Object.freeze({
  COUNT_ONLY: 'count_only',
  REQUIRED_ACK_NODE_LIST: 'required_ack_node_list',
});

const PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE = Object.freeze({
  DURABLE_SUMMARY_REFRESHED: 'durable_summary_refreshed',
  RETAINED: 'retained',
});

const PUBLICATION_RECOVERY_GATE_STREAM_RULES = Object.freeze([
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
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING,
  }),
  Object.freeze({
    state: PUBLICATION_RECOVERY_GATE_STATE.READY,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_STREAM_VALID_VALUES = Object.freeze({
  ACK_STATE: Object.freeze(Object.values(PUBLICATION_OWNER_ACK_STATE)),
  FRESHNESS_FENCE:
    Object.freeze(Object.values(PUBLICATION_OWNER_FRESHNESS_FENCE)),
  RECOVERY_OUTCOME:
    Object.freeze(Object.values(PUBLICATION_OWNER_RECOVERY_OUTCOME)),
  STREAM_OUTCOME: Object.freeze(Object.values(PUBLICATION_OWNER_STREAM_OUTCOME)),
});

const PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES = Object.freeze([
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
    matches: (context) =>
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING ||
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK ||
      context.publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
    matches: (context) =>
      context.prioritySpreadPending === true ||
      context.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
    matches: () => true,
  }),
]);

function normalizeOptionalString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || LOCAL_STR_EMPTY).trim())
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

function hasPublicationStatusPendingMeaning(publicationStatusNormalized) {
  return publicationStatusNormalized.length > NUM.ZERO &&
    publicationStatusNormalized !== PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function isClosedNotStartedPublicationOwnerStream(
  publicationOwnerStream,
  pendingAckCount,
  missingPublishedCount,
) {
  const publicationStatusNormalized = normalizePublicationStatus(
    publicationOwnerStream?.publicationStatus,
  );
  return publicationOwnerStream?.streamOutcome ===
    PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED &&
    publicationOwnerStream?.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED &&
    publicationOwnerStream?.ackState ===
      PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED &&
    normalizeNonNegativeInteger(pendingAckCount) === NUM.ZERO &&
    normalizeNonNegativeInteger(missingPublishedCount) === NUM.ZERO &&
    hasPublicationStatusPendingMeaning(publicationStatusNormalized) !== true;
}

function isPublicationOwnerStreamPendingForRecoveryGate(
  publicationOwnerStream,
  pendingAckCount,
  missingPublishedCount,
) {
  return isClosedNotStartedPublicationOwnerStream(
    publicationOwnerStream,
    pendingAckCount,
    missingPublishedCount,
  ) ?
    false :
    isPublicationOwnerStreamPublicationPending(publicationOwnerStream);
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function normalizeOptionalNonNegativeInteger(value, fallbackValue) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= NUM.ZERO ?
    Math.floor(normalizedValue) :
    fallbackValue;
}

function isPublicationOwnerStreamRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function isKnownPublicationOwnerStreamValue(value, knownValues) {
  return knownValues.includes(value);
}

function normalizeProvidedPublicationOwnerStream(value) {
  if (!isPublicationOwnerStreamRecord(value)) {
    return null;
  }
  const semanticOwnerMatches =
    value.semanticOwner === PUBLICATION_OWNER_SEMANTIC_OWNER;
  const streamOutcomeKnown = isKnownPublicationOwnerStreamValue(
    value.streamOutcome,
    PUBLICATION_OWNER_STREAM_VALID_VALUES.STREAM_OUTCOME,
  );
  const recoveryOutcomeKnown = isKnownPublicationOwnerStreamValue(
    value.recoveryOutcome,
    PUBLICATION_OWNER_STREAM_VALID_VALUES.RECOVERY_OUTCOME,
  );
  const ackStateKnown = isKnownPublicationOwnerStreamValue(
    value.ackState,
    PUBLICATION_OWNER_STREAM_VALID_VALUES.ACK_STATE,
  );
  const freshnessFenceKnown = isKnownPublicationOwnerStreamValue(
    value.freshnessFence,
    PUBLICATION_OWNER_STREAM_VALID_VALUES.FRESHNESS_FENCE,
  );
  return semanticOwnerMatches &&
    streamOutcomeKnown &&
    recoveryOutcomeKnown &&
    ackStateKnown &&
    freshnessFenceKnown ?
    value :
    null;
}

function resolvePublicationOwnerStreamString(value, fallbackValue) {
  const normalizedValue = normalizeOptionalString(value);
  return normalizedValue !== null ? normalizedValue : fallbackValue;
}

function resolvePublicationOwnerStreamNodeIds(value, fallbackValue) {
  return Array.isArray(value) ?
    normalizeDistinctStringArray(value) :
    fallbackValue;
}

function resolvePendingAckNodeIds(requiredAckNodeIds = [], acknowledgedNodeIds = []) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function hasClosedUnpublishedPendingAckEvidence(options = {}) {
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  return Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO &&
    normalizeNonNegativeInteger(options.pendingAckCount) === NUM.ZERO &&
    normalizeNonNegativeInteger(options.missingPublishedCount) === NUM.ZERO &&
    hasPublicationStatusPendingMeaning(publicationStatusNormalized) !== true &&
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
}

function hasClosedPublishedPendingAckEvidence(options = {}) {
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  return publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === NUM.ZERO;
}

function resolvePendingAckEvidenceState(options = {}) {
  if (hasClosedPublishedPendingAckEvidence(options)) {
    return PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
      .REQUIRED_ACK_NODE_LIST;
  }
  if (
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
  }
  if (
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST
  ) {
    return PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
      .REQUIRED_ACK_NODE_LIST;
  }
  const requiredAckNodeIds = normalizeDistinctStringArray(
    options.requiredAckNodeIds,
  );
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const hasRequiredAckNodeListEvidence =
    Array.isArray(options.requiredAckNodeIds) &&
    (
      requiredAckNodeIds.length > NUM.ZERO ||
      explicitPendingAckNodeIds.length === NUM.ZERO
    );
  const hasClosedPendingAckNodeListEvidence =
    hasClosedUnpublishedPendingAckEvidence(options);
  return hasRequiredAckNodeListEvidence ||
    hasClosedPendingAckNodeListEvidence ?
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST :
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
}

function buildPendingAckEvidence(options = {}) {
  const evidenceState = resolvePendingAckEvidenceState(options);
  const requiredAckNodeIds = normalizeDistinctStringArray(
    options.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = normalizeDistinctStringArray(
    options.acknowledgedNodeIds,
  );
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST ?
      resolvePendingAckNodeIds(requiredAckNodeIds, acknowledgedNodeIds) :
      Object.freeze([]);
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const pendingAckNodeIds =
    evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST ?
      derivedPendingAckNodeIds :
      explicitPendingAckNodeIds.length > NUM.ZERO ?
        explicitPendingAckNodeIds :
        derivedPendingAckNodeIds;
  const pendingAckCountByState = Object.freeze({
    [PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      Math.max(
        pendingAckNodeIds.length,
        normalizeNonNegativeInteger(options.pendingAckCount),
      ),
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

function buildPublicationStreamCompatibilityEvidence(options = {}) {
  const publicationOwnerStream = options.publicationOwnerStream;
  const pendingAckEvidence = options.pendingAckEvidence;
  const fallbackMissingPublishedNodeIds = options.missingPublishedNodeIds;
  const requiredAckNodeIds = resolvePublicationOwnerStreamNodeIds(
    publicationOwnerStream?.requiredAckNodeIds,
    pendingAckEvidence.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = resolvePublicationOwnerStreamNodeIds(
    publicationOwnerStream?.acknowledgedNodeIds,
    pendingAckEvidence.acknowledgedNodeIds,
  );
  const pendingAckNodeIds = resolvePublicationOwnerStreamNodeIds(
    publicationOwnerStream?.pendingAckNodeIds,
    pendingAckEvidence.pendingAckNodeIds,
  );
  const streamPendingAckCount = normalizeOptionalNonNegativeInteger(
    publicationOwnerStream?.pendingAckCount,
    null,
  );
  const streamPendingAckEvidence = buildPendingAckEvidence({
    publicationStatus:
      publicationOwnerStream?.publicationStatus ?? options.publicationStatus,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount:
      streamPendingAckCount !== null ?
        streamPendingAckCount :
        pendingAckEvidence.pendingAckCount,
    pendingAckEvidenceState:
      publicationOwnerStream?.pendingAckEvidenceState ??
      pendingAckEvidence.evidenceState,
  });
  const pendingAckCount = streamPendingAckEvidence.pendingAckCount;
  const missingPublishedNodeIds = resolvePublicationOwnerStreamNodeIds(
    publicationOwnerStream?.missingPublishedNodeIds,
    fallbackMissingPublishedNodeIds,
  );
  const streamMissingPublishedCount = normalizeOptionalNonNegativeInteger(
    publicationOwnerStream?.missingPublishedCount,
    null,
  );
  const missingPublishedCount =
    streamMissingPublishedCount !== null ?
      Math.max(missingPublishedNodeIds.length, streamMissingPublishedCount) :
      Array.isArray(publicationOwnerStream?.missingPublishedNodeIds) ?
        missingPublishedNodeIds.length :
        options.missingPublishedCount;
  const prioritySpreadPending =
    typeof publicationOwnerStream?.prioritySpreadPending === TYPEOF.BOOLEAN ?
      publicationOwnerStream.prioritySpreadPending :
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING ?
        true :
        options.prioritySpreadPending;
  const prioritySpreadEvidenceUnavailable =
    typeof publicationOwnerStream?.prioritySpreadEvidenceUnavailable ===
      TYPEOF.BOOLEAN ?
      publicationOwnerStream.prioritySpreadEvidenceUnavailable :
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE ?
        true :
        options.prioritySpreadEvidenceUnavailable;
  const publicationPending =
    isPublicationOwnerStreamPendingForRecoveryGate(
      publicationOwnerStream,
      pendingAckCount,
      missingPublishedCount,
    ) ||
    pendingAckCount > NUM.ZERO;
  const recoveryProtocolState = resolvePublicationRecoveryProtocolState({
    publicationOwnerStream,
    prioritySpreadPending,
    prioritySpreadEvidenceUnavailable,
  });

  return Object.freeze({
    publicationEpoch:
      normalizeOptionalNonNegativeInteger(
        publicationOwnerStream?.revision?.observed?.value,
        options.publicationEpoch,
      ),
    publicationStatus:
      resolvePublicationOwnerStreamString(
        publicationOwnerStream?.publicationStatus,
        options.publicationStatus,
      ),
    publicationObservationState:
      resolvePublicationOwnerStreamString(
        publicationOwnerStream?.publicationObservationState,
        options.publicationObservationState,
      ),
    recoveryProtocolState,
    requiredAckNodeIds: streamPendingAckEvidence.requiredAckNodeIds,
    acknowledgedNodeIds: streamPendingAckEvidence.acknowledgedNodeIds,
    pendingAckNodeIds: streamPendingAckEvidence.pendingAckNodeIds,
    pendingAckCount,
    pendingAckEvidenceState: streamPendingAckEvidence.evidenceState,
    missingPublishedNodeIds,
    missingPublishedCount,
    publicationPending,
    ackPending:
      publicationOwnerStream?.ackState ===
        PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK ||
      pendingAckCount > NUM.ZERO,
    prioritySpreadPending,
    prioritySpreadEvidenceUnavailable,
  });
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

function readPriorityRecoveryDecisionClosureWitness(
  priorityRecoveryDecisionSnapshots,
) {
  return normalizePriorityRecoveryClosureWitness(
    priorityRecoveryDecisionSnapshots?.closureWitness,
  );
}

function resolvePriorityClosureWitnessSummaryState(
  priorityRecoveryClosureWitness = null,
  durablePriorityPartitionSummary = null,
) {
  const summarySpreadPending =
    durablePriorityPartitionSummary ?
      hasPriorityRecoverySpreadGap(durablePriorityPartitionSummary) :
      null;
  const closureWitnessSatisfied =
    priorityRecoveryClosureWitness?.prioritySpreadPending === false;
  const stalePublicationWitness =
    priorityRecoveryClosureWitness?.publicationRefreshRequired === true ||
    priorityRecoveryClosureWitness?.state ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION;
  const durableSummaryRefreshed =
    closureWitnessSatisfied &&
    stalePublicationWitness &&
    summarySpreadPending === false;
  return durableSummaryRefreshed ?
    PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.DURABLE_SUMMARY_REFRESHED :
    PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.RETAINED;
}

function normalizePriorityClosureWitnessForDurableSummary(
  priorityRecoveryClosureWitness = null,
  durablePriorityPartitionSummary = null,
) {
  const normalizedPriorityRecoveryClosureWitness =
    normalizePriorityRecoveryClosureWitness(priorityRecoveryClosureWitness);
  if (!normalizedPriorityRecoveryClosureWitness) {
    return null;
  }
  const closureWitnessSummaryState =
    resolvePriorityClosureWitnessSummaryState(
      normalizedPriorityRecoveryClosureWitness,
      durablePriorityPartitionSummary,
    );
  if (
    closureWitnessSummaryState !==
      PRIORITY_CLOSURE_WITNESS_SUMMARY_STATE.DURABLE_SUMMARY_REFRESHED
  ) {
    return normalizedPriorityRecoveryClosureWitness;
  }
  return Object.freeze({
    ...normalizedPriorityRecoveryClosureWitness,
    state: PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH,
    publicationRefreshRequired: false,
    closureRecordId: null,
    closureWitnessClass: null,
    refreshedPriorityPartitionSummary:
      normalizePriorityPartitionSummary(
        normalizedPriorityRecoveryClosureWitness
          .refreshedPriorityPartitionSummary,
      ) || durablePriorityPartitionSummary,
    summarySpreadPending: false,
  });
}

function requiresPrioritySpreadOwnerEvidence(options = {}) {
  const recoveryProtocolState = normalizeOptionalString(
    options.recoveryProtocolState,
  );
  if (
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING
  ) {
    return true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
  );
}

function buildPrioritySpreadDecision(options = {}) {
  const durablePriorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary,
  );
  const decisionSnapshotClosureWitness =
    readPriorityRecoveryDecisionClosureWitness(
      options.priorityRecoveryDecisionSnapshots,
    );
  const rawPriorityRecoveryClosureWitness = normalizePriorityRecoveryClosureWitness(
    options.priorityRecoveryClosureWitness,
  ) || decisionSnapshotClosureWitness || buildPriorityRecoveryClosureWitness({
    decisionSnapshots: options.priorityRecoveryDecisionSnapshots,
    priorityPartitionSummary: durablePriorityPartitionSummary,
  });
  const priorityRecoveryClosureWitness =
    normalizePriorityClosureWitnessForDurableSummary(
      rawPriorityRecoveryClosureWitness,
      durablePriorityPartitionSummary,
    );
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
  const prioritySpreadOwnerEvidenceRequired =
    requiresPrioritySpreadOwnerEvidence({
      recoveryProtocolState,
      reasonCodes,
    });
  const closureWitnessPrioritySpreadPending =
    typeof priorityRecoveryClosureWitness?.prioritySpreadPending === TYPEOF.BOOLEAN ?
      priorityRecoveryClosureWitness.prioritySpreadPending :
      null;
  const summaryPrioritySpreadPending =
    priorityPartitionSummary ?
      hasPriorityRecoverySpreadGap(priorityPartitionSummary) :
      null;
  const prioritySpreadEvidenceUnavailable =
    !priorityRecoveryClosureWitness &&
    !priorityPartitionSummary &&
    prioritySpreadOwnerEvidenceRequired === true;
  const decisionSource = priorityRecoveryClosureWitness ?
    PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.CLOSURE_WITNESS :
    priorityPartitionSummary ?
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY :
      PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.OWNER_EVIDENCE_UNAVAILABLE;

  return Object.freeze({
    decisionSource,
    priorityPartitionSummary,
    durablePriorityPartitionSummary,
    priorityRecoveryClosureWitness,
    prioritySpreadEvidenceUnavailable,
    prioritySpreadPending:
      priorityRecoveryClosureWitness ?
        closureWitnessPrioritySpreadPending :
        priorityPartitionSummary ?
          summaryPrioritySpreadPending :
          false,
  });
}

function shouldRetainPriorityRecoveryReasonCode(
  reasonCode,
  prioritySpreadDecision,
  prioritySpreadEvidenceUnavailableReasonActive,
  publicationEpochReasonActive,
) {
  if (
    reasonCode ===
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING
  ) {
    return publicationEpochReasonActive === true;
  }
  if (
    reasonCode !==
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD
  ) {
    return true;
  }
  if (prioritySpreadEvidenceUnavailableReasonActive === true) {
    return false;
  }
  return (
    prioritySpreadDecision.prioritySpreadPending === true ||
    prioritySpreadDecision.prioritySpreadEvidenceUnavailable === true
  );
}

function filterProvidedPriorityRecoveryReasonCodes(
  providedReasonCodes,
  prioritySpreadDecision,
  prioritySpreadEvidenceUnavailableReasonActive,
  publicationEpochReasonActive,
) {
  return Object.freeze(
    providedReasonCodes.filter((reasonCode) =>
      shouldRetainPriorityRecoveryReasonCode(
        reasonCode,
        prioritySpreadDecision,
        prioritySpreadEvidenceUnavailableReasonActive,
        publicationEpochReasonActive,
      ),
    ),
  );
}

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
  if (
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING ||
    recoveryProtocolState === RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION
  ) {
    return ackClosureSatisfied !== true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ?
    options.reasonCodes :
    [];
  return reasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  ) && ackClosureSatisfied !== true;
}

function resolvePublicationRecoveryGateState(context = {}) {
  return PUBLICATION_RECOVERY_GATE_STREAM_RULES.find((rule) =>
    rule.matches(context),
  ).state;
}

function resolvePublicationRecoveryProtocolState(context = {}) {
  return PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES.find((rule) =>
    rule.matches(context),
  ).recoveryProtocolState;
}

function buildPublicationRecoveryGateSnapshot(options = {}) {
  const pendingAckEvidence = buildPendingAckEvidence(options);
  const requiredAckNodeIds = pendingAckEvidence.requiredAckNodeIds;
  const acknowledgedNodeIds = pendingAckEvidence.acknowledgedNodeIds;
  const effectivePendingAckNodeIds = pendingAckEvidence.pendingAckNodeIds;
  const pendingAckCount = pendingAckEvidence.pendingAckCount;
  const providedPublicationOwnerStream = normalizeProvidedPublicationOwnerStream(
    options.publicationOwnerStream,
  );
  const ackClosureSatisfied =
    pendingAckEvidence.evidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST &&
    pendingAckCount === NUM.ZERO;
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    options.missingPublishedNodeIds ??
      options.missingPublishedRecoveryActiveNodeIds,
  );
  const missingPublishedCount = Math.max(
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
  const publicationPendingEvidenceActive = resolvePublicationPending({
    publicationStatus: options.publicationStatus,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: providedReasonCodes,
    missingPublishedCount,
    ackClosureSatisfied,
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
  const publicationPending = resolvePublicationPending({
    publicationStatus: options.publicationStatus,
    recoveryProtocolState: options.recoveryProtocolState,
    reasonCodes: retainedProvidedReasonCodes,
    missingPublishedCount,
    ackClosureSatisfied,
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
        }),
        prioritySpreadPending,
        prioritySpreadEvidenceUnavailable,
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
        }),
        requiredAckNodeIds,
        acknowledgedNodeIds,
        pendingAckNodeIds: effectivePendingAckNodeIds,
        pendingAckCount,
        pendingAckEvidenceState: pendingAckEvidence.evidenceState,
        missingPublishedNodeIds,
        missingPublishedCount,
        publicationPending: publicationPending || pendingAckCount > NUM.ZERO,
        ackPending: pendingAckCount > NUM.ZERO,
        prioritySpreadPending,
        prioritySpreadEvidenceUnavailable,
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
  });
}

export {
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
};
