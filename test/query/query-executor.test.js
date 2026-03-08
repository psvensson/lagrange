/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {NodeService} from '../../src/node/node-service.js';
import {ERRORS} from '../../src/constants/index.js';

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
  const partitions = partitionIds.map((partitionId) => ({
    partition_id: partitionId,
    leader_node_id: 'test-node',
  }));

  return {
    services,
    partitions,
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
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

test('QueryExecutor - fails closed when a partition is missing', async (t) => {
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']), // Only p1 has service
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1', 'missing']);

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['missing']);

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

test('QueryExecutor - preserves INSERT OR REPLACE when rebuilding SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT OR REPLACE INTO users (id, name) VALUES (1, \'Alice\')',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /^INSERT OR REPLACE INTO/i);
});

test('QueryExecutor - preserves INSERT OR IGNORE when rebuilding SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT OR IGNORE INTO users (id, name) VALUES (1, \'Alice\')',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /^INSERT OR IGNORE INTO/i);
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

test('QueryExecutor - routes writes when canonical owner is present but raft role is stale',
  async (t) => {
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

  t.equal(result.success, true, 'update should route through canonical leader owner');
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

test('QueryExecutor - preserves NOT IN when rebuilding SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });

  const ast = parseSQL(
    'SELECT * FROM users WHERE status NOT IN (\'deleted\', \'banned\')',
  );
  const sql = executor.buildSelectSQL(ast);

  t.match(sql, /NOT IN/i);
});

test('QueryExecutor - preserves IS NULL when rebuilding SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });

  const ast = parseSQL('SELECT * FROM users WHERE deleted_at IS NULL');
  const sql = executor.buildSelectSQL(ast);

  t.match(sql, /IS NULL/i);
  t.notMatch(sql, /IS NULL\s+NULL/i);
});

test('QueryExecutor - preserves IS NOT NULL when rebuilding SQL', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
  });

  const ast = parseSQL('SELECT * FROM users WHERE email IS NOT NULL');
  const sql = executor.buildSelectSQL(ast);

  t.match(sql, /IS NOT NULL/i);
  t.notMatch(sql, /IS NOT NULL\s+NULL/i);
});

test('QueryExecutor - fails closed on partition query errors', async (t) => {
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

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p1']);
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

test('QueryExecutor - findPartitionLeaderAddress uses canonical partition leader owner',
  (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node2',
      },
    ],
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
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
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
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node2',
      },
    ],
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
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
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

test('QueryExecutor - findPartitionLeaderAddress fails closed without canonical partition leader',
  (t) => {
    const systemCache = {
      services: [
        {
          service_id: 'p1-stale-leader',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node2',
          raft_role: 'leader',
          address: 'node2/partition/p1',
          status: 'active',
        },
      ],
      get: function(_type, _key) {
        return null;
      },
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

    t.equal(address, null);
    t.end();
  });

test('QueryExecutor - findPartitionLeaderAddress allows a fresh bootstrap ' +
  'leader fallback before leader_node_id converges', (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'follower',
        address: 'node1/partition/p1-r1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1-r2',
        status: 'active',
      },
      {
        service_id: 'p1-r3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1-r3',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'node2/partition/p1-r2');
  t.end();
});

