import {performance} from 'node:perf_hooks';

import {
  executePairedOltpTransactionWithRetry,
} from './oltp-paired-retry-owner.js';
import {
  summarizeOltpBaselineLatencies,
} from './oltp-baseline-workload.js';

const ZERO = 0;
const ONE = 1;
const THOUSAND = 1000;

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
  return Object.freeze(operations.map((operation, index) => Object.freeze({
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
  const queues = workerPlans.map((worker) => {
    const operations = worker?.[phase];
    if (!Array.isArray(operations)) {
      throw new Error(`Open-loop OLTP worker is missing phase ${phase}`);
    }
    return operations;
  });
  const maxLength = Math.max(...queues.map((operations) => operations.length));
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

async function defaultWaitUntil(targetTimeMs, now, sleep) {
  const delayMs = Math.max(ZERO, targetTimeMs - now());
  if (delayMs > ZERO) await sleep(delayMs);
}

function recordSuccess(entry, issuedAtMs, executionStartedAtMs, outcome) {
  return Object.freeze({
    index: entry.index,
    workerId: entry.workerId,
    kind: entry.operation.kind,
    status: 'succeeded',
    intendedIssueTimeMs: entry.intendedIssueTimeMs,
    issuedAtMs,
    executionStartedAtMs,
    completedAtMs: outcome.evidence.completedAtMs,
    issueLagMs: Math.max(ZERO, issuedAtMs - entry.intendedIssueTimeMs),
    queueDelayMs:
      Math.max(ZERO, executionStartedAtMs - entry.intendedIssueTimeMs),
    latencyMs: outcome.evidence.requestClockElapsedMs,
    attempts: outcome.evidence.attempts,
    retries: outcome.evidence.retries,
    retryDelayMs: outcome.evidence.retryDelayMs,
    sqlState: null,
  });
}

function recordFailure(entry, issuedAtMs, executionStartedAtMs, error, now) {
  const evidence = error?.oltpRetryEvidence || null;
  const completedAtMs = evidence?.completedAtMs ?? now();
  return Object.freeze({
    index: entry.index,
    workerId: entry.workerId,
    kind: entry.operation.kind,
    status: 'failed',
    intendedIssueTimeMs: entry.intendedIssueTimeMs,
    issuedAtMs,
    executionStartedAtMs,
    completedAtMs,
    issueLagMs: Math.max(ZERO, issuedAtMs - entry.intendedIssueTimeMs),
    queueDelayMs:
      Math.max(ZERO, executionStartedAtMs - entry.intendedIssueTimeMs),
    latencyMs: Math.max(ZERO, completedAtMs - entry.intendedIssueTimeMs),
    attempts: evidence?.attempts ?? ONE,
    retries: evidence?.retries ?? ZERO,
    retryDelayMs: evidence?.retryDelayMs ?? ZERO,
    sqlState: error?.sqlState || null,
  });
}

function summarizeStep(issuePlan, records, offeredRatePerSec) {
  const succeeded = records.filter(({status}) => status === 'succeeded');
  const failed = records.length - succeeded.length;
  const firstIssueMs = issuePlan[ZERO].intendedIssueTimeMs;
  const scheduledWindowMs =
    (issuePlan.length * THOUSAND) / offeredRatePerSec;
  const lastCompletionMs = Math.max(
    ...records.map(({completedAtMs}) => completedAtMs),
  );
  const completionWindowMs = Math.max(ZERO, lastCompletionMs - firstIssueMs);
  const accountingWindowMs = Math.max(scheduledWindowMs, completionWindowMs);
  const totalRetries = records.reduce(
    (sum, record) => sum + record.retries,
    ZERO,
  );
  return Object.freeze({
    offeredRatePerSec,
    attempted: records.length,
    succeeded: succeeded.length,
    failed,
    retries: totalRetries,
    scheduledWindowMs,
    completionWindowMs,
    drainOverrunMs: Math.max(ZERO, completionWindowMs - scheduledWindowMs),
    accountingWindowMs,
    completedPerSec: accountingWindowMs > ZERO ?
      succeeded.length / (accountingWindowMs / THOUSAND) : ZERO,
    latency: summarizeOltpBaselineLatencies(
      succeeded.map(({latencyMs}) => latencyMs),
    ),
    attemptLatency: summarizeOltpBaselineLatencies(
      records.map(({latencyMs}) => latencyMs),
    ),
    queueDelay: summarizeOltpBaselineLatencies(
      records.map(({queueDelayMs}) => queueDelayMs),
    ),
    issueLag: summarizeOltpBaselineLatencies(
      records.map(({issueLagMs}) => issueLagMs),
    ),
    records: Object.freeze([...records]),
  });
}

async function runOpenLoopOltpStep(adapter, operations, options = {}) {
  if (!adapter || typeof adapter.executeTransaction !== 'function') {
    throw new Error('Open-loop OLTP step requires adapter.executeTransaction');
  }
  const now = options.now || (() => performance.now());
  const schedulerSleep = options.schedulerSleep || defaultSleep;
  const waitUntil = options.waitUntil || ((targetTimeMs) =>
    defaultWaitUntil(targetTimeMs, now, schedulerSleep));
  const offeredRatePerSec = positiveNumber(
    options.offeredRatePerSec,
    'offeredRatePerSec',
  );
  const startTimeMs = options.startTimeMs ?? now();
  const issuePlan = buildOpenLoopIssuePlan(
    operations,
    offeredRatePerSec,
    startTimeMs,
  );
  const workerQueues = new Map();
  const records = new Array(issuePlan.length);

  for (const entry of issuePlan) {
    await waitUntil(entry.intendedIssueTimeMs);
    const issuedAtMs = now();
    if (issuedAtMs < entry.intendedIssueTimeMs) {
      throw new Error(
        'Open-loop OLTP scheduler returned before intended issue time',
      );
    }
    const previous = workerQueues.get(entry.workerId) || Promise.resolve();
    const task = previous.then(async () => {
      const executionStartedAtMs = now();
      try {
        const outcome = await executePairedOltpTransactionWithRetry({
          intendedIssueTimeMs: entry.intendedIssueTimeMs,
          now,
          ...(options.retrySleep ? {sleep: options.retrySleep} : {}),
          executeAttempt: () => adapter.executeTransaction(entry.operation),
        });
        records[entry.index] = recordSuccess(
          entry,
          issuedAtMs,
          executionStartedAtMs,
          outcome,
        );
      } catch (error) {
        records[entry.index] = recordFailure(
          entry,
          issuedAtMs,
          executionStartedAtMs,
          error,
          now,
        );
      }
    });
    workerQueues.set(entry.workerId, task);
  }

  await Promise.all(workerQueues.values());
  return summarizeStep(issuePlan, records, offeredRatePerSec);
}

export {
  buildOpenLoopIssuePlan,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
};
