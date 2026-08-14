import {test} from '../../src/test-helpers/tap.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {
  RECONCILE_REASON,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_EVENT,
  STALE_FENCE_SAMPLE_CAPACITY,
} from '../../src/workflow/reconcile-queue-constants.js';

const RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE =
  'retryable_drain_failure';
const RECONCILE_QUEUE_RETRYABLE_DISTRIBUTED_FAILURE =
  'distributed_participant_failure';
const RECONCILE_QUEUE_RETRYABLE_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const RECONCILE_QUEUE_RETRYABLE_FAILURE_MESSAGE =
  'Distributed operation failed due to participant failures';
const RECONCILE_QUEUE_RETRYABLE_RETRY_AFTER_MS = 25;
const RECONCILE_QUEUE_RETRYABLE_WAIT_MS = 50;

test('OwnerKeyReconcileQueue - requires reconcileFn', async (t) => {
  t.throws(
    () => new OwnerKeyReconcileQueue(),
    {message: RECONCILE_QUEUE_ERROR_MSG.RECONCILE_FN_REQUIRED},
    'should throw when reconcileFn is missing',
  );
});

test('OwnerKeyReconcileQueue - requires owner key on enqueue',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {},
    });
    t.throws(
      () => queue.enqueue(null, RECONCILE_REASON.PERIODIC_CHECK),
      {message: RECONCILE_QUEUE_ERROR_MSG.OWNER_KEY_REQUIRED},
      'should throw when owner key is null',
    );
    t.throws(
      () => queue.enqueue('', RECONCILE_REASON.PERIODIC_CHECK),
      {message: RECONCILE_QUEUE_ERROR_MSG.OWNER_KEY_REQUIRED},
      'should throw when owner key is empty string',
    );
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - enqueues and drains items',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey, reasons, context) => {
        reconciled.push({ownerKey, reasons, context});
      },
    });

    queue.enqueue('op-1', RECONCILE_REASON.CDC_OPERATION_PENDING);
    queue.enqueue('op-2', RECONCILE_REASON.COORDINATOR_OPERATION_CREATED);

    // Allow microtask drain to complete
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(reconciled.length, 2, 'should drain both items');
    t.equal(reconciled[0].ownerKey, 'op-1');
    t.same(
      reconciled[0].reasons,
      [RECONCILE_REASON.CDC_OPERATION_PENDING],
    );
    t.equal(reconciled[1].ownerKey, 'op-2');
    t.same(
      reconciled[1].reasons,
      [RECONCILE_REASON.COORDINATOR_OPERATION_CREATED],
    );
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - de-duplicates by owner key',
  async (t) => {
    const reconciled = [];
    let resolveGate;
    const gate = new Promise((resolve) => {
      resolveGate = resolve;
    });

    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey, reasons, context) => {
        reconciled.push({ownerKey, reasons, context});
        if (reconciled.length === 1) {
          // Wait for second enqueue to happen before continuing
          await gate;
        }
      },
    });

    // First enqueue starts drain immediately
    queue.enqueue('node-1', RECONCILE_REASON.NODES_CDC_READY);

    // Allow microtask to start drain
    await Promise.resolve();

    // Second and third enqueue for same key while first is draining
    queue.enqueue(
      'node-1', RECONCILE_REASON.NODES_CACHE_READY, {extra: true},
    );
    queue.enqueue(
      'node-1', RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    );

    // Release the gate so drain continues
    resolveGate();

    // Allow drain to complete
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(reconciled.length, 2, 'should process two batches');
    t.same(
      reconciled[0].reasons,
      [RECONCILE_REASON.NODES_CDC_READY],
      'first batch has original reason',
    );
    // Second batch should have merged reasons
    t.ok(
      reconciled[1].reasons.includes(RECONCILE_REASON.NODES_CACHE_READY),
      'second batch includes cache reason',
    );
    t.ok(
      reconciled[1].reasons.includes(
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
      ),
      'second batch includes state update reason',
    );
    t.same(
      reconciled[1].context,
      {extra: true},
      'context from most recent enqueue is preserved',
    );
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - enqueue returns creation status',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        // Block drain so pending items stay in queue
        await new Promise(() => {});
      },
    });

    const created = queue.enqueue(
      'key-1', RECONCILE_REASON.PERIODIC_CHECK,
    );
    t.equal(created, true, 'first enqueue creates new entry');

    // The drain started but is blocked, so enqueue again
    // for a different key
    const created2 = queue.enqueue(
      'key-2', RECONCILE_REASON.NODE_FAILED,
    );
    // key-2 was not in pending (it was cleared when drain started)
    // so it creates a new entry
    t.equal(created2, true, 'new key creates new entry');

    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - has() checks pending state',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        await new Promise(() => {});
      },
    });

    t.equal(queue.has('key-1'), false, 'empty queue has nothing');

    queue.enqueue('key-1', RECONCILE_REASON.PERIODIC_CHECK);
    // Pending is cleared when drain starts (microtask), so check
    // before microtask runs
    t.equal(queue.has('key-1'), true, 'enqueued key is pending');

    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - shutdown stops processing',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        reconciled.push(ownerKey);
      },
    });

    queue.shutdown();

    const created = queue.enqueue(
      'key-1', RECONCILE_REASON.PERIODIC_CHECK,
    );
    t.equal(created, false, 'enqueue after shutdown returns false');

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(reconciled.length, 0, 'nothing processed after shutdown');
  });

