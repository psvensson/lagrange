/**
 * Property Test: CDC Selective Update
 * Property 32: For any CDC event that modifies a partition, only the table
 * owning that partition should have its metadata recomputed, not all tables
 * in the cache.
 *
 * **Validates: Requirements 12.10, 13.8**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

test('Property 32: CDC Selective Update', async (t) => {
  await t.test('partition CDC event only affects owning table metadata', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 5}),
        fc.integer({min: 1, max: 3}),
        (numTables, partitionsPerTable) => {
          const cache = new RemoteCache();
          const computer = new TableMetadataComputer(cache);

          const tables = [];
          const partitions = [];

          for (let i = 0; i < numTables; i++) {
            const tableId = `table_${i}`;
            tables.push({
              table_id: tableId,
              table_name: `Table ${i}`,
              table_policies: '{}',
            });

            for (let p = 0; p < partitionsPerTable; p++) {
              partitions.push({
                partition_id: `partition_${i}_${p}`,
                table_id: tableId,
                replica_count: 3,
                size_bytes: 1000,
                status: 'active',
              });
            }
          }

          cache.loadFromDump({
            tables,
            partitions,
            nodes: [],
            services: [],
            message_groups: [],
            indices: [],
            logs: [],
            config: [],
            contexts: [],
          });

          const initialMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            initialMetadata[table.table_id] = enriched.partition_count;
          }

          const targetTableId = 'table_0';
          cache.applyCDCEvent({
            table: 'partitions',
            operation: 'INSERT',
            key: 'partition_0_new',
            data: {
              partition_id: 'partition_0_new',
              table_id: targetTableId,
              replica_count: 3,
              size_bytes: 2000,
              status: 'active',
            },
            timestamp: Date.now(),
          });

          const newMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            newMetadata[table.table_id] = enriched.partition_count;
          }

          // Target table should have one more partition
          if (newMetadata[targetTableId] !== initialMetadata[targetTableId] + 1) {
            return false;
          }

          // Other tables should have same partition count
          for (let i = 1; i < numTables; i++) {
            const tableId = `table_${i}`;
            if (newMetadata[tableId] !== initialMetadata[tableId]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition CDC event only affects owning table metadata');
  });

  await t.test('partition update CDC event affects only owning table', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 4}),
        (numTables) => {
          const cache = new RemoteCache();
          const computer = new TableMetadataComputer(cache);

          const tables = [];
          const partitions = [];

          for (let i = 0; i < numTables; i++) {
            const tableId = `table_${i}`;
            tables.push({
              table_id: tableId,
              table_name: `Table ${i}`,
              table_policies: '{}',
            });

            partitions.push({
              partition_id: `partition_${i}_0`,
              table_id: tableId,
              replica_count: 3,
              size_bytes: 1000,
              status: 'active',
            });
          }

          cache.loadFromDump({
            tables,
            partitions,
            nodes: [],
            services: [],
            message_groups: [],
            indices: [],
            logs: [],
            config: [],
            contexts: [],
          });

          const initialMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            initialMetadata[table.table_id] = enriched.total_size;
          }

          const targetTableId = 'table_0';
          cache.applyCDCEvent({
            table: 'partitions',
            operation: 'UPDATE',
            key: 'partition_0_0',
            data: {
              partition_id: 'partition_0_0',
              table_id: targetTableId,
              replica_count: 3,
              size_bytes: 5000,
              status: 'active',
            },
            timestamp: Date.now(),
          });

          const newMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            newMetadata[table.table_id] = enriched.total_size;
          }

          // Target table should have updated size
          if (newMetadata[targetTableId] !== 5000) {
            return false;
          }

          // Other tables should have same size
          for (let i = 1; i < numTables; i++) {
            const tableId = `table_${i}`;
            if (newMetadata[tableId] !== initialMetadata[tableId]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition update CDC event affects only owning table');
  });

  await t.test('partition delete CDC event affects only owning table', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 2, max: 4}),
        (numTables) => {
          const cache = new RemoteCache();
          const computer = new TableMetadataComputer(cache);

          const tables = [];
          const partitions = [];

          for (let i = 0; i < numTables; i++) {
            const tableId = `table_${i}`;
            tables.push({
              table_id: tableId,
              table_name: `Table ${i}`,
              table_policies: '{}',
            });

            for (let p = 0; p < 2; p++) {
              partitions.push({
                partition_id: `partition_${i}_${p}`,
                table_id: tableId,
                replica_count: 3,
                size_bytes: 1000,
                status: 'active',
              });
            }
          }

          cache.loadFromDump({
            tables,
            partitions,
            nodes: [],
            services: [],
            message_groups: [],
            indices: [],
            logs: [],
            config: [],
            contexts: [],
          });

          const initialMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            initialMetadata[table.table_id] = enriched.partition_count;
          }

          const targetTableId = 'table_0';
          cache.applyCDCEvent({
            table: 'partitions',
            operation: 'DELETE',
            key: 'partition_0_0',
            data: null,
            timestamp: Date.now(),
          });

          const newMetadata = {};
          for (const table of tables) {
            const enriched = computer.computeMetadata(table);
            newMetadata[table.table_id] = enriched.partition_count;
          }

          // Target table should have one less partition
          if (newMetadata[targetTableId] !== initialMetadata[targetTableId] - 1) {
            return false;
          }

          // Other tables should have same partition count
          for (let i = 1; i < numTables; i++) {
            const tableId = `table_${i}`;
            if (newMetadata[tableId] !== initialMetadata[tableId]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Partition delete CDC event affects only owning table');
  });
});
