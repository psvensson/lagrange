import {EventEmitter} from 'node:events';
import net from 'node:net';
import t from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  BULK_CHANNEL_SEND_OUTCOME,
  createBulkTransferChannelRegistry,
  createByteRateTokenBucket,
} from '../../src/transport/bulk-transfer-channel.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {
  ROUTER_IDENTIFY_CHANNEL,
  ROUTER_MESSAGE_TYPE,
  TRANSPORT_EVENT,
} from '../../src/constants/transport.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PressureGovernor,
} from '../../src/control-plane/pressure-governor.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

// raft-snapshot-bulk-transfer (S3) transport lane-isolation guard: with the
// bulk channel saturated (never-draining bulk sends, pending at cap) the
// primary router's critical enqueue + dispatch complete unaffected, bulk
// bytes never appear in the router outbound queues, and the primary
// connection's quarantine state is untouched. The IDENTIFY `channel: bulk`
// fork adopts the socket into the bulk registry AFTER the admission gate and
// BEFORE record mutation: the primary connection is never rekeyed, evicted,
// or reconnect-fought, no NODE_CONNECTED/NODE_IDENTIFIED fires for a bulk
// identify, and a binary frame on an adopted bulk socket can never reach the
// router's JSON parser.

const TEST_LOCAL_NODE_ID = 'local-node';
const TEST_PEER_NODE_ID = 'peer-node';
const TEST_NODE_ADDRESS = 'ws://local-node:7000';
const TEST_PEER_ADDRESS = 'ws://peer-node:7001';
const TEST_CRITICAL_TARGET = 'peer-node/partition/user_orders-p1-r4';
const TEST_MAX_PENDING_SENDS = 2;
const TEST_CHUNK_FRAME_BYTES = 1024;
const TEST_BUCKET_SEED_BYTES = 1;
const CONNECTED_STATE = 'connected';
const BULK_RESOURCE_KEY = 'snapshot-transfer:chunk-serve';
const CONTROL_PLANE_WRITE_KEY = 'control-plane:write';
const BULK_PARTITION = 'bulk';
const CONTROL_PLANE_PARTITION = 'control-plane';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_LOCAL_NODE_ID},
    logging: {level: 'error'},
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// InProcWebSocket delivers frames and close events via microtasks; flush a
// couple of macrotask turns so every queued delivery lands.
async function flushDeliveries() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function identifyMessage(overrides = {}) {
  return JSON.stringify({
    type: ROUTER_MESSAGE_TYPE.IDENTIFY,
    nodeId: TEST_PEER_NODE_ID,
    nodeAddress: TEST_PEER_ADDRESS,
    address: TEST_PEER_ADDRESS,
    timestamp: Date.now(),
    ...overrides,
  });
}

// A token bucket that never refills: seed it with one token and drain it so
// every later acquire parks forever (the never-draining saturation shape).
async function createDrainedBucket() {
  const bucket = createByteRateTokenBucket({
    bytesPerSecond: 0,
    capacityBytes: TEST_BUCKET_SEED_BYTES,
  });
  await bucket.acquire(TEST_BUCKET_SEED_BYTES);
  return bucket;
}

