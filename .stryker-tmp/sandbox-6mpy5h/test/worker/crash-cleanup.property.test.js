/**
 * Property test for Crash Cleanup (Property 16).
 *
 * Feature: worker-process-replica-isolation, Property 16: Crash Cleanup
 *
 * For any worker process crash detected by the main process, the associated
 * MessageRouter registration SHALL be removed within the crash handling sequence.
 *
 * **Validates: Requirements 8.4**
 *
 * @module test/worker/crash-cleanup.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_EVENT,
} from '../../src/worker/worker-constants.js';

describe('Property 16: Crash Cleanup', () => {
  let manager;
  let mockLogger;
  let mockPool;
  let mockMessageRouter;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    mockPool = {
      run: mock.fn(async () => ({workerId: 1, healthy: true})),
      destroy: mock.fn(async () => {}),
      on: mock.fn(),
    };

    mockMessageRouter = {
      registerWorkerHandler: mock.fn(),
      unregisterWorkerHandler: mock.fn(),
      hasWorkerHandler: mock.fn(() => false),
    };
  });

  afterEach(async () => {
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
    manager = null;
  });

  /**
   * Create and initialize a manager with mock pool.
   * @param {string} nodeId - Node ID.
   * @return {ReplicaWorkerManager}
   */
  function createManager(nodeId) {
    const mgr = new ReplicaWorkerManager({
      nodeId,
      messageRouter: mockMessageRouter,
      logger: mockLogger,
    });
    mgr.pool = mockPool;
    mgr.initialized = true;
    return mgr;
  }

  it('should remove worker from tracking on crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          // Verify worker exists
          assert.ok(manager.getWorker(replicaId));

          // Simulate crash
          manager.handleWorkerCrash(replicaId, new Error('Crash'));

          // Verify worker is removed (registration cleanup)
          assert.strictEqual(
            manager.getWorker(replicaId),
            undefined,
            'Worker should be removed from tracking',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should emit REPLICA_FAILED event on crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 100}),
        async (nodeId, partitionId, replicaId, errorMessage) => {
          manager = createManager(nodeId);

          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

          // Simulate crash
          manager.handleWorkerCrash(replicaId, new Error(errorMessage));

          // Verify event was emitted
          assert.strictEqual(events.length, 1, 'Should emit exactly one event');
          assert.strictEqual(events[0].replicaId, replicaId);
          assert.strictEqual(events[0].error, errorMessage);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should include unified address in failure event', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          const handle = await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          const expectedAddress = handle.unifiedAddress;

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

          manager.handleWorkerCrash(replicaId, new Error('Crash'));

          assert.strictEqual(
            events[0].unifiedAddress,
            expectedAddress,
            'Event should include unified address for MessageRouter cleanup',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should include entity type in failure event', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          const handle = await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          const expectedType = handle.entityType;

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

          manager.handleWorkerCrash(replicaId, new Error('Crash'));

          assert.strictEqual(
            events[0].entityType,
            expectedType,
            'Event should include entity type',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should remove from health status on crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          // Verify health status exists
          let healthStatus = manager.getHealthStatus();
          assert.ok(healthStatus.has(replicaId));

          // Simulate crash
          manager.handleWorkerCrash(replicaId, new Error('Crash'));

          // Verify health status is removed
          healthStatus = manager.getHealthStatus();
          assert.strictEqual(
            healthStatus.has(replicaId),
            false,
            'Health status should be removed on crash',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle crash of non-existent worker gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId) => {
          manager = createManager(nodeId);

          // Should not throw when crashing non-existent worker
          manager.handleWorkerCrash(replicaId, new Error('Crash'));

          // Manager should still be functional
          assert.strictEqual(manager.getWorkerCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should clean up all crashed workers in sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          manager = createManager(nodeId);

          // Create workers
          for (let i = 0; i < replicaIds.length; i++) {
            await manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId: replicaIds[i],
            });
          }

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_FAILED, (data) => events.push(data));

          // Crash all workers
          for (const replicaId of replicaIds) {
            manager.handleWorkerCrash(replicaId, new Error('Crash'));
          }

          // Verify all were cleaned up
          assert.strictEqual(manager.getWorkerCount(), 0);
          assert.strictEqual(events.length, replicaIds.length);

          // Verify each crash emitted an event
          for (const replicaId of replicaIds) {
            const event = events.find((e) => e.replicaId === replicaId);
            assert.ok(event, `Event should be emitted for ${replicaId}`);
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
