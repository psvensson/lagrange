/**
 * Integration test for CREATE_REPLICA ACK delivery via WebSocket.
 *
 * This test uses REAL WebSocket connections through MessageRouter to verify
 * that async handler results reach the caller as the flat SERVICE_RESPONSE
 * outcome, and that a slow handler times out after the transport ACK.
 *
 * CRITICAL: This test does NOT use InMemoryTransport - it uses actual WebSocket
 * connections to catch bugs like async handlers returning Promise objects.
 *
 * Requirements: 3.2, 3.3, 6.1, 6.2, 6.3, 6.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

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
 * Clean up test environment.
 */
async function cleanupTestEnvironment() {
  await LoggingService.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err));
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
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

test('WebSocket CREATE_REPLICA ACK delivery', {timeout: 10000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  t.test('flat ACK structure is preserved through WebSocket', async (t) => {
    const seedNodeId = 'seed-nested-ws';
    const joiningNodeId = 'joining-nested-ws';
    const seedPort = 19878;
    const joiningPort = 19879;

    const seedRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: seedNodeId,
      nodeAddress: `ws://127.0.0.1:${seedPort}`,
      wsPort: seedPort,
    });

    const joiningRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: joiningNodeId,
      nodeAddress: `ws://127.0.0.1:${joiningPort}`,
      wsPort: joiningPort,
    });

    try {
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are fully listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register handler that returns flat ACK structure
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (envelope) => {
        const message = envelope.payload || envelope;

        // Simulate async processing
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Return flat structure - ACK fields spread directly
        return {
          acknowledged: true,
          type: 'CREATE_REPLICA_ACK',
          request_id: message.request_id,
          status: 'initiated',
          replica_id: message.replica_id,
          node_id: joiningNodeId,
        };
      });

      await seedRouter.connectToNode(joiningNodeId, `ws://127.0.0.1:${joiningPort}`);
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      const requestId = 'nested-ws-request-001';
      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {
          type: 'CREATE_REPLICA',
          request_id: requestId,
          replica_id: 'nested-replica-001',
        },
        {targetNodeId: joiningNodeId},
      );

      t.ok(result.acknowledged, 'should be acknowledged');

      // With flat structure, ACK fields are directly on result
      // Handler's type is preserved as responseType
      t.equal(result.request_id, requestId, 'ACK should have correct request_id');
      t.equal(result.status, 'initiated', 'ACK should have status');
      t.equal(result.responseType, 'CREATE_REPLICA_ACK', 'ACK should have correct responseType');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });

  t.test('timeout occurs when handler does not return ACK data', async (t) => {
    const seedNodeId = 'seed-timeout-ws';
    const joiningNodeId = 'joining-timeout-ws';
    const seedPort = 19880;
    const joiningPort = 19881;

    const seedRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: seedNodeId,
      nodeAddress: `ws://127.0.0.1:${seedPort}`,
      wsPort: seedPort,
    });
    // Override timeout for this test
    seedRouter.messageTimeoutMs = 200;

    const joiningRouter = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: joiningNodeId,
      nodeAddress: `ws://127.0.0.1:${joiningPort}`,
      wsPort: joiningPort,
    });

    try {
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are fully listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register handler that takes too long
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (_envelope) => {
        // Simulate slow processing that exceeds timeout
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {acknowledged: true};
      });

      await seedRouter.connectToNode(joiningNodeId, `ws://127.0.0.1:${joiningPort}`);
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {type: 'CREATE_REPLICA', request_id: 'timeout-test'},
        {targetNodeId: joiningNodeId},
      );

      t.ok(result.acknowledged,
        'transport ACK should remain true even when response times out');
      t.ok(result.error, 'should have error');
      t.match(result.error, /timeout/i, 'error should mention timeout');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });
});
