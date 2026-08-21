import {test} from '../../src/test-helpers/tap.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {
  RECONCILE_REASON,
} from '../../src/workflow/reconcile-queue-constants.js';

test('OwnerKeyReconcileQueue - enqueueAndWait observes owner completion',
  async (t) => {
    let release = null;
    const queue = new OwnerKeyReconcileQueue({
      name: 'commit-boundary-queue',
      reconcileFn: async (_ownerKey, _reasons, context) => {
        await new Promise((resolve) => {
          release = resolve;
        });
        return context.value;
      },
    });

    let settled = false;
    const completion = queue.enqueueAndWait(
      'owner-1',
      RECONCILE_REASON.PERIODIC_CHECK,
      {value: 'committed'},
    ).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    t.equal(settled, false, 'queue admission is not owner completion');

    release();
    t.equal(await completion, 'committed', 'returns the owner result');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - coalesced completion waiters share one owner result',
  async (t) => {
    const scheduled = [];
    let reconcileCount = 0;
    const queue = new OwnerKeyReconcileQueue({
      scheduleDrainFn: (drain) => scheduled.push(drain),
      reconcileFn: async (_ownerKey, reasons, context) => {
        reconcileCount += 1;
        return {reasons, value: context.value};
      },
    });

    const first = queue.enqueueAndWait(
      'owner-1',
      RECONCILE_REASON.NODES_CDC_READY,
      {value: 'first'},
    );
    const second = queue.enqueueAndWait(
      'owner-1',
      RECONCILE_REASON.NODES_CACHE_READY,
      {value: 'latest'},
    );
    scheduled.shift()();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    t.equal(reconcileCount, 1, 'one owner reconcile serves both waiters');
    t.same(firstResult, secondResult, 'both waiters observe one owner result');
    t.equal(firstResult.value, 'latest', 'coalescing retains latest context');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - has() checks pending state', async (t) => {
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async () => {
      await new Promise(() => {});
    },
  });

  t.equal(queue.has('key-1'), false, 'empty queue has nothing');

  const completion = queue.enqueueAndWait(
    'key-1',
    RECONCILE_REASON.PERIODIC_CHECK,
  );
  const stoppedOutcome = completion.catch((error) => error);
  t.equal(queue.has('key-1'), true, 'enqueued key is pending');

  queue.shutdown();

  t.match(
    await stoppedOutcome,
    /is stopped/,
    'shutdown rejects callers waiting on a pending owner turn',
  );
});
