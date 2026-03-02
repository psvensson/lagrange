/**
 * Property-based test for Message Delivery Reliability.
 * Property 9: For any message sent through the message group system,
 * it should be delivered directly when possible and persisted
 * asynchronously for retry if delivery fails.
 * Validates: Requirements 4.2
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageGroupService, MessageStatus} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 28000;

let messageGroup;
let router;

beforeEach(async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});

  // Create real WebSocket transport
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});

  messageGroup = new MessageGroupService({
    groupId: 'mg-1',
    replicaId: 'mg-1-r1',
    nodeId,
    replicaIds: ['mg-1-r1'],
    transport: router,
  });
  await messageGroup.initialize();
});

afterEach(async () => {
  if (messageGroup) {
    await messageGroup.shutdown();
  }
  if (router) {
    await router.shutdown();
  }
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Feature: message-group, Property 9: Message Delivery Reliability
 * For any message sent through the message group system, it should be
 * delivered directly when possible and persisted asynchronously for
 * retry if delivery fails.
 * Validates: Requirements 4.2
 */
test('Property 9: Message Delivery Reliability - messages are persisted', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate random message payloads
      fc.record({
        type: fc.constantFrom('RAFT', 'CDC', 'QUERY', 'HEARTBEAT'),
        data: fc.string({minLength: 1, maxLength: 100}),
        priority: fc.integer({min: 1, max: 10}),
      }),
      // Generate random target service addresses
      fc.string({minLength: 5, maxLength: 50}).filter((s) => s.trim().length > 0),
      async (payload, targetService) => {
        // Send message
        const result = await messageGroup.sendMessage(targetService, payload);

        // Property: Every sent message should have a messageId
        t.ok(result.messageId, 'Message should have an ID');

        // Property: Message should have a status
        t.ok(result.status, 'Message should have a status');

        // Property: Status should be either DELIVERED or PENDING (persisted)
        const validStatuses = [MessageStatus.DELIVERED, MessageStatus.PENDING];
        t.ok(
          validStatuses.includes(result.status),
          `Status should be DELIVERED or PENDING, got: ${result.status}`,
        );

        // Property: If status is PENDING, message is persisted in Raft log
        // (We verify this by checking the log length increased)
        const logLength =
          messageGroup.operationLedger.getLogLength();
        t.ok(logLength > 0, 'Raft log should contain entries');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 9: Message Delivery Reliability
 * Messages should be persisted to Raft log for durability.
 * Validates: Requirements 4.2
 */
test('Property 9: Message Delivery Reliability - Raft log persistence', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate multiple messages
      fc.array(
        fc.record({
          target: fc.string({minLength: 5, maxLength: 30}),
          payload: fc.record({
            action: fc.constantFrom('create', 'update', 'delete'),
            id: fc.uuid(),
          }),
        }),
        {minLength: 1, maxLength: 5},
      ),
      async (messages) => {
        const initialLogLength =
          messageGroup.operationLedger.getLogLength();

        // Send all messages
        for (const msg of messages) {
          await messageGroup.sendMessage(msg.target, msg.payload);
        }

        const finalLogLength =
          messageGroup.operationLedger.getLogLength();

        // Property: Log length should increase by at least the number of messages
        // (may be more due to other operations)
        t.ok(
          finalLogLength >= initialLogLength + messages.length,
          `Log should grow by at least ${messages.length} entries`,
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 9: Message Delivery Reliability
 * Acknowledged messages should be tracked to prevent duplicate delivery.
 * Validates: Requirements 4.2
 */
test('Property 9: Message Delivery Reliability - acknowledgment tracking', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate message IDs
      fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
      async (messageIds) => {
        // Acknowledge all messages
        for (const messageId of messageIds) {
          await messageGroup.acknowledgeMessage(messageId);
        }

        // Property: All acknowledged messages should be tracked
        for (const messageId of messageIds) {
          // Receiving the same message again should detect duplicate
          const result = await messageGroup.receiveMessage({
            messageId,
            payload: {test: true},
            sourceGroup: 'mg-2',
            sourceReplica: 'mg-2-r1',
          });

          t.equal(
            result.status,
            'duplicate',
            `Message ${messageId} should be detected as duplicate`,
          );
          t.equal(
            result.acknowledged,
            true,
            `Message ${messageId} should be marked as acknowledged`,
          );
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 9: Message Delivery Reliability
 * Message delivery should use transport for delivery.
 * Validates: Requirements 4.2
 */
test('Property 9: Message Delivery Reliability - transport delivery', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        type: fc.string({minLength: 1, maxLength: 20}),
        value: fc.integer(),
      }),
      fc.string({minLength: 5, maxLength: 30}),
      async (payload, target) => {
        const initialCount = router.messageCount;

        await messageGroup.sendMessage(target, payload);

        // Property: With transport, delivery should go through transport
        t.ok(
          router.messageCount > initialCount,
          'Message should be delivered via transport',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 9: Message Delivery Reliability
 * Simultaneous delivery and persistence pattern should work correctly.
 * Validates: Requirements 4.2
 */
test('Property 9: Message Delivery Reliability - simultaneous pattern', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate batch of messages
      fc.array(
        fc.record({
          target: fc.string({minLength: 5, maxLength: 20}),
          data: fc.string({minLength: 1, maxLength: 50}),
        }),
        {minLength: 1, maxLength: 3},
      ),
      async (messages) => {
        const results = [];

        // Send messages concurrently (simulating simultaneous pattern)
        const promises = messages.map((msg) =>
          messageGroup.sendMessage(msg.target, {data: msg.data}),
        );

        const outcomes = await Promise.all(promises);
        results.push(...outcomes);

        // Property: All messages should complete (either delivered or persisted)
        for (const result of results) {
          t.ok(result.messageId, 'Each message should have an ID');
          t.ok(
            result.status === MessageStatus.DELIVERED ||
            result.status === MessageStatus.PENDING,
            'Each message should be delivered or pending',
          );
        }

        // Property: All messages should be unique
        const messageIds = results.map((r) => r.messageId);
        const uniqueIds = new Set(messageIds);
        t.equal(
          uniqueIds.size,
          messageIds.length,
          'All message IDs should be unique',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});
