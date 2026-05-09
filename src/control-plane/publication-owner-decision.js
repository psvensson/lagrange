import {NUM} from '../constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_EVIDENCE_STATE,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_REASON,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from './publication-owner-constants.js';
import {buildPublicationOwnerEvidence} from './publication-owner-evidence.js';

const PUBLICATION_OWNER_UNPUBLISHED_OBSERVATION_STATE = 'unpublished';
const PUBLICATION_OWNER_RECOVERY_PROTOCOL_PUBLICATION_PENDING =
  'publication_pending';
const PUBLICATION_OWNER_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';

const PUBLICATION_OWNER_TERMINAL_FAILURE_STATUS_REASONS = Object.freeze({
  [CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_ABANDONED,
  [CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_SUPERSEDED,
});

const PUBLICATION_OWNER_STATUS_REASONS = Object.freeze({
  [CONTROL_PLANE_PUBLICATION_STATUS.OPEN]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_OPEN,
  [CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_ACK_PENDING,
  [CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_PUBLISHED,
  ...PUBLICATION_OWNER_TERMINAL_FAILURE_STATUS_REASONS,
});

const PUBLICATION_OWNER_ACK_STATE_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
    matches: (evidence) => evidence.pendingAckCount > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST &&
      evidence.requiredAckNodeIds.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST &&
      evidence.requiredAckNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_REVISION_STATE_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    matches: (evidence) =>
      evidence.desiredRevision.state ===
        PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE ||
      evidence.committedRevision.state ===
        PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_REVISION_STATE.ADVANCING,
    matches: (evidence) =>
      evidence.desiredRevision.value > evidence.committedRevision.value,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_REVISION_STATE.AHEAD_OF_DESIRED,
    matches: (evidence) =>
      evidence.desiredRevision.value < evidence.committedRevision.value,
  }),
  Object.freeze({
    state: PUBLICATION_OWNER_REVISION_STATE.CURRENT,
    matches: () => true,
  }),
]);

function hasPublicationOwnerRevision(evidence) {
  return evidence.observedRevision.state !==
    PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE ||
    evidence.desiredRevision.state !==
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE ||
    evidence.committedRevision.state !==
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE;
}

function isPublicationOwnerFailureStatus(publicationStatus) {
  return Object.hasOwn(
    PUBLICATION_OWNER_TERMINAL_FAILURE_STATUS_REASONS,
    publicationStatus,
  );
}

function isPublicationOwnerUnpublishedObservation(evidence) {
  return evidence.publicationObservationState ===
    PUBLICATION_OWNER_UNPUBLISHED_OBSERVATION_STATE ||
    evidence.recoveryProtocolState ===
      PUBLICATION_OWNER_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION;
}

function isPublicationOwnerPublicationProtocolPending(evidence) {
  return evidence.recoveryProtocolState ===
    PUBLICATION_OWNER_RECOVERY_PROTOCOL_PUBLICATION_PENDING;
}

function resolvePublicationOwnerAckState(evidence) {
  return PUBLICATION_OWNER_ACK_STATE_RULES.find((rule) =>
    rule.matches(evidence),
  ).state;
}

function resolvePublicationOwnerRevisionState(evidence) {
  return PUBLICATION_OWNER_REVISION_STATE_RULES.find((rule) =>
    rule.matches(evidence),
  ).state;
}

function hasPublicationOwnerRevisionLag(evidence, revisionState) {
  return revisionState === PUBLICATION_OWNER_REVISION_STATE.ADVANCING;
}

function hasPublicationOwnerPublicationPending(evidence) {
  return evidence.publicationPendingHint === true ||
    evidence.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.OPEN ||
    isPublicationOwnerPublicationProtocolPending(evidence);
}

