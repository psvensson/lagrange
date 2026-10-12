import {EventEmitter} from 'node:events';
import WebSocket, {WebSocketServer} from 'ws';

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
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

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
const EXPECTED_INPROC_SEND_ERROR_CODE = Object.freeze({
  CLOSED: 'inproc_websocket_closed',
  DELIVERY_FAILED: 'inproc_websocket_delivery_failed',
});
const ports = createPortAllocator(import.meta.url);

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

class CallbackControlledSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.callbacks = [];
    this.closed = false;
  }

  send(data, callback) {
    this.sent.push(data);
    this.callbacks.push(callback);
  }

  settleNext(error) {
    this.callbacks.shift()(error);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.emit(TRANSPORT_EVENT.CLOSE));
  }
}

function createObservedAbortSignal() {
  const listeners = new Set();
  const signal = {
    aborted: false,
    addEventListener(event, listener) {
      if (event === 'abort') listeners.add(listener);
    },
    removeEventListener(event, listener) {
      if (event === 'abort') listeners.delete(listener);
    },
  };
  return {
    signal,
    abort() {
      signal.aborted = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    listenerCount: () => listeners.size,
  };
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
  t.equal(router.getStats().bulkChannel.retainedSendBytes, 0,
    'the unattached bulk owner reports typed zero retained custody');
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
    t.equal(stats.bulkChannel.inFlightBytes, 0,
      'a token-waiting chunk is not mislabeled as a physical write');
    t.equal(stats.bulkChannel.retainedSendBytes,
      TEST_MAX_PENDING_SENDS * TEST_CHUNK_FRAME_BYTES,
      'all token-waiting frame bytes remain visible as retained custody');
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

t.test('accepted bulk frames retain bounded custody through callback unwind',
  async (t) => {
    const ws = new CallbackControlledSocket();
    const registry = createBulkTransferChannelRegistry({maxPendingSends: 2});
    const connection = registry.adoptIncomingSocket({
      nodeId: TEST_PEER_NODE_ID,
      ws,
    });
    const control = {kind: 'ACK', transferId: 'custody-1'};
    const controlBytes = Buffer.byteLength(JSON.stringify(control));
    const chunk = Buffer.alloc(7);
    try {
      const controlSend = connection.sendControl(control);
      const chunkSend = connection.sendChunkFrame(chunk);
      await Promise.resolve();
      t.same(connection.getStats(), {
        nodeId: TEST_PEER_NODE_ID,
        open: true,
        pendingSends: 2,
        retainedSendBytes: controlBytes + chunk.length,
        inFlightBytes: controlBytes,
        maxPendingSends: 2,
      }, 'both accepted frames remain charged while the first callback waits');
      t.equal(ws.sent.length, 1, 'the physical writer stays single-flight');
      const refused = await connection.sendControl({kind: 'COMPLETE'});
      t.equal(refused.outcome, BULK_CHANNEL_SEND_OUTCOME.PENDING_LIMIT,
        'a third frame is refused before it becomes accepted debt');

      ws.settleNext();
      t.equal(connection.getStats().retainedSendBytes,
        controlBytes + chunk.length,
        'callback entry alone does not release either retained frame');
      t.equal((await controlSend).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT);
      await Promise.resolve();
      t.equal(ws.sent.length, 2, 'the chunk starts after control completion');
      ws.settleNext();
      t.equal(connection.getStats().retainedSendBytes, chunk.length,
        'the callback frame remains charged until its continuation runs');
      t.equal((await chunkSend).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT);
      t.equal(connection.getStats().retainedSendBytes, 0,
        'the last continuation returns all accepted frame custody');

      const circular = {};
      circular.self = circular;
      await t.rejects(connection.sendControl(circular), TypeError,
        'control serialization failure rejects before socket custody');
      t.equal(connection.getStats().pendingSends, 0,
        'serialization failure returns its reserved pending slot');

      const queuedSocket = new CallbackControlledSocket();
      const queuedConnection = registry.adoptIncomingSocket({
        nodeId: 'queued-peer',
        ws: queuedSocket,
      });
      const firstQueued = queuedConnection.sendControl({kind: 'FIRST'});
      const secondQueued = queuedConnection.sendControl({kind: 'SECOND'});
      await Promise.resolve();
      queuedConnection.close();
      queuedSocket.settleNext();
      t.equal((await firstQueued).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT,
        'an already-written frame keeps its physical completion outcome');
      t.equal((await secondQueued).outcome, BULK_CHANNEL_SEND_OUTCOME.CLOSED,
        'a queued frame revalidates socket state before physical write');
      t.equal(queuedSocket.sent.length, 1,
        'the closed queued frame never enters socket custody');

      const cancelledSocket = new CallbackControlledSocket();
      const cancelledConnection = registry.adoptIncomingSocket({
        nodeId: 'cancelled-peer',
        ws: cancelledSocket,
      });
      const blockingControl = cancelledConnection.sendControl({kind: 'BLOCK'});
      const queuedAbort = new AbortController();
      const cancelledChunk = cancelledConnection.sendChunkFrame(
        Buffer.alloc(7), {signal: queuedAbort.signal});
      await Promise.resolve();
      queuedAbort.abort();
      cancelledSocket.settleNext();
      await blockingControl;
      t.equal((await cancelledChunk).outcome,
        BULK_CHANNEL_SEND_OUTCOME.CANCELLED,
        'a token-granted queued chunk revalidates cancellation before write');
      t.equal(cancelledSocket.sent.length, 1,
        'the cancelled queued chunk never enters socket custody');

      const lateSocket = new CallbackControlledSocket();
      const lateConnection = registry.adoptIncomingSocket({
        nodeId: 'late-peer',
        ws: lateSocket,
      });
      const lateSend = lateConnection.sendControl({kind: 'LATE'});
      await Promise.resolve();
      lateConnection.close();
      await flushDeliveries();
      t.equal(registry.hasConnection('late-peer'), false,
        'the closed endpoint leaves active routing before callback settlement');
      t.ok(registry.getStats().retainedSendBytes > 0,
        'retired diagnostics keep custody before a late send callback');
      lateSocket.settleNext();
      t.equal(lateConnection.getStats().retainedSendBytes > 0, true,
        'late callback entry remains charged until its continuation');
      t.equal((await lateSend).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT,
        'native success remains distinct from the concurrent socket close');
      t.equal(lateConnection.getStats().retainedSendBytes, 0,
        'late callback unwind releases the final retained frame');

      const failedSocket = new CallbackControlledSocket();
      const failedConnection = registry.adoptIncomingSocket({
        nodeId: 'failed-peer',
        ws: failedSocket,
      });
      const failedSend = failedConnection.sendControl({kind: 'FAILED'});
      await Promise.resolve();
      failedSocket.settleNext(new Error('native write failed'));
      t.ok(failedConnection.getStats().retainedSendBytes > 0,
        'a failing callback keeps custody through its executing stack');
      t.equal((await failedSend).outcome, BULK_CHANNEL_SEND_OUTCOME.CLOSED);
      t.equal(failedConnection.getStats().retainedSendBytes, 0,
        'the failed-write continuation returns its retained frame');
      t.equal(failedConnection.isOpen(), false,
        'a physical write failure closes the connection owner');
      await flushDeliveries();
      t.equal(registry.getStats().retainedSendBytes, 0,
        'registry diagnostics return to zero after close and callback unwind');
    } finally {
      registry.closeAll();
    }
  });

t.test('paced chunk cancellation does not block control or another peer',
  async (t) => {
    const bucket = await createDrainedBucket();
    const registry = createBulkTransferChannelRegistry({
      tokenBucket: bucket,
      maxPendingSends: 2,
    });
    const blockedSocket = new CallbackControlledSocket();
    const liveSocket = new CallbackControlledSocket();
    const blocked = registry.adoptIncomingSocket({
      nodeId: 'blocked-peer',
      ws: blockedSocket,
    });
    const live = registry.adoptIncomingSocket({
      nodeId: 'live-peer',
      ws: liveSocket,
    });
    const abortController = new AbortController();
    try {
      const chunkSend = blocked.sendChunkFrame(Buffer.alloc(8), {
        signal: abortController.signal,
      });
      await Promise.resolve();
      const abortSend = blocked.sendControl({kind: 'ABORT'});
      const peerSend = live.sendControl({kind: 'ACK'});
      await Promise.resolve();
      t.equal(blockedSocket.sent.length, 1,
        'terminal control overtakes only the token-waiting chunk');
      t.equal(liveSocket.sent.length, 1,
        'the shared token bucket does not pace another peer control');
      blockedSocket.settleNext();
      liveSocket.settleNext();
      t.equal((await abortSend).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT);
      t.equal((await peerSend).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT);
      abortController.abort();
      t.equal((await chunkSend).outcome, BULK_CHANNEL_SEND_OUTCOME.CANCELLED,
        'cancellation removes the paced frame without a socket write');
      t.equal(bucket.pendingCount(), 0,
        'normal and aborted grants leave no bucket listener/waiter roots');

      const closeBlocked = blocked.sendChunkFrame(Buffer.alloc(8));
      await Promise.resolve();
      blocked.close();
      await flushDeliveries();
      t.equal((await closeBlocked).outcome, BULK_CHANNEL_SEND_OUTCOME.CLOSED,
        'connection close releases its own paced wait with a closed outcome');
      const afterClose = live.sendControl({kind: 'COMPLETE'});
      await Promise.resolve();
      liveSocket.settleNext();
      t.equal((await afterClose).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT,
        'closing one connection does not dispose the shared peer bucket');

      let now = 0;
      const cleanupBucket = createByteRateTokenBucket({
        bytesPerSecond: 1,
        capacityBytes: 1,
        now: () => now,
      });
      await cleanupBucket.acquire(1);
      const firstSignal = createObservedAbortSignal();
      const grantedSignal = createObservedAbortSignal();
      const removed = cleanupBucket.acquire(1, {signal: firstSignal.signal});
      const granted = cleanupBucket.acquire(1, {signal: grantedSignal.signal});
      now = 1000;
      firstSignal.abort();
      t.equal((await removed).acquired, false,
        'the aborted head waiter is removed from the bucket');
      t.equal((await granted).acquired, true,
        'the next waiter consumes the newly available byte');
      t.equal(grantedSignal.listenerCount(), 0,
        'a normal grant removes its abort-listener retention root');
      cleanupBucket.dispose();
    } finally {
      registry.closeAll();
    }
  });

t.test('in-process send settles once after delivery unwind and typed failures',
  async (t) => {
    const delivered = [];
    const first = createInProcWebSocketPair();
    let insideDelivery = false;
    let callbackCount = 0;
    first.b.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      insideDelivery = true;
      delivered.push(data);
      insideDelivery = false;
    });
    await new Promise((resolve, reject) => first.a.send('first', (error) => {
      callbackCount += 1;
      t.equal(insideDelivery, false,
        'completion runs only after the peer listener stack unwinds');
      if (error) return reject(error);
      first.a.send('second', (secondError) => {
        callbackCount += 1;
        if (secondError) return reject(secondError);
        resolve();
      });
    }));
    t.same(delivered, ['first', 'second'],
      'callback reentry queues the successor after the first delivery');
    t.equal(callbackCount, 2, 'each accepted send settles exactly once');

    const closing = createInProcWebSocketPair();
    const closed = new Promise((resolve) => closing.a.send('late', resolve));
    closing.b.close();
    const closeError = await closed;
    t.equal(closeError.code, EXPECTED_INPROC_SEND_ERROR_CODE.CLOSED,
      'close before the queued delivery has a typed callback failure');

    const throwing = createInProcWebSocketPair();
    throwing.b.on(TRANSPORT_EVENT.MESSAGE, () => {
      throw new Error('consumer failed');
    });
    const deliveryError = await new Promise((resolve) =>
      throwing.a.send('throw', resolve));
    t.equal(deliveryError.code,
      EXPECTED_INPROC_SEND_ERROR_CODE.DELIVERY_FAILED,
      'a consumer throw settles the sender with a typed delivery failure');
  });

