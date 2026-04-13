/**
 * Property test for Worker Process Isolation (Property 2).
 *
 * Feature: worker-process-replica-isolation, Property 2: Worker Process Isolation
 *
 * For any set of worker processes on the same node, a crash or state change
 * in one worker process SHALL NOT affect the memory state or operation of
 * other worker processes.
 *
 * **Validates: Requirements 1.4, 1.6, 2.3**
 *
 * @module test/worker/worker-process-isolation.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_STATUS,
  WORKER_HEALTH_STATUS,
} from '../../src/worker/worker-constants.js';

describe('Property 2: Worker Process Isolation', () => {
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

  it('should not affect other workers when one crashes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 3, maxLength: 5}),
        fc.integer({min: 0, max: 4}),
        async (nodeId, replicaIds, crashIndex) => {
          manager = createManager(nodeId);

          // Create multiple workers
          for (let i = 0; i < replicaIds.length; i++) {
            await manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId: replicaIds[i],
            });
          }

          // Get the index to crash (bounded by actual array length)
          const actualCrashIndex = crashIndex % replicaIds.length;
          const crashedReplicaId = replicaIds[actualCrashIndex];

          // Simulate crash of one worker
          manager.handleWorkerCrash(crashedReplicaId, new Error('Simulated crash'));

          // Verify crashed worker is removed
          assert.strictEqual(
            manager.getWorker(crashedReplicaId),
            undefined,
            'Crashed worker should be removed',
          );

          // Verify other workers are unaffected
          for (let i = 0; i < replicaIds.length; i++) {
            if (i !== actualCrashIndex) {
              const handle = manager.getWorker(replicaIds[i]);
              assert.ok(handle, `Worker ${replicaIds[i]} should still exist`);
              assert.strictEqual(
                handle.status,
                WORKER_STATUS.RUNNING,
                `Worker ${replicaIds[i]} should still be running`,
              );
              assert.strictEqual(
                handle.healthStatus,
                WORKER_HEALTH_STATUS.HEALTHY,
                `Worker ${replicaIds[i]} should still be healthy`,
              );
            }
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should maintain correct worker count after crash', async () => {
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

          const countBefore = manager.getWorkerCount();
          assert.strictEqual(countBefore, replicaIds.length);

          // Crash first worker
          manager.handleWorkerCrash(replicaIds[0], new Error('Crash'));

          // Count should decrease by exactly one
          assert.strictEqual(
            manager.getWorkerCount(),
            countBefore - 1,
            'Worker count should decrease by exactly one',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should allow operations on surviving workers after crash', async () => {
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

          // Crash first worker
          manager.handleWorkerCrash(replicaIds[0], new Error('Crash'));

          // Should be able to stop surviving workers
          for (let i = 1; i < replicaIds.length; i++) {
            await manager.stopReplica(replicaIds[i]);
          }

          assert.strictEqual(manager.getWorkerCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should allow creating new workers after crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, replicaId1, replicaId2) => {
          manager = createManager(nodeId);

          // Create first worker
          await manager.createPartitionReplica({
            partitionId: 'partition-1',
            replicaId: replicaId1,
          });

          // Crash it
          manager.handleWorkerCrash(replicaId1, new Error('Crash'));

          // Should be able to create new worker
          const handle = await manager.createPartitionReplica({
            partitionId: 'partition-2',
            replicaId: replicaId2,
          });

          assert.ok(handle);
          assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should isolate health status between workers', async () => {
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

          // Manually mark one as unhealthy
          const handle = manager.getWorker(replicaIds[0]);
          handle.healthStatus = WORKER_HEALTH_STATUS.UNHEALTHY;

          // Verify other workers remain healthy
          for (let i = 1; i < replicaIds.length; i++) {
            const otherHandle = manager.getWorker(replicaIds[i]);
            assert.strictEqual(
              otherHandle.healthStatus,
              WORKER_HEALTH_STATUS.HEALTHY,
              `Worker ${replicaIds[i]} should remain healthy`,
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle multiple sequential crashes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 3, maxLength: 5}),
        async (nodeId, replicaIds) => {
          manager = createManager(nodeId);

          // Create workers
          for (let i = 0; i < replicaIds.length; i++) {
            await manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId: replicaIds[i],
            });
          }

          // Crash workers one by one
          for (let i = 0; i < replicaIds.length - 1; i++) {
            manager.handleWorkerCrash(replicaIds[i], new Error(`Crash ${i}`));

            // Verify remaining workers are unaffected
            for (let j = i + 1; j < replicaIds.length; j++) {
              const handle = manager.getWorker(replicaIds[j]);
              assert.ok(handle, `Worker ${replicaIds[j]} should still exist`);
              assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
            }
          }

          // Only last worker should remain
          assert.strictEqual(manager.getWorkerCount(), 1);
          assert.ok(manager.getWorker(replicaIds[replicaIds.length - 1]));
        },
      ),
      {numRuns: 10},
    );
  });
});
