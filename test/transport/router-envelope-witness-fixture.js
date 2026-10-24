// The one fixture of the Q6 router-envelope witnesses (W-ENV-1..4): real
// MessageRouter instances, identified over real WebSocket connections, and the
// owner classification of what a delivery caller receives. Nothing here fakes
// a router or restates an owner answer; handlers are registered on the real
// routers and their replies cross the real wire.
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  classifyTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const HOST = '127.0.0.1';
const SETTLE_POLL_MS = 5;
const SETTLE_POLLS = 2000;

// The transport facts a caller decides on: the owner metadata plus the
// acknowledgement the owner computes beside it.
const TRANSPORT_FACT_FIELDS = Object.freeze([
  'acknowledged',
  ...TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
]);

function transportFactsOf(delivery) {
  const outcome = classifyTransportDeliveryOutcome(delivery);
  return Object.fromEntries(TRANSPORT_FACT_FIELDS.map((field) =>
    [field, outcome[field]]));
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
  createRouterEnvelopeFixture,
  serviceAddress,
  settleUntil,
  transportFactsOf,
};
