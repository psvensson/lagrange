import {performance} from 'node:perf_hooks';

import {
  executePairedOltpTransactionWithRetry,
} from './oltp-paired-retry-owner.js';
import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  BENCHMARK_UNRESOLVED_REASON,
  computeExecutedOperationsDigest,
  benchmarkCompletedPerSec,
  benchmarkOperationId,
  buildBenchmarkAttemptRecord,
  classifyBenchmarkAttemptFailure,
  createBenchmarkHarnessFault,
  retainBenchmarkResponseEvidence,
  summarizeBenchmarkLatencies,
  validateBenchmarkAccounting,
} from './benchmark-operation-outcome.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);

const ZERO = 0;
const ONE = 1;
const THOUSAND = 1000;

// v2 supersedes scenario-a-open-loop-v1 (R09): v1 recorded `succeeded` for
// any resolved adapter promise and awaited every request, so a request that
// never answered blocked the summary and a run had no unissued/unresolved
// state. v2 consumes typed attempt outcomes, adds the unissued/unresolved
// accounting states and a run-level watchdog that stops issuing and still
// summarises.
const OPEN_LOOP_PROFILE = Object.freeze({
  id: 'scenario-a-open-loop-v2',
  supersedes: 'scenario-a-open-loop-v1',
  supersededBecause:
    'v1 counted any resolved promise as succeeded and could not stop issuing; v2 consumes ' +
    'typed outcomes and adds unissued/unresolved accounting under a run watchdog',
  issueSchedule: 'fixed-rate-intended-time',
  workerSerialization: 'per-worker',
  latencyOrigin: 'intended-issue-time',
  headlineLatency: 'committed-requests',
  attemptLatency: 'completed-issued-requests',
  completionRateWindow: 'max-scheduled-and-drain',
  watchdog: 'run-level-bound-stops-issuing',
});

// The schedule and the request clock share one monotonic origin, so a request
// can never act before its intended issue time; a negative interval is a
// harness defect and is refused instead of clamped to zero.
function elapsedSinceIntended(entry, observedMs, field) {
  const elapsed = observedMs - entry.intendedIssueTimeMs;
  if (!Number.isFinite(elapsed) || elapsed < ZERO) {
    throw new Error(`open-loop request ${entry.index} ${field} precedes its intended issue time`);
  }
  return elapsed;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= ZERO) {
    throw new Error(`${label} must be a positive number`);
  }
  return number;
}

function workerIdOf(operation) {
  const workerId = Number(operation?.workerId);
  if (!Number.isInteger(workerId) || workerId < ONE) {
    throw new Error('Open-loop OLTP operation requires workerId >= 1');
  }
  return workerId;
}

function buildOpenLoopIssuePlan(
  operations,
  offeredRatePerSec,
  startTimeMs = ZERO,
) {
  if (!Array.isArray(operations) || operations.length === ZERO) {
    throw new Error('Open-loop OLTP step requires operations');
  }
  const rate = positiveNumber(offeredRatePerSec, 'offeredRatePerSec');
  const start = Number(startTimeMs);
  if (!Number.isFinite(start)) {
    throw new Error('Open-loop OLTP step requires finite startTimeMs');
  }
  const intervalMs = THOUSAND / rate;
  return Object.freeze(arrayMap(operations, (operation, index) => Object.freeze({
    index,
    operation,
    workerId: workerIdOf(operation),
    intendedIssueTimeMs: start + index * intervalMs,
  })));
}

function interleaveOltpWorkerPhase(workerPlans, phase = 'measurement') {
  if (!Array.isArray(workerPlans) || workerPlans.length === ZERO) {
    throw new Error('Open-loop OLTP interleave requires worker plans');
  }
  const queues = arrayMap(workerPlans, (worker) => {
    const operations = worker?.[phase];
    if (!Array.isArray(operations)) {
      throw new Error(`Open-loop OLTP worker is missing phase ${phase}`);
    }
    return operations;
  });
  const maxLength = Math.max(...arrayMap(queues, (operations) => operations.length));
  const result = [];
  for (let sequence = ZERO; sequence < maxLength; sequence += ONE) {
    for (const operations of queues) {
      if (sequence < operations.length) result.push(operations[sequence]);
    }
  }
  return Object.freeze(result);
}

