/**
 * Property test for Health Status Tracking (Property 11).
 *
 * Feature: worker-process-replica-isolation, Property 11: Health Status Tracking
 *
 * For any worker process managed by ReplicaWorkerManager, the manager SHALL
 * maintain a health status entry that is updated within the configured
 * health check interval.
 *
 * **Validates: Requirements 5.6**
 *
 * @module test/worker/health-status-tracking.property.test.js
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  ReplicaWorkerManager,
} from '../../src/worker/replica-worker-manager.js';
import {
  WORKER_HEALTH_STATUS,
  WORKER_ENTITY_TYPE,
} from '../../src/worker/worker-constants.js';

describe('Property 11: Health Status Tracking', () => {
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

  it('should maintain health status entry for each worker', async () => {
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

          const healthStatus = manager.getHealthStatus();

          assert.ok(healthStatus.has(replicaId), 'Health status should exist for worker');

          const status = healthStatus.get(replicaId);
          assert.ok(status.healthStatus, 'Health status should have healthStatus field');
          assert.ok(status.lastHealthCheck, 'Health status should have lastHealthCheck field');
        },
      ),
      {numRuns: 10},
    );
  });

  it('should set initial health status to HEALTHY after creation', async () => {
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

          const healthStatus = manager.getHealthStatus();
          const status = healthStatus.get(replicaId);

          assert.strictEqual(
            status.healthStatus,
            WORKER_HEALTH_STATUS.HEALTHY,
            'Initial health status should be HEALTHY',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should track health status for all workers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (nodeId, replicaIds) => {
          manager = createManager(nodeId);

          // Create multiple workers
          for (let i = 0; i < replicaIds.length; i++) {
            await manager.createPartitionReplica({
              partitionId: `partition-${i}`,
              replicaId: replicaIds[i],
            });
          }

          const healthStatus = manager.getHealthStatus();

          // Verify all workers have health status
          assert.strictEqual(
            healthStatus.size,
            replicaIds.length,
            'Health status should exist for all workers',
          );

          for (const replicaId of replicaIds) {
            assert.ok(
              healthStatus.has(replicaId),
              `Health status should exist for ${replicaId}`,
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should include entity type in health status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, groupId, replicaId) => {
          manager = createManager(nodeId);

          // Create partition replica
          await manager.createPartitionReplica({
            partitionId,
            replicaId: `${replicaId}-partition`,
          });

          // Create message group replica
          await manager.createMessageGroupReplica({
            groupId,
            replicaId: `${replicaId}-msggroup`,
          });

          const healthStatus = manager.getHealthStatus();

          const partitionStatus = healthStatus.get(`${replicaId}-partition`);
          const msgGroupStatus = healthStatus.get(`${replicaId}-msggroup`);

          assert.strictEqual(
            partitionStatus.entityType,
            WORKER_ENTITY_TYPE.PARTITION,
          );
          assert.strictEqual(
            msgGroupStatus.entityType,
            WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should include unified address in health status', async () => {
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

          const healthStatus = manager.getHealthStatus();
          const status = healthStatus.get(replicaId);

          const expectedAddress = `${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`;
          assert.strictEqual(
            status.unifiedAddress,
            expectedAddress,
            'Health status should include correct unified address',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should remove health status when worker is stopped', async () => {
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

          // Stop worker
          await manager.stopReplica(replicaId);

          // Verify health status is removed
          healthStatus = manager.getHealthStatus();
          assert.strictEqual(
            healthStatus.has(replicaId),
            false,
            'Health status should be removed after stop',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should report healthy and unhealthy counts in stats', async () => {
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

          const stats = manager.getStats();

          // All should be healthy initially
          assert.strictEqual(
            stats.healthyWorkers,
            replicaIds.length,
            'All workers should be healthy',
          );
          assert.strictEqual(
            stats.unhealthyWorkers,
            0,
            'No workers should be unhealthy',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should track creation timestamp in health status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (nodeId, partitionId, replicaId) => {
          const beforeCreate = Date.now();

          manager = createManager(nodeId);

          await manager.createPartitionReplica({
            partitionId,
            replicaId,
          });

          const afterCreate = Date.now();

          const healthStatus = manager.getHealthStatus();
          const status = healthStatus.get(replicaId);

          assert.ok(
            status.createdAt >= beforeCreate && status.createdAt <= afterCreate,
            'Creation timestamp should be within expected range',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
