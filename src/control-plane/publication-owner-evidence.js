import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
  PUBLICATION_OWNER_PRESSURE_STATE,
  PUBLICATION_OWNER_REVISION_NUMBER,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';

const PUBLICATION_OWNER_EVIDENCE_EMPTY_LIST = Object.freeze([]);

const PUBLICATION_OWNER_REVISION_INPUT_FIELD = Object.freeze({
  COMMITTED_PUBLICATION_REVISION: 'committedPublicationRevision',
  COMMITTED_REVISION: 'committedRevision',
  DESIRED_PUBLICATION_REVISION: 'desiredPublicationRevision',
  DESIRED_REVISION: 'desiredRevision',
  OBSERVED_PUBLICATION_REVISION: 'observedPublicationRevision',
  OBSERVED_REVISION: 'observedRevision',
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_REVISION: 'publicationRevision',
  PUBLISHED_PUBLICATION_REVISION: 'publishedPublicationRevision',
});

const PUBLICATION_OWNER_PRESSURE_INPUT_FIELD = Object.freeze({
  PRESSURE_COALESCED: 'pressureCoalesced',
  PRESSURE_DEFERRED: 'pressureDeferred',
  PRESSURE_REASON_CODES: 'pressureReasonCodes',
  PRESSURE_RETRY_AFTER_MS: 'pressureRetryAfterMs',
  PRESSURE_STATE: 'pressureState',
  PUBLICATION_PRESSURE_DEFERRED: 'publicationPressureDeferred',
  REPAIR_DEFERRED: 'repairDeferred',
  RETRY_AFTER_MS: 'retryAfterMs',
});

function isPublicationOwnerRecord(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value);
}

function normalizePublicationOwnerString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    PUBLICATION_OWNER_TEXT.EMPTY;
}

function normalizePublicationOwnerStatus(value) {
  const normalizedStatus = normalizePublicationOwnerString(value).toUpperCase();
  return normalizedStatus.length > 0 ?
    normalizedStatus :
    PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function normalizePublicationOwnerNodeIds(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : PUBLICATION_OWNER_EVIDENCE_EMPTY_LIST)
        .map((value) => normalizePublicationOwnerString(value))
        .filter((value) => value.length > 0),
    )].sort(),
  );
}

function normalizePublicationOwnerNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ?
    Math.floor(numericValue) :
    0;
}

function isKnownPublicationOwnerPressureState(value) {
  return Object.values(PUBLICATION_OWNER_PRESSURE_STATE).includes(value);
}

function normalizePublicationOwnerPressureState(value) {
  return isKnownPublicationOwnerPressureState(value) ?
    value :
    PUBLICATION_OWNER_PRESSURE_STATE.NONE;
}

function resolvePublicationOwnerPressureEvidence(options = {}) {
  const requestedState = normalizePublicationOwnerPressureState(
    options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PRESSURE_STATE],
  );
  const coalesced =
    options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PRESSURE_COALESCED] ===
      true ||
    requestedState === PUBLICATION_OWNER_PRESSURE_STATE.COALESCED;
  const deferred =
    coalesced ||
    options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PRESSURE_DEFERRED] ===
      true ||
    options[
      PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PUBLICATION_PRESSURE_DEFERRED
    ] === true ||
    options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.REPAIR_DEFERRED] === true ||
    requestedState === PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED;
  const state = coalesced ?
    PUBLICATION_OWNER_PRESSURE_STATE.COALESCED :
    deferred ?
      PUBLICATION_OWNER_PRESSURE_STATE.DEFERRED :
      PUBLICATION_OWNER_PRESSURE_STATE.NONE;
  return Object.freeze({
    state,
    deferred,
    coalesced,
    retryAfterMs: deferred ?
      normalizePublicationOwnerNonNegativeInteger(
        options[
          PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PRESSURE_RETRY_AFTER_MS
        ] ??
          options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.RETRY_AFTER_MS],
      ) :
      0,
    reasonCodes: normalizePublicationOwnerNodeIds(
      options[PUBLICATION_OWNER_PRESSURE_INPUT_FIELD.PRESSURE_REASON_CODES],
    ),
  });
}

