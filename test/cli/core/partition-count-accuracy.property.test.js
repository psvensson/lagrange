/**
 * Property Test: Partition Count Accuracy
 *
 * Property 26: Partition Count Accuracy
 * *For any* table in the system, the partition_count field should equal the
 * number of partition records with matching table_id in the partitions cache.
 *
 * Validates: Requirements 4.6, 4.9
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

/**
 * Arbitrary for generating a table ID
 */
const tableIdArb = fc.string({minLength: 1, maxLength: 10})
  .filter((s) => /^[a-z0-9-]+$/i.test(s))
  .map((s) => `tbl-${s}`);

/**
 * Arbitrary for generating a partition record
 */
const partitionArb = (tableId) => fc.record({
  partition_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s))
    .map((s) => `p-${s}`),
  table_id: fc.constant(tableId),
  replica_count: fc.integer({min: 1, max: 5}),
  size_bytes: fc.integer({min: 0, max: 1000000}),
});

/**
 * Arbitrary for generating a table with its partitions
 */
const tableWithPartitionsArb = fc.tuple(
  tableIdArb,
  fc.integer({min: 0, max: 10}),
).chain(([tableId, partitionCount]) =>
  fc.tuple(
    fc.constant({table_id: tableId, table_name: `table-${tableId}`}),
    fc.array(partitionArb(tableId), {
      minLength: partitionCount,
      maxLength: partitionCount,
    }),
  ),
);

test('Property 26: Partition Count Accuracy - single table', async (t) => {
  /**
   * Feature: admin-cli, Property 26: Partition Count Accuracy
   * Validates: Requirements 4.6, 4.9
   */
  fc.assert(
    fc.property(
      tableWithPartitionsArb,
      ([table, partitions]) => {
        const cache = new RemoteCache();

        // Make partition IDs unique
        const uniquePartitions = partitions.map((p, i) => ({
          ...p,
          partition_id: `${p.partition_id}-${i}`,
        }));

        cache.loadFromDump({
          tables: [table],
          partitions: uniquePartitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // partition_count should equal the number of partitions
        return enriched.partition_count === uniquePartitions.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition count equals number of partition records');
});

test('Property 26: Partition Count Accuracy - multiple tables', async (t) => {
  /**
   * Feature: admin-cli, Property 26: Partition Count Accuracy
   * Validates: Requirements 4.6, 4.9
   */
  fc.assert(
    fc.property(
      fc.array(tableWithPartitionsArb, {minLength: 1, maxLength: 5}),
      (tablesWithPartitions) => {
        const cache = new RemoteCache();

        // Make table and partition IDs unique
        const tables = tablesWithPartitions.map(([table], i) => ({
          ...table,
          table_id: `${table.table_id}-${i}`,
        }));

        const allPartitions = [];
        tablesWithPartitions.forEach(([_, partitions], tableIndex) => {
          partitions.forEach((p, partitionIndex) => {
            allPartitions.push({
              ...p,
              table_id: tables[tableIndex].table_id,
              partition_id: `${p.partition_id}-${tableIndex}-${partitionIndex}`,
            });
          });
        });

        cache.loadFromDump({
          tables,
          partitions: allPartitions,
        });

        const computer = new TableMetadataComputer(cache);

        // Check each table's partition count
        for (let i = 0; i < tables.length; i++) {
          const enriched = computer.computeMetadata(tables[i]);
          const expectedCount = tablesWithPartitions[i][1].length;
          if (enriched.partition_count !== expectedCount) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition count accurate for multiple tables');
});

test('Property 26: Partition Count Accuracy - zero partitions', async (t) => {
  /**
   * Feature: admin-cli, Property 26: Partition Count Accuracy
   * Validates: Requirements 4.6, 4.9
   */
  fc.assert(
    fc.property(
      tableIdArb,
      (tableId) => {
        const cache = new RemoteCache();
        const table = {table_id: tableId, table_name: `table-${tableId}`};

        cache.loadFromDump({
          tables: [table],
          partitions: [],
        });

        const computer = new TableMetadataComputer(cache);
        const enriched = computer.computeMetadata(table);

        // partition_count should be 0 for tables with no partitions
        return enriched.partition_count === 0;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition count is 0 for tables with no partitions');
});

test('Property 26: Partition Count Accuracy - only counts matching table_id', async (t) => {
  /**
   * Feature: admin-cli, Property 26: Partition Count Accuracy
   * Validates: Requirements 4.6, 4.9
   */
  fc.assert(
    fc.property(
      fc.integer({min: 1, max: 5}),
      fc.integer({min: 1, max: 5}),
      (table1Count, table2Count) => {
        const cache = new RemoteCache();

        const table1 = {table_id: 'tbl-1', table_name: 'table1'};
        const table2 = {table_id: 'tbl-2', table_name: 'table2'};

        const partitions = [];
        for (let i = 0; i < table1Count; i++) {
          partitions.push({
            partition_id: `p-1-${i}`,
            table_id: 'tbl-1',
            replica_count: 3,
          });
        }
        for (let i = 0; i < table2Count; i++) {
          partitions.push({
            partition_id: `p-2-${i}`,
            table_id: 'tbl-2',
            replica_count: 3,
          });
        }

        cache.loadFromDump({
          tables: [table1, table2],
          partitions,
        });

        const computer = new TableMetadataComputer(cache);
        const enriched1 = computer.computeMetadata(table1);
        const enriched2 = computer.computeMetadata(table2);

        return enriched1.partition_count === table1Count &&
                   enriched2.partition_count === table2Count;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Partition count only counts partitions with matching table_id');
});
