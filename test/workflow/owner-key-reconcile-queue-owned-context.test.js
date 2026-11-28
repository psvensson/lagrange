// The reconcile queue's `preserveOwnedContext` enqueue option: a producer that
// has only discovery evidence joins exact-key work the queue already owns and
// keeps that work's retained context; an owner key the queue does not own
// keeps the producer's context. Owned work is looked up pending first, then
// waiting for its retry, then in flight, then exhausted.
import {test} from '../../src/test-helpers/tap.js';

import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../../src/workflow/reconcile-queue-constants.js';
import {heldPromise} from '../helpers/promise-settlement.js';

const OWNER = 'index/owned';
const RETAINED = Object.freeze({source: 'retained'});
const DISCOVERED = Object.freeze({source: 'discovered'});
const LATER = Object.freeze({source: 'later'});
const PRESERVE = Object.freeze({preserveOwnedContext: true});

function recordingQueue(reconcile = async () => undefined) {
  const scheduled = [];
  const contexts = [];
  const queue = new OwnerKeyReconcileQueue({
    scheduleDrainFn: (callback) => scheduled.push(callback),
    reconcileFn: async (ownerKey, reasons, context) => {
      contexts.push(context);
      return reconcile(ownerKey, reasons, context);
    },
  });
  queue.logger = {debug() {}, info() {}, warn() {}, error() {}};
  const drain = async () => {
    while (scheduled.length > 0) {
      scheduled.shift()();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return {queue, contexts, drain};
}

test('owned context: pending work keeps its retained context', async (t) => {
  const {queue, contexts, drain} = recordingQueue();
  t.equal(queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, RETAINED), true);
  t.equal(queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, DISCOVERED, PRESERVE),
    false, 'joins the pending item');
  await drain();
  t.same(contexts, [RETAINED], 'the retained context is reconciled');
  queue.shutdown();
});

test('owned context: without the option the newer context replaces it', async (t) => {
  const {queue, contexts, drain} = recordingQueue();
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, RETAINED);
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, DISCOVERED);
  await drain();
  t.same(contexts, [DISCOVERED]);
  queue.shutdown();
});

test('owned context: an owner key the queue does not own keeps the producer context',
  async (t) => {
    const {queue, contexts, drain} = recordingQueue();
    t.equal(queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, DISCOVERED, PRESERVE),
      true, 'a new item is created');
    await drain();
    t.same(contexts, [DISCOVERED]);
    queue.shutdown();
  });

test('owned context: in-flight work lends its context to the next item', async (t) => {
  const held = heldPromise();
  let calls = 0;
  const {queue, contexts, drain} = recordingQueue(async () => {
    calls += 1;
    if (calls === 1) await held.promise;
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, RETAINED);
  await drain();
  t.same(contexts, [RETAINED], 'the first reconcile is in flight');
  t.equal(queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, DISCOVERED, PRESERVE),
    true, 'a new pending item behind the in-flight one');
  held.release();
  await new Promise((resolve) => setImmediate(resolve));
  await drain();
  t.same(contexts, [RETAINED, RETAINED], 'the in-flight context is carried');
  queue.shutdown();
});

test('owned context: pending work is found before in-flight work', async (t) => {
  const held = heldPromise();
  let calls = 0;
  const {queue, contexts, drain} = recordingQueue(async () => {
    calls += 1;
    if (calls === 1) await held.promise;
  });
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, RETAINED);
  await drain();
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, LATER);
  queue.enqueue(OWNER, RECONCILE_REASON.PERIODIC_CHECK, DISCOVERED, PRESERVE);
  held.release();
  await new Promise((resolve) => setImmediate(resolve));
  await drain();
  t.same(contexts, [RETAINED, LATER], 'the pending context wins over the in-flight one');
  queue.shutdown();
});
