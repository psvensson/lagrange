/**
 * Property test for Manager-Based Registration (Property 20).
 *
 * Feature: worker-process-replica-isolation, Property 20: Manager-Based Registration
 *
 * For any worker replica created by ReplicaWorkerManager, the manager SHALL
 * register a MessageRouter handler after successful creation, and the worker
 * SHALL NOT self-register.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3**
 *
 * @module test/worker/manager-based-registration.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_ENTITY_TYPE,
} from '../../src/worker/worker-constants.js';

describe('Property 20: Manager-Based Registration', () => {
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
    const registeredHandlers = new Map();

    const mockPool = {
      run: mock.fn(async () => ({workerId: 1, healthy: true})),
      destroy: mock.fn(async () => {}),
      on: mock.fn(),
    };

    const mockMessageRouter = {
      registerWorkerHandler: mock.fn((address, handler) => {
        registeredHandlers.set(address, handler);
      }),
      unregisterWorkerHandler: mock.fn((address) => {
        registeredHandlers.delete(address);
      }),
      hasWorkerHandler: mock.fn((address) => registeredHandlers.has(address)),
    };

    return {mockPool, mockMessageRouter, registeredHandlers};
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

  it('should register handler with MessageRouter after partition replica creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          const {mockPool, mockMessageRouter} = createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createPartitionReplica({
              partitionId,
              replicaId,
            });

            // Verify registerWorkerHandler was called
            assert.strictEqual(
              mockMessageRouter.registerWorkerHandler.mock.calls.length,
              1,
              'registerWorkerHandler should be called exactly once',
            );

            // Verify correct address was registered
            const expectedAddress =
              `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
            const call = mockMessageRouter.registerWorkerHandler.mock.calls[0];
            assert.strictEqual(
              call.arguments[0],
              expectedAddress,
              'Handler should be registered with correct unified address',
            );

            // Verify handler is a function
            assert.strictEqual(
              typeof call.arguments[1],
              'function',
              'Handler should be a function',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should register handler with MessageRouter after message group creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, groupId, replicaId) => {
          const {mockPool, mockMessageRouter} = createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createMessageGroupReplica({
              groupId,
              replicaId,
            });

            // Verify registerWorkerHandler was called
            assert.strictEqual(
              mockMessageRouter.registerWorkerHandler.mock.calls.length,
              1,
              'registerWorkerHandler should be called exactly once',
            );

            // Verify correct address was registered
            const expectedAddress =
              `${nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`;
            const call = mockMessageRouter.registerWorkerHandler.mock.calls[0];
            assert.strictEqual(
              call.arguments[0],
              expectedAddress,
              'Handler should be registered with correct unified address',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should unregister handler when replica is stopped', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          const {mockPool, mockMessageRouter, registeredHandlers} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createPartitionReplica({
              partitionId,
              replicaId,
            });

            const expectedAddress =
              `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;

            // Verify handler is registered
            assert.ok(
              registeredHandlers.has(expectedAddress),
              'Handler should be registered after creation',
            );

            // Stop the replica
            await manager.stopReplica(replicaId);

            // Verify unregisterWorkerHandler was called
            assert.strictEqual(
              mockMessageRouter.unregisterWorkerHandler.mock.calls.length,
              1,
              'unregisterWorkerHandler should be called exactly once',
            );

            // Verify correct address was unregistered
            const call =
              mockMessageRouter.unregisterWorkerHandler.mock.calls[0];
            assert.strictEqual(
              call.arguments[0],
              expectedAddress,
              'Handler should be unregistered with correct unified address',
            );

            // Verify handler is removed from map
            assert.ok(
              !registeredHandlers.has(expectedAddress),
              'Handler should be removed after stop',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should unregister handler when worker crashes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          const {mockPool, mockMessageRouter, registeredHandlers} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createPartitionReplica({
              partitionId,
              replicaId,
            });

            const expectedAddress =
              `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;

            // Verify handler is registered
            assert.ok(
              registeredHandlers.has(expectedAddress),
              'Handler should be registered after creation',
            );

            // Simulate crash
            manager.handleWorkerCrash(replicaId, new Error('Simulated crash'));

            // Verify unregisterWorkerHandler was called
            assert.strictEqual(
              mockMessageRouter.unregisterWorkerHandler.mock.calls.length,
              1,
              'unregisterWorkerHandler should be called on crash',
            );

            // Verify handler is removed from map
            assert.ok(
              !registeredHandlers.has(expectedAddress),
              'Handler should be removed after crash',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should register unique handlers for multiple replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          const {mockPool, mockMessageRouter, registeredHandlers} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            // Create multiple replicas with unique IDs
            for (let i = 0; i < replicaIds.length; i++) {
              await manager.createPartitionReplica({
                partitionId: `partition-${i}`,
                replicaId: replicaIds[i],
              });
            }

            // Verify each replica has a registered handler
            assert.strictEqual(
              registeredHandlers.size,
              replicaIds.length,
              'Each replica should have a registered handler',
            );

            // Verify each address is unique
            for (const replicaId of replicaIds) {
              const expectedAddress =
                `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
              assert.ok(
                registeredHandlers.has(expectedAddress),
                `Handler for ${replicaId} should be registered`,
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

  it('should forward messages via deliverMessage when handler is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.record({
          type: fc.string(),
          payload: fc.string(),
        }),
        async (nodeId, partitionId, replicaId, testMessage) => {
          const {mockPool, mockMessageRouter, registeredHandlers} =
            createFreshMocks();
          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            await manager.createPartitionReplica({
              partitionId,
              replicaId,
            });

            const expectedAddress =
              `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;

            // Get the registered handler
            const handler = registeredHandlers.get(expectedAddress);
            assert.ok(handler, 'Handler should be registered');

            // Handlers receive router envelopes and forward envelope.payload.
            const testEnvelope = {
              messageId: 'msg-test',
              payload: testMessage,
            };
            await handler(testEnvelope);

            // Verify pool.run was called with DELIVER_MESSAGE operation
            const deliverCalls = mockPool.run.mock.calls.filter(
              (call) => call.arguments[0].operation === 'DELIVER_MESSAGE',
            );

            assert.strictEqual(
              deliverCalls.length,
              1,
              'deliverMessage should be called via pool.run',
            );

            // Verify the message was passed correctly
            const deliverCall = deliverCalls[0];
            assert.strictEqual(
              deliverCall.arguments[0].replicaId,
              replicaId,
              'Message should be delivered to correct replica',
            );
            assert.deepStrictEqual(
              deliverCall.arguments[0].message,
              testMessage,
              'Envelope payload should be preserved',
            );
          } finally {
            cleanupManager(manager);
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should not register handler if replica creation fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          const {mockPool, mockMessageRouter, registeredHandlers} =
            createFreshMocks();

          // Make pool.run fail
          mockPool.run = mock.fn(async () => {
            throw new Error('Simulated creation failure');
          });

          const manager = createManager(nodeId, mockPool, mockMessageRouter);

          try {
            // Attempt to create replica (should fail)
            try {
              await manager.createPartitionReplica({
                partitionId,
                replicaId,
              });
              assert.fail('Should have thrown an error');
            } catch (_error) {
              // Expected
            }

            // Verify registerWorkerHandler was NOT called
            assert.strictEqual(
              mockMessageRouter.registerWorkerHandler.mock.calls.length,
              0,
              'registerWorkerHandler should not be called on failure',
            );

            // Verify no handlers are registered
            assert.strictEqual(
              registeredHandlers.size,
              0,
              'No handlers should be registered after failure',
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