t.test('bulk saturation leaves critical enqueue+dispatch and quarantine ' +
  'untouched, and the governor sees the bulk lane', async (t) => {
  initializeTestEnvironment();
  PressureGovernor.clearSharedForTests();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: TEST_LOCAL_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    startServer: false,
    outboundQueueMaxConcurrent: 1,
    outboundQueueMaxPending: 16,
    outboundQueueCriticalReserve: 1,
  });
  await router.initialize();
  const bucket = await createDrainedBucket();
  const registry = createBulkTransferChannelRegistry({
    nodeId: TEST_LOCAL_NODE_ID,
    tokenBucket: bucket,
    maxPendingSends: TEST_MAX_PENDING_SENDS,
  });
  router.attachBulkChannelRegistry(registry);
  const pendingSends = [];
  try {
    // Establish the primary per-peer connection via the real inbound path.
    const primary = createInProcWebSocketPair();
    router.handleIncomingConnection(primary.b, null);
    primary.a.send(identifyMessage());
    await flushDeliveries();
    t.equal(router.getStats().connections[TEST_PEER_NODE_ID]?.state,
      CONNECTED_STATE, 'the primary peer connection is established');

    // Adopt a bulk socket for the same peer and saturate the bulk lane.
    const bulk = createInProcWebSocketPair();
    const connection = registry.adoptIncomingSocket({
      nodeId: TEST_PEER_NODE_ID,
      ws: bulk.b,
    });
    const frame = Buffer.alloc(TEST_CHUNK_FRAME_BYTES);
    for (let index = 0; index < TEST_MAX_PENDING_SENDS; index += 1) {
      pendingSends.push(connection.sendChunkFrame(frame));
    }
    await Promise.resolve();
    const overflow = await connection.sendChunkFrame(frame);
    t.equal(overflow.outcome, BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT,
      'pending bulk sends are bounded with a typed refusal at the cap');

    const stats = router.getStats();
    t.equal(stats.bulkChannel.pendingRequests, TEST_MAX_PENDING_SENDS,
      'bulk pending requests are visible in the router stats bridge');
    t.equal(stats.bulkChannel.saturatedPeerCount, 1,
      'the saturated bulk peer is visible');
    t.ok(stats.bulkChannel.inFlightBytes > 0,
      'the in-flight bulk chunk bytes are visible');
    t.equal(stats.bulkChannel.tokenDepth, 0,
      'the drained token bucket depth is visible');

    // Critical enqueue + dispatch on the primary router complete unaffected.
    const startedDeliveries = [];
    await router.enqueueOutbound(
      TEST_PEER_NODE_ID,
      async () => {
        startedDeliveries.push('critical');
        return {acknowledged: true};
      },
      {
        deliveryPriority: 'critical',
        targetAddress: TEST_CRITICAL_TARGET,
        message: {},
      },
    );
    t.same(startedDeliveries, ['critical'],
      'a critical delivery dispatches and completes under bulk saturation');
    const afterStats = router.getStats();
    const queue = afterStats.outboundQueues[TEST_PEER_NODE_ID];
    t.equal(queue.pending, 0,
      'no bulk bytes ever appear in the router outbound queue');
    t.equal(queue.pendingBackground, 0,
      'the bulk lane contributes nothing to the background queue class');
    t.equal(afterStats.connections[TEST_PEER_NODE_ID].ackTimeoutStreak, 0,
      'the primary connection quarantine state is untouched');
    t.equal(afterStats.connections[TEST_PEER_NODE_ID].state, CONNECTED_STATE,
      'the primary connection stays connected under bulk saturation');

    // The pressure governor reads the bulk lane through the stats bridge.
    const governor = new PressureGovernor({
      nodeId: TEST_LOCAL_NODE_ID,
      messageRouter: router,
    });
    const bulkDecision = governor.evaluate({
      workClass: 'background',
      resourceKeys: [BULK_RESOURCE_KEY],
    });
    t.equal(bulkDecision.summary.capacityPartition, BULK_PARTITION,
      'snapshot-transfer resources resolve to the BULK partition');
    t.equal(bulkDecision.summary.backpressured, true,
      'the governor sensor is NOT blind to bulk saturation');
    t.equal(bulkDecision.action, PRESSURE_GOVERNOR_ACTION.DEFER,
      'saturated bulk background work defers (advisory)');
    const criticalDecision = governor.evaluate({
      workClass: 'critical',
      resourceKeys: [CONTROL_PLANE_WRITE_KEY],
    });
    t.equal(criticalDecision.summary.capacityPartition,
      CONTROL_PLANE_PARTITION,
      'critical control-plane work stays on its own partition');
    t.equal(criticalDecision.action, PRESSURE_GOVERNOR_ACTION.ALLOW,
      'bulk saturation never backpressures the critical partition');
  } finally {
    registry.closeAll();
    await Promise.allSettled(pendingSends);
    await router.shutdown();
    PressureGovernor.clearSharedForTests();
    cleanupTestEnvironment();
  }
});

