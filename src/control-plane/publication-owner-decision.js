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

const ArrayConstructor = Array;
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;

const PUBLICATION_OWNER_UNPUBLISHED_OBSERVATION_STATE = 'unpublished';
const PUBLICATION_OWNER_RECOVERY_PROTOCOL_PUBLICATION_PENDING =
  'publication_pending';
const PUBLICATION_OWNER_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';

const PUBLICATION_OWNER_TERMINAL_FAILURE_STATUS_REASONS = objectFreeze({
  [CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_ABANDONED,
  [CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_SUPERSEDED,
});

const PUBLICATION_OWNER_STATUS_REASONS = objectFreeze({
  [CONTROL_PLANE_PUBLICATION_STATUS.OPEN]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_OPEN,
  [CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_ACK_PENDING,
  [CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED]:
    PUBLICATION_OWNER_REASON.PUBLICATION_STATUS_PUBLISHED,
  ...PUBLICATION_OWNER_TERMINAL_FAILURE_STATUS_REASONS,
});

const PUBLICATION_OWNER_PENDING_PUBLICATION_STATUS_SET = objectFreeze(
  new SetConstructor([
    CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
    CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
  ]),
);

function hasPublicationOwnerOpenCountOnlyPublishDebt(evidence) {
  return evidence.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.OPEN &&
    evidence.pendingAckEvidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    evidence.pendingAckNodeIds.length === 0 &&
    evidence.missingPublishedCount > 0;
}

function hasPublicationOwnerUnknownCountOnlyPublishDebt(evidence) {
  return evidence.publicationStatus === PUBLICATION_OWNER_TEXT.UNKNOWN &&
    evidence.pendingAckEvidenceState ===
      PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY &&
    evidence.pendingAckCount === 0 &&
    evidence.pendingAckNodeIds.length === 0 &&
    evidence.missingPublishedCount > 0 &&
    evidence.missingPublishedNodeIds.length === 0 &&
    evidence.prioritySpreadPending !== true &&
    evidence.prioritySpreadEvidenceUnavailable !== true;
}

function hasPublicationOwnerUnknownNoDebtNotStartedEvidence(
  evidence,
  ackState,
) {
  return evidence.publicationStatus === PUBLICATION_OWNER_TEXT.UNKNOWN &&
    isPublicationOwnerUnpublishedObservation(evidence) &&
    ackState === PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED &&
    evidence.pendingAckCount === 0 &&
    evidence.pendingAckNodeIds.length === 0 &&
    evidence.missingPublishedCount === 0 &&
    evidence.missingPublishedNodeIds.length === 0 &&
    evidence.prioritySpreadPending !== true &&
    evidence.prioritySpreadEvidenceUnavailable !== true;
}

const PUBLICATION_OWNER_ACK_STATE_RULES = objectFreeze([
  objectFreeze({
    state: PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
    matches: (evidence) => evidence.pendingAckCount > 0 &&
      hasPublicationOwnerOpenCountOnlyPublishDebt(evidence) !== true,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST &&
      evidence.requiredAckNodeIds.length === 0,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
    matches: (evidence) =>
      evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST &&
      evidence.requiredAckNodeIds.length > 0,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
    matches: (evidence) =>
      evidence.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
      evidence.pendingAckCount === 0,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_ACK_STATE.UNAVAILABLE,
    matches: () => true,
  }),
]);

function hasPublicationOwnerPendingUncommittedRevision(evidence) {
  return hasPublicationOwnerPublicationPending(evidence) &&
    evidence.observedRevision.state !==
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE &&
    evidence.desiredRevision.state !==
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE &&
    evidence.committedRevision.state ===
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE;
}

const PUBLICATION_OWNER_REVISION_STATE_RULES = objectFreeze([
  objectFreeze({
    state: PUBLICATION_OWNER_REVISION_STATE.ADVANCING,
    matches: (evidence) =>
      hasPublicationOwnerPendingUncommittedRevision(evidence),
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    matches: (evidence) =>
      evidence.desiredRevision.state ===
        PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE ||
      evidence.committedRevision.state ===
        PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_REVISION_STATE.ADVANCING,
    matches: (evidence) =>
      evidence.desiredRevision.value > evidence.committedRevision.value,
  }),
  objectFreeze({
    state: PUBLICATION_OWNER_REVISION_STATE.AHEAD_OF_DESIRED,
    matches: (evidence) =>
      evidence.desiredRevision.value < evidence.committedRevision.value,
  }),
  objectFreeze({
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
  return objectHasOwn(
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
  return arrayFind(PUBLICATION_OWNER_ACK_STATE_RULES, (rule) =>
    rule.matches(evidence),
  ).state;
}

function resolvePublicationOwnerRevisionState(evidence) {
  return arrayFind(PUBLICATION_OWNER_REVISION_STATE_RULES, (rule) =>
    rule.matches(evidence),
  ).state;
}

function hasPublicationOwnerRevisionLag(evidence, revisionState) {
  return revisionState === PUBLICATION_OWNER_REVISION_STATE.ADVANCING &&
    hasPublicationOwnerPublicationPending(evidence) !== true;
}

function hasPublicationOwnerPublicationPending(evidence) {
  return evidence.publicationPendingHint === true ||
    setHas(
      PUBLICATION_OWNER_PENDING_PUBLICATION_STATUS_SET,
      evidence.publicationStatus,
    ) ||
    isPublicationOwnerPublicationProtocolPending(evidence);
}

function hasPublicationOwnerPublishingFence(snapshot) {
  return snapshot.freshnessFence === PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING;
}

function hasPublicationOwnerPressureDeferred(evidence) {
  return evidence.pressureDeferred === true;
}

const PUBLICATION_OWNER_FRESHNESS_RULES = objectFreeze([
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED,
    matches: (snapshot) =>
      isPublicationOwnerFailureStatus(snapshot.evidence.publicationStatus),
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.PRESSURE_DEFERRED,
    matches: (snapshot) =>
      hasPublicationOwnerPressureDeferred(snapshot.evidence),
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
    matches: (snapshot) =>
      hasPublicationOwnerUnknownCountOnlyPublishDebt(snapshot.evidence) ||
      hasPublicationOwnerUnknownNoDebtNotStartedEvidence(
        snapshot.evidence,
        snapshot.ackState,
      ) ||
      (
        isPublicationOwnerUnpublishedObservation(snapshot.evidence) &&
        hasPublicationOwnerPublicationPending(snapshot.evidence) !== true
      ) ||
      (
        hasPublicationOwnerRevision(snapshot.evidence) !== true &&
        snapshot.evidence.publicationPendingHint !== true &&
        snapshot.evidence.pendingAckCount === 0 &&
        snapshot.evidence.missingPublishedCount === 0
      ),
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
    matches: (snapshot) =>
      hasPublicationOwnerRevisionLag(
        snapshot.evidence,
        snapshot.revisionState,
      ),
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING,
    matches: (snapshot) =>
      hasPublicationOwnerPublicationPending(snapshot.evidence) &&
      snapshot.ackState !== PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED &&
      snapshot.ackState !== PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG,
    matches: (snapshot) =>
      snapshot.evidence.missingPublishedCount > 0,
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.RECOVERY_LAG,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true ||
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  objectFreeze({
    fence: PUBLICATION_OWNER_FRESHNESS_FENCE.FRESH,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_RECOVERY_OUTCOME_RULES = objectFreeze([
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
    matches: (snapshot) =>
      snapshot.freshnessFence === PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.PRESSURE_DEFERRED,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.PRESSURE_DEFERRED,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.NO_REVISION,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
    matches: (snapshot) =>
      snapshot.freshnessFence === PUBLICATION_OWNER_FRESHNESS_FENCE.ACK_LAG,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.CONSUMER_LAG ||
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.PUBLISHING,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME
      .WAITING_FOR_RECOVERY_EVIDENCE,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_RECOVERY_OUTCOME.READY,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_STREAM_OUTCOME_RULES = objectFreeze([
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
    matches: (snapshot) =>
      snapshot.recoveryOutcome === PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.PRESSURE_DEFERRED,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.PRESSURE_DEFERRED,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.NOT_STARTED,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_ACK,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_CONSUMER,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_PUBLICATION,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.RECOVERING,
    matches: (snapshot) =>
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.WAITING_FOR_RECOVERY_EVIDENCE ||
      snapshot.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.RECOVERING,
  }),
  objectFreeze({
    outcome: PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
    matches: () => true,
  }),
]);

const PUBLICATION_OWNER_REASON_RULES = objectFreeze([
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.NO_PUBLICATION_REVISION,
    matches: (snapshot) =>
      hasPublicationOwnerRevision(snapshot.evidence) !== true,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.UNPUBLISHED_OBSERVATION,
    matches: (snapshot) =>
      isPublicationOwnerUnpublishedObservation(snapshot.evidence),
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.ACK_WAITING,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.ACK_COMPLETE,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.ACK_NOT_REQUIRED,
    matches: (snapshot) =>
      snapshot.ackState === PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.ACK_EVIDENCE_COUNT_ONLY,
    matches: (snapshot) =>
      snapshot.evidence.pendingAckEvidenceState ===
        PUBLICATION_OWNER_ACK_EVIDENCE_STATE.COUNT_ONLY,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.REVISION_LAG,
    matches: (snapshot) =>
      snapshot.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.REVISION_LAG,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.MISSING_PUBLISHED_MEMBERS,
    matches: (snapshot) =>
      snapshot.evidence.missingPublishedCount > 0,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.PUBLICATION_PENDING_HINT,
    matches: (snapshot) =>
      snapshot.evidence.publicationPendingHint === true &&
      hasPublicationOwnerPublishingFence(snapshot),
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.RECOVERY_PROTOCOL_PUBLICATION_PENDING,
    matches: (snapshot) =>
      isPublicationOwnerPublicationProtocolPending(snapshot.evidence) &&
      hasPublicationOwnerPublishingFence(snapshot),
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.PRIORITY_SPREAD_PENDING,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadPending === true,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
    matches: (snapshot) =>
      snapshot.evidence.prioritySpreadEvidenceUnavailable === true,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.PRESSURE_DEFERRED,
    matches: (snapshot) =>
      snapshot.evidence.pressureDeferred === true,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.PRESSURE_COALESCED,
    matches: (snapshot) =>
      snapshot.evidence.pressureCoalesced === true,
  }),
  objectFreeze({
    reason: PUBLICATION_OWNER_REASON.STREAM_FRESH,
    matches: (snapshot) =>
      snapshot.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED,
  }),
]);

function resolvePublicationOwnerFreshnessFence(snapshot) {
  return arrayFind(PUBLICATION_OWNER_FRESHNESS_RULES, (rule) =>
    rule.matches(snapshot),
  ).fence;
}

function resolvePublicationOwnerRecoveryOutcome(snapshot) {
  return arrayFind(PUBLICATION_OWNER_RECOVERY_OUTCOME_RULES, (rule) =>
    rule.matches(snapshot),
  ).outcome;
}

function resolvePublicationOwnerStreamOutcome(snapshot) {
  return arrayFind(PUBLICATION_OWNER_STREAM_OUTCOME_RULES, (rule) =>
    rule.matches(snapshot),
  ).outcome;
}

function appendPublicationOwnerReason(reasonCodes, seenReasons, reasonCode) {
  if (reasonCode.length === 0 || setHas(seenReasons, reasonCode)) return;
  setAdd(seenReasons, reasonCode);
  objectDefineProperty(reasonCodes, reasonCodes.length, {
    configurable: true,
    enumerable: true,
    value: reasonCode,
    writable: true,
  });
}

function resolvePublicationOwnerReasonCodes(snapshot) {
  const statusReason =
    PUBLICATION_OWNER_STATUS_REASONS[snapshot.evidence.publicationStatus] ||
    PUBLICATION_OWNER_TEXT.EMPTY;
  const reasonCodes = new ArrayConstructor();
  const seenReasons = new SetConstructor();
  appendPublicationOwnerReason(reasonCodes, seenReasons, statusReason);
  for (let index = 0; index < PUBLICATION_OWNER_REASON_RULES.length; index++) {
    const rule = PUBLICATION_OWNER_REASON_RULES[index];
    if (rule.matches(snapshot)) {
      appendPublicationOwnerReason(reasonCodes, seenReasons, rule.reason);
    }
  }
  return objectFreeze(reasonCodes);
}

function resolvePublicationOwnerMergedPublicationStatus(options = {}) {
  const statusCandidates = options.preservePublishedStatus === true ?
    [
      options.primaryStatus,
      options.secondaryStatus,
    ] :
    [options.latestStatus ?? options.primaryStatus];
  const failureStatus = arrayFind(statusCandidates, (publicationStatus) =>
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
    arrayIncludes(
      statusCandidates,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    ) ||
    ackState === PUBLICATION_OWNER_ACK_STATE.ACKNOWLEDGED ||
    ackState === PUBLICATION_OWNER_ACK_STATE.NOT_REQUIRED
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (
    arrayIncludes(
      statusCandidates,
      CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
    ) ||
    ownerEvidence.acknowledgedNodeIds.length > 0
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
