import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../../src/control-plane/pressure-governor.js';
import {PRESSURE_GOVERNOR_EVENT} from
  '../../src/control-plane/pressure-governor-release-watch.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  createBulkTransferChannelRegistry,
  createByteRateTokenBucket,
} from '../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const LOCAL_NODE_ID = 'node-local';
const PEER_NODE_ID = 'node-peer';
const LOCAL_ADDRESS = 'ws://node-local:7000';

function initTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL_NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
  PressureGovernor.clearSharedForTests();
}

function cleanupTestEnvironment() {
  PressureGovernor.clearSharedForTests();
  ConfigurationManager.resetInstance();
  LoggingService.getInstance();
}

function holdDelivery() {
  let release = null;
  const deliverFn = () =>
    new Promise((resolve) => {
      release = () => resolve({acknowledged: true});
    });
  return {
    deliverFn,
    release: () => release?.(),
  };
}

test('MessageRouter.getAdmissionPressureFacts exposes only narrow admission ' +
  'facts and monotonic pressureRevision while PressureGovernor makes 0 calls ' +
  'to getStats()', async (t) => {
  initTestEnvironment();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_ADDRESS,
    startServer: false,
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 8,
    outboundQueueCriticalReserve: 2,
    outboundQueueReadinessReserve: 1,
  });
  await router.initialize();

  let getStatsCalls = 0;
  const origGetStats = router.getStats.bind(router);
  router.getStats = () => {
    getStatsCalls += 1;
    return origGetStats();
  };

  try {
    const rev0 = router.getPressureRevision();
    const facts0 = router.getAdmissionPressureFacts();
    t.equal(facts0.pressureRevision, rev0,
      'initial facts carry the router pressureRevision');
    t.same(
      Object.keys(facts0).sort(),
      ['bulkChannel', 'outboundQueues', 'pressureRevision'],
      'narrow facts expose only pressureRevision, outboundQueues, and bulkChannel',
    );

    const held = holdDelivery();
    const firstPromise = router.enqueueOutbound(PEER_NODE_ID, held.deliverFn, {
      deliveryPriority: 'critical',
    });
    await Promise.resolve();

    const revAfterInFlight = router.getPressureRevision();
    t.ok(revAfterInFlight > rev0,
      'enqueueing and acquiring in-flight slot advances pressureRevision');

    const queuedPromise = router.enqueueOutbound(
      PEER_NODE_ID,
      async () => ({acknowledged: true}),
      {deliveryPriority: 'background'},
    );
    await Promise.resolve();

    const revAfterQueued = router.getPressureRevision();
    t.ok(revAfterQueued > revAfterInFlight,
      'queueing a pending delivery advances pressureRevision again');

    const facts1 = router.readAdmissionPressureFacts();
    const peerQueueFacts = facts1.outboundQueues[PEER_NODE_ID];
    t.ok(peerQueueFacts, 'peer queue facts are populated');
    t.equal(peerQueueFacts.inFlight, 1, 'inFlight count is present');
    t.equal(peerQueueFacts.inFlightCritical, 1,
      'inFlightCritical count is present');
    t.equal(peerQueueFacts.pending, 1, 'pending count is present');
    t.equal(peerQueueFacts.pendingBackground, 1,
      'pendingBackground count is present');
    t.equal(peerQueueFacts.criticalReserve, 2,
      'criticalReserve bound is present');
    t.equal(peerQueueFacts.readinessReserve, 1,
      'readinessReserve bound is present');
    t.equal(peerQueueFacts.maxPending, 8, 'maxPending bound is present');
    t.equal(
      Object.prototype.hasOwnProperty.call(peerQueueFacts, 'queueWait'),
      false,
      'narrow queue facts omit expensive queueWait histogram summaries',
    );

    const governor = new PressureGovernor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: router,
    });
    const decision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: ['control-plane:read'],
    });
    t.equal(decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'control-plane read is allowed while reserve is available');
    t.equal(getStatsCalls, 0,
      'PressureGovernor makes 0 calls to messageRouter.getStats()');

    held.release();
    await Promise.all([firstPromise, queuedPromise]);
  } finally {
    await router.shutdown();
    cleanupTestEnvironment();
  }
});

