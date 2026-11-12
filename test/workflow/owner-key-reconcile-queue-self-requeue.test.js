// The reconcile queue's in-flight re-enqueue contract, on the real queue.
//
// A reconcile that re-enqueues its own owner key from inside its run, with
// unchanged input, used to be drained on a microtask: the same input was
// re-evaluated for ever and timers and I/O never ran (D1). Now:
//   - two consecutive runs of one owner key are separated by a host turn;
//   - a re-enqueue during the run may name what changed (admitted behind
//     that turn) or a delay (held until it has passed);
//   - a key re-enqueued during each of its consecutive runs with no declared
//     change is rate-limited after a few free runs: counted, emitted, never
//     admitted at once and never dropped, and newer outside input supersedes
//     the held replay.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_EVENT,
  RECONCILE_QUEUE_REQUEUE_RATE_LIMIT,
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';

const OWNER = 'owner/a';
const OTHER = 'owner/b';
// A hot loop is cut here so the old queue fails instead of starving the
// event loop for ever.
const RUN_CAP = 500;
const CHAIN_LENGTH = 200;
const QUIET = Object.freeze({
  debug() {}, info() {}, warn() {}, error() {},
});

function quietQueue(options) {
  const queue = new OwnerKeyReconcileQueue(options);
  queue.logger = QUIET;
  return queue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('a re-enqueue with unchanged input cannot spin; timers fire; a real change resumes useful work', async () => {
  const input = {generation: 1};
  const seen = [];
  let queue = null;
  queue = quietQueue({
    reconcileFn: async (ownerKey, _reasons, context) => {
      seen.push(context.generation);
      if (seen.length > RUN_CAP) {
        queue.shutdown();
        return;
      }
      if (context.generation === 1) {
        // The D1 shape: re-enqueue itself with the input it was given.
        queue.enqueue(ownerKey, RECONCILE_REASON.PERIODIC_CHECK, context);
      }
    },
  });
  const refusals = [];
  queue.on(RECONCILE_QUEUE_EVENT.RATE_LIMITED_REQUEUE,
    (diagnostic) => refusals.push(diagnostic));
  let runsWhenTimerFired = null;
  setTimeout(() => {
    runsWhenTimerFired = seen.length;
  }, 0);

  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, input);
  await sleep(200);

  assert.equal(queue.stopped, false, 'the hot-loop cap was not reached');
  assert.notEqual(runsWhenTimerFired, null, 'a timer fired');
  assert.ok(seen.length <= RECONCILE_QUEUE_REQUEUE_RATE_LIMIT.FREE_RUNS + 6,
    `unchanged re-enqueues are rate-limited, saw ${seen.length} runs in 200 ms`);
  assert.ok(refusals.length >= 1, 'the refusal is emitted');
  assert.equal(refusals[0].type,
    RECONCILE_QUEUE_DIAGNOSTIC.RATE_LIMITED_REQUEUE);
  assert.equal(refusals[0].ownerKey, OWNER);
  const diagnostics = queue.getDiagnostics();
  assert.equal(diagnostics.rateLimitedRequeueCount, refusals.length,
    'the refusal is counted');
  assert.deepEqual(diagnostics.heldRequeueKeys, [OWNER],
    'the refused re-enqueue is held, not dropped');

  // Resumed useful work: a real change arrives from outside the run (an
  // event), runs promptly against the new input, and the loop ends.
  const runsBeforeChange = seen.length;
  queue.enqueue(OWNER, RECONCILE_REASON.NODE_BECAME_READY, {generation: 2});
  await sleep(20);
  assert.deepEqual(seen.slice(runsBeforeChange), [2],
    'the changed input runs once and supersedes the held replay');
  assert.deepEqual(queue.getDiagnostics().heldRequeueKeys, [],
    'the held run was folded into the newer input, not replayed');
  await sleep(100);
  assert.deepEqual(seen.slice(runsBeforeChange), [2], 'no stale replay later');
  assert.equal(queue.isCurrentWorkIdle(), true);
  queue.shutdown();
});

test('a self re-enqueue that names what changed still runs, and each run yields the host turn', async () => {
  let runs = 0;
  let runsWhenTimerFired = null;
  let queue = null;
  const done = new Promise((resolve) => {
    queue = quietQueue({
      reconcileFn: async (ownerKey) => {
        runs += 1;
        if (runs > RUN_CAP) {
          queue.shutdown();
          resolve();
          return;
        }
        if (runs < CHAIN_LENGTH) {
          queue.enqueue(ownerKey, RECONCILE_REASON.PROGRESS_RECONCILE,
            {step: runs}, {selfRequeue: {changed: 'step_written'}});
          return;
        }
        resolve();
      },
    });
  });
  setTimeout(() => {
    runsWhenTimerFired = runs;
  }, 0);
  queue.enqueue(OWNER, RECONCILE_REASON.PROGRESS_RECONCILE, {step: 0});
  await done;
  await queue.awaitCurrentWorkIdle();

  assert.equal(runs, CHAIN_LENGTH, 'every legitimate re-enqueue ran');
  assert.notEqual(runsWhenTimerFired, null);
  assert.ok(runsWhenTimerFired < CHAIN_LENGTH,
    `a timer fired inside the chain (after ${runsWhenTimerFired} runs)`);
  assert.equal(queue.getDiagnostics().rateLimitedRequeueCount, 0);
  queue.shutdown();
});

