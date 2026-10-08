import net from 'node:net';
import {once} from 'node:events';
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {createBulkTransferChannelRegistry, createByteRateTokenBucket} from '../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from '../../src/transport/message-router-shared-vocabulary.js';
import {getTestPort} from '../../src/test-helpers/port-allocator.js';

function createRouter() {
  const router = new MessageRouter({nodeId: 'shutdown-lifetime', connectTimeoutMs: 5000});
  router.logger = {info() {}, debug() {}, warn() {}, error() {}};
  return router;
}

function createInProcessRouter(nodeId) {
  const router = new MessageRouter({nodeId, inProcess: true, wsPort: getTestPort(import.meta.url)});
  router.logger = {info() {}, debug() {}, warn() {}, error() {}};
  return router;
}

function createObservedBulkRegistry() {
  const pairs = [];
  const registry = createBulkTransferChannelRegistry({
    createWebSocket() {
      const pair = createInProcWebSocketPair();
      pairs.push(pair);
      return pair.a;
    },
  });
  return {registry, pairs};
}

const BULK_DIAL = {
  nodeId: 'bulk-epoch-peer', address: 'ws://127.0.0.1:9000',
  identify: {nodeId: 'bulk-epoch-local', nodeAddress: 'ws://127.0.0.1:9001'},
};

test('attached bulk registry identity cannot strand a paced send at retirement', async (t) => {
  const router = createRouter();
  const tokenBucket = createByteRateTokenBucket({bytesPerSecond: 0, capacityBytes: 1});
  const registry = createBulkTransferChannelRegistry({tokenBucket});
  const replacement = createBulkTransferChannelRegistry();
  const otherRouter = createRouter();
  const {a, b} = createInProcWebSocketPair();
  router.attachBulkChannelRegistry(registry);
  const connection = registry.adoptIncomingSocket({nodeId: 'paced-peer', ws: a});
  await tokenBucket.acquire(1);
  const send = connection.sendChunkFrame(Buffer.from([1]));
  await Promise.resolve();
  t.equal(tokenBucket.pendingCount(), 1, 'real sender is waiting for the byte-rate owner');
  try {
    t.doesNotThrow(() => router.attachBulkChannelRegistry(registry), 'same registry binding is idempotent');
    t.throws(() => router.attachBulkChannelRegistry(replacement), /replace.*bulk registry/i,
      'replacement cannot orphan an attached participant');
    t.throws(() => router.attachBulkChannelRegistry(null), /replace.*bulk registry/i,
      'detachment cannot evade lifetime retirement');
    t.doesNotThrow(() => otherRouter.attachBulkChannelRegistry(replacement),
      'refused replacement has not partially bound the proposed registry');
    await router.shutdown();
    await otherRouter.shutdown();
    t.equal(tokenBucket.pendingCount(), 0, 'shutdown retires the original bucket waiter');
    t.equal(connection.isOpen(), false, 'shutdown also retires the original socket');
  } finally {
    registry.closeAll();
    replacement.closeAll();
    b.terminate();
    await router.shutdown();
  }
  t.same(await send, {outcome: 'cancelled'}, 'paced send settles through the bucket owner');
});

test('direct admitted remote delivery preserves graceful shutdown and late admission refusal', async (t) => {
  const local = createInProcessRouter('direct-epoch-local');
  const peer = createInProcessRouter('direct-epoch-peer');
  const entered = Promise.withResolvers();
  const handler = Promise.withResolvers();
  await local.initialize({startServer: true});
  await peer.initialize({startServer: true});
  const address = `${peer.nodeId}/service/held`;
  peer.register(address, () => {
    entered.resolve();
    return handler.promise;
  });
  await local.connectToNode(peer.nodeId, peer.buildSelfConnectionAddress());
  const delivery = local.deliverRemote(address, 'direct-id', {}, peer.nodeId, 'direct-correlation')
    .catch((error) => ({rejected: error.message}));
  try {
    await entered.promise;
    await local.shutdown();
    t.match(await delivery, {result: {
      messageId: 'direct-id', correlationId: 'direct-correlation',
      acknowledged: false, error: ROUTER_ERROR_MSG.SHUTDOWN, shutdown: true,
    }}, 'already admitted remote call retains the graceful outcome');
    await t.rejects(local.deliverRemote(address, 'late-id', {}, peer.nodeId, 'late-correlation'),
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'late direct call has no admission');
  } finally {
    handler.resolve({value: 'old'});
    await local.shutdown();
    await peer.shutdown();
  }
});

