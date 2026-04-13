/**
 * Property test for SystemCacheProxy partition event filtering.
 *
 * Feature: message-group-resilient-proxy
 * Property 5: Partition replica events are ignored
 *
 * For any event with entityType of PARTITION, the proxy's local
 * replica set and selected replica should remain unchanged after
 * the event is processed.
 *
 * **Validates: Requirements 6.3**
 *
 * @module test/cache/system-cache-proxy-partition-ignored.property
 */
// @ts-nocheck


import {describe, it, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  SystemCacheProxy,
} from '../../src/cache/system-cache-proxy.js';
import {
  WORKER_ENTITY_TYPE,
  WORKER_EVENT,
  WORKER_HEALTH_STATUS,
} from '../../src/worker/worker-constants.js';

/**
 * Create a mock worker manager with configurable replicas.
 * Supports event listener registration so that SystemCacheProxy
 * can register and fire lifecycle event handlers.
 * @param {Array<string>} initialReplicaIds - Initial replica IDs.
 * @return {Object} Mock worker manager.
 */
function createMockWorkerManager(initialReplicaIds) {
  const listeners = {};

  return {
    getWorkersByType: mock.fn((entityType) => {
      if (entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP) {
        return initialReplicaIds.map((replicaId) => ({
          replicaId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        }));
      }
      return [];
    }),
    getWorker: mock.fn((replicaId) => {
      return {
        replicaId,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        healthStatus: WORKER_HEALTH_STATUS.HEALTHY,
      };
    }),
    deliverMessage: mock.fn(async () => ({})),
    on: mock.fn((event, handler) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
    }),
    removeListener: mock.fn((event, handler) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(
          (h) => h !== handler,
        );
      }
    }),
    emit: (event, payload) => {
      if (listeners[event]) {
        listeners[event].forEach((handler) => handler(payload));
      }
    },
  };
}

describe('Property 5: Partition replica events are ignored', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('REPLICA_CREATED with PARTITION entityType is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        async (initialIds, partitionReplicaId) => {
          const mgr = createMockWorkerManager(initialIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const setBefore = new Set(proxy.localReplicaIds);
          const selectedBefore = proxy.getSelectedReplicaId();

          mgr.emit(WORKER_EVENT.REPLICA_CREATED, {
            replicaId: partitionReplicaId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
          });

          // Local set must be unchanged
          assert.strictEqual(
            proxy.localReplicaIds.size,
            setBefore.size,
            'Local set size must not change for partition event',
          );
          for (const id of setBefore) {
            assert.ok(
              proxy.localReplicaIds.has(id),
              `Replica ${id} must still be in local set`,
            );
          }
          assert.ok(
            !proxy.localReplicaIds.has(partitionReplicaId) ||
            setBefore.has(partitionReplicaId),
            'Partition replica must not be added to local set',
          );

          // Selected replica must be unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selected replica must not change for partition event',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('REPLICA_STOPPED with PARTITION entityType is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        async (initialIds, partitionReplicaId) => {
          const mgr = createMockWorkerManager(initialIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const setBefore = new Set(proxy.localReplicaIds);
          const selectedBefore = proxy.getSelectedReplicaId();

          mgr.emit(WORKER_EVENT.REPLICA_STOPPED, {
            replicaId: partitionReplicaId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
          });

          // Local set must be unchanged
          assert.strictEqual(
            proxy.localReplicaIds.size,
            setBefore.size,
            'Local set size must not change for partition event',
          );
          for (const id of setBefore) {
            assert.ok(
              proxy.localReplicaIds.has(id),
              `Replica ${id} must still be in local set`,
            );
          }

          // Selected replica must be unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selected replica must not change for partition event',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('REPLICA_FAILED with PARTITION entityType is ignored', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        async (initialIds, partitionReplicaId) => {
          const mgr = createMockWorkerManager(initialIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const setBefore = new Set(proxy.localReplicaIds);
          const selectedBefore = proxy.getSelectedReplicaId();

          mgr.emit(WORKER_EVENT.REPLICA_FAILED, {
            replicaId: partitionReplicaId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
          });

          // Local set must be unchanged
          assert.strictEqual(
            proxy.localReplicaIds.size,
            setBefore.size,
            'Local set size must not change for partition event',
          );
          for (const id of setBefore) {
            assert.ok(
              proxy.localReplicaIds.has(id),
              `Replica ${id} must still be in local set`,
            );
          }

          // Selected replica must be unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selected replica must not change for partition event',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('all event types with PARTITION entityType leave state ' +
     'unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        fc.constantFrom(
          WORKER_EVENT.REPLICA_CREATED,
          WORKER_EVENT.REPLICA_STOPPED,
          WORKER_EVENT.REPLICA_FAILED,
        ),
        async (initialIds, partitionReplicaId, eventType) => {
          const mgr = createMockWorkerManager(initialIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const setBefore = new Set(proxy.localReplicaIds);
          const selectedBefore = proxy.getSelectedReplicaId();

          mgr.emit(eventType, {
            replicaId: partitionReplicaId,
            entityType: WORKER_ENTITY_TYPE.PARTITION,
          });

          // Local set must be unchanged
          assert.strictEqual(
            proxy.localReplicaIds.size,
            setBefore.size,
            `Local set size must not change for ${eventType}`,
          );
          for (const id of setBefore) {
            assert.ok(
              proxy.localReplicaIds.has(id),
              `Replica ${id} must still be in local set`,
            );
          }

          // Selected replica must be unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            `Selected replica must not change for ${eventType}`,
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