test('OwnerKeyReconcileQueue - reconcile errors do not stop drain',
  async (t) => {
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async (ownerKey) => {
        if (ownerKey === 'bad') {
          throw new Error('reconcile failed');
        }
        reconciled.push(ownerKey);
      },
    });

    queue.enqueue('bad', RECONCILE_REASON.PERIODIC_CHECK);
    queue.enqueue('good', RECONCILE_REASON.PERIODIC_CHECK);

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.same(reconciled, ['good'], 'good item processed despite error');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - size reflects pending count',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        await new Promise(() => {});
      },
    });

    t.equal(queue.size, 0, 'empty queue has size 0');

    queue.enqueue('a', RECONCILE_REASON.PERIODIC_CHECK);
    queue.enqueue('b', RECONCILE_REASON.NODE_FAILED);
    // Before microtask drain starts
    t.equal(queue.size, 2, 'two items pending');

    queue.shutdown();
  });


test('OwnerKeyReconcileQueue - no parallel execution on same owner key',
  async (t) => {
    // Track concurrent execution count per owner key.
    const concurrency = new Map();
    const maxConcurrency = new Map();
    const reconciled = [];
    let keyBStarted = false;

    let resolveFirst;
    const firstGate = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const queue = new OwnerKeyReconcileQueue({
      maxConcurrency: 2,
      reconcileFn: async (ownerKey, reasons) => {
        const current = (concurrency.get(ownerKey) || 0) + 1;
        concurrency.set(ownerKey, current);
        const prev = maxConcurrency.get(ownerKey) || 0;
        if (current > prev) {
          maxConcurrency.set(ownerKey, current);
        }

        reconciled.push({ownerKey, reasons});
        if (ownerKey === 'key-B') {
          keyBStarted = true;
        }

        // First call for key-A blocks until gate opens.
        if (ownerKey === 'key-A' && reconciled.length === 1) {
          await firstGate;
        }

        concurrency.set(
          ownerKey, concurrency.get(ownerKey) - 1,
        );
      },
    });

    // Enqueue key-A — starts draining immediately.
    queue.enqueue('key-A', RECONCILE_REASON.PERIODIC_CHECK);

    // Let the microtask start the drain and begin reconciling key-A.
    await Promise.resolve();
    await Promise.resolve();

    // key-A is now in-flight. Enqueue it again.
    queue.enqueue('key-A', RECONCILE_REASON.NODE_FAILED);

    // Also enqueue a different key to prove it can run concurrently
    // with key-A (different owner keys are independent).
    queue.enqueue('key-B', RECONCILE_REASON.NODE_BECAME_READY);

    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      keyBStarted,
      true,
      'key-B starts while the unrelated key-A reconcile remains blocked',
    );

    // Release the first reconcile for key-A.
    resolveFirst();

    // Allow all drain iterations to complete.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      maxConcurrency.get('key-A'), 1,
      'key-A never had more than 1 concurrent reconcile',
    );

    // key-A should have been reconciled twice: once from the
    // original enqueue, once from the deferred re-enqueue.
    const keyACalls = reconciled.filter(
      (r) => r.ownerKey === 'key-A',
    );
    t.equal(
      keyACalls.length, 2,
      'key-A reconciled twice (original + deferred)',
    );

    // key-B should have been reconciled once.
    const keyBCalls = reconciled.filter(
      (r) => r.ownerKey === 'key-B',
    );
    t.equal(keyBCalls.length, 1, 'key-B reconciled once');

    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - bounds independent owner-key concurrency',
  async (t) => {
    let activeCount = 0;
    let maxActiveCount = 0;
    let releaseWork;
    const workGate = new Promise((resolve) => {
      releaseWork = resolve;
    });
    const queue = new OwnerKeyReconcileQueue({
      maxConcurrency: 2,
      reconcileFn: async () => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await workGate;
        activeCount -= 1;
      },
    });

    for (const ownerKey of ['key-1', 'key-2', 'key-3', 'key-4', 'key-5']) {
      queue.enqueue(ownerKey, RECONCILE_REASON.PERIODIC_CHECK);
    }
    await new Promise((resolve) => setImmediate(resolve));

    const diagnostics = queue.getDiagnostics();
    t.equal(maxActiveCount, 2, 'configured ceiling bounds active work');
    t.equal(
      diagnostics.inFlightKeys.length,
      2,
      'only the bounded number of owner keys is in flight',
    );
    t.equal(
      diagnostics.pendingKeys.length,
      3,
      'remaining owner keys stay retained behind the concurrency ceiling',
    );
    t.equal(
      diagnostics.maxConcurrency,
      2,
      'the configured concurrency ceiling is inspectable',
    );

    queue.shutdown();
    releaseWork();
  });

