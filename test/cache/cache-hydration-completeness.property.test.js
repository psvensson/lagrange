/**
 * Property-based test for Cache Hydration Completeness.
 * **Property 1: Cache Hydration Completeness**
 * **Validates: Requirements 1.1, 1.2, 1.7**
 *
 * Property: For any server restart with existing partition data, after cache
 * hydration completes, the cache SHALL contain all rows from all system table
 * partitions (nodes, services, tables, partitions, message_groups, indices).
 */

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
    {minLength: 0, maxLength: 5},
  ),
  services: fc.array(
    fc.record({
      service_id: fc.uuid(),
      name: fc.string({minLength: 1, maxLength: 20}),
      node_id: fc.uuid(),
    }),
    {minLength: 0, maxLength: 5},
  ),
  tables: fc.array(
    fc.record({
      table_id: fc.uuid(),
      table_name: fc.string({minLength: 1, maxLength: 20}),
      primary_key: fc.string({minLength: 1, maxLength: 10}),
    }),
    {minLength: 0, maxLength: 5},
  ),
  partitions: fc.array(
    fc.record({
      partition_id: fc.uuid(),
      table_id: fc.uuid(),
      key_start: fc.string({minLength: 0, maxLength: 10}),
      key_end: fc.string({minLength: 0, maxLength: 10}),
    }),
    {minLength: 0, maxLength: 5},
  ),
  message_groups: fc.array(
    fc.record({
      group_id: fc.uuid(),
      name: fc.string({minLength: 1, maxLength: 20}),
    }),
    {minLength: 0, maxLength: 5},
  ),
  indices: fc.array(
    fc.record({
      index_id: fc.uuid(),
      table_id: fc.uuid(),
      column_name: fc.string({minLength: 1, maxLength: 20}),
    }),
    {minLength: 0, maxLength: 5},
  ),
});

/**
 * Create a mock query engine that returns predefined data.
 * @param {Object} tableData - Data for each table
 * @return {Object} Mock query engine
 */
function createMockQueryEngine(tableData) {
  return {
    executeQuery: async (sql) => {
      // Extract table name from SELECT * FROM {table}
      const match = sql.match(/SELECT \* FROM (\w+)/i);
      if (!match) {
        return {success: false, error: 'Invalid query'};
      }

      const tableName = match[1];
      const rows = tableData[tableName] || [];

      return {
        success: true,
        rows,
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
 * Property 1: Cache Hydration Completeness
 *
 * For any server restart with existing partition data, after cache hydration
 * completes, the cache SHALL contain all rows from all system table partitions.
 */
test('Property 1: Cache contains all rows after hydration', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const queryEngine = createMockQueryEngine(tableData);
        const hydrationService = createHydrationService(queryEngine, cache);

        // Perform hydration
        const result = await hydrationService.hydrateCache();

        // Verify hydration succeeded
        if (!result.success) {
          return false;
        }

        // Verify all system tables were hydrated
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          const expectedRows = tableData[tableName] || [];
          const cachedRows = cache.getAll(tableName);

          // Verify row count matches
          if (cachedRows.length !== expectedRows.length) {
            return false;
          }

          // Verify result reports correct count
          if (result.tables[tableName].rowCount !== expectedRows.length) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache contains all rows after hydration');
});

/**
 * Property 1: All system tables are queried during hydration.
 */
test('Property 1: All system tables are queried', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const queriedTables = [];

        const queryEngine = {
          executeQuery: async (sql) => {
            const match = sql.match(/SELECT \* FROM (\w+)/i);
            if (match) {
              queriedTables.push(match[1]);
            }
            const tableName = match ? match[1] : '';
            return {
              success: true,
              rows: tableData[tableName] || [],
            };
          },
        };

        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // Verify all required tables were queried
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

  t.pass('All system tables are queried');
});

/**
 * Property 1: Hydration result contains correct row counts.
 */
test('Property 1: Hydration result contains correct row counts', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const queryEngine = createMockQueryEngine(tableData);
        const hydrationService = createHydrationService(queryEngine, cache);

        const result = await hydrationService.hydrateCache();

        // Verify each table's row count in result
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          const expectedCount = (tableData[tableName] || []).length;
          const reportedCount = result.tables[tableName]?.rowCount;

          if (reportedCount !== expectedCount) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Hydration result contains correct row counts');
});

/**
 * Property 1: Cache data matches source data exactly.
 */
test('Property 1: Cache data matches source data', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      systemTableDataArbitrary,
      async (tableData) => {
        const cache = new SystemTableCache();
        const queryEngine = createMockQueryEngine(tableData);
        const hydrationService = createHydrationService(queryEngine, cache);

        await hydrationService.hydrateCache();

        // Verify data integrity for each table
        for (const tableName of SYSTEM_TABLES_TO_HYDRATE) {
          const sourceRows = tableData[tableName] || [];

          // Check each source row exists in cache
          for (const sourceRow of sourceRows) {
            const pkField = getPrimaryKeyField(tableName);
            const pk = sourceRow[pkField];
            const cachedRow = cache.get(tableName, pk);

            if (!cachedRow) {
              return false;
            }

            // Verify all fields match
            for (const [key, value] of Object.entries(sourceRow)) {
              if (JSON.stringify(cachedRow[key]) !== JSON.stringify(value)) {
                return false;
              }
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache data matches source data');
});

/**
 * Get the primary key field for a system table.
 * @param {string} tableName - Table name
 * @return {string} Primary key field name
 */
function getPrimaryKeyField(tableName) {
  const pkFields = {
    nodes: 'node_id',
    services: 'service_id',
    tables: 'table_id',
    partitions: 'partition_id',
    message_groups: 'group_id',
    indices: 'index_id',
  };
  return pkFields[tableName] || 'id';
}
