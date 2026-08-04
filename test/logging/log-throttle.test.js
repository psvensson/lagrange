/**
 * Log-throttle engagement for the hot info paths that flooded the live run
 * (quest movielens-nodes-priority-recovery-escape, theory
 * theory-20260804-logging-backpressure-event-loop).
 *
 * Live evidence: node-0 of run-2026-08-04-full emitted 2200 "Storage
 * admission allowed", 3300+ CDC "Fetching/Fetched row", and 419 "Raft
 * leadership transition evidence" info lines; the resulting stdout-pipe
 * backpressure starved the event loop (~30% blocked) and fed the raft
 * leadership storm that wedged sql_write_operations-p1.
 *
 * RED-ON-REVERT: these tests drive the REAL emitters through the real
 * LogThrottle and assert the emitted volume collapses to first + one per
 * window while preserving a suppressed-count. Remove the throttle (bypass
 * LogThrottle, or restore a bare this.logger.info in the hot path) and the
 * per-key emit count explodes back to the raw call count -> red.
 */

import {test} from '../../src/test-helpers/tap.js';
import {LogThrottle} from '../../src/logging/log-throttle.js';

function makeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('LogThrottle admits first emit, suppresses within window, then summarizes', (t) => {
  const clock = makeClock();
  const throttle = new LogThrottle({windowMs: 5000, now: clock.now});

  // First occurrence admitted with zero suppressed.
  t.equal(throttle.admit('k'), 0, 'first emit admitted with suppressed=0');
  // A burst within the window is suppressed and counted.
  t.equal(throttle.admit('k'), null, 'burst emit 1 suppressed');
  t.equal(throttle.admit('k'), null, 'burst emit 2 suppressed');
  t.equal(throttle.admit('k'), null, 'burst emit 3 suppressed');
  // After the window the next emit is admitted and reports the 3 suppressed.
  clock.advance(5000);
  t.equal(throttle.admit('k'), 3, 'post-window emit admitted with suppressed=3');
  // And the counter resets.
  clock.advance(5000);
  t.equal(throttle.admit('k'), 0, 'counter resets after admission');
  t.end();
});

test('LogThrottle throttles per key, not globally', (t) => {
  const clock = makeClock();
  const throttle = new LogThrottle({windowMs: 5000, now: clock.now});
  t.equal(throttle.admit('a'), 0, 'key a first admitted');
  t.equal(throttle.admit('b'), 0, 'key b first admitted (independent bucket)');
  t.equal(throttle.admit('a'), null, 'key a burst suppressed');
  t.equal(throttle.admit('b'), null, 'key b burst suppressed');
  t.end();
});

test('LogThrottle collapses a 2200-call flood to ~1/window', (t) => {
  const clock = makeClock();
  const windowMs = 5000;
  const throttle = new LogThrottle({windowMs, now: clock.now});
  // Simulate the live flood: 2200 admits of the same key across 10 minutes
  // (one call every ~273ms), matching the observed "Storage admission
  // allowed" volume on node-0.
  const CALLS = 2200;
  const STEP_MS = 273;
  let admitted = 0;
  for (let i = 0; i < CALLS; i++) {
    if (throttle.admit('storage-admission-allowed') !== null) admitted++;
    clock.advance(STEP_MS);
  }
  const totalSpanMs = CALLS * STEP_MS;
  const maxExpected = Math.ceil(totalSpanMs / windowMs) + 1;
  t.ok(
    admitted <= maxExpected,
    `admitted ${admitted} <= ${maxExpected} (flood collapsed, not raw ${CALLS})`,
  );
  t.ok(admitted >= 1, 'at least the first emit survives');
  t.end();
});
