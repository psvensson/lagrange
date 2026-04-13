/**
 * Property Test: Replica Factor Most Common
 *
 * Property 27: Replica Factor Most Common
 * *For any* table with partitions, the replica_factor field should be the most
 * frequently occurring replica_count value among that table's partitions.
 *
 * Validates: Requirements 4.7
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

/**
 * Helper to find the most common value in an array
 */
function findMostCommon(values) {
  if (values.length === 0) return null;

  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] || 0) + 1;
  }

  let maxCount = 0;
  let mostCommon = null;
  for (const [value, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = parseInt(value, 10);
    }
  }

  return mostCommon;
}

/**
 * Arbitrary for generating replica counts with a dominant value
 */
const replicaCountsArb = fc.tuple(
  fc.integer({min: 1, max: 5}), // dominant replica count
  fc.integer({min: 1, max: 5}), // how many times it appears
  fc.array(fc.integer({min: 1, max: 5}), {minLength: 0, maxLength: 3}), // other counts
).map(([dominant, dominantCount, others]) => {
  const counts = [];
  for (let i = 0; i < dominantCount; i++) {
    counts.push(dominant);
  }
  // Add fewer of each other value to ensure dominant is most common
  for (const other of others) {
    if (other !== dominant) {
      counts.push(other);
    }
  }
  return counts;
});

test('Property 27: Replica Factor Most Common - basic case', async (t) => {
  /**
   * Feature: admin-cli, Property 27: Replica Factor Most Common
   * Validates: Requirements 4.7
   */
  fc.assert(
    fc.property(
      replicaCountsArb,
      (replicaCounts) => {
        if (replicaCounts.length === 0) return true;

        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        const partitions = replicaCounts.map((count, i) => ({
          partition_id: `p-${i}`,
          table_id: 'tbl-1',
          replica_count: count,
        }));

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        const expected = findMostCommon(replicaCounts);
        return enriched.replica_factor === expected;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Replica factor equals most common replica_count');
});

test('Property 27: Replica Factor Most Common - uniform replica counts', async (t) => {
  /**
   * Feature: admin-cli, Property 27: Replica Factor Most Common
   * Validates: Requirements 4.7
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 5}),
      fc.integer({min: 1, max: 10}),
      (replicaCount, partitionCount) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p-${i}`,
            table_id: 'tbl-1',
            replica_count: replicaCount,
          });
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // When all partitions have the same replica_count, that should be the factor
        return enriched.replica_factor === replicaCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Replica factor correct when all partitions have same count');
});

test('Property 27: Replica Factor Most Common - no partitions returns null', async (t) => {
  /**
   * Feature: admin-cli, Property 27: Replica Factor Most Common
   * Validates: Requirements 4.7
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

        // No partitions means replica_factor should be null
        return enriched.replica_factor === null;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Replica factor is null when table has no partitions');
});

test('Property 27: Replica Factor Most Common - mixed counts', async (t) => {
  /**
   * Feature: admin-cli, Property 27: Replica Factor Most Common
   * Validates: Requirements 4.7
   */
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          replica_count: fc.integer({min: 1, max: 5}),
          count: fc.integer({min: 1, max: 5}),
        }),
        {minLength: 1, maxLength: 5},
      ),
      (distribution) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        const partitions = [];
        let partitionIndex = 0;
        const allReplicaCounts = [];

        for (const {replica_count: replicaCount, count} of distribution) {
          for (let i = 0; i < count; i++) {
            partitions.push({
              partition_id: `p-${partitionIndex++}`,
              table_id: 'tbl-1',
              replica_count: replicaCount,
            });
            allReplicaCounts.push(replicaCount);
          }
        }

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        const expected = findMostCommon(allReplicaCounts);
        return enriched.replica_factor === expected;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Replica factor correct with mixed replica counts');
});

test('Property 27: Replica Factor Most Common - handles missing replica_count', async (t) => {
  /**
   * Feature: admin-cli, Property 27: Replica Factor Most Common
   * Validates: Requirements 4.7
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 5}),
      fc.integer({min: 1, max: 5}),
      (validCount, validPartitions) => {
        const cache = new RemoteCache();
        const table = {table_id: 'tbl-1', table_name: 'test'};

        const partitions = [];
        // Add partitions with valid replica_count
        for (let i = 0; i < validPartitions; i++) {
          partitions.push({
            partition_id: `p-valid-${i}`,
            table_id: 'tbl-1',
            replica_count: validCount,
          });
        }
        // Add partition without replica_count
        partitions.push({
          partition_id: 'p-missing',
          table_id: 'tbl-1',
        });

        cache.loadFromDump({
          tables: [table],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // Should still return the most common valid replica_count
        return enriched.replica_factor === validCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Replica factor ignores partitions without replica_count');
});
