// One client for the release lifecycle route. Node hints select where to
// ask; only the answering consensus owner can name the current leader.
import {AddressManager} from '../address/address-manager.js';
import {deliveryTransportOf, deliveryAnswerOf, classifyThrownDeliveryError, isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {participantReleaseClockMeasured, participantReleaseSafeClockInteger, releaseDiagnosticText, captureReleaseInspectTarget,
  readParticipantReleaseClock, recordReleaseHop} from
  './participant-release-diagnostic-observation.js';
import {releaseAnswer} from '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_TRIGGER as TRIGGER,
  PARTICIPANT_RELEASE_PRIORITY,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';

const mathMax = Math.max;
const mathMin = Math.min;
const objectFreeze = Object.freeze;
const objectIs = Object.is;
const EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION = null;
const MAX_PLATFORM_TIMER_DELAY_MS = 2_147_483_647;

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
  if (!participantReleaseAbsoluteClockValid(request?.deadlineAtMs)) return 0;
  const nowMs = ownerNow(owner);
  if (!participantReleaseAbsoluteClockValid(nowMs)) return 0;
  // RELEASE is an orchestrator: every leaf keeps its own cap while the caller
  // observes the one original aggregate budget, including a leader redirect.
  return request.action === ACTION.RELEASE ?
    participantReleaseWaitRemainingMs(nowMs, request.deadlineAtMs) :
    cappedRequestTimeoutMs(nowMs, request.deadlineAtMs);
}

function participantReleaseWaitRemainingMs(nowMs, deadlineAtMs) {
  if (!participantReleaseAbsoluteClockValid(nowMs) ||
      !participantReleaseAbsoluteClockValid(deadlineAtMs)) return 0;
  const remainingMs = mathMax(0, deadlineAtMs - nowMs);
  return remainingMs <= MAX_PLATFORM_TIMER_DELAY_MS ? remainingMs : 0;
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
      ...captureReleaseInspectTarget(request, nodeId),
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

function participantReleaseDeliveryAnswer(delivery, prepared, nodeId) {
  const transport = deliveryTransportOf(delivery);
  const answer = deliveryAnswerOf(delivery);
  const result = answer?.[PARTICIPANT_RELEASE_RESULT_FIELD];
  if (isDeliveredTransportDeliveryOutcome(transport) &&
      result && typeof result === 'object') return result;
  return prepared.observation &&
    transport.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ?
    observationUnavailable(prepared.request, nodeId, transport.reasonCode) :
    observationUnavailable(prepared.request, nodeId);
}

async function askParticipantRelease(owner, nodeId, request, trace, phase = request.action) {
  const prepared = prepareParticipantReleaseRequest(owner, nodeId, request);
  if (prepared.answer !== undefined) {
    return prepared.answer;
  }
  if (prepared.timeoutMs <= 0) {
    return releaseAnswer(OUTCOME.UNAVAILABLE, request,
      {missingFact: MISSING_FACT.RELEASE_DEADLINE, owner: nodeId});
  }
  const start = trace ? performance.now() : null;
  try {
    const delivery = await owner.messageRouter.deliver(
      `${nodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
      {...prepared.request, type: PARTICIPANT_RELEASE_TYPE},
      {targetNodeId: nodeId, deliveryPriority: PARTICIPANT_RELEASE_PRIORITY,
        timeoutMs: prepared.timeoutMs});
    const answer = participantReleaseDeliveryAnswer(delivery, prepared, nodeId);
    if (trace) {
      const transport = deliveryTransportOf(delivery);
      recordReleaseHop(trace, phase, {messageId: transport.messageId, nodeId,
        elapsedMs: performance.now() - start, outcome: releaseDiagnosticText(answer, 'outcome'),
        missingFact: releaseDiagnosticText(answer, 'missingFact'), deliveryState: transport.deliveryState});
    }
    return answer;
  } catch (error) {
    const delivery = classifyThrownDeliveryError(error);
    if (trace) recordReleaseHop(trace, phase, {messageId: delivery.messageId ?? null, nodeId,
      elapsedMs: performance.now() - start, deliveryState: delivery.deliveryState,
      reasonCode: delivery.reasonCode});
    const reason = prepared.observation &&
      delivery.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT ?
      delivery.reasonCode : String(error?.message ?? error);
    return observationUnavailable(prepared.request, nodeId, reason);
  }
}

async function requestParticipantRelease(owner, request, trace, phase) {
  const payload = {...request, action: ACTION.RELEASE};
  const first = await askParticipantRelease(owner, request.nodeId ?? owner.nodeId, payload, trace, phase);
  if (first.outcome !== OUTCOME.NOT_LEADER) return first;
  const nodeId = releaseNodeOfAddress(first.leaderAddress);
  return nodeId === null ? first : askParticipantRelease(owner, nodeId,
    {...payload, replicaId: first.leaderReplicaId}, trace, phase);
}

// Completion owns response interpretation; clocks only execute the caller's
// existing now/sleep substrate. Every attempt retains the original authority.
function retainFirstReleaseObservation(current, value) {
  return current === null && value !== undefined ? value : current;
}

async function completeParticipantRelease(owner, request, clock) {
  const intent = objectFreeze({...request});
  const deadline = intent.deadlineAtMs;
  const seed = intent.trigger === TRIGGER.FRESH_SEED;
  let answer;
  let completion;
  let attemptCount = 0;
  let firstBlockedDrain = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  let firstJoinedAttempt = EMPTY_PARTICIPANT_RELEASE_DIAGNOSTIC_OBSERVATION;
  do {
    attemptCount += 1;
    answer = await requestParticipantRelease(owner, intent, clock.trace);
    if (seed) {
      firstBlockedDrain = retainFirstReleaseObservation(firstBlockedDrain, answer.blockedDrain);
      firstJoinedAttempt = retainFirstReleaseObservation(firstJoinedAttempt, answer.joinedAttempt);
    }
    const outcome = answer.outcome;
    if (outcome === OUTCOME.CUT_OVER) {
      completion = {completed: true, outcome};
      break;
    }
    const retryAfterMs = outcome === OUTCOME.NOT_LEADER ?
      BOUND.PAUSE_RETRY_AFTER_MS : answer.retryAfterMs;
    completion = {completed: false, outcome, retryAfterMs};
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0 ||
        clock.now() + retryAfterMs > deadline) break;
    const remaining = deadline - clock.now();
    // Seed historically executes a zero wait if preparation itself reaches D;
    // fresh CREATE stops there. A completed wait at D permits either final call.
    if (!seed && remaining <= 0) break;
    await clock.sleep(mathMin(retryAfterMs, mathMax(0, remaining)));
  } while (clock.now() <= deadline);
  return {answer, ...completion, attemptCount, firstBlockedDrain, firstJoinedAttempt};
}

export {askParticipantRelease, completeParticipantRelease, participantReleaseAbsoluteClockValid,
  participantReleaseRequestBudget, participantReleaseWaitRemainingMs,
  releaseNodeOfAddress, requestParticipantRelease};
