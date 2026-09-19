// The reconcile queue's CURRENT-WORK completion contract.
//
// "Has everything you already admitted finished?" is a different question
// from "will you ever work again", and only the first one has an answer a
// caller can wait on. The queue can answer it because it already owns the
// whole lifecycle: `draining` from the moment an enqueue schedules a drain,
// `pending` for items no reconcile has claimed, `inFlight` for owner keys
// whose reconcile is running.
//
// The defect this exists for: a reconcile chain need not create a timer or a
// virtual event, so an observer that watches events or counts host turns sees
// an empty world while a production reconcile is still running. In the
// deterministic simulator that let a scenario return with work still owed,
// and the continuations then executed inside the NEXT scenario.
//
// Future work is deliberately outside the contract: an item waiting for its
// retry instant and the ordinary periodic cadence belong to the timer owner.
import {test} from '../../src/test-helpers/tap.js';

import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../../src/workflow/reconcile-queue-constants.js';
import {heldPromise, isPending} from '../helpers/promise-settlement.js';

const OWNER_A = 'partition/a';
const OWNER_B = 'partition/b';
const RETRYABLE_FAILURE_MESSAGE = 'retryable_drain_failure';
const RETRY_AFTER_MS = 1000;

test('Q1. an in-flight reconcile keeps the queue busy until it finishes',
  async (t) => {
    const held = heldPromise();
    const entered = heldPromise();
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        entered.release();
        return held.promise;
      },
    });
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    await entered.promise;
    const idle = queue.awaitCurrentWorkIdle();
    t.equal(queue.isCurrentWorkIdle(), false,
      'a running reconcile is current work');
    t.equal(await isPending(idle), true, 'and idle waits for it');
    held.release();
    await idle;
    t.equal(queue.isCurrentWorkIdle(), true);
    queue.shutdown();
    t.end();
  });

test('Q2. work admitted but not yet claimed is already current work',
  async (t) => {
    // The `draining` clause. scheduleDrain() defers the drain to a microtask,
    // so between enqueue and drain the queue holds accepted work with an
    // empty inFlight set. An idle predicate built only from pending/inFlight
    // would call that idle, which is exactly the "a pure promise chain is
    // invisible" mistake this contract exists to prevent.
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        reconciled.push(ownerKey);
      },
    });
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    t.equal(queue.draining, true, 'the drain is scheduled, not yet run');
    t.equal(queue.isCurrentWorkIdle(), false,
      'accepted work is not idle merely because nothing is in flight yet');
    await queue.awaitCurrentWorkIdle();
    t.same(reconciled, [OWNER_A],
      'idle resolved only after the reconcile actually ran');
    queue.shutdown();
    t.end();
  });

test('Q3. work enqueued during a reconcile is still owed when it completes',
  async (t) => {
    // The ABA boundary: idle must not be observable in the gap between A
    // leaving inFlight and the follow-on drain claiming B.
    const first = heldPromise();
    const enteredFirst = heldPromise();
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        reconciled.push(ownerKey);
        if (ownerKey === OWNER_A) {
          enteredFirst.release();
          return first.promise;
        }
        return undefined;
      },
    });
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    await enteredFirst.promise;
    queue.enqueue(OWNER_B, RECONCILE_REASON.PERIODIC_CHECK);
    const idle = queue.awaitCurrentWorkIdle();
    t.equal(await isPending(idle), true);
    first.release();
    await idle;
    t.same(reconciled, [OWNER_A, OWNER_B],
      'the follow-on work ran before the queue reported itself idle');
    t.equal(queue.isCurrentWorkIdle(), true);
    queue.shutdown();
    t.end();
  });

test('Q4. a queue that has been given nothing is idle now', async (t) => {
  const queue = new OwnerKeyReconcileQueue({reconcileFn: async () => {}});
  t.equal(queue.isCurrentWorkIdle(), true);
  t.equal(await isPending(queue.awaitCurrentWorkIdle()), false,
    'an unused queue resolves immediately rather than on some later turn');
  queue.shutdown();
  t.end();
});

