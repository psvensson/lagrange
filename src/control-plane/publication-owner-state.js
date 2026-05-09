import {
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_SEMANTIC_OWNER,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {buildPublicationOwnerEvidence} from './publication-owner-evidence.js';
import {
  resolvePublicationOwnerAckState,
  resolvePublicationOwnerFreshnessFence,
  resolvePublicationOwnerReasonCodes,
  resolvePublicationOwnerRecoveryOutcome,
  resolvePublicationOwnerRevisionState,
  resolvePublicationOwnerStreamOutcome,
} from './publication-owner-decision.js';

const PUBLICATION_OWNER_PENDING_STREAM_OUTCOMES = Object.freeze([
  PUBLICATION_OWNER_STREAM_OUTCOME.NOT_STARTED,
  PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHING,
  PUBLICATION_OWNER_STREAM_OUTCOME.WAITING_FOR_ACK,
  PUBLICATION_OWNER_STREAM_OUTCOME.STALE,
  PUBLICATION_OWNER_STREAM_OUTCOME.FAILED,
]);

function buildPublicationOwnerRevisionSnapshot(evidence, revisionState) {
  return Object.freeze({
    state: revisionState,
    desired: evidence.desiredRevision,
    committed: evidence.committedRevision,
    observed: evidence.observedRevision,
  });
}

function buildPublicationOwnerStreamState(options = {}) {
  const evidence = buildPublicationOwnerEvidence(options);
  const ackState = resolvePublicationOwnerAckState(evidence);
  const revisionState = resolvePublicationOwnerRevisionState(evidence);
  const freshnessFence = resolvePublicationOwnerFreshnessFence({
    evidence,
    ackState,
    revisionState,
  });
  const recoveryOutcome = resolvePublicationOwnerRecoveryOutcome({
    evidence,
    ackState,
    revisionState,
    freshnessFence,
  });
  const streamOutcome = resolvePublicationOwnerStreamOutcome({
    evidence,
    ackState,
    revisionState,
    freshnessFence,
    recoveryOutcome,
  });
  const decisionSnapshot = Object.freeze({
    evidence,
    ackState,
    revisionState,
    freshnessFence,
    recoveryOutcome,
    streamOutcome,
  });

  return Object.freeze({
    semanticOwner: PUBLICATION_OWNER_SEMANTIC_OWNER,
    revision: buildPublicationOwnerRevisionSnapshot(evidence, revisionState),
    ackState,
    pendingAckEvidenceState: evidence.pendingAckEvidenceState,
    requiredAckNodeIds: evidence.requiredAckNodeIds,
    acknowledgedNodeIds: evidence.acknowledgedNodeIds,
    pendingAckNodeIds: evidence.pendingAckNodeIds,
    pendingAckCount: evidence.pendingAckCount,
    freshnessFence,
    missingPublishedNodeIds: evidence.missingPublishedNodeIds,
    missingPublishedCount: evidence.missingPublishedCount,
    recoveryOutcome,
    streamOutcome,
    reasonCodes: resolvePublicationOwnerReasonCodes(decisionSnapshot),
    publicationStatus: evidence.publicationStatus,
    publicationObservationState: evidence.publicationObservationState,
    recoveryProtocolState: evidence.recoveryProtocolState,
    prioritySpreadPending: evidence.prioritySpreadPending,
    prioritySpreadEvidenceUnavailable:
      evidence.prioritySpreadEvidenceUnavailable,
  });
}

function isPublicationOwnerStreamAckWaiting(publicationOwnerStream = {}) {
  return publicationOwnerStream.ackState ===
    PUBLICATION_OWNER_ACK_STATE.WAITING_FOR_ACK;
}

function isPublicationOwnerStreamPublicationPending(
  publicationOwnerStream = {},
) {
  return PUBLICATION_OWNER_PENDING_STREAM_OUTCOMES.includes(
    publicationOwnerStream.streamOutcome,
  );
}

function isPublicationOwnerStreamReady(publicationOwnerStream = {}) {
  return publicationOwnerStream.streamOutcome ===
    PUBLICATION_OWNER_STREAM_OUTCOME.PUBLISHED &&
    publicationOwnerStream.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME.READY &&
    publicationOwnerStream.revision?.state ===
      PUBLICATION_OWNER_REVISION_STATE.CURRENT;
}

export {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamAckWaiting,
  isPublicationOwnerStreamPublicationPending,
  isPublicationOwnerStreamReady,
};
