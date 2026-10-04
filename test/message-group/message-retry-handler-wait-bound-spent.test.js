/**
 * The message retry owner's attempt budget (MESSAGE_GROUP_RETRY_MAX_ATTEMPTS)
 * is a spent wait when every attempt fails: exactly one wait_bound_spent
 * ERROR naming the budget and the last failure, and the same
 * MAX_RETRIES_EXCEEDED result as before. A delivery that succeeds logs none.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  MessageRetryHandler,
  RetryStatus,
} from '../../src/message-group/message-retry-handler.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

function virtualClock() {
  let now = 1_000;
  return {
    now: () => now,
    setTimeout(callback, ms) {
      now += ms;
      queueMicrotask(callback);
      return {unref() {}};
    },
  };
}

function retryHandler(capture) {
  return new MessageRetryHandler({
    maxRetries: 2,
    initialDelayMs: 10,
    maxDelayMs: 10,
    jitterFactor: 0,
    logger: capture.logger,
    timeSource: virtualClock(),
  });
}

test('an exhausted attempt budget is one wait_bound_spent ERROR with the ' +
  'last failure', async (t) => {
  const capture = captureLogger();
  const outcome = await retryHandler(capture).executeWithRetry(
    async () => {
      throw new Error('peer unreachable');
    },
    {targetAddress: 'group-a/replica-1', messageId: 'm-1', message: {}},
  );
  t.equal(outcome.status, RetryStatus.MAX_RETRIES_EXCEEDED,
    'the post-expiry result is unchanged');
  t.match(outcome.error, /Failed after 3 attempts: peer unreachable/);
  const errors = capture.errors();
  t.equal(errors.length, 1, 'exactly one ERROR');
  const context = errors[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'MESSAGE_GROUP_RETRY_MAX_ATTEMPTS');
  t.match(context.lastObserved, {
    maxAttempts: 3,
    totalAttempts: 3,
    lastTarget: 'group-a/replica-1',
    lastError: 'peer unreachable',
  });
  t.ok(context.elapsedMs >= 20, 'elapsed is measured on the injected clock');
  t.notOk(capture.lines.some((line) => line.level === 'warn'),
    'the old WARN line is replaced, not doubled');
});

test('a delivery that succeeds logs no spent wait', async (t) => {
  const capture = captureLogger();
  const outcome = await retryHandler(capture).executeWithRetry(
    async () => ({success: true}),
    {targetAddress: 'group-a/replica-1', messageId: 'm-2', message: {}},
  );
  t.equal(outcome.status, RetryStatus.SUCCESS);
  t.equal(capture.errors().length, 0, 'no ERROR on normal completion');
});
