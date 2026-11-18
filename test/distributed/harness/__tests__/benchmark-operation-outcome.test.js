// The operation outcome owner: attempt classification, the COMMIT-failure
// mapping it shares with the adapter sessions, and the accounting validator
// that throws instead of coercing.
import assert from 'node:assert/strict';

import {test} from '../../../../src/test-helpers/tap.js';
import {
  FAILURE_CLASS as CLASS,
  OPERATION_OUTCOME as OUTCOME,
  classifyBenchmarkAttemptFailure,
  validateBenchmarkAccounting,
} from '../benchmark-operation-outcome.js';
import {
  OLTP_COMMIT_FAILURE_OUTCOME,
  resolveOltpCommitFailureOutcome,
  resolveOltpErrorSqlState,
} from '../oltp-error-classification.js';

function error(message, fields) {
  return Object.assign(new Error(message), fields);
}

const CASES = Object.freeze([
  ['serialization conflict', error('conflict', {code: '40001'}), {},
    OUTCOME.SERIALIZATION_CONFLICT, null],
  ['definite rollback 25P04', error('rolled back', {code: '25P04'}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.PRODUCT_ERROR],
  ['typed unknown commit', error('unknown', {code: '08007', commitOutcomeUnknown: true}), {},
    OUTCOME.UNRESOLVED, CLASS.AMBIGUOUS_COMMIT],
  ['socket EPIPE', error('pipe', {code: 'EPIPE', syscall: 'write'}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.TRANSPORT_FAILURE],
  ['socket ETIME', error('time', {code: 'ETIME'}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.TRANSPORT_FAILURE],
  ['connection exception 08006', error('lost', {code: '08006'}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.TRANSPORT_FAILURE],
  ['product error envelope', error('no table', {code: '42P01'}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.PRODUCT_ERROR],
  ['executor contract violation', error('affected 0', {name: 'OltpCorrectnessViolationError'}),
    {}, OUTCOME.TERMINAL_FAILURE, CLASS.CORRECTNESS_FAILURE],
  ['overlapping dispatch before any statement', error('overlapping work', {}), {},
    OUTCOME.TERMINAL_FAILURE, CLASS.HARNESS_FAULT],
  ['product answered without SQLSTATE', error('Table not found', {}),
    {productAnsweredError: true}, OUTCOME.TERMINAL_FAILURE, CLASS.PRODUCT_ERROR],
]);

test('every attempt failure has one typed outcome and failure class', async () => {
  for (const [name, cause, trace, outcome, failureClass] of CASES) {
    const classified = classifyBenchmarkAttemptFailure(cause, trace);
    assert.equal(classified.outcome, outcome, name);
    assert.equal(classified.failureClass, failureClass, name);
  }
  const wrapped = new AggregateError([error('pipe', {code: 'EPIPE', syscall: 'write'}),
    error('rollback failed', {})], 'both failed');
  assert.equal(classifyBenchmarkAttemptFailure(wrapped, {}).failureClass,
    CLASS.TRANSPORT_FAILURE, 'the transaction body failure decides, not the rollback');
});

test('COMMIT failures map by SQLSTATE class, socket codes are never SQLSTATEs', async () => {
  assert.equal(resolveOltpErrorSqlState(error('x', {code: 'EPIPE'})), null);
  assert.equal(resolveOltpErrorSqlState(error('x', {code: 'EBUSY'})), null);
  assert.equal(resolveOltpCommitFailureOutcome(error('x', {code: '25P04'})),
    OLTP_COMMIT_FAILURE_OUTCOME.ABORTED);
  assert.equal(resolveOltpCommitFailureOutcome(error('x', {code: '40001'})),
    OLTP_COMMIT_FAILURE_OUTCOME.ABORTED);
  assert.equal(resolveOltpCommitFailureOutcome(error('x', {code: '08007'})),
    OLTP_COMMIT_FAILURE_OUTCOME.UNKNOWN);
  assert.equal(resolveOltpCommitFailureOutcome(error('x', {code: 'ECONNRESET',
    syscall: 'read'})), OLTP_COMMIT_FAILURE_OUTCOME.UNKNOWN);
});

function record(overrides) {
  return {opId: 'measurement:1:1', outcome: OUTCOME.COMMITTED, failureClass: null,
    intendedStartMs: 0, effectSummary: {paidCents: 1}, issuedAtMs: 0,
    executionStartedAtMs: 0, completedAtMs: 5,
    issueLagMs: 0, queueDelayMs: 0, latencyMs: 5,
    attempts: [{outcome: OUTCOME.COMMITTED}], ...overrides};
}

test('the accounting validator throws, never coerces', async () => {
  const valid = validateBenchmarkAccounting([record({})]);
  assert.equal(valid.committed, 1);
  assert.throws(() => validateBenchmarkAccounting([record({}), record({})]),
    /duplicate benchmark opId/u);
  assert.throws(() => validateBenchmarkAccounting([record({latencyMs: Number.NaN})]),
    /finite non-negative/u);
  assert.throws(() => validateBenchmarkAccounting([record({latencyMs: -1})]),
    /finite non-negative/u);
  assert.throws(() => validateBenchmarkAccounting([record({failureClass: CLASS.PRODUCT_ERROR})]),
    /cannot carry failure class/u);
  assert.throws(() => validateBenchmarkAccounting([record({outcome: OUTCOME.UNRESOLVED,
    completedAtMs: null, latencyMs: null})]), /cannot carry failure class null/u,
  'an unresolved request names its class (R07)');
  assert.throws(() => validateBenchmarkAccounting([record({outcome: OUTCOME.UNRESOLVED,
    failureClass: CLASS.WATCHDOG_STOPPED, completedAtMs: null, latencyMs: null})]),
  /unresolved reason/u);
  const stopped = validateBenchmarkAccounting([record({outcome: OUTCOME.UNRESOLVED,
    failureClass: CLASS.WATCHDOG_STOPPED, unresolvedReason: 'watchdog-stopped-between-attempts',
    completedAtMs: null, latencyMs: null,
    attempts: [{outcome: OUTCOME.SERIALIZATION_CONFLICT}]})]);
  assert.equal(stopped.unresolved, 1);
  assert.equal(stopped.conflicts, 1, 'the last attempt outcome is retained');
  assert.throws(() => validateBenchmarkAccounting([record({outcome: OUTCOME.UNISSUED,
    executionStartedAtMs: null, completedAtMs: null, latencyMs: null})]),
  /unissued but has attempts/u);
  assert.throws(() => validateBenchmarkAccounting([record({attempts: []})]),
    /issued without an attempt/u);
  assert.throws(() => validateBenchmarkAccounting([record({effectSummary: null})]),
    /without an effect summary/u);
});