test('QueryExecutor - fresh bootstrap fallback still fails closed when leader ' +
  'service metadata is ambiguous', (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1-r1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1-r2',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
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

test('QueryExecutor - executeOnPartition fails closed on stale service leader hints',
  async (t) => {
    let deliveries = 0;
    const systemCache = {
      partitions: [
        {
          partition_id: 'p1',
          leader_node_id: null,
        },
      ],
      services: [
        {
          service_id: 'p1-stale-leader',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node2',
          raft_role: 'leader',
          address: 'node2/partition/p1',
          status: 'active',
        },
      ],
      get: function(type, key) {
        if (type === 'partitions') {
          return this.partitions.find((partition) => partition.partition_id === key) || null;
        }
        return null;
      },
      filter: function(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        if (type === 'partitions') {
          return this.partitions.filter(predicate);
        }
        return [];
      },
    };
    const messageRouter = {
      deliver: async () => {
        deliveries += 1;
        return {acknowledged: true, success: true, rows: []};
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
    });
    executor.leaderRetryAttempts = 1;
    executor.leaderRetryDelayMs = 1;

    const result = await executor.executeOnPartition(
      'p1',
      'INSERT INTO users (id) VALUES (\'1\')',
      [],
      false,
      false,
      false,
    );

    t.equal(result.success, false);
    t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
    t.equal(deliveries, 0, 'write path should not dispatch using stale service hints');
  });

test('QueryExecutor - executeOnPartition dispatches writes during the fresh ' +
  'bootstrap leader window', async (t) => {
  let deliveries = 0;
  let lastAddress = null;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'follower',
        address: 'node1/partition/p1-r1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1-r2',
        status: 'active',
      },
      {
        service_id: 'p1-r3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1-r3',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async (address) => {
      deliveries += 1;
      lastAddress = address;
      return {
        acknowledged: true,
        success: true,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );

  t.equal(result.success, true);
  t.equal(lastAddress, 'node2/partition/p1-r2');
  t.equal(deliveries, 1, 'write path should dispatch through the visible bootstrap leader');
});

test('QueryExecutor - findPartitionLeaderAddress prefers canonical partition leader ' +
  'over stale service raft_role metadata', (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node1',
      },
    ],
    services: [
      {
        service_id: 'p1-node1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: null,
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-node2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'node1/partition/p1');
  t.end();
});

test('QueryExecutor - excludes creating and syncing services from routable candidates',
  (t) => {
    const systemCache = {
      services: [
        {
          service_id: 'p1-creating',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node1',
          raft_role: 'leader',
          address: 'node1/partition/p1',
          status: 'creating',
        },
        {
          service_id: 'p1-syncing',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node2',
          raft_role: 'follower',
          address: 'node2/partition/p1',
          status: 'syncing',
        },
        {
          service_id: 'p1-active',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node3',
          raft_role: 'leader',
          address: 'node3/partition/p1',
          status: 'active',
        },
      ],
      filter(type, predicate) {
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

    const services = executor.getRoutablePartitionServices('p1');

    t.same(
      services.map((service) => service.service_id),
      ['p1-active'],
      'only fully active partition services should be routable',
    );
    t.end();
  });

test('QueryExecutor - read candidates ignore NodeService leader hints', (t) => {
  const originalGetInstance = NodeService.getInstance;
  NodeService.getInstance = () => ({
    getPartitionLeader: () => ({
      address: 'stale-node/partition/p1',
      nodeId: 'stale-node',
      replicaId: 'stale-r1',
    }),
  });

  try {
    const systemCache = {
      services: [
        {
          service_id: 'p1-leader',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'fresh-node',
          raft_role: 'leader',
          address: 'fresh-node/partition/p1',
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

    const candidates = executor.getPartitionServiceCandidates('p1', true, true);

    t.equal(
      candidates[0]?.address,
      'fresh-node/partition/p1',
      'read routing must use services table leader, not NodeService hint',
    );
  } finally {
    NodeService.getInstance = originalGetInstance;
  }
  t.end();
});

test('QueryExecutor - follows leader redirect response', async (t) => {
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);

  // Mock router that returns redirect on first call, success on second
  let callCount = 0;
  const redirectRouter = {
    deliver: async function(address, message) {
      callCount++;
      if (message.type === 'QUERY') {
        // First call to follower returns redirect
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        // Second call to leader succeeds
        if (address === 'leader-node/partition/p1') {
          return {
            acknowledged: true,
            success: true,
            rows: mockPartitionData.get('p1') || [],
            changes: 1,
          };
        }
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };

  // Cache returns follower address first
  const systemCache = {
    services: [
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/p1',
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
    messageRouter: redirectRouter,
    systemCache,
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, true, 'query should succeed after redirect');
  t.equal(result.rows.length, 1, 'should return data from leader');
  t.equal(callCount, 2, 'should make two calls (follower + leader)');

  mockPartitionData.clear();
});

test('QueryExecutor - handles redirect when leader also fails', async (t) => {
  // Mock router where both follower and leader fail
  const failingRouter = {
    deliver: async function(address, message) {
      if (message.type === 'QUERY') {
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        // Leader also fails
        return {
          acknowledged: true,
          success: false,
          error: 'Leader unavailable',
          partitionId: 'p1',
        };
      }
      return {acknowledged: true, success: true};
    },
  };

  const systemCache = {
    services: [
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/p1',
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
    messageRouter: failingRouter,
    systemCache,
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, false, 'query fails closed when all replicas fail');
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p1']);
});

// --- RETURNING clause reconstruction tests (Requirements: 3.2, 3.3) ---

test('QueryExecutor - buildInsertSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING *',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildInsertSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING id, name',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildInsertSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\')',
  );
  const sql = executor.buildInsertSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

test('QueryExecutor - buildUpdateSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING *',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildUpdateSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING id, name',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildUpdateSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\'',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

test('QueryExecutor - buildDeleteSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'DELETE FROM users WHERE id = \'a\' RETURNING *',
  );
  const sql = executor.buildDeleteSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildDeleteSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'DELETE FROM users WHERE id = \'a\' RETURNING id, name',
  );
  const sql = executor.buildDeleteSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildDeleteSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL('DELETE FROM users WHERE id = \'a\'');
  const sql = executor.buildDeleteSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

// --- Derived table FROM clause tests (Requirements: 12.2) ---

test('QueryExecutor - buildSelectSQL emits derived table in FROM',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {
        type: 'table',
        name: null,
        alias: 't',
        subquery: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: 'id'}],
          from: {type: 'table', name: 'users', alias: null},
          joins: [],
          where: null,
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
      },
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM \(SELECT id FROM users\) AS t/);
  });

test('QueryExecutor - buildSelectSQL emits derived table in JOIN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'orders', alias: null},
      joins: [{
        joinType: 'INNER',
        table: {
          type: 'table',
          name: null,
          alias: 'u',
          subquery: {
            type: 'SELECT',
            columns: [{type: 'column_ref', table: null, column: 'id'}],
            from: {type: 'table', name: 'users', alias: null},
            joins: [],
            where: null,
            groupBy: null,
            having: null,
            orderBy: null,
            limit: null,
          },
        },
        condition: {
          type: 'binary_expr',
          operator: '=',
          left: {type: 'column_ref', table: 'orders', column: 'user_id'},
          right: {type: 'column_ref', table: 'u', column: 'id'},
        },
      }],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM orders/);
    t.match(sql, /INNER JOIN \(SELECT id FROM users\) AS u/);
  });

test('QueryExecutor - buildSelectSQL uses table name when no subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = parseSQL('SELECT * FROM users WHERE id = \'1\'');
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM users/);
    t.notMatch(sql, /FROM \(/);
  });

// --- CAST expression reconstruction tests (Requirements: 6.4) ---

test('QueryExecutor - buildExpressionSQL emits CAST with affinity',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'cast',
      expression: {type: 'column_ref', table: null, column: 'age'},
      affinity: 'TEXT',
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CAST(age AS TEXT)');
  });

test('QueryExecutor - buildExpressionSQL emits CAST with nested expression',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'cast',
      expression: {type: 'literal', value: 42},
      affinity: 'REAL',
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CAST(42 AS REAL)');
  });

