// W-HID-2 / W-HID-3 (handler-identity cluster findings F2, F4): one policy
// retires a handler, by its exact registered identity, and fails closed.
//
// W-HID-2 (F2). A node-singleton handler (RuntimeServiceHandler,
// ReplicaHandler) that retires its registration never removes a successor's
// handler registered at the same address: it removes exactly its own, and a
// successor's registration survives the predecessor's retirement.
// W-HID-3 (F4). The message-group service handler on a transport that cannot
// prove handler identity refuses its retirement the same way a replica
// retirement does: it throws the owner's refusal instead of warning and
// returning with its handler left registered.
import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {
  REPLICA_HANDLER_RETIREMENT_LOG_MSG,
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
} from '../../src/node/replica-transport-handler-identity.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'whid-node';
const EMPTY_CACHE = Object.freeze({get: () => null, filter: () => []});
const SINGLETONS = Object.freeze({
  MessageGroupServiceHandler: {
    create: () => new MessageGroupServiceHandler({nodeId: NODE_ID,
      systemTableCache: EMPTY_CACHE, cdcIntegrationService: {}}),
    address: `${NODE_ID}/service/message-group-handler`,
  },
  RuntimeServiceHandler: {
    create: () => new RuntimeServiceHandler({nodeId: NODE_ID,
      systemTableCache: EMPTY_CACHE, cdcIntegrationService: {}}),
    address: `${NODE_ID}/service/runtime-service-handler`,
  },
  ReplicaHandler: {
    create: () => new ReplicaHandler({nodeId: NODE_ID, dataDir: '/tmp/whid-unused',
      systemTableCache: EMPTY_CACHE, cdcIntegrationService: {},
      createPartitionService: () => {
        throw new Error('W-HID never creates a partition');
      }}),
    address: `${NODE_ID}/service/replica-handler`,
  },
});

function setupLogging(t) {
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'fatal'});
  t.teardown(() => LoggingService.resetInstance());
}

function realRouter() {
  return new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId: NODE_ID});
}

test('W-HID-2 a node-singleton retirement never removes a successor handler',
  async (t) => {
    setupLogging(t);
    for (const [name, {create, address}] of Object.entries(SINGLETONS)) {
      const router = realRouter();
      const predecessor = create();
      predecessor.registerWithRouter(router);
      const own = router.getRegisteredHandler(address);
      t.equal(typeof own, 'function', `${name}: registered its handler`);
      const successor = async () => ({successor: true});
      router.register(address, successor);
      predecessor.unregisterFromRouter(router);
      t.equal(router.getRegisteredHandler(address), successor,
        `${name}: the successor's handler survives the predecessor's retirement`);
      const current = create();
      current.registerWithRouter(router);
      const currentHandler = router.getRegisteredHandler(address);
      current.unregisterFromRouter(router);
      t.equal(router.getRegisteredHandler(address), null,
        `${name}: its own exact registration is retired`);
      t.not(currentHandler, successor, `${name}: the retired handler was its own`);
    }
  });

test('W-HID-3 the message-group handler fails closed on a transport without identity',
  async (t) => {
    setupLogging(t);
    const registered = new Map();
    // A transport that registers but cannot prove handler identity.
    const transport = {register: (address, handler) => registered.set(address, handler)};
    const handler = new MessageGroupServiceHandler({nodeId: NODE_ID,
      systemTableCache: EMPTY_CACHE, cdcIntegrationService: {}});
    handler.registerWithRouter(transport);
    t.equal(registered.size, 1, 'the handler registered on the transport');
    let refusal = null;
    try {
      handler.unregisterFromRouter(transport);
    } catch (error) {
      refusal = error;
    }
    t.same({message: refusal?.message, code: refusal?.code},
      {message: REPLICA_HANDLER_RETIREMENT_LOG_MSG.LEFT_REGISTERED,
        code: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
      'the retirement is refused with the owner\'s one fail-closed refusal');
  });


test('W-HID registration custody survives wrong-router calls and router replacement',
  async (t) => {
    setupLogging(t);
    for (const [name, {create, address}] of Object.entries(SINGLETONS)) {
      const first = realRouter();
      const second = realRouter();
      const handler = create();
      handler.registerWithRouter(first);
      const own = first.getRegisteredHandler(address);
      handler.unregisterFromRouter(second);
      t.equal(handler.registeredRouterHandler, own, `${name}: wrong router retains custody`);
      handler.registerWithRouter(second);
      t.equal(first.getRegisteredHandler(address), null, `${name}: old router is retired`);
      handler.unregisterFromRouter(second);
      t.equal(second.getRegisteredHandler(address), null, `${name}: current router is retired`);
    }
  });

test('W-HID refused retirement retains the callback for a later exact retry',
  async (t) => {
    setupLogging(t);
    for (const [name, {create, address}] of Object.entries(SINGLETONS)) {
      const router = realRouter();
      const handler = create();
      handler.registerWithRouter(router);
      const own = router.getRegisteredHandler(address);
      const unregisterExact = router.unregisterExact;
      router.unregisterExact = null;
      t.throws(() => handler.unregisterFromRouter(router),
        {code: REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY},
        `${name}: missing identity refuses retirement`);
      t.equal(handler.registeredRouterHandler, own, `${name}: refusal retains custody`);
      router.unregisterExact = unregisterExact;
      handler.unregisterFromRouter(router);
      t.equal(router.getRegisteredHandler(address), null, `${name}: exact retry retires`);
    }
  });
