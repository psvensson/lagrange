/**
 * A spent wait is a failure, and is visible: a tracked request whose ACK
 * never arrives within its timeout (PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS
 * or the per-request timeoutMs) logs exactly one wait_bound_spent ERROR
 * naming what it awaited and the last observed tracker state, and none when
 * the ACK resolves first. The post-expiry behaviour is unchanged: the track
 * promise rejects with the same ACK-timeout error and the timeout counters
 * advance.
 *
 * Fake timers (node:test mock.timers) spend the bound; nothing waits on
 * wall time.
 */

import {mock} from 'node:test';
import {test} from '../../src/test-helpers/tap.js';
import {PendingRequestTracker} from '../../src/partition/pending-request-tracker.js';

const TIMEOUT_MS = 2_000;
const START_MS = 5_000_000;
const ACK_WAIT = 'PENDING_REQUEST_DEFAULT.REQUEST_TIMEOUT_MS';

function buildTracker() {
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  const tracker = new PendingRequestTracker({defaultTimeoutMs: TIMEOUT_MS});
  tracker.logger = {
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
  };
  return {
    tracker,
    errors: () => lines.filter((line) => line.level === 'error'),
    warns: () => lines.filter((line) => line.level === 'warn'),
  };
}

test('a spent ACK wait logs one wait_bound_spent ERROR and still rejects ' +
  'with the ACK-timeout error', async (t) => {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
  t.teardown(() => mock.timers.reset());
  const {tracker, errors, warns} = buildTracker();
  const outcome = tracker.track('req-spent', {
    type: 'REPLICA_REMOVE',
    targetAddress: 'node-b/lifecycle',
  }).then(() => null, (error) => error);
  mock.timers.tick(TIMEOUT_MS);
  const error = await outcome;
  t.ok(error, 'the request rejected at its timeout');
  t.match(error.message, /ACK timeout after 2000ms for request req-spent/,
    'with the same ACK-timeout error');
  t.equal(tracker.getStats().timedOutTotal, 1, 'the timeout is counted');
  t.equal(tracker.hasPending('req-spent'), false, 'the request is released');

  t.equal(errors().length, 1, 'exactly one ERROR');
  const context = errors()[0].context;
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, ACK_WAIT, 'names the wait');
  t.equal(context.boundMs, TIMEOUT_MS, 'names the bound');
  t.equal(context.elapsedMs, TIMEOUT_MS, 'elapsed on the tracker clock');
  t.same(context.lastObserved, {
    type: 'REPLICA_REMOVE',
    targetAddress: 'node-b/lifecycle',
    pendingCount: 0,
  }, 'the last observed request state, not site_observed_nothing');
  t.same(context.scope, {requestId: 'req-spent'});
  t.equal(warns().length, 0, 'the old WARN line is replaced, not doubled');
});

test('an ACK that arrives inside the bound logs no wait_bound_spent',
  async (t) => {
    mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
    t.teardown(() => mock.timers.reset());
    const {tracker, errors} = buildTracker();
    const outcome = tracker.track('req-ok', {type: 'REPLICA_REMOVE'});
    mock.timers.tick(TIMEOUT_MS - 1);
    tracker.resolve('req-ok', {status: 'ok'});
    t.same(await outcome, {status: 'ok'}, 'the ACK resolves the request');
    mock.timers.tick(TIMEOUT_MS);
    t.equal(errors().length, 0, 'no ERROR on normal completion');
  });
