/**
 * Baseline distributed SQL gap tests.
 *
 * These tests intentionally codify known correctness gaps so fixes are driven
 * by failing coverage first.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

function createPartitionServiceRows(partitionIds) {
  return partitionIds.map((partitionId) => ({
    service_id: partitionId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${partitionId}`,
    status: 'active',
  }));
}

function createSystemCache({tables, partitions, services}) {
  const normalizedPartitions = (partitions || []).map((partition) => {
    const leaderService = (services || []).find((service) =>
      service.partition_id === partition.partition_id &&
      String(service.raft_role || '').toLowerCase() === String('leader'),
    );
    return {
      ...partition,
      leader_node_id: partition.leader_node_id ||
        partition.leaderNodeId ||
        leaderService?.node_id ||
        null,
    };
  });
  return {
    tables: tables || [],
    partitions: normalizedPartitions,
    services: services || [],
    get(type, key) {
      if (type === 'tables') {
        return this.tables.find((row) => row.table_name === key) || null;
      }
      if (type === 'partitions') {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'tables') {
        return this.tables.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === 'tables') {
        return this.tables;
      }
      if (type === 'partitions') {
        return this.partitions;
      }
      if (type === 'services') {
        return this.services;
      }
      return [];
    },
  };
}

function createJoinDataRouter(dataByPartition) {
  return {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      const partitionId = address.split('/')[2];
      const rows = dataByPartition.get(partitionId) || [];
      return {
        acknowledged: true,
        success: true,
        rows,
        changes: rows.length,
      };
    },
  };
}

test('baseline gap: SQLQueryEngine JOIN requires explicit join partition planning', async (t) => {
  const partitionData = new Map();
  partitionData.set('users-p1', [{id: 1, name: 'alice'}]);
  partitionData.set('users-p2', [{id: 2, name: 'bob'}]);
  partitionData.set('orders-p1', [{order_id: 10, user_id: 1}]);
  partitionData.set('orders-p2', [{order_id: 11, user_id: 2}]);

  const partitions = [
    {
      partition_id: 'users-p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 2,
    },
    {
      partition_id: 'users-p2',
      table_name: 'users',
      partition_key_start: 2,
      partition_key_end: null,
    },
    {
      partition_id: 'orders-p1',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: 11,
    },
    {
      partition_id: 'orders-p2',
      table_name: 'orders',
      partition_key_start: 11,
      partition_key_end: null,
    },
  ];
  const services = createPartitionServiceRows(
    partitions.map((partition) => partition.partition_id),
  );
  const cache = createSystemCache({
    tables: [
      {table_name: 'users', primaryKey: 'id'},
      {table_name: 'orders', primaryKey: 'order_id'},
    ],
    partitions,
    services,
  });

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createJoinDataRouter(partitionData),
  });

  const result = await engine.executeQuery(
    'SELECT * FROM users JOIN orders ON users.id = orders.user_id',
  );

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);
  t.ok(result.rows.every((row) => row.order_id !== undefined));
  t.ok(result.rows.every((row) => row.user_id !== undefined));
});

test('baseline gap: parameterized pruning should route to a single partition', async (t) => {
  const cache = createSystemCache({
    tables: [{table_name: 'users', primaryKey: 'id'}],
    partitions: [
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
        partition_key_end: null,
      },
    ],
    services: createPartitionServiceRows(['p1', 'p2']),
  });

  const dataByPartition = new Map();
  dataByPartition.set('p1', [{id: 'alice', name: 'alice'}]);
  dataByPartition.set('p2', [{id: 'zack', name: 'zack'}]);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createJoinDataRouter(dataByPartition),
  });

  const result = await engine.executeQuery(
    'SELECT * FROM users WHERE id = ?',
    ['alice'],
  );

  t.equal(result.success, true);
  t.same(result.partitions, ['p1']);
  t.equal(result.rows.length, 1);
});

test('baseline gap: executeSelect must not truncate target partitions', async (t) => {
  const partitionIds = Array.from({length: 10}, (_unused, idx) => `p${idx}`);
  const dataByPartition = new Map(
    partitionIds.map((partitionId, idx) => [partitionId, [{id: idx}]]),
  );
  const executor = new QueryExecutor({
    messageRouter: createJoinDataRouter(dataByPartition),
    systemCache: createSystemCache({
      services: createPartitionServiceRows(partitionIds),
    }),
  });
  executor.maxParallelPartitions = 3;

  const ast = new SQLParser('SELECT * FROM users').parse();
  const result = await executor.executeSelect(ast, partitionIds);

  t.equal(result.success, true);
  t.equal(result.partitions.length, partitionIds.length);
  t.equal(result.rows.length, partitionIds.length);
});

test('baseline gap: distributed read should fail-closed on required participant failure', async (t) => {
  const failingRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      const partitionId = address.split('/')[2];
      if (partitionId === 'p2') {
        return {
          acknowledged: true,
          success: false,
          error: 'simulated failure',
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 1}],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter: failingRouter,
    systemCache: createSystemCache({
      services: createPartitionServiceRows(['p1', 'p2']),
    }),
  });

  const ast = new SQLParser('SELECT * FROM users').parse();
  const result = await executor.executeSelect(ast, ['p1', 'p2']);

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p2']);
});

test('baseline gap: multi-partition UPDATE surfaces partial failure', async (t) => {
  const failingRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      const partitionId = address.split('/')[2];
      if (partitionId === 'p2') {
        return {
          acknowledged: true,
          success: false,
          error: 'write failed on p2',
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 2,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter: failingRouter,
    systemCache: createSystemCache({
      services: createPartitionServiceRows(['p1', 'p2']),
    }),
  });

  const ast = new SQLParser(
    'UPDATE users SET status = \'active\' WHERE id > 0',
  ).parse();
  const result = await executor.executeUpdate(ast, ['p1', 'p2']);

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.ok(Array.isArray(result.failedPartitions));
  t.ok(result.failedPartitions.includes('p2'));
  t.ok(result.failedPartitions.every((partitionId) => {
    return partitionId === 'p1' || partitionId === 'p2';
  }));
});
