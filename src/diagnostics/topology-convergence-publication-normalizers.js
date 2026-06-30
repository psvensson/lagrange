import {
  PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
  PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED,
  PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED,
  PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
  PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
  PUBLICATION_OWNER_REVISION_STATE_CURRENT,
  PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
  PUBLICATION_PENDING_STATUS_SET,
  TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL,
  SOURCE_ORDER_BASE,
  UNKNOWN_VALUE,
  SOURCE_FIELD,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
  booleanVariant,
  isTopologyOperatorWitnessPresent,
  numberOrUnknown,
  numberOrZero,
  parseBooleanVariant,
  textOrUnknown,
} from './topology-convergence-core-normalizers.js';

import {
  buildPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';

export function isClosedPublicationOwnerAckState(ackState) {
  return ackState === PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED ||
    ackState === PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED;
}

export function normalizePublicationOwnerStreamEvidence(publication) {
  const publicationOwnerStream = asRecord(publication.publicationOwnerStream);
  const revision = asRecord(publicationOwnerStream.revision);
  return {
    ackState: textOrUnknown(
      publication.ackState || publicationOwnerStream.ackState,
    ),
    freshnessFence: textOrUnknown(
      publication.freshnessFence || publicationOwnerStream.freshnessFence,
    ),
    recoveryOutcome: textOrUnknown(
      publication.recoveryOutcome || publicationOwnerStream.recoveryOutcome,
    ),
    revisionState: textOrUnknown(revision.state),
    streamOutcome: textOrUnknown(
      publication.streamOutcome || publicationOwnerStream.streamOutcome,
    ),
  };
}

export function isNonTerminalTopologyOperatorWitness(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return false;
  }
  return textOrUnknown(record[SOURCE_FIELD.CURRENT_STEP_STATE]) !==
    TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL;
}

export function normalizePublicationEvidence(publication) {
  const ownerStreamEvidence =
    normalizePublicationOwnerStreamEvidence(publication);
  const topologyOperatorWitness = asRecord(
    publication[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
  );
  return {
    publicationStatus: textOrUnknown(publication.publicationStatus),
    publicationPending: publication.publicationPending === true,
    recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
    pendingAckCount: numberOrZero(publication.pendingAckCount),
    blockedNodeCount: numberOrZero(publication.blockedNodeCount),
    missingPublishedCount: numberOrZero(publication.missingPublishedCount),
    missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
    prioritySpreadPending: publication.prioritySpreadPending === true,
    topologyOperatorWitness,
    ...ownerStreamEvidence,
    source: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrUnknown(publication.pendingAckCount),
      blockedNodeCount: numberOrUnknown(publication.blockedNodeCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrUnknown(publication.missingPublishedCount),
      publicationPending: booleanVariant(publication.publicationPending),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      prioritySpreadPending: booleanVariant(publication.prioritySpreadPending),
      publicationOwnerAckState: ownerStreamEvidence.ackState,
      publicationOwnerFreshnessFence: ownerStreamEvidence.freshnessFence,
      publicationOwnerRecoveryOutcome: ownerStreamEvidence.recoveryOutcome,
      publicationOwnerRevisionState: ownerStreamEvidence.revisionState,
      publicationOwnerStreamOutcome: ownerStreamEvidence.streamOutcome,
      ...buildTopologyOperatorWitnessDiagnosticSource(
        topologyOperatorWitness,
      ),
    },
  };
}

export function buildTopologyOperatorWitnessDiagnosticSource(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return {};
  }
  return {
    topologyOperatorId: textOrUnknown(record[SOURCE_FIELD.OPERATOR_ID]),
    topologyOperatorKind: textOrUnknown(record[SOURCE_FIELD.KIND]),
    topologyOperatorCurrentStepId: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_ID],
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_STATE],
    ),
    topologyOperatorNextAction: textOrUnknown(
      record[SOURCE_FIELD.NEXT_ACTION],
    ),
  };
}

export function isPublicationPendingEvidence(evidence) {
  return (
    (evidence.publicationPending === true &&
      evidence.missingPublishedCount === SOURCE_ORDER_BASE) ||
    PUBLICATION_PENDING_STATUS_SET.has(evidence.publicationStatus) ||
    evidence.recoveryProtocolState ===
      PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING
  );
}

export function isPublicationConsumerLagEvidence(evidence) {
  return evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED &&
    evidence.pendingAckCount === SOURCE_ORDER_BASE &&
    isClosedPublicationOwnerAckState(evidence.ackState) &&
    evidence.revisionState === PUBLICATION_OWNER_REVISION_STATE_CURRENT &&
    evidence.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME_STALE &&
    evidence.freshnessFence ===
      PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG &&
    evidence.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER;
}

export function hasPublicationMissingPublishedEvidence(evidence) {
  return evidence.missingPublishedCount > SOURCE_ORDER_BASE ||
    evidence.missingPublishedNodeIds.length > SOURCE_ORDER_BASE;
}

export function isPublicationMissingPublishedEvidence(evidence) {
  return hasPublicationMissingPublishedEvidence(evidence) &&
    evidence.prioritySpreadPending !== true &&
    isPublicationConsumerLagEvidence(evidence) !== true;
}

export function hasPublicationActiveGateHandoffContract(handoff) {
  const record = asRecord(handoff);
  return textOrUnknown(record.state) !== UNKNOWN_VALUE ||
    textOrUnknown(record.reasonCode) !== UNKNOWN_VALUE ||
    textOrUnknown(record.nextAction) !== UNKNOWN_VALUE;
}

export function hasReplayableNoDebtPublicationPendingOwnerEvidence(
  publication,
) {
  return parseBooleanVariant(publication.publicationPending) === true &&
    textOrUnknown(publication.recoveryProtocolState) ===
      PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION &&
    numberOrZero(publication.pendingAckCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.pendingAckNodeIds).length === SOURCE_ORDER_BASE &&
    numberOrZero(publication.missingPublishedCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.missingPublishedNodeIds).length ===
      SOURCE_ORDER_BASE &&
    parseBooleanVariant(publication.prioritySpreadPending) !== true;
}

export function buildReplayablePublicationActiveGateHandoffFromOwnerEvidence({
  publicationActiveGateHandoff,
  publication,
  progress,
}) {
  if (hasPublicationActiveGateHandoffContract(publicationActiveGateHandoff)) {
    return publicationActiveGateHandoff;
  }
  if (!hasReplayableNoDebtPublicationPendingOwnerEvidence(publication)) {
    return publicationActiveGateHandoff;
  }
  return buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      publicationPending: parseBooleanVariant(publication.publicationPending),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrZero(publication.pendingAckCount),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrZero(publication.missingPublishedCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      prioritySpreadPending:
        parseBooleanVariant(publication.prioritySpreadPending),
    },
    activeGateProgress: progress,
  });
}
