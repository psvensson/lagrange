/**
 * Property Test: Metadata Enrichment Idempotence
 *
 * Property 28: Metadata Enrichment Idempotence
 * *For any* table record, enriching it multiple times should produce the same
 * result as enriching it once (f(x) = f(f(x))).
 *
 * Validates: Requirements 4.6, 4.7
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

/**
 * Arbitrary for generating a table record
 */
const tableArb = fc.record({
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s))
    .map((s) => `tbl-${s}`),
  table_name: fc.string({minLength: 1, maxLength: 20}),
  table_policies: fc.string({minLength: 0, maxLength: 50}),
});

/**
 * Arbitrary for generating partition records for a table
 */
const _partitionsForTableArb = (tableId) => fc.array(
  fc.record({
    partition_id: fc.string({minLength: 1, maxLength: 10})
      .filter((s) => /^[a-z0-9-]+$/i.test(s)),
    table_id: fc.constant(tableId),
    replica_count: fc.integer({min: 1, max: 5}),
    size_bytes: fc.integer({min: 0, max: 1000000}),
  }),
  {minLength: 0, maxLength: 10},
).map((partitions) =>
  // Make partition IDs unique
  partitions.map((p, i) => ({...p, partition_id: `p-${p.partition_id}-${i}`})),
);

/**
 * Helper to deep compare two objects
 */
function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

test('Property 28: Metadata Enrichment Idempotence - f(x) = f(f(x))', async (t) => {
  /**
   * Feature: admin-cli, Property 28: Metadata Enrichment Idempotence
   * Validates: Requirements 4.6, 4.7
   */
  fc.assert(
    fc.property(
      tableArb,
      fc.integer({min: 0, max: 10}),
      (table, partitionCount) => {
        const cache = new RemoteCache();

        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p-${i}`,
            table_id: table.table_id,
            replica_count: 3,
            size_bytes: 1000,
          });
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);

        // First enrichment
        const enriched1 = computer.computeMetadata(table);

        // Clear cache to force recomputation
        computer.invalidateCache();

        // Second enrichment of the already enriched result
        const enriched2 = computer.computeMetadata(enriched1);

        // Results should be equal
        return deepEqual(enriched1, enriched2);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Enriching twice produces same result as enriching once');
});

test('Property 28: Metadata Enrichment Idempotence - multiple applications', async (t) => {
  /**
   * Feature: admin-cli, Property 28: Metadata Enrichment Idempotence
   * Validates: Requirements 4.6, 4.7
   */
  fc.assert(
    fc.property(
      tableArb,
      fc.integer({min: 2, max: 5}),
      (table, applications) => {
        const cache = new RemoteCache();

        cache.loadFromDump({
          tables: [table],
          partitions: [
            {partition_id: 'p-1', table_id: table.table_id, replica_count: 3},
            {partition_id: 'p-2', table_id: table.table_id, replica_count: 3},
          ],
        });

        const computer = new TableMetadataComputer(cache);

        // First enrichment
        let result = computer.computeMetadata(table);
        const firstResult = {...result};

        // Apply enrichment multiple times
        for (let i = 1; i < applications; i++) {
          computer.invalidateCache();
          result = computer.computeMetadata(result);
        }

        // All applications should produce the same result
        return deepEqual(firstResult, result);
      },
    ),
    {numRuns: 10},
  );
  t.pass('Multiple enrichment applications produce same result');
});

test('Property 28: Metadata Enrichment Idempotence - preserves original fields', async (t) => {
  /**
   * Feature: admin-cli, Property 28: Metadata Enrichment Idempotence
   * Validates: Requirements 4.6, 4.7
   */
  fc.assert(
    fc.property(
      tableArb,
      (table) => {
        const cache = new RemoteCache();

        cache.loadFromDump({
          tables: [table],
          partitions: [],
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // Original fields should be preserved
        return enriched.table_id === table.table_id &&
                   enriched.table_name === table.table_name &&
                   enriched.table_policies === table.table_policies;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Enrichment preserves original table fields');
});

test('Property 28: Metadata Enrichment Idempotence - computed fields stable', async (t) => {
  /**
   * Feature: admin-cli, Property 28: Metadata Enrichment Idempotence
   * Validates: Requirements 4.6, 4.7
   */
  fc.assert(
    fc.property(
      tableArb,
      fc.array(fc.integer({min: 1, max: 5}), {minLength: 1, maxLength: 10}),
      (table, replicaCounts) => {
        const cache = new RemoteCache();

        const partitions = replicaCounts.map((count, i) => ({
          partition_id: `p-${i}`,
          table_id: table.table_id,
          replica_count: count,
          size_bytes: 1000 * (i + 1),
        }));

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);

        // Enrich multiple times
        const enriched1 = computer.computeMetadata(table);
        computer.invalidateCache();
        const enriched2 = computer.computeMetadata(table);
        computer.invalidateCache();
        const enriched3 = computer.computeMetadata(table);

        // Computed fields should be stable
        return enriched1.partition_count === enriched2.partition_count &&
                   enriched2.partition_count === enriched3.partition_count &&
                   enriched1.replica_factor === enriched2.replica_factor &&
                   enriched2.replica_factor === enriched3.replica_factor &&
                   enriched1.total_size === enriched2.total_size &&
                   enriched2.total_size === enriched3.total_size;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Computed fields are stable across multiple enrichments');
});