const PUBLICATION_OWNER_FRESHNESS_RULES = Object.freeze([
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED,
    matches: (snapshot) =>
      isPublicationOwnerFailureStatus(snapshot.evidence.publicationStatus),
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    matches: (snapshot) =>
      isPublicationOwnerUnpublishedObservation(snapshot.evidence) ||
      (
        hasPublicationOwnerRevision(snapshot.evidence) !== true &&
        snapshot.evidence.publicationPendingHint !== true &&
        snapshot.evidence.pendingAckCount === NUM.ZERO &&
        snapshot.evidence.missingPublishedCount === NUM.ZERO
      ),
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
    matches: (snapshot) =>
      hasPublicationOwnerRevisionLag(
        snapshot.evidence,
        snapshot.revisionState,
      ),
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    matches: (snapshot) =>
      snapshot.evidence.missingPublishedCount > NUM.ZERO,
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING,
    matches: (snapshot) =>
      hasPublicationOwnerPublicationPending(snapshot.evidence) &&
      snapshot.ackState !== PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED &&
      snapshot.ackState !== PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.RECOVERY_LAG,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true ||
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.FRESH,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_RECOVERY_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
    matches: (snapshot) =>
      snapshot.freshnessFence === PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
    matches: (snapshot) =>
      snapshot.freshnessFence === PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG ||
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME
      .WAITING_FOR_RECOVERY_EVIDENCE,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.READY,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_STREAM_OUTCOME_RULES = Object.freeze([
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
    matches: (snapshot) =>
      snapshot.recoveryOutcome === PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.RECOVERING,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE ||
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING,
  }),
  Object.freeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_REASON_RULES = Object.freeze([
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.NO_PUBLICATION_REVISION,
    matches: (snapshot) =>
      hasPublicationOwnerRevision(snapshot.evidence) !== true,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.UNPUBLISHED_OBSERVATION,
    matches: (snapshot) =>
      isPublicationOwnerUnpublishedObservation(snapshot.evidence),
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.ACK_WAITING,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.ACK_COMPLETE,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.ACK_NOT_REQUIRED,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.ACK_EVIDENCE_COUNT_ONLY,
    matches: (snapshot) =>
      snapshot.evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.REVISION_LAG,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.MISSING_PUBLISHED_MEMBERS,
    matches: (snapshot) =>
      snapshot.evidence.missingPublishedCount > NUM.ZERO,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.PUBLICATION_PENDING_HINT,
    matches: (snapshot) =>
      snapshot.evidence.publicationPendingHint === true,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.RECOVERY_PROTOCOL_PUBLICATION_PENDING,
    matches: (snapshot) =>
      isPublicationOwnerPublicationProtocolPending(snapshot.evidence),
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.PRIORITY_SPREAD_PENDING,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  Object.freeze({
    reason: PUBLICATION_OWNER_REASON.STREAM_FRESH,
    matches: (snapshot) =>
      snapshot.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
  }),
]);

function resolvePublicationOwnerFreshnessFence(snapshot) {
  return PUBLICATION_OWNER_FRESHNESS_RULES.find((rule) =>
    rule.matches(snapshot),
  ).fence;
}

function resolvePublicationOwnerRecoveryOutcome(snapshot) {
  return PUBLICATION_OWNER_RECOVERY_OUTCOME_RULES.find((rule) =>
    rule.matches(snapshot),
  ).outcome;
}

function resolvePublicationOwnerStreamOutcome(snapshot) {
  return PUBLICATION_OWNER_STREAM_OUTCOME_RULES.find((rule) =>
    rule.matches(snapshot),
  ).outcome;
}

function resolvePublicationOwnerReasonCodes(snapshot) {
  const statusReason =
    PUBLICATION_OWNER_STATUS_REASONS[snapshot.evidence.publicationStatus] ||
    PUBLICATION_OWNER_TEXT.EMPTY;
  return Object.freeze([
    ...new Set([
      ...(statusReason.length > NUM.ZERO ? [statusReason] : []),
      ...PUBLICATION_OWNER_REASON_RULES
        .filter((rule) => rule.matches(snapshot))
        .map((rule) => rule.reason),
    ]),
  ]);
}

function resolvePublicationOwnerMergedPublicationStatus(options = {}) {
  const statusCandidates = options.preservePublishedStatus === true ?
    [
      options.primaryStatus,
      options.secondaryStatus,
    ] :
    [options.latestStatus ?? options.primaryStatus];
  const failureStatus = statusCandidates.find((publicationStatus) =>
    isPublicationOwnerFailureStatus(publicationStatus),
  );
  if (failureStatus) {
    return failureStatus;
  }
  const ownerEvidence = buildPublicationOwnerEvidence({
    publicationStatus:
      options.latestStatus ??
      options.primaryStatus ??
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
    requiredAckNodeIds: options.requiredAckNodeIds,
    acknowledgedNodeIds: options.acknowledgedNodeIds,
  });
  const ackState = resolvePublicationOwnerAckState(ownerEvidence);
  if (
    statusCandidates.includes(CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) ||
    ackState === PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED ||
    ackState === PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (
    statusCandidates.includes(CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING) ||
    ownerEvidence.acknowledgedNodeIds.length > NUM.ZERO
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING;
  }
  return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
}

export {
  PUBLICATION_OWNER_RECOVERY_PROTOCOL_PUBLICATION_PENDING,
  PUBLICATION_OWNER_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
  PUBLICATION_OWNER_UNPUBLISHED_OBSERVATION_STATE,
  hasPublicationOwnerPublicationPending,
  hasPublicationOwnerRevision,
  hasPublicationOwnerRevisionLag,
  isPublicationOwnerFailureStatus,
  isPublicationOwnerUnpublishedObservation,
  resolvePublicationOwnerAckState,
  resolvePublicationOwnerFreshnessFence,
  resolvePublicationOwnerMergedPublicationStatus,
  resolvePublicationOwnerReasonCodes,
  resolvePublicationOwnerRecoveryOutcome,
  resolvePublicationOwnerRevisionState,
  resolvePublicationOwnerStreamOutcome,
};
