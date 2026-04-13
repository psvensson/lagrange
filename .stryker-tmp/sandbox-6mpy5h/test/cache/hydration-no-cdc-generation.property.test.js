/**
 * Property-based test for Hydration Does Not Generate CDC.
 * **Property 3: Hydration Does Not Generate CDC**
 * **Validates: Requirements 1.6**
 *
 * Property: For any cache hydration operation, no CDC events SHALL be emitted
 * to the CDC pipeline or to connected Admin CLI clients.
 *
 * Note: This test verifies that hydration uses the explicit bootstrap-only
 * cache applier rather than going through the partition write path which
 * would generate CDC events. The cache listeners ARE notified (for Admin CLI
 * updates), but no CDC events are generated in the CDC pipeline.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  createBootstrapCacheHydrationApplier,
} from '../../src/bootstrap/bootstrap-cache-hydration-applier.js';
import {
  CacheHydrationService,
  SYSTEM_TABLES_TO_HYDRATE,
} from '../../src/cache/cache-hydration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

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
 * Generate random data for all system tables.
 */
const systemTableDataArbitrary = fc.record({
  nodes: fc.array(
    fc.record({
      node_id: fc.uuid(),
      address: fc.string({minLength: 5, maxLength: 30}),
      status: fc.constantFrom('active', 'inactive'),
    }),
    {minLength: 1, maxLength: 3},
  ),
  services: fc.array(
    fc.record({
      service_id: fc.uuid(),
      name: fc.string({minLength: 1, maxLength: 20}),
      node_id: fc.uuid(),
    }),
    {minLength: 1, maxLength: 3},
  ),
  tables: fc.array(
    fc.record({
      table_id: fc.uuid(),
      table_name: fc.string({minLength: 1, maxLength: 20}),
      primary_key: fc.string({minLength: 1, maxLength: 10}),
    }),
    {minLength: 1, maxLength: 3},
  ),
  partitions: fc.array(
    fc.record({
      partition_id: fc.uuid(),
      table_id: fc.uuid(),
      key_start: fc.string({minLength: 0, maxLength: 10}),
      key_end: fc.string({minLength: 0, maxLength: 10}),
    }),
    {minLength: 1, maxLength: 3},
  ),
  message_groups: fc.array(
    fc.record({
      group_id: fc.uuid(),
      name: fc.string({minLength: 1, maxLength: 20}),
    }),
    {minLength: 1, maxLength: 3},
  ),
  indices: fc.array(
    fc.record({
      index_id: fc.uuid(),
      table_id: fc.uuid(),
      column_name: fc.string({minLength: 1, maxLength: 20}),
    }),
    {minLength: 1, maxLength: 3},
  ),
});

/**
 * Create a mock query engine that returns predefined data and tracks
 * whether any writes were attempted.
 * @param {Object} tableData - Data for each table
 * @param {Object} tracker - Object to track CDC-generating operations
 * @return {Object} Mock query engine
 */
function createMockQueryEngine(tableData, tracker) {
  return {
    executeQuery: async (sql) => {
      // Track if any INSERT/UPDATE/DELETE queries are executed
      // (which would generate CDC events)
      const upperSql = sql.toUpperCase();
      if (upperSql.startsWith('INSERT') ||
          upperSql.startsWith('UPDATE') ||
          upperSql.startsWith('DELETE')) {
        tracker.cdcGeneratingQueries.push(sql);
      }

      // Extract table name from SELECT * FROM {table}
      const match = sql.match(/SELECT \* FROM (\w+)/i);
      if (!match) {
        return {success: false, error: 'Invalid query'};
      }

      const tableName = match[1];
      return {
        success: true,
        rows: tableData[tableName] || [],
      };
    },
  };
}

function createHydrationService(queryEngine, cache) {
  return new CacheHydrationService(queryEngine, cache, {
    cdcEventApplier: createBootstrapCacheHydrationApplier(cache),
  });
}

