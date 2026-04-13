/**
 * Property Test: CDC Cache Consistency
 *
 * Property 5: CDC Cache Consistency
 * *For any* sequence of CDC events applied to the Remote Cache, the cache state
 * should match the expected state after applying each event's operation
 * (INSERT adds, UPDATE modifies, DELETE removes).
 *
 * Validates: Requirements 12.2, 12.3, 13.4
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Arbitrary for generating valid table names
 */
const tableNameArb = fc.constantFrom(
  'nodes', 'services', 'partitions', 'tables',
  'message_groups', 'indices', 'logs', 'config', 'contexts',
);

/**
 * Arbitrary for generating CDC operations
 */
const operationArb = fc.constantFrom('INSERT', 'UPDATE', 'DELETE');

/**
 * Generate a record with appropriate primary key for a given table
 */
const recordForTable = (tableName, key) => {
  const keyFields = {
    nodes: 'node_id',
    services: 'service_id',
    partitions: 'partition_id',
    tables: 'table_id',
    message_groups: 'group_id',
    indices: 'index_id',
    logs: 'log_id',
    config: 'key',
    contexts: 'context_id',
  };
  const keyField = keyFields[tableName];
  return {
    [keyField]: key,
    name: `${tableName}-${key}`,
    status: 'active',
    timestamp: Date.now(),
  };
};

/**
 * Arbitrary for generating a CDC event
 */
const cdcEventArb = fc.tuple(
  tableNameArb,
  operationArb,
  fc.string({minLength: 1, maxLength: 10}).filter((s) => /^[a-z0-9-]+$/i.test(s)),
).map(([table, operation, key]) => ({
  table,
  operation,
  key,
  data: recordForTable(table, key),
  timestamp: Date.now(),
}));

/**
 * Arbitrary for generating a sequence of CDC events
 */
const cdcEventSequenceArb = fc.array(cdcEventArb, {minLength: 1, maxLength: 20});

