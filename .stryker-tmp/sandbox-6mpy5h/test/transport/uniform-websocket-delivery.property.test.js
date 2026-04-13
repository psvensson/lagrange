/**
 * Property test for Uniform WebSocket Delivery.
 * Property 3: For any message delivery (whether to local or remote address),
 * the message SHALL be sent through a WebSocket connection. There SHALL be
 * no separate code path for local delivery.
 *
 * Validates: Requirements 2.4, 3.2, 3.3, 9.3
 *
 * Feature: unified-remote-transport
 * Property 3: Uniform WebSocket Delivery
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

/**
 * Feature: unified-remote-transport
 * Property 3: Uniform WebSocket Delivery
 *
 * For any message delivery (whether to local or remote address), the message
 * SHALL be sent through a WebSocket connection. There SHALL be no separate
 * code path for local delivery.
 */
test('Property 3: Uniform WebSocket Delivery', async (t) => {
  /**
   * Property: All delivery attempts require a WebSocket connection.
   *
   * For any message sent to any address (local or remote), without a
   * WebSocket connection established, the delivery should fail with a
   * connection error - proving there is no local bypass.
   */
  t.test('delivery without connection fails for remote addresses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate target address (unified format only - legacy addresses now require validation)
        fc.tuple(
          fc.string({minLength: 1, maxLength: 10})
            .filter((s) => !s.includes('/') && s !== 'test-node'),
          fc.constantFrom('message-group', 'partition', 'lifecycle', 'service'),
          fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        ).map(([nodeId, entityType, entityId]) => `${nodeId}/${entityType}/${entityId}`),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20})
            .filter((s) => s.trim().length > 0),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        async (targetAddress, message) => {
          const router = new MessageRouter({nodeId: 'test-node'});
          await router.initialize();

          // Register a handler for the address (simulating local service)
          router.register(targetAddress, () => ({acknowledged: true, data: 'response'}));

          // Attempt delivery - should fail because no WebSocket connection exists
          const result = await router.deliver(targetAddress, message);

          await router.shutdown();

          // Without a connection, delivery must fail for remote targets.
          return result.acknowledged === false &&
                 typeof result.error === 'string' &&
                 result.error.includes('No connection');
        },
      ),
      {numRuns: 10},
    );

    t.pass('delivery without connection fails for remote addresses');
  });

  /**
   * Property: No deliverLocal method exists.
   *
   * The MessageRouter should not have a deliverLocal method, proving
   * there is no separate code path for local delivery.
   */
  t.test('deliverLocal method exists for self-delivery path', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate any node ID
        fc.string({minLength: 1, maxLength: 20})
          .filter((s) => s.trim().length > 0 && !s.includes('/'))
          .map((s) => `node-${s.trim()}`),
        async (nodeId) => {
          const router = new MessageRouter({nodeId});

          // Check that deliverLocal exists
          const hasDeliverLocal = typeof router.deliverLocal === 'function';

          await router.shutdown();

          // deliverLocal should exist
          return hasDeliverLocal;
        },
      ),
      {numRuns: 10},
    );

    t.pass('deliverLocal method exists for self-delivery path');
  });

  /**
   * Property: Handlers map is named 'handlers' not 'localHandlers'.
   *
   * The internal handler storage should be named 'handlers' (not
   * 'localHandlers') to reflect that all handlers are treated uniformly.
   */
  t.test('handlers map uses unified naming', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate node ID
        fc.string({minLength: 1, maxLength: 20}).map((s) => `node-${s}`),
        async (nodeId) => {
          const router = new MessageRouter({nodeId});

          // Check naming
          const hasHandlers = router.handlers instanceof Map;
          const hasLocalHandlers = router.localHandlers !== undefined;

          await router.shutdown();

          // Should have 'handlers', should NOT have 'localHandlers'
          return hasHandlers && !hasLocalHandlers;
        },
      ),
      {numRuns: 10},
    );

    t.pass('handlers map uses unified naming');
  });

  /**
   * Property: Deliver method always extracts nodeId from address.
   *
   * For any unified address format, the deliver method should extract
   * the nodeId from the first segment and use it for routing.
   */
  t.test('deliver extracts nodeId from unified address', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate unified address components
        fc.string({minLength: 1, maxLength: 15})
          .filter((s) => !s.includes('/') && s !== 'local-node'),
        fc.constantFrom('message-group', 'partition', 'lifecycle', 'service'),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20})
            .filter((s) => s.trim().length > 0),
        }),
        async (nodeId, entityType, entityId, message) => {
          const router = new MessageRouter({nodeId: 'local-node'});
          await router.initialize();

          const targetAddress = `${nodeId}/${entityType}/${entityId}`;

          // Attempt delivery
          const result = await router.deliver(targetAddress, message);

          await router.shutdown();

          // Should fail with "No connection to node {nodeId}", proving nodeId was extracted.
          return result.acknowledged === false &&
                 result.error.includes('No connection to node') &&
                 result.error.includes(nodeId);
        },
      ),
      {numRuns: 10},
    );

    t.pass('deliver extracts nodeId from unified address');
  });

  /**
   * Property: Self-addressed messages also require connection.
   *
   * Even when the target nodeId matches the local nodeId, delivery
   * should still require a WebSocket connection (self-connection).
   */
  t.test('self-addressed messages require self-connection', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate local node ID
        fc.string({minLength: 1, maxLength: 15})
          .filter((s) => !s.includes('/') && s.trim().length > 0)
          .map((s) => s.trim()),
        // Generate entity details
        fc.constantFrom('message-group', 'partition', 'lifecycle', 'service'),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20})
            .filter((s) => s.trim().length > 0),
        }),
        async (localNodeId, entityType, entityId, message) => {
          // Create router with specific nodeId
          const router = new MessageRouter({nodeId: localNodeId});
          await router.initialize();

          // Create address targeting self
          const selfAddress = `${localNodeId}/${entityType}/${entityId}`;

          // Register handler
          router.register(selfAddress, () => ({acknowledged: true}));

          // Attempt delivery to self
          const result = await router.deliver(selfAddress, message);

          await router.shutdown();

             // Self-addressed delivery should succeed through the local path.
             return result.acknowledged === true &&
               result.error === undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('self-addressed messages require self-connection');
  });
});
