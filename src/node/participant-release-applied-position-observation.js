// One bounded passive observation per currently hosted replica. Wakes carry
// no authority: every pass asks the canonical recipient for a fresh decision.
import {RAFT_EVENT} from '../raft/constants.js';
import {PARTITION_SERVICE_EVENT} from
  '../partition/partition-service-constants.js';
import {originEqual, releaseAnswer, sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_REASON as REASON} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {participantReleaseAbsoluteClockValid, participantReleaseRequestBudget} from
  './participant-release-client.js';
import {participantReleaseClockMeasured, readParticipantReleaseClock} from
  './participant-release-diagnostic-observation.js';

const OBSERVATIONS = new WeakMap();
const reflectApply = Reflect.apply;
const SLOT_STATE = Object.freeze({
  RETIRED: 'retired', PENDING: 'pending', OWNED: 'owned', FAILED: 'failed',
});
const RAFT_WAKE_EVENTS = Object.freeze([
  RAFT_EVENT.APPLIED_PROGRESS, RAFT_EVENT.TERM_CHANGE,
  RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.MEMBERSHIP_CHANGED,
]);
const REFRESH_AGAIN = Symbol('refresh-again');
const WAIT_FOR_WAKE = Symbol('wait-for-wake');

function sameAttempt(left, right) {
  return left.term === right.term &&
    left.leaderReplicaId === right.leaderReplicaId &&
    left.leaderLifecycleIncarnation === right.leaderLifecycleIncarnation &&
    left.deadlineAtMs === right.deadlineAtMs;
}

function matchingObservation(record, request) {
  return record.request.action === request.action &&
    record.request.partitionId === request.partitionId &&
    record.request.replicaId === request.replicaId &&
    record.request.release.releaseId === request.release.releaseId &&
    record.request.deadlineAtMs === request.deadlineAtMs &&
    record.request.observationDeadlineAtMs === request.observationDeadlineAtMs &&
    sameAttempt(record.request.attempt, request.attempt) &&
    sameReplicaGeneration(record.request.target, request.target) &&
    originEqual(record.request.origin, request.origin);
}

