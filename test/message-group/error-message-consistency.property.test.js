/**
 * Property-based test for Error Message Consistency.
 * Property 3: For any transport unavailability error thrown by MessageGroupService,
 * the error message SHALL contain "WebSocket transport" to clearly indicate
 * the transport requirement.
 * Validates: Requirements 4.1, 4.2
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 27000;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
}


/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 3: Error Message Consistency
 * Message delivery error should contain "WebSocket transport required but not available".
 * Validates: Requirements 4.1
 */
test('Property 3: Error Message Consistency - delivery error message', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      fc.string({minLength: 5, maxLength: 30}),
      fc.record({
        type: fc.string({minLength: 1, maxLength: 20}),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      async (groupId, replicaId, targetService, payload) => {
        const {router, nodeId, cleanup} = await createTestTransport();
        try {
          const service = new MessageGroupService({
            groupId,
            replicaId,
            nodeId,
            transport: router,
          });

          await service.initialize();

          try {
            // Forcibly set transport to null to simulate runtime unavailability
            service.transport = null;

            let errorMessage = '';
            try {
              await service.sendMessage(targetService, payload);
            } catch (error) {
              errorMessage = error.message;
            }

            // Property: Error message should match exact requirement 4.1
            t.equal(
              errorMessage,
              'WebSocket transport required but not available',
              'Delivery error should have exact message from requirement 4.1',
            );

            // Also verify it contains "WebSocket transport"
            t.ok(
              errorMessage.includes('WebSocket transport'),
              'Error message should contain "WebSocket transport"',
            );
          } finally {
            service.transport = router;
            await service.shutdown();
          }
        } finally {
          await cleanup();
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 3: Error Message Consistency
 * Constructor should reject non-WebSocket transports with clear error message.
 * Validates: Requirements 4.2
 *
 * Note: With liferaft integration, Raft consensus is handled internally by the library.
 * The transport validation now happens at construction time, not during elections.
 */
test('Property 3: Error Message Consistency - constructor transport validation', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        // Test with null transport
        let errorMessage = '';
        try {
          new MessageGroupService({
            groupId,
            replicaId,
            nodeId: 'test-node',
            transport: null,
          });
        } catch (error) {
          errorMessage = error.message;
        }

        // Property: Error message should indicate WebSocket transport is required
        t.ok(
          errorMessage.includes('transport'),
          'Constructor error should mention transport',
        );

        t.ok(
          errorMessage.includes('WebSocket'),
          'Constructor error should mention WebSocket',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});


/**
 * Feature: remove-inmemory-transport-from-message-groups
 * Property 3: Error Message Consistency
 * All transport unavailability errors should contain "WebSocket transport".
 * Validates: Requirements 4.1, 4.2
 */
test('Property 3: Error Message Consistency - errors contain WebSocket transport', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      async (groupId, replicaId) => {
        const {router, nodeId, cleanup} = await createTestTransport();
        try {
          const service = new MessageGroupService({
            groupId,
            replicaId,
            nodeId,
            replicaIds: [replicaId],
            transport: router,
          });

          await service.initialize();

          try {
            // Forcibly set transport to null
            service.transport = null;

            let errorMessage = '';
            try {
              await service.sendMessage('target-service', {test: true});
            } catch (error) {
              errorMessage = error.message;
            }

            // Property: All transport errors should contain "WebSocket transport"
            t.ok(
              errorMessage.includes('WebSocket transport'),
              `delivery error should contain "WebSocket transport", got: ${errorMessage}`,
            );

            // Property: All transport errors should indicate requirement
            t.ok(
              errorMessage.includes('required'),
              `delivery error should indicate requirement, got: ${errorMessage}`,
            );
          } finally {
            service.transport = router;
            if (service.initialized) {
              await service.shutdown();
            }
          }
        } finally {
          await cleanup();
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});
