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
import {
  COLUMN,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {MIGRATION_PARTITION_OPERATION} from '../../src/migration/migration-constants.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  QUERY_DEFAULTS,
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';

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

function createReadinessCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()].filter(predicate);
      }
      return [];
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
        return;
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

function createReadinessPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
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

test('QueryExecutor - preserves zero affected rows for INSERT OR IGNORE no-op',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    executor.executeOnPartition = async () => ({
      success: true,
      changes: 0,
      rows: [],
    });

    const ast = parseSQL(
      'INSERT OR IGNORE INTO users (id, name) VALUES (1, \'Alice\')',
    );
    const result = await executor.executeInsert(ast, 'p1');

    t.equal(result.affectedRows, 0);
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

test('QueryExecutor - findPartitionLeaderAddress forwards one explicit routing ' +
  'readiness dimension', (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: null,
  });
  let receivedRoutingReadinessDimension = null;
  executor.getPartitionServiceCandidates = (
    partitionId,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    routingReadinessDimension,
  ) => {
    t.equal(partitionId, 'p1');
    t.equal(forRead, false);
    t.equal(preferLeader, false);
    t.equal(preferSameLatencyGroup, false);
    receivedRoutingReadinessDimension = routingReadinessDimension;
    return [{address: 'node-a/partition/p1'}];
  };

  const address = executor.findPartitionLeaderAddress(
    'p1',
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(address, 'node-a/partition/p1');
  t.equal(
    receivedRoutingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'leader lookups should honor the requested readiness dimension',
  );
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

test('QueryExecutor - findPartitionLeaderAddress stays closed when the ' +
  'canonical leader service row is missing', (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
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
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    nodeId: 'local-node',
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(
    address,
    null,
    'strict leader lookups must not treat follower redirects as visible leader service rows',
  );
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

test('QueryExecutor - fresh bootstrap routing admits transport-connected ' +
  'services while node heartbeat publication lags', (t) => {
  const now = 140000;
  const nodeIds = ['node1', 'node2', 'node3'];
  const partitionId = 'p-bootstrap-lag';
  const systemCache = {
    partitions: [{
      partition_id: partitionId,
      leader_node_id: null,
      created_at: now - 1000,
      updated_at: now - 1000,
    }],
    services: nodeIds.map((nodeId, index) => ({
      service_id: `${partitionId}-r${index + 1}`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      raft_role: index === 0 ? 'leader' : 'follower',
      address: `${nodeId}/partition/${partitionId}-r${index + 1}`,
      status: 'active',
    })),
    nodes: nodeIds.map((nodeId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 34000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 20,
      [COLUMN.DISK_USAGE_PERCENT]: 30,
    })),
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      if (type === TABLES.NODES) {
        return this.nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.NODES) {
        return this.nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions;
      }
      if (type === TABLES.SERVICES) {
        return this.services;
      }
      if (type === TABLES.NODES) {
        return this.nodes;
      }
      return [];
    },
  };

  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node1',
    systemTableCache: systemCache,
    messageRouter: {
      getConnectionState(nodeId) {
        return nodeIds.includes(nodeId) ? STATE.CONNECTED : STATE.DISCONNECTED;
      },
    },
    storageAccountingService: {
      async getCapacitySnapshotForNode(nodeId) {
        return {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics() {
        return {
          currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
          reasonCode: null,
          enteredAt: '2026-03-12T00:00:00.000Z',
          recentTransitions: [],
        };
      },
    },
    now: () => now,
  });

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const services = executor.getRoutablePartitionServices(partitionId);
  const address = executor.findPartitionLeaderAddress(partitionId);

  t.equal(
    services.length,
    3,
    'fresh bootstrap routing should accept active addressed services when transport is still connected',
  );
  t.equal(
    address,
    `node1/partition/${partitionId}-r1`,
    'fresh bootstrap routing should still expose the leader address while heartbeat publication lags',
  );
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

test('QueryExecutor - executeOnPartition fails closed when canonical leader ' +
  'metadata is known but its service row is missing', async (t) => {
  let deliveries = 0;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node1',
      },
    ],
    services: [
      {
        service_id: 'p1-follower-visible',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-stale-peer-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'leader',
        address: 'node3/partition/p1',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
  t.equal(
    deliveries,
    0,
    'steady-state writes must not widen routing to non-canonical replicas',
  );
});

test('QueryExecutor - executeOnPartition forwards router delivery overrides',
  async (t) => {
    const deliveries = [];
    const messageRouter = {
      deliver: async (address, message, options) => {
        deliveries.push({address, message, options});
        return {acknowledged: true, success: true, rows: [], changes: 1};
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache: createMockSystemCache(['p1']),
    });

    const result = await executor.executeOnPartition(
      'p1',
      'INSERT INTO users (id) VALUES (?)',
      [1],
      false,
      false,
      false,
      {
        deliveryPriority: 'critical',
        timeoutMs: 4321,
      },
    );

    t.equal(result.success, true, 'partition execution should still succeed');
    t.equal(deliveries.length, 1, 'partition execution should dispatch once');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'partition execution should preserve delivery priority overrides',
    );
    t.equal(
      deliveries[0]?.options?.timeoutMs,
      4321,
      'partition execution should preserve per-call timeout overrides',
    );
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

test('QueryExecutor - executeOnPartition fails closed during the fresh ' +
  'bootstrap leader window when only followers are visible', async (t) => {
  let deliveries = 0;
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
        raft_role: 'follower',
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
    deliver: async () => {
      deliveries += 1;
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

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.equal(deliveries, 0, 'write path should not widen to follower-only services');
});

test('QueryExecutor - executeOnPartition forwards migration operation metadata',
  async (t) => {
    const systemCache = createMockSystemCache(['p1']);
    let capturedMessage = null;
    const messageRouter = {
      deliver: async (_address, message) => {
        capturedMessage = message;
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
    });

    const result = await executor.executeOnPartition(
      'p1',
      'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 10',
      [],
      false,
      true,
      false,
      {
        migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
        migrationId: 'migration-1',
      },
    );

    t.equal(result.success, true);
    t.equal(capturedMessage.migrationOperation, MIGRATION_PARTITION_OPERATION.ALTER_TABLE);
    t.equal(capturedMessage.migrationId, 'migration-1');
  });

test('QueryExecutor - executeOnPartition forwards sessionId through leader redirects',
  async (t) => {
    const capturedMessages = [];
    const messageRouter = {
      async deliver(address, message) {
        capturedMessages.push({address, message});
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
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
      filter(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        return [];
      },
    };
    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
    });

    const result = await executor.executeOnPartition(
      'p1',
      'SELECT * FROM users',
      [],
      true,
      false,
      false,
      {sessionId: 'tx-forward-1'},
    );

    t.equal(result.success, true, 'redirected query should succeed');
    t.equal(capturedMessages.length, 2, 'should issue follower and leader requests');
    t.equal(
      capturedMessages[0]?.message?.sessionId,
      'tx-forward-1',
      'direct write should forward the session id',
    );
    t.equal(
      capturedMessages[1]?.message?.sessionId,
      'tx-forward-1',
      'redirected write should preserve the session id',
    );
  });

test('QueryExecutor - executeOnPartition repairs the canonical leader service ' +
  'gap before using follower fallback', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
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
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      systemCache.services.push({
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      });
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should attempt one authoritative refresh for the missing canonical leader row',
  );
  t.same(
    deliveries,
    ['leader-node/partition/p1'],
    'the repaired canonical leader should be used once the service row becomes visible',
  );
});

test('QueryExecutor - executeOnPartition repairs a zero-row canonical leader ' +
  'gap before failing the write closed', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      systemCache.services.push({
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      });
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should attempt one authoritative refresh when the canonical leader is known but no service rows are cached',
  );
  t.same(
    deliveries,
    ['leader-node/partition/p1'],
    'the repaired canonical leader should be used once the zero-row gap is repaired',
  );
});

test('QueryExecutor - executeOnPartition fails closed when the canonical ' +
  'leader service row remains missing after repair', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
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
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      return {
        dimensions: {serveEligible: false},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === 'follower-node/partition/p1') {
        return {
          acknowledged: true,
          success: false,
          redirect: 'LEADER_REDIRECT',
          leaderAddress: 'leader-node/partition/p1',
          partitionId: 'p1',
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (1)',
    [],
    false,
  );

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should still attempt one authoritative refresh before failing closed',
  );
  t.same(
    deliveries,
    [],
    'steady-state writes must not widen to redirect-capable replicas when canonical leader service metadata remains absent',
  );
});