// --- CASE expression reconstruction tests (Requirements: 11.3) ---

test('QueryExecutor - buildExpressionSQL emits searched CASE WHEN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: null,
      conditions: [
        {
          when: {
            type: 'binary',
            operator: '>',
            left: {type: 'column_ref', table: null, column: 'age'},
            right: {type: 'literal', value: 18},
          },
          then: {type: 'literal', value: 'adult'},
        },
      ],
      elseExpr: {type: 'literal', value: 'minor'},
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CASE WHEN (age > 18) THEN \'adult\' ELSE \'minor\' END');
  });

test('QueryExecutor - buildExpressionSQL emits CASE with multiple WHEN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: null,
      conditions: [
        {
          when: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'active'},
          },
          then: {type: 'literal', value: 1},
        },
        {
          when: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'pending'},
          },
          then: {type: 'literal', value: 2},
        },
      ],
      elseExpr: {type: 'literal', value: 0},
    };
    const sql = executor.buildExpressionSQL(expr);

    t.match(sql, /CASE WHEN/);
    t.match(sql, /THEN 1/);
    t.match(sql, /THEN 2/);
    t.match(sql, /ELSE 0 END/);
  });

test('QueryExecutor - buildExpressionSQL emits simple CASE with operand',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'case',
      operand: {type: 'column_ref', table: null, column: 'status'},
      conditions: [
        {
          when: {type: 'literal', value: 'active'},
          then: {type: 'literal', value: 1},
        },
      ],
      elseExpr: null,
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CASE status WHEN \'active\' THEN 1 END');
  });

// --- Subquery expression reconstruction tests (Requirements: 9.4) ---

test('QueryExecutor - buildExpressionSQL emits subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'subquery',
      query: {
        type: 'SELECT',
        columns: [{type: 'column_ref', table: null, column: 'id'}],
        from: {type: 'table', name: 'users', alias: null},
        joins: [],
        where: null,
        groupBy: null,
        having: null,
        orderBy: null,
        limit: null,
      },
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, '(SELECT id FROM users)');
  });

