/**
 * Property test for SystemCacheProxy removal event re-selection.
 *
 * Feature: message-group-resilient-proxy
 * Property 1: Removal event triggers re-selection
 *
 * For any set of local message group replicas and any replica in that
 * set, when a REPLICA_STOPPED or REPLICA_FAILED event is emitted for
 * that replica, the replica should be removed from the proxy's local
 * set, and if it was the selected replica, a different replica should
 * be selected (or null if none remain).
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 4.1, 4.2, 4.3**
 *
 * @module test/cache/system-cache-proxy-removal-reselection.property
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
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    emit: (event, payload) => {
      if (listeners[event]) {
        listeners[event].forEach((handler) => handler(payload));
      }
    },
  };
}

describe('Property 1: Removal event triggers re-selection', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('stopped replica is removed and proxy re-selects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.nat(),
        async (replicaIds, indexSeed) => {
          const targetIndex = indexSeed % replicaIds.length;
          const targetId = replicaIds[targetIndex];
          const mgr = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          // Emit REPLICA_STOPPED for the target replica
          mgr.emit(WORKER_EVENT.REPLICA_STOPPED, {
            replicaId: targetId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // The removed replica must not be in the local set
          const remaining = new Set(proxy.localReplicaIds);
          assert.ok(
            !remaining.has(targetId),
            'Stopped replica must be removed from local set',
          );

          // Remaining set size should be original minus one
          assert.strictEqual(
            remaining.size,
            replicaIds.length - 1,
            'Local set size should decrease by one',
          );

          const selected = proxy.getSelectedReplicaId();
          if (replicaIds.length === 1) {
            // Last replica removed — selection must be null
            assert.strictEqual(
              selected,
              null,
              'Selected must be null when no replicas remain',
            );
          } else {
            // A different replica must be selected
            assert.ok(
              selected !== null,
              'A replica must be selected when others remain',
            );
            assert.notStrictEqual(
              selected,
              targetId,
              'Selected must not be the removed replica',
            );
            assert.ok(
              remaining.has(selected),
              'Selected must be from the remaining set',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('failed replica is removed and proxy re-selects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.nat(),
        async (replicaIds, indexSeed) => {
          const targetIndex = indexSeed % replicaIds.length;
          const targetId = replicaIds[targetIndex];
          const mgr = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          // Emit REPLICA_FAILED for the target replica
          mgr.emit(WORKER_EVENT.REPLICA_FAILED, {
            replicaId: targetId,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // The removed replica must not be in the local set
          const remaining = new Set(proxy.localReplicaIds);
          assert.ok(
            !remaining.has(targetId),
            'Failed replica must be removed from local set',
          );

          assert.strictEqual(
            remaining.size,
            replicaIds.length - 1,
            'Local set size should decrease by one',
          );

          const selected = proxy.getSelectedReplicaId();
          if (replicaIds.length === 1) {
            assert.strictEqual(
              selected,
              null,
              'Selected must be null when no replicas remain',
            );
          } else {
            assert.ok(
              selected !== null,
              'A replica must be selected when others remain',
            );
            assert.notStrictEqual(
              selected,
              targetId,
              'Selected must not be the failed replica',
            );
            assert.ok(
              remaining.has(selected),
              'Selected must be from the remaining set',
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('removal of non-selected replica keeps current selection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.constantFrom(
          WORKER_EVENT.REPLICA_STOPPED,
          WORKER_EVENT.REPLICA_FAILED,
        ),
        async (replicaIds, eventType) => {
          const mgr = createMockWorkerManager(replicaIds);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const selectedBefore = proxy.getSelectedReplicaId();

          // Pick a replica that is NOT the selected one
          const nonSelected = replicaIds.find(
            (id) => id !== selectedBefore,
          );

          mgr.emit(eventType, {
            replicaId: nonSelected,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          // Selection should remain unchanged
          assert.strictEqual(
            proxy.getSelectedReplicaId(),
            selectedBefore,
            'Selection must not change when a non-selected ' +
            'replica is removed',
          );

          // Removed replica must not be in the set
          assert.ok(
            !proxy.localReplicaIds.has(nonSelected),
            'Removed replica must not be in local set',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