test('OwnerKeyReconcileQueue - isInFlight tracks active execution',
  async (t) => {
    let resolveGate;
    const gate = new Promise((resolve) => {
      resolveGate = resolve;
    });

    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        await gate;
      },
    });

    t.equal(
      queue.isInFlight('key-1'), false,
      'not in-flight before enqueue',
    );

    queue.enqueue('key-1', RECONCILE_REASON.PERIODIC_CHECK);

    // Let drain start.
    await Promise.resolve();
    await Promise.resolve();

    t.equal(
      queue.isInFlight('key-1'), true,
      'in-flight during reconcile execution',
    );

    resolveGate();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      queue.isInFlight('key-1'), false,
      'not in-flight after reconcile completes',
    );

    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - stale-claim diagnostic on in-flight defer',
  async (t) => {
    let resolveFirst;
    const firstGate = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const reconciled = [];

    const queue = new OwnerKeyReconcileQueue({
      name: 'test-queue',
      reconcileFn: async (ownerKey, reasons) => {
        reconciled.push({ownerKey, reasons});
        if (ownerKey === 'key-X' && reconciled.length === 1) {
          await firstGate;
        }
      },
    });

    // Enqueue key-X — drain starts and begins reconciling it.
    queue.enqueue('key-X', RECONCILE_REASON.PERIODIC_CHECK);
    await Promise.resolve();
    await Promise.resolve();

    // key-X is now in-flight. Enqueue it again so it lands in
    // pending while the first reconcile is still running.
    queue.enqueue('key-X', RECONCILE_REASON.NODE_FAILED);

    // Directly invoke drain() to simulate a second drain pass
    // encountering key-X while it is still in-flight. The normal
    // scheduleDrain guard prevents this, but the in-flight guard
    // is the defense-in-depth layer we are testing.
    const secondDrain = queue.drain();

    // Allow the second drain to run its microtask and hit the
    // in-flight check.
    await Promise.resolve();
    await Promise.resolve();

    // Release the first reconcile so everything can complete.
    resolveFirst();
    await secondDrain;

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const diag = queue.getDiagnostics();
    t.ok(
      diag.staleClaims.length >= 1,
      'at least one stale-claim diagnostic recorded',
    );

    const claim = diag.staleClaims[0];
    t.equal(
      claim.type,
      RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
      'diagnostic type is stale_claim_in_flight',
    );
    t.equal(claim.ownerKey, 'key-X', 'diagnostic owner key matches');
    t.equal(claim.queue, 'test-queue', 'diagnostic queue name matches');
    t.ok(
      Array.isArray(claim.reasons),
      'diagnostic includes reasons array',
    );
    t.ok(
      typeof claim.timestamp === 'number',
      'diagnostic includes numeric timestamp',
    );

    // key-X should still have been reconciled after the first
    // execution completed (deferred item gets picked up).
    const keyXCalls = reconciled.filter(
      (r) => r.ownerKey === 'key-X',
    );
    t.equal(
      keyXCalls.length, 2,
      'key-X reconciled twice (original + deferred)',
    );

    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - getDiagnostics exposes queue state',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      name: 'diag-queue',
      reconcileFn: async () => {
        await new Promise(() => {});
      },
    });

    const emptyDiag = queue.getDiagnostics();
    t.equal(emptyDiag.queue, 'diag-queue', 'queue name in diagnostics');
    t.same(emptyDiag.pendingKeys, [], 'no pending keys initially');
    t.same(emptyDiag.inFlightKeys, [], 'no in-flight keys initially');
    t.same(emptyDiag.staleClaims, [], 'no stale claims initially');
    t.equal(emptyDiag.stopped, false, 'not stopped initially');

    queue.enqueue('k1', RECONCILE_REASON.PERIODIC_CHECK);

    // Let drain start so k1 becomes in-flight.
    await Promise.resolve();
    await Promise.resolve();

    const activeDiag = queue.getDiagnostics();
    t.same(
      activeDiag.inFlightKeys, ['k1'],
      'in-flight key visible in diagnostics',
    );

    queue.shutdown();

    const stoppedDiag = queue.getDiagnostics();
    t.equal(stoppedDiag.stopped, true, 'stopped flag in diagnostics');
  });

test('OwnerKeyReconcileQueue - shutdown clears in-flight set',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      reconcileFn: async () => {
        await new Promise(() => {});
      },
    });

    queue.enqueue('key-1', RECONCILE_REASON.PERIODIC_CHECK);
    await Promise.resolve();
    await Promise.resolve();

    t.equal(
      queue.isInFlight('key-1'), true,
      'key is in-flight before shutdown',
    );

    queue.shutdown();

    t.equal(
      queue.isInFlight('key-1'), false,
      'in-flight cleared after shutdown',
    );
  });


