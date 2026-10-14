// One client for the release lifecycle route. Node hints select where to
// ask; only the answering consensus owner can name the current leader.
import {AddressManager} from '../address/address-manager.js';
import {classifyTransportDeliveryOutcome, isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {participantReleaseClockMeasured, participantReleaseSafeClockInteger,
  readParticipantReleaseClock} from
  './participant-release-diagnostic-observation.js';
import {releaseAnswer} from '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_PRIORITY,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';

const mathMax = Math.max;
const mathMin = Math.min;
const objectFreeze = Object.freeze;
const objectIs = Object.is;

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
  return cappedRequestTimeoutMs(ownerNow(owner), request.deadlineAtMs);
}

function participantReleaseAbsoluteClockValid(value) {
  return participantReleaseSafeClockInteger(value) && value >= 0 &&
    !objectIs(value, -0);
}

function cappedRequestTimeoutMs(nowMs, deadlineAtMs) {
  return mathMax(0, mathMin(BOUND.REQUEST_TIMEOUT_MS, deadlineAtMs - nowMs));
}

function participantReleaseRequestBudget(owner, deadlineAtMs, ceilingAtMs) {
  const observation = readParticipantReleaseClock(owner?.timeSource);
  if (!participantReleaseClockMeasured(observation) ||
      !participantReleaseAbsoluteClockValid(observation.value) ||
      !participantReleaseAbsoluteClockValid(deadlineAtMs) ||
      !participantReleaseAbsoluteClockValid(ceilingAtMs) ||
      ceilingAtMs > deadlineAtMs) return null;
  const overallRemainingMs = mathMax(0, deadlineAtMs - observation.value);
  const ceilingRemainingMs = mathMax(0, ceilingAtMs - observation.value);
  if (!participantReleaseSafeClockInteger(overallRemainingMs) ||
      !participantReleaseSafeClockInteger(ceilingRemainingMs)) return null;
  const timeoutMs = cappedRequestTimeoutMs(0,
    mathMin(overallRemainingMs, ceilingRemainingMs));
  const observationDeadlineAtMs = observation.value + timeoutMs;
  if (!participantReleaseAbsoluteClockValid(observationDeadlineAtMs)) return null;
  return objectFreeze({nowMs: observation.value, observationDeadlineAtMs,
    timeoutMs});
}

function observationUnavailable(request, nodeId, reason = null) {
  return releaseAnswer(OUTCOME.UNAVAILABLE, request,
    {missingFact: MISSING_FACT.REPLICA_RELEASE_REPLY, owner: nodeId,
      ...(reason === null ? {} : {reason}), retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
}

function prepareParticipantReleaseRequest(owner, nodeId, request) {
  if (request.action !== ACTION.OBSERVE_APPLIED_POSITION) {
    return {request, timeoutMs: requestTimeoutMs(owner, request), observation: false};
  }
  const budget = participantReleaseRequestBudget(owner, request.deadlineAtMs,
    request.deadlineAtMs);
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
      {missingFact: MISSING_FACT.RELEASE_DEADLINE, owner: nodeId});
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
      {missingFact: MISSING_FACT.RELEASE_DEADLINE, owner: nodeId});
  }
  try {
    const response = classifyTransportDeliveryOutcome(await owner.messageRouter.deliver(
      `${nodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
      {...prepared.request, type: PARTICIPANT_RELEASE_TYPE},
      {targetNodeId: nodeId, deliveryPriority: PARTICIPANT_RELEASE_PRIORITY,
        timeoutMs: prepared.timeoutMs}));
    // The transport may deliver a previously committed positive reply after
    // the caller's original absolute deadline. A result can still be durable,
    // but it cannot become *current caller authorization*. This is the same
    // original TimeSource used for the pre-send bound, not a new timer/owner.
    // OBSERVE_APPLIED_POSITION owns its own independent deadline adjudicator.
    if (!prepared.observation &&
        participantReleaseAbsoluteClockValid(prepared.request.deadlineAtMs) &&
        ownerNow(owner) >= prepared.request.deadlineAtMs) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, prepared.request,
        {missingFact: MISSING_FACT.RELEASE_DEADLINE, owner: nodeId});
    }
    return participantReleaseDeliveryAnswer(response, prepared, nodeId);
  } catch (error) {
    const delivery = classifyTransportDeliveryOutcome(error);
    return prepared.observation &&
      delivery.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ?
      observationUnavailable(prepared.request, nodeId, delivery.reasonCode) :
      releaseAnswer(OUTCOME.UNAVAILABLE, prepared.request,
        {missingFact: MISSING_FACT.REPLICA_RELEASE_REPLY, owner: nodeId,
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

export {askParticipantRelease, participantReleaseAbsoluteClockValid,
  participantReleaseRequestBudget,
  releaseNodeOfAddress, requestParticipantRelease};
