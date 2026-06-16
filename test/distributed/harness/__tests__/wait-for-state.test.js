import {test} from '../../../../src/test-helpers/tap.js';
import {pollUntil, waitForState} from '../wait-for-state.js';

// A virtual clock so the polling loop is deterministic and instant: `sleep`
// advances `nowMs`, so no real time passes.
function virtualClock() {
  let nowMs = 0;
  return {
    now: () => nowMs,
    sleep: (ms) => {
      nowMs += ms;
      return Promise.resolve();
    },
  };
}

test('pollUntil returns satisfied as soon as the predicate holds', async (t) => {
  const clock = virtualClock();
  let calls = 0;
  const result = await pollUntil(() => (++calls >= 3), {
    intervalMs: 100, timeoutMs: 10000, now: clock.now, sleep: clock.sleep,
  });
  t.equal(result.satisfied, true);
  t.equal(result.polls, 3, 'polled until the third call');
  t.equal(result.elapsedMs, 200, 'two 100ms sleeps before success');
  t.end();
});

test('pollUntil reports a timeout instead of throwing', async (t) => {
  const clock = virtualClock();
  const result = await pollUntil(() => false, {
    intervalMs: 100, timeoutMs: 500, now: clock.now, sleep: clock.sleep,
  });
  t.equal(result.satisfied, false);
  t.ok(result.elapsedMs >= 500, 'ran to the timeout');
  t.end();
});

test('pollUntil awaits async predicates', async (t) => {
  const clock = virtualClock();
  let calls = 0;
  const result = await pollUntil(async () => (++calls >= 2), {
    intervalMs: 50, timeoutMs: 10000, now: clock.now, sleep: clock.sleep,
  });
  t.equal(result.satisfied, true);
  t.equal(result.polls, 2);
  t.end();
});

test('waitForState throws on timeout by default', async (t) => {
  const clock = virtualClock();
  await t.rejects(
    waitForState({}, () => false, {
      timeoutMs: 300, intervalMs: 100, now: clock.now, sleep: clock.sleep,
      label: 'epoch OPEN',
    }),
    /waitForState timed out.*epoch OPEN/,
  );
  t.end();
});

test('waitForState returns the result when throwOnTimeout is false', async (t) => {
  const clock = virtualClock();
  const result = await waitForState({}, () => false, {
    timeoutMs: 300, intervalMs: 100, now: clock.now, sleep: clock.sleep,
    throwOnTimeout: false,
  });
  t.equal(result.satisfied, false, 'directed-chaos branch: state never appeared');
  t.end();
});

test('waitForState passes the cluster to the predicate', async (t) => {
  const clock = virtualClock();
  const cluster = {marker: 'C'};
  let seen = null;
  const result = await waitForState(cluster, (c) => {
    seen = c;
    return true;
  }, {now: clock.now, sleep: clock.sleep});
  t.equal(result.satisfied, true);
  t.equal(seen, cluster, 'predicate received the cluster');
  t.end();
});
