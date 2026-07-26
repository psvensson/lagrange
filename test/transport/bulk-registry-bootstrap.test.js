import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  MessageRouterSetup,
} from '../../src/bootstrap/shared/message-router-setup.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {
  ROUTER_IDENTIFY_CHANNEL,
  ROUTER_MESSAGE_TYPE,
} from '../../src/constants/transport.js';

// S6 Phase A link 3 guard (quest raft-snapshot-live-rebuild): the shared
// MessageRouterSetup (both bootstrap phases flow through it) instantiates
// the bulk transfer channel registry and attaches it to the router — so an
// inbound `channel: bulk` IDENTIFY is ADOPTED into the registry instead of
// warn-and-closed (the previously dead S3 link; reverting the setup
// attachment reds both assertions). Router shutdown closes the bulk lane.

const TEST_NODE_ID = 'bootstrap-bulk-node';
const TEST_NODE_ADDRESS = 'ws://bootstrap-bulk-node:7300';
const TEST_PEER_NODE_ID = 'bootstrap-bulk-peer';
const TEST_PEER_ADDRESS = 'ws://bootstrap-bulk-peer:7301';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: TEST_NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

async function flushDeliveries() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('a MessageRouterSetup-built router adopts a bulk IDENTIFY instead of ' +
  'warn-and-closing it', async (t) => {
  const router = await MessageRouterSetup.create({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
  });
  try {
    t.ok(router.bulkChannelRegistry,
      'precondition witness: the setup attached a bulk channel registry');
    t.equal(typeof router.bulkChannelRegistry.adoptIncomingSocket,
      'function',
      'the attached registry is the real bulk transfer channel registry');

    // The real inbound path: a second socket identifying `channel: bulk`.
    const bulk = createInProcWebSocketPair();
    router.handleIncomingConnection(bulk.b, null);
    bulk.a.send(JSON.stringify({
      type: ROUTER_MESSAGE_TYPE.IDENTIFY,
      nodeId: TEST_PEER_NODE_ID,
      nodeAddress: TEST_PEER_ADDRESS,
      address: TEST_PEER_ADDRESS,
      channel: ROUTER_IDENTIFY_CHANNEL.BULK,
      timestamp: Date.now(),
    }));
    await flushDeliveries();
    t.equal(router.bulkChannelRegistry.hasConnection(TEST_PEER_NODE_ID),
      true,
      'the bulk IDENTIFY is adopted into the registry, not warn-and-closed');
    t.equal(router.nodeConnections.size, 0,
      'the adopted bulk socket leaves no primary connection record behind');

    await router.shutdown();
    t.equal(router.bulkChannelRegistry.hasConnection(TEST_PEER_NODE_ID),
      false,
      'router shutdown closes the adopted bulk channel');
  } finally {
    await router.shutdown();
  }
});
