import {test} from '../../../src/test-helpers/tap.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {TableMetadataComputer} from '../../../src/cli/core/table-metadata-computer.js';

test('TableMetadataComputer - constructor initializes correctly', async (t) => {
  const cache = new RemoteCache();
  const computer = new TableMetadataComputer(cache);

  t.ok(computer.cache === cache, 'cache is set');
  t.ok(computer.metadataCache instanceof Map, 'metadataCache is a Map');
  t.equal(computer.lastCacheUpdate, null, 'lastCacheUpdate is null');
});

test('TableMetadataComputer - computePartitionCount returns correct count', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1'},
      {partition_id: 'p-2', table_id: 'tbl-1'},
      {partition_id: 'p-3', table_id: 'tbl-1'},
      {partition_id: 'p-4', table_id: 'tbl-2'},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const count = computer.computePartitionCount('tbl-1');

  t.equal(count, 3, 'partition count is 3');
});

test('TableMetadataComputer - computePartitionCount returns 0 for no partitions', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  const count = computer.computePartitionCount('tbl-1');

  t.equal(count, 0, 'partition count is 0');
});

test('TableMetadataComputer - computeReplicaFactor returns most common', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3},
      {partition_id: 'p-2', table_id: 'tbl-1', replica_count: 3},
      {partition_id: 'p-3', table_id: 'tbl-1', replica_count: 5},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const factor = computer.computeReplicaFactor('tbl-1');

  t.equal(factor, 3, 'replica factor is 3 (most common)');
});

test('TableMetadataComputer - computeReplicaFactor returns null for no partitions', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  const factor = computer.computeReplicaFactor('tbl-1');

  t.equal(factor, null, 'replica factor is null');
});

test('TableMetadataComputer - computeTotalSize sums partition sizes', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1', size_bytes: 1000},
      {partition_id: 'p-2', table_id: 'tbl-1', size_bytes: 2000},
      {partition_id: 'p-3', table_id: 'tbl-1', size_bytes: 3000},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const size = computer.computeTotalSize('tbl-1');

  t.equal(size, 6000, 'total size is 6000');
});

test('TableMetadataComputer - computeTotalSize returns 0 for no partitions', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  const size = computer.computeTotalSize('tbl-1');

  t.equal(size, 0, 'total size is 0');
});

test('TableMetadataComputer - computeTotalSize returns null for missing sizes', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1'},
      {partition_id: 'p-2', table_id: 'tbl-1'},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const size = computer.computeTotalSize('tbl-1');

  t.equal(size, null, 'total size is null when no sizes available');
});

test('TableMetadataComputer - computeMetadata enriches table', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3, size_bytes: 1000},
      {partition_id: 'p-2', table_id: 'tbl-1', replica_count: 3, size_bytes: 2000},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const table = cache.getTable('tbl-1');
  const enriched = computer.computeMetadata(table);

  t.equal(enriched.table_id, 'tbl-1', 'table_id preserved');
  t.equal(enriched.table_name, 'users', 'table_name preserved');
  t.equal(enriched.partition_count, 2, 'partition_count computed');
  t.equal(enriched.replica_factor, 3, 'replica_factor computed');
  t.equal(enriched.total_size, 3000, 'total_size computed');
});

test('TableMetadataComputer - computeMetadata caches results', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const table = cache.getTable('tbl-1');

  const enriched1 = computer.computeMetadata(table);
  const enriched2 = computer.computeMetadata(table);

  t.equal(enriched1, enriched2, 'same object returned from cache');
  t.equal(computer.metadataCache.size, 1, 'one entry in cache');
});

test('TableMetadataComputer - invalidateCache clears metadata', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  const table = cache.getTable('tbl-1');
  computer.computeMetadata(table);

  t.equal(computer.metadataCache.size, 1, 'cache has entry');

  computer.invalidateCache();

  t.equal(computer.metadataCache.size, 0, 'cache is empty');
});

test('TableMetadataComputer - invalidateTable clears specific table', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [
      {table_id: 'tbl-1', table_name: 'users'},
      {table_id: 'tbl-2', table_name: 'orders'},
    ],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  computer.computeMetadata(cache.getTable('tbl-1'));
  computer.computeMetadata(cache.getTable('tbl-2'));

  t.equal(computer.metadataCache.size, 2, 'cache has 2 entries');

  computer.invalidateTable('tbl-1');

  t.equal(computer.metadataCache.size, 1, 'cache has 1 entry');
  t.equal(computer.metadataCache.has('tbl-2'), true, 'tbl-2 still cached');
});

test('TableMetadataComputer - auto-invalidates on cache update', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [{partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3}],
  });

  const computer = new TableMetadataComputer(cache);
  const table = cache.getTable('tbl-1');
  const enriched1 = computer.computeMetadata(table);

  t.equal(enriched1.partition_count, 1, 'initial partition count is 1');
  t.equal(computer.metadataCache.size, 1, 'metadata is cached');

  // Manually invalidate to simulate what happens when cache.lastUpdate changes
  computer.invalidateCache();

  // Add a new partition to the cache
  cache.tables.partitions.set('p-2', {
    partition_id: 'p-2',
    table_id: 'tbl-1',
    replica_count: 3,
  });

  // Now compute metadata again - should reflect the new partition
  const enriched2 = computer.computeMetadata(table);

  t.equal(enriched2.partition_count, 2, 'partition count updated to 2');
});

test('TableMetadataComputer - getTablesWithMetadata returns all tables', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [
      {table_id: 'tbl-1', table_name: 'users'},
      {table_id: 'tbl-2', table_name: 'orders'},
    ],
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3},
      {partition_id: 'p-2', table_id: 'tbl-2', replica_count: 5},
    ],
  });

  const computer = new TableMetadataComputer(cache);
  const tables = computer.getTablesWithMetadata();

  t.equal(tables.length, 2, 'returns 2 tables');
  t.ok(tables.every((t) => t.partition_count !== undefined), 'all have partition_count');
  t.ok(tables.every((t) => t.replica_factor !== undefined), 'all have replica_factor');
});

test('TableMetadataComputer - getTableWithMetadata returns single table', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [{partition_id: 'p-1', table_id: 'tbl-1', replica_count: 3}],
  });

  const computer = new TableMetadataComputer(cache);
  const table = computer.getTableWithMetadata('tbl-1');

  t.equal(table.table_id, 'tbl-1', 'correct table returned');
  t.equal(table.partition_count, 1, 'partition_count computed');
});

test('TableMetadataComputer - getTableWithMetadata returns undefined for missing', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({tables: [], partitions: []});

  const computer = new TableMetadataComputer(cache);
  const table = computer.getTableWithMetadata('nonexistent');

  t.equal(table, undefined, 'returns undefined for missing table');
});

test('TableMetadataComputer - handles null/undefined table gracefully', async (t) => {
  const cache = new RemoteCache();
  const computer = new TableMetadataComputer(cache);

  const result1 = computer.computeMetadata(null);
  const result2 = computer.computeMetadata(undefined);
  const result3 = computer.computeMetadata({});

  t.equal(result1, null, 'returns null for null input');
  t.equal(result2, undefined, 'returns undefined for undefined input');
  t.same(result3, {}, 'returns empty object for empty input');
});

test('TableMetadataComputer - getStats returns statistics', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
    partitions: [],
  });

  const computer = new TableMetadataComputer(cache);
  computer.computeMetadata(cache.getTable('tbl-1'));

  const stats = computer.getStats();

  t.equal(stats.cachedTables, 1, 'cachedTables is 1');
  t.ok(stats.lastCacheUpdate !== null, 'lastCacheUpdate is set');
});
