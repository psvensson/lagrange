/**
 * Property test for SystemCacheProxy Replica Selection (Property 18).
 *
 * Feature: worker-process-replica-isolation, Property 18: SystemCacheProxy Replica Selection
 *
 * For any SystemCacheProxy, the proxy SHALL use the same local message group
 * replica for queries until the set of local replicas changes.
 *
 * **Validates: Requirements 9.3, 9.4**
 *
 * @module test/cache/system-cache-proxy-replica-selection.property.test.js
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  SystemCacheProxy,
} from '../../src/cache/system-cache-proxy.js';
import {
  CACHE_MESSAGE_TYPE,
  WORKER_ENTITY_TYPE,
  WORKER_HEALTH_STATUS,
} from '../../src/worker/worker-constants.js';

describe('Property 18: SystemCacheProxy Replica Selection', () => {
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
   * Create a mock worker manager with configurable replicas.
   * @param {Array<string>} initialReplicaIds - Initial replica IDs.
   * @return {Object} Mock worker manager with mutable replica list.
   */
  function createMockWorkerManager(initialReplicaIds) {
    let currentReplicaIds = [...initialReplicaIds];
    const deliveredTo = [];

    return {
      replicaIds: currentReplicaIds,
      deliveredTo,
      setReplicaIds: (newIds) => {
        currentReplicaIds = [...newIds];
      },
      getWorkersByType: mock.fn((entityType) => {
        if (entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP) {
          return currentReplicaIds.map((replicaId) => ({
            replicaId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            status: 'running',
          }));
        }
        return [];
      }),
      getWorker: mock.fn((replicaId) => {
        if (currentReplicaIds.includes(replicaId)) {
          return {
            replicaId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            healthStatus: WORKER_HEALTH_STATUS.HEALTHY,
          };
        }
        return undefined;
      }),
      deliverMessage: mock.fn(async (replicaId, _message) => {
        deliveredTo.push(replicaId);
        return {
          type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
          data: {replicaId},
        };
      }),
      on: mock.fn(() => {}),
      removeListener: mock.fn(() => {}),
    };
  }

  it('should use same replica for consecutive queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.integer({min: 3, max: 10}),
        async (replicaIds, queryCount) => {
          const mockWorkerManager = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Make multiple queries
          for (let i = 0; i < queryCount; i++) {
            await proxy.get('test_table', `key_${i}`);
          }

          // All queries should go to the same replica
          const uniqueTargets = new Set(mockWorkerManager.deliveredTo);
          assert.strictEqual(
            uniqueTargets.size,
            1,
            'All queries should go to the same replica',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should select first available replica initially', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (replicaIds) => {
          const mockWorkerManager = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Selected replica should be one of the available replicas
          const selectedId = proxy.getSelectedReplicaId();
          assert.ok(
            replicaIds.includes(selectedId),
            'Selected replica should be from available replicas',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should keep same replica when set unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (replicaIds) => {
          const mockWorkerManager = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const initialSelection = proxy.getSelectedReplicaId();

          // Re-select — selection should remain stable
          proxy.selectLocalReplica();

          // Selection should remain the same
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            initialSelection,
            'Selection should not change when replica set is unchanged',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should reselect when current replica is removed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (replicaIds) => {
          const mockWorkerManager = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const initialSelection = proxy.getSelectedReplicaId();

          // Remove the currently selected replica via event
          const remainingReplicas = replicaIds.filter(
            (id) => id !== initialSelection,
          );
          mockWorkerManager.setReplicaIds(remainingReplicas);

          // Use event-driven removal
          proxy.handleReplicaStopped({
            replicaId: initialSelection,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // New selection should be from remaining replicas
          const newSelection = proxy.getSelectedReplicaId();
          assert.ok(
            remainingReplicas.includes(newSelection),
            'New selection should be from remaining replicas',
          );
          assert.notStrictEqual(
            newSelection,
            initialSelection,
            'Selection should change when current replica is removed',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should keep same replica when other replicas are added', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 3}),
        async (initialReplicas, newReplicas) => {
          // Ensure no overlap
          const filteredNew = newReplicas.filter(
            (id) => !initialReplicas.includes(id),
          );
          if (filteredNew.length === 0) {
            return; // Skip if no new unique replicas
          }

          const mockWorkerManager = createMockWorkerManager(initialReplicas);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const initialSelection = proxy.getSelectedReplicaId();

          // Add new replicas via events
          mockWorkerManager.setReplicaIds(
            [...initialReplicas, ...filteredNew],
          );
          for (const id of filteredNew) {
            proxy.handleReplicaCreated({
              replicaId: id,
              entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            });
          }

          // Selection should remain the same
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            initialSelection,
            'Selection should not change when current replica is ' +
            'still available',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should handle empty replica set gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 3}),
        async (initialReplicas) => {
          const mockWorkerManager = createMockWorkerManager(initialReplicas);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Remove all replicas via events
          mockWorkerManager.setReplicaIds([]);
          for (const id of initialReplicas) {
            proxy.handleReplicaStopped({
              replicaId: id,
              entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            });
          }

          // Selection should be null
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            null,
            'Selection should be null when no replicas available',
          );

          // Query should throw
          try {
            await proxy.get('test_table', 'key');
            assert.fail('Should throw when no replicas available');
          } catch (error) {
            assert.ok(
              error.message.includes(
                'No local message group replica',
              ),
              'Error should indicate no replica available',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('should track local replica count correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (replicaIds) => {
          const mockWorkerManager = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          assert.strictEqual(
            proxy.getLocalReplicaCount(),
            replicaIds.length,
            'Local replica count should match available replicas',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
