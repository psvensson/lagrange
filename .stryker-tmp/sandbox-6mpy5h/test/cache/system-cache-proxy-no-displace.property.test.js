/**
 * Property test for SystemCacheProxy created replica no-displace.
 *
 * Feature: message-group-resilient-proxy
 * Property 3: Created replica does not displace existing healthy
 * selection
 *
 * For any proxy state with a healthy selected replica and any new
 * replica ID, when a REPLICA_CREATED event is emitted, the previously
 * selected replica should remain selected.
 *
 * **Validates: Requirements 3.3**
 *
 * @module test/cache/system-cache-proxy-no-displace.property
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

describe('Property 3: Created replica does not displace ' +
    'existing healthy selection', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('REPLICA_CREATED for a new replica keeps existing ' +
      'selection unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        async (existingIds, newReplicaId) => {
          // Ensure the new replica ID is not in the existing set
          fc.pre(!existingIds.includes(newReplicaId));

          const mgr = createMockWorkerManager(existingIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          // Capture the selection before the event
          const selectedBefore = proxy.getSelectedReplicaId();
          assert.ok(
            selectedBefore !== null,
            'Proxy must have a selected replica after init',
          );
          assert.ok(
            existingIds.includes(selectedBefore),
            'Selected replica must be from the initial set',
          );

          // Emit REPLICA_CREATED for the new replica
          mgr.emit(WORKER_EVENT.REPLICA_CREATED, {
            replicaId: newReplicaId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // Selection must remain unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selected replica must not change when a new ' +
            'replica is created',
          );

          // New replica must be added to the local set
          assert.ok(
            proxy.localReplicaIds.has(newReplicaId),
            'New replica must be added to local set',
          );

          // Local set size must increase by one
          assert.strictEqual(
            proxy.getLocalReplicaCount(),
            existingIds.length + 1,
            'Local set size must increase by one',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('multiple REPLICA_CREATED events do not displace ' +
      'the original selection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 3}),
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 3}),
        async (existingIds, newIds) => {
          // Ensure no overlap between existing and new IDs
          const existingSet = new Set(existingIds);
          const filteredNewIds = newIds.filter(
            (id) => !existingSet.has(id),
          );
          fc.pre(filteredNewIds.length > 0);

          const mgr = createMockWorkerManager(existingIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const selectedBefore = proxy.getSelectedReplicaId();
          assert.ok(
            selectedBefore !== null,
            'Proxy must have a selected replica after init',
          );

          // Emit REPLICA_CREATED for each new replica
          for (const newId of filteredNewIds) {
            mgr.emit(WORKER_EVENT.REPLICA_CREATED, {
              replicaId: newId,
              entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            });
          }

          // Selection must remain the same throughout
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selection must not change after multiple ' +
            'REPLICA_CREATED events',
          );

          // All new replicas must be in the local set
          for (const newId of filteredNewIds) {
            assert.ok(
              proxy.localReplicaIds.has(newId),
              `New replica ${newId} must be in local set`,
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