for (const firstAbort of ['router', 'caller']) {
  test(`implicit initialization is inside admitted delivery (${firstAbort} aborts first)`, async (t) => {
    const router = createRouter();
    const caller = new AbortController();
    const reason = new Error('initializing caller cancelled');
    const delivery = router.deliver(`${router.nodeId}/service/initializing`, {
      messageId: 'initializing-message', correlationId: 'initializing-correlation',
    }, {signal: caller.signal}).then((result) => ({result}), (error) => ({error}));
    if (firstAbort === 'caller') caller.abort(reason);
    await router.shutdown();
    caller.abort(reason);
    const outcome = await delivery;
    if (firstAbort === 'caller') {
      t.equal(outcome.error, reason, 'first caller cancellation retains exact reason');
    } else {
      t.match(outcome, {result: {
        messageId: 'initializing-message', correlationId: 'initializing-correlation',
        acknowledged: false, shutdown: true, error: ROUTER_ERROR_MSG.SHUTDOWN,
      }}, 'retirement settles even while implicit initialize is pending');
    }
    t.equal(router.initialized, false, 'retired initialization cannot publish success');
    t.equal(router.outboundQueues.size, 0, 'initializing call cannot allocate a retired queue');
  });
}

test('direct local handler completion cannot escape its retired lifetime', async (t) => {
  const router = createRouter();
  const gate = Promise.withResolvers();
  const address = `${router.nodeId}/service/direct-local`;
  router.register(address, () => gate.promise);
  const delivery = router.deliverLocal(address, 'local-id', {}, 'local-correlation');
  let result = null;
  delivery.then((outcome) => {
    result = outcome;
  });
  await router.shutdown();
  await router.initialize();
  router.register(address, () => ({value: 'fresh'}));
  try {
    t.match(result, {result: {acknowledged: false, shutdown: true}},
      'retirement settles before the old handler finishes');
    gate.resolve({value: 'old'});
    t.match(await delivery, {result: {acknowledged: false, shutdown: true}},
      'old handler cannot publish an acknowledged result after restart');
    t.match(await router.deliverLocal(address, 'fresh-id', {}, 'fresh-correlation'),
      {result: {acknowledged: true, value: 'fresh'}}, 'fresh direct local call remains usable');
  } finally {
    gate.resolve({value: 'old'});
    await router.shutdown();
  }
});

for (const bound of [false, true]) {
  test(`bulk caller cancellation remains distinct (${bound ? 'bound' : 'standalone'})`, async (t) => {
    const router = createRouter();
    const {registry, pairs} = createObservedBulkRegistry();
    if (bound) router.attachBulkChannelRegistry(registry);
    const controller = new AbortController();
    const pending = registry.dial({...BULK_DIAL, signal: controller.signal});
    const refused = t.rejects(pending, {message: 'cancelled'}, 'pending dial keeps caller-cancel classification');
    controller.abort(new Error('caller reason'));
    await refused;
    t.equal(registry.hasConnection(BULK_DIAL.nodeId), false, 'cancelled dial never attaches');
    const activeCaller = new AbortController();
    const active = await registry.dial({...BULK_DIAL, signal: activeCaller.signal});
    activeCaller.abort();
    await Promise.resolve();
    t.equal(active.isOpen(), false, 'caller cancellation after OPEN still closes its connection');
    t.equal(router.isShuttingDown, false, 'bulk caller cannot retire router lifetime');
    registry.closeAll();
    for (const pair of pairs) pair.b.terminate();
    await router.shutdown();
  });
}

