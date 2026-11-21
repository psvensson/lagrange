// Publication writers retain intent across conditional writes: birth fixes
// one revision, ACK owns one node, and refresh owns its supplied metadata.
import {readUpperStateField} from '../utils/state-field-read.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {acknowledgeMembershipPublication} from './membership-publication-acknowledgement.js';
import {
  buildPublicationMetadataRefreshRow,
  closeAcknowledgedMetadataRefreshRow,
  serializeMembershipPublicationRow,
} from './membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from './membership-publication-row-contract.js';
import {normalizeNodeIdList} from './membership-publication-row-helpers.js';
import {assertPublicationWriteRevision} from './owners/control-plane-publications-owner.js';
import {isPublicationOwnerFailureStatus} from './publication-owner-decision.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';

const INTENT_KIND = Object.freeze({BIRTH: 'birth', ACK: 'ack', REFRESH: 'refresh'});
const PUBLICATION_INTENT_DECISION = Object.freeze({
  WRITE: 'write', CONFIRMED: 'confirmed', UNCONFIRMED: 'unconfirmed',
});
const INVALID_PUBLICATION_WRITE_INTENT = 'Invalid membership publication write intent';

function publicationRevision(row) {
  const {
    publicationId, publicationKind, publicationEpoch, sourceTopologyEpoch,
    sourceSnapshotVersion, publishedActiveNodeIds, requiredAckNodeIds,
  } = normalizeControlPlanePublicationRow(row);
  return {publication_id: publicationId, publicationKind, publicationEpoch, sourceTopologyEpoch,
    sourceSnapshotVersion, publishedActiveNodeIds, requiredAckNodeIds};
}

function publicationBirthIntent(row) {
  return {kind: INTENT_KIND.BIRTH, revision: publicationRevision(row),
    initialRow: serializeMembershipPublicationRow(row)};
}

function publicationAcknowledgementIntent(row, {nodeId, nowMs, timeoutMs, timeoutReasonCode}) {
  return {kind: INTENT_KIND.ACK, revision: publicationRevision(row),
    nodeId, nowMs, timeoutMs, timeoutReasonCode};
}

function publicationRefreshIntent(row, {
  nowMs, priorityPartitionSummary, membershipLifecycleSummary,
  acknowledgedNodeIds, requirePublished,
}) {
  return {kind: INTENT_KIND.REFRESH, revision: publicationRevision(row),
    nowMs, priorityPartitionSummary, membershipLifecycleSummary,
    acknowledgedNodeIds, requirePublished};
}

function refreshedPublicationRow(intent, current, nowMs) {
  const {acknowledgedNodeIds, requiredAckNodeIds} = normalizeControlPlanePublicationRow(current);
  const proposedAcks = normalizeNodeIdList(intent.acknowledgedNodeIds)
    .filter((nodeId) => requiredAckNodeIds.includes(nodeId));
  return buildPublicationMetadataRefreshRow({
    publicationRow: current,
    priorityPartitionSummary: intent.priorityPartitionSummary,
    membershipLifecycleSummary: intent.membershipLifecycleSummary,
    acknowledgedNodeIds: normalizeNodeIdList([...acknowledgedNodeIds, ...proposedAcks]),
    nowMs,
  });
}

function projectPublicationIntent(intent, current) {
  const nowMs = Math.max(intent.nowMs, current.updated_at ?? 0);
  switch (intent.kind) {
  case INTENT_KIND.ACK: {
    const acknowledged = acknowledgeMembershipPublication({
      publicationRow: current, nodeId: intent.nodeId, nowMs: intent.nowMs,
      timeoutMs: intent.timeoutMs, timeoutReasonCode: intent.timeoutReasonCode,
    });
    return closeAcknowledgedMetadataRefreshRow({
      publicationRow: {...acknowledged, updated_at: nowMs}, nowMs,
    });
  }
  case INTENT_KIND.REFRESH:
    return refreshedPublicationRow(intent, current, nowMs);
  default:
    throw new TypeError(INVALID_PUBLICATION_WRITE_INTENT);
  }
}

function decidePublicationIntent(intent, current) {
  if (current === null) {
    return intent.kind === INTENT_KIND.BIRTH ?
      {state: PUBLICATION_INTENT_DECISION.WRITE, row: intent.initialRow} :
      {state: PUBLICATION_INTENT_DECISION.UNCONFIRMED, row: null};
  }
  assertPublicationWriteRevision(intent.revision, current);
  let proposed = current;
  if (intent.kind !== INTENT_KIND.BIRTH &&
      !isPublicationOwnerFailureStatus(readUpperStateField(current.status))) {
    proposed = serializeMembershipPublicationRow(projectPublicationIntent(intent, current));
  }
  const confirmed = publicationRowSatisfiesDesiredState(current, proposed);
  const requestedClosureMissing = intent.requirePublished &&
    !isPublicationOwnerFailureStatus(readUpperStateField(current.status)) &&
    proposed.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  return requestedClosureMissing ?
    {state: PUBLICATION_INTENT_DECISION.UNCONFIRMED, row: current} :
    confirmed ?
      {state: PUBLICATION_INTENT_DECISION.CONFIRMED, row: current} :
      {state: PUBLICATION_INTENT_DECISION.WRITE, row: proposed};
}

export {
  PUBLICATION_INTENT_DECISION, decidePublicationIntent,
  publicationAcknowledgementIntent, publicationBirthIntent, publicationRefreshIntent,
};
