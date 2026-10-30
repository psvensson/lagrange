#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_OPEN_LOOP_PROFILE,
  buildOpenLoopIssuePlan,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
} from '../../test/distributed/harness/oltp-open-loop-step-owner.js';

const objectFreeze = Object.freeze;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayEvery = Function.call.bind(Array.prototype.every);

const ONE = 1;
const TWO = 2;
const PASS_LINE = 'oltp-open-loop-step-owner-guard: PASS\n';
const DEFAULT_OPERATION_KIND = 'payment';
const STATUS_FAILED = 'failed';

const RATE_100 = 100;
const RATE_50 = 50;
const START_TIME_1000 = 1000;
const START_TIME_2000 = 2000;
const START_TIME_3000 = 3000;
const START_TIME_4000 = 4000;
const START_TIME_5000 = 5000;

const COUNT_THREE = 3;
const WINDOW_30 = 30;
const WINDOW_10 = 10;
const DELAY_7 = 7;
const LATENCY_10 = 10;
const RETRY_DELAY_5 = 5;
const LATENCY_9 = 9;
const LATENCY_3 = 3;

const EXPECTED_ISSUE_PLAN = objectFreeze([
  objectFreeze({workerId: 1, intendedIssueTimeMs: 1000}),
  objectFreeze({workerId: 2, intendedIssueTimeMs: 1010}),
  objectFreeze({workerId: 1, intendedIssueTimeMs: 1020}),
]);

const EXPECTED_INTERLEAVED_PAIRS = objectFreeze([
  objectFreeze([1, 1]),
  objectFreeze([2, 1]),
  objectFreeze([1, 2]),
  objectFreeze([2, 2]),
]);

const EXPECTED_INTENDED_TIMES = objectFreeze([1000, 1010, 1020]);
const EXPECTED_STARTS = objectFreeze([1, 2, 1]);

const EXPECTED_OPEN_LOOP_PROFILE = objectFreeze({
  id: 'scenario-a-open-loop-v1',
  issueSchedule: 'fixed-rate-intended-time',
  workerSerialization: 'per-worker',
  latencyOrigin: 'intended-issue-time',
  headlineLatency: 'successful-requests',
  attemptLatency: 'all-attempted-requests',
  completionRateWindow: 'max-scheduled-and-drain',
});

function operation(workerId, sequence, kind = DEFAULT_OPERATION_KIND) {
  return objectFreeze({workerId, sequence, kind});
}

function assertIssuePlan() {
  const plan = buildOpenLoopIssuePlan([
    operation(1, 1),
    operation(2, 1),
    operation(1, 2),
  ], RATE_100, START_TIME_1000);
  assert.deepEqual(
    arrayMap(plan, ({workerId, intendedIssueTimeMs}) => ({
      workerId,
      intendedIssueTimeMs,
    })),
    EXPECTED_ISSUE_PLAN,
  );
}

function assertInterleave() {
  const workers = [
    {
      workerId: 1,
      measurement: [operation(1, 1), operation(1, 2)],
    },
    {
      workerId: 2,
      measurement: [operation(2, 1), operation(2, 2)],
    },
  ];
  assert.deepEqual(
    arrayMap(interleaveOltpWorkerPhase(workers), ({workerId, sequence}) =>
      [workerId, sequence]),
    EXPECTED_INTERLEAVED_PAIRS,
  );
}

async function assertFixedRateAndWorkerSerialization() {
  let logicalNow = START_TIME_1000;
  const activeWorkers = new Set();
  const starts = [];
  const adapter = {
    async executeTransaction(value) {
      assert.equal(activeWorkers.has(value.workerId), false);
      activeWorkers.add(value.workerId);
      starts.push(value.workerId);
      logicalNow += 4;
      await Promise.resolve();
      activeWorkers.delete(value.workerId);
      return {committed: true};
    },
  };
  const waitUntil = async (targetTimeMs) => {
    await Promise.resolve();
    logicalNow = Math.max(logicalNow, targetTimeMs);
  };
  const result = await runOpenLoopOltpStep(adapter, [
    operation(1, 1),
    operation(2, 1),
    operation(1, 2),
  ], {
    offeredRatePerSec: RATE_100,
    startTimeMs: START_TIME_1000,
    now: () => logicalNow,
    waitUntil,
  });

  assert.equal(result.profileId, OLTP_OPEN_LOOP_PROFILE.id);
  assert.equal(result.offeredRatePerSec, RATE_100);
  assert.equal(result.attempted, COUNT_THREE);
  assert.equal(result.succeeded, COUNT_THREE);
  assert.equal(result.failed, 0);
  assert.equal(result.retries, 0);
  assert.equal(result.scheduledWindowMs, WINDOW_30);
  assert.ok(result.accountingWindowMs >= result.scheduledWindowMs);
  assert.ok(result.completedPerSec <= result.offeredRatePerSec);
  assert.equal(result.latency.count, COUNT_THREE);
  assert.equal(result.attemptLatency.count, COUNT_THREE);
  assert.deepEqual(
    arrayMap(result.records, ({intendedIssueTimeMs}) => intendedIssueTimeMs),
    EXPECTED_INTENDED_TIMES,
  );
  assert.equal(
    arrayEvery(result.records, (record) =>
      record.latencyMs >= 0 &&
      record.queueDelayMs >= 0 &&
      record.issueLagMs >= 0),
    true,
  );
  assert.deepEqual(starts, EXPECTED_STARTS);
}

