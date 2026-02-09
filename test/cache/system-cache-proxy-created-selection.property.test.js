/**
 * Property test for SystemCacheProxy created replica selection.
 *
 * Feature: message-group-resilient-proxy
 * Property 2: Created replica is added and selected when none exists
 *
 * For any message group replica ID, when a REPLICA_CREATED event is
 * emitted and no replica is currently selected, the new replica should
 * be added to the local set and become the selected replica.
 *
 * **Validates: Requirements 3.1, 3.2**
 *
 * @module test/cache/system-cache-proxy-created-selection.property
 */

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

describe('Property 2: Created replica is added and selected ' +
    'when none exists', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('new replica is added to set and selected when proxy ' +
      'has no replicas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (replicaId) => {
          // Start with empty replica set
          const mgr = createMockWorkerManager([]);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          // Verify proxy starts with no selection
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            null,
            'Proxy should start with no selected replica',
          );
          assert.strictEqual(
            proxy.getLocalReplicaCount(),
            0,
            'Proxy should start with empty local set',
          );

          // Emit REPLICA_CREATED for the new replica
          mgr.emit(WORKER_EVENT.REPLICA_CREATED, {
            replicaId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // The new replica must be in the local set
          assert.ok(
            proxy.localReplicaIds.has(replicaId),
            'Created replica must be added to local set',
          );
          assert.strictEqual(
            proxy.getLocalReplicaCount(),
            1,
            'Local set should contain exactly one replica',
          );

          // The new replica must be selected
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            replicaId,
            'Created replica must be selected when none existed',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('multiple created replicas select the first when ' +
      'starting empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        async (replicaIds) => {
          const mgr = createMockWorkerManager([]);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          // Emit REPLICA_CREATED for each replica sequentially
          for (const replicaId of replicaIds) {
            mgr.emit(WORKER_EVENT.REPLICA_CREATED, {
              replicaId,
              entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
            });
          }

          // All replicas must be in the local set
          for (const replicaId of replicaIds) {
            assert.ok(
              proxy.localReplicaIds.has(replicaId),
              `Replica ${replicaId} must be in local set`,
            );
          }
          assert.strictEqual(
            proxy.getLocalReplicaCount(),
            replicaIds.length,
            'Local set should contain all created replicas',
          );

          // The first created replica should be selected
          // (it was selected when none existed, subsequent
          // creates should not displace it)
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            replicaIds[0],
            'First created replica should remain selected',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
