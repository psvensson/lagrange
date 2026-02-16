/**
 * Partition Resolver Tests
 * Tests for routing queries to appropriate partitions based on PRIMARY KEY.
 * Requirements: 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {SQLParser} from '../../src/query/sql-parser.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Helper to create test partitions
function createPartitions() {
  return [
    {
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 'm',
    },
    {
      partition_id: 'p2',
      table_name: 'users',
      partition_key_start: 'm',
      partition_key_end: 'z',
    },
    {
      partition_id: 'p3',
      table_name: 'users',
      partition_key_start: 'z',
      partition_key_end: null,
    },
  ];
}

// Helper to parse WHERE clause
function parseWhere(sql) {
  const parser = new SQLParser(sql);
  const ast = parser.parse();
  return ast.where;
}

test('PartitionResolver - routes to all partitions without WHERE', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();

  const result = resolver.resolvePartitions('users', null, partitions);

  t.equal(result.length, 3);
  t.same(result.sort(), ['p1', 'p2', 'p3']);
});

test('PartitionResolver - routes to single partition with equals', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id = \'alice\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  t.equal(result.length, 1);
  t.equal(result[0], 'p1'); // 'alice' < 'm'
});

test('PartitionResolver - routes to correct partition for key in middle', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id = \'peter\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  t.equal(result.length, 1);
  t.equal(result[0], 'p2'); // 'm' <= 'peter' < 'z'
});

test('PartitionResolver - routes to last partition for high key', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id = \'zack\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  t.equal(result.length, 1);
  t.equal(result[0], 'p3'); // 'zack' >= 'z'
});

test('PartitionResolver - routes to multiple partitions with IN clause', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id IN (\'alice\', \'peter\', \'zack\')');

  const result = resolver.resolvePartitions('users', where, partitions);

  t.equal(result.length, 3);
  t.same(result.sort(), ['p1', 'p2', 'p3']);
});

test('PartitionResolver - routes to subset with IN clause', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id IN (\'alice\', \'bob\')');

  const result = resolver.resolvePartitions('users', where, partitions);

  t.equal(result.length, 1);
  t.equal(result[0], 'p1'); // Both 'alice' and 'bob' < 'm'
});

test('PartitionResolver - routes with range query (>=)', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id >= \'n\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  // Should include p2 and p3 (keys >= 'n')
  t.ok(result.includes('p2'));
  t.ok(result.includes('p3'));
});

test('PartitionResolver - routes with range query (<)', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id < \'n\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  // Should include p1 and p2 (keys < 'n')
  t.ok(result.includes('p1'));
  t.ok(result.includes('p2'));
});

test('PartitionResolver - routes with BETWEEN', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id BETWEEN \'a\' AND \'n\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  // Should include p1 and p2
  t.ok(result.includes('p1'));
  t.ok(result.includes('p2'));
});

test('PartitionResolver - scatter-gather for non-key WHERE', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE name = \'John\'');

  const result = resolver.resolvePartitions('users', where, partitions);

  // Non-key filter should query all partitions
  t.equal(result.length, 3);
});

test('PartitionResolver - scatter-gather for OR conditions', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere(
    'SELECT * FROM users WHERE id = \'alice\' OR name = \'John\'',
  );

  const result = resolver.resolvePartitions('users', where, partitions);

  // OR with non-key condition should query all partitions
  t.equal(result.length, 3);
});

test('PartitionResolver - handles AND with key condition', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere(
    'SELECT * FROM users WHERE id = \'alice\' AND status = \'active\'',
  );

  const result = resolver.resolvePartitions('users', where, partitions);

  // AND with key condition should route to specific partition
  t.equal(result.length, 1);
  t.equal(result[0], 'p1');
});

test('PartitionResolver - resolvePartitionForKey finds correct partition', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();

  t.equal(resolver.resolvePartitionForKey('users', 'alice', partitions), 'p1');
  t.equal(resolver.resolvePartitionForKey('users', 'peter', partitions), 'p2');
  t.equal(resolver.resolvePartitionForKey('users', 'zack', partitions), 'p3');
});

test('PartitionResolver - handles boundary values', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();

  // 'm' is the boundary - should be in p2 (>= m)
  t.equal(resolver.resolvePartitionForKey('users', 'm', partitions), 'p2');

  // 'z' is the boundary - should be in p3 (>= z)
  t.equal(resolver.resolvePartitionForKey('users', 'z', partitions), 'p3');
});

test('PartitionResolver - handles numeric keys', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: 100},
    {partition_id: 'p2', partition_key_start: 100, partition_key_end: 200},
    {partition_id: 'p3', partition_key_start: 200, partition_key_end: null},
  ];

  t.equal(resolver.resolvePartitionForKey('items', 50, partitions), 'p1');
  t.equal(resolver.resolvePartitionForKey('items', 150, partitions), 'p2');
  t.equal(resolver.resolvePartitionForKey('items', 250, partitions), 'p3');
});

test('PartitionResolver - handles single partition (full range)', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {partition_id: 'p1', partition_key_start: null, partition_key_end: null},
  ];

  const result = resolver.resolvePartitions('users', null, partitions);
  t.equal(result.length, 1);
  t.equal(result[0], 'p1');

  // Any key should resolve to the single partition
  t.equal(resolver.resolvePartitionForKey('users', 'anything', partitions), 'p1');
});

test('PartitionResolver - returns empty for no partitions', async (t) => {
  const resolver = new PartitionResolver();

  const result = resolver.resolvePartitions('users', null, []);
  t.equal(result.length, 0);
});

test('PartitionResolver - getAllPartitions returns all', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();

  const result = resolver.getAllPartitions('users', partitions);
  t.equal(result.length, 3);
});

test('PartitionResolver - handles keyRange format', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {partitionId: 'p1', keyRange: {start: null, end: 'm'}},
    {partitionId: 'p2', keyRange: {start: 'm', end: null}},
  ];

  t.equal(resolver.resolvePartitionForKey('users', 'alice', partitions), 'p1');
  t.equal(resolver.resolvePartitionForKey('users', 'peter', partitions), 'p2');
});

test('PartitionResolver - routes with parameterized key predicates', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE id = ?');

  const result = resolver.resolvePartitions(
    'users',
    where,
    partitions,
    {params: ['alice']},
  );

  t.same(result, ['p1']);
  t.equal(resolver.getLastResolutionInfo().predicateShape, 'eq');
});

test('PartitionResolver - supports key predicate with parameter on left side', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = createPartitions();
  const where = parseWhere('SELECT * FROM users WHERE ? < id');

  const result = resolver.resolvePartitions(
    'users',
    where,
    partitions,
    {params: ['n']},
  );

  t.ok(result.includes('p2'));
  t.ok(result.includes('p3'));
  t.equal(resolver.getLastResolutionInfo().predicateShape, 'range');
});

test('PartitionResolver - supports composite key pruning with equality', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {
      partition_id: 'p1',
      partition_key_start: null,
      partition_key_end: '[\"n\"',
    },
    {
      partition_id: 'p2',
      partition_key_start: '[\"n\"',
      partition_key_end: null,
    },
  ];
  const where = parseWhere(
    'SELECT * FROM users WHERE tenant_id = \'alice\' AND id = 7',
  );

  const result = resolver.resolvePartitions(
    'users',
    where,
    partitions,
    {keyColumns: ['tenant_id', 'id']},
  );

  t.same(result, ['p1']);
  t.equal(resolver.getLastResolutionInfo().predicateShape, 'eq');
});

test('PartitionResolver - scatters when composite key predicate is incomplete', async (t) => {
  const resolver = new PartitionResolver();
  const partitions = [
    {
      partition_id: 'p1',
      partition_key_start: null,
      partition_key_end: '[\"n\"',
    },
    {
      partition_id: 'p2',
      partition_key_start: '[\"n\"',
      partition_key_end: null,
    },
  ];
  const where = parseWhere(
    'SELECT * FROM users WHERE tenant_id = ?',
  );

  const result = resolver.resolvePartitions(
    'users',
    where,
    partitions,
    {
      params: ['alice'],
      keyColumns: ['tenant_id', 'id'],
    },
  );

  t.same(result.sort(), ['p1', 'p2']);
  t.equal(resolver.getLastResolutionInfo().predicateShape, 'scatter');
});
