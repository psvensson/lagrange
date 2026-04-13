/**
 * Integration test for bidirectional WebSocket communication.
 *
 * This test verifies that when node A connects to node B,
 * node B can send messages back to node A using the same connection.
 *
 * This is the critical path for CREATE_REPLICA:
 * 1. Joining node connects to seed node
 * 2. Seed node sends CREATE_REPLICA to joining node via the incoming connection
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Wait for a condition with timeout.
 */
async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test('Bidirectional WebSocket communication', {timeout: 5000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('seed node can send to joining node via incoming connection', async (t) => {
    const seedNodeId = 'seed-node-bidir';
    const joiningNodeId = 'joining-node-bidir';
    const seedPort = 19900;
    const joiningPort = 19901;

    // Create seed node router (like bootstrap service)
    const seedRouter = new MessageRouter({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedPort}`,
      wsPort: seedPort,
    });

    // Set up resolver for seed node
    seedRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    // Create joining node router (like node joining service)
    const joiningRouter = new MessageRouter({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningPort}`,
      wsPort: joiningPort,
    });

    // Set up resolver for joining node
    joiningRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    try {
      // Start seed node server first (like bootstrap does)
      await seedRouter.initialize({startServer: true});

      // Start joining node server (like node joining does)
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register lifecycle handler on joining node
      const receivedMessages = [];
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (envelope) => {
        const message = envelope.payload || envelope;
        receivedMessages.push(message);
        return {
          acknowledged: true,
          request_id: message.request_id,
          status: 'initiated',
          replica_id: message.replica_id,
        };
      });

      // Joining node connects to seed node (like phaseConnectWebSocket)
      // This is the ONLY connection - joining node initiates
      await joiningRouter.connectToNode(seedNodeId, `ws://localhost:${seedPort}`);

      // Wait for connection to be established on joining node side
      const joiningConnected = await waitFor(() => {
        return joiningRouter.getConnectionState(seedNodeId) === 'connected';
      }, 2000);
      t.ok(joiningConnected, 'joining node should be connected to seed node');

      // Wait for seed node to receive and identify the incoming connection
      const seedHasConnection = await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      // Log connection states for debugging
      t.comment(`Seed node connection to ${joiningNodeId}: ` +
        `${seedRouter.getConnectionState(joiningNodeId)}`);
      t.comment(`Joining node connection to ${seedNodeId}: ` +
        `${joiningRouter.getConnectionState(seedNodeId)}`);
      t.comment(`Seed node connected nodes: ${JSON.stringify(seedRouter.getConnectedNodes())}`);

      t.ok(seedHasConnection, 'seed node should have connection to joining node');

      // Now seed node sends CREATE_REPLICA to joining node
      // This uses the INCOMING connection that joining node established
      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {
          type: 'CREATE_REPLICA',
          request_id: 'bidir-test-001',
          replica_id: 'bidir-replica-001',
        },
      );

      t.ok(result.acknowledged, 'message should be acknowledged');
      t.equal(result.request_id, 'bidir-test-001', 'should have correct request_id');
      t.equal(result.status, 'initiated', 'should have status initiated');

      // Verify message was received
      t.equal(receivedMessages.length, 1, 'joining node should receive one message');
      t.equal(receivedMessages[0].type, 'CREATE_REPLICA', 'should receive CREATE_REPLICA');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });

  t.test('MessageRouter routes to joining node via WebSocket', async (t) => {
    // This test mimics the actual production flow more closely
    const seedNodeId = 'seed-node-mgt';
    const joiningNodeId = 'joining-node-mgt';
    const seedPort = 19902;
    const joiningPort = 19903;

    // Create seed node router
    const seedRouter = new MessageRouter({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedPort}`,
      wsPort: seedPort,
    });
    seedRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    // Create joining node router
    const joiningRouter = new MessageRouter({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningPort}`,
      wsPort: joiningPort,
    });
    joiningRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    try {
      // Initialize routers
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register lifecycle handler on joining node's router
      const receivedMessages = [];
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (envelope) => {
        const message = envelope.payload || envelope;
        receivedMessages.push(message);
        return {
          acknowledged: true,
          request_id: message.request_id,
          status: 'initiated',
          replica_id: message.replica_id,
        };
      });

      // Joining node connects to seed node
      await joiningRouter.connectToNode(seedNodeId, `ws://localhost:${seedPort}`);

      // Wait for connections
      await waitFor(() => {
        return joiningRouter.getConnectionState(seedNodeId) === 'connected';
      }, 2000);
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      t.equal(
        seedRouter.getConnectionState(joiningNodeId),
        'connected',
        'seed should have connection to joining node',
      );

      // Send via MessageRouter directly (like partition service does)
      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {
          type: 'CREATE_REPLICA',
          request_id: 'mgt-test-001',
          replica_id: 'mgt-replica-001',
        },
      );

      t.ok(result.acknowledged, 'message should be acknowledged');
      t.equal(result.request_id, 'mgt-test-001', 'should have correct request_id');
      t.equal(result.status, 'initiated', 'should have status initiated');

      t.equal(receivedMessages.length, 1, 'joining node should receive one message');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });
});