t.test('the IDENTIFY bulk fork adopts the socket and leaves the primary ' +
  'connection intact', async (t) => {
  initializeTestEnvironment();
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: TEST_LOCAL_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    startServer: false,
  });
  await router.initialize();
  const registry = createBulkTransferChannelRegistry({
    nodeId: TEST_LOCAL_NODE_ID,
  });
  router.attachBulkChannelRegistry(registry);
  const identifiedEvents = [];
  router.on(TRANSPORT_EVENT.NODE_CONNECTED,
    (event) => identifiedEvents.push(event));
  router.on(TRANSPORT_EVENT.NODE_IDENTIFIED,
    (event) => identifiedEvents.push(event));
  try {
    // Primary connection first.
    const primary = createInProcWebSocketPair();
    router.handleIncomingConnection(primary.b, null);
    primary.a.send(identifyMessage());
    await flushDeliveries();
    const primaryConnection = router.nodeConnections.get(TEST_PEER_NODE_ID);
    t.ok(primaryConnection, 'the primary connection is keyed by node id');
    const eventsBeforeBulk = identifiedEvents.length;
    t.equal(eventsBeforeBulk, 2,
      'the primary identify emitted nodeConnected + nodeIdentified');

    // Bulk identify on a second socket: forked, adopted, no record mutation.
    const bulk = createInProcWebSocketPair();
    router.handleIncomingConnection(bulk.b, null);
    bulk.a.send(identifyMessage({channel: ROUTER_IDENTIFY_CHANNEL.BULK}));
    await flushDeliveries();
    t.equal(identifiedEvents.length, eventsBeforeBulk,
      'a bulk identify emits NO nodeConnected/nodeIdentified events');
    t.equal(router.nodeConnections.get(TEST_PEER_NODE_ID), primaryConnection,
      'the primary connection is never rekeyed or evicted by the bulk fork');
    t.equal(router.nodeConnections.size, 1,
      'the bulk socket leaves no router connection record behind');
    t.equal(registry.hasConnection(TEST_PEER_NODE_ID), true,
      'the bulk registry adopted the identified bulk socket');

    // A binary chunk frame on the adopted socket never reaches the router's
    // JSON parser (the fork DETACHED the router listeners): a stray binary
    // frame reaching handleMessage would be a rethrown JSON.parse crash.
    const received = [];
    registry.getConnection(TEST_PEER_NODE_ID).onMessage(
      (data) => received.push(data));
    bulk.a.send(Buffer.from([0xff, 0x00, 0xff]));
    await flushDeliveries();
    t.equal(received.length, 1,
      'the registry (not the router) receives post-claim binary frames');

    // Closing the bulk socket must not fight the primary connection.
    bulk.a.close();
    await flushDeliveries();
    t.equal(router.nodeConnections.get(TEST_PEER_NODE_ID), primaryConnection,
      'closing the bulk socket never touches the primary connection');
    t.equal(registry.hasConnection(TEST_PEER_NODE_ID), false,
      'the registry drops the closed bulk channel');
  } finally {
    registry.closeAll();
    await router.shutdown();
    cleanupTestEnvironment();
  }
});

t.test('a bulk identify is refused while external admission is closed',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      externalAdmissionEnabled: false,
    });
    await router.initialize();
    const registry = createBulkTransferChannelRegistry({
      nodeId: TEST_LOCAL_NODE_ID,
    });
    router.attachBulkChannelRegistry(registry);
    try {
      const bulk = createInProcWebSocketPair();
      router.handleIncomingConnection(bulk.b, null);
      bulk.a.send(identifyMessage({channel: ROUTER_IDENTIFY_CHANNEL.BULK}));
      await flushDeliveries();
      t.equal(registry.hasConnection(TEST_PEER_NODE_ID), false,
        'the admission gate refuses the bulk socket before the fork');
      t.equal(router.nodeConnections.size, 0,
        'no connection record survives the refused bulk identify');
    } finally {
      registry.closeAll();
      await router.shutdown();
      cleanupTestEnvironment();
    }
  });

t.test('a stale socket close cannot evict a live replacement connection',
  async (t) => {
    // Verifier MF-1 regression: peer re-dials while the stale bulk socket is
    // still open; the stale socket's ASYNC close event must not delete the
    // replacement from the registry (visibility + closeAll reachability).
    const registry = createBulkTransferChannelRegistry({
      nodeId: TEST_LOCAL_NODE_ID,
    });
    try {
      const stale = createInProcWebSocketPair();
      const first = registry.adoptIncomingSocket({
        nodeId: TEST_PEER_NODE_ID,
        ws: stale.b,
      });
      const replacementPair = createInProcWebSocketPair();
      const replacement = registry.adoptIncomingSocket({
        nodeId: TEST_PEER_NODE_ID,
        ws: replacementPair.b,
      });
      t.not(first, replacement, 'adoption produced a distinct replacement');
      await flushDeliveries();
      t.equal(registry.hasConnection(TEST_PEER_NODE_ID), true,
        'the replacement survives the stale socket close event');
      t.equal(registry.getConnection(TEST_PEER_NODE_ID), replacement,
        'the registry maps the peer to the REPLACEMENT connection');
      t.equal(replacement.isOpen(), true, 'the replacement is still open');
      replacement.close();
      await flushDeliveries();
      t.equal(registry.hasConnection(TEST_PEER_NODE_ID), false,
        'the replacement\'s own close still removes it');
    } finally {
      registry.closeAll();
    }
  });

