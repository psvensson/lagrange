/**
 * Property test for SystemCacheProxy Statelessness (Property 17).
 *
 * Feature: worker-process-replica-isolation, Property 17: SystemCacheProxy Statelessness
 *
 * For any SystemCacheProxy instance, the proxy SHALL NOT hold any cached data,
 * and all queries SHALL be forwarded to a message group replica.
 *
 * **Validates: Requirements 9.1, 9.2**
 *
 * @module test/cache/system-cache-proxy-statelessness.property.test.js
 */
// @ts-nocheck


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

describe('Property 17: SystemCacheProxy Statelessness', () => {
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
   * Create a mock worker manager with message group replicas.
   * @param {Array<string>} replicaIds - Replica IDs to create.
   * @param {Function} deliverHandler - Handler for deliverMessage calls.
   * @return {Object} Mock worker manager.
   */
  function createMockWorkerManager(replicaIds, deliverHandler) {
    const workers = replicaIds.map((replicaId) => ({
      replicaId,
      entityType: WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      status: 'running',
    }));

    return {
      getWorkersByType: mock.fn((entityType) => {
        if (entityType === WORKER_ENTITY_TYPE.MESSAGE_GROUP) {
          return workers;
        }
        return [];
      }),
      getWorker: mock.fn((replicaId) => {
        const worker = workers.find((w) => w.replicaId === replicaId);
        if (worker) {
          return {
            ...worker,
            healthStatus: WORKER_HEALTH_STATUS.HEALTHY,
          };
        }
        return undefined;
      }),
      deliverMessage: mock.fn(deliverHandler || (async () => ({}))),
      on: mock.fn(() => {}),
      removeListener: mock.fn(() => {}),
    };
  }

  it('should forward CACHE_GET queries to worker', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1}),
        fc.string({minLength: 1}),
        fc.uuid(),
        async (tableName, key, replicaId) => {
          const expectedData = {id: key, value: 'test'};
          let receivedMessage = null;

          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async (targetReplicaId, message) => {
              receivedMessage = message;
              return {
                type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
                data: expectedData,
              };
            },
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const result = await proxy.get(tableName, key);

          // Verify message was forwarded
          assert.ok(receivedMessage, 'Message should be forwarded to worker');
          assert.strictEqual(
            receivedMessage.type,
            CACHE_MESSAGE_TYPE.CACHE_GET,
            'Message type should be CACHE_GET',
          );
          assert.strictEqual(
            receivedMessage.tableName,
            tableName,
            'Table name should be passed',
          );
          assert.strictEqual(
            receivedMessage.key,
            key,
            'Key should be passed',
          );

          // Verify result came from worker
          assert.deepStrictEqual(
            result,
            expectedData,
            'Result should come from worker response',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should forward CACHE_QUERY queries to worker', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1}),
        fc.uuid(),
        async (sql, replicaId) => {
          const expectedRows = [{id: 1}, {id: 2}];
          let receivedMessage = null;

          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async (targetReplicaId, message) => {
              receivedMessage = message;
              return {
                type: CACHE_MESSAGE_TYPE.CACHE_QUERY_RESPONSE,
                rows: expectedRows,
              };
            },
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const result = await proxy.query(sql);

          // Verify message was forwarded
          assert.ok(receivedMessage, 'Message should be forwarded to worker');
          assert.strictEqual(
            receivedMessage.type,
            CACHE_MESSAGE_TYPE.CACHE_QUERY,
            'Message type should be CACHE_QUERY',
          );
          assert.strictEqual(
            receivedMessage.sql,
            sql,
            'SQL should be passed',
          );

          // Verify result came from worker
          assert.deepStrictEqual(
            result,
            expectedRows,
            'Result should come from worker response',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should forward CACHE_GET_ALL queries to worker', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1}),
        fc.uuid(),
        async (tableName, replicaId) => {
          const expectedRecords = [{id: 1}, {id: 2}, {id: 3}];
          let receivedMessage = null;

          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async (targetReplicaId, message) => {
              receivedMessage = message;
              return {
                type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
                records: expectedRecords,
              };
            },
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();
          const result = await proxy.getAll(tableName);

          // Verify message was forwarded
          assert.ok(receivedMessage, 'Message should be forwarded to worker');
          assert.strictEqual(
            receivedMessage.type,
            CACHE_MESSAGE_TYPE.CACHE_GET_ALL,
            'Message type should be CACHE_GET_ALL',
          );
          assert.strictEqual(
            receivedMessage.tableName,
            tableName,
            'Table name should be passed',
          );

          // Verify result came from worker
          assert.deepStrictEqual(
            result,
            expectedRecords,
            'Result should come from worker response',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should not cache data locally between queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1}),
        fc.string({minLength: 1}),
        fc.uuid(),
        async (tableName, key, replicaId) => {
          let queryCount = 0;

          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async () => {
              queryCount++;
              return {
                type: CACHE_MESSAGE_TYPE.CACHE_GET_RESPONSE,
                data: {id: key, queryNumber: queryCount},
              };
            },
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Make the same query twice
          const result1 = await proxy.get(tableName, key);
          const result2 = await proxy.get(tableName, key);

          // Both queries should have been forwarded (no caching)
          assert.strictEqual(
            queryCount,
            2,
            'Both queries should be forwarded to worker (no local caching)',
          );

          // Results should reflect different query numbers
          assert.strictEqual(result1.queryNumber, 1);
          assert.strictEqual(result2.queryNumber, 2);
        },
      ),
      {numRuns: 10},
    );
  });

  it('should have no internal data storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (replicaId) => {
          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async () => ({data: null}),
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Verify proxy has no data storage properties
          assert.ok(
            !proxy.tables,
            'Proxy should not have tables property',
          );
          assert.ok(
            !proxy.cache,
            'Proxy should not have cache property',
          );
          assert.ok(
            !proxy.data,
            'Proxy should not have data property',
          );
          assert.ok(
            !proxy.records,
            'Proxy should not have records property',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('should always call deliverMessage for every query', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({minLength: 1}), {minLength: 1, maxLength: 5}),
        fc.uuid(),
        async (tableNames, replicaId) => {
          const mockWorkerManager = createMockWorkerManager(
            [replicaId],
            async () => ({
              type: CACHE_MESSAGE_TYPE.CACHE_GET_ALL_RESPONSE,
              records: [],
            }),
          );

          const proxy = new SystemCacheProxy({
            workerManager: mockWorkerManager,
            logger: mockLogger,
          });

          await proxy.initialize();

          // Make multiple queries
          for (const tableName of tableNames) {
            await proxy.getAll(tableName);
          }

          // Verify deliverMessage was called for each query
          assert.strictEqual(
            mockWorkerManager.deliverMessage.mock.calls.length,
            tableNames.length,
            'deliverMessage should be called for every query',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
