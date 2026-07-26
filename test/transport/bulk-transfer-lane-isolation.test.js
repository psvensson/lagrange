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