test('OwnerKeyReconcileQueue - emits typed event on stale fence ' +
  'rejection at enqueue time', async (t) => {
  const emitted = [];
  const queue = new OwnerKeyReconcileQueue({
    name: 'event-queue',
    reconcileFn: async () => {},
  });

  queue.on(
    RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_ENQUEUE,
    (evt) => emitted.push(evt),
  );

  // Establish fence token 5 for key-A.
  queue.enqueue(
    'key-A', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: 5},
  );

  // Enqueue with stale token 3 — should be rejected.
  const result = queue.enqueue(
    'key-A', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: 3},
  );

  t.equal(result, false, 'stale enqueue rejected');
  t.equal(emitted.length, 1, 'one event emitted');
  t.equal(
    emitted[0].type,
    RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
    'event type is stale_fence_token',
  );
  t.equal(emitted[0].ownerKey, 'key-A');
  t.equal(emitted[0].providedToken, 3);
  t.equal(emitted[0].currentToken, 5);
  t.equal(emitted[0].queue, 'event-queue');
  t.ok(typeof emitted[0].timestamp === 'number');

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - emits typed event on stale fence ' +
  'rejection at drain time', async (t) => {
  const emitted = [];
  let resolveGate;
  const gate = new Promise((resolve) => {
    resolveGate = resolve;
  });
  let callCount = 0;

  const queue = new OwnerKeyReconcileQueue({
    name: 'drain-event-queue',
    reconcileFn: async () => {
      callCount++;
      if (callCount === 1) {
        await gate;
      }
    },
  });

  queue.on(
    RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN,
    (evt) => emitted.push(evt),
  );

  // Enqueue key-B with fence token 2 — starts drain.
  queue.enqueue(
    'key-B', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: 2},
  );

  // Let drain start and block on gate.
  await Promise.resolve();
  await Promise.resolve();

  // While key-B is in-flight, enqueue key-B again with token 5.
  // This merges into pending (deferred because in-flight).
  queue.enqueue(
    'key-B', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: 5},
  );

  // Now advance the fence token to 10 so that when the deferred
  // item (token 5) is drained, it will be stale.
  queue.fenceTokens.set('key-B', 10);

  // Release the first reconcile so drain picks up the deferred
  // item and hits the stale-fence check.
  resolveGate();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.ok(emitted.length >= 1, 'drain-time stale event emitted');
  const evt = emitted[0];
  t.equal(
    evt.type,
    RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
  );
  t.equal(evt.ownerKey, 'key-B');
  t.equal(evt.providedToken, 5);
  t.equal(evt.currentToken, 10);

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - emits typed event on in-flight ' +
  'deferral', async (t) => {
  const emitted = [];
  let resolveFirst;
  const firstGate = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const queue = new OwnerKeyReconcileQueue({
    name: 'defer-event-queue',
    reconcileFn: async (ownerKey) => {
      if (ownerKey === 'key-C') {
        await firstGate;
      }
    },
  });

  queue.on(
    RECONCILE_QUEUE_EVENT.STALE_CLAIM_DEFERRED,
    (evt) => emitted.push(evt),
  );

  // Enqueue key-C — drain starts.
  queue.enqueue('key-C', RECONCILE_REASON.PERIODIC_CHECK);
  await Promise.resolve();
  await Promise.resolve();

  // key-C is in-flight. Enqueue again.
  queue.enqueue('key-C', RECONCILE_REASON.NODE_FAILED);

  // Force a second drain pass to hit the in-flight guard.
  const secondDrain = queue.drain();
  await Promise.resolve();
  await Promise.resolve();

  resolveFirst();
  await secondDrain;
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.ok(emitted.length >= 1, 'deferral event emitted');
  t.equal(
    emitted[0].type,
    RECONCILE_QUEUE_DIAGNOSTIC.STALE_CLAIM_IN_FLIGHT,
  );
  t.equal(emitted[0].ownerKey, 'key-C');
  t.equal(emitted[0].queue, 'defer-event-queue');

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - getDiagnostics exposes aggregate ' +
  'metrics', async (t) => {
  const queue = new OwnerKeyReconcileQueue({
    name: 'metrics-queue',
    reconcileFn: async () => {},
  });

  // Initial state: all counters zero.
  const d0 = queue.getDiagnostics();
  t.equal(d0.staleFenceRejectionCount, 0);
  t.equal(d0.staleInFlightDeferralCount, 0);
  t.same(d0.recentStaleFenceSamples, []);

  // Trigger a stale-fence rejection at enqueue time.
  queue.enqueue(
    'k1', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: 10},
  );
  queue.enqueue(
    'k1', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: 3},
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  const d1 = queue.getDiagnostics();
  t.equal(
    d1.staleFenceRejectionCount, 1,
    'one stale-fence rejection counted',
  );
  t.equal(
    d1.staleInFlightDeferralCount, 0,
    'no in-flight deferrals yet',
  );
  t.equal(
    d1.recentStaleFenceSamples.length, 1,
    'one sample in ring buffer',
  );
  t.equal(
    d1.recentStaleFenceSamples[0].type,
    RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
  );

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - ring buffer wraps at capacity',
  async (t) => {
    const queue = new OwnerKeyReconcileQueue({
      name: 'ring-queue',
      reconcileFn: async () => {},
    });

    // Establish a high fence token so all subsequent lower tokens
    // are rejected.
    const highToken = STALE_FENCE_SAMPLE_CAPACITY + 10;
    queue.enqueue(
      'k1', RECONCILE_REASON.PERIODIC_CHECK, null,
      {fenceToken: highToken},
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // Generate more rejections than the buffer capacity.
    const totalRejections = STALE_FENCE_SAMPLE_CAPACITY + 5;
    for (let i = 0; i < totalRejections; i++) {
      queue.enqueue(
        'k1', RECONCILE_REASON.NODE_FAILED, null,
        {fenceToken: i},
      );
    }

    const diag = queue.getDiagnostics();
    t.equal(
      diag.recentStaleFenceSamples.length,
      STALE_FENCE_SAMPLE_CAPACITY,
      'ring buffer capped at capacity',
    );
    t.equal(
      diag.staleFenceRejectionCount,
      totalRejections,
      'aggregate count tracks all rejections',
    );

    // The oldest entries should have been overwritten.
    // The most recent entry should have providedToken equal to
    // totalRejections - 1.
    const lastSample = diag.recentStaleFenceSamples.find(
      (s) => s.providedToken === totalRejections - 1,
    );
    t.ok(lastSample, 'most recent rejection is in the buffer');

    // The very first entry (providedToken === 0) should have been
    // overwritten since we exceeded capacity by 5.
    const firstSample = diag.recentStaleFenceSamples.find(
      (s) => s.providedToken === 0,
    );
    t.notOk(
      firstSample,
      'oldest entry was overwritten by ring buffer wrap',
    );

    queue.shutdown();
  });

// ===================================================================
// Stale-fence regression coverage (Task 5.3)
// ===================================================================

test('REGRESSION: stale claim in reconcile queue is rejected and ' +
  'does not execute reconcile callback', async (t) => {
  const reconciled = [];
  const queue = new OwnerKeyReconcileQueue({
    name: 'stale-claim-queue',
    reconcileFn: async (ownerKey, reasons) => {
      reconciled.push({ownerKey, reasons});
    },
  });

  // Establish fence token 10 for key-A.
  queue.enqueue(
    'key-A', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: 10},
  );

  // Let the first item drain.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(reconciled.length, 1,
    'first enqueue must be reconciled');

  // Attempt to enqueue with stale token 3.
  const staleResult = queue.enqueue(
    'key-A', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: 3},
  );
  t.equal(staleResult, false,
    'stale enqueue must return false');

  // Let any potential drain complete.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  // The reconcile callback must NOT have been called again.
  t.equal(reconciled.length, 1,
    'reconcile callback must not execute for stale claim');

  // Diagnostics must record the rejection.
  const diag = queue.getDiagnostics();
  t.equal(diag.staleFenceRejectionCount, 1,
    'aggregate rejection count must be 1');
  const staleClaims = diag.staleClaims.filter(
    (c) => c.type === RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
  );
  t.equal(staleClaims.length, 1,
    'one stale fence diagnostic must be recorded');
  t.equal(staleClaims[0].providedToken, 3);
  t.equal(staleClaims[0].currentToken, 10);

  queue.shutdown();
});