test('PressureGovernor never falls back to messageRouter.getStats() when ' +
  'only getStats is defined on a collaborator', async (t) => {
  initTestEnvironment();
  let getStatsCalls = 0;
  const governor = new PressureGovernor({
    nodeId: LOCAL_NODE_ID,
    messageRouter: {
      getStats() {
        getStatsCalls += 1;
        throw new Error('getStats must never be called by PressureGovernor');
      },
    },
  });
  try {
    const decision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['query-plane:read'],
    });
    t.equal(getStatsCalls, 0,
      'getStats is never called even when it is the only method on messageRouter');
    t.equal(decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'governor returns the no-pressure transport summary without calling getStats');
  } finally {
    governor.dispose();
    cleanupTestEnvironment();
  }
});

test('PressureGovernor reuses one narrow pressure-facts snapshot across a ' +
  'synchronous evaluation pass (waiters + release watches) when ' +
  'pressureRevision is unchanged', async (t) => {
  initTestEnvironment();
  const nowMs = 1000;
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_ADDRESS,
    startServer: false,
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 4,
    outboundQueueCriticalReserve: 1,
    outboundQueueReadinessReserve: 1,
  });
  await router.initialize();

  let getStatsCalls = 0;
  router.getStats = () => {
    getStatsCalls += 1;
    throw new Error('getStats must not be called');
  };

  let getFactsCalls = 0;
  const origGetFacts = router.getAdmissionPressureFacts.bind(router);
  router.getAdmissionPressureFacts = () => {
    getFactsCalls += 1;
    return origGetFacts();
  };

  const held = holdDelivery();
  const pendingPromises = [];
  try {
    // Occupy the 1 in-flight slot and fill the queue (4 pending: 1 critical, 3 background)
    // so control-plane, query-plane, and background partitions are all backpressured.
    pendingPromises.push(
      router.enqueueOutbound(PEER_NODE_ID, held.deliverFn, {
        deliveryPriority: 'critical',
      }),
    );
    await Promise.resolve();
    pendingPromises.push(
      router.enqueueOutbound(PEER_NODE_ID, async () => ({acknowledged: true}), {
        deliveryPriority: 'critical',
      }),
    );
    for (let i = 0; i < 3; i += 1) {
      pendingPromises.push(
        router.enqueueOutbound(
          PEER_NODE_ID,
          async () => ({acknowledged: true}),
          {deliveryPriority: 'background'},
        ),
      );
    }
    await Promise.resolve();

    const governor = new PressureGovernor({
      nodeId: LOCAL_NODE_ID,
      now: () => nowMs,
      messageRouter: router,
    });

    // Park 4 waiters across different classes and partitions.
    const w1 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['query-plane:read'],
    });
    const w2 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: ['control-plane:write'],
    });
    const w3 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: ['control-plane:write'],
    });
    const w4 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['join:repair'],
    });
    t.equal(governor.admissionWaiters.length, 4, 'all 4 waiters parked');

    // Register 3 release watches across partitions.
    const releasedEvents = [];
    governor.watchPressureRelease(
      {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        resourceKeys: ['control-plane:write'],
      },
      (ev) => releasedEvents.push(['watch-cp', ev.decision.action]),
    );
    governor.watchPressureRelease(
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: ['query-plane:read'],
      },
      (ev) => releasedEvents.push(['watch-qp', ev.decision.action]),
    );
    governor.watchPressureRelease(
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: ['join:repair'],
      },
      (ev) => releasedEvents.push(['watch-bg', ev.decision.action]),
    );
    t.equal(governor.releaseWatches.length, 3, 'all 3 release watches armed');

    // Reset counter before running a full synchronous evaluation pass while
    // pressureRevision is unchanged.
    getFactsCalls = 0;
    governor.runAdmissionPollPass();

    t.equal(getStatsCalls, 0, '0 calls to messageRouter.getStats()');
    t.equal(getFactsCalls, 1,
      'exactly 1 call to getAdmissionPressureFacts() across 4 waiters + 3 release watches when pressureRevision is unchanged');
    t.equal(governor.admissionWaiters.length, 4,
      'waiters remain parked while queue pressure is unchanged');
    t.equal(releasedEvents.length, 0,
      'no release watch fires while queue pressure is unchanged');

    // Now drain the router queue so pressure clears, then run one synchronous pass.
    held.release();
    await Promise.all(pendingPromises);

    const admittedOrder = [];
    w1.then((d) => admittedOrder.push(['w1-bg-qp', d.action]));
    w2.then((d) => admittedOrder.push(['w2-int-cp', d.action]));
    w3.then((d) => admittedOrder.push(['w3-crit-cp', d.action]));
    w4.then((d) => admittedOrder.push(['w4-bg-join', d.action]));

    getFactsCalls = 0;
    governor.runAdmissionPollPass();
    await Promise.all([w1, w2, w3, w4]);

    t.equal(getStatsCalls, 0, 'still 0 calls to messageRouter.getStats()');
    t.equal(getFactsCalls, 1,
      'clearing pass also reads getAdmissionPressureFacts() only once across all 4 waiters + 3 watches');
    t.same(
      admittedOrder,
      [
        ['w3-crit-cp', PRESSURE_GOVERNOR_ACTION.ALLOW],
        ['w2-int-cp', PRESSURE_GOVERNOR_ACTION.ALLOW],
        ['w1-bg-qp', PRESSURE_GOVERNOR_ACTION.ALLOW],
        ['w4-bg-join', PRESSURE_GOVERNOR_ACTION.ALLOW],
      ],
      'parked waiters resolve in strict work-class priority order (critical -> interactive -> background FIFO)',
    );
    t.same(
      releasedEvents,
      [
        ['watch-cp', PRESSURE_GOVERNOR_ACTION.ALLOW],
        ['watch-qp', PRESSURE_GOVERNOR_ACTION.ALLOW],
        ['watch-bg', PRESSURE_GOVERNOR_ACTION.ALLOW],
      ],
      'all 3 release watches fire in the same pass',
    );
    governor.dispose();
  } finally {
    held.release();
    await Promise.allSettled(pendingPromises);
    await router.shutdown();
    cleanupTestEnvironment();
  }
});