test('bound bulk old OPEN cannot attach after explicit router rebind', async (t) => {
  const router = createRouter();
  const {registry, pairs} = createObservedBulkRegistry();
  router.attachBulkChannelRegistry(registry);
  await router.initialize();
  const oldDial = registry.dial(BULK_DIAL);
  const refused = t.rejects(oldDial, {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'old dial retires');
  const oldWs = pairs[0].a;
  await router.shutdown();
  await refused;
  await router.initialize();
  const fresh = await registry.dial(BULK_DIAL);
  try {
    oldWs.emit('open');
    oldWs.emit('close');
    await Promise.resolve();
    t.equal(registry.getConnection(BULK_DIAL.nodeId), fresh, 'old socket cannot replace or evict fresh bulk channel');
    t.ok(fresh.isOpen(), 'fresh bulk channel remains open');
  } finally {
    await router.shutdown();
    for (const pair of pairs) pair.b.terminate();
  }
});

test('retired real socket frames cannot settle a fresh same-ID waiter', async (t) => {
  const local = createInProcessRouter('epoch-local');
  const peer = createInProcessRouter('epoch-peer');
  await local.initialize({startServer: true});
  await peer.initialize({startServer: true});
  try {
    await local.connectToNode(peer.nodeId, peer.buildSelfConnectionAddress());
    const oldWs = local.nodeConnections.get(peer.nodeId).ws;
    local.nodeInboundActivityAt.set('old-only', Date.now());
    local.nodeBootIncarnationWatermarks.set(peer.nodeId, 7);
    await local.shutdown();
    await local.initialize({startServer: true});
    await local.connectToNode(peer.nodeId, peer.buildSelfConnectionAddress());
    const freshConnection = local.nodeConnections.get(peer.nodeId);
    const pending = local.registerPendingResponse('reused-id', peer.nodeId);
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    oldWs.emit('message', Buffer.from(JSON.stringify({
      type: 'SERVICE_RESPONSE', messageId: 'reused-id', result: {from: 'old'},
    })));
    oldWs.emit('open');
    oldWs.emit('close');
    await Promise.resolve();
    t.equal(settled, false, 'stale socket cannot settle a fresh waiter with the same ID');
    t.equal(local.nodeConnections.get(peer.nodeId), freshConnection, 'stale open/close preserves fresh slot');
    t.equal(local.nodeInboundActivityAt.has('old-only'), false, 'old causal liveness is retired');
    t.equal(local.nodeBootIncarnationWatermarks.get(peer.nodeId), 7, 'zombie incarnation fence persists');
    local.handleServiceResponse({messageId: 'reused-id', result: {from: 'fresh'}});
    t.same(await pending, {from: 'fresh'}, 'fresh response still settles through the canonical owner');
  } finally {
    await local.shutdown();
    await peer.shutdown();
  }
});

test('old real reconnect completion cannot delete fresh same-peer pending work', async (t) => {
  const local = createInProcessRouter('reconnect-local');
  const peer = createInProcessRouter('reconnect-peer');
  await local.initialize({startServer: true});
  await peer.initialize({startServer: true});
  const realConnect = local.connectToNode.bind(local);
  const oldGate = Promise.withResolvers();
  const oldEntered = Promise.withResolvers();
  local.connectToNode = async (...args) => {
    await realConnect(...args);
    oldEntered.resolve();
    await oldGate.promise;
  };
  const oldWork = local.ensureNodeConnection(peer.nodeId, peer.buildSelfConnectionAddress());
  const oldOutcome = oldWork.catch((error) => error.message);
  await oldEntered.promise;
  await local.shutdown();
  local.connectToNode = realConnect;
  await local.initialize({startServer: true});
  const freshGate = Promise.withResolvers();
  const freshEntered = Promise.withResolvers();
  local.connectToNode = async (...args) => {
    await realConnect(...args);
    freshEntered.resolve();
    await freshGate.promise;
  };
  const freshWork = local.ensureNodeConnection(peer.nodeId, peer.buildSelfConnectionAddress());
  await freshEntered.promise;
  const freshPending = local.pendingNodeConnections.get(peer.nodeId);
  try {
    oldGate.resolve();
    t.equal(await oldOutcome, ROUTER_ERROR_MSG.SHUTDOWN, 'old continuation observes its captured retirement');
    t.equal(local.pendingNodeConnections.get(peer.nodeId), freshPending,
      'old finally cannot delete a fresh same-peer connection promise');
    freshGate.resolve();
    t.equal((await freshWork).nodeId, peer.nodeId, 'fresh connection completes normally');
  } finally {
    oldGate.resolve();
    freshGate.resolve();
    await Promise.allSettled([oldWork, freshWork]);
    await local.shutdown();
    await peer.shutdown();
  }
});

test('late delivery refuses without implicitly restarting a retired router', async (t) => {
  const router = createRouter();
  await router.initialize();
  await router.shutdown();
  try {
    await t.rejects(router.deliver('invalid-address', {}),
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'shutdown is the admission refusal');
    t.equal(router.initialized, false, 'delivery cannot initialize a retired lifetime');
    t.equal(router.isShuttingDown, true, 'retirement remains closed');
    t.equal(router.nodeConnections.size, 0, 'no connection created');
    t.equal(router.outboundQueues.size, 0, 'no queue created');
    t.throws(() => router.register(`${router.nodeId}/service/late`, () => ({})),
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'late handler registration refuses');
    await t.rejects(router.connectToNode('late-peer', 'ws://127.0.0.1:1'),
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'direct late dial refuses before allocation');
    await t.rejects(router.pingNode('late-peer'),
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'late ping refuses before timer allocation');
    t.equal(router.pendingPings.size, 0, 'late ping leaves no timer ledger');
  } finally {
    await router.shutdown();
  }
});

test('caller cancellation stays distinct from graceful router retirement', async (t) => {
  const router = createRouter();
  await router.initialize();
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const controller = new AbortController();
  const reason = new Error('caller cancelled its request');
  const address = `${router.nodeId}/service/caller-cancel`;
  router.register(address, () => {
    entered.resolve();
    return gate.promise;
  });
  const delivery = router.deliver(address, {}, {signal: controller.signal});
  await entered.promise;
  const rejection = t.rejects(delivery, reason, 'caller cancellation preserves its error');
  controller.abort(reason);
  await rejection;
  t.equal(router.isShuttingDown, false, 'caller cancellation does not retire the router');
  gate.resolve({ok: true});
  await router.shutdown();
});

test('old queue completion cannot dispatch a fresh lifetime queue', async (t) => {
  const router = createRouter();
  await router.initialize();
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const old = router.enqueueOutbound('same-peer', () => {
    entered.resolve();
    return gate.promise;
  });
  await entered.promise;
  await router.shutdown();
  await router.initialize();
  const freshQueue = router.getOutboundQueue('same-peer');
  const processQueue = router.outboundDeliveryRegistryOwner.process;
  let staleReDrives = 0;
  router.outboundDeliveryRegistryOwner.process = function(...args) {
    staleReDrives += 1;
    return processQueue.apply(this, args);
  };
  gate.resolve({acknowledged: true});
  await old;
  t.equal(staleReDrives, 0, 'old finalizer cannot ask the queue owner to process a fresh queue');
  t.equal(router.outboundQueues.get('same-peer'), freshQueue, 'fresh queue identity remains');
  t.equal(freshQueue.inFlight, 0, 'old accounting cannot decrement fresh accounting');
  await router.shutdown();
});

test('explicit initialization starts a fresh lifetime but concurrent initialization cannot outlive shutdown', async (t) => {
  const router = new MessageRouter({
    nodeId: 'lifetime-start-race',
    wsPort: getTestPort(import.meta.url),
    inProcess: true,
  });
  router.logger = {info() {}, debug() {}, warn() {}, error() {}};
  let initializedEvents = 0;
  router.on('initialized', () => {
    initializedEvents += 1;
  });
  const first = router.initialize({startServer: true});
  const second = router.initialize({startServer: true});
  const firstOutcome = first.catch((error) => error.message);
  const secondOutcome = second.catch((error) => error.message);
  const shutdown = router.shutdown();
  t.equal(router.shutdown(), shutdown, 'repeated shutdown shares one completion');
  await t.rejects(router.initialize(), {message: ROUTER_ERROR_MSG.SHUTDOWN},
    'initialize during shutdown refuses');
  await shutdown;
  t.equal(await firstOutcome, ROUTER_ERROR_MSG.SHUTDOWN, 'first initialization retires');
  t.equal(await secondOutcome, ROUTER_ERROR_MSG.SHUTDOWN, 'queued initialization retires');
  t.equal(initializedEvents, 0, 'old initialization never publishes success');
  t.equal(router.server, null, 'no old server survives');
  try {
    await Promise.all([
      router.initialize({startServer: true}), router.initialize({startServer: true}),
    ]);
    t.equal(initializedEvents, 1, 'fresh concurrent initialization publishes once');
    t.ok(router.hasSelfConnection(), 'fresh lifetime has its real loopback connection');
  } finally {
    await router.shutdown();
  }
});

test('shutdown cancels local delivery while a completed old handler cannot affect restart', async (t) => {
  const router = createRouter();
  await router.initialize();
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const address = `${router.nodeId}/service/local-lifetime`;
  router.register(address, () => {
    entered.resolve();
    return gate.promise;
  });
  const delivery = router.deliver(address, {});
  await entered.promise;
  await router.shutdown();
  t.match(await delivery, {acknowledged: false, error: ROUTER_ERROR_MSG.SHUTDOWN},
    'admitted delivery retains the graceful shutdown outcome');
  await router.initialize();
  router.register(address, () => ({value: 'fresh'}));
  try {
    gate.resolve({value: 'old'});
    t.equal((await router.deliver(address, {})).value, 'fresh', 'new delivery uses fresh handler');
    t.equal(router.pendingResponses.size, 0, 'old result creates no waiter');
  } finally {
    await router.shutdown();
  }
});

test('an inbound handler microtask does not run after its lifetime retires', async (t) => {
  const router = createRouter();
  await router.initialize();
  const {a, b} = createInProcWebSocketPair();
  const address = `${router.nodeId}/service/inbound-lifetime`;
  let invocations = 0;
  router.register(address, () => {
    invocations += 1;
  });
  router.handleServiceMessage(a, {targetAddress: address, messageId: 'queued-inbound', payload: {}});
  await router.shutdown();
  t.equal(invocations, 0, 'ACK-before-handler is not permission to invoke after shutdown');
  a.terminate();
  b.terminate();
});

test('shutdown terminates accepted non-upgrading TCP before awaiting server closure', async (t) => {
  const router = new MessageRouter({
    nodeId: 'raw-tcp-retirement', wsPort: getTestPort(import.meta.url), wsHost: '127.0.0.1',
  });
  router.logger = {info() {}, debug() {}, warn() {}, error() {}};
  await router.initialize({startServer: true});
  const wsServer = router.server;
  const httpServer = wsServer._server;
  const accepted = once(httpServer, 'connection');
  const client = net.connect(router.wsPort, '127.0.0.1');
  const [peer] = await accepted;
  const closing = Promise.withResolvers();
  let terminatedHttpConnections = false;
  const closeAll = httpServer.closeAllConnections;
  httpServer.closeAllConnections = function(...args) {
    terminatedHttpConnections = true;
    return closeAll.apply(this, args);
  };
  const close = wsServer.close;
  wsServer.close = function(...args) {
    closing.resolve();
    return close.apply(this, args);
  };
  const stopped = router.shutdown();
  try {
    await t.rejects(router.pingNode(router.nodeId), {message: ROUTER_ERROR_MSG.SHUTDOWN},
      'ping during socket retirement refuses');
    t.equal(router.pendingPings.size, 0, 'no ping enters the drained ledger');
    await closing.promise;
    t.equal(terminatedHttpConnections, true,
      'real HTTP sockets are terminated before waiting for the server close callback');
    if (terminatedHttpConnections) await stopped;
  } finally {
    client.destroy();
    peer.destroy();
    await stopped;
  }
});

test('router retirement settles a real pending dial in its attached bulk lane', async (t) => {
  const router = createRouter();
  const registry = createBulkTransferChannelRegistry();
  router.attachBulkChannelRegistry(registry);
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const accepted = once(server, 'connection');
  let outcome = null;
  const pending = registry.dial({
    nodeId: 'bulk-peer',
    address: `ws://127.0.0.1:${server.address().port}`,
    identify: {nodeId: router.nodeId, nodeAddress: router.nodeAddress},
  }).then(
    () => {
      outcome = {connected: true};
    },
    (error) => {
      outcome = {error};
    },
  );
  const [peer] = await accepted;
  try {
    t.equal(outcome, null, 'bulk socket is genuinely connecting');
    await router.shutdown();
    t.same(outcome && {message: outcome.error?.message},
      {message: ROUTER_ERROR_MSG.SHUTDOWN}, 'bulk dial retires with its router');
    t.equal(registry.hasConnection('bulk-peer'), false, 'no post-retirement adoption');
  } finally {
    peer.destroy();
    await pending;
    await router.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('shutdown owns a real connecting WebSocket before the peer upgrades', async (t) => {
  const router = createRouter();
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const accepted = once(server, 'connection');
  const address = `ws://127.0.0.1:${server.address().port}`;
  let outcome = null;
  const pending = router.connectToNode('pending-peer', address).then(
    () => {
      outcome = {connected: true};
    },
    (error) => {
      outcome = {error};
    },
  );
  const [peer] = await accepted;
  try {
    t.equal(outcome, null, 'real TCP connection is waiting for WebSocket upgrade');
    await router.shutdown();
    t.same(outcome && {message: outcome.error?.message},
      {message: ROUTER_ERROR_MSG.SHUTDOWN},
      'shutdown settles its pending dial before returning');
    t.equal(router.nodeConnections.size, 0, 'retired dial cannot retain a peer slot');
    t.equal(router.pendingNodeConnections.size, 0, 'no pending connection remains');
  } finally {
    peer.destroy();
    await pending;
    await router.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }
});