test('QueryExecutor - getLeaderRecoveryCandidates includes one refreshed ' +
  'candidate when stale address was already attempted', (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
    nodeId: 'local-node',
  });

  const routingSnapshot = {
    routableServices: [
      {
        service_id: 'p1-leader',
        partition_id: 'p1',
        node_id: 'leader-node',
        address: 'leader-node/partition/p1-new',
      },
    ],
  };
  const attemptedAddresses = new Set(['leader-node/partition/p1-old']);

  const candidates = executor.getLeaderRecoveryCandidates(
    routingSnapshot,
    attemptedAddresses,
    false,
  );

  t.equal(candidates.length, 1);
  t.equal(
    candidates[0].address,
    'leader-node/partition/p1-new',
    'recovery should include a single refreshed leader endpoint when it differs from the attempted stale address',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler leader ' +
  'address and retries with refreshed endpoint', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const partitionId = 'p1';
  const staleAddress = 'leader-node/partition/p1-old';
  const refreshedAddress = 'leader-node/partition/p1-new';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options = {}) {
      readinessCalls.push({nodeId, options});
      if (nodeId === 'leader-node' &&
          options.forceAuthoritativeRefresh === true) {
        systemCache.services[0].address = refreshedAddress;
      }
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === refreshedAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, refreshedAddress],
    'write routing should retry once with refreshed leader metadata after no-handler on stale address',
  );
  t.equal(readinessCalls.length, 1);
  t.equal(readinessCalls[0].nodeId, 'leader-node');
  t.equal(readinessCalls[0].options.forceAuthoritativeRefresh, true);
  t.equal(readinessCalls[0].options.maxCachedAgeMs, 0);
  t.equal(
    readinessCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler read ' +
  'address and retries with refreshed endpoint', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const partitionId = 'p1';
  const staleAddress = 'leader-node/partition/p1-old';
  const refreshedAddress = 'leader-node/partition/p1-new';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options = {}) {
      readinessCalls.push({nodeId, options});
      if (nodeId === 'leader-node' &&
          options.forceAuthoritativeRefresh === true) {
        systemCache.services[0].address = refreshedAddress;
      }
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === refreshedAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, refreshedAddress],
    'read routing should also retry with refreshed metadata after no-handler on stale address',
  );
  t.equal(readinessCalls.length, 1);
  t.equal(readinessCalls[0].nodeId, 'leader-node');
  t.equal(
    readinessCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler read ' +
  'address across owner handoff via routing overlay refresh', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    successRows: [{operation_id: 'op-1'}],
  });

  const executor = new QueryExecutor({
    messageRouter: fixture.messageRouter,
    systemCache: fixture.systemCache,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    fixture.partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-1'],
    true,
  );

  t.equal(result.success, true);
  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'read routing owner handoff repair',
  });
  t.equal(
    fixture.overlayRefreshCalls[0].partitionKey,
    fixture.partitionId,
    'no-handler repair should refresh routing metadata for the affected partition',
  );
  t.equal(
    fixture.overlayRefreshCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
    'overlay refresh should receive the stale-service repair reason',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition honors overlay refresh when service id is unchanged', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    sameServiceId: true,
    refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
    successRows: [{operation_id: 'op-2'}],
  });

  const executor = new QueryExecutor({
    messageRouter: fixture.messageRouter,
    systemCache: fixture.systemCache,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    fixture.partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-2'],
    true,
  );

  t.equal(result.success, true);
  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'same-service-id routing repair',
  });
  t.equal(
    fixture.overlayRefreshCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
    'same-service-id repair should still use stale-service refresh reason',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition falls back to live replica ' +
  'discovery after the canonical leader transport closes', async (t) => {
  const deliveries = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      },
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
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    async deliver(address) {
      deliveries.push(address);
      if (address === 'leader-node/partition/p1') {
        const error = new Error('Connection to node leader-node closed');
        error.code = 'ROUTER_CONNECTION_CLOSED';
        error.deferRetry = true;
        error.retryAfterMs = 100;
        throw error;
      }
      if (address === 'follower-node/partition/p1') {
        return {
          acknowledged: true,
          success: false,
          redirect: 'LEADER_REDIRECT',
          leaderAddress: 'new-leader/partition/p1',
          partitionId: 'p1',
        };
      }
      if (address === 'new-leader/partition/p1') {
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [
      'leader-node/partition/p1',
      'follower-node/partition/p1',
      'new-leader/partition/p1',
    ],
    'write routing should degrade to live replica discovery only after the canonical leader path proves unreachable',
  );
});

