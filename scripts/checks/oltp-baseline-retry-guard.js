#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_SERIALIZATION_SQLSTATE,
  OLTP_TRANSACTION_RETRY_POLICY,
  executeOltpTransactionWithRetry,
  isRetryableOltpTransactionError,
  resolveOltpRetryDelayMs,
} from '../../test/distributed/harness/oltp-baseline-retry.js';

const PASS_LINE = 'oltp-baseline-retry-guard: PASS\n';

function serializationError() {
  const error = new Error('serialization conflict');
  error.sqlState = OLTP_SERIALIZATION_SQLSTATE;
  return error;
}

async function assertSuccessfulRetry() {
  let attempts = 0;
  const sleeps = [];
  const retries = [];
  const result = await executeOltpTransactionWithRetry({
    async executeAttempt() {
      attempts += 1;
      if (attempts < 3) throw serializationError();
      return {committed: true};
    },
    async sleep(delayMs) {
      sleeps.push(delayMs);
    },
    onRetry(event) {
      retries.push(event);
    },
  });
  assert.deepEqual(result, {
    result: {committed: true},
    retries: 2,
    attempts: 3,
  });
  assert.deepEqual(sleeps, [5, 10]);
  assert.deepEqual(retries.map(({sqlState}) => sqlState), ['40001', '40001']);
}

async function assertNonRetryableFailure() {
  let attempts = 0;
  const error = new Error('transport failed');
  error.code = 'ECONNRESET';
  await assert.rejects(
    executeOltpTransactionWithRetry({
      async executeAttempt() {
        attempts += 1;
        throw error;
      },
      async sleep() {
        throw new Error('non-retryable errors must not sleep');
      },
    }),
    (received) => {
      assert.equal(received, error);
      assert.deepEqual(received.oltpRetry, {attempts: 1, retries: 0});
      return true;
    },
  );
  assert.equal(attempts, 1);
}

async function assertRetryBudget() {
  let attempts = 0;
  const error = serializationError();
  await assert.rejects(
    executeOltpTransactionWithRetry({
      async executeAttempt() {
        attempts += 1;
        throw error;
      },
      async sleep() {},
    }),
    (received) => {
      assert.equal(received, error);
      assert.deepEqual(received.oltpRetry, {attempts: 4, retries: 3});
      return true;
    },
  );
  assert.equal(attempts, 4);
}

async function main() {
  assert.deepEqual(OLTP_TRANSACTION_RETRY_POLICY, {
    maxRetries: 3,
    baseDelayMs: 5,
    maxDelayMs: 20,
    retryableSqlStates: ['40001'],
  });
  assert.equal(resolveOltpRetryDelayMs(1), 5);
  assert.equal(resolveOltpRetryDelayMs(2), 10);
  assert.equal(resolveOltpRetryDelayMs(3), 20);
  assert.equal(resolveOltpRetryDelayMs(4), 20);
  assert.equal(isRetryableOltpTransactionError(serializationError()), true);
  assert.equal(isRetryableOltpTransactionError(new Error('other')), false);
  await assertSuccessfulRetry();
  await assertNonRetryableFailure();
  await assertRetryBudget();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