test('PressureGovernor immediately invalidates the pass snapshot and re-reads ' +
  'when queue state mutates mid-pass', async (t) => {
  initTestEnvironment();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_ADDRESS,
    startServer: false,
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 4,
    outboundQueueCriticalReserve: 1,
    outboundQueueReadinessReserve: 1,
  });
  await router.initialize();

  let getStatsCalls = 0;
  router.getStats = () => {
    getStatsCalls += 1;
    throw new Error('getStats must not be called');
  };

  let getFactsCalls = 0;
  const origGetFacts = router.getAdmissionPressureFacts.bind(router);
  router.getAdmissionPressureFacts = () => {
    getFactsCalls += 1;
    return origGetFacts();
  };

  const held1 = holdDelivery();
  const held2 = holdDelivery();
  const pendingPromises = [];
  try {
    // Initially saturate the background queue (inFlight=1, pendingBackground=3 === backgroundPendingLimit).
    pendingPromises.push(
      router.enqueueOutbound(PEER_NODE_ID, held1.deliverFn, {
        deliveryPriority: 'background',
      }),
    );
    await Promise.resolve();
    for (let i = 0; i < 3; i += 1) {
      pendingPromises.push(
        router.enqueueOutbound(
          PEER_NODE_ID,
          async () => ({acknowledged: true}),
          {deliveryPriority: 'background'},
        ),
      );
    }
    await Promise.resolve();

    const governor = new PressureGovernor({
      nodeId: LOCAL_NODE_ID,
      messageRouter: router,
    });

    // Park 2 background waiters.
    let firstWaiterResolved = false;
    let secondWaiterDecision = null;
    const waiter1 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['query-plane:read'],
    });
    const waiter2 = governor.admit({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['query-plane:read'],
    });
    t.equal(governor.admissionWaiters.length, 2, '2 background waiters parked');

    // Clear the initial queue saturation before the pass starts.
    held1.release();
    await Promise.all(pendingPromises);
    pendingPromises.length = 0;

    // Intercept waiter 1's resolve callback synchronously inside drainAdmissionWaiters()
    // so that when waiter 1 is admitted, it immediately saturates the router's
    // outbound queue mid-pass before waiter 2 is evaluated!
    const origResolve1 = governor.admissionWaiters[0].resolve;
    governor.admissionWaiters[0].resolve = (decision) => {
      firstWaiterResolved = decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW;
      // Synchronously mutate queue state mid-pass: occupy in-flight + 3 background pending.
      pendingPromises.push(
        router.enqueueOutbound(PEER_NODE_ID, held2.deliverFn, {
          deliveryPriority: 'background',
        }),
      );
      for (let i = 0; i < 3; i += 1) {
        pendingPromises.push(
          router.enqueueOutbound(
            PEER_NODE_ID,
            async () => ({acknowledged: true}),
            {deliveryPriority: 'background'},
          ),
        );
      }
      origResolve1(decision);
    };
    const origResolve2 = governor.admissionWaiters[1].resolve;
    governor.admissionWaiters[1].resolve = (decision) => {
      secondWaiterDecision = decision;
      origResolve2(decision);
    };

    // Also register two release watches where watch 1's listener mutates queue state
    // before watch 2 is evaluated in a subsequent check, and verify watch evaluation
    // during this same pass sees the mid-pass saturation!
    const watchEvents = [];
    governor.watchPressureRelease(
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: ['query-plane:read'],
      },
      (ev) => watchEvents.push(ev.decision.action),
    );

    getFactsCalls = 0;
    governor.runAdmissionPollPass();

    t.equal(getStatsCalls, 0, '0 calls to getStats()');
    t.equal(firstWaiterResolved, true,
      'waiter 1 was admitted at the start of the pass when the queue was clear');
    await waiter1;
    t.equal(getFactsCalls, 2,
      'mid-pass queue mutation bumped pressureRevision, invalidating the pass snapshot and triggering a second getAdmissionPressureFacts() read');
    t.equal(secondWaiterDecision, null,
      'waiter 2 saw the mid-pass queue saturation and remained parked instead of using stale pre-mutation facts');
    t.equal(governor.admissionWaiters.length, 1,
      'waiter 2 remains in admissionWaiters');
    t.equal(watchEvents.length, 0,
      'release watch evaluated after waiter 1 also saw the re-read saturated state and did not fire');

    // Now release held2 so waiter 2 and the watch can drain cleanly.
    held2.release();
    await Promise.all(pendingPromises);
    governor.runAdmissionPollPass();
    const w2Decision = await waiter2;
    t.equal(w2Decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'waiter 2 resolves ALLOW once the mid-pass backlog drains');
    t.same(watchEvents, [PRESSURE_GOVERNOR_ACTION.ALLOW],
      'release watch fires once the mid-pass backlog drains');
    governor.dispose();
  } finally {
    held1.release();
    held2.release();
    await Promise.allSettled(pendingPromises);
    await router.shutdown();
    cleanupTestEnvironment();
  }
});