function normalizePublicationOwnerRevision(value) {
  const numericValue = Number(value);
  const revisionAvailable =
    Number.isFinite(numericValue) &&
    numericValue >= PUBLICATION_OWNER_REVISION_NUMBER.MINIMUM_AVAILABLE;
  return Object.freeze({
    state: revisionAvailable ?
      PUBLICATION_OWNER_REVISION_STATE.CURRENT :
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    value: revisionAvailable ?
      Math.floor(numericValue) :
      PUBLICATION_OWNER_REVISION_NUMBER.UNAVAILABLE,
  });
}

function readFirstPublicationOwnerValue(values = []) {
  return values.find((value) =>
    value !== null && typeof value !== 'undefined',
  );
}

function normalizePublicationOwnerRevisionInputs(options = {}) {
  const observedRevisionValue = readFirstPublicationOwnerValue([
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD
      .OBSERVED_PUBLICATION_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.OBSERVED_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.PUBLICATION_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.PUBLICATION_EPOCH],
  ]);
  const desiredRevisionValue = readFirstPublicationOwnerValue([
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.DESIRED_PUBLICATION_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.DESIRED_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.PUBLICATION_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.PUBLICATION_EPOCH],
  ]);
  const status = normalizePublicationOwnerStatus(
    options.publicationStatus ?? options.status,
  );
  const committedFallbackValue =
    status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
      desiredRevisionValue :
      options[PUBLICATION_OWNER_REVISION_INPUT_FIELD
        .PUBLISHED_PUBLICATION_REVISION];
  const committedRevisionValue = readFirstPublicationOwnerValue([
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD
      .COMMITTED_PUBLICATION_REVISION],
    options[PUBLICATION_OWNER_REVISION_INPUT_FIELD.COMMITTED_REVISION],
    committedFallbackValue,
  ]);

  return Object.freeze({
    observedRevision: normalizePublicationOwnerRevision(observedRevisionValue),
    desiredRevision: normalizePublicationOwnerRevision(desiredRevisionValue),
    committedRevision:
      normalizePublicationOwnerRevision(committedRevisionValue),
  });
}

