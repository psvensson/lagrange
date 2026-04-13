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
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {AdminWebSocketAPI, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';

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
 * Connect to AdminWebSocketAPI in-process and wait for first message.
 * @param {AdminWebSocketAPI} api - Admin API instance.
 * @param {number} timeout - Timeout in ms.
 * @return {Promise<{ws: Object, message: Object}>}
 */
function connectAndReceive(api, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const {clientSocket, serverSocket} = createInProcWebSocketPair();
    try {
      api.handleConnection(serverSocket);
    } catch (error) {
      clientSocket.close();
      reject(error);
      return;
    }

    const timeoutId = setTimeout(() => {
      clientSocket.close();
      reject(new Error('Timeout waiting for connection/message'));
    }, timeout);

    clientSocket.on('message', (data) => {
      clearTimeout(timeoutId);
      try {
        const message = JSON.parse(data.toString());
        resolve({ws: clientSocket, message});
      } catch (e) {
        clientSocket.close();
        reject(e);
      }
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
          await api.initialize(0, {listen: false});
          const {ws, message} = await connectAndReceive(api);

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
          await api.initialize(0, {listen: false});
          const {ws, message} = await connectAndReceive(api);

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
          await api.initialize(0, {listen: false});
          const {ws, message} = await connectAndReceive(api);

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

test('Property 5: Empty cache rejects cache dump', async (t) => {
  const cache = new SystemTableCache();

  const mockQueryEngine = {
    executeQuery: async () => ({results: []}),
  };

  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
    sqlQueryEngine: mockQueryEngine,
  });

  try {
    await api.initialize(0, {listen: false});
    await t.rejects(
      connectAndReceive(api),
      /System table cache is empty/,
      'should reject empty cache dumps',
    );
  } finally {
    await api.shutdown();
  }
});
