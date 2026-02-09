/**
 * Property test for SystemCacheProxy error propagation without retry.
 *
 * Feature: message-group-resilient-proxy
 * Property 6: Failed queries propagate errors without retry
 *
 * For any cache query that fails with an error, the proxy should
 * propagate the same error to the caller without attempting a retry
 * or re-selection.
 *
 * **Validates: Requirements 7.1**
 *
 * @module test/cache/system-cache-proxy-no-retry.property
 */

import {describe, it, mock} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  SystemCacheProxy,
} from '../../src/cache/system-cache-proxy.js';
import {
  WORKER_ENTITY_TYPE,
  WORKER_HEALTH_STATUS,
} from '../../src/worker/worker-constants.js';

/**
 * Create a mock worker manager with a single healthy replica
 * and a configurable deliverMessage implementation.
 * @param {string} replicaId - The replica ID to register.
 * @param {Function} deliverFn - The deliverMessage implementation.
 * @return {Object} Mock worker manager.
 */
function createMockWorkerManager(replicaId, deliverFn) {
  const listeners = {};

  return {
    getWorkersByType: mock.fn((entityType) => {
      if (entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP) {
        return [{
          replicaId,
          entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
        }];
      }
      return [];
    }),
    getWorker: mock.fn(() => ({
      replicaId,
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      healthStatus: WORKER_HEALTH_STATUS.HEALTHY,
    })),
    deliverMessage: deliverFn,
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
  };
}

describe('Property 6: Failed queries propagate errors ' +
    'without retry', () => {
  const silentLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  it('get() propagates error and calls deliverMessage ' +
      'exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        fc.string({minLength: 1, maxLength: 50}),
        async (replicaId, errorMsg, tableName) => {
          const deliverFn = mock.fn(async () => {
            throw new Error(errorMsg);
          });
          const mgr = createMockWorkerManager(replicaId, deliverFn);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          let caughtError;
          try {
            await proxy.get(tableName, 'key');
          } catch (err) {
            caughtError = err;
          }

          assert.ok(
            caughtError,
            'Error must propagate to the caller',
          );
          assert.strictEqual(
            caughtError.message,
            errorMsg,
            'Error message must match the original error',
          );
          assert.strictEqual(
            deliverFn.mock.callCount(),
            1,
            'deliverMessage must be called exactly once (no retry)',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('query() propagates error and calls deliverMessage ' +
      'exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        fc.string({minLength: 1, maxLength: 80}),
        async (replicaId, errorMsg, sql) => {
          const deliverFn = mock.fn(async () => {
            throw new Error(errorMsg);
          });
          const mgr = createMockWorkerManager(replicaId, deliverFn);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          let caughtError;
          try {
            await proxy.query(sql);
          } catch (err) {
            caughtError = err;
          }

          assert.ok(
            caughtError,
            'Error must propagate to the caller',
          );
          assert.strictEqual(
            caughtError.message,
            errorMsg,
            'Error message must match the original error',
          );
          assert.strictEqual(
            deliverFn.mock.callCount(),
            1,
            'deliverMessage must be called exactly once (no retry)',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('getAll() propagates error and calls deliverMessage ' +
      'exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        fc.string({minLength: 1, maxLength: 50}),
        async (replicaId, errorMsg, tableName) => {
          const deliverFn = mock.fn(async () => {
            throw new Error(errorMsg);
          });
          const mgr = createMockWorkerManager(replicaId, deliverFn);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          let caughtError;
          try {
            await proxy.getAll(tableName);
          } catch (err) {
            caughtError = err;
          }

          assert.ok(
            caughtError,
            'Error must propagate to the caller',
          );
          assert.strictEqual(
            caughtError.message,
            errorMsg,
            'Error message must match the original error',
          );
          assert.strictEqual(
            deliverFn.mock.callCount(),
            1,
            'deliverMessage must be called exactly once (no retry)',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('error is the same object reference (not wrapped)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        async (replicaId, errorMsg) => {
          const originalError = new Error(errorMsg);
          const deliverFn = mock.fn(async () => {
            throw originalError;
          });
          const mgr = createMockWorkerManager(replicaId, deliverFn);

          const proxy = new SystemCacheProxy({
            workerManager: mgr,
            logger: silentLogger,
          });
          await proxy.initialize();

          let caughtError;
          try {
            await proxy.get('test_table', 'key');
          } catch (err) {
            caughtError = err;
          }

          assert.ok(
            caughtError,
            'Error must propagate to the caller',
          );
          assert.strictEqual(
            caughtError,
            originalError,
            'Error must be the exact same object (not wrapped)',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