test('a self re-enqueue that names a delay runs when the delay has passed', async () => {
  const runAt = [];
  let queue = null;
  queue = quietQueue({
    reconcileFn: async (ownerKey) => {
      runAt.push(Date.now());
      if (runAt.length === 1) {
        queue.enqueue(ownerKey, RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
          undefined, {selfRequeue: {delayMs: 60}});
      }
    },
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK);
  await sleep(20);
  assert.equal(runAt.length, 1, 'not before the delay');
  await sleep(120);
  assert.equal(runAt.length, 2, 'once the delay has passed');
  assert.ok(runAt[1] - runAt[0] >= 55);
  assert.equal(queue.getDiagnostics().rateLimitedRequeueCount, 0);
  queue.shutdown();
});

test('an outside event during a run and a timer that outlives it each run once, unlimited', async () => {
  const runs = {[OWNER]: 0, [OTHER]: 0};
  let queue = null;
  let release = null;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  queue = quietQueue({
    maxConcurrency: 2,
    reconcileFn: async (ownerKey) => {
      runs[ownerKey] += 1;
      if (ownerKey === OWNER && runs[OWNER] === 1) {
        // Another key from inside this run: not a self re-enqueue.
        queue.enqueue(OTHER, RECONCILE_REASON.PERIODIC_CHECK);
        // A timer armed inside the run that fires after it ended.
        setTimeout(() => {
          queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK);
        }, 10);
        await held;
      }
    },
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK);
  await sleep(1);
  // An event while the run is in flight, from outside it.
  setImmediate(() => queue.enqueue(OWNER, RECONCILE_REASON.NODE_BECAME_READY));
  await sleep(1);
  release();
  await sleep(40);
  await queue.awaitCurrentWorkIdle();
  assert.equal(runs[OTHER], 1);
  assert.equal(runs[OWNER], 3, 'the event and the outliving timer each ran');
  assert.equal(queue.getDiagnostics().rateLimitedRequeueCount, 0);
  queue.shutdown();
});

test('a malformed re-enqueue declaration is a programming error', async () => {
  let thrown = null;
  let queue = null;
  queue = quietQueue({
    reconcileFn: async (ownerKey) => {
      try {
        queue.enqueue(ownerKey, RECONCILE_REASON.PERIODIC_CHECK, undefined,
          {selfRequeue: {changed: 'x', delayMs: 5}});
      } catch (error) {
        thrown = error;
      }
    },
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK);
  await sleep(5);
  assert.ok(thrown instanceof TypeError);
  queue.shutdown();
});

test('a setImmediate sentinel fires between any two consecutive runs of one key', async () => {
  const RUNS = 50;
  let runs = 0;
  let sentinelsFired = 0;
  const missed = [];
  let queue = null;
  const done = new Promise((resolve) => {
    queue = quietQueue({
      reconcileFn: async (ownerKey) => {
        runs += 1;
        if (runs > 1 && sentinelsFired < runs - 1) {
          missed.push(runs);
        }
        setImmediate(() => {
          sentinelsFired += 1;
        });
        if (runs < RUNS) {
          queue.enqueue(ownerKey, RECONCILE_REASON.PROGRESS_RECONCILE,
            undefined, {selfRequeue: {changed: 'step_written'}});
        } else {
          resolve();
        }
      },
    });
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PROGRESS_RECONCILE);
  await done;
  assert.equal(runs, RUNS);
  assert.deepEqual(missed, [],
    'every run started after the previous run\'s sentinel fired');
  queue.shutdown();
});

test('a self re-enqueueing reconcile cannot delay a due timer by more than one run', async () => {
  let runs = 0;
  let runsWhenTimerFired = null;
  let runsWhenTimerArmed = null;
  let queue = null;
  const done = new Promise((resolve) => {
    queue = quietQueue({
      reconcileFn: async (ownerKey) => {
        runs += 1;
        if (runs === 3) {
          runsWhenTimerArmed = runs;
          setTimeout(() => {
            runsWhenTimerFired = runs;
          }, 0);
          // Make the timer due before this run ends.
          const until = Date.now() + 3;
          while (Date.now() < until) {
            // busy
          }
        }
        if (runsWhenTimerFired === null && runs < RUN_CAP) {
          queue.enqueue(ownerKey, RECONCILE_REASON.PROGRESS_RECONCILE,
            undefined, {selfRequeue: {changed: 'step_written'}});
        } else {
          resolve();
        }
      },
    });
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PROGRESS_RECONCILE);
  await done;
  assert.notEqual(runsWhenTimerFired, null, 'the timer fired');
  assert.ok(runsWhenTimerFired - runsWhenTimerArmed <= 1,
    `a due timer fired within one run (armed at ${runsWhenTimerArmed}, fired at ${runsWhenTimerFired})`);
  queue.shutdown();
});
