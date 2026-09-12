#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildOpenLoopIssuePlan,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
} from '../../test/distributed/harness/oltp-open-loop-step-owner.js';

const PASS_LINE = 'oltp-open-loop-step-owner-guard: PASS\n';

function operation(workerId, sequence, kind = 'payment') {
  return Object.freeze({workerId, sequence, kind});
}

function assertIssuePlan() {
  const plan = buildOpenLoopIssuePlan([
    operation(1, 1),
    operation(2, 1),
    operation(1, 2),
  ], 100, 1000);
  assert.deepEqual(
    plan.map(({workerId, intendedIssueTimeMs}) => ({
      workerId,
      intendedIssueTimeMs,
    })),
    [
      {workerId: 1, intendedIssueTimeMs: 1000},
      {workerId: 2, intendedIssueTimeMs: 1010},
      {workerId: 1, intendedIssueTimeMs: 1020},
    ],
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
    interleaveOltpWorkerPhase(workers).map(({workerId, sequence}) =>
      [workerId, sequence]),
    [[1, 1], [2, 1], [1, 2], [2, 2]],
  );
}

async function assertFixedRateAndWorkerSerialization() {
  let logicalNow = 1000;
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
    offeredRatePerSec: 100,
    startTimeMs: 1000,
    now: () => logicalNow,
    waitUntil,
  });

  assert.equal(result.offeredRatePerSec, 100);
  assert.equal(result.attempted, 3);
  assert.equal(result.succeeded, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.retries, 0);
  assert.equal(result.scheduledWindowMs, 30);
  assert.ok(result.accountingWindowMs >= result.scheduledWindowMs);
  assert.ok(result.completedPerSec <= result.offeredRatePerSec);
  assert.equal(result.latency.count, 3);
  assert.equal(result.attemptLatency.count, 3);
  assert.deepEqual(
    result.records.map(({intendedIssueTimeMs}) => intendedIssueTimeMs),
    [1000, 1010, 1020],
  );
  assert.equal(
    result.records.every((record) =>
      record.latencyMs >= 0 &&
      record.queueDelayMs >= 0 &&
      record.issueLagMs >= 0),
    true,
  );
  assert.deepEqual(starts, [1, 2, 1]);
}

async function assertSchedulerLagStaysInsideRequestClock() {
  let logicalNow = 4000;
  const adapter = {
    async executeTransaction() {
      logicalNow += 3;
      return {committed: true};
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1)], {
    offeredRatePerSec: 100,
    startTimeMs: 4000,
    now: () => logicalNow,
    waitUntil: async (targetTimeMs) => {
      logicalNow = targetTimeMs + 7;
    },
  });

  assert.equal(result.records[0].issueLagMs, 7);
  assert.equal(result.records[0].queueDelayMs, 7);
  assert.equal(result.records[0].latencyMs, 10);
  assert.equal(result.scheduledWindowMs, 10);
  assert.equal(result.accountingWindowMs, 10);
  assert.equal(result.completedPerSec, 100);
}

async function assertRetryStaysInsideRequestClock() {
  let logicalNow = 2000;
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
    offeredRatePerSec: 100,
    startTimeMs: 2000,
    now: () => logicalNow,
    waitUntil: async () => {},
    retrySleep: async (delayMs) => {
      logicalNow += delayMs;
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.succeeded, 1);
  assert.equal(result.retries, 1);
  assert.equal(result.records[0].attempts, 2);
  assert.equal(result.records[0].retries, 1);
  assert.equal(result.records[0].retryDelayMs, 5);
  assert.equal(result.records[0].latencyMs, 9);
}

async function assertFailureIsRecordedNotRetriedBlindly() {
  let logicalNow = 3000;
  const adapter = {
    async executeTransaction() {
      logicalNow += 3;
      const error = new Error('transport');
      error.code = 'ECONNRESET';
      throw error;
    },
  };
  const result = await runOpenLoopOltpStep(adapter, [operation(1, 1)], {
    offeredRatePerSec: 50,
    startTimeMs: 3000,
    now: () => logicalNow,
    waitUntil: async () => {},
  });
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.retries, 0);
  assert.equal(result.records[0].status, 'failed');
  assert.equal(result.records[0].sqlState, null);
  assert.equal(result.records[0].latencyMs, 3);
  assert.equal(result.latency.count, 0);
  assert.equal(result.attemptLatency.count, 1);
  assert.equal(result.attemptLatency.p99, 3);
}

async function assertEarlySchedulerReturnFailsClosed() {
  let logicalNow = 5000;
  let calls = 0;
  const adapter = {
    async executeTransaction() {
      calls += 1;
    },
  };
  await assert.rejects(
    runOpenLoopOltpStep(adapter, [operation(1, 1)], {
      offeredRatePerSec: 100,
      startTimeMs: 5000,
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
  process.exitCode = 1;
});
