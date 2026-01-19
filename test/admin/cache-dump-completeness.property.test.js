/**
 * Property-based test for Cache Dump Completeness.
 * **Property 5: Cache Dump Completeness**
 * **Validates: Requirements 3.1, 3.3, 3.4**
 *
 * Property: For any Admin CLI connection, the cache_dump message SHALL contain
 * arrays for all six system tables (nodes, services, tables, partitions,
 * message_groups, indices) with data matching the current cache or partition
 * contents.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import WebSocket from 'ws';
import {AdminWebSocketAPI, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const SYSTEM_TABLES = ['nodes', 'services', 'partitions', 'tables',
  'message_groups', 'indices'];

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Generate random records for a system table.
 */
const recordArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({minLength: 1, maxLength: 30}),
  status: fc.constantFrom('active', 'inactive', 'pending'),
});

/**
 * Generate random cache state with records for each system table.
 */
const cacheStateArbitrary = fc.record({
  nodes: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
  services: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
  partitions: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
  tables: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
  message_groups: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
  indices: fc.array(recordArbitrary, {minLength: 0, maxLength: 5}),
});

/**
 * Connect to WebSocket and wait for first message.
 * @param {string} url - WebSocket URL.
 * @param {number} timeout - Timeout in ms.
 * @return {Promise<{ws: WebSocket, message: Object}>}
 */
function connectAndReceive(url, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let timeoutId;

    timeoutId = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout waiting for connection/message'));
    }, timeout);

    ws.on('message', (data) => {
      clearTimeout(timeoutId);
      try {
        const message = JSON.parse(data.toString());
        resolve({ws, message});
      } catch (e) {
        ws.close();
        reject(e);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Populate cache with given state.
 * @param {SystemTableCache} cache - Cache to populate.
 * @param {Object} state - State with records for each table.
 */
function populateCache(cache, state) {
  for (const tableName of SYSTEM_TABLES) {
    const records = state[tableName] || [];
    for (const record of records) {
      cache.applySystemTableChange(tableName, 'INSERT', record);
    }
  }
}

/**
 * Feature: admin-cli-cache-hydration
 * Property 5: Cache Dump Completeness
 *
 * For any Admin CLI connection, the cache_dump message SHALL contain arrays
 * for all six system tables with data matching the current cache contents.
 */
test('Property 5: Cache dump contains all six system tables', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cacheStateArbitrary,
      async (cacheState) => {
        const cache = new SystemTableCache();
        populateCache(cache, cacheState);

        const api = new AdminWebSocketAPI({
          nodeId: 'test-node',
          systemTableCache: cache,
        });

        try {
          await api.initialize(0);
          const port = api.getFastify().server.address().port;

          const {ws, message} = await connectAndReceive(
            `ws://localhost:${port}/api/admin/stream`,
          );

          ws.close();

          // Verify message type
          if (message.type !== MessageType.CACHE_DUMP) {
            return false;
          }

          // Verify all six system tables are present
          for (const tableName of SYSTEM_TABLES) {
            if (!Array.isArray(message.data[tableName])) {
              return false;
            }
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache dump contains all six system tables');
});

/**
 * Property 5: Cache dump data matches cache contents.
 */
test('Property 5: Cache dump data matches cache contents', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cacheStateArbitrary,
      async (cacheState) => {
        const cache = new SystemTableCache();
        populateCache(cache, cacheState);

        const api = new AdminWebSocketAPI({
          nodeId: 'test-node',
          systemTableCache: cache,
        });

        try {
          await api.initialize(0);
          const port = api.getFastify().server.address().port;

          const {ws, message} = await connectAndReceive(
            `ws://localhost:${port}/api/admin/stream`,
          );

          ws.close();

          // Verify data matches for each table
          for (const tableName of SYSTEM_TABLES) {
            const expectedRecords = cacheState[tableName] || [];
            const actualRecords = message.data[tableName] || [];

            if (actualRecords.length !== expectedRecords.length) {
              return false;
            }

            // Verify each record exists in the dump
            for (const expected of expectedRecords) {
              const found = actualRecords.some((r) => r.id === expected.id);
              if (!found) {
                return false;
              }
            }
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache dump data matches cache contents');
});

/**
 * Property 5: Cache dump format matches protocol.
 * Format: { type: 'cache_dump', data: { nodes: [...], services: [...], ... } }
 */
test('Property 5: Cache dump format matches protocol', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cacheStateArbitrary,
      async (cacheState) => {
        const cache = new SystemTableCache();
        populateCache(cache, cacheState);

        const api = new AdminWebSocketAPI({
          nodeId: 'test-node',
          systemTableCache: cache,
        });

        try {
          await api.initialize(0);
          const port = api.getFastify().server.address().port;

          const {ws, message} = await connectAndReceive(
            `ws://localhost:${port}/api/admin/stream`,
          );

          ws.close();

          // Verify protocol format (Requirement 3.4)
          if (message.type !== 'cache_dump') {
            return false;
          }
          if (typeof message.data !== 'object' || message.data === null) {
            return false;
          }
          if (typeof message.timestamp !== 'number') {
            return false;
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache dump format matches protocol');
});

/**
 * Property 5: Empty cache fallback queries partitions.
 * When cache is empty, queryPartitionsForDump() should be called.
 */
test('Property 5: Empty cache returns valid dump structure', async (t) => {
  // Test with empty cache - should still return valid structure
  const cache = new SystemTableCache();

  // Create mock query engine that returns empty results
  const mockQueryEngine = {
    executeQuery: async (_sql) => {
      return {results: []};
    },
  };

  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
    sqlQueryEngine: mockQueryEngine,
  });

  try {
    await api.initialize(0);
    const port = api.getFastify().server.address().port;

    const {ws, message} = await connectAndReceive(
      `ws://localhost:${port}/api/admin/stream`,
    );

    ws.close();

    // Verify all tables are present even when empty
    t.equal(message.type, MessageType.CACHE_DUMP, 'should be cache_dump');
    for (const tableName of SYSTEM_TABLES) {
      t.ok(Array.isArray(message.data[tableName]),
        `${tableName} should be an array`);
    }
  } finally {
    await api.shutdown();
  }
});

/**
 * Property 5: Empty cache fallback uses query engine.
 */
test('Property 5: Empty cache fallback queries partitions', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      cacheStateArbitrary,
      async (partitionData) => {
        const cache = new SystemTableCache();
        // Cache is empty - don't populate it

        // Mock query engine returns partition data
        const mockQueryEngine = {
          executeQuery: async (sql) => {
            const tableName = sql.match(/FROM\s+(\w+)/i)?.[1];
            if (tableName && partitionData[tableName]) {
              return {results: partitionData[tableName]};
            }
            return {results: []};
          },
        };

        const api = new AdminWebSocketAPI({
          nodeId: 'test-node',
          systemTableCache: cache,
          sqlQueryEngine: mockQueryEngine,
        });

        try {
          await api.initialize(0);
          const port = api.getFastify().server.address().port;

          const {ws, message} = await connectAndReceive(
            `ws://localhost:${port}/api/admin/stream`,
          );

          ws.close();

          // Verify data came from query engine (partition fallback)
          for (const tableName of SYSTEM_TABLES) {
            const expectedRecords = partitionData[tableName] || [];
            const actualRecords = message.data[tableName] || [];

            if (actualRecords.length !== expectedRecords.length) {
              return false;
            }
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Empty cache fallback queries partitions');
});

