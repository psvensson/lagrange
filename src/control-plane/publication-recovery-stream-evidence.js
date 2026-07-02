import {
  EMPTY_STRING,
  LOCAL_STR_EMPTY,
  PUBLICATION_OWNER_STREAM_VALID_VALUES,
  PUBLICATION_PRIORITY_SPREAD_AUTHORITATIVE_DECISION_SOURCE_SET,
  PUBLICATION_RECOVERY_GATE_EMPTY_LIST,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES,
} from './publication-recovery-gate-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_PRESSURE_STATE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_SEMANTIC_OWNER,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';
import {
  isPublicationOwnerStreamPublicationPending,
} from './publication-owner-state.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from './membership-lifecycle-constants.js';

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    null;
}

function normalizeDistinctStringArray(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || LOCAL_STR_EMPTY).trim())
        .filter((value) => value.length > 0),
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
  return publicationStatusNormalized.length > 0 &&
    publicationStatusNormalized !== PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function hasCountOnlyMissingPublishedDebt(
  publicationOwnerStream,
  missingPublishedCount,
) {
  return normalizeNonNegativeInteger(missingPublishedCount) > 0 &&
    normalizeDistinctStringArray(
      publicationOwnerStream?.missingPublishedNodeIds,
    ).length === 0;
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
    (
      publicationOwnerStream?.ackState ===
        PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED ||
      publicationOwnerStream?.ackState ===
        PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE
    ) &&
    normalizeNonNegativeInteger(pendingAckCount) === 0 &&
    (
      normalizeNonNegativeInteger(missingPublishedCount) === 0 ||
      hasCountOnlyMissingPublishedDebt(
        publicationOwnerStream,
        missingPublishedCount,
      )
    ) &&
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
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function normalizeOptionalNonNegativeInteger(value, fallbackValue) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ?
    Math.floor(normalizedValue) :
    fallbackValue;
}

function normalizePublicationPressureState(value) {
  return Object.values(PUBLICATION_OWNER_PRESSURE_STATE).includes(value) ?
    value :
    PUBLICATION_OWNER_PRESSURE_STATE.NONE;
}

function isPublicationOwnerStreamRecord(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
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

function resolvePublicationPressureEvidence(
  publicationOwnerStream = null,
  options = {},
) {
  const streamPressureState = normalizePublicationPressureState(
    publicationOwnerStream?.pressureState,
  );
  const optionPressureState = normalizePublicationPressureState(
    options.pressureState,
  );
  const pressureCoalesced =
    publicationOwnerStream?.pressureCoalesced === true ||
    options.pressureCoalesced === true ||
    streamPressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED ||
    optionPressureState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED;
  const pressureDeferred =
    pressureCoalesced ||
    publicationOwnerStream?.pressureDeferred === true ||
    options.pressureDeferred === true ||
    streamPressureState === PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED ||
    optionPressureState === PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED;
  const pressureState = pressureCoalesced ?
    PUBLICATION_OWNER_PRESSURE_STATE.COALESCED :
    pressureDeferred ?
      PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED :
      PUBLICATION_OWNER_PRESSURE_STATE.NONE;
  const streamRetryAfterMs = normalizeOptionalNonNegativeInteger(
    publicationOwnerStream?.pressureRetryAfterMs,
    null,
  );
  const optionRetryAfterMs = normalizeOptionalNonNegativeInteger(
    options.pressureRetryAfterMs ?? options.retryAfterMs,
    0,
  );

  return Object.freeze({
    pressureState,
    pressureDeferred,
    pressureCoalesced,
    pressureRetryAfterMs:
      pressureDeferred ?
        streamRetryAfterMs ?? optionRetryAfterMs :
        0,
    pressureReasonCodes: normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(
        publicationOwnerStream?.pressureReasonCodes,
      ),
      ...normalizeDistinctStringArray(options.pressureReasonCodes),
    ]),
  });
}

function hasAuthoritativePrioritySpreadDecision(options = {}) {
  return PUBLICATION_PRIORITY_SPREAD_AUTHORITATIVE_DECISION_SOURCE_SET.has(
    options.prioritySpreadDecisionSource,
  );
}

function resolvePublicationStreamPrioritySpreadPending(
  publicationOwnerStream,
  options = {},
) {
  return hasAuthoritativePrioritySpreadDecision(options) &&
    typeof options.prioritySpreadPending === 'boolean' ?
    options.prioritySpreadPending :
    typeof publicationOwnerStream?.prioritySpreadPending === 'boolean' ?
      publicationOwnerStream.prioritySpreadPending :
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING ?
        true :
        options.prioritySpreadPending;
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
    explicitPendingAckNodeIds.length === 0 &&
    normalizeNonNegativeInteger(options.pendingAckCount) === 0 &&
    normalizeNonNegativeInteger(options.missingPublishedCount) === 0 &&
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
    explicitPendingAckNodeIds.length === 0;
}

function hasOpenCountOnlyPendingAckEvidence(options = {}) {
  const openCountOnlyAckIsStale =
    options.openCountOnlyAckIsStale !== false;
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const publicationStatusNormalized = normalizePublicationStatus(
    options.publicationStatus,
  );
  return openCountOnlyAckIsStale &&
    publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.OPEN &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === 0;
}

