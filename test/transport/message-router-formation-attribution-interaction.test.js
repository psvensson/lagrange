import {EventEmitter} from 'node:events';
import {AsyncResource} from 'node:async_hooks';
import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {TRANSPORT_EVENT} from '../../src/constants/transport.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
  runFormationOwner,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  MessageRouter,
  RouterMessageType,
} from '../../src/transport/message-router.js';

const PARSE_STEP_US = 5;
const HANDLER_BEFORE_HANDOFF_US = 4;
const READINESS_HANDOFF_US = 3;
const HANDLER_AFTER_HANDOFF_US = 3;
const TRANSPORT_HANDLER_US =
  HANDLER_BEFORE_HANDOFF_US + HANDLER_AFTER_HANDOFF_US;
const BRANCH_PARSE_STEP_US = 1;
const CONTROL_BRANCH_COUNT = 8;
const OPEN_READY_STATE = 1;
const CLOSED_READY_STATE = 3;
const LONG_TIMEOUT_MS = 60_000;
const SERVICE_ADDRESS = 'node-a/service/service-a';
const SOURCE_ADDRESS = 'node-b/service/service-b';
const INTERACTION_URL = new URL(
  '../../src/diagnostics/transport-formation-attribution.js',
  import.meta.url,
);
const CONTRACT_URL = new URL(
  '../../src/diagnostics/formation-diagnostics-contract.js',
  import.meta.url,
);
const ATTRIBUTION_URL = new URL(
  '../../src/diagnostics/formation-turn-attribution.js',
  import.meta.url,
);
const MESSAGE_ROUTER_URL = new URL(
  '../../src/transport/message-router.js',
  import.meta.url,
);
const IMPACT_CONTRACTS_URL = new URL(
  '../../test/shards/impact-contracts.json',
  import.meta.url,
);

class DeterministicSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = OPEN_READY_STATE;
    this.sent = [];
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    this.readyState = CLOSED_READY_STATE;
  }

  terminate() {
    this.close();
  }
}

function createLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      debug(message, context) {
        entries.push({level: 'debug', message, context});
      },
      error(message, context) {
        entries.push({level: 'error', message, context});
      },
      info(message, context) {
        entries.push({level: 'info', message, context});
      },
      warn(message, context) {
        entries.push({level: 'warn', message, context});
      },
    },
  };
}

function createClock() {
  let nowUs = 0;
  return {
    advance(durationUs) {
      nowUs += durationUs;
    },
    attribution: new FormationTurnAttribution({clock: () => nowUs}),
  };
}

function measuredFrame(payload, clock, durationUs = PARSE_STEP_US) {
  const raw = JSON.stringify(payload);
  return {
    toString() {
      clock.advance(durationUs);
      return raw;
    },
  };
}

function frame(payload) {
  return Buffer.from(JSON.stringify(payload));
}

function ownerDurationUs(snapshot, owner) {
  return snapshot.owners.find((entry) => entry.owner === owner)?.durationUs || 0;
}

async function flushPromiseChain() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createRouterHarness(RouterClass = MessageRouter) {
  const router = new RouterClass({nodeId: 'node-a', nowFn: () => 1000});
  const socket = new DeterministicSocket();
  const logs = createLogger();
  router.logger = logs.logger;
  router.handleIncomingConnection(socket, null);
  return {logs: logs.entries, router, socket};
}