t.test('aborting an in-flight CONNECTING bulk dial rejects with CANCELLED ' +
  'without an uncaught WebSocket error', async (t) => {
  const registry = createBulkTransferChannelRegistry({
    nodeId: TEST_LOCAL_NODE_ID,
  });
  const openSockets = new Set();
  let connectionSeenResolve = null;
  const connectionSeen = new Promise((resolve) => {
    connectionSeenResolve = resolve;
  });
  const holdServer = net.createServer((socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    connectionSeenResolve();
  });
  await new Promise((resolve) => holdServer.listen(0, '127.0.0.1', resolve));
  const {port} = holdServer.address();
  const uncaughtErrors = [];
  const onUncaught = (err) => uncaughtErrors.push(err);
  process.on('uncaughtException', onUncaught);
  try {
    const controller = new AbortController();
    const dialPromise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: `ws://127.0.0.1:${port}`,
      identify: {
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        bootIncarnation: TEST_BOOT_INCARNATION,
      },
      signal: controller.signal,
    });
    await connectionSeen;
    controller.abort();
    await t.rejects(
      dialPromise,
      {message: BULK_CHANNEL_SEND_OUTCOME.CANCELLED},
      'in-flight CONNECTING dial rejects with CANCELLED when aborted',
    );
    await flushDeliveries();
    await new Promise((resolve) => setTimeout(resolve, 25));
    t.same(uncaughtErrors, [],
      'terminating the CONNECTING WebSocket emits no uncaught error');
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    registry.closeAll();
    for (const socket of openSockets) {
      socket.destroy();
    }
    await new Promise((resolve) => holdServer.close(resolve));
  }
});

function createTrackedAbortSignal() {
  const controller = new AbortController();
  const realSignal = controller.signal;
  const activeListeners = new Set();
  const trackedSignal = {
    get aborted() {
      return realSignal.aborted;
    },
    addEventListener(type, listener, options) {
      activeListeners.add(listener);
      realSignal.addEventListener(type, listener, options);
    },
    removeEventListener(type, listener) {
      activeListeners.delete(listener);
      realSignal.removeEventListener(type, listener);
    },
  };
  return {
    controller,
    signal: trackedSignal,
    activeListenerCount: () => activeListeners.size,
  };
}

function createControllableMockWebSocket() {
  const emitter = new EventEmitter();
  const sentFrames = [];
  let terminated = false;
  let closed = false;
  return {
    sentFrames,
    isTerminated: () => terminated,
    isClosed: () => closed,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emit: emitter.emit.bind(emitter),
    send(payload) {
      sentFrames.push(payload);
    },
    terminate() {
      terminated = true;
    },
    close() {
      closed = true;
    },
  };
}