/**
 * Feature: admin-cli-cache-hydration
 * Property 3: Hydration Does Not Generate CDC
 *
 * For any cache hydration operation, no CDC events SHALL be emitted to the
 * CDC pipeline (no INSERT/UPDATE/DELETE queries to partitions).
 */
test('Property 3: Hydration does not execute CDC-generating queries', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const tracker = {cdcGeneratingQueries: []};
        const queryEngine = createMockQueryEngine(tableData, tracker);
        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // No CDC-generating queries should have been executed
        return tracker.cdcGeneratingQueries.length === 0;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hydration does not execute CDC-generating queries');
});

/**
 * Property 3: Hydration only uses SELECT queries.
 */
test('Property 3: Hydration only uses SELECT queries', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const executedQueries = [];

        const queryEngine = {
          executeQuery: async (sql) => {
            executedQueries.push(sql);

            const match = sql.match(/SELECT \* FROM (\w+)/i);
            if (!match) {
              return {success: false, error: 'Invalid query'};
            }

            const tableName = match[1];
            return {
              success: true,
              rows: tableData[tableName] || [],
            };
          },
        };

        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // All queries should be SELECT queries
        for (const query of executedQueries) {
          if (!query.toUpperCase().startsWith('SELECT')) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hydration only uses SELECT queries');
});

/**
 * Property 3: Hydration uses direct cache population.
 *
 * This test verifies that hydration calls applySystemTableChange directly
 * on the cache, which is the direct population path (not CDC pipeline).
 */
test('Property 3: Hydration uses direct cache population', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        // Track calls to applySystemTableChange
        const appliedChanges = [];
        const cache = new SystemTableCache();

        // Wrap applySystemTableChange to track calls
        const originalApply = cache.applySystemTableChange.bind(cache);
        cache.applySystemTableChange = (tableName, operation, data) => {
          appliedChanges.push({tableName, operation, data});
          return originalApply(tableName, operation, data);
        };

        const queryEngine = {
          executeQuery: async (sql) => {
            const match = sql.match(/SELECT \* FROM (\w+)/i);
            if (!match) {
              return {success: false, error: 'Invalid query'};
            }
            const tableName = match[1];
            return {
              success: true,
              rows: tableData[tableName] || [],
            };
          },
        };

        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // Count expected total rows
        let expectedRows = 0;
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          expectedRows += (tableData[tableName] || []).length;
        }

        // Verify applySystemTableChange was called for each row
        if (appliedChanges.length !== expectedRows) {
          return false;
        }

        // Verify all operations are INSERT (direct population)
        for (const change of appliedChanges) {
          if (change.operation !== 'INSERT') {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hydration uses direct cache population');
});

/**
 * Property 3: Cache listeners receive notifications but no CDC pipeline events.
 *
 * This test verifies that while cache listeners ARE notified (for Admin CLI),
 * the hydration process does not go through the CDC pipeline.
 */
test('Property 3: Cache listeners notified without CDC pipeline', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const listenerNotifications = [];

        // Register a listener to track notifications
        cache.onCacheChange((tableName, operation, record) => {
          listenerNotifications.push({tableName, operation, record});
        });

        const queryEngine = {
          executeQuery: async (sql) => {
            const match = sql.match(/SELECT \* FROM (\w+)/i);
            if (!match) {
              return {success: false, error: 'Invalid query'};
            }
            const tableName = match[1];
            return {
              success: true,
              rows: tableData[tableName] || [],
            };
          },
        };

        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // Wait for async notifications
        await new Promise((resolve) => setImmediate(resolve));

        // Count expected total rows
        let expectedRows = 0;
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          expectedRows += (tableData[tableName] || []).length;
        }

        // Listeners should have been notified for each row
        // This is expected behavior - Admin CLI needs these notifications
        // The key is that no CDC pipeline events were generated
        return listenerNotifications.length === expectedRows;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache listeners notified without CDC pipeline');
});