async function defaultSleep(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Timers may fire a fraction early against the monotonic clock: wait until
// the clock has reached the intended time.
async function defaultWaitUntil(targetTimeMs, now, sleep) {
  for (let delayMs = targetTimeMs - now(); delayMs > ZERO; delayMs = targetTimeMs - now()) {
    await sleep(Math.max(ONE, Math.ceil(delayMs)));
  }
}

function createRequestState(entry) {
  return {
    entry,
    opId: benchmarkOperationId(entry.operation),
    issuedAtMs: null,
    executionStartedAtMs: null,
    completedAtMs: null,
    attemptInFlight: false,
    inFlightAttempt: null,
    attempts: [],
    final: null,
    retryEvidence: null,
    effectSummary: null,
  };
}

function lastAttempt(state) {
  return state.attempts.length > ZERO ? state.attempts[state.attempts.length - ONE] : null;
}

// A request's logical outcome on a normal finish: the retry owner returned
// (committed) or threw; the last attempt's typed classification decides.
function settleFromError(state) {
  const attempt = lastAttempt(state);
  if (!attempt) {
    return {
      outcome: OPERATION_OUTCOME.TERMINAL_FAILURE,
      failureClass: FAILURE_CLASS.HARNESS_FAULT,
      unresolvedReason: undefined,
    };
  }
  return {
    outcome: attempt.outcome,
    failureClass: attempt.failureClass,
    unresolvedReason: attempt.outcome === OPERATION_OUTCOME.UNRESOLVED ?
      BENCHMARK_UNRESOLVED_REASON.COMMIT_ANSWER_LOST : undefined,
  };
}

function stopDisposition(state) {
  if (state.final) return state.final;
  if (state.executionStartedAtMs === null) {
    return {outcome: OPERATION_OUTCOME.UNISSUED, failureClass: null};
  }
  return {
    outcome: OPERATION_OUTCOME.UNRESOLVED,
    failureClass: FAILURE_CLASS.WATCHDOG_STOPPED,
    unresolvedReason: state.attemptInFlight ?
      BENCHMARK_UNRESOLVED_REASON.WATCHDOG_IN_FLIGHT :
      BENCHMARK_UNRESOLVED_REASON.WATCHDOG_BETWEEN_ATTEMPTS,
  };
}

// The attempt the watchdog found on the wire: its outcome is unresolved and
// it has no end.
// Its end is the moment the watchdog closed it (closedByWatchdog), not an
// observed answer.
function inFlightAttemptRecord(state, closedAtMs) {
  return buildBenchmarkAttemptRecord({
    attemptNo: state.inFlightAttempt.attemptNo,
    startedMs: state.inFlightAttempt.startedMs,
    endedMs: closedAtMs,
    closedByWatchdog: true,
    outcome: OPERATION_OUTCOME.UNRESOLVED,
    failureClass: FAILURE_CLASS.WATCHDOG_STOPPED,
    statements: [],
  });
}

// An issued request that did not commit has no committed effect: a named
// state, never an absent summary.
const NO_COMMITTED_EFFECT = Object.freeze({status: 'no-committed-effect'});

function freezeRequestRecord(state, disposition, evidenceOptions, closedAtMs = null) {
  const {entry} = state;
  const completedAtMs = state.final ? state.completedAtMs : null;
  const attempts = !state.final && state.attemptInFlight ?
    [...state.attempts, inFlightAttemptRecord(state, closedAtMs)] : state.attempts;
  const retained = retainBenchmarkResponseEvidence(attempts, evidenceOptions);
  const attemptOf = attempts.length > ZERO ? attempts[attempts.length - ONE] : null;
  return Object.freeze({
    index: entry.index,
    opId: state.opId,
    phase: entry.operation.phase,
    workerId: entry.workerId,
    sequence: entry.operation.sequence,
    operationKind: entry.operation.kind,
    intendedStartMs: entry.intendedIssueTimeMs,
    issuedAtMs: state.issuedAtMs,
    executionStartedAtMs: state.executionStartedAtMs,
    completedAtMs,
    issueLagMs: state.issuedAtMs === null ? null :
      elapsedSinceIntended(entry, state.issuedAtMs, 'issuedAtMs'),
    queueDelayMs: state.executionStartedAtMs === null ? null :
      elapsedSinceIntended(entry, state.executionStartedAtMs, 'executionStartedAtMs'),
    latencyMs: completedAtMs === null ? null :
      elapsedSinceIntended(entry, completedAtMs, 'completedAtMs'),
    outcome: disposition.outcome,
    failureClass: disposition.failureClass ?? null,
    ...(disposition.unresolvedReason ? {unresolvedReason: disposition.unresolvedReason} : {}),
    // Retries are the attempts after the first, counted from the attempt records.
    retries: state.attempts.length === ZERO ? ZERO : state.attempts.length - ONE,
    retryDelayMs: state.retryEvidence?.retryDelayMs ?? null,
    effectSummary: effectSummaryOf(state, disposition),
    endpoint: attemptOf?.endpoint ?? null,
    serverConnectionId: attemptOf?.serverConnectionId ?? null,
    attempts: Object.freeze(retained.attempts),
    responseEvidence: retained.responseEvidence,
  });
}

function effectSummaryOf(state, disposition) {
  if (disposition.outcome === OPERATION_OUTCOME.UNISSUED) return null;
  if (disposition.outcome === OPERATION_OUTCOME.COMMITTED) return state.effectSummary;
  return NO_COMMITTED_EFFECT;
}

function typedAttemptOf(value) {
  if (value?.outcome !== OPERATION_OUTCOME.COMMITTED || !value.attemptEvidence) {
    throw createBenchmarkHarnessFault(
      'Open-loop OLTP adapter resolved without a typed committed outcome');
  }
  return value;
}

// After the watchdog fired the request record is closed: a late answer is
// kept beside it, never folded into it.
function recordLateCompletion(run, state, observedOutcome) {
  run.lateCompletions.push(Object.freeze({
    opId: state.opId,
    observedOutcome,
    observedAtMs: run.now(),
  }));
}

async function executeTypedAttempt(adapter, state, run, attemptNo) {
  if (run.stopped) {
    throw createBenchmarkHarnessFault('Open-loop OLTP step stopped issuing');
  }
  const startedMs = run.now();
  state.attemptInFlight = true;
  state.inFlightAttempt = {attemptNo, startedMs};
  try {
    const typed = typedAttemptOf(await adapter.executeTransaction(state.entry.operation));
    if (run.stopped) {
      recordLateCompletion(run, state, OPERATION_OUTCOME.COMMITTED);
      return typed;
    }
    state.attempts.push(buildBenchmarkAttemptRecord({
      ...typed.attemptEvidence,
      attemptNo,
      startedMs,
      endedMs: run.now(),
      outcome: OPERATION_OUTCOME.COMMITTED,
      result: typed.result,
    }));
    state.effectSummary = typed.result ?? null;
    return typed;
  } catch (error) {
    const evidence = error?.benchmarkAttemptEvidence || {};
    const classified = classifyBenchmarkAttemptFailure(error, evidence);
    if (run.stopped) {
      recordLateCompletion(run, state, classified.outcome);
      throw error;
    }
    state.attempts.push(buildBenchmarkAttemptRecord({
      ...evidence,
      ...classified,
      attemptNo,
      startedMs,
      endedMs: run.now(),
    }));
    throw error;
  } finally {
    if (!run.stopped) state.attemptInFlight = false;
  }
}

async function runRequest(adapter, state, run) {
  state.executionStartedAtMs = run.now();
  try {
    const outcome = await executePairedOltpTransactionWithRetry({
      intendedIssueTimeMs: state.entry.intendedIssueTimeMs,
      now: run.now,
      ...(run.retrySleep ? {sleep: run.retrySleep} : {}),
      executeAttempt: ({attempts}) => executeTypedAttempt(adapter, state, run, attempts),
    });
    if (run.stopped) return;
    state.retryEvidence = outcome.evidence;
    state.completedAtMs = outcome.evidence.completedAtMs;
    state.final = {outcome: OPERATION_OUTCOME.COMMITTED, failureClass: null};
  } catch (error) {
    if (run.stopped) return;
    state.retryEvidence = error?.oltpRetryEvidence ?? null;
    // With retry evidence the retry owner recorded the end; without it the error
    // came from outside the retry owner and the request ended when it surfaced.
    state.completedAtMs = state.retryEvidence ? state.retryEvidence.completedAtMs : run.now();
    state.final = settleFromError(state);
  }
}

function createStopSignal() {
  let resolveStop;
  const promise = new Promise((resolve) => {
    resolveStop = resolve;
  });
  return {promise, resolve: resolveStop};
}

function defaultWatchdogTimer(callback, delayMs) {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

// The run-level bound: when it fires the step stops issuing, closes every
// record as it stands and summarises. It never completes a request.
function armWatchdog(run, boundOffsetMs, firstIntendedMs, setTimer) {
  const deadlineMs = firstIntendedMs + boundOffsetMs;
  const cancel = setTimer(() => {
    if (run.finished || run.stopped) return;
    run.stopped = true;
    run.stoppedAtMs = run.now();
    run.stop.resolve();
  }, Math.max(ZERO, deadlineMs - run.now()));
  return {deadlineMs, cancel};
}

function summarizeWindow(issuePlan, records, offeredRatePerSec, run) {
  const firstIssueMs = issuePlan[ZERO].intendedIssueTimeMs;
  const scheduledMs = (issuePlan.length * THOUSAND) / offeredRatePerSec;
  const completions = arrayMap(
    arrayFilter(records, (record) => record.completedAtMs !== null),
    ({completedAtMs}) => completedAtMs);
  const lastObservedMs = run.stopped ? run.stoppedAtMs :
    (completions.length > ZERO ? Math.max(...completions) : firstIssueMs);
  const drainMs = Math.max(ZERO, lastObservedMs - firstIssueMs);
  return Object.freeze({
    scheduledMs,
    drainMs,
    drainOverrunMs: Math.max(ZERO, drainMs - scheduledMs),
    accountingWindowMs: Math.max(scheduledMs, drainMs),
  });
}

function summarizeOpenLoopStep(issuePlan, states, run, options) {
  const records = Object.freeze(arrayMap(states, (state) =>
    freezeRequestRecord(state, stopDisposition(state), options.evidence, run.stoppedAtMs)));
  const accounting = validateBenchmarkAccounting(records);
  const window = summarizeWindow(issuePlan, records, options.offeredRatePerSec, run);
  const wallClockOf = (monotonicMs) => new Date(
    Date.parse(run.originWallClockIso) + (monotonicMs - run.originMs)).toISOString();
  const firstIntendedMs = issuePlan[ZERO].intendedIssueTimeMs;
  return Object.freeze({
    profileId: OPEN_LOOP_PROFILE.id,
    offeredRatePerSec: options.offeredRatePerSec,
    clock: Object.freeze({
      monotonicOriginMs: run.originMs,
      monotonicOriginWallClockIso: run.originWallClockIso,
    }),
    accounting,
    window: Object.freeze({
      ...window,
      startedAt: wallClockOf(firstIntendedMs),
      endedAt: wallClockOf(firstIntendedMs + window.drainMs),
    }),
    watchdog: Object.freeze({
      boundMs: options.watchdog.boundMs,
      derivation: options.watchdog.derivation,
      deadlineMs: run.watchdogDeadlineMs,
      fired: run.stopped,
      firedAtMs: run.stopped ? run.stoppedAtMs : null,
    }),
    completedPerSec: benchmarkCompletedPerSec(accounting.committed, window.accountingWindowMs),
    ...summarizeBenchmarkLatencies(records, accounting),
    executedOperationsDigest: computeExecutedOperationsDigest(records),
    records,
    // Completions observed after the watchdog fired: the request stays
    // unresolved; this live list keeps the late fact beside it.
    lateCompletions: run.lateCompletions,
  });
}

function requireWatchdog(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Open-loop OLTP step requires a run watchdog');
  }
  positiveNumber(value.boundMs, 'watchdog.boundMs');
  if (!value.derivation || typeof value.derivation !== 'object') {
    throw new Error('Open-loop OLTP step watchdog requires its derivation');
  }
  return value;
}

function createRun(options, now) {
  return {
    now,
    retrySleep: options.retrySleep,
    stopped: false,
    finished: false,
    stoppedAtMs: null,
    stop: createStopSignal(),
    originMs: now(),
    originWallClockIso: new Date().toISOString(),
    lateCompletions: [],
    watchdogDeadlineMs: null,
  };
}

async function scheduleRequests(adapter, issuePlan, states, run, waitUntil) {
  const workerQueues = new Map();
  for (const state of states) {
    if (run.stopped) break;
    await Promise.race([waitUntil(state.entry.intendedIssueTimeMs), run.stop.promise]);
    if (run.stopped) break;
    state.issuedAtMs = run.now();
    if (state.issuedAtMs < state.entry.intendedIssueTimeMs) {
      throw new Error('Open-loop OLTP scheduler returned before intended issue time');
    }
    const previous = workerQueues.get(state.entry.workerId) || Promise.resolve();
    workerQueues.set(state.entry.workerId, previous.then(async () => {
      if (run.stopped) return;
      await runRequest(adapter, state, run);
    }));
  }
  return [...workerQueues.values()];
}

async function runOpenLoopOltpStep(adapter, operations, options = {}) {
  if (!adapter || typeof adapter.executeTransaction !== 'function') {
    throw new Error('Open-loop OLTP step requires adapter.executeTransaction');
  }
  const now = options.now || (() => performance.now());
  const schedulerSleep = options.schedulerSleep || defaultSleep;
  const waitUntil = options.waitUntil || ((targetTimeMs) =>
    defaultWaitUntil(targetTimeMs, now, schedulerSleep));
  const offeredRatePerSec = positiveNumber(options.offeredRatePerSec, 'offeredRatePerSec');
  const watchdog = requireWatchdog(options.watchdog);
  const run = createRun(options, now);
  const startTimeMs = options.startTimeMs ?? run.originMs;
  const issuePlan = buildOpenLoopIssuePlan(operations, offeredRatePerSec, startTimeMs);
  const states = arrayMap(issuePlan, createRequestState);
  const armed = armWatchdog(run, watchdog.boundMs, issuePlan[ZERO].intendedIssueTimeMs,
    options.setWatchdogTimer || defaultWatchdogTimer);
  run.watchdogDeadlineMs = armed.deadlineMs;

  const scheduling = scheduleRequests(adapter, issuePlan, states, run, waitUntil)
    .then((tasks) => Promise.allSettled(tasks));
  try {
    await Promise.race([scheduling, run.stop.promise]);
    if (!run.stopped) {
      const settled = await scheduling;
      const rejected = arrayFind(settled, (result) => result.status === 'rejected');
      if (rejected) throw rejected.reason;
      run.finished = true;
    }
  } finally {
    armed.cancel();
  }
  return summarizeOpenLoopStep(issuePlan, states, run, {
    offeredRatePerSec,
    watchdog,
    evidence: options.evidence || {},
  });
}

// A step that never ran (its system could not be opened): every planned
// request is offered and unissued.
function buildUnissuedOpenLoopRecords(operations, offeredRatePerSec, startTimeMs = ZERO) {
  const issuePlan = buildOpenLoopIssuePlan(operations, offeredRatePerSec, startTimeMs);
  const records = Object.freeze(arrayMap(issuePlan, (entry) => freezeRequestRecord(
    createRequestState(entry),
    {outcome: OPERATION_OUTCOME.UNISSUED, failureClass: null},
    {},
  )));
  return Object.freeze({records, accounting: validateBenchmarkAccounting(records)});
}

export {
  OPEN_LOOP_PROFILE as OLTP_OPEN_LOOP_PROFILE,
  buildOpenLoopIssuePlan,
  buildUnissuedOpenLoopRecords,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
};
