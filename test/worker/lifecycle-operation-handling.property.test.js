/**
 * Property test for Lifecycle Operation Handling (Property 10).
 *
 * Feature: worker-process-replica-isolation, Property 10: Lifecycle Operation Handling
 *
 * For any lifecycle operation (CREATE_REPLICA or STOP_REPLICA) sent to a
 * worker process, the worker SHALL complete the corresponding action
 * (initialize+register or shutdown+unregister) and return a success response.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
 *
 * @module test/worker/lifecycle-operation-handling.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_STATUS,
  WORKER_ENTITY_TYPE,
  WORKER_EVENT,
} from '../../src/worker/worker-constants.js';

describe('Property 10: Lifecycle Operation Handling', () => {
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

  it('should complete CREATE_REPLICA and return handle with RUNNING status', async () => {
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

          // Verify handle is returned with correct status
          assert.ok(handle, 'Handle should be returned');
          assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
          assert.strictEqual(handle.replicaId, replicaId);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should complete STOP_REPLICA and remove worker from tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          // Create replica first
          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          assert.ok(manager.getWorker(replicaId), 'Worker should exist before stop');

          // Stop replica
          await manager.stopReplica(replicaId);

          // Verify worker is removed
          assert.strictEqual(
            manager.getWorker(replicaId),
            undefined,
            'Worker should be removed after stop',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should emit REPLICA_CREATED event on successful creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_CREATED, (data) => events.push(data));

          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          assert.strictEqual(events.length, 1, 'Should emit exactly one event');
          assert.strictEqual(events[0].replicaId, replicaId);
          assert.strictEqual(events[0].entityType, WORKER_ENTITY_TYPE.PARTITION);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should emit REPLICA_STOPPED event on successful stop', async () => {
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

          const events = [];
          manager.on(WORKER_EVENT.REPLICA_STOPPED, (data) => events.push(data));

          await manager.stopReplica(replicaId);

          assert.strictEqual(events.length, 1, 'Should emit exactly one event');
          assert.strictEqual(events[0].replicaId, replicaId);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle create-stop-create cycle correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          manager = createManager(nodeId);

          // Create
          const handle1 = await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });
          assert.strictEqual(handle1.status, WORKER_STATUS.RUNNING);

          // Stop
          await manager.stopReplica(replicaId);
          assert.strictEqual(manager.getWorker(replicaId), undefined);

          // Create again with same ID
          const handle2 = await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });
          assert.strictEqual(handle2.status, WORKER_STATUS.RUNNING);
          assert.ok(manager.getWorker(replicaId));
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle multiple concurrent creates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          manager = createManager(nodeId);

          // Create all replicas concurrently
          const createPromises = replicaIds.map((replicaId, i) =>
            manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId,
            }),
          );

          const handles = await Promise.all(createPromises);

          // Verify all were created successfully
          assert.strictEqual(handles.length, replicaIds.length);
          for (const handle of handles) {
            assert.strictEqual(handle.status, WORKER_STATUS.RUNNING);
          }
          assert.strictEqual(manager.getWorkerCount(), replicaIds.length);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle multiple concurrent stops', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          manager = createManager(nodeId);

          // Create all replicas first
          for (let i = 0; i < replicaIds.length; i++) {
            await manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId: replicaIds[i],
            });
          }

          assert.strictEqual(manager.getWorkerCount(), replicaIds.length);

          // Stop all replicas concurrently
          const stopPromises = replicaIds.map((replicaId) =>
            manager.stopReplica(replicaId),
          );

          await Promise.all(stopPromises);

          // Verify all were stopped
          assert.strictEqual(manager.getWorkerCount(), 0);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should maintain correct worker count through lifecycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(
          fc.record({
            operation: fc.constantFrom('create', 'stop'),
            replicaId: fc.uuid(),
          }),
          {minLength: 1, maxLength: 10},
        ),
        async (nodeId, operations) => {
          manager = createManager(nodeId);

          const activeReplicas = new Set();
          let partitionCounter = 0;

          for (const op of operations) {
            if (op.operation === 'create' && !activeReplicas.has(op.replicaId)) {
              await manager.createPartitionReplica({
                partitionId: `partition-${partitionCounter++}`,
                replicaId: op.replicaId,
              });
              activeReplicas.add(op.replicaId);
            } else if (op.operation === 'stop' && activeReplicas.has(op.replicaId)) {
              await manager.stopReplica(op.replicaId);
              activeReplicas.delete(op.replicaId);
            }

            // Verify count matches expected
            assert.strictEqual(
              manager.getWorkerCount(),
              activeReplicas.size,
              'Worker count should match active replicas',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