async function measureServiceDispatch(RouterClass = MessageRouter) {
  const clock = createClock();
  const {router, socket} = createRouterHarness(RouterClass);
  const handled = [];
  router.register(SERVICE_ADDRESS, async (envelope) => {
    handled.push(envelope.payload);
    clock.advance(HANDLER_BEFORE_HANDOFF_US);
    runFormationOwner(FORMATION_OWNER.READINESS, () => {
      clock.advance(READINESS_HANDOFF_US);
    });
    clock.advance(HANDLER_AFTER_HANDOFF_US);
    return {handled: true};
  });

  clock.attribution.start();
  const inboundFrame = new AsyncResource('LagrangeTransportInboundFrame');
  const emitted = inboundFrame.runInAsyncScope(() => socket.emit(
    TRANSPORT_EVENT.MESSAGE,
    measuredFrame({
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId: 'message-1',
      sourceAddress: SOURCE_ADDRESS,
      sourceNodeId: 'node-b',
      targetAddress: SERVICE_ADDRESS,
      payload: {value: 1},
      timestamp: 1,
    }, clock),
  ));
  inboundFrame.emitDestroy();
  await flushPromiseChain();
  const snapshot = clock.attribution.stop();
  return {emitted, handled, sent: socket.sent, snapshot};
}

function normalizeSent(messages) {
  return messages.map(({timestamp: _timestamp, ...message}) => message);
}

async function runInactiveScenario(RouterClass) {
  const {logs, router, socket} = createRouterHarness(RouterClass);
  const handled = [];
  router.register(SERVICE_ADDRESS, async (envelope) => {
    handled.push(envelope.payload);
    return {handled: true};
  });
  socket.emit(TRANSPORT_EVENT.MESSAGE, frame({
    type: RouterMessageType.PING,
    pingId: 'ping-inactive',
  }));
  socket.emit(TRANSPORT_EVENT.MESSAGE, frame({
    type: RouterMessageType.SERVICE_MESSAGE,
    messageId: 'inactive-handled',
    sourceAddress: SOURCE_ADDRESS,
    sourceNodeId: 'node-b',
    targetAddress: SERVICE_ADDRESS,
    payload: {kind: 'handled'},
  }));
  socket.emit(TRANSPORT_EVENT.MESSAGE, frame({
    type: RouterMessageType.SERVICE_MESSAGE,
    messageId: 'inactive-missing',
    sourceAddress: SOURCE_ADDRESS,
    sourceNodeId: 'node-b',
    targetAddress: 'node-a/service/missing',
    payload: {kind: 'missing'},
  }));
  socket.emit(TRANSPORT_EVENT.MESSAGE, frame({type: 'unknown-type'}));
  let malformedError = null;
  try {
    socket.emit(TRANSPORT_EVENT.MESSAGE, Buffer.from('{not-json'));
  } catch (error) {
    malformedError = {message: error.message, name: error.name};
  }
  await flushPromiseChain();
  return {
    dispositions: router.getServiceResponseDispositionCounts(),
    handled,
    inboundActivityCount: router.nodeInboundActivityAt.size,
    logs: logs.map(({level, message}) => ({level, message})),
    malformedError,
    sent: normalizeSent(socket.sent),
  };
}

async function loadRevertedInteraction() {
  let source = readFileSync(INTERACTION_URL, 'utf8')
    .replace('./formation-diagnostics-contract.js', CONTRACT_URL.href)
    .replace('./formation-turn-attribution.js', ATTRIBUTION_URL.href);
  const mapping = `      return runFormationOwner(
        FORMATION_OWNER.TRANSPORT_MESSAGE,
        () => reflectApply(handleMessage, this, args),
      );`;
  if (!source.includes(mapping)) {
    throw new Error('transport_message interaction mapping changed');
  }
  source = source.replace(
    mapping,
    '      return reflectApply(handleMessage, this, args);',
  );
  const encoded = Buffer.from(source).toString('base64');
  return import(`data:text/javascript;base64,${encoded}#transport-revert`);
}

async function loadMessageRouterWithInteraction(tapTest, interaction) {
  const loaded = await tapTest.mockImport(MESSAGE_ROUTER_URL.href, {
    [INTERACTION_URL.href]: interaction,
  });
  return loaded.MessageRouter;
}