t.test('tokenBucket.acquire removes its abort listener from a reused signal ' +
  'after normal grant and after dispose()', async (t) => {
  let currentTimeMs = 1000;
  const bucketBytesPerSec = 100000;
  const bucketCapacity = 100;
  const advanceStepMs = 100;
  const drainSettleWaitMs = 15;
  const bucket = createByteRateTokenBucket({
    bytesPerSecond: bucketBytesPerSec,
    capacityBytes: bucketCapacity,
    now: () => currentTimeMs,
  });
  try {
    // Drain initial capacity immediately:
    const initial = await bucket.acquire(bucketCapacity);
    t.equal(initial.acquired, true, 'initial capacity drained');

    const tracked = createTrackedAbortSignal();
    const parkedGrantPromise = bucket.acquire(bucketCapacity, {
      signal: tracked.signal,
    });
    t.equal(
      tracked.activeListenerCount(),
      1,
      'parked acquire attaches one abort listener',
    );

    // Advance clock and keep event loop referenced while unref'd drainTimer fires:
    currentTimeMs += advanceStepMs;
    await new Promise((resolve) => setTimeout(resolve, drainSettleWaitMs));
    const granted = await parkedGrantPromise;
    t.equal(granted.acquired, true, 'parked acquire is granted after refill');
    t.equal(
      tracked.activeListenerCount(),
      0,
      'normal grant removes abort listener from reused signal',
    );

    // Park a second waiter on the same reused signal, then dispose() the bucket:
    const disposedPromise = bucket.acquire(bucketCapacity, {
      signal: tracked.signal,
    });
    t.equal(
      tracked.activeListenerCount(),
      1,
      'second parked acquire attaches one abort listener',
    );
    bucket.dispose();
    const disposedGrant = await disposedPromise;
    t.equal(disposedGrant.acquired, false, 'dispose() settles waiter as not acquired');
    t.equal(
      tracked.activeListenerCount(),
      0,
      'dispose() removes abort listener from reused signal',
    );
  } finally {
    bucket.dispose();
  }
});

t.test('sendChunkFrame settles pre-start and queued sendChain cancellation ' +
  'immediately without leaking pendingSends or abort listeners', async (t) => {
  const bucket = await createDrainedBucket();
  const registry = createBulkTransferChannelRegistry({
    nodeId: TEST_LOCAL_NODE_ID,
    tokenBucket: bucket,
    maxPendingSends: TEST_MAX_PENDING_SENDS,
  });
  const pair = createInProcWebSocketPair();
  const connection = registry.adoptIncomingSocket({
    nodeId: TEST_PEER_NODE_ID,
    ws: pair.b,
  });
  const frame = Buffer.alloc(TEST_CHUNK_FRAME_BYTES);
  try {
    // 1. Pre-start aborted signal returns CANCELLED without occupying pendingSends:
    const preAborted = new AbortController();
    preAborted.abort();
    const preResult = await connection.sendChunkFrame(frame, {
      signal: preAborted.signal,
    });
    t.equal(
      preResult.outcome,
      BULK_CHANNEL_SEND_OUTCOME.CANCELLED,
      'pre-aborted signal returns CANCELLED immediately',
    );
    t.equal(
      connection.getStats().pendingSends,
      0,
      'pre-aborted sendChunkFrame does not increment pendingSends',
    );

    // 2. First send parks inside tokenBucket.acquire; second send parks behind
    // sendChain and is aborted while waiting on sendChain:
    const firstSend = connection.sendChunkFrame(frame);
    await Promise.resolve();
    const trackedSecond = createTrackedAbortSignal();
    const secondSend = connection.sendChunkFrame(frame, {
      signal: trackedSecond.signal,
    });
    t.equal(
      connection.getStats().pendingSends,
      2,
      'both sends are counted in pendingSends before abort',
    );
    t.equal(
      trackedSecond.activeListenerCount(),
      1,
      'queued sendChain waiter attaches one abort listener',
    );

    trackedSecond.controller.abort();
    const secondResult = await secondSend;
    t.equal(
      secondResult.outcome,
      BULK_CHANNEL_SEND_OUTCOME.CANCELLED,
      'queued send waiting on sendChain resolves CANCELLED immediately on abort',
    );
    t.equal(
      connection.getStats().pendingSends,
      1,
      'cancelled queued send releases its pendingSends slot immediately',
    );
    t.equal(
      trackedSecond.activeListenerCount(),
      0,
      'cancelled queued send detaches its abort listener',
    );

    registry.closeAll();
    const firstResult = await firstSend;
    t.equal(
      firstResult.outcome,
      BULK_CHANNEL_SEND_OUTCOME.CANCELLED,
      'first parked send settles when bucket is disposed',
    );
  } finally {
    registry.closeAll();
  }
});

