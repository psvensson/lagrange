// One client for the release lifecycle route. Node hints select where to
// ask; only the answering consensus owner can name the current leader.
import {AddressManager} from '../address/address-manager.js';
import {classifyTransportDeliveryOutcome, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {releaseAnswer} from '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_PRIORITY,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';

function releaseNodeOfAddress(address) {
  try {
    return AddressManager.getInstance().getNodeId(address);
  } catch {
    return null;
  }
}

async function askParticipantRelease(owner, nodeId, request) {
  try {
    const response = classifyTransportDeliveryOutcome(await owner.messageRouter.deliver(
      `${nodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
      {...request, type: PARTICIPANT_RELEASE_TYPE},
      {targetNodeId: nodeId, deliveryPriority: PARTICIPANT_RELEASE_PRIORITY,
        timeoutMs: BOUND.REQUEST_TIMEOUT_MS}));
    const result = response[PARTICIPANT_RELEASE_RESULT_FIELD];
    return isDeliveredTransportDeliveryOutcome(response) && response.noHandler !== true &&
      result && typeof result === 'object' ? result : releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: 'replica_release_reply', owner: nodeId,
          retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
  } catch (error) {
    return releaseAnswer(OUTCOME.UNAVAILABLE, request,
      {missingFact: 'replica_release_reply', owner: nodeId,
        reason: String(error?.message ?? error), retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
  }
}

async function requestParticipantRelease(owner, request) {
  const payload = {...request, action: ACTION.RELEASE};
  const first = await askParticipantRelease(owner, request.nodeId ?? owner.nodeId, payload);
  if (first.outcome !== OUTCOME.NOT_LEADER) return first;
  const nodeId = releaseNodeOfAddress(first.leaderAddress);
  return nodeId === null ? first : askParticipantRelease(owner, nodeId,
    {...payload, replicaId: first.leaderReplicaId});
}

export {askParticipantRelease, releaseNodeOfAddress, requestParticipantRelease};
