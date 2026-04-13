/**
 * Property-based test for No Silent Delivery Failures.
 * Property 2: For any message delivery attempt when transport is null or
 * unavailable, the MessageGroupService SHALL throw an error rather than
 * silently skipping delivery or emitting local events.
 * Validates: Requirements 4.3, 1.3
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 31000;

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
 * Property 2: No Silent Delivery Failures
 * When transport is set to null after construction, delivery should throw.
 * Validates: Requirements 4.3, 1.3
 */
test('Property 2: No Silent Delivery Failures - null transport throws', async (t) => {
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

            // Property: Attempting delivery with null transport should throw
            await t.rejects(
              service.sendMessage(targetService, payload),
              /WebSocket transport required but not available/,
              'Should throw error when transport is null',
            );
          } finally {
            // Restore transport for clean shutdown
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
 * Property 2: No Silent Delivery Failures
 * Error message should contain "WebSocket transport" for clarity.
 * Validates: Requirements 4.3, 1.3
 */
test('Property 2: No Silent Delivery Failures - error message clarity', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      fc.string({minLength: 5, maxLength: 30}),
      async (groupId, replicaId, targetService) => {
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
            // Forcibly set transport to null
            service.transport = null;

            let errorMessage = '';
            try {
              await service.sendMessage(targetService, {test: true});
            } catch (error) {
              errorMessage = error.message;
            }

            // Property: Error message should clearly indicate WebSocket requirement
            t.ok(
              errorMessage.includes('WebSocket transport'),
              `Error message should contain "WebSocket transport", got: ${errorMessage}`,
            );

            t.ok(
              errorMessage.includes('required') || errorMessage.includes('not available'),
              `Error message should indicate requirement, got: ${errorMessage}`,
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
 * Property 2: No Silent Delivery Failures
 * No 'message' event should be emitted when transport is unavailable.
 * Validates: Requirements 4.3, 1.3
 */
test('Property 2: No Silent Delivery Failures - no silent event emission', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.uuid(),
      fc.string({minLength: 5, maxLength: 30}),
      async (groupId, replicaId, targetService) => {
        const {router, nodeId, cleanup} = await createTestTransport();
        try {
          const service = new MessageGroupService({
            groupId,
            replicaId,
            nodeId,
            transport: router,
          });

          await service.initialize();

          let messageEventEmitted = false;
          service.on('message', () => {
            messageEventEmitted = true;
          });

          try {
            // Forcibly set transport to null
            service.transport = null;

            try {
              await service.sendMessage(targetService, {test: true});
            } catch (_error) {
              // Expected to throw
            }

            // Property: No 'message' event should be emitted as fallback
            t.equal(
              messageEventEmitted,
              false,
              'Should not emit message event when transport unavailable',
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
 * Property 2: No Silent Delivery Failures
 * Valid transport should deliver messages successfully.
 * Validates: Requirements 4.3, 1.3
 */
test('Property 2: No Silent Delivery Failures - valid transport works', async (t) => {
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
            const initialCount = router.messageCount;

            // Property: With valid transport, delivery should succeed
            const result = await service.sendMessage(targetService, payload);

            t.ok(result.messageId, 'Should return messageId');
            t.ok(result.status, 'Should return status');
            t.ok(
              router.messageCount > initialCount,
              'Transport should have received the message',
            );
          } finally {
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
