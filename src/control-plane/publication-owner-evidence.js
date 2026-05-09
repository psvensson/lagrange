import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
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

function isPublicationOwnerRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizePublicationOwnerString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    PUBLICATION_OWNER_TEXT.EMPTY;
}

function normalizePublicationOwnerStatus(value) {
  const normalizedStatus = normalizePublicationOwnerString(value).toUpperCase();
  return normalizedStatus.length > NUM.ZERO ?
    normalizedStatus :
    PUBLICATION_OWNER_TEXT.UNKNOWN;
}

function normalizePublicationOwnerNodeIds(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : PUBLICATION_OWNER_EVIDENCE_EMPTY_LIST)
        .map((value) => normalizePublicationOwnerString(value))
        .filter((value) => value.length > NUM.ZERO),
    )].sort(),
  );
}

function normalizePublicationOwnerNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
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
    value !== null && typeof value !== TYPEOF.UNDEFINED,
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

function resolvePublicationOwnerAckEvidenceState(options = {}) {
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
  const explicitPendingAckNodeIds = normalizePublicationOwnerNodeIds(
    options.pendingAckNodeIds,
  );
  return Array.isArray(options.requiredAckNodeIds) &&
    (
      requiredAckNodeIds.length > NUM.ZERO ||
      explicitPendingAckNodeIds.length === NUM.ZERO
    ) ?
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
      explicitPendingAckNodeIds.length > NUM.ZERO ?
        explicitPendingAckNodeIds :
        derivedPendingAckNodeIds;
  const pendingAckCountByEvidenceState = Object.freeze({
    [PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY]:
      Math.max(
        pendingAckNodeIds.length,
        normalizePublicationOwnerNonNegativeInteger(options.pendingAckCount),
      ),
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
  const ackEvidence = buildPublicationOwnerAckEvidence(options);
  const missingPublishedNodeIds = normalizePublicationOwnerNodeIds(
    options.missingPublishedNodeIds ??
      options.missingPublishedRecoveryActiveNodeIds,
  );
  const publicationStatus = normalizePublicationOwnerStatus(
    options.publicationStatus ?? options.status,
  );

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