function resolvePublicationOwnerPendingAckNodeIds(
  requiredAckNodeIds,
  acknowledgedNodeIds,
) {
  const acknowledgedNodeIdSet = new Set(acknowledgedNodeIds);
  return Object.freeze(
    requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function hasPublishedPublicationOwnerClosedPendingAckList(options = {}) {
  const explicitPendingAckNodeIds = normalizePublicationOwnerNodeIds(
    options.pendingAckNodeIds,
  );
  return options.publicationStatus ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === 0;
}

function hasOpenPublicationOwnerCountOnlyPendingAckList(options = {}) {
  const explicitPendingAckNodeIds = normalizePublicationOwnerNodeIds(
    options.pendingAckNodeIds,
  );
  return options.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.OPEN &&
    Array.isArray(options.pendingAckNodeIds) &&
    explicitPendingAckNodeIds.length === 0;
}

function resolvePublicationOwnerAckEvidenceState(options = {}) {
  const explicitPendingAckNodeIds = normalizePublicationOwnerNodeIds(
    options.pendingAckNodeIds,
  );
  const pendingAckCount = Number.isFinite(Number(options.pendingAckCount)) ?
    Number(options.pendingAckCount) :
    0;
  // Count-only debt only applies when the CALLER explicitly declares the
  // COUNT_ONLY evidence state. An empty pending-ack list with a stale positive
  // count (no declared state) must defer to the authoritative empty list — that
  // is the published-empty-pending-ACK contract. (54db83b9 introduced this flag
  // unconditionally, over-firing for the no-declared-state path.)
  const hasCountOnlyDebt =
    options.pendingAckEvidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    explicitPendingAckNodeIds.length === 0 &&
    pendingAckCount > 0;

  if (hasPublishedPublicationOwnerClosedPendingAckList(options) && !hasCountOnlyDebt) {
    return PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST;
  }
  if (
    options.pendingAckEvidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY
  ) {
    return PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY;
  }
  if (
    options.pendingAckEvidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST
  ) {
    return PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST;
  }
  const requiredAckNodeIds = normalizePublicationOwnerNodeIds(
    options.requiredAckNodeIds,
  );
  return Array.isArray(options.requiredAckNodeIds) &&
    (
      requiredAckNodeIds.length > 0 ||
      explicitPendingAckNodeIds.length === 0
    ) &&
    !hasCountOnlyDebt ?
    PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST :
    PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY;
}

function buildPublicationOwnerAckEvidence(options = {}) {
  const evidenceState = resolvePublicationOwnerAckEvidenceState(options);
  const requiredAckNodeIds = normalizePublicationOwnerNodeIds(
    options.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = normalizePublicationOwnerNodeIds(
    options.acknowledgedNodeIds,
  );
  const explicitPendingAckNodeIds = normalizePublicationOwnerNodeIds(
    options.pendingAckNodeIds,
  );
  const derivedPendingAckNodeIds =
    evidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST ?
      resolvePublicationOwnerPendingAckNodeIds(
        requiredAckNodeIds,
        acknowledgedNodeIds,
      ) :
      PUBLICATION_OWNER_EVIDENCE_EMPTY_LIST;
  const pendingAckNodeIds =
    evidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST ?
      derivedPendingAckNodeIds :
      explicitPendingAckNodeIds.length > 0 ?
        explicitPendingAckNodeIds :
        derivedPendingAckNodeIds;
  const countOnlyPendingAckCount =
    hasOpenPublicationOwnerCountOnlyPendingAckList(options) ?
      0 :
      Math.max(
        pendingAckNodeIds.length,
        normalizePublicationOwnerNonNegativeInteger(options.pendingAckCount),
      );
  const pendingAckCountByEvidenceState = Object.freeze({
    [PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      countOnlyPendingAckCount,
    [PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST]:
      pendingAckNodeIds.length,
  });

  return Object.freeze({
    evidenceState,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    pendingAckCount: pendingAckCountByEvidenceState[evidenceState],
  });
}

function buildPublicationOwnerEvidence(options = {}) {
  const revisionEvidence = normalizePublicationOwnerRevisionInputs(options);
  const publicationStatus = normalizePublicationOwnerStatus(
    options.publicationStatus ?? options.status,
  );
  const ackEvidence = buildPublicationOwnerAckEvidence({
    ...options,
    publicationStatus,
  });
  const missingPublishedNodeIds = normalizePublicationOwnerNodeIds(
    options.missingPublishedNodeIds ??
      options.missingPublishedRecoveryActiveNodeIds,
  );
  const pressureEvidence = resolvePublicationOwnerPressureEvidence(options);

  return Object.freeze({
    ...revisionEvidence,
    publicationStatus,
    publicationObservationState: normalizePublicationOwnerString(
      options.publicationObservationState,
    ),
    recoveryProtocolState: normalizePublicationOwnerString(
      options.recoveryProtocolState,
    ),
    publicationPendingHint: options.publicationPendingHint === true ||
      options.publicationPending === true,
    prioritySpreadPending: options.prioritySpreadPending === true,
    prioritySpreadEvidenceUnavailable:
      options.prioritySpreadEvidenceUnavailable === true,
    pressureState: pressureEvidence.state,
    pressureDeferred: pressureEvidence.deferred,
    pressureCoalesced: pressureEvidence.coalesced,
    pressureRetryAfterMs: pressureEvidence.retryAfterMs,
    pressureReasonCodes: pressureEvidence.reasonCodes,
    requiredAckNodeIds: ackEvidence.requiredAckNodeIds,
    acknowledgedNodeIds: ackEvidence.acknowledgedNodeIds,
    pendingAckNodeIds: ackEvidence.pendingAckNodeIds,
    pendingAckCount: ackEvidence.pendingAckCount,
    pendingAckEvidenceState: ackEvidence.evidenceState,
    missingPublishedNodeIds,
    missingPublishedCount: Math.max(
      missingPublishedNodeIds.length,
      normalizePublicationOwnerNonNegativeInteger(
        options.missingPublishedCount,
      ),
    ),
    priorityRecoveryReasonCodes: normalizePublicationOwnerNodeIds(
      options.priorityRecoveryReasonCodes ?? options.reasonCodes,
    ),
    source: isPublicationOwnerRecord(options.source) ?
      Object.freeze({...options.source}) :
      Object.freeze({}),
  });
}

export {
  PUBLICATION_OWNER_EVIDENCE_EMPTY_LIST,
  buildPublicationOwnerAckEvidence,
  buildPublicationOwnerEvidence,
  isPublicationOwnerRecord,
  normalizePublicationOwnerNodeIds,
  normalizePublicationOwnerNonNegativeInteger,
  normalizePublicationOwnerRevision,
  normalizePublicationOwnerStatus,
  normalizePublicationOwnerString,
};
