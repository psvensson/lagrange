#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_PAIRED_RETRY_POLICY,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
  executePairedOltpTransactionWithRetry,
  resolvePairedOltpRetryDelayMs,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';

const PASS_LINE = 'oltp-paired-retry-owner-guard: PASS\n';
const ADAPTER_PATHS = Object.freeze([
  'test/distributed/reference-client/tidb-oltp-adapter.js',
  'test/distributed/reference-client/lagrange-oltp-adapter.js',
]);

function serializationError(field = 'code') {
  const error = new Error('serialization conflict');
  error[field] = OLTP_SERIALIZATION_FAILURE_SQLSTATE;
  return error;
}

async function assertSuccessfulRetryAndRequestClock() {
  let logicalNow = 100;
  let attempts = 0;
  const sleeps = [];
  const retryEvents = [];
  const outcome = await executePairedOltpTransactionWithRetry({
    intendedIssueTimeMs: 90,
    now() {
      return logicalNow;
    },
    async executeAttempt() {
      attempts += 1;
      logicalNow += 2;
      if (attempts < 3) throw serializationError('sqlState');
      return {committed: true};
    },
    async sleep(delayMs) {
      sleeps.push(delayMs);
      logicalNow += delayMs;
    },
    onRetry(event) {
      retryEvents.push(event);
    },
  });

  assert.deepEqual(outcome.result, {committed: true});
  assert.deepEqual(sleeps, [5, 10]);
  assert.equal(outcome.evidence.attempts, 3);
  assert.equal(outcome.evidence.retries, 2);
  assert.equal(outcome.evidence.retryDelayMs, 15);
  assert.equal(outcome.evidence.requestClockElapsedMs, 31);
  assert.deepEqual(
    outcome.evidence.failures.map(({outcome: value}) => value),
    [
      OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
      OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
    ],
  );
  assert.deepEqual(
    retryEvents.map(({delayMs, sqlState}) => ({delayMs, sqlState})),
    [
      {delayMs: 5, sqlState: '40001'},
      {delayMs: 10, sqlState: '40001'},
    ],
  );
}

async function assertTerminalNonRetryableFailure() {
  const cause = new Error('transport failure');
  cause.code = 'ECONNRESET';
  await assert.rejects(
    executePairedOltpTransactionWithRetry({
      now: () => 50,
      async executeAttempt() {
        throw cause;
      },
      async sleep() {
        throw new Error('non-retryable failures must not sleep');
      },
    }),
    (error) => {
      assert.equal(error.name, 'OltpPairedTransactionError');
      assert.equal(error.cause, cause);
      assert.equal(error.sqlState, 'ECONNRESET');
      assert.equal(error.oltpRetryEvidence.attempts, 1);
      assert.equal(error.oltpRetryEvidence.retries, 0);
      assert.equal(error.oltpRetryEvidence.retryDelayMs, 0);
      assert.equal(
        error.oltpRetryEvidence.failures[0].outcome,
        OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE,
      );
      return true;
    },
  );
}

async function assertRetryBudgetExhaustion() {
  let logicalNow = 0;
  let attempts = 0;
  await assert.rejects(
    executePairedOltpTransactionWithRetry({
      now: () => logicalNow,
      async executeAttempt() {
        attempts += 1;
        logicalNow += 1;
        throw serializationError('code');
      },
      async sleep(delayMs) {
        logicalNow += delayMs;
      },
    }),
    (error) => {
      assert.equal(error.sqlState, '40001');
      assert.equal(error.oltpRetryEvidence.attempts, 4);
      assert.equal(error.oltpRetryEvidence.retries, 3);
      assert.equal(error.oltpRetryEvidence.retryDelayMs, 35);
      assert.equal(error.oltpRetryEvidence.failures.length, 4);
      return true;
    },
  );
  assert.equal(attempts, 4);
}

async function assertAdaptersDoNotOwnRetries() {
  for (const path of ADAPTER_PATHS) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(
      source,
      /oltp-paired-retry-owner/u,
      `${path} must not import the paired retry owner`,
    );
    assert.doesNotMatch(
      source,
      /executePairedOltpTransactionWithRetry/u,
      `${path} must not perform paired-owner retries`,
    );
  }
}

async function main() {
  assert.deepEqual(OLTP_PAIRED_RETRY_POLICY, {
    id: 'scenario-a-retry-v1',
    maxRetries: 3,
    baseDelayMs: 5,
    maxDelayMs: 20,
    retryableSqlStates: ['40001'],
    ambiguousCommitIsFailure: true,
    adapterRetriesAllowed: false,
  });
  assert.equal(resolvePairedOltpRetryDelayMs(1), 5);
  assert.equal(resolvePairedOltpRetryDelayMs(2), 10);
  assert.equal(resolvePairedOltpRetryDelayMs(3), 20);
  assert.equal(resolvePairedOltpRetryDelayMs(4), 20);
  assert.throws(
    () => resolvePairedOltpRetryDelayMs(0),
    /retryNumber >= 1/u,
  );
  assert.equal(
    classifyOltpAttemptError(serializationError('code')).retryable,
    true,
  );
  assert.equal(
    classifyOltpAttemptError(serializationError('sqlState')).retryable,
    true,
  );
  assert.equal(
    classifyOltpAttemptError(new Error('other')).retryable,
    false,
  );
  await assertSuccessfulRetryAndRequestClock();
  await assertTerminalNonRetryableFailure();
  await assertRetryBudgetExhaustion();
  await assertAdaptersDoNotOwnRetries();
  await assert.rejects(
    executePairedOltpTransactionWithRetry({
      intendedIssueTimeMs: 11,
      now: () => 10,
      async executeAttempt() {},
    }),
    /intendedIssueTimeMs <= current time/u,
  );
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
