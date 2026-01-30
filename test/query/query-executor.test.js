/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';

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
      // Extract partition ID from address (format: nodeId/partition/partitionId)
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
    raft_role: 'leader',
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

// Helper to parse SQL
function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

test('QueryExecutor - executes SELECT on single partition', async (t) => {
  mockPartitionData.set('p1', [
    {id: 1, name: 'Alice', age: 30},
    {id: 2, name: 'Bob', age: 25},
  ]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);
  t.equal(result.partitions.length, 1);

  mockPartitionData.clear();
});

test('QueryExecutor - executes SELECT on multiple partitions', async (t) => {
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);
  mockPartitionData.set('p3', [{id: 3, name: 'Charlie'}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2', 'p3']),
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2', 'p3']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 3);
  t.equal(result.partitions.length, 3);

  mockPartitionData.clear();
});

test('QueryExecutor - returns empty for no partitions', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, []);

  t.equal(result.success, true);
  t.equal(result.rows.length, 0);
});

test('QueryExecutor - handles missing partition gracefully', async (t) => {
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']), // Only p1 has service
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'missing']);

  t.equal(result.success, true);
  t.equal(result.rows.length, 1); // Only p1 returns data

  mockPartitionData.clear();
});

test('QueryExecutor - applies ORDER BY across partitions', async (t) => {
  mockPartitionData.set('p1', [
    {id: 3, name: 'Charlie'},
    {id: 1, name: 'Alice'},
  ]);
  mockPartitionData.set('p2', [
    {id: 2, name: 'Bob'},
    {id: 4, name: 'Diana'},
  ]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT * FROM users ORDER BY name ASC');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 4);
  t.equal(result.rows[0].name, 'Alice');
  t.equal(result.rows[1].name, 'Bob');
  t.equal(result.rows[2].name, 'Charlie');
  t.equal(result.rows[3].name, 'Diana');

  mockPartitionData.clear();
});

test('QueryExecutor - applies ORDER BY DESC', async (t) => {
  mockPartitionData.set('p1', [{id: 1, age: 30}, {id: 2, age: 20}]);
  mockPartitionData.set('p2', [{id: 3, age: 25}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT * FROM users ORDER BY age DESC');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0].age, 30);
  t.equal(result.rows[1].age, 25);
  t.equal(result.rows[2].age, 20);

  mockPartitionData.clear();
});

test('QueryExecutor - applies LIMIT across partitions', async (t) => {
  mockPartitionData.set('p1', [{id: 1}, {id: 2}]);
  mockPartitionData.set('p2', [{id: 3}, {id: 4}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT * FROM users LIMIT 2');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 2);

  mockPartitionData.clear();
});

test('QueryExecutor - applies LIMIT with OFFSET', async (t) => {
  mockPartitionData.set('p1', [{id: 1}, {id: 2}]);
  mockPartitionData.set('p2', [{id: 3}, {id: 4}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT * FROM users LIMIT 2 OFFSET 1');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 2);
  // Rows 2, 3 (skipping first row)

  mockPartitionData.clear();
});

test('QueryExecutor - applies DISTINCT across partitions', async (t) => {
  mockPartitionData.set('p1', [{status: 'active'}, {status: 'inactive'}]);
  mockPartitionData.set('p2', [{status: 'active'}, {status: 'pending'}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT DISTINCT status FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 3); // active, inactive, pending

  mockPartitionData.clear();
});

test('QueryExecutor - computes COUNT aggregate', async (t) => {
  mockPartitionData.set('p1', [{id: 1}, {id: 2}]);
  mockPartitionData.set('p2', [{id: 3}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT COUNT(*) FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 1);
  t.equal(result.rows[0]['COUNT(*)'], 3);

  mockPartitionData.clear();
});

test('QueryExecutor - computes SUM aggregate', async (t) => {
  mockPartitionData.set('p1', [{amount: 100}, {amount: 200}]);
  mockPartitionData.set('p2', [{amount: 150}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT SUM(amount) FROM orders');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0]['SUM(amount)'], 450);

  mockPartitionData.clear();
});

test('QueryExecutor - computes AVG aggregate', async (t) => {
  mockPartitionData.set('p1', [{score: 80}, {score: 90}]);
  mockPartitionData.set('p2', [{score: 100}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT AVG(score) FROM tests');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows[0]['AVG(score)'], 90);

  mockPartitionData.clear();
});

test('QueryExecutor - computes MIN/MAX aggregates', async (t) => {
  mockPartitionData.set('p1', [{price: 50}, {price: 100}]);
  mockPartitionData.set('p2', [{price: 75}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const minAst = parseSQL('SELECT MIN(price) FROM products');
  const minResult = await executor.executeSelect(minAst, ['p1', 'p2']);
  t.equal(minResult.rows[0]['MIN(price)'], 50);

  const maxAst = parseSQL('SELECT MAX(price) FROM products');
  const maxResult = await executor.executeSelect(maxAst, ['p1', 'p2']);
  t.equal(maxResult.rows[0]['MAX(price)'], 100);

  mockPartitionData.clear();
});

test('QueryExecutor - applies GROUP BY across partitions', async (t) => {
  mockPartitionData.set('p1', [
    {category: 'A', amount: 100},
    {category: 'B', amount: 50},
  ]);
  mockPartitionData.set('p2', [
    {category: 'A', amount: 150},
    {category: 'C', amount: 75},
  ]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('SELECT category, SUM(amount) FROM sales GROUP BY category');
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.rows.length, 3); // A, B, C

  const catA = result.rows.find((r) => r.category === 'A');
  t.equal(catA['SUM(amount)'], 250);

  mockPartitionData.clear();
});

test('QueryExecutor - executes INSERT on partition', async (t) => {
  mockPartitionData.set('p1', []);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });

  const ast = parseSQL('INSERT INTO users (id, name) VALUES (1, \'Alice\')');
  const result = await executor.executeInsert(ast, 'p1');

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.ok(result.affectedRows >= 1);

  mockPartitionData.clear();
});

test('QueryExecutor - executes UPDATE on partitions', async (t) => {
  mockPartitionData.set('p1', [{id: 1}]);
  mockPartitionData.set('p2', [{id: 2}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1', 'p2']),
  });

  const ast = parseSQL('UPDATE users SET status = \'active\' WHERE id > 0');
  const result = await executor.executeUpdate(ast, ['p1', 'p2']);

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 2);

  mockPartitionData.clear();
});

test('QueryExecutor - executes DELETE on partitions', async (t) => {
  mockPartitionData.set('p1', [{id: 1}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });

  const ast = parseSQL('DELETE FROM users WHERE id = 1');
  const result = await executor.executeDelete(ast, ['p1']);

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');

  mockPartitionData.clear();
});

test('QueryExecutor - throws for INSERT on missing partition', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]), // No services
  });

  const ast = parseSQL('INSERT INTO users (id) VALUES (1)');

  await t.rejects(
    executor.executeInsert(ast, 'missing'),
    /Insert failed|Partition service not found/,
  );
});

test('QueryExecutor - routes writes when no leader is present', async (t) => {
  mockPartitionData.set('p1', [{id: 1}]);

  const router = createMockMessageRouter();
  const systemCache = createMockSystemCache(['p1']);
  systemCache.services = systemCache.services.map((service) => ({
    ...service,
    raft_role: 'follower',
  }));

  const executor = new QueryExecutor({
    messageRouter: router,
    systemCache,
  });

  const ast = parseSQL('UPDATE users SET status = \'active\' WHERE id = 1');
  const result = await executor.executeUpdate(ast, ['p1']);

  t.equal(result.success, true, 'update should still route without leader');
  t.equal(result.partitions.length, 1, 'should target the partition');

  mockPartitionData.clear();
});

test('QueryExecutor - builds correct SELECT SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });

  // Test with a simple query
  const ast = parseSQL('SELECT id, name FROM users WHERE age > 18 ORDER BY name LIMIT 10');

  // Access private method for testing
  const sql = executor.buildSelectSQL(ast);

  t.ok(sql.includes('SELECT'));
  t.ok(sql.includes('id'));
  t.ok(sql.includes('name'));
  t.ok(sql.includes('FROM users'));
  t.ok(sql.includes('WHERE'));
  t.ok(sql.includes('ORDER BY'));
  t.ok(sql.includes('LIMIT 10'));
});

test('QueryExecutor - handles partition query errors', async (t) => {
  // Create a message router that returns errors
  const errorRouter = {
    deliver: async function(_address, _message) {
      return {
        acknowledged: true,
        success: false,
        error: 'Database error',
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter: errorRouter,
    systemCache: createMockSystemCache(['p1']),
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  // Should not throw, but return empty rows for failed partition
  t.equal(result.success, true);
  t.equal(result.rows.length, 0);
});

test('QueryExecutor - findPartitionLeaderAddress returns leader address', (t) => {
  const systemCache = createMockSystemCache(['p1']);
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'test-node/partition/p1');
  t.end();
});

test('QueryExecutor - findPartitionLeaderAddress returns null when no leader', (t) => {
  const systemCache = {
    filter: function(type, _predicate) {
      if (type === 'services') {
        return [];
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, null);
  t.end();
});

test('QueryExecutor - findPartitionLeaderAddress returns null when cache unavailable', (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: null,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, null);
  t.end();
});

test('QueryExecutor - findPartitionLeaderAddress filters by leader role', (t) => {
  const systemCache = {
    services: [
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'follower',
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'node2/partition/p1');
  t.end();
});

test('QueryExecutor - findPartitionLeaderAddress filters by active status', (t) => {
  const systemCache = {
    services: [
      {
        service_id: 'p1-inactive',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1',
        status: 'inactive',
      },
      {
        service_id: 'p1-active',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'node2/partition/p1');
  t.end();
});