t.test('real ws send custody ends at the installed socket write callback',
  async (t) => {
    const port = ports.getPort();
    const server = new WebSocketServer({host: '127.0.0.1', port});
    const registry = createBulkTransferChannelRegistry();
    let client;
    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once(TRANSPORT_EVENT.ERROR, reject);
      });
      const accepted = new Promise((resolve) =>
        server.once('connection', (ws) => resolve(
          registry.adoptIncomingSocket({nodeId: 'native-peer', ws}))));
      client = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        client.once(TRANSPORT_EVENT.OPEN, resolve);
        client.once(TRANSPORT_EVENT.ERROR, reject);
      });
      const connection = await accepted;
      const received = new Promise((resolve) =>
        client.once(TRANSPORT_EVENT.MESSAGE, resolve));
      const send = connection.sendControl({kind: 'NATIVE_CALLBACK'});
      t.ok(connection.getStats().retainedSendBytes > 0,
        'the encoded frame is charged before the real ws write starts');
      t.equal((await send).outcome, BULK_CHANNEL_SEND_OUTCOME.SENT,
        'the real ws socket write callback settles the send');
      t.match((await received).toString(), /NATIVE_CALLBACK/u,
        'peer delivery remains a separate observed protocol fact');
      t.equal(connection.getStats().retainedSendBytes, 0,
        'the callback continuation releases real ws frame custody');
    } finally {
      registry.closeAll();
      client?.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  });
