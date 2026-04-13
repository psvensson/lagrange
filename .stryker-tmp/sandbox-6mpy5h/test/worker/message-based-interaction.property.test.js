/**
 * Property test for Message-Based Interaction (Property 19).
 *
 * Feature: worker-process-replica-isolation, Property 19: Message-Based Interaction
 *
 * For any interaction between the main process and a worker replica, the
 * interaction SHALL use message-based communication via deliverMessage(),
 * not direct method calls.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * @module test/worker/message-based-interaction.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_OPERATION,
  LEADERSHIP_MESSAGE_TYPE,
  CACHE_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';

describe('Property 19: Message-Based Interaction', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };
  });

  afterEach(async () => {
    // Cleanup handled within each test
  });

  /**
   * Create fresh mocks for each property test iteration.
   * @return {Object} Fresh mock objects.
   */
  function createFreshMocks() {
    const deliveredMessages = [];

    const mockPool = {
      run: mock.fn(async (operation) => {
        if (operation.operation === WORKER_OPERATION.DELIVER_MESSAGE) {
          deliveredMessages.push(operation.message);
          // Return appropriate response based on message type
          const msg = operation.message;
          if (msg.type === LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS) {
            return {
              type: LEADERSHIP_MESSAGE_TYPE.LEADERSHIP_STATUS,
              isLeader: true,
              term: 1,
              leaderId: operation.replicaId,
            };
          }
          if (msg.type === CACHE_MESSAGE_TYPE.CACHE_GET) {
            return {
              type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
              data: {id: msg.key},
            };
          }
          return {status: 'ok'};
        }
        return {workerId: 1, healthy: true};
      }),
      destroy: mock.fn(async () => {}),
      on: mock.fn(),
    };

    const mockMessageRouter = {
      registerWorkerHandler: mock.fn(),
      unregisterWorkerHandler: mock.fn(),
    };

    return {mockPool, mockMessageRouter, deliveredMessages};
  }

  /**
   * Create and initialize a manager with mock pool.
   * @param {string} nodeId - Node ID.
   * @param {Object} mockPool - Mock pool.
   * @param {Object} mockMessageRouter - Mock message router.
   * @return {ReplicaWorkerManager}
   */
  function createManager(nodeId, mockPool, mockMessageRouter) {
    const mgr = new ReplicaWorkerManager({
      nodeId,
      messageRouter: mockMessageRouter,
      logger: mockLogger,
    });
    mgr.pool = mockPool;
    mgr.initialized = true;
    return mgr;
  }

  /**
   * Cleanup manager resources.
   * @param {ReplicaWorkerManager} manager - Manager to cleanup.
   */
  function cleanupManager(manager) {
    if (manager) {
      if (manager.healthCheckTimer) {
        clearInterval(manager.healthCheckTimer);
        manager.healthCheckTimer = null;
      }
      if (manager.pool) {
        manager.pool = null;
      }
      manager.initialized = false;
    }
  }

  it('should use deliverMessage for leadership status queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const {mockPool, mockMessageRouter, deliveredMessages} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Query leadership status
            await manager.getLeadershipStatus(replicaId);

            // Verify message was delivered via DELIVER_MESSAGE operation
            const deliverCalls = mockPool.run.mock.calls.filter(
              (call) => call.arguments[0].operation ===
                WORKER_OPERATION.DELIVER_MESSAGE,
            );

            assert.strictEqual(
              deliverCalls.length,
              1,
              'Leadership query should use DELIVER_MESSAGE',
            );

            // Verify message type
            assert.strictEqual(
              deliveredMessages[0].type,
              LEADERSHIP_MESSAGE_TYPE.GET_LEADERSHIP_STATUS,
              'Message type should be GET_LEADERSHIP_STATUS',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should use deliverMessage for all replica interactions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.record({
          type: fc.constantFrom(
            CACHE_MESSAGE_TYPE.CACHE_GET,
            CACHE_MESSAGE_TYPE.CACHE_QUERY,
            CACHE_MESSAGE_TYPE.CACHE_GET_ALL,
            CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
          ),
          tableName: fc.string({minLength: 1}),
          key: fc.string({minLength: 1}),
        }),
        async (nodeId, groupId, replicaId, testMessage) => {
          const {mockPool, mockMessageRouter, deliveredMessages} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Send arbitrary message
            await manager.deliverMessage(replicaId, testMessage);

            // Verify message was delivered via DELIVER_MESSAGE operation
            const deliverCalls = mockPool.run.mock.calls.filter(
              (call) => call.arguments[0].operation ===
                WORKER_OPERATION.DELIVER_MESSAGE,
            );

            assert.ok(
              deliverCalls.length >= 1,
              'Message should be delivered via DELIVER_MESSAGE',
            );

            // Verify the message was passed correctly
            assert.deepStrictEqual(
              deliveredMessages[deliveredMessages.length - 1],
              testMessage,
              'Message content should be preserved',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should not expose direct method access to worker services', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const {mockPool, mockMessageRouter} = createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            const handle = await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Verify handle does not expose service methods
            assert.ok(
              !handle.executeQuery,
              'Handle should not expose executeQuery method',
            );
            assert.ok(
              !handle.applyCDCEvent,
              'Handle should not expose applyCDCEvent method',
            );
            assert.ok(
              !handle.getSystemCache,
              'Handle should not expose getSystemCache method',
            );
            assert.ok(
              !handle.subscribeToCDC,
              'Handle should not expose subscribeToCDC method',
            );

            // Handle should only have metadata
            assert.ok(handle.replicaId, 'Handle should have replicaId');
            assert.ok(handle.entityType, 'Handle should have entityType');
            assert.ok(handle.unifiedAddress, 'Handle should have unifiedAddress');
            assert.ok(handle.status, 'Handle should have status');
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should route all messages through pool.run with DELIVER_MESSAGE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            type: fc.string({minLength: 1}),
            data: fc.string(),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (nodeId, groupId, replicaId, messages) => {
          const {mockPool, mockMessageRouter, deliveredMessages} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Send multiple messages
            for (const msg of messages) {
              await manager.deliverMessage(replicaId, msg);
            }

            // Verify all messages were delivered via DELIVER_MESSAGE
            assert.strictEqual(
              deliveredMessages.length,
              messages.length,
              'All messages should be delivered via DELIVER_MESSAGE',
            );

            // Verify each message was passed correctly
            for (let i = 0; i < messages.length; i++) {
              assert.deepStrictEqual(
                deliveredMessages[i],
                messages[i],
                `Message ${i} should be preserved`,
              );
            }
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should use message-based communication for CDC subscription', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.string({minLength: 1}),
        async (nodeId, groupId, replicaId, subscriberAddress) => {
          const {mockPool, mockMessageRouter, deliveredMessages} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Send CDC subscription message
            const subscribeMessage = {
              type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
              subscriberAddress,
            };

            await manager.deliverMessage(replicaId, subscribeMessage);

            // Verify message was delivered
            assert.ok(
              deliveredMessages.some(
                (msg) => msg.type === CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
              ),
              'CDC subscription should use message-based communication',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