test('QueryExecutor - executeOnPartition quarantines stale no-handler ' +
  'leader address across consecutive writes', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const routingMetadataOverlay = {
    getPartitionById() {
      return null;
    },
    getServicesForPartition() {
      return [];
    },
    async refreshPartitionRouting() {
      return false;
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    routingMetadataOverlay,
    nodeId: 'local-node',
    noHandlerAddressQuarantineMs: 60000,
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [staleAddress, fallbackAddress, fallbackAddress],
    'second write should skip the quarantined stale no-handler leader address',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition retries retryable control-plane ' +
  'write failures on another live replica', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        return {
          acknowledged: true,
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, fallbackAddress],
    'control-plane writes should fall through to another live replica ' +
      'when the first candidate reports retryable partition contention',
  );
});

test('QueryExecutor - executeOnPartition defers retryable routed control-plane ' +
  'transport failures instead of widening in the same attempt', async (t) => {
  const deliveries = [];
  const retryDelays = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  let leaderAttempts = 0;

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        leaderAttempts += 1;
        if (leaderAttempts === 1) {
          return {
            acknowledged: true,
            success: false,
            error: 'Connection to node leader-node closed',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            retryAfterMs: 250,
          };
        }
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected fallback delivery',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async (delayMs) => {
    retryDelays.push(delayMs);
  };

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'deferred control-plane transport failures should retry after backoff ' +
      'instead of widening to other live replicas in the same attempt',
  );
  t.equal(retryDelays.length, 1,
    'deferred failures should schedule one bounded partition retry');
  t.ok(retryDelays[0] >= 250,
    'deferred partition retry should honor retryAfterMs');
});

