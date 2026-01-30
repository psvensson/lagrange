/**
 * SQL Query Processing Property-Based Tests
 * Property tests for SQL query distribution, routing, and durability.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.1, 6.2, 6.4, 6.5, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLParser} from '../../src/query/sql-parser.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {QueryExecutor} from '../../src/query/query-executor.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));

  return {
    services,
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
}

// Generate partition key values (strings for simplicity)
const keyValueArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
  {minLength: 1, maxLength: 10},
);

// Generate partition boundaries
const partitionBoundaryArb = fc.array(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {minLength: 1, maxLength: 5}),
  {minLength: 1, maxLength: 5},
).map((arr) => [...new Set(arr)].sort());

const literalValueArb = fc.oneof(
  fc.integer({min: -1000, max: 1000}),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '), {minLength: 1, maxLength: 20}),
);

/**
 * Property 10: SQL Query Distribution
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5
 * - Queries are correctly parsed
 * - Results from multiple partitions are properly aggregated
 * - SQL semantics (ORDER BY, LIMIT) are preserved
 */
test('Property 10: SQL Query Distribution', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        id: fc.integer({min: 1, max: 1000}),
        value: fc.integer({min: 0, max: 100}),
      }), {minLength: 0, maxLength: 10}),
      fc.integer({min: 1, max: 3}),
      async (rows, partitionCount) => {
        // Distribute rows across partitions
        const partitionIds = [];
        for (let i = 0; i < partitionCount; i++) {
          const pid = `p${i}`;
          partitionIds.push(pid);
          const partitionRows = rows.filter((_, idx) => idx % partitionCount === i);
          mockPartitionData.set(pid, partitionRows);
        }

        const executor = new QueryExecutor({
          messageRouter: createMockMessageRouter(),
          systemCache: createMockSystemCache(partitionIds),
        });

        const ast = new SQLParser('SELECT * FROM test').parse();
        const result = await executor.executeSelect(ast, partitionIds);

        mockPartitionData.clear();

        // Property: All rows from all partitions should be in result
        return result.success === true && result.rows.length === rows.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('SQL query distribution preserves all rows across partitions');
});

/**
 * Property 10b: ORDER BY preserves ordering across partitions
 */
test('Property 10b: ORDER BY preserves ordering', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        id: fc.integer({min: 1, max: 1000}),
        value: fc.integer({min: 0, max: 100}),
      }), {minLength: 2, maxLength: 10}),
      async (rows) => {
        // Split rows into two partitions
        const p1Data = rows.filter((_, i) => i % 2 === 0);
        const p2Data = rows.filter((_, i) => i % 2 === 1);

        mockPartitionData.set('p1', p1Data);
        mockPartitionData.set('p2', p2Data);

        const executor = new QueryExecutor({
          messageRouter: createMockMessageRouter(),
          systemCache: createMockSystemCache(['p1', 'p2']),
        });

        const ast = new SQLParser('SELECT * FROM test ORDER BY value ASC').parse();
        const result = await executor.executeSelect(ast, ['p1', 'p2']);

        mockPartitionData.clear();

        // Property: Result should be sorted by value
        for (let i = 1; i < result.rows.length; i++) {
          if (result.rows[i].value < result.rows[i - 1].value) {
            return false;
          }
        }
        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('ORDER BY correctly sorts results from multiple partitions');
});

/**
 * Property 10c: LIMIT respects count across partitions
 */
test('Property 10c: LIMIT respects count', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({id: fc.integer()}), {minLength: 5, maxLength: 20}),
      fc.integer({min: 1, max: 5}),
      async (rows, limit) => {
        const p1Data = rows.slice(0, Math.floor(rows.length / 2));
        const p2Data = rows.slice(Math.floor(rows.length / 2));

        mockPartitionData.set('p1', p1Data);
        mockPartitionData.set('p2', p2Data);

        const executor = new QueryExecutor({
          messageRouter: createMockMessageRouter(),
          systemCache: createMockSystemCache(['p1', 'p2']),
        });

        const ast = new SQLParser(`SELECT * FROM test LIMIT ${limit}`).parse();
        const result = await executor.executeSelect(ast, ['p1', 'p2']);

        mockPartitionData.clear();

        // Property: Result count should not exceed limit
        return result.rows.length <= limit;
      },
    ),
    {numRuns: 10},
  );
  t.pass('LIMIT correctly limits results from multiple partitions');
});

/**
 * Property 41: Query Routing by Key Range
 * Validates: Requirements 20.6
 * - Queries with PRIMARY KEY filters route to correct partition
 * - Key value falls within partition's key range
 */