function unavailable(request, reason = null) {
  return releaseAnswer(OUTCOME.UNAVAILABLE, request,
    {missingFact: 'replica_release_reply',
      ...(reason === null ? {} : {reason}),
      retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
}

function newSlot(name) {
  return {name, state: SLOT_STATE.RETIRED, release: null,
    releasing: false, hasError: false, error: null};
}

function newResourceSlots() {
  return [
    ...RAFT_WAKE_EVENTS.map((eventName) => newSlot(`raft:${eventName}`)),
    newSlot('service-registry'), newSlot('service-shutdown'), newSlot('timer'),
  ];
}

function currentCleanupErrors(record) {
  return record.resources.flatMap((slot) =>
    slot.state === SLOT_STATE.FAILED && slot.hasError ? [slot.error] : []);
}

function cleanupSlot(slot) {
  if (slot.state === SLOT_STATE.RETIRED || slot.state === SLOT_STATE.PENDING ||
      slot.releasing) return;
  if (slot.release === null) return;
  slot.releasing = true;
  try {
    slot.release();
    slot.state = SLOT_STATE.RETIRED;
    slot.release = null;
    slot.hasError = false;
    slot.error = null;
  } catch (error) {
    slot.state = SLOT_STATE.FAILED;
    if (!slot.hasError) {
      slot.hasError = true;
      slot.error = error;
    }
  } finally {
    slot.releasing = false;
  }
}

function removeExactRecord(record) {
  const records = OBSERVATIONS.get(record.handler);
  if (records?.get(record.request.replicaId) !== record) return;
  records.delete(record.request.replicaId);
  if (records.size === 0) OBSERVATIONS.delete(record.handler);
}

function finishRecord(record) {
  for (const slot of record.resources) cleanupSlot(slot);
  if (record.installing || record.resources.some((slot) =>
    slot.state === SLOT_STATE.PENDING || slot.releasing)) return;
  const failures = currentCleanupErrors(record);
  if (!record.settled) {
    record.settled = true;
    record.resolve(failures.length === 0 ? record.terminalAnswer :
      unavailable(record.request, REASON.CLEANUP_INCOMPLETE));
  }
  if (failures.length === 0) removeExactRecord(record);
}

function terminal(record, answer) {
  if (record.active) {
    record.active = false;
    record.terminalAnswer = answer;
  }
  finishRecord(record);
}

function lifecycleCurrent(record) {
  return record.active && record.handler.shuttingDown !== true &&
    record.service.isShutdown !== true && record.service.initialized === true &&
    record.service.raft === record.port &&
    record.handler.localServices.get(record.request.replicaId) === record.service;
}

function clockAnswer(record) {
  const observed = readParticipantReleaseClock(record.scheduler);
  if (!participantReleaseClockMeasured(observed) ||
      !participantReleaseAbsoluteClockValid(observed.value)) {
    return unavailable(record.request);
  }
  if (observed.value >= record.request.deadlineAtMs) {
    return releaseAnswer(OUTCOME.UNAVAILABLE, record.request,
      {missingFact: 'release_deadline'});
  }
  return observed.value >= record.deadlineAtMs ? unavailable(record.request,
    TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT) : null;
}

async function observeOnce(record) {
  record.dirty = false;
  if (!lifecycleCurrent(record)) return releaseAnswer(OUTCOME.STALE, record.request);
  const decision = await record.decide(record.handler, record.service,
    record.request, record.port);
  if (!record.active) return WAIT_FOR_WAKE;
  if (!lifecycleCurrent(record)) return releaseAnswer(OUTCOME.STALE, record.request);
  const expired = clockAnswer(record);
  if (expired !== null) return expired;
  const {answer, refreshEligible} = decision;
  if (answer.outcome !== OUTCOME.OBSERVED) {
    return refreshEligible && record.dirty ? REFRESH_AGAIN : answer;
  }
  if (answer.membership.appliedIndex >= record.request.origin.originIndex) return answer;
  return record.dirty ? REFRESH_AGAIN : WAIT_FOR_WAKE;
}

async function refresh(record) {
  if (record.refreshing || !record.active) return;
  record.refreshing = true;
  try {
    while (record.active) {
      const result = await observeOnce(record);
      if (result === REFRESH_AGAIN) continue;
      if (result !== WAIT_FOR_WAKE) terminal(record, result);
      break;
    }
  } catch (error) {
    terminal(record, releaseAnswer(OUTCOME.INVALID, record.request,
      {reason: String(error?.message ?? error)}));
  } finally {
    record.refreshing = false;
    if (record.active && record.dirty) void refresh(record);
  }
}

function wake(record) {
  if (!record.active) {
    finishRecord(record);
    return;
  }
  record.dirty = true;
  if (record.installing) return;
  void refresh(record);
}

function acquireSlot(record, slot, acquire) {
  slot.state = SLOT_STATE.PENDING;
  try {
    const release = acquire();
    if (typeof release !== 'function') throw new TypeError(`${slot.name} release missing`);
    slot.release = release;
    slot.state = SLOT_STATE.OWNED;
    if (!record.active) finishRecord(record);
    else if (!lifecycleCurrent(record)) {
      terminal(record, releaseAnswer(OUTCOME.STALE, record.request));
    }
  } catch (error) {
    slot.state = SLOT_STATE.FAILED;
    if (!slot.hasError) {
      slot.hasError = true;
      slot.error = error;
    }
    terminal(record, unavailable(record.request));
  }
  return record.active;
}

function raftSubscription(record, slot, eventName) {
  return acquireSlot(record, slot, () => record.port.subscribe(eventName,
    () => wake(record)));
}

function registrySubscription(record, slot) {
  return acquireSlot(record, slot, () =>
    record.handler.localServices.subscribeServiceChanges((change) => {
      if (change.replicaId !== record.request.replicaId) return;
      if (change.service !== record.service) {
        terminal(record, releaseAnswer(OUTCOME.STALE, record.request));
        return;
      }
      wake(record);
    }));
}

function serviceShutdownSubscription(record, slot) {
  return acquireSlot(record, slot, () => {
    const service = record.service;
    const remove = typeof service.off === 'function' ? service.off : service.removeListener;
    if (typeof service.on !== 'function' || typeof remove !== 'function') {
      throw new TypeError('service shutdown listener owner unavailable');
    }
    const listener = () => terminal(record, releaseAnswer(OUTCOME.STALE, record.request));
    reflectApply(service.on, service, [PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, listener]);
    return () => reflectApply(remove, service,
      [PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, listener]);
  });
}

function timerSubscription(record, slot) {
  slot.state = SLOT_STATE.PENDING;
  let fired = false;
  try {
    const handle = record.scheduler.setTimeout(() => {
      fired = true;
      slot.state = SLOT_STATE.RETIRED;
      slot.release = null;
      const answer = clockAnswer(record) ?? unavailable(record.request,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      terminal(record, answer);
    }, record.timeoutMs);
    if (!fired) {
      slot.release = () => record.scheduler.clearTimeout(handle);
      slot.state = SLOT_STATE.OWNED;
      handle?.unref?.();
    }
    if (!record.active) finishRecord(record);
    else if (!lifecycleCurrent(record)) {
      terminal(record, releaseAnswer(OUTCOME.STALE, record.request));
    }
  } catch (error) {
    slot.state = SLOT_STATE.FAILED;
    if (!slot.hasError) {
      slot.hasError = true;
      slot.error = error;
    }
    terminal(record, unavailable(record.request));
  }
}

function installObservation(record) {
  record.installing = true;
  let index = 0;
  for (const eventName of RAFT_WAKE_EVENTS) {
    if (!raftSubscription(record, record.resources[index], eventName)) break;
    index += 1;
  }
  if (record.active && registrySubscription(record, record.resources[4]) &&
      serviceShutdownSubscription(record, record.resources[5])) {
    timerSubscription(record, record.resources[6]);
  }
  record.installing = false;
  if (record.active) void refresh(record);
  else finishRecord(record);
}

function newObservation(handler, service, request, decide, records) {
  const scheduler = handler.timeSource;
  const budget = participantReleaseRequestBudget({timeSource: scheduler},
    request.deadlineAtMs, request.observationDeadlineAtMs);
  if (budget === null) return unavailable(request);
  if (budget.timeoutMs <= 0) {
    return budget.nowMs >= request.deadlineAtMs ?
      releaseAnswer(OUTCOME.UNAVAILABLE, request, {missingFact: 'release_deadline'}) :
      unavailable(request, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
  }
  if (records === undefined) {
    records = new Map();
    OBSERVATIONS.set(handler, records);
  }
  const settlement = Promise.withResolvers();
  const record = {handler, service, port: service.raft, scheduler, request, decide,
    resolve: settlement.resolve, promise: settlement.promise,
    deadlineAtMs: budget.observationDeadlineAtMs, timeoutMs: budget.timeoutMs,
    active: true, settled: false, terminalAnswer: null, dirty: false,
    refreshing: false, installing: false, resources: newResourceSlots()};
  records.set(request.replicaId, record);
  installObservation(record);
  return record.promise;
}

function observeParticipantAppliedPosition(handler, service, request, decide) {
  const records = OBSERVATIONS.get(handler);
  const current = records?.get(request.replicaId);
  if (current !== undefined) {
    const promise = current.promise;
    const matches = matchingObservation(current, request);
    if (matches && !current.active) finishRecord(current);
    return matches ? promise : releaseAnswer(OUTCOME.STALE, request);
  }
  return newObservation(handler, service, request, decide, records);
}

function cancelParticipantAppliedPositionObservations(handler) {
  const records = OBSERVATIONS.get(handler);
  if (records === undefined) return [];
  for (const record of [...records.values()]) {
    terminal(record, releaseAnswer(OUTCOME.STALE, record.request));
  }
  return [...records.values()].flatMap(currentCleanupErrors);
}

export {cancelParticipantAppliedPositionObservations,
  observeParticipantAppliedPosition};
