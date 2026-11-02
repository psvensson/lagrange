#!/usr/bin/env node
// Guard of the open-loop step owner, profile scenario-a-open-loop-v2:
// fixed-rate intended-time schedule, per-worker serialization, request clock
// from the intended issue time, typed attempt outcomes (a resolved promise
// is not a commit), retries inside the request clock, and a run watchdog
// that stops issuing and still summarises unissued/unresolved requests.
import assert from 'node:assert/strict';

import {
  OLTP_OPEN_LOOP_PROFILE,
  buildOpenLoopIssuePlan,
  buildUnissuedOpenLoopRecords,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
} from '../../test/distributed/harness/oltp-open-loop-step-owner.js';
import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  BENCHMARK_UNRESOLVED_REASON,
} from '../../test/distributed/harness/benchmark-operation-outcome.js';
import {
  OLTP_LATENCY_QUANTILE_METHOD,
  OLTP_OPERATION_KIND,
} from '../../test/distributed/harness/oltp-baseline-workload.js';

const objectFreeze = Object.freeze;
const arrayMap = Function.call.bind(Array.prototype.map);

const ONE = 1;
const TWO = 2;
const PASS_LINE = 'oltp-open-loop-step-owner-guard: PASS\n';
const RATE_100 = 100;
const START_1000 = 1000;
const WATCHDOG = objectFreeze({boundMs: 60, derivation: objectFreeze({rule: 'guard'})});
const COMMITTED = OPERATION_OUTCOME.COMMITTED;
const PHASE_MEASUREMENT = 'measurement';
const PROFILE_V2 = 'scenario-a-open-loop-v2';
const PROFILE_V1 = 'scenario-a-open-loop-v1';
const EXPECTED_INTENDED = objectFreeze([[1, 1000], [2, 1010], [1, 1020]]);
const TRANSACTION_MS = 4;
const BENCHMARK_FAILURE_CLASS_WATCHDOG = FAILURE_CLASS.WATCHDOG_STOPPED;
const WATCHDOG_OPERATIONS = 8;
const EVIDENCE = objectFreeze({
  endpoint: '10.0.0.1:5432',
  serverConnectionId: 7,
  commitSent: true,
  statements: objectFreeze([objectFreeze({sql: 'COMMIT', status: 'ok'})]),
});

function operation(workerId, sequence, kind = OLTP_OPERATION_KIND.PAYMENT) {
  return objectFreeze({phase: PHASE_MEASUREMENT, workerId, sequence, kind});
}

function typed(result = {paidCents: 1}) {
  return {outcome: COMMITTED, result, attemptEvidence: EVIDENCE};
}

function logicalClock(start) {
  const clock = {now: start, timers: []};
  clock.options = {
    startTimeMs: start,
    now: () => clock.now,
    waitUntil: async (target) => {
      await Promise.resolve();
      clock.now = Math.max(clock.now, target);
      for (const timer of [...clock.timers]) {
        if (clock.now >= timer.at && !timer.cancelled) {
          timer.cancelled = true;
          timer.callback();
        }
      }
    },
    setWatchdogTimer: (callback, delayMs) => {
      const timer = {callback, at: clock.now + delayMs, cancelled: false};
      clock.timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    retrySleep: async (delayMs) => {
      clock.now += delayMs;
    },
  };
  return clock;
}

function assertProfileSupersedesV1() {
  assert.equal(OLTP_OPEN_LOOP_PROFILE.id, PROFILE_V2);
  assert.equal(OLTP_OPEN_LOOP_PROFILE.supersedes, PROFILE_V1);
  assert.match(OLTP_OPEN_LOOP_PROFILE.supersededBecause, /typed outcomes/u);
}

function assertIssuePlanAndInterleave() {
  const plan = buildOpenLoopIssuePlan(
    [operation(1, 1), operation(2, 1), operation(1, 2)], RATE_100, START_1000);
  assert.deepEqual(arrayMap(plan, ({workerId, intendedIssueTimeMs}) =>
    [workerId, intendedIssueTimeMs]), EXPECTED_INTENDED);
  const interleaved = interleaveOltpWorkerPhase([
    {measurement: [operation(1, 1), operation(1, 2)]},
    {measurement: [operation(2, 1), operation(2, 2)]},
  ]);
  assert.deepEqual(arrayMap(interleaved, ({workerId, sequence}) => [workerId, sequence]),
    [[1, 1], [2, 1], [1, 2], [2, 2]]);
}

async function assertCommittedRequiresTypedOutcome() {
  const clock = logicalClock(START_1000);
  const active = new Set();
  const adapter = {
    async executeTransaction(value) {
      assert.equal(active.has(value.workerId), false, 'per-worker serialization');
      active.add(value.workerId);
      clock.now += TRANSACTION_MS;
      await Promise.resolve();
      active.delete(value.workerId);
      return value.sequence === TWO ? {committed: true} : typed();
    },
  };
  const result = await runOpenLoopOltpStep(adapter,
    [operation(1, 1), operation(2, 1), operation(1, 2)],
    {...clock.options, offeredRatePerSec: RATE_100, watchdog: WATCHDOG});
  assert.equal(result.profileId, OLTP_OPEN_LOOP_PROFILE.id);
  assert.equal(result.accounting.committed, TWO);
  // A resolved value without a typed outcome is a harness fault, not a commit.
  assert.equal(result.accounting.terminalFailures.harness_fault, ONE);
  assert.equal(result.records[0].endpoint, EVIDENCE.endpoint);
  assert.equal(result.records[0].serverConnectionId, EVIDENCE.serverConnectionId);
  // Latency runs from the intended issue time.
  assert.ok(result.records[0].latencyMs >= TRANSACTION_MS);
  assert.equal(result.latency.count, TWO);
  assert.equal(result.quantileMethod, OLTP_LATENCY_QUANTILE_METHOD);
  assert.match(result.executedOperationsDigest, /^sha256:[0-9a-f]{64}$/u);
}

async function assertRetryInsideRequestClockAndNoBlindRetry() {
  const clock = logicalClock(START_1000);
  let attempts = 0;
  const conflict = Object.assign(new Error('could not serialize'), {code: '40001'});
  const adapter = {
    async executeTransaction(value) {
      attempts += 1;
      clock.now += 2;
      if (value.sequence === ONE && attempts === ONE) throw conflict;
      if (value.sequence === TWO) {
        throw Object.assign(new Error('broken pipe'), {code: 'EPIPE', syscall: 'write'});
      }
      return typed();
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1), operation(1, 2)],
    {...clock.options, offeredRatePerSec: RATE_100, watchdog: WATCHDOG});
  const [retried, transport] = result.records;
  assert.equal(retried.outcome, COMMITTED);
  assert.equal(retried.attempts.length, TWO);
  assert.equal(retried.attempts[0].outcome, OPERATION_OUTCOME.SERIALIZATION_CONFLICT);
  assert.equal(retried.retries, ONE);
  assert.equal(transport.outcome, OPERATION_OUTCOME.TERMINAL_FAILURE);
  // EPIPE is a socket outcome, never a SQLSTATE.
  assert.equal(transport.failureClass, FAILURE_CLASS.TRANSPORT_FAILURE);
  assert.equal(transport.attempts.length, ONE);
  assert.equal(result.accounting.conflicts, ONE);
}