async function assertSchedulerLagStaysInsideRequestClock() {
  let logicalNow = START_TIME_4000;
  const adapter = {
    async executeTransaction() {
      logicalNow += 3;
      return {committed: true};
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1)], {
    offeredRatePerSec: RATE_100,
    startTimeMs: START_TIME_4000,
    now: () => logicalNow,
    waitUntil: async (targetTimeMs) => {
      logicalNow = targetTimeMs + DELAY_7;
    },
  });

  assert.equal(result.records[0].issueLagMs, DELAY_7);
  assert.equal(result.records[0].queueDelayMs, DELAY_7);
  assert.equal(result.records[0].latencyMs, LATENCY_10);
  assert.equal(result.scheduledWindowMs, WINDOW_10);
  assert.equal(result.accountingWindowMs, WINDOW_10);
  assert.equal(result.completedPerSec, RATE_100);
}

async function assertRetryStaysInsideRequestClock() {
  let logicalNow = START_TIME_2000;
  let attempts = 0;
  const adapter = {
    async executeTransaction() {
      attempts += 1;
      logicalNow += 2;
      if (attempts === 1) {
        const error = new Error('conflict');
        error.code = '40001';
        throw error;
      }
      return {committed: true};
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1)], {
    offeredRatePerSec: RATE_100,
    startTimeMs: START_TIME_2000,
    now: () => logicalNow,
    waitUntil: async () => {},
    retrySleep: async (delayMs) => {
      logicalNow += delayMs;
    },
  });

  assert.equal(attempts, TWO);
  assert.equal(result.succeeded, 1);
  assert.equal(result.retries, 1);
  assert.equal(result.records[0].attempts, TWO);
  assert.equal(result.records[0].retries, 1);
  assert.equal(result.records[0].retryDelayMs, RETRY_DELAY_5);
  assert.equal(result.records[0].latencyMs, LATENCY_9);
}

async function assertFailureIsRecordedNotRetriedBlindly() {
  let logicalNow = START_TIME_3000;
  const adapter = {
    async executeTransaction() {
      logicalNow += 3;
      const error = new Error('transport');
      error.code = 'ECONNRESET';
      throw error;
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1)], {
    offeredRatePerSec: RATE_50,
    startTimeMs: START_TIME_3000,
    now: () => logicalNow,
    waitUntil: async () => {},
  });
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.retries, 0);
  assert.equal(result.records[0].status, STATUS_FAILED);
  assert.equal(result.records[0].sqlState, null);
  assert.equal(result.records[0].latencyMs, LATENCY_3);
  assert.equal(result.latency.count, 0);
  assert.equal(result.attemptLatency.count, 1);
  assert.equal(result.attemptLatency.p99, LATENCY_3);
}

async function assertEarlySchedulerReturnFailsClosed() {
  let logicalNow = START_TIME_5000;
  let calls = 0;
  const adapter = {
    async executeTransaction() {
      calls += 1;
    },
  };
  await assert.rejects(
    runOpenLoopOltpStep(adapter, [operation(1, 1)], {
      offeredRatePerSec: RATE_100,
      startTimeMs: START_TIME_5000,
      now: () => logicalNow,
      waitUntil: async (targetTimeMs) => {
        logicalNow = targetTimeMs - 1;
      },
    }),
    /scheduler returned before intended issue time/u,
  );
  assert.equal(calls, 0);
}

async function main() {
  assert.deepEqual(OLTP_OPEN_LOOP_PROFILE, EXPECTED_OPEN_LOOP_PROFILE);
  assertIssuePlan();
  assertInterleave();
  await assertFixedRateAndWorkerSerialization();
  await assertSchedulerLagStaysInsideRequestClock();
  await assertRetryStaysInsideRequestClock();
  await assertFailureIsRecordedNotRetriedBlindly();
  await assertEarlySchedulerReturnFailsClosed();
  assert.throws(
    () => buildOpenLoopIssuePlan([operation(1, 1)], 0, 0),
    /offeredRatePerSec must be a positive number/u,
  );
  assert.throws(
    () => buildOpenLoopIssuePlan([operation(0, 1)], 1, 0),
    /workerId >= 1/u,
  );
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