// --- EXISTS expression reconstruction tests (Requirements: 9.4) ---

test('QueryExecutor - buildExpressionSQL emits EXISTS subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'exists',
      query: {
        type: 'SELECT',
        columns: [{type: 'literal', value: 1}],
        from: {type: 'table', name: 'orders', alias: null},
        joins: [],
        where: {
          type: 'binary',
          operator: '=',
          left: {type: 'column_ref', table: 'orders', column: 'user_id'},
          right: {type: 'column_ref', table: 'u', column: 'id'},
        },
        groupBy: null,
        having: null,
        orderBy: null,
        limit: null,
      },
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(
      sql,
      'EXISTS (SELECT 1 FROM orders' +
      ' WHERE (orders.user_id = u.id))',
    );
  });

// --- Function call expression reconstruction tests (Requirements: 6.4) ---

test('QueryExecutor - buildExpressionSQL emits function_call',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'LOWER',
      args: [
        {type: 'column_ref', table: null, column: 'name'},
      ],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'LOWER(name)');
  });

test('QueryExecutor - buildExpressionSQL emits function_call with multiple args',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'COALESCE',
      args: [
        {type: 'column_ref', table: null, column: 'nickname'},
        {type: 'column_ref', table: null, column: 'name'},
        {type: 'literal', value: 'unknown'},
      ],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'COALESCE(nickname, name, \'unknown\')');
  });

test('QueryExecutor - buildExpressionSQL emits function_call with no args',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'function_call',
      name: 'datetime',
      args: [{type: 'literal', value: 'now'}],
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'datetime(\'now\')');
  });

// --- CTE prefix reconstruction tests (Requirements: 10.2) ---

test('QueryExecutor - buildSelectSQL emits CTE prefix',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'active_users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [{
        name: 'active_users',
        query: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: '*'}],
          from: {type: 'table', name: 'users', alias: null},
          joins: [],
          where: {
            type: 'binary',
            operator: '=',
            left: {type: 'column_ref', table: null, column: 'status'},
            right: {type: 'literal', value: 'active'},
          },
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
        recursive: false,
      }],
      recursive: false,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH active_users AS \(/);
    t.match(sql, /SELECT \* FROM users WHERE/);
    t.match(sql, /\) SELECT \* FROM active_users$/);
  });

test('QueryExecutor - buildSelectSQL emits WITH RECURSIVE prefix',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'tree', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [{
        name: 'tree',
        query: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: 'id'}],
          from: {type: 'table', name: 'nodes', alias: null},
          joins: [],
          where: null,
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
        recursive: true,
      }],
      recursive: true,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH RECURSIVE tree AS \(/);
  });

test('QueryExecutor - buildSelectSQL emits multiple CTEs',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const innerSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'cte_a', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      ctes: [
        {name: 'cte_a', query: innerSelect, recursive: false},
        {name: 'cte_b', query: innerSelect, recursive: false},
      ],
      recursive: false,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /^WITH cte_a AS \(/);
    t.match(sql, /cte_b AS \(/);
    t.match(sql, /SELECT \* FROM cte_a$/);
  });

test('QueryExecutor - buildSelectSQL omits CTE when ctes is empty',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = parseSQL('SELECT * FROM users');
    const sql = executor.buildSelectSQL(ast);

    t.notMatch(sql, /WITH/);
  });

// --- Set operation reconstruction tests (Requirements: 13.2) ---

test('QueryExecutor - buildSelectSQL emits UNION',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'archived_users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'UNION', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /SELECT id FROM users UNION SELECT id FROM archived_users/);
  });

test('QueryExecutor - buildSelectSQL emits UNION ALL',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'name'}],
      from: {type: 'table', name: 'contacts', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'name'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'UNION ALL', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /UNION ALL SELECT name FROM contacts/);
  });

test('QueryExecutor - buildSelectSQL emits INTERSECT',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'premium', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'INTERSECT', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /INTERSECT SELECT id FROM premium/);
  });

test('QueryExecutor - buildSelectSQL emits EXCEPT',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const rightSelect = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'banned', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: 'id'}],
      from: {type: 'table', name: 'users', alias: null},
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
      setOperation: {type: 'EXCEPT', right: rightSelect},
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /EXCEPT SELECT id FROM banned/);
  });

test('QueryExecutor - buildSelectSQL omits set operation when absent',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const ast = parseSQL('SELECT id FROM users');
    const sql = executor.buildSelectSQL(ast);

    t.notMatch(sql, /UNION|INTERSECT|EXCEPT/);
  });
