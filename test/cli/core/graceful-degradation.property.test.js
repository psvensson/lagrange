/**
 * Property Test: Graceful Degradation
 *
 * Property 29: Graceful Degradation
 * *For any* table record with missing, null, or malformed metadata fields, the
 * enrichment process should complete without throwing errors and should populate
 * missing fields with computed values or appropriate defaults (0, null, "N/A", "Default").
 *
 * Validates: Requirements 19.6, 19.7, 19.8, 19.9
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

/**
 * Arbitrary for generating a table with potentially missing fields
 */
const incompleteTableArb = fc.record({
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_name: fc.option(fc.string({minLength: 1, maxLength: 20}), {nil: undefined}),
  table_policies: fc.option(fc.string({minLength: 0, maxLength: 50}), {nil: undefined}),
});

/**
 * Arbitrary for generating partitions with potentially missing fields
 */
const incompletePartitionArb = fc.record({
  partition_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  replica_count: fc.option(fc.integer({min: 1, max: 5}), {nil: undefined}),
  size_bytes: fc.option(fc.integer({min: 0, max: 1000000}), {nil: undefined}),
});

test('Property 29: Graceful Degradation - no errors on missing table fields', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      incompleteTableArb,
      (table) => {
        const cache = new RemoteCache();

        cache.loadFromDump({
          tables: [table],
          partitions: [],
        });

        const computer = new TableMetadataComputer(cache);

        // Should not throw
        try {
          const enriched = computer.computeMetadata(table);
          // Should have computed fields
          return enriched.partition_count !== undefined &&
                     enriched.replica_factor !== undefined;
        } catch (_e) {
          return false;
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('Enrichment completes without errors on missing table fields');
});

test('Property 29: Graceful Degradation - no errors on missing partition fields', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      fc.array(incompletePartitionArb, {minLength: 1, maxLength: 5}),
      (partitions) => {
        const cache = new RemoteCache();
        const tableId = partitions[0].table_id;
        const table = {table_id: tableId, table_name: 'test'};

        // Make partition IDs unique and ensure same table_id
        const uniquePartitions = partitions.map((p, i) => ({
          ...p,
          partition_id: `p-${i}`,
          table_id: tableId,
        }));

        cache.loadFromDump({
          tables: [table],
          partitions: uniquePartitions,
        });

        const computer = new TableMetadataComputer(cache);

        // Should not throw
        try {
          const enriched = computer.computeMetadata(table);
          return enriched !== undefined;
        } catch (_e) {
          return false;
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('Enrichment completes without errors on missing partition fields');
});

test('Property 29: Graceful Degradation - null table returns null', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  const cache = new RemoteCache();
  cache.loadFromDump({tables: [], partitions: []});
  const computer = new TableMetadataComputer(cache);

  // Should not throw on null/undefined
  const result1 = computer.computeMetadata(null);
  const result2 = computer.computeMetadata(undefined);

  t.equal(result1, null, 'null input returns null');
  t.equal(result2, undefined, 'undefined input returns undefined');
});

test('Property 29: Graceful Degradation - empty table object', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  const cache = new RemoteCache();
  cache.loadFromDump({tables: [], partitions: []});
  const computer = new TableMetadataComputer(cache);

  // Should not throw on empty object
  const result = computer.computeMetadata({});

  t.same(result, {}, 'empty object returns empty object');
});

test('Property 29: Graceful Degradation - defaults for no partitions', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      fc.string({minLength: 1, maxLength: 10})
        .filter((s) => /^[a-z0-9]+$/i.test(s)),
      (tableId) => {
        const cache = new RemoteCache();
        const table = {table_id: tableId, table_name: 'test'};

        cache.loadFromDump({
          tables: [table],
          partitions: [],
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // Should have appropriate defaults
        return enriched.partition_count === 0 &&
                   enriched.replica_factor === null &&
                   enriched.total_size === 0;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Appropriate defaults for tables with no partitions');
});

test('Property 29: Graceful Degradation - handles null replica_count', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 5}),
      (partitionCount) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        // All partitions have null/undefined replica_count
        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p-${i}`,
            table_id: 'tbl-1',
            replica_count: null,
          });
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // Should handle gracefully - replica_factor should be null
        return enriched.partition_count === partitionCount &&
                   enriched.replica_factor === null;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Handles partitions with null replica_count gracefully');
});

test('Property 29: Graceful Degradation - handles null size_bytes', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 5}),
      (partitionCount) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        // All partitions have null/undefined size_bytes
        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p-${i}`,
            table_id: 'tbl-1',
            replica_count: 3,
            size_bytes: null,
          });
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // Should handle gracefully - total_size should be null
        return enriched.partition_count === partitionCount &&
                   enriched.total_size === null;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Handles partitions with null size_bytes gracefully');
});

test('Property 29: Graceful Degradation - mixed valid and invalid data', async (t) => {
  /**
   * Feature: admin-cli, Property 29: Graceful Degradation
   * Validates: Requirements 19.6, 19.7, 19.8, 19.9
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 3}),
      fc.integer({min: 1, max: 3}),
      (validCount, invalidCount) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        const partitions = [];
        // Valid partitions
        for (let i = 0; i < validCount; i++) {
          partitions.push({
            partition_id: `p-valid-${i}`,
            table_id: 'tbl-1',
            replica_count: 3,
            size_bytes: 1000,
          });
        }
        // Invalid partitions (missing fields)
        for (let i = 0; i < invalidCount; i++) {
          partitions.push({
            partition_id: `p-invalid-${i}`,
            table_id: 'tbl-1',
          });
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);

        try {
          const enriched = computer.computeMetadata(table);
          // Should count all partitions
          return enriched.partition_count === validCount + invalidCount &&
                     // Should compute replica_factor from valid partitions
                     enriched.replica_factor === 3;
        } catch (_e) {
          return false;
        }
      },
    ),
    {numRuns: 10},
  );
  t.pass('Handles mixed valid and invalid partition data gracefully');
});
