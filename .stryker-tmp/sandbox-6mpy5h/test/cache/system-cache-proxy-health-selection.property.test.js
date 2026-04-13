/**
 * Property test for SystemCacheProxy health-aware selection.
 *
 * Feature: message-group-resilient-proxy
 * Property 4: Health-aware selection prefers healthy replicas
 *
 * For any set of replicas with mixed health statuses, selection
 * should return a healthy replica when at least one exists. When
 * all replicas are unhealthy, selection should return the first
 * available replica rather than null.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * @module test/cache/system-cache-proxy-health-selection.property
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
 * Create a mock worker manager with per-replica health statuses.
 * @param {Array<string>} initialReplicaIds - Initial replica IDs.
 * @param {Map<string, string>} healthMap - Map of replicaId to
 *   health status.
 * @return {Object} Mock worker manager with event support.
 */
function createMockWorkerManager(initialReplicaIds, healthMap) {
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
      const status = healthMap.get(replicaId) ||
        WORKER_HEALTH_STATUS.HEALTHY;
      return {
        replicaId,
        entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        healthStatus: status,
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

/**
 * Arbitrary for generating a health status value.
 */
const healthStatusArb = fc.constantFrom(
  WORKER_HEALTH_STATUS.HEALTHY,
  WORKER_HEALTH_STATUS.UNHEALTHY,
  WORKER_HEALTH_STATUS.UNKNOWN,
);

describe('Property 4: Health-aware selection prefers ' +
    'healthy replicas', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('selects a non-unhealthy replica when at least one ' +
      'exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        fc.array(healthStatusArb, {minLength: 1, maxLength: 5}),
        async (replicaIds, healthStatuses) => {
          // Align health statuses to replica IDs
          const healthMap = new Map();
          for (let i = 0; i < replicaIds.length; i++) {
            const status = healthStatuses[i % healthStatuses.length];
            healthMap.set(replicaIds[i], status);
          }

          const hasNonUnhealthy = replicaIds.some((id) => {
            return healthMap.get(id) !==
              WORKER_HEALTH_STATUS.UNHEALTHY;
          });

          const mgr = createMockWorkerManager(replicaIds, healthMap);
          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const selected = proxy.getSelectedReplicaId();

          // Must always select something when replicas exist
          assert.ok(
            selected !== null,
            'Must select a replica when replicas exist',
          );

          if (hasNonUnhealthy) {
            // Selected replica must not be unhealthy
            const selectedHealth = healthMap.get(selected);
            assert.notStrictEqual(
              selectedHealth,
              WORKER_HEALTH_STATUS.UNHEALTHY,
              'Must select a non-unhealthy replica when one ' +
              'exists; selected ' + selected + ' with status ' +
              selectedHealth,
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });

  it('falls back to first available when all replicas ' +
      'are unhealthy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (replicaIds) => {
          // All replicas are unhealthy
          const healthMap = new Map();
          for (const id of replicaIds) {
            healthMap.set(id, WORKER_HEALTH_STATUS.UNHEALTHY);
          }

          const mgr = createMockWorkerManager(replicaIds, healthMap);
          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const selected = proxy.getSelectedReplicaId();

          // Must still select a replica (not null)
          assert.ok(
            selected !== null,
            'Must select a replica even when all are unhealthy',
          );

          // Must be from the replica set
          assert.ok(
            proxy.localReplicaIds.has(selected),
            'Selected replica must be from the local set',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('re-selection after removal prefers healthy over ' +
      'unhealthy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.uuid(), {minLength: 2, maxLength: 5}),
        fc.array(healthStatusArb, {minLength: 2, maxLength: 5}),
        async (replicaIds, healthStatuses) => {
          // Assign health statuses
          const healthMap = new Map();
          for (let i = 0; i < replicaIds.length; i++) {
            const status = healthStatuses[i % healthStatuses.length];
            healthMap.set(replicaIds[i], status);
          }

          const mgr = createMockWorkerManager(replicaIds, healthMap);
          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          const selectedBefore = proxy.getSelectedReplicaId();

          // Remove the currently selected replica via STOPPED
          mgr.emit(WORKER_EVENT.REPLICA_STOPPED, {
            replicaId: selectedBefore,
            entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
          });

          const remaining = replicaIds.filter(
            (id) => id !== selectedBefore,
          );
          const selectedAfter = proxy.getSelectedReplicaId();

          if (remaining.length === 0) {
            assert.strictEqual(
              selectedAfter,
              null,
              'Must be null when no replicas remain',
            );
            return;
          }

          // Must select from remaining
          assert.ok(
            selectedAfter !== null,
            'Must select a replica when others remain',
          );
          assert.ok(
            remaining.includes(selectedAfter),
            'Selected must be from remaining replicas',
          );

          // If any remaining replica is non-unhealthy,
          // selected must be non-unhealthy
          const hasNonUnhealthy = remaining.some((id) => {
            return healthMap.get(id) !==
              WORKER_HEALTH_STATUS.UNHEALTHY;
          });

          if (hasNonUnhealthy) {
            const afterHealth = healthMap.get(selectedAfter);
            assert.notStrictEqual(
              afterHealth,
              WORKER_HEALTH_STATUS.UNHEALTHY,
              'After re-selection, must prefer non-unhealthy; ' +
              'selected ' + selectedAfter + ' with status ' +
              afterHealth,
            );
          }
        },
      ),
      {numRuns: 10},
    );
  });
});