t.test('dial handles error-before-abort, abort-before-error, post-OPEN abort, ' +
  'and replacement dial without evicting live replacement', async (t) => {
  const dialFailureMessage = 'ECONNREFUSED simulated dial error';
  const identifyPayload = {
    nodeId: TEST_LOCAL_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    bootIncarnation: TEST_BOOT_INCARNATION,
  };
  const createdSockets = [];
  const registry = createBulkTransferChannelRegistry({
    nodeId: TEST_LOCAL_NODE_ID,
    createWebSocket: () => {
      const mockSocket = createControllableMockWebSocket();
      createdSockets.push(mockSocket);
      return mockSocket;
    },
  });

  try {
    // 1. Error before abort:
    const trackedErrFirst = createTrackedAbortSignal();
    const errFirstPromise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: TEST_PEER_ADDRESS,
      identify: identifyPayload,
      signal: trackedErrFirst.signal,
    });
    const sock1 = createdSockets[0];
    sock1.emit(TRANSPORT_EVENT.ERROR, new Error(dialFailureMessage));
    trackedErrFirst.controller.abort();
    await t.rejects(
      errFirstPromise,
      {message: dialFailureMessage},
      'error before abort rejects with the socket error',
    );
    t.equal(
      trackedErrFirst.activeListenerCount(),
      0,
      'abort listener is cleaned up when dial fails with error first',
    );
    // Late error after failDial is absorbed without throwing:
    sock1.emit(TRANSPORT_EVENT.ERROR, new Error('late post-error socket event'));

    // 2. Abort before error:
    const trackedAbortFirst = createTrackedAbortSignal();
    const abortFirstPromise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: TEST_PEER_ADDRESS,
      identify: identifyPayload,
      signal: trackedAbortFirst.signal,
    });
    const sock2 = createdSockets[1];
    trackedAbortFirst.controller.abort();
    // Late socket error after abort is absorbed cleanly:
    sock2.emit(TRANSPORT_EVENT.ERROR, new Error(dialFailureMessage));
    await t.rejects(
      abortFirstPromise,
      {message: BULK_CHANNEL_SEND_OUTCOME.CANCELLED},
      'abort before error rejects with CANCELLED and absorbs late socket error',
    );
    t.equal(sock2.isTerminated(), true, 'aborted dial terminates socket');

    // 3. Post-OPEN abort in the same turn before attach completes:
    const postOpenController = new AbortController();
    const postOpenPromise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: TEST_PEER_ADDRESS,
      identify: identifyPayload,
      signal: postOpenController.signal,
    });
    const sock3 = createdSockets[2];
    sock3.emit(TRANSPORT_EVENT.OPEN);
    postOpenController.abort();
    await t.rejects(
      postOpenPromise,
      {message: BULK_CHANNEL_SEND_OUTCOME.CANCELLED},
      'post-OPEN abort before attach rejects with CANCELLED',
    );
    t.equal(sock3.isTerminated(), true, 'post-OPEN aborted socket is terminated');
    t.equal(sock3.sentFrames.length, 0, 'no IDENTIFY frame sent after post-OPEN abort');
    t.equal(
      registry.hasConnection(TEST_PEER_NODE_ID),
      false,
      'post-OPEN aborted socket is never attached to registry',
    );

    // 4. Replacement dial not evicted by stale socket late error + close events:
    const dial1Promise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: TEST_PEER_ADDRESS,
      identify: identifyPayload,
    });
    const staleDialSocket = createdSockets[3];
    staleDialSocket.emit(TRANSPORT_EVENT.OPEN);
    const conn1 = await dial1Promise;
    t.equal(registry.getConnection(TEST_PEER_NODE_ID), conn1, 'first dial attached');

    const dial2Promise = registry.dial({
      nodeId: TEST_PEER_NODE_ID,
      address: TEST_PEER_ADDRESS,
      identify: identifyPayload,
    });
    const replacementDialSocket = createdSockets[4];
    replacementDialSocket.emit(TRANSPORT_EVENT.OPEN);
    const conn2 = await dial2Promise;
    t.not(conn1, conn2, 'replacement dial created distinct connection');
    t.equal(staleDialSocket.isClosed(), true, 'stale dial socket was closed on attach');

    // Emit late error and close on staleDialSocket:
    staleDialSocket.emit(TRANSPORT_EVENT.ERROR, new Error('stale socket error'));
    staleDialSocket.emit(TRANSPORT_EVENT.CLOSE);
    t.equal(
      registry.getConnection(TEST_PEER_NODE_ID),
      conn2,
      'late error/close on stale dial socket does not evict replacement connection',
    );
    t.equal(conn2.isOpen(), true, 'replacement connection remains open');
  } finally {
    registry.closeAll();
  }
});