async function assertWatchdogStopsIssuingAndSummarises() {
  const clock = logicalClock(START_1000);
  const adapter = {
    executeTransaction(value) {
      if (value.sequence === ONE) return Promise.resolve(typed());
      return new Promise(() => {});
    },
  };
  const operations = Array.from({length: WATCHDOG_OPERATIONS},
    (_unused, index) => operation(1, index + ONE));
  const result = await runOpenLoopOltpStep(adapter, operations,
    {...clock.options, offeredRatePerSec: RATE_100, watchdog: WATCHDOG});
  assert.equal(result.watchdog.fired, true);
  assert.equal(result.accounting.offered, operations.length);
  assert.equal(result.accounting.committed, ONE);
  assert.equal(result.accounting.unresolved, ONE);
  assert.equal(result.accounting.unissued, operations.length - TWO);
  const unresolved = result.records[1];
  assert.equal(unresolved.unresolvedReason, BENCHMARK_UNRESOLVED_REASON.WATCHDOG_IN_FLIGHT);
  assert.equal(unresolved.completedAtMs, null);
  assert.equal(unresolved.attempts[0].closedByWatchdog, true);
  assert.equal(unresolved.failureClass, BENCHMARK_FAILURE_CLASS_WATCHDOG);
  assert.equal(unresolved.attempts[0].failureClass, BENCHMARK_FAILURE_CLASS_WATCHDOG);
  assert.equal(result.records[TWO].outcome, OPERATION_OUTCOME.UNISSUED);
  assert.equal(result.records[TWO].executionStartedAtMs, null);
}

async function assertEarlySchedulerReturnFailsClosed() {
  let logicalNow = START_1000;
  let calls = 0;
  await assert.rejects(runOpenLoopOltpStep({
    async executeTransaction() {
      calls += 1;
      return typed();
    },
  }, [operation(1, 1)], {
    offeredRatePerSec: RATE_100,
    startTimeMs: START_1000,
    now: () => logicalNow,
    watchdog: WATCHDOG,
    setWatchdogTimer: () => () => undefined,
    waitUntil: async (target) => {
      logicalNow = target - 1;
    },
  }), /scheduler returned before intended issue time/u);
  assert.equal(calls, 0);
}

function assertUnissuedStep() {
  const step = buildUnissuedOpenLoopRecords([operation(1, 1), operation(2, 1)], RATE_100);
  assert.equal(step.accounting.offered, TWO);
  assert.equal(step.accounting.unissued, TWO);
  assert.equal(step.accounting.issued, 0);
}

async function main() {
  assertProfileSupersedesV1();
  assertIssuePlanAndInterleave();
  await assertCommittedRequiresTypedOutcome();
  await assertRetryInsideRequestClockAndNoBlindRetry();
  await assertWatchdogStopsIssuingAndSummarises();
  await assertEarlySchedulerReturnFailsClosed();
  assertUnissuedStep();
  await assert.rejects(runOpenLoopOltpStep({executeTransaction: async () => typed()},
    [operation(1, 1)], {offeredRatePerSec: RATE_100}), /requires a run watchdog/u);
  assert.throws(() => buildOpenLoopIssuePlan([operation(1, 1)], 0, 0),
    /offeredRatePerSec must be a positive number/u);
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
