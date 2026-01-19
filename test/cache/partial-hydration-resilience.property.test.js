/**
 * Property-based test for Partial Hydration Resilience.
 * **Property 2: Partial Hydration Resilience**
 * **Validates: Requirements 1.5**
 *
 * Property: For any hydration attempt where one or more system tables fail to
 * query, the cache SHALL still contain data from the tables that succeeded.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
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
 * Generate a subset of tables to fail.
 */
const failingTablesArbitrary = fc.subarray(SYSTEM_TABLES_TO_HYDRATE, {
  minLength: 1,
  maxLength: SYSTEM_TABLES_TO_HYDRATE.length - 1,
});

/**
 * Create a mock query engine that fails for specified tables.
 * @param {Object} tableData - Data for each table
 * @param {Array<string>} failingTables - Tables that should fail
 * @return {Object} Mock query engine
 */
function createFailingQueryEngine(tableData, failingTables) {
  return {
    executeQuery: async (sql) => {
      const match = sql.match(/SELECT \* FROM (\w+)/i);
      if (!match) {
        return {success: false, error: 'Invalid query'};
      }

      const tableName = match[1];

      // Fail for specified tables
      if (failingTables.includes(tableName)) {
        throw new Error(`Simulated failure for ${tableName}`);
      }

      return {
        success: true,
        rows: tableData[tableName] || [],
      };
    },
  };
}

/**
 * Feature: admin-cli-cache-hydration
 * Property 2: Partial Hydration Resilience
 *
 * For any hydration attempt where one or more system tables fail to query,
 * the cache SHALL still contain data from the tables that succeeded.
 */
test('Property 2: Successful tables are hydrated despite failures', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      failingTablesArbitrary,
      async (tableData, failingTables) => {
        const cache = new SystemTableCache();
        const queryEngine = createFailingQueryEngine(tableData, failingTables);
        const hydrationService = new CacheHydrationService(
          queryEngine,
          cache,
        );

        const result = await hydrationService.hydrateCache();

        // Verify successful tables have data
        const successfulTables = SYSTEM_TABLES_TO_HYDRATE.filter(
          (t) => !failingTables.includes(t),
        );

        for (const tableName of successfulTables) {
          const expectedRows = tableData[tableName] || [];
          const cachedRows = cache.getAll(tableName);

          // Successful tables should have all their data
          if (cachedRows.length !== expectedRows.length) {
            return false;
          }

          // Result should show success for this table
          if (!result.tables[tableName]?.success) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Successful tables are hydrated despite failures');
});

/**
 * Property 2: Failed tables are reported in errors.
 */
test('Property 2: Failed tables are reported in errors', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      failingTablesArbitrary,
      async (tableData, failingTables) => {
        const cache = new SystemTableCache();
        const queryEngine = createFailingQueryEngine(tableData, failingTables);
        const hydrationService = new CacheHydrationService(
          queryEngine,
          cache,
        );

        const result = await hydrationService.hydrateCache();

        // Result should indicate overall failure
        if (result.success !== false) {
          return false;
        }

        // All failing tables should be in errors
        for (const tableName of failingTables) {
          const hasError = result.errors.some((e) => e.tableName === tableName);
          if (!hasError) {
            return false;
          }

          // Table result should show failure
          if (result.tables[tableName]?.success !== false) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Failed tables are reported in errors');
});

/**
 * Property 2: Failed tables have empty cache.
 */
test('Property 2: Failed tables have empty cache', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      failingTablesArbitrary,
      async (tableData, failingTables) => {
        const cache = new SystemTableCache();
        const queryEngine = createFailingQueryEngine(tableData, failingTables);
        const hydrationService = new CacheHydrationService(
          queryEngine,
          cache,
        );

        await hydrationService.hydrateCache();

        // Failed tables should have no data in cache
        for (const tableName of failingTables) {
          const cachedRows = cache.getAll(tableName);
          if (cachedRows.length !== 0) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Failed tables have empty cache');
});

/**
 * Property 2: Hydration continues after failure.
 */
test('Property 2: Hydration continues after failure', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const queriedTables = [];

        // Fail only the first table
        const firstTable = SYSTEM_TABLES_TO_HYDRATE[0];

        const queryEngine = {
          executeQuery: async (sql) => {
            const match = sql.match(/SELECT \* FROM (\w+)/i);
            if (!match) {
              return {success: false, error: 'Invalid query'};
            }

            const tableName = match[1];
            queriedTables.push(tableName);

            if (tableName === firstTable) {
              throw new Error('Simulated failure');
            }

            return {
              success: true,
              rows: tableData[tableName] || [],
            };
          },
        };

        const hydrationService = new CacheHydrationService(
          queryEngine,
          cache,
        );

        await hydrationService.hydrateCache();

        // All tables should have been queried despite first failure
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          if (!queriedTables.includes(tableName)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hydration continues after failure');
});