test('transport formation attribution has a registered owner interaction',
  (t) => {
    const manifest = JSON.parse(readFileSync(IMPACT_CONTRACTS_URL, 'utf8'));
    const contract =
      manifest.contracts['transport-message-formation-attribution'];
    const pair =
      manifest.coupledPairs['transport-message-formation-attribution'];
    const mappingEndpoint = pair.endpoints.find(
      (endpoint) => endpoint.id === 'formation-attribution-mapping',
    );
    const witness =
      'test/transport/message-router-formation-attribution-interaction.test.js';
    t.ok(contract.owners.includes('src/transport/message-router.js'),
      'the contract retains the MessageRouter behavior endpoint');
    t.ok(contract.owners.includes(
      'src/diagnostics/transport-formation-attribution.js',
    ), 'the contract names the typed interaction owner');
    t.ok(contract.owners.includes(
      'src/diagnostics/formation-turn-attribution.js',
    ), 'the contract retains the formation accounting owner');
    t.equal(pair.contract, 'transport-message-formation-attribution',
      'the coupled pair points at the typed contract');
    t.equal(pair.endpoints.length, 2,
      'transport behavior and diagnostics remain separate endpoints');
    t.same(pair.witnessTests, [witness],
      'the exact production-path witness is registered');
    t.ok(mappingEndpoint.owners.includes(
      'src/diagnostics/formation-turn-attribution.js',
    ), 'the mapping endpoint protects accounting implementation changes');
    t.end();
  });

test('incoming socket dispatch and handler continuation are transport_message',
  async (t) => {
    const measured = await measureServiceDispatch();
    t.equal(measured.emitted, true,
      'the real incoming socket listener receives the frame');
    t.same(measured.handled, [{value: 1}],
      'the real inbound dispatch reaches the registered service handler');
    t.same(measured.sent.map((message) => message.type), [
      RouterMessageType.ACK,
      RouterMessageType.SERVICE_RESPONSE,
    ], 'ACK remains before the asynchronous service response');
    t.equal(
      ownerDurationUs(measured.snapshot, FORMATION_OWNER.TRANSPORT_MESSAGE),
      PARSE_STEP_US + TRANSPORT_HANDLER_US,
      'parse and inherited handler work are exclusively transport_message',
    );
    t.equal(
      ownerDurationUs(measured.snapshot, FORMATION_OWNER.READINESS),
      READINESS_HANDOFF_US,
      'a nested explicit owner hands off without charging transport',
    );
    t.equal(
      measured.snapshot.busyDurationUs,
      PARSE_STEP_US + TRANSPORT_HANDLER_US + READINESS_HANDOFF_US,
      'transport and nested owner work are charged exactly once',
    );
    t.equal(
      measured.snapshot.accountedDurationUs,
      measured.snapshot.windowDurationUs,
      'owner plus idle duration exactly partitions the window',
    );
    t.equal(measured.snapshot.partitionDeltaUs, 0,
      'the partition has no missing time');
    t.equal(measured.snapshot.overlapDurationUs, 0,
      'the partition has no overlap');
    t.end();
  });