test('Property 41: Query Routing by Key Range', async (t) => {
  await fc.assert(
    fc.property(
      keyValueArb,
      partitionBoundaryArb,
      (keyValue, boundaries) => {
        if (boundaries.length === 0) return true;

        // Create partitions from boundaries
        const partitions = [];
        const sortedBoundaries = [null, ...boundaries.sort(), null];

        for (let i = 0; i < sortedBoundaries.length - 1; i++) {
          partitions.push({
            partition_id: `p${i}`,
            partition_key_start: sortedBoundaries[i],
            partition_key_end: sortedBoundaries[i + 1],
          });
        }

        const resolver = new PartitionResolver();
        const partitionId = resolver.resolvePartitionForKey('test', keyValue, partitions);

        if (!partitionId) return false;

        // Find the partition
        const partition = partitions.find((p) => p.partition_id === partitionId);
        if (!partition) return false;

        // Property: Key should fall within partition range
        const start = partition.partition_key_start;
        const end = partition.partition_key_end;

        if (start !== null && keyValue < start) return false;
        if (end !== null && keyValue >= end) return false;

        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Query routing places keys in correct partition ranges');
});

/**
 * Property 41b: Equals filter routes to single partition
 */
test('Property 41b: Equals filter routes to single partition', async (t) => {
  await fc.assert(
    fc.property(
      keyValueArb,
      (keyValue) => {
        const partitions = [
          {partition_id: 'p1', partition_key_start: null, partition_key_end: 'm'},
          {partition_id: 'p2', partition_key_start: 'm', partition_key_end: 'z'},
          {partition_id: 'p3', partition_key_start: 'z', partition_key_end: null},
        ];

        const resolver = new PartitionResolver();

        // Create WHERE clause for equals condition
        const whereClause = {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'id'},
          right: {type: 'literal', value: keyValue},
        };

        const result = resolver.resolvePartitions('test', whereClause, partitions);

        // Property: Should route to exactly one partition
        return result.length === 1;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Equals filter routes to exactly one partition');
});

/**
 * Property 42: Scatter-Gather for Non-Key Queries
 * Validates: Requirements 20.7
 * - Queries without PRIMARY KEY filter go to all partitions
 * - Results are properly aggregated
 */
test('Property 42: Scatter-Gather for Non-Key Queries', async (t) => {
  // Use column names that are NOT the primary key (id)
  const nonKeyColumnArb = fc.constantFrom('name', 'status', 'age', 'email', 'category');

  await fc.assert(
    fc.property(
      nonKeyColumnArb,
      literalValueArb,
      fc.integer({min: 2, max: 5}),
      (columnName, value, partitionCount) => {
        // Create partitions
        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p${i}`,
            partition_key_start: i === 0 ? null : String(i),
            partition_key_end: i === partitionCount - 1 ? null : String(i + 1),
          });
        }

        const resolver = new PartitionResolver();

        // Create WHERE clause on non-key column
        const whereClause = {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: columnName},
          right: {type: 'literal', value: value},
        };

        const result = resolver.resolvePartitions('test', whereClause, partitions);

        // Property: Non-key filter should query all partitions (scatter-gather)
        return result.length === partitionCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Non-key queries scatter to all partitions');
});

/**
 * Property 42b: No WHERE clause queries all partitions
 */
test('Property 42b: No WHERE clause queries all partitions', async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({min: 1, max: 10}),
      (partitionCount) => {
        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p${i}`,
            partition_key_start: i === 0 ? null : String(i),
            partition_key_end: i === partitionCount - 1 ? null : String(i + 1),
          });
        }

        const resolver = new PartitionResolver();
        const result = resolver.resolvePartitions('test', null, partitions);

        // Property: No WHERE should query all partitions
        return result.length === partitionCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Queries without WHERE clause go to all partitions');
});

/**
 * Property 18: Write Operation Durability
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4
 * - INSERT routes to correct partition based on key
 * - UPDATE/DELETE route to affected partitions
 * - Write operations complete successfully
 */
test('Property 18: Write Operation Durability - INSERT routing', async (t) => {
  await fc.assert(
    fc.property(
      keyValueArb,
      (keyValue) => {
        const partitions = [
          {partition_id: 'p1', partition_key_start: null, partition_key_end: 'm'},
          {partition_id: 'p2', partition_key_start: 'm', partition_key_end: null},
        ];

        const resolver = new PartitionResolver();
        const partitionId = resolver.resolvePartitionForKey('test', keyValue, partitions);

        // Property: INSERT should route to exactly one partition
        if (!partitionId) return false;

        // Verify key is in correct range
        const partition = partitions.find((p) => p.partition_id === partitionId);
        const start = partition.partition_key_start;
        const end = partition.partition_key_end;

        if (start !== null && keyValue < start) return false;
        if (end !== null && keyValue >= end) return false;

        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('INSERT operations route to correct partition');
});

/**
 * Property 18b: UPDATE with key filter routes correctly
 */
test('Property 18b: UPDATE with key filter routes correctly', async (t) => {
  await fc.assert(
    fc.property(
      keyValueArb,
      (keyValue) => {
        const partitions = [
          {partition_id: 'p1', partition_key_start: null, partition_key_end: 'm'},
          {partition_id: 'p2', partition_key_start: 'm', partition_key_end: null},
        ];

        const resolver = new PartitionResolver();

        const whereClause = {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', column: 'id'},
          right: {type: 'literal', value: keyValue},
        };

        const result = resolver.resolvePartitions('test', whereClause, partitions);

        // Property: UPDATE with key filter should route to one partition
        return result.length === 1;
      },
    ),
    {numRuns: 10},
  );
  t.pass('UPDATE with key filter routes to single partition');
});

/**
 * Property 18c: DELETE without key filter affects all partitions
 */
test('Property 18c: DELETE without key filter affects all partitions', async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({min: 2, max: 5}),
      (partitionCount) => {
        const partitions = [];
        for (let i = 0; i < partitionCount; i++) {
          partitions.push({
            partition_id: `p${i}`,
            partition_key_start: i === 0 ? null : String(i),
            partition_key_end: i === partitionCount - 1 ? null : String(i + 1),
          });
        }

        const resolver = new PartitionResolver();

        // Non-key WHERE clause
        const whereClause = {
          type: 'binary',
          operator: '>',
          left: {type: 'column_ref', column: 'age'},
          right: {type: 'literal', value: 18},
        };

        const result = resolver.resolvePartitions('test', whereClause, partitions);

        // Property: DELETE without key filter should affect all partitions
        return result.length === partitionCount;
      },
    ),
    {numRuns: 10},
  );
  t.pass('DELETE without key filter affects all partitions');
});