test('QueryExecutor - executeOnPartition bounds deferred control-plane write ' +
  'retries by the per-call timeout budget', async (t) => {
  const deliveries = [];
  const retryDelays = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: false,
        error: 'Connection to node leader-node closed',
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        deferRetry: true,
        retryAfterMs: 250,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async (delayMs) => {
    retryDelays.push(delayMs);
  };

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
    false,
    false,
    {
      timeoutMs: 200,
    },
  );

  t.equal(result.success, false,
    'bounded control-plane retries should surface the deferred failure once the budget is exhausted');
  t.same(
    deliveries,
    [leaderAddress],
    'per-call timeout budget should prevent extra retry attempts when retryAfterMs exceeds the remaining budget',
  );
  t.equal(retryDelays.length, 0,
    'per-call timeout budget should not sleep past the remaining execution budget');
  t.equal(result.deferRetry, true,
    'bounded timeout exhaustion should preserve defer-retry semantics for upstream owners');
  t.equal(result.retryAfterMs, 250,
    'bounded timeout exhaustion should preserve retryAfterMs for the next owner-level retry');
});

test('QueryExecutor - executeOnPartition retries session-bound transaction ' +
  'contention on the same replica before widening', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  let leaderAttempts = 0;

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        leaderAttempts += 1;
        if (leaderAttempts === 1) {
          return {
            acknowledged: true,
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected fallback delivery',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async () => {};

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'session-bound transaction contention should retry the pinned replica ' +
      'instead of widening to another live replica in the same attempt',
  );
});

test('QueryExecutor - executeOnPartition pins session-bound writes to the ' +
  'same replica address across calls', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        changes: 1,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['creating', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );
  systemCache.partitions[0].leader_node_id = 'follower-node';
  systemCache.services[0].raft_role = 'follower';
  systemCache.services[1].raft_role = 'leader';
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['sending', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'session-bound writes should stay pinned to the replica that accepted the earlier step',
  );
});

test('QueryExecutor - executeOnPartition clears session-bound replica ' +
  'affinity after successful transactional teardown', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        changes: 1,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['creating', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );
  systemCache.partitions[0].leader_node_id = 'follower-node';
  systemCache.services[0].raft_role = 'follower';
  systemCache.services[1].raft_role = 'leader';
  await executor.executeOnPartition(
    partitionId,
    '',
    [],
    false,
    false,
    false,
    {
      sessionId: 'tx-1',
      clearSessionPartitionAffinityOnSuccess: true,
      buildRequest: () => ({type: 'TRANSACTION', operation: 'COMMIT'}),
    },
  );
  const thirdResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(thirdResult.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress, fallbackAddress],
    'successful teardown should release session affinity so later work can follow fresh routing',
  );
});

test('QueryExecutor - executeOnPartition quarantines thrown stale no-handler ' +
  'leader address across consecutive writes', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const routingMetadataOverlay = {
    getPartitionById() {
      return null;
    },
    getServicesForPartition() {
      return [];
    },
    async refreshPartitionRouting() {
      return false;
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        throw new Error(`${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`);
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    routingMetadataOverlay,
    nodeId: 'local-node',
    noHandlerAddressQuarantineMs: 60000,
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [staleAddress, fallbackAddress, fallbackAddress],
    'second write should skip the quarantined stale no-handler leader address when no-handler arrives as a thrown transport error',
  );
  t.end();
});

test('QueryExecutor - control-plane no-handler quarantine stays active until ' +
  'service metadata changes', async (t) => {
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  let nowMs = 1_000;
  const realDateNow = Date.now;
  Date.now = () => nowMs;
  t.teardown(() => {
    Date.now = realDateNow;
  });

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: TABLES.REPLICA_OPERATIONS,
        leader_node_id: 'leader-node',
      },
    ],
    services: [],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
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
    nodeId: 'local-node',
  });

  const originalService = {
    service_id: 'replica_operations-p1-r1',
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'leader-node',
    raft_role: 'leader',
    address: staleAddress,
    status: 'active',
    updated_at: 100,
  };

  executor.markTemporarilyUnroutableAddress(
    partitionId,
    staleAddress,
    originalService,
  );

  nowMs += QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS + 1_000;
  t.equal(
    executor.isTemporarilyUnroutableAddress(
      partitionId,
      staleAddress,
      originalService,
    ),
    true,
    'control-plane stale address should remain shadowed beyond the generic warn throttle while metadata is unchanged',
  );

  const refreshedService = {
    ...originalService,
    updated_at: 200,
  };
  t.equal(
    executor.isTemporarilyUnroutableAddress(
      partitionId,
      staleAddress,
      refreshedService,
    ),
    false,
    'updated service metadata should immediately release the stale no-handler shadow',
  );
});

