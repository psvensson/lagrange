// One client for the release lifecycle route. Node hints select where to
// ask; only the answering consensus owner can name the current leader.
import {AddressManager} from '../address/address-manager.js';
import {classifyTransportDeliveryOutcome, isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {participantReleaseClockMeasured, readParticipantReleaseClock} from
  './participant-release-diagnostic-observation.js';
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

function ownerNow(owner) {
  return typeof owner?.timeSource?.now === 'function' ?
    owner.timeSource.now() : Date.now();
}

function requestTimeoutMs(owner, request) {
  if (!Number.isSafeInteger(request?.deadlineAtMs)) {
    return BOUND.REQUEST_TIMEOUT_MS;
  }
  return Math.max(0, Math.min(BOUND.REQUEST_TIMEOUT_MS,
    request.deadlineAtMs - ownerNow(owner)));
}

function validParticipantReleaseDeadline(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function participantReleaseRequestBudget(owner, deadlineAtMs,
  ceilingAtMs = deadlineAtMs) {
  const observation = readParticipantReleaseClock(owner?.timeSource);
  if (!participantReleaseClockMeasured(observation) ||
      !validParticipantReleaseDeadline(deadlineAtMs) ||
      !validParticipantReleaseDeadline(ceilingAtMs) ||
      ceilingAtMs > deadlineAtMs) return null;
  const cappedAtMs = observation.value + BOUND.REQUEST_TIMEOUT_MS;
  const remainingMs = Math.min(deadlineAtMs, ceilingAtMs, cappedAtMs) - observation.value;
  if (!Number.isSafeInteger(cappedAtMs) || !Number.isSafeInteger(remainingMs)) return null;
  const observationDeadlineAtMs = Math.min(deadlineAtMs, ceilingAtMs, cappedAtMs);
  return Object.freeze({nowMs: observation.value, observationDeadlineAtMs,
    timeoutMs: Math.max(0, remainingMs)});
}

function observationUnavailable(request, nodeId, reason = null) {
  return releaseAnswer(OUTCOME.UNAVAILABLE, request,
    {missingFact: 'replica_release_reply', owner: nodeId,
      ...(reason === null ? {} : {reason}), retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
}

function prepareParticipantReleaseRequest(owner, nodeId, request) {
  if (request.action !== ACTION.OBSERVE_APPLIED_POSITION) {
    return {request, timeoutMs: requestTimeoutMs(owner, request), observation: false};
  }
  const budget = participantReleaseRequestBudget(owner, request.deadlineAtMs);
  if (budget === null) return {answer: observationUnavailable(request, nodeId)};
  const dispatched = {...request,
    observationDeadlineAtMs: budget.observationDeadlineAtMs};
  if (budget.timeoutMs > 0) {
    return {request: dispatched, timeoutMs: budget.timeoutMs, observation: true};
  }
  const answer = budget.nowMs < request.deadlineAtMs ?
    observationUnavailable(dispatched, nodeId,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT) :
    releaseAnswer(OUTCOME.UNAVAILABLE, dispatched,
      {missingFact: 'release_deadline', owner: nodeId});
  return {answer};
}

function participantReleaseDeliveryAnswer(response, prepared, nodeId) {
  const result = response[PARTICIPANT_RELEASE_RESULT_FIELD];
  if (isDeliveredTransportDeliveryOutcome(response) && response.noHandler !== true &&
      result && typeof result === 'object') return result;
  return prepared.observation &&
    response.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ?
    observationUnavailable(prepared.request, nodeId, response.reasonCode) :
    observationUnavailable(prepared.request, nodeId);
}

async function askParticipantRelease(owner, nodeId, request) {
  const prepared = prepareParticipantReleaseRequest(owner, nodeId, request);
  if (prepared.answer !== undefined) {
    return prepared.answer;
  }
  if (prepared.timeoutMs <= 0) {
    return releaseAnswer(OUTCOME.UNAVAILABLE, request,
      {missingFact: 'release_deadline', owner: nodeId});
  }
  try {
    const response = classifyTransportDeliveryOutcome(await owner.messageRouter.deliver(
      `${nodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
      {...prepared.request, type: PARTICIPANT_RELEASE_TYPE},
      {targetNodeId: nodeId, deliveryPriority: PARTICIPANT_RELEASE_PRIORITY,
        timeoutMs: prepared.timeoutMs}));
    return participantReleaseDeliveryAnswer(response, prepared, nodeId);
  } catch (error) {
    const delivery = classifyTransportDeliveryOutcome(error);
    return prepared.observation &&
      delivery.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ?
      observationUnavailable(prepared.request, nodeId, delivery.reasonCode) :
      releaseAnswer(OUTCOME.UNAVAILABLE, prepared.request,
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

export {askParticipantRelease, participantReleaseRequestBudget,
  releaseNodeOfAddress, requestParticipantRelease};