test('ACK-before-handler and async error responses retain delivery semantics',
  async (t) => {
    const clock = createClock();
    const {router, socket} = createRouterHarness();
    router.register(SERVICE_ADDRESS, async () => {
      clock.advance(HANDLER_BEFORE_HANDOFF_US);
      throw new Error('handler-failed');
    });
    clock.attribution.start();
    socket.emit(TRANSPORT_EVENT.MESSAGE, measuredFrame({
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId: 'missing-handler',
      sourceAddress: SOURCE_ADDRESS,
      sourceNodeId: 'node-b',
      targetAddress: 'node-a/service/missing',
      payload: {kind: 'missing'},
    }, clock));
    socket.emit(TRANSPORT_EVENT.MESSAGE, measuredFrame({
      type: RouterMessageType.SERVICE_MESSAGE,
      messageId: 'failed-handler',
      sourceAddress: SOURCE_ADDRESS,
      sourceNodeId: 'node-b',
      targetAddress: SERVICE_ADDRESS,
      payload: {kind: 'failed'},
    }, clock));
    await flushPromiseChain();
    const snapshot = clock.attribution.stop();

    t.same(socket.sent.map((message) => message.type), [
      RouterMessageType.ACK,
      RouterMessageType.SERVICE_RESPONSE,
      RouterMessageType.ACK,
      RouterMessageType.SERVICE_RESPONSE,
    ], 'each request is ACKed before its terminal service response');
    t.equal(socket.sent[1].result.noHandler, true,
      'missing handlers retain the explicit noHandler processing evidence');
    t.match(socket.sent[1].result.error, /No handler/u,
      'missing handlers retain their retryable delivery detail');
    t.equal(socket.sent[3].error, 'handler-failed',
      'asynchronous handler failures retain the service response error');
    t.equal(
      ownerDurationUs(snapshot, FORMATION_OWNER.TRANSPORT_MESSAGE),
      PARSE_STEP_US * 2 + HANDLER_BEFORE_HANDOFF_US,
      'both sync deliveries and the rejected handler continuation stay transport_message',
    );
    t.end();
  });

test('control, ACK, response, unknown, identify, and error branches stay mapped',
  (t) => {
    const clock = createClock();
    const {logs, router, socket} = createRouterHarness();
    const resolved = [];
    const lateResponses = [];
    const pingTimeout = setTimeout(() => {}, LONG_TIMEOUT_MS);
    const ackTimeout = setTimeout(() => {}, LONG_TIMEOUT_MS);
    pingTimeout.unref();
    ackTimeout.unref();
    router.pendingPings.set('pong-1', {
      timeout: pingTimeout,
      resolve(value) {
        resolved.push({kind: 'pong', value});
      },
    });
    router.pendingMessages.set('ack-1', {
      timeout: ackTimeout,
      targetNodeId: 'node-b',
      resolve(value) {
        resolved.push({kind: 'ack', value});
      },
      reject(error) {
        resolved.push({error: error.message, kind: 'ack-reject'});
      },
    });
    router.pendingResponses.set('response-1', {
      abortListener: null,
      abortSignal: null,
      timeoutId: null,
      targetNodeId: 'node-b',
      resolve(value) {
        resolved.push({kind: 'response', value});
      },
      reject(error) {
        resolved.push({error: error.message, kind: 'response-reject'});
      },
    });
    router.registerPendingResponse('late-1', 'node-b', {
      deliverySource: 'message:formation-probe',
      responseContext: 'formation-probe-context',
    });
    router.cancelPendingResponse('late-1', {ignoreLateResponse: true});
    router.on(TRANSPORT_EVENT.LATE_RESPONSE_HONORED, (event) => {
      lateResponses.push(event);
    });

    const emit = (payload) => socket.emit(
      TRANSPORT_EVENT.MESSAGE,
      measuredFrame(payload, clock, BRANCH_PARSE_STEP_US),
    );
    clock.attribution.start();
    emit({type: RouterMessageType.PING, pingId: 'ping-1'});
    emit({type: RouterMessageType.PONG, pingId: 'pong-1'});
    emit({
      type: RouterMessageType.ACK,
      messageId: 'ack-1',
      acknowledged: true,
      noHandler: true,
    });
    emit({
      type: RouterMessageType.SERVICE_RESPONSE,
      messageId: 'response-1',
      result: {ready: true},
    });
    emit({
      type: RouterMessageType.SERVICE_RESPONSE,
      messageId: 'late-1',
      result: {late: true},
    });
    emit({type: 'unknown-type'});
    emit({type: RouterMessageType.IDENTIFY});
    let malformedError = null;
    try {
      socket.emit(TRANSPORT_EVENT.MESSAGE, {
        toString() {
          clock.advance(BRANCH_PARSE_STEP_US);
          return '{not-json';
        },
      });
    } catch (error) {
      malformedError = error;
    }
    const snapshot = clock.attribution.stop();

    t.equal(socket.sent[0].type, RouterMessageType.PONG,
      'PING retains its PONG response');
    t.same(resolved, [
      {kind: 'pong', value: true},
      {
        kind: 'ack',
        value: {acknowledged: true, messageId: 'ack-1', noHandler: true},
      },
      {kind: 'response', value: {ready: true}},
    ], 'PONG, ACK, and service response settle their existing ledgers');
    t.equal(lateResponses.length, 1,
      'a late successful response still emits its canonical honor event');
    t.equal(lateResponses[0].responseContext, 'formation-probe-context',
      'late response context remains owner-authored');
    t.same(router.getServiceResponseDispositionCounts(), {
      late_after_cancelled: 1,
      settled: 1,
    }, 'late and live responses retain distinct disposition evidence');
    t.ok(logs.some((entry) =>
      entry.level === 'warn' && entry.message === 'Unknown message type'),
    'unknown messages retain their warning path');
    t.ok(logs.some((entry) =>
      entry.level === 'warn' &&
      entry.message === 'Identification missing required fields'),
    'incomplete identification retains its refusal path');
    t.equal(socket.readyState, CLOSED_READY_STATE,
      'incomplete identification still closes the incoming socket');
    t.equal(malformedError?.name, 'SyntaxError',
      'malformed JSON still propagates its parse error');
    t.ok(logs.some((entry) =>
      entry.level === 'error' && entry.message === 'Failed to parse message'),
    'malformed input retains its error log');
    t.equal(
      ownerDurationUs(snapshot, FORMATION_OWNER.TRANSPORT_MESSAGE),
      CONTROL_BRANCH_COUNT * BRANCH_PARSE_STEP_US,
      'every production inbound branch is exclusively transport_message',
    );
    t.equal(snapshot.busyDurationUs,
      CONTROL_BRANCH_COUNT * BRANCH_PARSE_STEP_US,
      'control and error branches are charged exactly once');
    t.end();
  });