test('REGRESSION: concurrent fence advancement during in-flight ' +
  'reconcile rejects stale deferred item', async (t) => {
  const reconciled = [];
  const emittedDrain = [];
  let resolveFirst;
  const firstGate = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const queue = new OwnerKeyReconcileQueue({
    name: 'concurrent-fence-queue',
    reconcileFn: async (ownerKey, reasons) => {
      reconciled.push({ownerKey, reasons});
      if (ownerKey === 'key-B' && reconciled.length === 1) {
        await firstGate;
      }
    },
  });

  queue.on(
    RECONCILE_QUEUE_EVENT.STALE_FENCE_REJECTED_DRAIN,
    (evt) => emittedDrain.push(evt),
  );

  // Enqueue key-B with fence token 2 — starts drain.
  queue.enqueue(
    'key-B', RECONCILE_REASON.PERIODIC_CHECK, null,
    {fenceToken: 2},
  );

  // Let drain start and block on gate.
  await Promise.resolve();
  await Promise.resolve();

  // While key-B is in-flight, enqueue again with token 5.
  // This defers into pending because key-B is in-flight.
  queue.enqueue(
    'key-B', RECONCILE_REASON.NODE_FAILED, null,
    {fenceToken: 5},
  );

  // Concurrently advance the fence token to 20 (simulating
  // another actor advancing the epoch while reconcile runs).
  queue.fenceTokens.set('key-B', 20);

  // Release the first reconcile. The deferred item (token 5)
  // should be rejected at drain time because 5 < 20.
  resolveFirst();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  // The deferred item must NOT have been reconciled.
  const keyBCalls = reconciled.filter(
    (r) => r.ownerKey === 'key-B',
  );
  t.equal(keyBCalls.length, 1,
    'key-B must be reconciled only once (stale deferred rejected)');

  // A drain-time stale fence event must have been emitted.
  t.equal(emittedDrain.length, 1,
    'one drain-time stale fence event must be emitted');
  t.equal(emittedDrain[0].ownerKey, 'key-B');
  t.equal(emittedDrain[0].providedToken, 5);
  t.equal(emittedDrain[0].currentToken, 20);
  t.equal(
    emittedDrain[0].type,
    RECONCILE_QUEUE_DIAGNOSTIC.STALE_FENCE_TOKEN,
    'event type must be stale_fence_token',
  );

  // Diagnostics must reflect the rejection.
  const diag = queue.getDiagnostics();
  t.ok(diag.staleFenceRejectionCount >= 1,
    'aggregate stale fence rejection count must be >= 1');
  t.ok(diag.recentStaleFenceSamples.length >= 1,
    'ring buffer must contain the rejection sample');

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - retryable drain failure preserves ' +
  'structured retry state and retries', async (t) => {
  let callCount = 0;
  const reconciled = [];
  const retryContext = {handoff: true};
  const queue = new OwnerKeyReconcileQueue({
    name: 'retryable-drain-queue',
    retryPolicy: {
      isRetryableError(error) {
        return error?.code === RECONCILE_QUEUE_RETRYABLE_FAILURE_CODE;
      },
      getRetryAfterMs() {
        return RECONCILE_QUEUE_RETRYABLE_RETRY_AFTER_MS;
      },
      getFailureReason() {
        return RECONCILE_QUEUE_RETRYABLE_DISTRIBUTED_FAILURE;
      },
    },
    reconcileFn: async (ownerKey, reasons, context) => {
      callCount++;
      if (callCount === 1) {
        const error = new Error(RECONCILE_QUEUE_RETRYABLE_FAILURE_MESSAGE);
        error.code = RECONCILE_QUEUE_RETRYABLE_FAILURE_CODE;
        throw error;
      }
      reconciled.push({ownerKey, reasons, context});
    },
  });

  queue.enqueue(
    'key-retry',
    RECONCILE_REASON.PERIODIC_CHECK,
    retryContext,
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  const retryingDiagnostics = queue.getDiagnostics();
  t.same(
    retryingDiagnostics.retryingKeys,
    ['key-retry'],
    'retryable failure keeps the owner key in retry state',
  );
  t.equal(
    queue.has('key-retry'),
    true,
    'retrying owner key remains observable to queue admission',
  );
  t.equal(
    queue.size,
    1,
    'retrying owner key counts against queue capacity',
  );
  t.match(
    retryingDiagnostics.retryStates['key-retry'],
    {
      type: RECONCILE_QUEUE_RETRYABLE_DRAIN_FAILURE,
      ownerKey: 'key-retry',
      failureReason: RECONCILE_QUEUE_RETRYABLE_DISTRIBUTED_FAILURE,
      retryAfterMs: RECONCILE_QUEUE_RETRYABLE_RETRY_AFTER_MS,
      failureCount: 1,
    },
    'retry state records the retryable distributed participant failure',
  );

  await new Promise((resolve) => {
    setTimeout(resolve, RECONCILE_QUEUE_RETRYABLE_WAIT_MS);
  });

  t.equal(callCount, 2, 'retry timer drains the preserved item');
  t.same(
    reconciled,
    [{
      ownerKey: 'key-retry',
      reasons: [RECONCILE_REASON.PERIODIC_CHECK],
      context: retryContext,
    }],
    'retry drain preserves original owner work context',
  );

  const drainedDiagnostics = queue.getDiagnostics();
  t.same(
    drainedDiagnostics.retryingKeys,
    [],
    'successful retry clears retrying owner key state',
  );
  t.equal(
    drainedDiagnostics.retryableDrainFailureCount,
    1,
    'retryable drain failure count remains available for diagnostics',
  );

  queue.shutdown();
});

test('OwnerKeyReconcileQueue - injectable scheduler bounds each drain turn',
  async (t) => {
    const scheduled = [];
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      name: 'macrotask-bounded-queue',
      maxItemsPerDrain: 1,
      scheduleDrainFn: (callback) => scheduled.push(callback),
      reconcileFn: async (ownerKey, _reasons, context) => {
        reconciled.push({ownerKey, context});
      },
    });

    for (let index = 0; index < 5; index++) {
      queue.enqueue(`key-${index}`, 'source_changed', {revision: index});
    }
    t.equal(scheduled.length, 1, 'a burst creates one scheduled drain');

    while (scheduled.length > 0) {
      const runTurn = scheduled.shift();
      const before = reconciled.length;
      runTurn();
      await Promise.resolve();
      await Promise.resolve();
      t.ok(
        reconciled.length - before <= 1,
        'each scheduled turn starts at most one heavy item',
      );
    }
    t.same(
      reconciled.map(({ownerKey}) => ownerKey),
      ['key-0', 'key-1', 'key-2', 'key-3', 'key-4'],
      'dirty owner keys retain round-robin insertion order',
    );
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - pending promotion preserves coalesced work',
  async (t) => {
    const scheduled = [];
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      name: 'priority-promotion-queue',
      maxItemsPerDrain: 1,
      scheduleDrainFn: (callback) => scheduled.push(callback),
      reconcileFn: async (ownerKey, reasons, context) => {
        reconciled.push({ownerKey, reasons: [...reasons], context});
      },
    });
    queue.enqueue('background-a', 'source_changed', {revision: 1});
    queue.enqueue('formation', 'source_changed', {revision: 2});
    queue.enqueue('background-b', 'source_changed', {revision: 3});
    queue.enqueue('formation', 'completion_wake', {revision: 4});

    t.equal(queue.promotePending('formation'), true,
      'a pending owner can be promoted');
    while (scheduled.length > 0) {
      for (let turn = 0; turn < 6; turn++) {
        if (scheduled.length > 0) scheduled.shift()();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    }
    t.same(
      reconciled.map(({ownerKey}) => ownerKey),
      ['formation', 'background-a', 'background-b'],
      'promotion changes order without dropping the remaining owners',
    );
    t.same(
      reconciled[0],
      {
        ownerKey: 'formation',
        reasons: ['source_changed', 'completion_wake'],
        context: {revision: 4},
      },
      'promotion preserves merged reasons and the newest context',
    );
    t.equal(queue.promotePending('missing'), false,
      'promotion reports absent pending work without mutation');
    queue.shutdown();
  });