test('QueryExecutor - non-control-plane no-handler quarantine keeps default ' +
  'short window', async (t) => {
  const partitionId = 'users-p1';
  const address = 'leader-node/partition/users-p1-r1';
  let nowMs = 5_000;
  const realDateNow = Date.now;
  Date.now = () => nowMs;
  t.teardown(() => {
    Date.now = realDateNow;
  });

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: 'users',
        leader_node_id: 'leader-node',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter() {
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    nodeId: 'local-node',
  });

  executor.markTemporarilyUnroutableAddress(partitionId, address, {
    service_id: 'users-p1-r1',
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'leader-node',
    raft_role: 'leader',
    address,
    status: 'active',
    updated_at: 100,
  });

  nowMs += QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS + 1_000;
  t.equal(
    executor.isTemporarilyUnroutableAddress(partitionId, address),
    false,
    'non-control-plane partitions should age out at the default short quarantine window',
  );
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


// --- Service routability contract tests (Requirements: 1.4, 4.1, 4.3) ---
// Routing paths use serveEligible dimension via isRoutablePartitionService.

test('QueryExecutor - isRoutablePartitionService rejects active service ' +
  'on non-serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: (nodeId) => {
      if (nodeId === 'node-down') {
        return {
          dimensions: {
            serveEligible: false,
            repairEligible: true,
          },
        };
      }
      return {dimensions: {serveEligible: true}};
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-down',
    address: 'node-down/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'active service on non-serve-eligible node must not be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService accepts active service ' +
  'when sync readiness has no capacity snapshot but node is serve-ready',
(t) => {
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createReadinessCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-nocap',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
        [COLUMN.LAST_HEARTBEAT]: 1000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 10,
        [COLUMN.DISK_USAGE_PERCENT]: 10,
      }],
      services: [{
        [COLUMN.SERVICE_ID]: 'p1-r1',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        partition_id: 'p1',
        [COLUMN.NODE_ID]: 'node-nocap',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-nocap/partition/p1',
      }],
    }),
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-nocap',
    address: 'node-nocap/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'missing capacity data must not make an active healthy replica unroutable',
  );
  t.end();
});

test('QueryExecutor - filters self routed-read candidates when canonical ' +
  'readiness reports local query transport deferred', async (t) => {
  const nodeId = 'node-self-routing-gate';
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
      [COLUMN.LAST_HEARTBEAT]: 1000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p-self-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p-self',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p-self`,
      raft_role: 'leader',
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.CONNECTED;
      },
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          reason: 'query ingress owner not ready',
          retryAfterMs: 777,
        };
      },
    },
    storageAccountingService: {
      async getCapacitySnapshotForNode(targetNodeId) {
        return {
          nodeId: targetNodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        };
      },
    },
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates('p-self', true);

  t.same(
    candidates,
    [],
    'self candidate should be filtered through canonical readiness while local query transport is deferred',
  );
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.ok(
    warnings[0].context.routingSnapshot.deniedByNodeId[nodeId]
      .reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
      ),
    'routing denial should expose the local query transport gating reason',
  );
  t.end();
});

test('QueryExecutor - consumes canonical participation contract for self ' +
  'routed-read gating', async (t) => {
  const nodeId = 'node-self-participation-gate';
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
      [COLUMN.LAST_HEARTBEAT]: 1000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p-self-participation-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p-self-participation',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p-self-participation`,
      raft_role: 'leader',
    }],
  });
  let participationCalls = 0;
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(targetNodeId) {
        participationCalls += 1;
        return {
          nodeId: targetNodeId,
          eligible: false,
          decision: 'defer',
          decisionDimension: 'repairEligible',
          reasonCode:
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          reasonCodes: [
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          ],
          retryAfterMs: 654,
          deferRetry: true,
          summary: {
            decisionDimension: 'repairEligible',
            observedAt: '2026-03-22T00:00:00.000Z',
            lifecycleState: SERVICE_STATUS.ACTIVE,
            reasonCodes: [
              CONTROL_PLANE_READINESS_REASON
                .LOCAL_QUERY_TRANSPORT_NOT_READY,
            ],
            failedDimensions: ['routingReady', 'repairEligible'],
          },
        };
      },
    },
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates(
    'p-self-participation',
    true,
  );

  t.same(
    candidates,
    [],
    'routed reads should defer through the shared participation contract',
  );
  t.equal(participationCalls, 1,
    'query routing should consult the canonical participation contract');
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.ok(
    warnings[0].context.routingSnapshot.deniedByNodeId[nodeId]
      .reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
      ),
    'routing denial should preserve the canonical participation reason',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService reuses fresher stored ' +
  'readiness evidence when the visible cache row regresses', async (t) => {
  let now = 100000;
  const nodeId = 'node-cache-lag';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });
  await readinessService.getNodeReadiness(nodeId);

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: nodeId,
    address: `${nodeId}/partition/p1`,
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'routing should continue to accept the replica while the stored snapshot is fresher',
  );

  now = freshLease + 1;
  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'routing must stop using the stored snapshot after the ready lease expires',
  );
  t.end();
});

