#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_PAIRED_RETRY_POLICY,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
  createPairedRetryingOltpAdapter,
  executePairedOltpTransactionWithRetry,
  resolvePairedOltpRetryDelayMs,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';

const objectFreeze = Object.freeze;
const arrayMap = Function.call.bind(Array.prototype.map);

const ONE = 1;
const TWO = 2;
const PASS_LINE = 'oltp-paired-retry-owner-guard: PASS\n';
const ENCODING_UTF8 = 'utf8';

const ERROR_FIELD_CODE = 'code';
const ERROR_FIELD_SQLSTATE = 'sqlState';
const ERROR_MESSAGE_SERIALIZATION = 'serialization conflict';
const ERROR_MESSAGE_TRANSPORT = 'transport failure';
const ERROR_MESSAGE_OTHER = 'other';
const ERROR_MESSAGE_NO_SLEEP = 'non-retryable failures must not sleep';
const ERROR_CODE_ECONNRESET = 'ECONNRESET';
const ERROR_NAME_OLTP = 'OltpPairedTransactionError';
const SQLSTATE_40001 = '40001';

const OP_RETRY_ONCE = 'retry-once';
const OP_TERMINAL = 'terminal';
const POLICY_ID = 'scenario-a-retry-v1';

const START_TIME_100 = 100;
const INTENDED_TIME_90 = 90;
const START_TIME_50 = 50;
const START_TIME_1000 = 1000;
const INTENDED_TIME_11 = 11;
const CURRENT_TIME_10 = 10;

const DELAY_5 = 5;
const DELAY_10 = 10;
const DELAY_15 = 15;
const DELAY_20 = 20;
const DELAY_31 = 31;
const DELAY_35 = 35;
const COUNT_3 = 3;
const COUNT_4 = 4;

const ADAPTER_PATHS = objectFreeze([
  'test/distributed/reference-client/tidb-oltp-adapter.js',
  'test/distributed/reference-client/lagrange-oltp-adapter.js',
]);

const COMMITTED_OUTCOME = objectFreeze({committed: true});
const EXPECTED_SLEEPS = objectFreeze([DELAY_5, DELAY_10]);
const EXPECTED_FAILURES = objectFreeze([
  OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
  OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
]);

const EXPECTED_RECORDED_EVENTS = objectFreeze([
  objectFreeze({delayMs: DELAY_5, sqlState: SQLSTATE_40001}),
  objectFreeze({delayMs: DELAY_10, sqlState: SQLSTATE_40001}),
]);

const EXPECTED_RETRY_POLICY = objectFreeze({
  id: POLICY_ID,
  maxRetries: COUNT_3,
  baseDelayMs: DELAY_5,
  maxDelayMs: DELAY_20,
  retryableSqlStates: objectFreeze([SQLSTATE_40001]),
  ambiguousCommitIsFailure: true,
  adapterRetriesAllowed: false,
});

const EXPECTED_INITIAL_RETRY_EVIDENCE = objectFreeze({
  policyId: POLICY_ID,
  logicalTransactions: 1,
  attempts: TWO,
  retries: 1,
  retryDelayMs: DELAY_5,
  serializationConflicts: 1,
  terminalTransactions: 0,
});

const EXPECTED_TERMINAL_RETRY_EVIDENCE = objectFreeze({
  policyId: POLICY_ID,
  logicalTransactions: TWO,
  attempts: COUNT_3,
  retries: 1,
  retryDelayMs: DELAY_5,
  serializationConflicts: 1,
  terminalTransactions: 1,
});

function serializationError(field = ERROR_FIELD_CODE) {
  const error = new Error(ERROR_MESSAGE_SERIALIZATION);
  error[field] = OLTP_SERIALIZATION_FAILURE_SQLSTATE;
  return error;
}

async function assertSuccessfulRetryAndRequestClock() {
  let logicalNow = START_TIME_100;
  let attempts = 0;
  const sleeps = [];
  const observedEvents = [];
  const outcome = await executePairedOltpTransactionWithRetry({
    intendedIssueTimeMs: INTENDED_TIME_90,
    now() {
      return logicalNow;
    },
    async executeAttempt() {
      attempts += 1;
      logicalNow += TWO;
      if (attempts < COUNT_3) throw serializationError(ERROR_FIELD_SQLSTATE);
      return COMMITTED_OUTCOME;
    },
    async sleep(delayMs) {
      sleeps.push(delayMs);
      logicalNow += delayMs;
    },
    onRetry(event) {
      observedEvents.push(event);
    },
  });

  assert.deepEqual(outcome.result, COMMITTED_OUTCOME);
  assert.deepEqual(sleeps, EXPECTED_SLEEPS);
  assert.equal(outcome.evidence.attempts, COUNT_3);
  assert.equal(outcome.evidence.retries, TWO);
  assert.equal(outcome.evidence.retryDelayMs, DELAY_15);
  assert.equal(outcome.evidence.requestClockElapsedMs, DELAY_31);
  assert.deepEqual(
    arrayMap(outcome.evidence.failures, ({outcome: value}) => value),
    EXPECTED_FAILURES,
  );
  assert.deepEqual(
    arrayMap(observedEvents, ({delayMs, sqlState}) => ({delayMs, sqlState})),
    EXPECTED_RECORDED_EVENTS,
  );
}

