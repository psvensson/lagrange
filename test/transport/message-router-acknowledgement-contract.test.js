/**
 * The acknowledgement contract of one delivery (R02, R07, R08).
 *
 * A delivery has two waits: the wait for the target router's ACK and, after
 * it, the wait for the handler's answer. Every transport outcome names the
 * acknowledgement state this router recorded, a spent lifetime is one of three
 * named reasons (ack_timeout, answer_timeout, unestablished_timeout), and
 * `ackTimeoutMs` bounds only the ACK wait while `timeoutMs` stays the whole
 * lifetime.
 *
 * Deterministic: the router runs on a VirtualTimeSource and the peer is a
 * frame-collecting socket whose ACK and SERVICE_RESPONSE frames the test
 * injects through the router's own inbound dispatch.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ConnectionState,
  MessageRouter,
  RouterMessageType,
} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT as ACK,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
  buildDeliveryEnvelope,
  buildTransportDeliveryOutcome,
  classifyThrownDeliveryError,
} from '../../src/transport/transport-semantic-outcome.js';
import {buildDirectDeliveryError, resolveTransportDeliveryOptions} from
  '../../src/message-group/message-group-service-runtime-support.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const LOCAL_NODE_ID = 'ack-contract-a';
const PEER_NODE_ID = 'ack-contract-b';
const PEER_SERVICE = `${PEER_NODE_ID}/service/witness`;
const LIFETIME_MS = 1000;
const ACK_BOUND_MS = 100;
const MESSAGE = Object.freeze({type: 'ACK_CONTRACT'});

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: LOCAL_NODE_ID},
    logging: {level: 'fatal'},
    transport: {
      messageTimeoutMs: LIFETIME_MS,
      reconnectIntervalMs: 100,
      ackTimeoutQuarantineThreshold: 2,
      ackTimeoutQuarantineLivenessWindowMs: 30000,
    },
  });
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'fatal'});
}

async function buildRouter(t) {
  initializeEnvironment();
  const clock = new VirtualTimeSource({startMs: 1000000});
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION, nodeId: LOCAL_NODE_ID, timeSource: clock});
  await router.initialize({startServer: false});
  t.teardown(async () => {
    await router.shutdown().catch(() => {});
  });
  return {router, clock};
}

function installPeer(router) {
  const frames = [];
  const ws = {
    readyState: 1,
    bufferedAmount: 0,
    send(bytes, _options, written) {
      frames.push(JSON.parse(String(bytes)));
      written?.();
    },
    terminate() {},
  };
  const connection = {
    nodeId: PEER_NODE_ID, nodeAddress: 'ws://ack-contract-b:9999',
    address: 'ws://ack-contract-b:9999', connectionId: 'ack-contract-b-conn-1',
    ws, state: ConnectionState.CONNECTED, isIncoming: false, isSelfConnection: false,
    reconnectAttempts: 0, reconnectTimeout: null, pingInterval: null,
    ackTimeoutStreak: 0, ackTimeoutStreakStartedAt: null, lastAckAt: null,
    lastAckTimeoutAt: null,
  };
  router.nodeConnections.set(PEER_NODE_ID, connection);
  return {connection, ws, frames};
}

// Let every promise continuation and immediate queued so far run.
async function turn() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Start a delivery and return its settlement plus how often it settled.
function startDelivery(router, options, target = PEER_SERVICE, message = MESSAGE) {
  const record = {settlements: 0, delivery: null, error: null};
  record.done = router.deliver(target, message, options).then((delivery) => {
    record.settlements += 1;
    record.delivery = delivery;
  }, (error) => {
    record.settlements += 1;
    record.error = error;
  });
  return record;
}

function ackFrame(messageId, acknowledged = true, error = undefined) {
  return JSON.stringify({type: RouterMessageType.ACK, messageId, acknowledged, error});
}

function responseFrame(messageId, result) {
  return JSON.stringify({type: RouterMessageType.SERVICE_RESPONSE, messageId, result});
}

function liveTimerCount(clock) {
  return clock._timers.size;
}

function inFlightTo(router, nodeId) {
  const queue = router.outboundQueues.get(nodeId);
  return queue ? {inFlight: queue.inFlight, pending: queue.pending.length} :
    {inFlight: 0, pending: 0};
}

function outcomeFacts(transport) {
  return {
    deliveryState: transport.deliveryState,
    errorCode: transport.errorCode,
    reasonCode: transport.reasonCode,
    acknowledgement: transport.acknowledgement,
  };
}

test('an ACK later than ackTimeoutMs is an ack_timeout: unacknowledged, released once',
  async (t) => {
    const {router, clock} = await buildRouter(t);
    const {connection, ws, frames} = installPeer(router);
    const idleTimers = liveTimerCount(clock);
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
    await turn();
    t.equal(frames.length, 1, 'the frame was handed to the socket');
    const {messageId} = frames[0];

    clock.advance(ACK_BOUND_MS - 1);
    await turn();
    t.equal(record.settlements, 0, 'the ACK wait is still open inside its bound');
    t.equal(router.pendingMessages.size, 1, 'the ACK waiter is still registered');

    clock.advance(1);
    await turn();
    t.equal(record.settlements, 1, 'the ACK bound settles the delivery, not the lifetime');
    t.same(outcomeFacts(record.delivery.transport), {
      deliveryState: STATE.DEFERRED,
      errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
      reasonCode: REASON.ACK_TIMEOUT,
      acknowledgement: ACK.UNACKNOWLEDGED,
    }, 'the outcome names the ACK timeout and the unacknowledged frame');
    t.equal(record.delivery.transport.deferRetry, true, 'the spent bound is retryable');
    t.equal(router.pendingMessages.size, 0, 'the ACK waiter is released');
    t.equal(router.pendingResponses.size, 0, 'the answer waiter is released');
    t.same(inFlightTo(router, PEER_NODE_ID), {inFlight: 0, pending: 0},
      'the outbound queue slot is released');
    t.equal(liveTimerCount(clock), idleTimers, 'no delivery timer is left armed');
    t.equal(connection.ackTimeoutStreak, 1, 'the ACK timeout counts toward the socket streak');

    // The ACK and the answer arrive late, inside what the lifetime would
    // have been: nothing settles twice, and the late ACK is socket evidence.
    clock.advance(ACK_BOUND_MS);
    router.handleMessage(PEER_NODE_ID, ws, ackFrame(messageId));
    router.handleMessage(PEER_NODE_ID, ws, responseFrame(messageId, {late: true}));
    await turn();
    clock.advance(LIFETIME_MS);
    await turn();
    t.equal(record.settlements, 1, 'the late ACK and answer do not settle the delivery again');
    t.equal(connection.ackTimeoutStreak, 0,
      'the late ACK ends the socket\'s ACK-timeout streak (liveness owner)');
    t.equal(connection.lastAckAt, clock.now() - LIFETIME_MS,
      'the late ACK is recorded as this socket\'s acknowledgement evidence');
    t.equal(router.pendingMessages.size + router.pendingResponses.size, 0,
      'the late frames registered nothing');
    t.equal(liveTimerCount(clock), idleTimers, 'no timer was re-armed by the late frames');
  });

test('an ACK in time and a late answer is an answer_timeout: acknowledged, no streak',
  async (t) => {
    const {router, clock} = await buildRouter(t);
    const {connection, ws, frames} = installPeer(router);
    const idleTimers = liveTimerCount(clock);
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
    await turn();
    clock.advance(ACK_BOUND_MS - 1);
    router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[0].messageId));
    await turn();

    clock.advance(LIFETIME_MS - ACK_BOUND_MS);
    await turn();
    t.equal(record.settlements, 0,
      'an acknowledged delivery is not cut at the ACK bound: the answer wait is the lifetime');

    clock.advance(1);
    await turn();
    t.equal(record.settlements, 1, 'the lifetime settles the delivery');
    t.same(outcomeFacts(record.delivery.transport), {
      deliveryState: STATE.DEFERRED,
      errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
      reasonCode: REASON.ANSWER_TIMEOUT,
      acknowledgement: ACK.ACKNOWLEDGED,
    }, 'the outcome names the answer timeout on an acknowledged message');
    t.equal(connection.ackTimeoutStreak, 0,
      'an answer timeout never counts toward the socket\'s ACK-timeout streak');
    t.equal(connection.lastAckTimeoutAt, null, 'no ACK timeout was recorded on the socket');
    t.equal(router.pendingMessages.size + router.pendingResponses.size, 0,
      'both waiters are released');
    t.equal(liveTimerCount(clock), idleTimers, 'no delivery timer is left armed');
  });

test('an acknowledged delivery answered after ackTimeoutMs is delivered', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {ws, frames} = installPeer(router);
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  const {messageId} = frames[0];
  clock.advance(ACK_BOUND_MS / 2);
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(messageId));
  await turn();
  clock.advance(ACK_BOUND_MS * 5);
  router.handleMessage(PEER_NODE_ID, ws, responseFrame(messageId, {rows: 1}));
  await turn();
  t.equal(record.settlements, 1, 'the slow answer settles the delivery');
  t.same(outcomeFacts(record.delivery.transport), {
    deliveryState: STATE.DELIVERED, errorCode: null, reasonCode: null,
    acknowledgement: ACK.ACKNOWLEDGED,
  }, 'a leader that acknowledges and answers slower than the ACK bound is not cut');
  t.same(record.delivery.answer, {rows: 1}, 'the answer is the handler\'s');
});

test('without ackTimeoutMs the ACK wait is bounded by the lifetime, as before', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {connection, ws, frames} = installPeer(router);
  const unacked = startDelivery(router, {timeoutMs: LIFETIME_MS});
  await turn();
  clock.advance(LIFETIME_MS - 1);
  await turn();
  t.equal(unacked.settlements, 0, 'no ACK expiry exists before the lifetime');
  clock.advance(1);
  await turn();
  t.equal(unacked.settlements, 1, 'the lifetime ends the ACK wait');
  t.same({errorCode: unacked.delivery.transport.errorCode,
    deliveryState: unacked.delivery.transport.deliveryState,
    deferRetry: unacked.delivery.transport.deferRetry,
    error: unacked.delivery.transport.error},
  {errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, deliveryState: STATE.DEFERRED,
    deferRetry: true, error: 'Message timeout'},
  'the refusal is the typed, deferred delivery-lifetime timeout it was');
  t.equal(connection.ackTimeoutStreak, 1, 'the unacknowledged lifetime counts on the socket');

  const late = startDelivery(router, {timeoutMs: LIFETIME_MS});
  await turn();
  const {messageId} = frames[1];
  clock.advance(LIFETIME_MS - 2);
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(messageId));
  await turn();
  clock.advance(1);
  router.handleMessage(PEER_NODE_ID, ws, responseFrame(messageId, {ok: true}));
  await turn();
  t.equal(late.delivery?.transport.deliveryState, STATE.DELIVERED,
    'an ACK and an answer anywhere inside the lifetime deliver');
});

test('a refusal that never wrote a frame is not_sent', async (t) => {
  const {router} = await buildRouter(t);
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  t.equal(record.settlements, 1, 'no connection refuses at once');
  t.same(outcomeFacts(record.delivery.transport), {
    deliveryState: STATE.DEFERRED,
    errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
    reasonCode: REASON.NO_CONNECTION,
    acknowledgement: ACK.NOT_SENT,
  }, 'no connection: nothing was sent');
});

test('a negative ACK is rejected', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {connection, ws, frames} = installPeer(router);
  const idleTimers = liveTimerCount(clock);
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[0].messageId, false, 'refused'));
  await turn();
  t.equal(record.settlements, 1, 'the negative ACK settles the delivery');
  const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
  t.same({deliveryState: transport.deliveryState, acknowledgement: transport.acknowledgement,
    reasonCode: transport.reasonCode, error: transport.error},
  {deliveryState: STATE.FAILED, acknowledgement: ACK.REJECTED,
    reasonCode: REASON.ACK_REJECTED, error: 'refused'},
  'the target router refused the message');
  t.equal(connection.ackTimeoutStreak, 0, 'a negative ACK is not an ACK timeout');
  t.equal(router.pendingMessages.size + router.pendingResponses.size, 0, 'waiters released');
  t.equal(liveTimerCount(clock), idleTimers, 'no delivery timer is left armed');
});

test('a one-way raft frame asks for no ACK: delivered, not_requested', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {frames} = installPeer(router);
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS},
    `${PEER_NODE_ID}/partition/ack-contract-p1-r2`, {
      protocol: 'raft-rs', groupId: 'ack-contract-p1', from: '101', to: '202',
      message: {msgType: 3, from: '101', to: '202', term: '1', logTerm: '0',
        index: '0', commit: '0', entries: []},
    });
  await turn();
  t.equal(frames[0]?.oneWay, true, 'the frame is one-way');
  t.same(outcomeFacts(record.delivery.transport), {
    deliveryState: STATE.DELIVERED, errorCode: null, reasonCode: null,
    acknowledgement: ACK.NOT_REQUESTED,
  }, 'the hop is complete and says no ACK was requested');
  clock.advance(LIFETIME_MS * 2);
  await turn();
  t.equal(record.settlements, 1, 'no expiry settles the one-way delivery again');
});

test('a slow local handler is not cut by ackTimeoutMs: this router accepted it', async (t) => {
  const {router, clock} = await buildRouter(t);
  const answer = Promise.withResolvers();
  const address = `${LOCAL_NODE_ID}/service/local-witness`;
  router.register(address, () => answer.promise);
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS},
    address);
  await turn();
  clock.advance(ACK_BOUND_MS * 3);
  await turn();
  t.equal(record.settlements, 0, 'the handler\'s time is the answer wait');
  answer.resolve({ok: true});
  await turn();
  t.same(outcomeFacts(record.delivery.transport), {
    deliveryState: STATE.DELIVERED, errorCode: null, reasonCode: null,
    acknowledgement: ACK.ACKNOWLEDGED,
  }, 'the local delivery is acknowledged and delivered');
});

// The query data plane is carried by the query transport's own inner
// delivery: that hop waits for the ACK, so it gets the ACK bound and reports
// the acknowledgement it records to the delivery it is carried for.
// Like the message group's direct-only path, an undelivered inner delivery
// is thrown as the message group's delivery error.
function installQueryTransport(router) {
  const seen = [];
  router.setQueryMessageGroupServiceResolver(() => ({
    async sendMessage(targetService, message, options) {
      seen.push(options.transportDeliveryOptions);
      const delivery = await router.deliver(targetService,
        {type: 'CARRIED', payload: message},
        resolveTransportDeliveryOptions(targetService, options.transportDeliveryOptions));
      if (delivery.transport.deliveryState !== STATE.DELIVERED) {
        throw buildDirectDeliveryError(delivery, 'Query message delivery failed');
      }
      return {delivery};
    },
  }));
  return seen;
}

test('a query carried by the query transport keeps the two waits apart', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {connection, ws, frames} = installPeer(router);
  const seen = installQueryTransport(router);
  const query = {type: 'QUERY', sql: 'SELECT 1'};
  const options = {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS};

  const answered = startDelivery(router, options, PEER_SERVICE, query);
  await turn();
  t.equal(seen[0].ackTimeoutMs, ACK_BOUND_MS, 'the carried hop receives the ACK bound');
  t.ok(seen[0].timeoutMs > ACK_BOUND_MS, 'and the whole lifetime for the answer');
  clock.advance(ACK_BOUND_MS / 2);
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[0].messageId));
  await turn();
  clock.advance(ACK_BOUND_MS * 5);
  await turn();
  t.equal(answered.settlements, 0,
    'the carrying delivery is not cut at the ACK bound once the carried hop is acknowledged');
  router.handleMessage(PEER_NODE_ID, ws, responseFrame(frames[0].messageId, {rows: 1}));
  await turn();
  t.equal(answered.delivery?.transport.deliveryState, STATE.DELIVERED,
    'a slow answer through the query transport is delivered');

  const unacked = startDelivery(router, options, PEER_SERVICE, query);
  await turn();
  clock.advance(ACK_BOUND_MS + 1);
  await turn();
  t.equal(unacked.settlements, 1, 'the ACK bound ends the unacknowledged carried delivery');
  const refused = unacked.delivery?.transport ?? classifyThrownDeliveryError(unacked.error);
  t.same({reasonCode: refused.reasonCode, acknowledgement: refused.acknowledgement},
    {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.UNACKNOWLEDGED},
    'the ACK timeout of the carried hop reaches the query caller as such');
  t.equal(connection.ackTimeoutStreak, 1, 'and counts once on the socket');

  const slow = startDelivery(router, options, PEER_SERVICE, query);
  await turn();
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[2].messageId));
  await turn();
  clock.advance(LIFETIME_MS + 1);
  await turn();
  const spent = slow.delivery?.transport ?? classifyThrownDeliveryError(slow.error);
  t.same({reasonCode: spent.reasonCode, acknowledgement: spent.acknowledgement},
    {reasonCode: REASON.ANSWER_TIMEOUT, acknowledgement: ACK.ACKNOWLEDGED},
    'an acknowledged, unanswered carried delivery is an answer timeout');
  t.equal(connection.ackTimeoutStreak, 0, 'which never counts on the socket');
});

test('the ACK-timeout streak counts ACK timeouts only', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {connection, ws, frames} = installPeer(router);
  // Recent inbound traffic keeps the alive peer's connection (CL-007), so the
  // streak itself is what is observed.
  router.recordNodeInboundActivity(PEER_NODE_ID);
  for (let index = 0; index < 3; index += 1) {
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
    await turn();
    router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[index].messageId));
    await turn();
    clock.advance(LIFETIME_MS);
    await turn();
    t.equal(record.delivery?.transport.reasonCode, REASON.ANSWER_TIMEOUT,
      `delivery ${index + 1} is an answer timeout`);
  }
  t.equal(connection.ackTimeoutStreak, 0, 'three answer timeouts leave the streak at zero');
  t.equal(connection.lastAckTimeoutAt, null, 'and record no ACK timeout on the socket');
  for (let index = 0; index < 3; index += 1) {
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
    await turn();
    clock.advance(ACK_BOUND_MS);
    await turn();
    t.equal(record.delivery?.transport.reasonCode, REASON.ACK_TIMEOUT,
      `delivery ${index + 4} is an ACK timeout`);
    router.recordNodeInboundActivity(PEER_NODE_ID);
  }
  t.equal(router.nodeConnections.get(PEER_NODE_ID), connection,
    'the alive peer keeps its connection');
  t.equal(connection.ackTimeoutStreak, 3, 'three ACK timeouts are a streak of three');
});

test('a supplied ackTimeoutMs is a whole positive duration or a typed refusal', async (t) => {
  const {router} = await buildRouter(t);
  installPeer(router);
  for (const ackTimeoutMs of [0, -1, 0.5, Number.NaN, '100']) {
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs});
    await turn();
    t.equal(record.error?.code, 'router_delivery_lifetime_invalid',
      `ackTimeoutMs ${String(ackTimeoutMs)} is refused, never read as "no ACK bound"`);
  }
  t.equal(router.pendingMessages.size + router.pendingResponses.size, 0,
    'a refused lifetime registers nothing');
});

test('the outcome owner names the acknowledgement and the timeout reason', async (t) => {
  const reasonOf = (facts) => {
    const outcome = buildTransportDeliveryOutcome({acknowledged: false,
      errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, ...facts});
    return {reasonCode: outcome.reasonCode, acknowledgement: outcome.acknowledgement};
  };
  t.same(reasonOf({acknowledgement: ACK.UNACKNOWLEDGED}),
    {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.UNACKNOWLEDGED});
  t.same(reasonOf({acknowledgement: ACK.NOT_SENT}),
    {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.NOT_SENT},
    'a bound spent before a frame left is an ACK timeout with nothing sent');
  t.same(reasonOf({acknowledgement: ACK.ACKNOWLEDGED}),
    {reasonCode: REASON.ANSWER_TIMEOUT, acknowledgement: ACK.ACKNOWLEDGED});
  t.same(reasonOf({}),
    {reasonCode: REASON.UNESTABLISHED_TIMEOUT, acknowledgement: ACK.UNESTABLISHED},
    'a spent lifetime that states no ACK fact claims neither a missing ACK nor an accepted one');
  t.same(reasonOf({acknowledgement: 'nonsense'}),
    {reasonCode: REASON.UNESTABLISHED_TIMEOUT, acknowledgement: ACK.UNESTABLISHED},
    'a value outside the named states is no acknowledgement fact');
  t.same(reasonOf({acknowledgement: ACK.UNESTABLISHED}),
    {reasonCode: REASON.UNESTABLISHED_TIMEOUT, acknowledgement: ACK.UNESTABLISHED},
    'an unestablished acknowledgement is never read as "the target router accepted it"');
  t.equal(Object.hasOwn(REASON, 'MESSAGE_TIMEOUT'), false,
    'the single message-timeout reason no longer exists');
  t.equal(buildTransportDeliveryOutcome({acknowledged: true}).acknowledgement, ACK.ACKNOWLEDGED);
  t.equal(buildTransportDeliveryOutcome({acknowledged: false, noHandler: true}).acknowledgement,
    ACK.ACKNOWLEDGED, 'a router that answered "no handler" accepted the message');
  t.equal(classifyThrownDeliveryError(Object.assign(new Error('closed'), {
    code: 'ROUTER_CONNECTION_CLOSED', recoverableBeforeSend: true})).acknowledgement,
  ACK.NOT_SENT, 'closed before send: nothing was sent');
  t.equal(classifyThrownDeliveryError(Object.assign(new Error('late'), {
    code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, acknowledgement: ACK.UNACKNOWLEDGED}),
  {acknowledgement: ACK.ACKNOWLEDGED}).reasonCode, REASON.ANSWER_TIMEOUT,
  'the converting router\'s own acknowledgement fact outranks the Error\'s stamp');
});

test('the timeout diagnostics name the wait that ended', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {connection, ws, frames} = installPeer(router);
  // wait_bound_spent folds repeats of one (target, observed state) in this
  // process: a connection id of its own makes this report a first one.
  connection.connectionId = 'ack-contract-b-conn-diagnostics';
  const logging = LoggingService.getInstance();
  const consoleOnly = [];
  const errors = [];
  const originalConsoleOnly = logging.logConsoleOnly;
  const originalError = router.logger.error;
  logging.logConsoleOnly = (_level, message, context) => consoleOnly.push({message, context});
  router.logger.error = (message, context) => errors.push({message, context});
  t.teardown(() => {
    logging.logConsoleOnly = originalConsoleOnly;
    router.logger.error = originalError;
  });
  const spentWaits = () => errors.filter((entry) => entry.context?.event === 'wait_bound_spent');

  const unacked = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  clock.advance(ACK_BOUND_MS);
  await turn();
  t.equal(unacked.settlements, 1, 'the ACK bound was spent');
  const detail = consoleOnly.find((entry) => entry.message === 'Router ACK timeout detail');
  t.same({reasonCode: detail?.context.reasonCode,
    acknowledgement: detail?.context.acknowledgement, boundMs: detail?.context.boundMs},
  {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.UNACKNOWLEDGED, boundMs: ACK_BOUND_MS},
  'the ACK timeout detail reports the reason, the state and the ACK bound it spent');
  const ackSpent = spentWaits().at(-1)?.context;
  t.same({reasonCode: ackSpent?.lastObserved.reasonCode,
    acknowledgement: ackSpent?.lastObserved.acknowledgement, boundMs: ackSpent?.boundMs},
  {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.UNACKNOWLEDGED, boundMs: ACK_BOUND_MS},
  'wait_bound_spent for the ACK wait reports the reason and the state');

  const unanswered = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  router.handleMessage(PEER_NODE_ID, ws, ackFrame(frames[1].messageId));
  await turn();
  const detailsBefore = consoleOnly.filter((entry) =>
    entry.message === 'Router ACK timeout detail').length;
  clock.advance(LIFETIME_MS);
  await turn();
  t.equal(unanswered.settlements, 1, 'the lifetime was spent after the ACK');
  const answerSpent = spentWaits().at(-1)?.context;
  t.same({reasonCode: answerSpent?.lastObserved.reasonCode,
    acknowledgement: answerSpent?.lastObserved.acknowledgement},
  {reasonCode: REASON.ANSWER_TIMEOUT, acknowledgement: ACK.ACKNOWLEDGED},
  'wait_bound_spent for the answer wait reports answer_timeout on an acknowledged message');
  t.equal(consoleOnly.filter((entry) => entry.message === 'Router ACK timeout detail').length,
    detailsBefore, 'an answer timeout writes no ACK timeout detail');
});

test('the message group\'s delivery error keeps the carried hop\'s acknowledgement',
  async (t) => {
    const {router} = await buildRouter(t);
    for (const [acknowledgement, reasonCode] of [
      [ACK.UNACKNOWLEDGED, REASON.ACK_TIMEOUT],
      [ACK.NOT_SENT, REASON.ACK_TIMEOUT],
      [ACK.ACKNOWLEDGED, REASON.ANSWER_TIMEOUT],
    ]) {
      const thrown = buildDirectDeliveryError(buildDeliveryEnvelope({
        acknowledged: false, errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
        error: 'Message timeout', deferRetry: true, acknowledgement,
      }), 'Query message delivery failed');
      const read = classifyThrownDeliveryError(thrown);
      t.same({acknowledgement: read.acknowledgement, reasonCode: read.reasonCode},
        {acknowledgement, reasonCode},
        `${acknowledgement}: the message group error reads as the carried outcome`);
      const deferred = buildTransportDeliveryOutcome(
        router.buildCanonicalDeferredQueryTransportOutcome('m-1', 'm-1', thrown));
      t.same({acknowledgement: deferred.acknowledgement, reasonCode: deferred.reasonCode},
        {acknowledgement, reasonCode},
        `${acknowledgement}: the router's deferred query outcome keeps it`);
    }
  });

// A bound spent while the frame is still being stamped: the lifetime aborts
// with the ACK wait open but nothing on the wire (not_sent).
function spendDuringStamp(clock, byMs) {
  let prepared = 0;
  return {
    deliveryDurationField: 'remainingMs',
    prepareDeliveryMessage(message, grantedMs) {
      prepared += 1;
      if (prepared === 2) clock.advance(byMs);
      return {...message, remainingMs: grantedMs};
    },
  };
}

test('an ACK bound spent before the frame left never counts against the socket',
  async (t) => {
    const {router, clock} = await buildRouter(t);
    const {connection, frames} = installPeer(router);
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS,
      ...spendDuringStamp(clock, ACK_BOUND_MS + 1)});
    await turn();
    await record.done;
    t.equal(frames.length, 0, 'no frame was handed to the socket');
    const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
    t.same({reasonCode: transport.reasonCode, acknowledgement: transport.acknowledgement},
      {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.NOT_SENT},
      'the spent ACK bound is an ACK timeout with nothing sent');
    t.equal(connection.ackTimeoutStreak, 0, 'a delivery that never left is no socket evidence');
    t.equal(connection.lastAckTimeoutAt, null, 'and records no ACK timeout on the socket');
  });

test('a socket that throws on send leaves the delivery not_sent', async (t) => {
  const {router, clock} = await buildRouter(t);
  const {ws} = installPeer(router);
  ws.send = () => {
    throw new Error('socket refused the frame');
  };
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
  await turn();
  // The write callback stays owed after a throw inside ws.send; the lifetime
  // settles the public delivery.
  clock.advance(LIFETIME_MS + 1);
  await turn();
  await record.done;
  const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
  t.equal(transport.acknowledgement, ACK.NOT_SENT,
    'a synchronous send failure is recorded as nothing sent, never as unacknowledged');
});

test('a connection closed after the frame left is unacknowledged, not unestablished',
  async (t) => {
    const {router} = await buildRouter(t);
    const {connection, frames} = installPeer(router);
    const record = startDelivery(router, {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS});
    await turn();
    t.equal(frames.length, 1, 'the frame left');
    router.handleConnectionClose(PEER_NODE_ID, connection.connectionId);
    await turn();
    await record.done;
    const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
    t.same({reasonCode: transport.reasonCode, acknowledgement: transport.acknowledgement},
      {reasonCode: REASON.CONNECTION_CLOSED, acknowledgement: ACK.UNACKNOWLEDGED},
      'the close outcome states the acknowledgement the lifetime recorded');
  });

test('a carried delivery spent while unestablished is no answer timeout', async (t) => {
  const {router, clock} = await buildRouter(t);
  installPeer(router);
  // A carrier that never reports a frame leaving.
  const carried = Promise.withResolvers();
  router.setQueryMessageGroupServiceResolver(() => ({
    sendMessage: () => carried.promise,
  }));
  const record = startDelivery(router, {timeoutMs: LIFETIME_MS}, PEER_SERVICE,
    {type: 'QUERY', sql: 'SELECT 1'});
  await turn();
  clock.advance(LIFETIME_MS + 1);
  await turn();
  await record.done;
  const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
  t.same({reasonCode: transport.reasonCode, acknowledgement: transport.acknowledgement},
    {reasonCode: REASON.UNESTABLISHED_TIMEOUT, acknowledgement: ACK.UNESTABLISHED},
    'nothing establishes that the node\'s router accepted it');
  carried.reject(new Error('late carrier failure'));
});

test('a spent carried ACK bound is the carrying delivery\'s own ack_timeout', async (t) => {
  const {router, clock} = await buildRouter(t);
  installPeer(router);
  const seen = [];
  router.setQueryMessageGroupServiceResolver(() => ({
    async sendMessage(_targetService, _message, options) {
      seen.push(options);
      return {delivery: null};
    },
  }));
  // The ACK bound is spent exactly when the carried hop's options are built.
  const lifetimeOptions = {timeoutMs: LIFETIME_MS, ackTimeoutMs: ACK_BOUND_MS};
  const originalResolve = router.resolveQueryTransportDeliveryOutcome;
  router.resolveQueryTransportDeliveryOutcome = function(...args) {
    clock.advance(ACK_BOUND_MS);
    return originalResolve.apply(this, args);
  };
  const record = startDelivery(router, lifetimeOptions, PEER_SERVICE,
    {type: 'QUERY', sql: 'SELECT 1'});
  await turn();
  await record.done;
  t.equal(seen.length, 0, 'no carried hop is started with a spent ACK bound');
  const transport = record.delivery?.transport ?? classifyThrownDeliveryError(record.error);
  t.same({reasonCode: transport.reasonCode, acknowledgement: transport.acknowledgement},
    {reasonCode: REASON.ACK_TIMEOUT, acknowledgement: ACK.NOT_SENT},
    'the spent ACK bound is an ACK timeout, never a lifetime refusal');
});

test('the message group hands every supplied ACK bound to the lifetime that validates it',
  async (t) => {
    for (const ackTimeoutMs of [0, 0.5, -1, 100]) {
      const options = resolveTransportDeliveryOptions(PEER_SERVICE, {ackTimeoutMs});
      t.equal(options.ackTimeoutMs, ackTimeoutMs,
        `ackTimeoutMs ${ackTimeoutMs} passes through unchanged, never dropped`);
    }
    t.equal(resolveTransportDeliveryOptions(PEER_SERVICE, {})?.ackTimeoutMs, undefined,
      'an absent ACK bound stays absent');
  });

test('an answer for a request whose socket was superseded goes on the current primary',
  async (t) => {
    const {router} = await buildRouter(t);
    const {connection, ws: oldWs, frames: oldFrames} = installPeer(router);
    const gates = [];
    const address = `${LOCAL_NODE_ID}/service/answered-late`;
    router.register(address, (envelope) => {
      const gate = Promise.withResolvers();
      gates.push(gate);
      return gate.promise.then(() => ({answered: envelope.messageId}));
    });
    const request = (messageId) => JSON.stringify({type: RouterMessageType.SERVICE_MESSAGE,
      messageId, targetAddress: address, sourceNodeId: PEER_NODE_ID,
      sourceAddress: `${PEER_NODE_ID}/router`, payload: {}, timestamp: 1});
    router.handleMessage(PEER_NODE_ID, oldWs, request('answered-ok'));
    router.handleMessage(PEER_NODE_ID, oldWs, request('answered-error'));
    await turn();
    t.same(oldFrames.map((frame) => frame.type), [RouterMessageType.ACK, RouterMessageType.ACK],
      'the requests are acknowledged on the socket they arrived on');
    // The peer's socket is superseded while the handlers run.
    const newFrames = [];
    const newWs = {readyState: 1, bufferedAmount: 0,
      send(bytes) {
        newFrames.push(JSON.parse(String(bytes)));
      }, terminate() {}};
    oldWs.readyState = 3;
    router.nodeConnections.set(PEER_NODE_ID, {...connection, ws: newWs,
      connectionId: 'ack-contract-b-conn-2'});
    gates[0].resolve();
    gates[1].reject(new Error('handler refused'));
    await turn();
    t.same(newFrames.map((frame) => [frame.type, frame.messageId, Boolean(frame.error)]), [
      [RouterMessageType.SERVICE_RESPONSE, 'answered-ok', false],
      [RouterMessageType.SERVICE_RESPONSE, 'answered-error', true],
    ], 'the answer and the handler failure travel on the node\'s current primary');
    t.equal(oldFrames.length, 2, 'nothing more is written to the superseded socket');
  });