test('PressureGovernor narrow sensor preserves bulk separation, critical and ' +
  'readiness reserves, queue bounds, and original deadlines', async (t) => {
  initTestEnvironment();
  let nowMs = 5000;
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_ADDRESS,
    startServer: false,
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 5,
    outboundQueueCriticalReserve: 1,
    outboundQueueReadinessReserve: 1,
  });
  await router.initialize();

  // Attach a drained bulk channel registry with maxPendingSends=1.
  const drainedBucket = createByteRateTokenBucket({
    bytesPerSecond: 0,
    capacityBytes: 1,
  });
  await drainedBucket.acquire(1);
  const bulkRegistry = createBulkTransferChannelRegistry({
    nodeId: LOCAL_NODE_ID,
    tokenBucket: drainedBucket,
    maxPendingSends: 1,
  });
  router.attachBulkChannelRegistry(bulkRegistry);

  const pair = createInProcWebSocketPair();
  const bulkConn = bulkRegistry.adoptIncomingSocket({
    nodeId: PEER_NODE_ID,
    ws: pair.b,
  });
  const pendingBulkSend = bulkConn.sendChunkFrame(Buffer.alloc(64));
  await Promise.resolve();

  let getStatsCalls = 0;
  router.getStats = () => {
    getStatsCalls += 1;
    throw new Error('getStats must not be called');
  };

  try {
    const governor = new PressureGovernor({
      nodeId: LOCAL_NODE_ID,
      now: () => nowMs,
      messageRouter: router,
    });

    // 1. Bulk saturation defers BULK partition work while control-plane and query-plane remain clear.
    const bulkDecision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['snapshot-transfer:chunk-serve'],
    });
    t.equal(bulkDecision.summary.capacityPartition, 'bulk',
      'snapshot-transfer maps to bulk capacity partition');
    t.equal(bulkDecision.action, PRESSURE_GOVERNOR_ACTION.DEFER,
      'bulk work defers when bulk channel is saturated');

    const queryClearDecision = governor.evaluate({
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: ['query-plane:read'],
    });
    t.equal(queryClearDecision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'bulk saturation does not backpressure query-plane');

    // 2. Park a bulk waiter and verify deadline expiry preserves original deadline.
    const parkedBulk = governor.admit({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['snapshot-transfer:chunk-serve'],
    });
    const parkedReleaseEvents = [];
    governor.watchPressureRelease(
      {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: ['snapshot-transfer:chunk-serve'],
      },
      (ev) => parkedReleaseEvents.push(ev),
    );
    t.equal(governor.admissionWaiters.length, 1, 'bulk waiter parked');
    const originalDeadline = governor.admissionWaiters[0].deadlineAtMs;
    t.equal(originalDeadline, 5000 + 2000,
      'background waiter deadline is bound to enqueue time + 2000ms');

    nowMs = 6999;
    governor.runAdmissionPollPass();
    t.equal(governor.admissionWaiters.length, 1,
      'waiter stays parked before original deadline expires');

    nowMs = 7000;
    governor.runAdmissionPollPass();
    const expiredDecision = await parkedBulk;
    t.equal(expiredDecision.action, PRESSURE_GOVERNOR_ACTION.DEFER,
      'waiter resolves with DEFER decision upon reaching original deadline');
    t.equal(governor.admissionWaiters.length, 0,
      'expired waiter is removed from queue');

    // 3. Close bulk channel so bulk saturation clears -> release watch fires with PRESSURE_RELEASED.
    bulkRegistry.closeAll();
    await Promise.allSettled([pendingBulkSend]);
    governor.runAdmissionPollPass();
    t.equal(parkedReleaseEvents.length, 1,
      'bulk release watch fires once bulk channel saturation clears');
    t.equal(parkedReleaseEvents[0].event, PRESSURE_GOVERNOR_EVENT.PRESSURE_RELEASED,
      'release watch event carries PRESSURE_RELEASED');
    t.equal(parkedReleaseEvents[0].decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'release watch decision is ALLOW');
    t.equal(getStatsCalls, 0, '0 calls to getStats() throughout');
    governor.dispose();
  } finally {
    bulkRegistry.closeAll();
    await Promise.allSettled([pendingBulkSend]);
    await router.shutdown();
    cleanupTestEnvironment();
  }
});