async function assertTerminalNonRetryableFailure() {
  const cause = new Error(ERROR_MESSAGE_TRANSPORT);
  cause.code = ERROR_CODE_ECONNRESET;
  await assert.rejects(
    executePairedOltpTransactionWithRetry({
      now: () => START_TIME_50,
      async executeAttempt() {
        throw cause;
      },
      async sleep() {
        throw new Error(ERROR_MESSAGE_NO_SLEEP);
      },
    }),
    (error) => {
      assert.equal(error.name, ERROR_NAME_OLTP);
      assert.equal(error.cause, cause);
      assert.equal(error.sqlState, null);
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
        throw serializationError(ERROR_FIELD_CODE);
      },
      async sleep(delayMs) {
        logicalNow += delayMs;
      },
    }),
    (error) => {
      assert.equal(error.sqlState, SQLSTATE_40001);
      assert.equal(error.oltpRetryEvidence.attempts, COUNT_4);
      assert.equal(error.oltpRetryEvidence.retries, COUNT_3);
      assert.equal(error.oltpRetryEvidence.retryDelayMs, DELAY_35);
      assert.equal(error.oltpRetryEvidence.failures.length, COUNT_4);
      return true;
    },
  );
  assert.equal(attempts, COUNT_4);
}

async function assertRetryingAdapterEvidence() {
  let logicalNow = START_TIME_1000;
  let firstOperationAttempts = 0;
  const adapter = {
    async executeTransaction(operation) {
      logicalNow += TWO;
      if (operation.id === OP_RETRY_ONCE) {
        firstOperationAttempts += 1;
        if (firstOperationAttempts === 1) {
          throw serializationError(ERROR_FIELD_SQLSTATE);
        }
      }
      if (operation.id === OP_TERMINAL) {
        const error = new Error(ERROR_MESSAGE_TRANSPORT);
        error.code = ERROR_CODE_ECONNRESET;
        throw error;
      }
      return {id: operation.id, committed: true};
    },
  };
  const retrying = createPairedRetryingOltpAdapter(adapter, {
    now: () => logicalNow,
    async sleep(delayMs) {
      logicalNow += delayMs;
    },
  });

  assert.deepEqual(
    await retrying.executeTransaction({id: OP_RETRY_ONCE}),
    {id: OP_RETRY_ONCE, committed: true},
  );
  assert.deepEqual(
    retrying.getRetryEvidence(),
    EXPECTED_INITIAL_RETRY_EVIDENCE,
  );

  await assert.rejects(
    retrying.executeTransaction({id: OP_TERMINAL}),
    /transport failure/u,
  );
  assert.deepEqual(
    retrying.getRetryEvidence(),
    EXPECTED_TERMINAL_RETRY_EVIDENCE,
  );
}

async function assertAdaptersDoNotOwnRetries() {
  for (const path of ADAPTER_PATHS) {
    const source = await readFile(path, ENCODING_UTF8);
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
  assert.deepEqual(OLTP_PAIRED_RETRY_POLICY, EXPECTED_RETRY_POLICY);
  assert.equal(resolvePairedOltpRetryDelayMs(1), DELAY_5);
  assert.equal(resolvePairedOltpRetryDelayMs(TWO), DELAY_10);
  assert.equal(resolvePairedOltpRetryDelayMs(COUNT_3), DELAY_20);
  assert.equal(resolvePairedOltpRetryDelayMs(COUNT_4), DELAY_20);
  assert.throws(
    () => resolvePairedOltpRetryDelayMs(0),
    /retryNumber >= 1/u,
  );
  assert.equal(
    classifyOltpAttemptError(serializationError(ERROR_FIELD_CODE)).retryable,
    true,
  );
  assert.equal(
    classifyOltpAttemptError(serializationError(ERROR_FIELD_SQLSTATE)).retryable,
    true,
  );
  assert.equal(
    classifyOltpAttemptError(new Error(ERROR_MESSAGE_OTHER)).retryable,
    false,
  );
  await assertSuccessfulRetryAndRequestClock();
  await assertTerminalNonRetryableFailure();
  await assertRetryBudgetExhaustion();
  await assertRetryingAdapterEvidence();
  await assertAdaptersDoNotOwnRetries();
  await assert.rejects(
    executePairedOltpTransactionWithRetry({
      intendedIssueTimeMs: INTENDED_TIME_11,
      now: () => CURRENT_TIME_10,
      async executeAttempt() {},
    }),
    /intendedIssueTimeMs <= current time/u,
  );
  assert.throws(
    () => createPairedRetryingOltpAdapter({}),
    /requires adapter.executeTransaction/u,
  );
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