test('OwnerKeyReconcileQueue - retry exhaustion is loud and only a new ' +
  'semantic generation resets attempts', async (t) => {
  let callCount = 0;
  let shouldSucceed = false;
  const exhausted = [];
  const queue = new OwnerKeyReconcileQueue({
    name: 'bounded-retry-queue',
    reconcileFn: async () => {
      callCount++;
      if (!shouldSucceed) {
        throw new Error('repeatable failure');
      }
    },
    retryPolicy: {
      isRetryableError: () => true,
      getRetryAfterMs: () => 1,
      getFailureReason: () => 'bounded_failure',
      maxAttempts: 3,
      shouldResetAttempts: (previous, next) =>
        previous?.generation !== next?.generation,
    },
  });
  queue.on('retryable_drain_exhausted', (event) => exhausted.push(event));
  queue.enqueue('owner-a', 'source_changed', {generation: 1});
  await new Promise((resolve) => setTimeout(resolve, 30));
  t.equal(callCount, 3, 'retryable work stops at the configured attempt bound');
  t.equal(exhausted.length, 1, 'exhaustion emits one typed loud event');
  t.match(queue.getDiagnostics(), {
    exhaustedRetryKeys: ['owner-a'],
    retryableDrainExhaustedCount: 1,
  }, 'the terminal failed vector remains diagnosable without a live timer');

  queue.enqueue('owner-a', 'live_veto', {generation: 1});
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(callCount, 3,
    'same-generation nudges cannot reset an exhausted retry forever');

  shouldSucceed = true;
  queue.enqueue('owner-a', 'source_changed', {generation: 2});
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(callCount, 4, 'a new semantic generation receives a fresh attempt');
  t.same(queue.getDiagnostics().exhaustedRetryKeys, [],
    'successful replacement generation clears exhaustion state');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - retry clock is injected and unsafe timer ' +
  'delays fail closed', async (t) => {
  const scheduled = [];
  const timers = [];
  const cleared = [];
  let now = 4_242;
  let callCount = 0;
  const queue = new OwnerKeyReconcileQueue({
    name: 'deterministic-retry-queue',
    now: () => now,
    scheduleDrainFn: (callback) => scheduled.push(callback),
    setTimeoutFn: (callback, delayMs) => {
      const timer = {callback, delayMs, unref: () => {}};
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => cleared.push(timer),
    reconcileFn: async () => {
      callCount++;
      throw new Error('deterministic failure');
    },
    retryPolicy: {
      isRetryableError: () => true,
      getRetryAfterMs: () => Number.MAX_SAFE_INTEGER,
      maxAttempts: 2,
    },
  });
  queue.enqueue('owner-a', 'source_changed');
  scheduled.shift()();
  await Promise.resolve();
  await Promise.resolve();
  t.equal(timers[0].delayMs, 1_000,
    'an unsafe platform timer delay uses the bounded fallback');
  t.match(queue.getDiagnostics().retryStates['owner-a'], {
    timestamp: 4_242,
    nextAttemptAt: 5_242,
  }, 'retry diagnostics use the injected clock');
  now = 5_242;
  timers[0].callback();
  scheduled.shift()();
  await Promise.resolve();
  await Promise.resolve();
  t.equal(callCount, 2, 'the injected timer drives the bounded second attempt');
  queue.shutdown();
  t.ok(cleared.length <= 1,
    'shutdown and timer wake clear only the injected timer handle');
});

test('OwnerKeyReconcileQueue - same-owner in-flight enqueue cannot evade ' +
  'retry exhaustion', async (t) => {
  const scheduled = [];
  const timers = [];
  let callCount = 0;
  const queue = new OwnerKeyReconcileQueue({
    name: 'self-enqueue-bounded-retry-queue',
    scheduleDrainFn: (callback) => scheduled.push(callback),
    setTimeoutFn: (callback, delayMs) => {
      const timer = {callback, delayMs, unref() {}};
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    retryPolicy: {
      isRetryableError: () => true,
      getRetryAfterMs: () => 1,
      maxAttempts: 3,
      shouldResetAttempts: (previous, next) =>
        previous?.generation !== next?.generation,
    },
    reconcileFn: async () => {
      callCount++;
      queue.enqueue('owner-a', 'same_generation_wake', {generation: 1});
      throw new Error('self-enqueued retryable failure');
    },
  });
  queue.enqueue('owner-a', 'source_changed', {generation: 1});
  for (let turn = 0; turn < 8; turn++) {
    if (scheduled.length > 0) scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    if (timers.length > 0) timers.shift().callback();
  }
  const diagnostics = queue.getDiagnostics();
  t.equal(callCount, 3,
    'same-generation self-enqueue stops at the configured attempt bound');
  t.equal(diagnostics.retryableDrainExhaustedCount, 1,
    'self-enqueue exhaustion remains loud and typed');
  t.same(diagnostics.exhaustedRetryKeys, ['owner-a'],
    'the exhausted owner remains diagnosable rather than pending forever');
  t.equal(queue.size, 0, 'no live retry work survives exhaustion');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - retry normalization uses captured numeric ' +
  'intrinsics', async (t) => {
  const scheduled = [];
  const timers = [];
  const queue = new OwnerKeyReconcileQueue({
    scheduleDrainFn: (callback) => scheduled.push(callback),
    setTimeoutFn: (callback, delayMs) => {
      const timer = {callback, delayMs, unref() {}};
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    retryPolicy: {
      isRetryableError: () => true,
      getRetryAfterMs: () => 7,
      maxAttempts: 2,
    },
    reconcileFn: async () => {
      throw new Error('retry through captured intrinsics');
    },
  });
  const originalIsSafeInteger = Number.isSafeInteger;
  const originalIsFinite = Number.isFinite;
  let observedDelay;
  try {
    Number.isSafeInteger = () => false;
    Number.isFinite = () => false;
    queue.enqueue('owner-a', 'source_changed');
    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    observedDelay = timers[0]?.delayMs;
  } finally {
    Number.isSafeInteger = originalIsSafeInteger;
    Number.isFinite = originalIsFinite;
    queue.shutdown();
  }
  t.equal(observedDelay, 7,
    'post-import Number mutation cannot rewrite a valid retry delay');
});

test('OwnerKeyReconcileQueue - collection iterator prototypes cannot stop ' +
  'or strand owner progress', async (t) => {
  const mapIteratorPrototype = Object.getPrototypeOf(new Map().entries());
  const setIteratorPrototype = Object.getPrototypeOf(new Set().values());
  const sharedIteratorPrototype = Object.getPrototypeOf(mapIteratorPrototype);

  const drainWithHostileDescriptor = async (prototype, property, message) => {
    const scheduled = [];
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      maxConcurrency: 2,
      scheduleDrainFn: (callback) => scheduled.push(callback),
      reconcileFn: async (ownerKey) => reconciled.push(ownerKey),
    });
    queue.enqueue('owner-a', 'source_changed');
    queue.enqueue('owner-b', 'source_changed');
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      property,
    );
    let escaped = null;
    try {
      Object.defineProperty(prototype, property, {
        configurable: true,
        value: () => {
          throw new Error(message);
        },
        writable: true,
      });
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    } catch (error) {
      escaped = error;
    } finally {
      Object.defineProperty(prototype, property, originalDescriptor);
    }
    const diagnostics = queue.getDiagnostics();
    queue.shutdown();
    return {diagnostics, escaped, reconciled};
  };

  const hostileMapNext = await drainWithHostileDescriptor(
    mapIteratorPrototype,
    'next',
    'hostile MapIterator.next',
  );
  t.equal(hostileMapNext.escaped, null,
    'Map iterator next mutation cannot escape drain');
  t.same(hostileMapNext.reconciled.sort(), ['owner-a', 'owner-b'],
    'Map iterator next mutation cannot stop unrelated owners');
  t.same(hostileMapNext.diagnostics.pendingKeys, [],
    'Map iterator next mutation leaves no stranded pending work');

  const hostileSharedIterator = await drainWithHostileDescriptor(
    sharedIteratorPrototype,
    Symbol.iterator,
    'hostile Iterator.iterator',
  );
  t.equal(hostileSharedIterator.escaped, null,
    'shared iterator mutation cannot escape drain');
  t.same(hostileSharedIterator.reconciled.sort(), ['owner-a', 'owner-b'],
    'shared iterator mutation cannot stop owner progress');

  const reconciled = [];
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async (ownerKey) => reconciled.push(ownerKey),
  });
  const originalSetNext = Object.getOwnPropertyDescriptor(
    setIteratorPrototype,
    'next',
  );
  let setIteratorError = null;
  try {
    Object.defineProperty(setIteratorPrototype, 'next', {
      configurable: true,
      value: () => {
        throw new Error('hostile SetIterator.next');
      },
      writable: true,
    });
    await queue._startReconcile('owner-c', {
      context: null,
      reasons: new Set(['source_changed']),
    });
  } catch (error) {
    setIteratorError = error;
  } finally {
    Object.defineProperty(setIteratorPrototype, 'next', originalSetNext);
  }
  t.equal(setIteratorError, null,
    'Set iterator next mutation cannot escape before retry ownership');
  t.same(reconciled, ['owner-c'],
    'Set iterator mutation cannot lose the claimed owner work');
  t.notOk(queue.isInFlight('owner-c'),
    'Set iterator mutation cannot strand an owner in flight');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - inherited Array setters cannot swallow ' +
  'collection snapshots', async (t) => {
  const scheduled = [];
  const reconciled = Object.create(null);
  const queue = new OwnerKeyReconcileQueue({
    maxConcurrency: 2,
    scheduleDrainFn: (callback) => scheduled.push(callback),
    reconcileFn: async (ownerKey) => {
      reconciled[ownerKey] = true;
    },
  });
  queue.logger = {debug() {}, error() {}, warn() {}};
  queue.enqueue('owner-a', 'source_changed');
  queue.enqueue('owner-b', 'source_changed');
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    '0',
  );
  const definePrototypeProperty = (target, property, descriptor) =>
    Reflect.defineProperty(target, property, descriptor);
  let escaped = null;
  try {
    definePrototypeProperty(Array.prototype, '0', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: () => {},
    });
    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  } catch (error) {
    escaped = error;
  } finally {
    if (originalDescriptor) {
      definePrototypeProperty(Array.prototype, '0', originalDescriptor);
    } else {
      delete Array.prototype[0];
    }
  }
  const diagnostics = queue.getDiagnostics();
  t.equal(escaped, null,
    'an inherited Array index setter cannot escape drain');
  t.same(Object.keys(reconciled).sort(), ['owner-a', 'owner-b'],
    'an inherited Array index setter cannot swallow owner progress');
  t.same(diagnostics.pendingKeys, [],
    'an inherited Array index setter leaves no stranded pending work');
  t.same(diagnostics.inFlightKeys, [],
    'an inherited Array index setter leaves no stranded in-flight owner');
  queue.shutdown();
});