test('Q5. a future retry is future work, not current work', async (t) => {
  // A reconcile that fails retryably moves its item into the retry model on
  // a timer. Current-work idle must become true then: waiting for the retry
  // deadline would turn this contract into "wait until convergence", which
  // is a different and unanswerable question.
  const armedRetryDelays = [];
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async () => {
      throw new Error('retryable_drain_failure');
    },
    setTimeoutFn: (callback, delayMs) => {
      armedRetryDelays.push(delayMs);
      return {delayMs};
    },
    clearTimeoutFn: () => {},
  });
  queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
  await queue.awaitCurrentWorkIdle();
  t.equal(queue.isCurrentWorkIdle(), true,
    'the queue is current-work idle once the item is owned by the retry timer');
  t.equal(queue.inFlight.size, 0);
  t.equal(queue.pending.size, 0);
  queue.shutdown();
  t.end();
});

test('Q6. a drain that has been scheduled but not run is still current work',
  async (t) => {
    // The `draining` clause, in the one state that isolates it: a drain
    // scheduled with nothing pending and nothing in flight. A reconcile that
    // fails retryably absorbs the item enqueued while it ran INTO its retry
    // item, which empties pending; the drain that enqueue scheduled has not
    // run yet. Q2 cannot pin this clause, because there the item the enqueue
    // admitted is still pending and pending alone answers.
    const drains = [];
    const entered = heldPromise();
    const failing = heldPromise();
    const retryArmed = heldPromise();
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        entered.release();
        await failing.promise;
        throw new Error(RETRYABLE_FAILURE_MESSAGE);
      },
      // The queue's own drain seam, held so the scheduled drain runs when
      // this witness says so rather than on a host turn.
      scheduleDrainFn: (drain) => {
        drains.push(drain);
      },
      // The retry timer is armed and never fires: the item it owns is
      // future work, which is what leaves pending and inFlight empty.
      setTimeoutFn: (_callback, delayMs) => {
        retryArmed.release();
        return {delayMs};
      },
      clearTimeoutFn: () => {},
      retryPolicy: {
        isRetryableError: () => true,
        getRetryAfterMs: () => RETRY_AFTER_MS,
      },
    });
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    drains.shift()();
    await entered.promise;
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    t.equal(drains.length, 1, 'the second enqueue scheduled a drain');
    const idle = queue.awaitCurrentWorkIdle();
    failing.release();
    await retryArmed.promise;

    t.equal(queue.pending.size, 0, 'the retry item absorbed the pending one');
    t.equal(queue.inFlight.size, 0, 'and the failed reconcile has finished');
    t.equal(queue.draining, true, 'while the scheduled drain has not run');
    t.equal(queue.isCurrentWorkIdle(), false,
      'a drain the queue has accepted but not run is still current work');
    t.equal(await isPending(idle), true, 'so idle waits for it');
    drains.shift()();
    await idle;
    t.equal(queue.isCurrentWorkIdle(), true,
      'and resolves once that drain has run');
    queue.shutdown();
    t.end();
  });

test('Q7. shutdown clears draining and releases current-work waiters',
  async (t) => {
    // A shut-down queue has no current work by definition. Before this,
    // draining stayed true until the scheduled drain ran - and for ever
    // under a drain seam that never fires - so a caller waiting on the
    // queue held a promise nothing could settle.
    const drains = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {},
      scheduleDrainFn: (drain) => {
        drains.push(drain);
      },
    });
    queue.enqueue(OWNER_A, RECONCILE_REASON.PERIODIC_CHECK);
    const idle = queue.awaitCurrentWorkIdle();
    t.equal(await isPending(idle), true,
      'work admitted and not yet drained is current work');
    queue.shutdown();
    t.equal(queue.draining, false, 'shutdown clears draining synchronously');
    t.equal(await isPending(idle), false,
      'and releases the waiter rather than leaving it unsettleable');
    t.equal(drains.length, 1, 'the drain it scheduled was never run');
    t.end();
  });