function resolvePendingAckEvidenceState(options = {}) {
  const explicitPendingAckNodeIds = normalizeDistinctStringArray(
    options.pendingAckNodeIds,
  );
  const pendingAckCount = Number.isFinite(Number(options.pendingAckCount)) ?
    Number(options.pendingAckCount) :
    0;
  const hasCountOnlyDebt =
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    explicitPendingAckNodeIds.length === 0 &&
    pendingAckCount > 0;

  if (hasClosedPublishedPendingAckEvidence(options) && !hasCountOnlyDebt) {
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
  const hasRequiredAckNodeListEvidence =
    Array.isArray(options.requiredAckNodeIds) &&
    (
      requiredAckNodeIds.length > 0 ||
      explicitPendingAckNodeIds.length === 0
    ) &&
    !hasCountOnlyDebt;
  const hasClosedPendingAckNodeListEvidence =
    hasClosedUnpublishedPendingAckEvidence(options) && !hasCountOnlyDebt;
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
      explicitPendingAckNodeIds.length > 0 ?
        explicitPendingAckNodeIds :
        derivedPendingAckNodeIds;
  const countOnlyPendingAckCount =
    hasOpenCountOnlyPendingAckEvidence(options) ?
      0 :
      Math.max(
        pendingAckNodeIds.length,
        normalizeNonNegativeInteger(options.pendingAckCount),
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

function buildPublicationStreamCompatibilityEvidence(options = {}) {
  const publicationOwnerStream = options.publicationOwnerStream;
  const pendingAckEvidence = options.pendingAckEvidence;
  const fallbackMissingPublishedNodeIds = options.missingPublishedNodeIds;
  const pressureEvidence = resolvePublicationPressureEvidence(
    publicationOwnerStream,
    options,
  );
  const pressureDeferred = pressureEvidence.pressureDeferred === true;
  const requiredAckNodeIds = pressureDeferred ?
    PUBLICATION_RECOVERY_GATE_EMPTY_LIST :
    resolvePublicationOwnerStreamNodeIds(
      publicationOwnerStream?.requiredAckNodeIds,
      pendingAckEvidence.requiredAckNodeIds,
    );
  const acknowledgedNodeIds = pressureDeferred ?
    PUBLICATION_RECOVERY_GATE_EMPTY_LIST :
    resolvePublicationOwnerStreamNodeIds(
      publicationOwnerStream?.acknowledgedNodeIds,
      pendingAckEvidence.acknowledgedNodeIds,
    );
  const pendingAckNodeIds = pressureDeferred ?
    PUBLICATION_RECOVERY_GATE_EMPTY_LIST :
    resolvePublicationOwnerStreamNodeIds(
      publicationOwnerStream?.pendingAckNodeIds,
      pendingAckEvidence.pendingAckNodeIds,
    );
  const streamPendingAckCount = normalizeOptionalNonNegativeInteger(
    pressureDeferred ? 0 : publicationOwnerStream?.pendingAckCount,
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
  const missingPublishedNodeIds = pressureDeferred ?
    PUBLICATION_RECOVERY_GATE_EMPTY_LIST :
    resolvePublicationOwnerStreamNodeIds(
      publicationOwnerStream?.missingPublishedNodeIds,
      fallbackMissingPublishedNodeIds,
    );
  const streamMissingPublishedCount = normalizeOptionalNonNegativeInteger(
    pressureDeferred ? 0 : publicationOwnerStream?.missingPublishedCount,
    null,
  );
  const missingPublishedCount =
    streamMissingPublishedCount !== null ?
      Math.max(missingPublishedNodeIds.length, streamMissingPublishedCount) :
      Array.isArray(publicationOwnerStream?.missingPublishedNodeIds) ?
        missingPublishedNodeIds.length :
        options.missingPublishedCount;
  const prioritySpreadPending =
    resolvePublicationStreamPrioritySpreadPending(
      publicationOwnerStream,
      options,
    );
  const prioritySpreadEvidenceUnavailable =
    typeof publicationOwnerStream?.prioritySpreadEvidenceUnavailable ===
      'boolean' ?
      publicationOwnerStream.prioritySpreadEvidenceUnavailable :
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE ?
        true :
        options.prioritySpreadEvidenceUnavailable;
  const publicationPending = pressureDeferred ?
    false :
    options.publicationExcludesTargetNode === true ||
    isPublicationOwnerStreamPendingForRecoveryGate(
      publicationOwnerStream,
      pendingAckCount,
      missingPublishedCount,
    ) ||
      pendingAckCount > 0;
  const recoveryProtocolState = resolvePublicationRecoveryProtocolState({
    publicationOwnerStream,
    prioritySpreadPending,
    prioritySpreadEvidenceUnavailable,
    publicationExcludesTargetNode: options.publicationExcludesTargetNode === true,
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
    ackPending: pressureDeferred !== true &&
      (
        publicationOwnerStream?.ackState ===
        PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK ||
        pendingAckCount > 0
      ),
    prioritySpreadPending,
    prioritySpreadEvidenceUnavailable,
    ...pressureEvidence,
  });
}

function resolvePublicationRecoveryProtocolState(context = {}) {
  if (context.publicationExcludesTargetNode === true) {
    return RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING;
  }
  return PUBLICATION_RECOVERY_PROTOCOL_STREAM_RULES.find((rule) =>
    rule.matches(context),
  ).recoveryProtocolState;
}

export {
  buildPendingAckEvidence,
  buildPublicationStreamCompatibilityEvidence,
  hasPublicationStatusPendingMeaning,
  isPublicationOwnerStreamPendingForRecoveryGate,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizeOptionalNonNegativeInteger,
  normalizeOptionalString,
  normalizeProvidedPublicationOwnerStream,
  normalizePublicationStatus,
  resolvePublicationPressureEvidence,
  resolvePublicationRecoveryProtocolState,
};
