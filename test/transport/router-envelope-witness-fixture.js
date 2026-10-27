// The one fixture of the Q6 router-envelope witnesses (W-ENV-1..8): real
// MessageRouter instances, identified over real WebSocket connections, and the
// delivery envelope a caller receives ({transport, answer}). Nothing here
// fakes a router or restates an owner answer; handlers are registered on the
// real routers and their replies cross the real wire. A forwarding hop answers
// through the transport owner's one forwarded-answer rule.
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  forwardedDeliveryAnswer,
} from '../../src/transport/transport-semantic-outcome.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const HOST = '127.0.0.1';
const SETTLE_POLL_MS = 5;
const SETTLE_POLLS = 2000;

// The transport facts a caller decides on, with one delivery-state field.
const TRANSPORT_FACT_FIELDS = Object.freeze([
  ...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
]);

// The transport facts of a delivery, without the per-delivery identity.
function transportFactsOf(delivery) {
  return Object.fromEntries(TRANSPORT_FACT_FIELDS.map((field) =>
    [field, delivery.transport[field]]));
}

// The router's identity of the delivery and the transport error text.
function transportIdentityOf(delivery) {
  const {messageId, correlationId, error} = delivery.transport;
  return {messageId, correlationId, error};
}

function answerOf(delivery) {
  return delivery.answer;
}

// A forwarding handler on `router`: it delivers the inner message to the
// onward address and answers with the owner's forwarded answer.
function forwardingHandler(router) {
  return async (envelope) => forwardedDeliveryAnswer(await router.deliver(
    envelope.payload.forwardTo, envelope.payload.inner));
}

function serviceAddress(nodeId, entity) {
  return `${nodeId}/${ENTITY_TYPE.SERVICE}/${entity}`;
}

function createRouterEnvelopeFixture(testFileUrl, sender) {
  const ports = createPortAllocator(testFileUrl);
  const routers = [];
  async function start(nodeId, startServer = true) {
    const port = startServer ? ports.getPort() : undefined;
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId,
      ...(startServer ? {wsPort: port, wsHost: HOST} : {})});
    routers.push(router);
    await router.initialize({startServer});
    return {router, port};
  }
  return {
    async setup() {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({node: {id: sender},
        logging: {level: 'fatal'}});
      LoggingService.getInstance().initialize({level: 'fatal'});
    },
    start,
    // A connected pair: `from` holds an identified connection to `to`.
    async connect(from, to) {
      await from.router.connectToNode(to.router.nodeId, `ws://${HOST}:${to.port}`);
    },
    async teardown() {
      for (const router of routers.splice(0)) await router.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    },
  };
}

// Poll until `condition()` holds; a bounded wait on test-owned timers that
// fails closed instead of hanging the file.
async function settleUntil(t, condition, label) {
  for (let poll = 0; poll < SETTLE_POLLS; poll += 1) {
    if (condition()) return;
    await managedSleep(t, SETTLE_POLL_MS);
  }
  throw new Error(`router-envelope fixture: ${label} never held`);
}

export {
  answerOf,
  createRouterEnvelopeFixture,
  forwardingHandler,
  serviceAddress,
  settleUntil,
  transportFactsOf,
  transportIdentityOf,
};