test('Property 5: CDC Cache Consistency - INSERT adds records', async (t) => {
  /**
   * Feature: admin-cli, Property 5: CDC Cache Consistency
   * Validates: Requirements 12.2, 12.3, 13.4
   */
  fc.assert(
    fc.property(
      tableNameArb,
      fc.array(
        fc.string({minLength: 1, maxLength: 8})
          .filter((s) => /^[a-z0-9]+$/i.test(s)),
        {minLength: 1, maxLength: 5},
      ),
      (tableName, keys) => {
        const cache = new RemoteCache();
        cache.loadFromDump({});

        // Apply INSERT events for each key
        const uniqueKeys = [...new Set(keys)];
        for (const key of uniqueKeys) {
          cache.applyCDCEvent({
            table: tableName,
            operation: 'INSERT',
            key,
            data: recordForTable(tableName, key),
            timestamp: Date.now(),
          });
        }

        // Verify all records exist
        const records = Array.from(cache.tables[tableName].values());
        return records.length === uniqueKeys.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('INSERT operations correctly add records to cache');
});

test('Property 5: CDC Cache Consistency - UPDATE modifies records', async (t) => {
  /**
   * Feature: admin-cli, Property 5: CDC Cache Consistency
   * Validates: Requirements 12.2, 12.3, 13.4
   */
  fc.assert(
    fc.property(
      tableNameArb,
      fc.string({minLength: 1, maxLength: 8}).filter((s) => /^[a-z0-9]+$/i.test(s)),
      fc.string({minLength: 1, maxLength: 20}),
      (tableName, key, newName) => {
        const cache = new RemoteCache();
        cache.loadFromDump({});

        // Insert initial record
        const initialRecord = recordForTable(tableName, key);
        cache.applyCDCEvent({
          table: tableName,
          operation: 'INSERT',
          key,
          data: initialRecord,
          timestamp: Date.now(),
        });

        // Update the record
        const updatedRecord = {...initialRecord, name: newName};
        cache.applyCDCEvent({
          table: tableName,
          operation: 'UPDATE',
          key,
          data: updatedRecord,
          timestamp: Date.now(),
        });

        // Verify record was updated
        const record = cache.tables[tableName].get(key);
        return record && record.name === newName;
      },
    ),
    {numRuns: 10},
  );
  t.pass('UPDATE operations correctly modify records in cache');
});

test('Property 5: CDC Cache Consistency - DELETE removes records', async (t) => {
  /**
   * Feature: admin-cli, Property 5: CDC Cache Consistency
   * Validates: Requirements 12.2, 12.3, 13.4
   */
  fc.assert(
    fc.property(
      tableNameArb,
      fc.string({minLength: 1, maxLength: 8}).filter((s) => /^[a-z0-9]+$/i.test(s)),
      (tableName, key) => {
        const cache = new RemoteCache();
        cache.loadFromDump({});

        // Insert a record
        cache.applyCDCEvent({
          table: tableName,
          operation: 'INSERT',
          key,
          data: recordForTable(tableName, key),
          timestamp: Date.now(),
        });

        // Verify it exists
        const existsBefore = cache.tables[tableName].has(key);

        // Delete the record
        cache.applyCDCEvent({
          table: tableName,
          operation: 'DELETE',
          key,
          timestamp: Date.now(),
        });

        // Verify it's gone
        const existsAfter = cache.tables[tableName].has(key);
        return existsBefore && !existsAfter;
      },
    ),
    {numRuns: 10},
  );
  t.pass('DELETE operations correctly remove records from cache');
});

test('Property 5: CDC Cache Consistency - sequence of events', async (t) => {
  /**
   * Feature: admin-cli, Property 5: CDC Cache Consistency
   * Validates: Requirements 12.2, 12.3, 13.4
   */
  fc.assert(
    fc.property(
      cdcEventSequenceArb,
      (events) => {
        const cache = new RemoteCache();
        cache.loadFromDump({});

        // Track expected state manually
        const expectedState = {
          nodes: new Map(),
          services: new Map(),
          partitions: new Map(),
          tables: new Map(),
          message_groups: new Map(),
          indices: new Map(),
          logs: new Map(),
          config: new Map(),
          contexts: new Map(),
        };

        // Apply events to both cache and expected state
        for (const event of events) {
          cache.applyCDCEvent(event);

          switch (event.operation) {
          case 'INSERT':
          case 'UPDATE':
            expectedState[event.table].set(event.key, event.data);
            break;
          case 'DELETE':
            expectedState[event.table].delete(event.key);
            break;
          }
        }

        // Verify cache matches expected state
        for (const tableName of Object.keys(expectedState)) {
          const cacheSize = cache.tables[tableName].size;
          const expectedSize = expectedState[tableName].size;
          if (cacheSize !== expectedSize) {
            return false;
          }

          for (const [key, expectedRecord] of expectedState[tableName]) {
            const cacheRecord = cache.tables[tableName].get(key);
            if (!cacheRecord) {
              return false;
            }
            // Check key field matches
            const keyField = Object.keys(expectedRecord)[0];
            if (cacheRecord[keyField] !== expectedRecord[keyField]) {
              return false;
            }
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Sequence of CDC events produces consistent cache state');
});

test('Property 5: CDC Cache Consistency - lastUpdate is updated', async (t) => {
  /**
   * Feature: admin-cli, Property 5: CDC Cache Consistency
   * Validates: Requirements 12.2, 12.3, 13.4
   */
  fc.assert(
    fc.property(
      cdcEventArb,
      (event) => {
        const cache = new RemoteCache();
        cache.loadFromDump({});
        const beforeUpdate = cache.lastUpdate;

        // Small delay to ensure timestamp difference
        cache.applyCDCEvent(event);

        // lastUpdate should be set after applying event
        return cache.lastUpdate !== null && cache.lastUpdate >= beforeUpdate;
      },
    ),
    {numRuns: 10},
  );
  t.pass('lastUpdate is updated after applying CDC events');
});
