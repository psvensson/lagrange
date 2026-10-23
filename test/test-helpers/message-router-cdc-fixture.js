// Router/invocation owners are real. Clock delivery and held ws callbacks are
// component fixture physics; this fixture makes no kernel/compression claim.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket, {WebSocketServer} from 'ws';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createInProcWebSocketPair} from
  '../../src/transport/message-router-shared-vocabulary.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {beginCdcDeliveryInvocation} from '../../src/cdc/cdc-delivery-invocation.js';
import {ROUTER_MESSAGE_TYPE, TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {TEST_BOOT_INCARNATION} from './boot-incarnation-fixture.js';

const CDC_ROUTER_TEST = Object.freeze({
  LOCAL: 'cdc-transport-local', PEER: 'cdc-transport-peer',
  ADDRESS: 'cdc-transport-peer/message-group/transport-proof',
  BUDGET_MS: 1000, SHORT_MS: 40, START_MS: 1000,
});

// Reuse the production virtual-clock scheduler, but separately hold delivery
// of due callbacks. Every owner observes monotonic time even while a timer
// which is already due has not yet reached the event loop.
function delayedTimerClock() {
  const timers = new VirtualTimeSource({startMs: CDC_ROUTER_TEST.START_MS});
  let now = timers.now();
  return {
    now: () => now,
    setTimeout: (fn, ms, ...args) => timers.setTimeout(fn, now - timers.now() + ms, ...args),
    clearTimeout: (handle) => timers.clearTimeout(handle),
    setInterval: (fn, ms, ...args) => timers.setInterval(fn, ms, ...args),
    clearInterval: (handle) => timers.clearInterval(handle),
    elapse: (ms) => {
      now += ms;
    },
    dispatchDue: () => timers.advance(now - timers.now()),
    pendingTimerCount: () => timers.pendingTimerCount(),
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function watchSettlement(promise) {
  const observation = {settled: false, value: null, error: null};
  promise.then((value) => Object.assign(observation, {settled: true, value}),
    (error) => Object.assign(observation, {settled: true, error}));
  return observation;
}

async function cdcRouterFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: CDC_ROUTER_TEST.LOCAL}, logging: {level: 'error'},
    transport: {messageTimeoutMs: CDC_ROUTER_TEST.BUDGET_MS},
  });
  LoggingService.getInstance().initialize({level: 'error'});
  const clock = delayedTimerClock();
  const router = new MessageRouter({nodeId: CDC_ROUTER_TEST.LOCAL,
    bootIncarnation: TEST_BOOT_INCARNATION, timeSource: clock, nowFn: clock.now,
    outboundQueueMaxConcurrent: 1});
  const closes = [];
  const invocations = [];
  t.after(async () => {
    for (const invocation of invocations) invocation.finish();
    for (const close of closes.reverse()) await close();
    for (const invocation of invocations) await invocation.cleanup;
    await router.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  await router.initialize({startServer: false});
  const delivery = {owner: {timeSource: clock, logger: router.logger, isShutdown: false},
    activeCdcInvocation: null};
  return {router, clock, closes, delivery,
    invocation: (onClosed) => {
      const invocation = beginCdcDeliveryInvocation(delivery, () => true, onClosed);
      invocations.push(invocation);
      return invocation;
    }};
}

async function identifyPeer(f, peer, accepted) {
  // Observe the real identification reply as the existing service-delivery
  // fixture does; never manufacture a connection record or lifetime predicate.
  const replied = Promise.withResolvers();
  const listener = (data) => {
    if (JSON.parse(data.toString()).type === ROUTER_MESSAGE_TYPE.IDENTIFY) replied.resolve();
  };
  peer.on(TRANSPORT_EVENT.MESSAGE, listener);
  f.router.handleIncomingConnection(accepted, null);
  peer.send(JSON.stringify({type: ROUTER_MESSAGE_TYPE.IDENTIFY,
    nodeId: CDC_ROUTER_TEST.PEER, nodeAddress: 'ws://cdc-transport-peer:9999',
    bootIncarnation: TEST_BOOT_INCARNATION}));
  await replied.promise;
  peer.removeListener(TRANSPORT_EVENT.MESSAGE, listener);
  assert.equal(f.router.nodeConnections.get(CDC_ROUTER_TEST.PEER)?.ws, accepted,
    'actual IDENTIFY must adopt the socket before delivery');
  return f.router.nodeConnections.get(CDC_ROUTER_TEST.PEER);
}

function controlWrites(f, peer, accepted, {throwAfterSend = false} = {}) {
  const send = accepted.send.bind(accepted);
  const writes = [];
  const notifications = [];
  accepted.send = (bytes, options, callback) => {
    const frame = JSON.parse(bytes.toString());
    if (frame.type !== ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE) return send(bytes, options, callback);
    const handedOff = Promise.withResolvers();
    const write = {bytes, options, frame, handedOff: handedOff.promise, lowerClosed: false,
      lowerError: null, releases: 0,
      release(error = write.lowerError) {
        assert.equal(write.lowerClosed, true, 'the shim handoff must precede notification release');
        write.releases += 1;
        callback(error);
      }};
    writes.push(write);
    notifications.shift()?.(write);
    const result = send(bytes, options, (error) => {
      write.lowerError = error ?? null;
      write.lowerClosed = true;
      handedOff.resolve();
    });
    if (throwAfterSend) throw new Error('controlled ws throw after write acquisition');
    return result;
  };
  f.closes.push(async () => {
    await nextTurn();
    for (const write of writes) if (write.releases === 0) write.release();
    accepted.send = send;
    peer.terminate();
    await nextTurn();
  });
  return {peer, accepted, writes,
    nextWrite: (index = writes.length) => writes[index] ? Promise.resolve(writes[index]) :
      new Promise((resolve) => notifications.push(resolve)),
    ack: (messageId, result = {}) => peer.send(JSON.stringify({
      type: ROUTER_MESSAGE_TYPE.ACK, messageId, acknowledged: true, ...result,
    })),
    inbound: () => peer.send(JSON.stringify({type: ROUTER_MESSAGE_TYPE.PING,
      pingId: 'live-peer', timestamp: f.clock.now()})),
  };
}

async function controlledCdcPeer(f, options) {
  const {a: peer, b: accepted} = createInProcWebSocketPair();
  f.closes.push(async () => {
    peer.terminate();
    await nextTurn();
  });
  await identifyPeer(f, peer, accepted);
  return controlWrites(f, peer, accepted, options);
}

async function realCdcPeer(f) {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0});
  f.closes.push(() => new Promise((resolve, reject) => server.close((error) =>
    error ? reject(error) : resolve())));
  await once(server, 'listening');
  const incoming = once(server, 'connection');
  const peer = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  f.closes.push(async () => {
    if (peer.readyState === WebSocket.CLOSED) return;
    const closed = once(peer, TRANSPORT_EVENT.CLOSE);
    peer.terminate();
    await closed;
  });
  await once(peer, TRANSPORT_EVENT.OPEN);
  const [accepted] = await incoming;
  await identifyPeer(f, peer, accepted);
  return peer;
}

export {CDC_ROUTER_TEST, cdcRouterFixture, controlledCdcPeer, delayedTimerClock,
  nextTurn, realCdcPeer, watchSettlement};