test('QueryExecutor routes control-plane recovery reads through the ' +
  'dedicated recovery participation kind', (t) => {
  const nodeId = 'node-recovery-routing';
  let receivedOptions = null;
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createReadinessCache({
      nodes: [{
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.READY_LEASE_EXPIRES_AT]: 3000,
        [COLUMN.LAST_HEARTBEAT]: 1000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 10,
        [COLUMN.DISK_USAGE_PERCENT]: 10,
      }],
      services: [{
        [COLUMN.SERVICE_ID]: 'p-recovery-r1',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        partition_id: 'p-recovery',
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: `${nodeId}/partition/p-recovery`,
        raft_role: 'leader',
      }],
    }),
    controlPlaneReadinessService: {
      getControlPlaneParticipationSync(targetNodeId, options) {
        receivedOptions = {targetNodeId, ...options};
        return {
          nodeId: targetNodeId,
          eligible: true,
          decision: 'ready',
          decisionDimension: options?.decisionDimension || null,
          reasonCodes: [],
          failedDimensions: [],
          summary: {
            decisionDimension: options?.decisionDimension || null,
            observedAt: '2026-03-24T00:00:00.000Z',
            lifecycleState: SERVICE_STATUS.ACTIVE,
            reasonCodes: [],
            failedDimensions: [],
          },
        };
      },
    },
  });

  const service = {
    [COLUMN.SERVICE_ID]: 'p-recovery-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    partition_id: 'p-recovery',
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/p-recovery`,
    raft_role: 'leader',
  };
  const routable = executor.isRoutablePartitionService(
    service,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(routable, true, 'recovery-routed services should stay routable');
  t.match(receivedOptions, {
    targetNodeId: nodeId,
    participationKind:
      CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY,
    decisionDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  });
  t.end();
});

test('QueryExecutor - sync-only readiness checks retain fresher remote-node ' +
  'evidence when the visible cache row regresses', (t) => {
  let now = 120000;
  const nodeId = 'node-sync-only-cache-lag';
  const freshHeartbeat = now - 100;
  const freshLease = now + 15000;
  const cache = createReadinessCache({
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: freshLease,
      [COLUMN.LAST_HEARTBEAT]: freshHeartbeat,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 10,
      [COLUMN.DISK_USAGE_PERCENT]: 10,
    }],
    services: [{
      [COLUMN.SERVICE_ID]: 'p1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    }],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcGroupPropagationService: createReadinessPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: nodeId,
    address: `${nodeId}/partition/p1`,
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'first sync routing check should accept the healthy remote replica',
  );

  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LAST_HEARTBEAT]: now - 60000,
    [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
  });

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'later sync routing checks should reuse the fresher sync snapshot',
  );

  now = freshLease + 1;
  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'sync routing must stop reusing the stored snapshot after lease expiry',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService accepts active service ' +
  'on serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    true,
    'active service on serve-eligible node must be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService rejects non-active service ' +
  'even on serve-eligible node', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'creating',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'non-active service must not be routable regardless of node readiness',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService rejects service without ' +
  'address even when active and serve-eligible', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({
      dimensions: {serveEligible: true},
    }),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: '',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'service without published address must not be routable',
  );
  t.end();
});

test('QueryExecutor - isRoutablePartitionService fails closed when ' +
  'readiness snapshot has no dimensions', (t) => {
  const readinessService = {
    getNodeReadinessSync: () => ({dimensions: null}),
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache([]),
    controlPlaneReadinessService: readinessService,
  });

  const service = {
    service_id: 'p1-r1',
    service_type: 'partition',
    partition_id: 'p1',
    node_id: 'node-ok',
    address: 'node-ok/partition/p1',
    status: 'active',
  };

  t.equal(
    executor.isRoutablePartitionService(service),
    false,
    'must fail closed when readiness dimensions are unavailable',
  );
  t.end();
});

test('QueryExecutor - getRoutablePartitionServices excludes services on ' +
  'non-serve-eligible nodes', (t) => {
  const readinessService = {
    getNodeReadinessSync: (nodeId) => {
      if (nodeId === 'node-down') {
        return {dimensions: {serveEligible: false}};
      }
      return {dimensions: {serveEligible: true}};
    },
  };

  const systemCache = {
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node-down',
        address: 'node-down/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node-ok',
        address: 'node-ok/partition/p1',
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
    controlPlaneReadinessService: readinessService,
  });

  const services = executor.getRoutablePartitionServices('p1');

  t.equal(services.length, 1);
  t.equal(
    services[0].node_id,
    'node-ok',
    'only services on serve-eligible nodes should be routable',
  );
  t.end();
});

test('QueryExecutor - getPartitionRoutingSnapshot reports service rows ' +
  'filtered by stale serve-eligibility and recovers after owner refresh',
async (t) => {
  // §1.4.12: Transport-connected nodes with stale leases are healthy.
  // This test uses a mock readiness service that starts ineligible
  // and transitions to eligible after an authoritative refresh,
  // proving the routing snapshot recovery path.
  const partitionId = 'p-stale-routing';
  const nodeId = 'node-stale-routing';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  let nodeEligible = false;
  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: nodeEligible,
          repairEligible: nodeEligible,
        },
        reasons: nodeEligible ? [] : [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      // Simulate authoritative repair succeeding.
      nodeEligible = true;
      return this.getNodeReadinessSync();
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const staleSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    staleSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON
      .ALL_SERVICES_FILTERED_BY_READINESS,
    'routing snapshot should distinguish readiness-filtered ' +
      'candidates from missing rows',
  );
  t.equal(staleSnapshot.serviceRowCount, 1);
  t.equal(staleSnapshot.routableServiceCount, 0);
  t.ok(
    staleSnapshot.deniedByNodeId[nodeId].reasonCodes
      .includes('cluster_member_unhealthy'),
    'routing snapshot should surface cluster_member_unhealthy',
  );

  // Trigger the repair path.
  await executor.maybeAwaitDeniedPartitionRoutingRepair(
    staleSnapshot,
  );

  t.same(
    authoritativeRefreshes,
    [nodeId],
    'routing repair should trigger one authoritative refresh',
  );

  const refreshedSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    refreshedSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
    'routing snapshot should clear once authoritative owner ' +
      'evidence repairs the cache',
  );
  t.equal(refreshedSnapshot.routableServiceCount, 1);
  t.equal(
    executor.getPartitionServiceCandidates(
      partitionId, true,
    ).length,
    1,
    'read candidates should recover after the readiness ' +
      'repair lands',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition awaits one authoritative readiness ' +
  'repair when stale serve-eligibility filters all candidates',
async (t) => {
  // §1.4.12: Uses a mock readiness service that starts ineligible
  // and transitions to eligible after authoritative refresh, proving
  // executeOnPartition awaits the repair before failing.
  const partitionId = 'p-stale-routing-read';
  const nodeId = 'node-stale-routing-read';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  let nodeEligible = false;
  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: nodeEligible,
          repairEligible: nodeEligible,
        },
        reasons: nodeEligible ? [] : [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      nodeEligible = true;
      return this.getNodeReadinessSync();
    },
  };

  let deliveryCount = 0;
  let deliveredAddress = null;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver(address) {
        deliveryCount += 1;
        deliveredAddress = address;
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      },
    },
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read execution should await the owner repair ' +
      'instead of failing on the stale snapshot',
  );
  t.equal(
    deliveryCount, 1,
    'query should be dispatched after the readiness ' +
      'repair lands',
  );
  t.equal(
    deliveredAddress,
    `${nodeId}/partition/${partitionId}`,
    'repaired routing should use the recovered partition ' +
      'service address',
  );
  t.same(
    authoritativeRefreshes,
    [nodeId],
    'executeOnPartition should await one authoritative ' +
      'node/service repair',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition can suppress routing-triggered ' +
  'authoritative readiness repair', async (t) => {
  const partitionId = 'p-stale-routing-read-suppressed';
  const nodeId = 'node-stale-routing-read-suppressed';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (partition) => partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: false,
          repairEligible: false,
        },
        reasons: [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      return this.getNodeReadinessSync();
    },
  };

  let deliveryCount = 0;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver() {
        deliveryCount += 1;
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      },
    },
    systemCache,
    controlPlaneReadinessService: readinessService,
  });
  executor.readRetryAttempts = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
    false,
    false,
    {
      allowReadinessAuthoritativeRefresh: false,
    },
  );

  t.equal(
    result.success,
    false,
    'query should fail closed on the stale snapshot when repair is suppressed',
  );
  t.equal(
    deliveryCount,
    0,
    'suppressed repair should not route the query to an ineligible candidate',
  );
  t.same(
    authoritativeRefreshes,
    [],
    'suppressed repair should not recurse into authoritative readiness refresh',
  );
  t.end();
});

test('QueryExecutor - getPartitionServiceCandidates logs typed routing ' +
  'denials when services exist but readiness filters them all', (t) => {
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {serveEligible: false, repairEligible: true},
        reasons: [{code: 'cluster_member_unhealthy'}],
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: {
      partitions: [{
        partition_id: 'p-log',
        leader_node_id: 'node-filtered',
      }],
      services: [{
        service_id: 'p-log-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'p-log',
        node_id: 'node-filtered',
        raft_role: 'leader',
        address: 'node-filtered/partition/p-log',
        status: SERVICE_STATUS.ACTIVE,
      }],
      get(type, key) {
        if (type === TABLES.PARTITIONS) {
          return this.partitions.find((row) => row.partition_id === key) || null;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === TABLES.SERVICES) {
          return this.services.filter(predicate);
        }
        return [];
      },
    },
    controlPlaneReadinessService: readinessService,
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates('p-log', true);

  t.same(candidates, []);
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].message,
    QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED,
    'readiness-filtered candidate sets should emit a typed routing warning',
  );
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.same(
    warnings[0].context.routingSnapshot.deniedByNodeId['node-filtered'].reasonCodes,
    ['cluster_member_unhealthy'],
  );
  t.end();
});

// --- Read retry and candidate fallthrough tests (§1.10, §1.12) ---

test('QueryExecutor - executeOnPartition retries reads across ' +
  'multiple candidates on transient failure (§1.12)', async (t) => {
  // Proves: read path tries next candidate when one fails with a
  // transient error instead of returning hard failure immediately.
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [
      {
        service_id: 'svc-n1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async (address, _message) => {
      deliveries.push(address);
      if (address === 'node1/partition/p1') {
        // First candidate: transient failure (timeout)
        return {
          acknowledged: true,
          success: false,
          error: 'Message timeout',
        };
      }
      if (address === 'node2/partition/p1') {
        // Second candidate: also transient failure
        return {
          acknowledged: true,
          success: false,
          error: 'Query execution error',
        };
      }
      // Third candidate: success
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 1}],
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
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read should succeed after falling through transient failures',
  );
  t.equal(deliveries.length, 3,
    'should have tried all three candidates');
  t.end();
});

test('QueryExecutor - executeOnPartition returns last error when ' +
  'all read candidates fail with transient errors (§1.12)', async (t) => {
  // Proves: when every candidate fails, the read returns the last
  // transient error rather than failing on the first one.
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [
      {
        service_id: 'svc-n1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async (_address, _message) => {
      return {
        acknowledged: true,
        success: false,
        error: 'Message timeout',
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
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(result.success, false);
  t.equal(
    result.error,
    'Message timeout',
    'should return last transient error after exhausting candidates',
  );
  t.end();
});

test('QueryExecutor - denied routing repair refreshes authoritative overlay ' +
  'for canonical leader service gaps', async (t) => {
  const partitionId = 'nodes-p1';
  const leaderNodeId = 'seed-node';
  const overlayServices = [];
  const refreshCalls = [];
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: leaderNodeId,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return overlayServices.filter(predicate);
      }
      if (tableName === TABLES.PARTITIONS) {
        const rows = [
          {
            partition_id: partitionId,
            table_name: TABLES.NODES,
            leader_node_id: leaderNodeId,
          },
        ];
        return rows.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    routingMetadataOverlay: {
      getServicesForPartition(requestedPartitionId) {
        return requestedPartitionId === partitionId ? overlayServices : [];
      },
      async refreshPartitionRouting(requestedPartitionId, options = {}) {
        refreshCalls.push({
          partitionId: requestedPartitionId,
          reasonCode: options.routingSnapshot?.reasonCode || null,
          leaderNodeId: options.routingSnapshot?.canonicalLeaderNodeId || null,
        });
        overlayServices.splice(0, overlayServices.length, {
          service_id: 'nodes-p1-r1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: leaderNodeId,
          raft_role: 'leader',
          address: `${leaderNodeId}/partition/${partitionId}-r1`,
          status: SERVICE_STATUS.ACTIVE,
        });
        return true;
      },
    },
  });

  const staleSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    staleSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    'routing snapshot should surface the canonical leader service gap',
  );
  t.equal(staleSnapshot.serviceRowCount, 0);
  t.equal(staleSnapshot.canonicalLeaderNodeId, leaderNodeId);
  t.equal(staleSnapshot.leaderKnown, true);

  const repaired =
    await executor.maybeAwaitDeniedPartitionRoutingRepair(staleSnapshot);

  t.equal(repaired, true,
    'denied routing repair should retry after authoritative overlay refresh');
  t.same(
    refreshCalls,
    [
      {
        partitionId,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
        leaderNodeId,
      },
    ],
    'denied repair should reuse the authoritative overlay refresh path',
  );

  const refreshedSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    refreshedSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
    'routing snapshot should recover once overlay service rows arrive',
  );
  t.equal(refreshedSnapshot.serviceRowCount, 1);
  t.equal(
    executor.getPartitionServiceCandidates(
      partitionId,
      true,
    ).length,
    1,
    'read candidates should recover after the overlay refresh',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition retries reads with ' +
  'routing repair when no candidates found (§1.10)', async (t) => {
  // Proves: read path gets bounded retries (not just 1 attempt)
  // so routing repair can discover new candidates across attempts.
  let resolveCount = 0;
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      resolveCount++;
      // On third resolve call (second retry attempt), return a service
      if (resolveCount >= 3) {
        const services = [
          {
            service_id: 'svc-n1',
            service_type: 'partition',
            partition_id: 'p1',
            node_id: 'node1',
            raft_role: 'leader',
            address: 'node1/partition/p1',
            status: 'active',
          },
        ];
        if (type === 'services') return services.filter(predicate);
      }
      if (type === 'services') return [];
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async () => {
      return {acknowledged: true, success: true, rows: [{id: 1}]};
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
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read should succeed after routing repair discovers candidates',
  );
  t.end();
});
