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
      starts.push({workerId: value.workerId, at: logicalNow});
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
  assert.deepEqual(
    result.records.map(({intendedIssueTimeMs}) => intendedIssueTimeMs),
    [1000, 1010, 1020],
  );
  assert.deepEqual(
    result.records.map(({latencyMs}) => latencyMs),
    [4, 4, 4],
  );
  assert.deepEqual(starts, [
    {workerId: 1, at: 1000},
    {workerId: 2, at: 1010},
    {workerId: 1, at: 1020},
  ]);
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
}

async function main() {
  assertIssuePlan();
  assertInterleave();
  await assertFixedRateAndWorkerSerialization();
  await assertRetryStaysInsideRequestClock();
  await assertFailureIsRecordedNotRetriedBlindly();
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
