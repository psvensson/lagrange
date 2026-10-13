// One bounded passive observation per currently hosted replica. Wakes carry
// no authority: every pass re-reads the canonical participant-release facts.
import {RAFT_EVENT} from '../raft/constants.js';
import {PARTITION_SERVICE_EVENT} from
  '../partition/partition-service-constants.js';
import {originEqual, releaseAnswer, sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {readParticipantReleaseFacts} from
  '../partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../transport/transport-semantic-outcome.js';
import {participantReleaseRequestBudget} from './participant-release-client.js';
import {participantReleaseClockMeasured, readParticipantReleaseClock} from
  './participant-release-diagnostic-observation.js';

const OBSERVATIONS = new WeakMap();

function sameAttempt(left, right) {
  return left?.term === right?.term &&
    left?.leaderReplicaId === right?.leaderReplicaId &&
    left?.leaderLifecycleIncarnation === right?.leaderLifecycleIncarnation &&
    left?.deadlineAtMs === right?.deadlineAtMs;
}

function matchingObservation(record, request) {
  return record.request.partitionId === request.partitionId &&
    record.request.replicaId === request.replicaId &&
    record.request.release?.releaseId === request.release?.releaseId &&
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

function removeServiceListener(service, eventName, listener) {
  try {
    if (typeof service?.off === 'function') service.off(eventName, listener);
    else service?.removeListener?.(eventName, listener);
  } catch {
    // Lifecycle callbacks are passive and cannot throw into their owner.
  }
}

function discharge(record, answer) {
  if (!record.active) return;
  record.active = false;
  try {
    record.handler.timeSource.clearTimeout(record.timer);
  } catch {
    // The settlement still owns every remaining cleanup attempt.
  }
  for (const unsubscribe of record.unsubscribes) {
    try {
      unsubscribe();
    } catch {
      // A passive unsubscribe cannot mask the typed terminal answer.
    }
  }
  removeServiceListener(record.service,
    PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, record.serviceShutdown);
  const records = OBSERVATIONS.get(record.handler);
  if (records?.get(record.request.replicaId) === record) {
    records.delete(record.request.replicaId);
    if (records.size === 0) OBSERVATIONS.delete(record.handler);
  }
  record.resolve(answer);
}

function lifecycleCurrent(record) {
  return record.active && record.handler.shuttingDown !== true &&
    record.service.isShutdown !== true && record.service.initialized === true &&
    record.service.raft === record.port &&
    record.handler.localServices.get(record.request.replicaId) === record.service;
}

function clockAnswer(record) {
  const observed = readParticipantReleaseClock(record.handler.timeSource);
  if (!participantReleaseClockMeasured(observed)) return unavailable(record.request);
  if (observed.value < record.deadlineAtMs) return null;
  return record.deadlineAtMs === record.request.deadlineAtMs ?
    releaseAnswer(OUTCOME.UNAVAILABLE, record.request,
      {missingFact: 'release_deadline'}) :
    unavailable(record.request,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
}

const REFRESH_AGAIN = Symbol('refresh-again');
const WAIT_FOR_WAKE = Symbol('wait-for-wake');

async function observeOnce(record) {
  record.dirty = false;
  if (!lifecycleCurrent(record)) return releaseAnswer(OUTCOME.STALE, record.request);
  const facts = await readParticipantReleaseFacts(record.handler, record.service);
  if (!record.active) return WAIT_FOR_WAKE;
  if (!lifecycleCurrent(record)) return releaseAnswer(OUTCOME.STALE, record.request);
  const expired = clockAnswer(record);
  if (expired !== null) return expired;
  const refusal = record.validate(record.handler, record.service, record.request, facts);
  if (refusal !== null) {
    return facts.outcome === OUTCOME.UNAVAILABLE && record.dirty ?
      REFRESH_AGAIN : refusal;
  }
  if (record.dirty) return REFRESH_AGAIN;
  return facts.membership.appliedIndex >= record.request.origin.originIndex ?
    facts : WAIT_FOR_WAKE;
}

async function runRefresh(record) {
  while (record.active) {
    const result = await observeOnce(record);
    if (result === REFRESH_AGAIN) continue;
    if (result !== WAIT_FOR_WAKE) discharge(record, result);
    return;
  }
}

async function refresh(record) {
  if (record.refreshing || !record.active) return;
  record.refreshing = true;
  try {
    await runRefresh(record);
  } catch (error) {
    discharge(record, releaseAnswer(OUTCOME.INVALID, record.request,
      {reason: String(error?.message ?? error)}));
  } finally {
    record.refreshing = false;
    if (record.active && record.dirty) void refresh(record);
  }
}

function wake(record) {
  if (!record.active) return;
  record.dirty = true;
  void refresh(record);
}

function installObservation(record, records) {
  const wakeRecord = () => wake(record);
  records.set(record.request.replicaId, record);
  try {
    for (const eventName of [RAFT_EVENT.APPLIED_PROGRESS, RAFT_EVENT.TERM_CHANGE,
      RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.MEMBERSHIP_CHANGED]) {
      record.unsubscribes.push(record.port.subscribe(eventName, wakeRecord));
    }
    record.unsubscribes.push(record.handler.localServices.subscribeServiceChanges(
      (change) => {
        if (change.replicaId === record.request.replicaId) wake(record);
      }));
    record.service.on(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED,
      record.serviceShutdown);
    record.timer = record.handler.timeSource.setTimeout(() => {
      const answer = clockAnswer(record) ?? unavailable(record.request);
      discharge(record, answer);
    }, record.timeoutMs);
    record.timer?.unref?.();
    void refresh(record);
  } catch {
    discharge(record, unavailable(record.request));
  }
}

function newObservation(handler, service, request, validate, records) {
  if (!originEqual(request.origin, request.origin)) {
    return releaseAnswer(OUTCOME.INVALID, request);
  }
  const budget = participantReleaseRequestBudget(handler, request.deadlineAtMs,
    request.observationDeadlineAtMs);
  if (budget === null) return unavailable(request);
  if (budget.timeoutMs <= 0) {
    return budget.nowMs >= request.deadlineAtMs ?
      releaseAnswer(OUTCOME.UNAVAILABLE, request, {missingFact: 'release_deadline'}) :
      unavailable(request, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
  }
  const settlement = Promise.withResolvers();
  const record = {handler, service, port: service.raft, request, validate,
    resolve: settlement.resolve,
    promise: settlement.promise, deadlineAtMs: budget.observationDeadlineAtMs,
    timeoutMs: budget.timeoutMs, active: true, dirty: true, refreshing: false,
    timer: null, unsubscribes: []};
  record.serviceShutdown = () =>
    discharge(record, releaseAnswer(OUTCOME.STALE, request));
  installObservation(record, records);
  return record.promise;
}

function observeParticipantAppliedPosition(handler, service, request, validate) {
  let records = OBSERVATIONS.get(handler);
  if (records === undefined) {
    records = new Map();
    OBSERVATIONS.set(handler, records);
  }
  const current = records.get(request.replicaId);
  if (current !== undefined) {
    return matchingObservation(current, request) ? current.promise :
      releaseAnswer(OUTCOME.STALE, request);
  }
  return newObservation(handler, service, request, validate, records);
}

function cancelParticipantAppliedPositionObservations(handler) {
  const records = OBSERVATIONS.get(handler);
  if (records === undefined) return;
  for (const record of [...records.values()]) {
    discharge(record, releaseAnswer(OUTCOME.STALE, record.request));
  }
}

export {cancelParticipantAppliedPositionObservations,
  observeParticipantAppliedPosition};