test('inactive attribution leaves normalized transport behavior unchanged',
  async (t) => {
    const revertedInteraction = await loadRevertedInteraction();
    const RevertedMessageRouter = await loadMessageRouterWithInteraction(
      t,
      revertedInteraction,
    );
    const current = await runInactiveScenario(MessageRouter);
    const reverted = await runInactiveScenario(RevertedMessageRouter);
    t.same(current, reverted,
      'current and mapping-reverted modules have identical inactive effects');
    t.end();
  });

test('exact interaction revert preserves behavior and falsifies ownership',
  async (t) => {
    const revertedInteraction = await loadRevertedInteraction();
    const RevertedMessageRouter = await loadMessageRouterWithInteraction(
      t,
      revertedInteraction,
    );
    const current = await measureServiceDispatch(MessageRouter);
    const reverted = await measureServiceDispatch(RevertedMessageRouter);
    t.same(
      {
        emitted: current.emitted,
        handled: current.handled,
        sent: current.sent,
      },
      {
        emitted: reverted.emitted,
        handled: reverted.handled,
        sent: reverted.sent,
      },
      'the source mutation retains the same production transport effects',
    );
    t.equal(
      ownerDurationUs(current.snapshot, FORMATION_OWNER.TRANSPORT_MESSAGE),
      PARSE_STEP_US + TRANSPORT_HANDLER_US,
      'current production dispatch satisfies the transport owner claim',
    );
    t.equal(
      ownerDurationUs(reverted.snapshot, FORMATION_OWNER.TRANSPORT_MESSAGE),
      0,
      'removing only the mapping makes the named owner assertion red',
    );
    t.equal(
      reverted.snapshot.unattributedDurationUs,
      PARSE_STEP_US + TRANSPORT_HANDLER_US,
      'the reverted work remains visible as unattributed rather than disappearing',
    );
    t.end();
  });
