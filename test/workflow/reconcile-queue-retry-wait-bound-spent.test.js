/**
 * An owner-key reconcile queue's retry budget (retryPolicy.maxAttempts) is
 * a spent wait when every drain fails retryably: exactly one
 * wait_bound_spent ERROR naming the budget and the last failure, and the
 * same rejected completion and typed exhaustion event as before. A drain
 * that succeeds logs none.
 */

import {test} from '../../src/test-helpers/tap.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

function boundedQueue(capture, reconcileFn) {
  const queue = new OwnerKeyReconcileQueue({
    name: 'witness-bounded-retry-queue',
    reconcileFn,
    // A referenced retry timer: the production timer is unref'd, which
    // would let the test process end before the bounded retry runs.
    setTimeoutFn: (callback, delayMs) => {
      const handle = setTimeout(callback, delayMs);
      return {handle, unref() {}};
    },
    clearTimeoutFn: (timer) => clearTimeout(timer?.handle),
    retryPolicy: {
      isRetryableError: () => true,
      getRetryAfterMs: () => 1,
      getFailureReason: () => 'witness_failure',
      maxAttempts: 2,
    },
  });
  queue.logger = capture.logger;
  return queue;
}

test('an exhausted retry budget is one wait_bound_spent ERROR and the same ' +
  'rejected completion', async (t) => {
  const capture = captureLogger();
  const exhausted = [];
  const queue = boundedQueue(capture, async () => {
    const error = new Error('repeatable failure');
    error.code = 'WITNESS_DOWN';
    throw error;
  });
  t.teardown(() => queue.shutdown());
  queue.on('retryable_drain_exhausted', (event) => exhausted.push(event));

  await t.rejects(queue.enqueueAndWait('owner-a', 'source_changed'),
    /repeatable failure/, 'the caller still observes the failure');
  t.equal(exhausted.length, 1, 'the typed exhaustion event is unchanged');
  const errors = capture.errors();
  t.equal(errors.length, 1, 'exactly one ERROR');
  const context = errors[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'reconcile queue retryPolicy.maxAttempts');
  t.same(context.lastObserved, {
    failureCount: 2,
    maxAttempts: 2,
    failureReason: 'witness_failure',
    errorCode: 'WITNESS_DOWN',
    errorMessage: 'repeatable failure',
  });
  t.same(context.scope, {
    queue: 'witness-bounded-retry-queue',
    ownerKey: 'owner-a',
  });
});

test('a drain that succeeds logs no spent wait', async (t) => {
  const capture = captureLogger();
  const queue = boundedQueue(capture, async () => {});
  t.teardown(() => queue.shutdown());
  await queue.enqueueAndWait('owner-b', 'source_changed');
  t.equal(capture.errors().length, 0, 'no ERROR on normal completion');
});
