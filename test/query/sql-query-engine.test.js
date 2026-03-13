/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
} from '../../src/control-plane/timeout-budget.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data for routing
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions, services, nodes = []) {
  const resolvedServices = services || partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));
  const resolvedPartitions = partitions.map((partition) => {
    if (Object.prototype.hasOwnProperty.call(partition, 'leader_node_id') ||
        Object.prototype.hasOwnProperty.call(partition, 'leaderNodeId')) {
      return partition;
    }
    const leaderService = resolvedServices.find((service) =>
      service.partition_id === partition.partition_id &&
      service.raft_role === 'leader',
    ) || resolvedServices.find((service) =>
      service.partition_id === partition.partition_id,
    );
    return {
      ...partition,
      leader_node_id: leaderService?.node_id || 'test-node',
    };
  });
  return {
    tables,
    partitions: resolvedPartitions,
    services: resolvedServices,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      if (type === 'nodes') {
        return nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'nodes') {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      if (type === 'nodes') return nodes;
      return [];
    },
  };
}

function uniqueNodeIds(nodeIds) {
  return [...new Set(nodeIds)];
}

function createAdmittedSplitAdmissionService() {
  return {
    async checkSplit(options = {}) {
      return {
        allowed: true,
        decisionType: 'admitted',
        decision: 'admitted',
        operationType: 'partition_split',
        requiredReplicaCount: options.requiredReplicaCount || 1,
        candidateTargetNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        eligibleNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        sourceRoutableNodeIds: Array.isArray(options.sourceRoutableNodeIds) ?
          [...options.sourceRoutableNodeIds] :
          [],
      };
    },
  };
}

test('SQLQueryEngine - seeds bootstrap routing overlay snapshots for ' +
  'system-table partition lookup during restart cache gaps', async (t) => {
  const cache = createMockSystemCache([], [], [], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: 'nodes-p1',
        table_name: TABLES.NODES,
        created_at: 1,
        updated_at: 1,
      },
      {
        partition_id: 'users-p1',
        table_name: 'users',
        created_at: 1,
        updated_at: 1,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'nodes-p1',
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/nodes-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'users-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'users-p1',
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/users-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 1, 'should seed overlay only for system-table partitions');

  const partitions = engine.getTablePartitions(TABLES.NODES);
  t.equal(partitions.length, 1,
    'system-table partition lookup should use bootstrap overlay when cache is empty');
  t.equal(partitions[0].partition_id, 'nodes-p1',
    'overlay partition should preserve canonical partition id');
  t.equal(partitions[0].leader_node_id, 'seed-node',
    'overlay partition should expose the canonical leader node');

  const services = engine.queryExecutor.getRoutablePartitionServices('nodes-p1');
  t.equal(services.length, 1,
    'query executor should see routable services from the same overlay owner path');
  t.equal(services[0].address, 'seed-node/partition/nodes-p1-r1',
    'overlay service should remain routable during the cache gap');
});

test('SQLQueryEngine - executes SELECT query', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - shuts down lifecycle-owned table creation services', async (t) => {
  let stopCalls = 0;
  const partitionSplitMergeManager = {
    startPeriodicEvaluation() {},
    stopPeriodicEvaluation() {
      stopCalls += 1;
    },
  };

  const engine = new SQLQueryEngine({
    partitionSplitMergeManager,
  });

  await engine.shutdown();
  t.equal(stopCalls, 1);
});

test('SQLQueryEngine - requests debounced managed split evaluation after ' +
  'successful non-system writes', async (t) => {
  const requestedContexts = [];
  const partitionSplitMergeManager = {
    requestEvaluation(context) {
      requestedContexts.push(context);
    },
  };
  const engine = new SQLQueryEngine({
    partitionSplitMergeManager,
  });
  const writePlan = {
    partitionStatements: new Map([
      ['users-p1', {}],
      ['users-p2', {}],
    ]),
  };

  engine.requestManagedSplitEvaluationForWrite(
    'users',
    writePlan,
    {success: true},
  );
  engine.requestManagedSplitEvaluationForWrite(
    'users',
    writePlan,
    {success: true},
  );
  engine.requestManagedSplitEvaluationForWrite(
    TABLES.TABLES,
    writePlan,
    {success: true},
  );
  engine.requestManagedSplitEvaluationForWrite(
    'users',
    writePlan,
    {success: false},
  );

  t.equal(
    requestedContexts.length,
    1,
    'engine should schedule only one write-activity split evaluation per throttle window',
  );
  t.same(
    requestedContexts[0],
    {
      reasonCode: 'write_activity',
      tableName: 'users',
      partitionIds: ['users-p1', 'users-p2'],
    },
    'write-activity evaluation should include write partition context',
  );
});

test('SQLQueryEngine - resolves partitions by table_id when table_name is missing',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const cache = createMockSystemCache(
      [{table_id: 'tbl-users', table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: null,
        },
      ],
    );

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');
    t.equal(result.rows.length, 1);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - falls back to tables.find when tables.get is keyed by table_id',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const tableRecord = {table_id: 'tbl-users', table_name: 'users', primaryKey: 'id'};
    const partitionRecords = [{
      partition_id: 'p1',
      table_id: 'tbl-users',
      partition_key_start: null,
      partition_key_end: null,
    }];
    const serviceRecords = [{
      service_id: 'p1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'test-node',
      raft_role: 'leader',
      address: 'test-node/partition/p1',
      status: 'active',
    }];

    const cache = {
      get(type, key) {
        if (type === TABLES.TABLES && key === tableRecord.table_id) {
          return tableRecord;
        }
        return null;
      },
      find(type, predicate) {
        if (type === TABLES.TABLES && predicate(tableRecord)) {
          return tableRecord;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === TABLES.PARTITIONS) {
          return partitionRecords.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.PARTITIONS) {
          return partitionRecords;
        }
        if (type === TABLES.TABLES) {
          return [tableRecord];
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords;
        }
        return [];
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.equal(result.partitions.length, 1);
    t.equal(result.partitions[0], 'p1');
    t.equal(result.rows.length, 1);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - resolves partitions when table metadata is only available' +
  ' via tables.getAll', async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const tableRecord = {table_id: 'tbl-users', table_name: 'users', primaryKey: 'id'};
    const partitionRecords = [{
      partition_id: 'p1',
      table_id: 'tbl-users',
      partition_key_start: null,
      partition_key_end: null,
    }];
    const serviceRecords = [{
      service_id: 'p1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: 'remote-node',
      raft_role: 'leader',
      address: 'remote-node/partition/p1',
      status: 'active',
    }];

    const cache = {
      get(type, key) {
        if (type === TABLES.TABLES && key === tableRecord.table_id) {
          return tableRecord;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === TABLES.PARTITIONS) {
          return partitionRecords.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.TABLES) {
          return [tableRecord];
        }
        if (type === TABLES.PARTITIONS) {
          return partitionRecords;
        }
        if (type === TABLES.SERVICES) {
          return serviceRecords;
        }
        return [];
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery('SELECT * FROM users');

    t.equal(result.success, true);
    t.same(result.partitions, ['p1']);
    t.equal(result.rows.length, 1);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - routes SELECT with key filter to single partition', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 'bob', name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes INSERT and routes to correct partition', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', []);
  mockPartitionData.set('p2', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1'); // 'alice' < 'm'

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - routes INSERT to multiple partitions', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', []);
  mockPartitionData.set('p2', []);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), (\'zack\', \'Zack\')',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - merges RETURNING rows for distributed INSERT', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  const returningRouter = {
    deliver: async (address, message) => {
      const partitionId = address.split('/')[2];
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      if (!message.sql.startsWith('INSERT')) {
        return {acknowledged: true, success: true, rows: [], changes: 0};
      }
      const rows = partitionId === 'p1' ?
        [{id: 'alice'}] :
        [{id: 'zack'}];
      return {
        acknowledged: true,
        success: true,
        rows,
        changes: 1,
      };
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: returningRouter,
  });

  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\'), ' +
    '(\'zack\', \'Zack\') RETURNING id',
  );

  t.equal(result.success, true);
  t.equal(result.affectedRows, 2);
  t.same(result.rows.map((row) => row.id).sort(), ['alice', 'zack']);
});

test('SQLQueryEngine - surfaces partial failure for distributed UPDATE', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );
  const failingRouter = {
    deliver: async (address, message) => {
      const partitionId = address.split('/')[2];
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      if (partitionId === 'p2') {
        return {
          acknowledged: true,
          success: false,
          error: 'partition unavailable',
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 'alice'}],
        changes: 1,
      };
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: failingRouter,
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18 RETURNING id',
  );

  t.equal(result.success, false);
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p2']);
  t.equal(result.affectedRows, 1);
  t.same(result.rows, [{id: 'alice'}]);
});

test('SQLQueryEngine - executes UPDATE with key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
  );

  t.equal(result.success, true);
  t.equal(result.operation, 'UPDATE');
  t.equal(result.partitions.length, 1);
  t.equal(result.partitions[0], 'p1');

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes UPDATE on all partitions without key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE age > 18',
  );

  t.equal(result.success, true);
  t.equal(result.partitions.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - executes DELETE with key filter', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 'alice'}]);
  mockPartitionData.set('p2', [{id: 'bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('DELETE FROM users WHERE id = \'alice\'');

  t.equal(result.success, true);
  t.equal(result.operation, 'DELETE');
  t.equal(result.partitions.length, 1);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - returns error for non-existent table', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM nonexistent');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - handles transaction statements', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const beginResult = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult.success, true);
  t.equal(beginResult.operation, 'BEGIN_TRANSACTION');

  const commitResult = await engine.executeQuery('COMMIT');
  t.equal(commitResult.success, true);
  t.equal(commitResult.operation, 'COMMIT');

  // Start a new transaction before testing ROLLBACK
  const beginResult2 = await engine.executeQuery('BEGIN TRANSACTION');
  t.equal(beginResult2.success, true);
  t.equal(beginResult2.operation, 'BEGIN_TRANSACTION');

  const rollbackResult = await engine.executeQuery('ROLLBACK');
  t.equal(rollbackResult.success, true);
  t.equal(rollbackResult.operation, 'ROLLBACK');
});

test('SQLQueryEngine - returns syntax error for invalid SQL', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('INVALID SQL STATEMENT');

  t.equal(result.success, false);
  t.ok(result.errorCode);
});

test('SQLQueryEngine - parse method returns AST', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });

  const ast = engine.parse('SELECT id, name FROM users WHERE age > 18');

  t.equal(ast.type, 'SELECT');
  t.ok(ast.columns);
  t.ok(ast.from);
  t.ok(ast.where);
});

test('SQLQueryEngine - resolvePartitions method works', async (t) => {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const partitions = engine.resolvePartitions('users', null);

  t.equal(partitions.length, 2);
});

test('SQLQueryEngine - throws error when system cache not available', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: null,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('System cache not available'));
});

test('SQLQueryEngine - returns empty array when no partitions found in cache', async (t) => {
  const cache = createMockSystemCache([], []);

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.ok(result.error.includes('not found'));
});

test('SQLQueryEngine - persists non-transactional distributed write operations',
  async (t) => {
    const upserts = [];
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
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
    );
    const cdcIntegrationService = {
      async upsertSystemTableRow(tableName, row) {
        upserts.push({tableName, row});
        return {success: true};
      },
    };
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      cdcIntegrationService,
    });

    const result = await engine.executeQuery(
      'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
    );

    t.equal(result.success, true);

    // Write operation persistence is fire-and-forget for non-transactional
    // writes. Allow microtasks to flush before checking upserts.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const writeOpRows = upserts.filter((entry) =>
      entry.tableName === TABLES.SQL_WRITE_OPERATIONS);
    t.equal(writeOpRows.length, 2);
    t.equal(writeOpRows[0].row.status, 'PENDING');
    t.equal(writeOpRows[1].row.status, 'SUCCEEDED');
  });

test('SQLQueryEngine - mirrors post-cutover writes back to the source partition',
  async (t) => {
    const transitionMetadata = {
      [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]: 'users-source',
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: ['users-p-left', 'users-p-right'],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    };
    const deliveredWrites = [];
    const cache = createMockSystemCache(
      [{
        table_id: 'tbl-users',
        table_name: 'users',
        primaryKey: 'id',
        active_partition_version: 2,
        partition_transition_state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
        partition_transition_metadata: JSON.stringify(transitionMetadata),
      }],
      [
        {
          partition_id: 'users-source',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
          partition_version: 1,
        },
        {
          partition_id: 'users-p-left',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
        },
        {
          partition_id: 'users-p-right',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
          partition_version: 2,
        },
      ],
      [
        {
          service_id: 'users-source-r1',
          service_type: 'partition',
          partition_id: 'users-source',
          node_id: 'test-node',
          raft_role: 'leader',
          address: 'test-node/partition/users-source',
          status: 'active',
        },
        {
          service_id: 'users-p-right-r1',
          service_type: 'partition',
          partition_id: 'users-p-right',
          node_id: 'test-node',
          raft_role: 'leader',
          address: 'test-node/partition/users-p-right',
          status: 'active',
        },
      ],
    );

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: {
        async deliver(address, message) {
          if (message.type === 'QUERY' &&
              /^\s*(INSERT|UPDATE|DELETE)/i.test(message.sql || '')) {
            deliveredWrites.push({
              address,
              splitMirrorOrigin: message.splitMirrorOrigin || null,
            });
          }
          return {
            acknowledged: true,
            success: true,
            rows: [],
            changes: 1,
          };
        },
      },
    });

    const result = await engine.executeQuery(
      'INSERT INTO users (id, name) VALUES (\'zoe\', \'Zoe\')',
    );

    t.equal(result.success, true);
    t.same(result.partitions, ['users-p-right']);
    t.same(result.mirrorPartitions, ['users-source']);
    t.equal(deliveredWrites.length, 2);
    t.equal(deliveredWrites[0].address, 'test-node/partition/users-p-right');
    t.equal(deliveredWrites[0].splitMirrorOrigin, null);
    t.equal(deliveredWrites[1].address, 'test-node/partition/users-source');
    t.equal(deliveredWrites[1].splitMirrorOrigin, 'target');
  });

test('SQLQueryEngine - recovers and replays distributed transactions from system cache snapshots',
  async (t) => {
    const cache = createMockSystemCache(
      [],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const transactionRows = [{
      transaction_id: 'tx-recovery-1',
      session_id: 'recovery-session',
      status: 'PREPARED',
      created_at: 1,
      updated_at: 2,
    }];
    const participantRows = [{
      participant_id: 'tx-recovery-1:p1',
      transaction_id: 'tx-recovery-1',
      partition_id: 'p1',
      status: 'PREPARED',
      created_at: 1,
      updated_at: 2,
    }];
    const writeOperationRows = [{
      operation_id: 'op-recovery-1',
      transaction_id: 'tx-recovery-1',
      statement_type: 'UPDATE',
      status: 'PENDING',
      idempotency_key: 'idem-op-recovery-1',
      payload_hash: 'hash-op-recovery-1',
      partition_ids: '["p1"]',
      retry_count: 0,
      created_at: 1,
      updated_at: 2,
    }];
    const originalGetAll = cache.getAll.bind(cache);
    cache.getAll = function(type) {
      if (type === TABLES.SQL_TRANSACTIONS) {
        return transactionRows;
      }
      if (type === TABLES.SQL_TRANSACTION_PARTICIPANTS) {
        return participantRows;
      }
      if (type === TABLES.SQL_WRITE_OPERATIONS) {
        return writeOperationRows;
      }
      return originalGetAll(type);
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const replay = await engine.waitForDistributedTransactionRecoveryReplay();
    t.equal(replay.totalRecovered, 1);
    t.equal(replay.resumed, 1);
    t.equal(replay.failed, 0);
    t.equal(engine.hasActiveTransaction('recovery-session'), false);
    t.equal(engine.getTransactionPartition('recovery-session'), null);
  });

test('SQLQueryEngine - startup recovery invokes coordinator replay hook once',
  async (t) => {
    const cache = createMockSystemCache([], []);
    const transactionRows = [{
      transaction_id: 'tx-recovery-hook-1',
      session_id: 'recovery-hook-session',
      status: 'PREPARING',
      created_at: 1,
      updated_at: 2,
    }];
    const participantRows = [{
      participant_id: 'tx-recovery-hook-1:p1',
      transaction_id: 'tx-recovery-hook-1',
      partition_id: 'p1',
      status: 'ACTIVE',
      created_at: 1,
      updated_at: 2,
    }];
    const writeOperationRows = [];
    const originalGetAll = cache.getAll.bind(cache);
    cache.getAll = function(type) {
      if (type === TABLES.SQL_TRANSACTIONS) {
        return transactionRows;
      }
      if (type === TABLES.SQL_TRANSACTION_PARTICIPANTS) {
        return participantRows;
      }
      if (type === TABLES.SQL_WRITE_OPERATIONS) {
        return writeOperationRows;
      }
      return originalGetAll(type);
    };

    const capturedRecoverPayloads = [];
    let replayCalls = 0;
    const transactionCoordinator = {
      transactionsBySession: new Map(),
      recoverFromSystemTables(payload) {
        capturedRecoverPayloads.push(payload);
      },
      async resumeRecoveredTransactions() {
        replayCalls += 1;
        return {
          totalRecovered: 1,
          resumed: 1,
          failed: 0,
          results: [],
        };
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      transactionCoordinator,
    });

    const replay = await engine.waitForDistributedTransactionRecoveryReplay();
    t.equal(capturedRecoverPayloads.length, 1);
    t.equal(capturedRecoverPayloads[0].transactions.length, 1);
    t.equal(capturedRecoverPayloads[0].participants.length, 1);
    t.equal(replayCalls, 1);
    t.equal(replay.totalRecovered, 1);
    t.equal(replay.resumed, 1);
  });

test('SQLQueryEngine - EXPLAIN DISTRIBUTED returns canonical plan output',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [
        {
          partition_id: 'p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
        },
      ],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'EXPLAIN DISTRIBUTED SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.equal(result.operation, 'EXPLAIN_DISTRIBUTED');
    t.equal(result.rows.length, 1);
    t.ok(result.rows[0].plan_id.startsWith('dqp-'));
    t.same(Object.keys(result.rows[0].diagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);
  });

test('SQLQueryEngine - distributed diagnostics schema is stable for SELECT',
  async (t) => {
    mockPartitionData.set('p1', [{id: 'alice', name: 'Alice'}]);

    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    const result = await engine.executeQuery(
      'SELECT id FROM users WHERE id = ?',
      ['alice'],
    );

    t.equal(result.success, true);
    t.same(Object.keys(result.distributedMetrics).sort(), [
      'executionDurationMs',
      'fanout',
      'mergeDurationMs',
      'planningDurationMs',
    ]);
    t.same(Object.keys(result.distributedDiagnostics).sort(), [
      'explain',
      'generatedAt',
      'joinPlan',
      'pushdownDecisions',
      'tableGraph',
      'tablePlans',
    ]);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - transactional UPDATE forwards sessionId to distributed writes',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id'}],
      [{
        partition_id: 'p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
      }],
    );
    const capturedExecutionOptions = [];
    const transactionCoordinator = {
      getTransaction(sessionId) {
        if (sessionId === 'tx-update-1') {
          return {participants: []};
        }
        return null;
      },
      async enlistParticipants() {
        return {success: true};
      },
      async recordWriteOperation() {},
      async markWriteOperationResult() {},
    };
    const distributedWriteCoordinator = {
      createWritePlan(_ast, _params, options = {}) {
        const operationId = `write-${options.sessionId || 'missing'}`;
        return {
          operationId,
          idempotencyKey: operationId,
          statementType: 'UPDATE',
          partitionStatements: new Map([
            ['p1', {
              ast: {type: 'UPDATE', table: 'users'},
              role: 'primary',
              executionOptions: {},
            }],
          ]),
        };
      },
      async executePlan(_plan, _params, executionOptions = {}) {
        capturedExecutionOptions.push({...executionOptions});
        return {
          success: true,
          affectedRows: 1,
          rows: [],
          retryCount: 0,
        };
      },
    };

    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      transactionCoordinator,
      distributedWriteCoordinator,
    });

    const result = await engine.executeQuery(
      'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
      [],
      {sessionId: 'tx-update-1'},
    );

    t.equal(result.success, true, 'transactional update should succeed');
    t.equal(
      capturedExecutionOptions[0]?.sessionId,
      'tx-update-1',
      'transactional writes should forward the SQL session id',
    );
  });

test('SQLQueryEngine - remains correct before and after partition split updates',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id', active_partition_version: 1}],
      [{
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
      }],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    mockPartitionData.set('users-p1', [{id: 'alice'}]);
    const beforeSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(beforeSplit.success, true);
    t.equal(beforeSplit.rows.length, 1);

    cache.tables = [{
      table_name: 'users',
      primaryKey: 'id',
      active_partition_version: 2,
    }];
    cache.partitions = [
      {
        partition_id: 'users-p1',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
      },
      {
        partition_id: 'users-p1a',
        table_name: 'users',
        partition_key_start: null,
        partition_key_end: 'm',
        partition_version: 2,
        state: 'NORMAL',
      },
      {
        partition_id: 'users-p1b',
        table_name: 'users',
        partition_key_start: 'm',
        partition_key_end: null,
        partition_version: 2,
        state: 'NORMAL',
      },
    ];
    cache.services = cache.partitions.map((partition) => ({
      service_id: partition.partition_id,
      service_type: 'partition',
      partition_id: partition.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${partition.partition_id}`,
      status: 'active',
    }));

    mockPartitionData.clear();
    mockPartitionData.set('users-p1a', [{id: 'alice'}]);
    mockPartitionData.set('users-p1b', [{id: 'zack'}]);

    const afterSplit = await engine.executeQuery('SELECT * FROM users');
    t.equal(afterSplit.success, true);
    t.equal(afterSplit.rows.length, 2);
    t.same(afterSplit.partitions.sort(), ['users-p1a', 'users-p1b']);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - hides pending split children until active version flips',
  async (t) => {
    const cache = createMockSystemCache(
      [{table_name: 'users', primaryKey: 'id', active_partition_version: 1}],
      [
        {
          partition_id: 'users-p1',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: null,
          partition_version: 1,
          state: 'NORMAL',
        },
        {
          partition_id: 'users-p1a',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
          state: 'NORMAL',
        },
        {
          partition_id: 'users-p1b',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
          partition_version: 2,
          state: 'NORMAL',
        },
      ],
    );
    const engine = new SQLQueryEngine({
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    mockPartitionData.set('users-p1', [{id: 'alice'}]);
    mockPartitionData.set('users-p1a', [{id: 'alice'}]);
    mockPartitionData.set('users-p1b', [{id: 'zack'}]);

    const result = await engine.executeQuery('SELECT * FROM users');
    t.equal(result.success, true);
    t.equal(result.rows.length, 1);
    t.same(result.partitions, ['users-p1']);

    mockPartitionData.clear();
  });

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'INSERT critical path', async (t) => {
  // Bug: persistNonTransactionalWriteStart and persistNonTransactionalWriteResult
  // are awaited in the INSERT path, adding 2 full SQL round-trips per write.
  // For non-transactional single-partition writes, this tracking is not needed
  // for correctness (only used in distributed transaction recovery).
  // The persistence should be fire-and-forget to avoid tripling write latency.
  const SLOW_PERSIST_MS = 50;
  const upserts = [];
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  // CDC service that takes SLOW_PERSIST_MS per upsert to simulate real
  // Raft consensus + CDC cache wait overhead on sql_write_operations.
  const cdcIntegrationService = {
    async upsertSystemTableRow(tableName, row) {
      upserts.push({tableName, row, timestamp: Date.now()});
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'INSERT INTO users (id, name) VALUES (\'alice\', \'Alice\')',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);
  t.equal(result.operation, 'INSERT');

  // If persistence is fire-and-forget, the INSERT should complete well
  // under the combined persistence delay (2 * SLOW_PERSIST_MS = 100ms).
  // Allow generous margin but the key assertion is that we don't wait
  // for both persist calls sequentially.
  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `INSERT took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  // Allow fire-and-forget upserts to complete before test cleanup.
  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'UPDATE critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(_tableName, _row) {
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'UPDATE users SET name = \'Bob\' WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `UPDATE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - non-transactional write persistence does not block ' +
  'DELETE critical path', async (t) => {
  const SLOW_PERSIST_MS = 50;
  let upsertResolvers = [];

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [{
      partition_id: 'p1',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    }],
  );

  const cdcIntegrationService = {
    async upsertSystemTableRow(_tableName, _row) {
      await new Promise((resolve) => {
        upsertResolvers.push(resolve);
        setTimeout(resolve, SLOW_PERSIST_MS);
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService,
  });

  const startMs = Date.now();
  const result = await engine.executeQuery(
    'DELETE FROM users WHERE id = \'alice\'',
  );
  const durationMs = Date.now() - startMs;

  t.equal(result.success, true);

  const maxAcceptableMs = SLOW_PERSIST_MS;
  t.ok(
    durationMs < maxAcceptableMs,
    `DELETE took ${durationMs}ms, expected < ${maxAcceptableMs}ms ` +
    '(write persistence should not block critical path)',
  );

  await Promise.resolve();
  for (const resolver of upsertResolvers) {
    resolver();
  }
  upsertResolvers = [];
  await new Promise((resolve) => setTimeout(resolve, SLOW_PERSIST_MS + 10));
});

test('SQLQueryEngine - provisionInitialTablePartition provisions requested ' +
  'replicas across active nodes', async (t) => {
  const tableId = 'tbl-users';
  const partitionId = 'tbl-users-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'users'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 500,
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should target local node first, then active peers',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    3,
    'partition should expose three routable replicas',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for active node ' +
  'cache convergence before sizing the initial replica cohort', async (t) => {
  const tableId = 'tbl-cache-convergence';
  const partitionId = 'tbl-cache-convergence-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let injectedThirdNode = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    if (!injectedThirdNode) {
      nodes.push({node_id: 'node-c', status: 'active'});
      injectedThirdNode = true;
    }
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'initial provisioning should wait for the third active node instead of silently downscaling',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should poll for active-node convergence before selecting final targets',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    3,
    'all requested initial replicas should become routable',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for admission ' +
  'convergence before planning the initial replica cohort', async (t) => {
  const partitionId = 'tbl-admission-convergence-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let admissionConverged = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      const allowed = move.nodeId === localNodeId || admissionConverged;
      if (allowed) {
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      }
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['insufficient_placement_eligible_nodes'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['clusterMemberHealthy'],
            reasonCodes: ['cluster_member_unhealthy'],
          }],
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 50,
    tablePartitionProvisioningPollIntervalMs: 1,
    tablePartitionTargetNodeConvergenceTimeoutMs: 10,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    admissionConverged = true;
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.ok(
    sleepCalls > 0,
    'provisioning should poll for admission convergence before planning',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should wait for newly admissible peers instead of failing early',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition extends the default ' +
  'convergence wait when enough active nodes exist but admission settles late',
async (t) => {
  const partitionId = 'tbl-admission-convergence-default-window-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];
  let sleepCalls = 0;
  let fakeNow = 1000;
  let admissionConverged = false;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      const allowed = move.nodeId === localNodeId || admissionConverged;
      if (allowed) {
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      }
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['cluster_member_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['clusterMemberHealthy'],
            reasonCodes: ['cluster_member_unhealthy'],
          }],
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 5000,
    tablePartitionProvisioningPollIntervalMs: 400,
    nowFn: () => fakeNow,
  });
  engine.sleep = async (ms) => {
    sleepCalls += 1;
    fakeNow += ms;
    if (fakeNow >= 2200) {
      admissionConverged = true;
    }
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.ok(
    sleepCalls >= 3,
    'default convergence wait should keep polling past the legacy one-second window',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'bootstrap should preserve the full cohort once delayed admission converges',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition does not block on full ' +
  'provisioning timeout when only one active target node is visible',
async (t) => {
  const partitionId = 'tbl-single-node-bootstrap-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const services = [];
  let sleepCalls = 0;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        service_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        replica_id: operation.replicaId || `${operation.partitionId}-${targetNodeId}`,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 200,
    tablePartitionProvisioningPollIntervalMs: 5,
    tablePartitionTargetNodeConvergenceTimeoutMs: 20,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  const startedAtMs = Date.now();
  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });
  const elapsedMs = Date.now() - startedAtMs;

  t.same(
    createdTargetNodeIds,
    [localNodeId],
    'single-node bootstrap should degrade the initial cohort to the visible target node',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    1,
    'single-node bootstrap should publish one routable replica',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should still poll briefly for cache convergence',
  );
  t.ok(
    elapsedMs < 120,
    'provisioning should not wait for the full table-partition provisioning timeout',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition attaches bootstrap ' +
  'table and partition metadata to CREATE_REPLICA operations', async (t) => {
  const tableId = 'tbl-bootstrap-metadata';
  const partitionId = `${tableId}-p1`;
  const localNodeId = 'node-a';
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const tables = [];
  const partitions = [];
  const services = [];
  const executedOperations = [];
  const tableMetadata = {
    table_id: tableId,
    table_name: 'bootstrap_metadata_events',
    schema_definition: JSON.stringify({
      columns: [{name: 'event_id', type: 'TEXT', primaryKey: true}],
    }),
  };
  const partitionMetadata = {
    partition_id: partitionId,
    table_id: tableId,
    table_name: 'bootstrap_metadata_events',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    replica_count: 1,
    size_bytes: 0,
    leader_node_id: null,
    state: 'NORMAL',
    created_at: 100,
    updated_at: 100,
  };

  const cache = {
    has() {
      return false;
    },
    get() {
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      executedOperations.push(operation);
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    tableName: 'bootstrap_metadata_events',
    tableMetadata,
    partitionId,
    partitionMetadata,
    replicaCount: 1,
  });

  t.equal(executedOperations.length, 1, 'provisioning should dispatch one CREATE_REPLICA operation');
  t.same(
    executedOperations[0]?.bootstrapTableMetadata,
    tableMetadata,
    'CREATE_REPLICA should carry the canonical table metadata snapshot',
  );
  t.same(
    executedOperations[0]?.bootstrapPartitionMetadata,
    partitionMetadata,
    'CREATE_REPLICA should carry the canonical partition metadata snapshot',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for created ' +
  'service rows through CDC cache repair before final routing checks', async (t) => {
  const partitionId = 'tbl-service-visibility-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];
  const waitCalls = [];

  const cache = {
    onCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  let replicaOrdinal = 0;
  const rebalanceCoordinator = {
    async createOperation(move) {
      replicaOrdinal += 1;
      return {
        operationId: `op-${replicaOrdinal}`,
        replicaId: `${partitionId}-r${replicaOrdinal}`,
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService: {
      async waitForCacheUpdate(tableName, key, expectPresent, options) {
        waitCalls.push({tableName, key, expectPresent, options});
        if (tableName === TABLES.SERVICES && expectPresent === true) {
          const existing = services.find((row) =>
            row.service_id === key || row.replica_id === key,
          );
          if (!existing) {
            services.push({
              service_id: key,
              replica_id: key,
              partition_id: partitionId,
              service_type: 'partition',
              status: 'active',
              node_id: localNodeId,
              address: `${localNodeId}/partition/${key}`,
            });
          }
        }
      },
    },
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.equal(waitCalls.length, 2);
  t.same(waitCalls.map((call) => ({
    tableName: call.tableName,
    key: call.key,
    expectPresent: call.expectPresent,
    fallbackPhase: call.options?.fallbackPhase,
  })), [
    {
      tableName: TABLES.SERVICES,
      key: `${partitionId}-r1`,
      expectPresent: true,
      fallbackPhase: 'steady_state',
    },
    {
      tableName: TABLES.SERVICES,
      key: `${partitionId}-r2`,
      expectPresent: true,
      fallbackPhase: 'steady_state',
    },
  ]);
  for (const call of waitCalls) {
    t.ok(
      Number.isFinite(call.options?.timeoutMs) &&
      call.options.timeoutMs > 0 &&
      call.options.timeoutMs <= 30000,
      'cache wait should use the remaining 30s provisioning budget',
    );
  }
});

test('SQLQueryEngine - provisionInitialTablePartition only waits for service ' +
  'row visibility before final full-cohort routing checks', async (t) => {
  const partitionId = 'tbl-service-visibility-owner-boundary-p1';
  const localNodeId = 'node-a';
  const targetNodeIds = [localNodeId, 'node-b', 'node-c'];
  const services = [];
  const waitCalls = [];
  const replicaIdByNodeId = {
    'node-a': `${partitionId}-r1`,
    'node-b': `${partitionId}-r2`,
    'node-c': `${partitionId}-r3`,
  };
  const nodeIdByReplicaId = Object.fromEntries(
    Object.entries(replicaIdByNodeId).map(([nodeId, replicaId]) =>
      [replicaId, nodeId],
    ),
  );

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    get(type, key) {
      if (type === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: replicaIdByNodeId[move.nodeId],
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService: {
      async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
        waitCalls.push({tableName, key, expectPresent, options});
        if (tableName !== TABLES.SERVICES || expectPresent !== true) {
          return;
        }
        if (!services.some((row) => row.service_id === key)) {
          services.push({
            service_id: key,
            replica_id: key,
            partition_id: partitionId,
            service_type: 'partition',
            status: 'active',
            node_id: nodeIdByReplicaId[key],
            address: `${nodeIdByReplicaId[key]}/partition/${key}`,
          });
        }
      },
    },
    tablePartitionProvisioningTimeoutMs: 30,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.queryExecutor.isRoutablePartitionService = (service) =>
    service?.node_id !== localNodeId;
  engine.waitForCondition = async () => {
    throw new Error('per-replica routability wait should not run');
  };
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.resolves(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
      targetNodeIds,
    }),
    'full-cohort bootstrap should defer routability to the final cohort wait',
  );

  t.same(
    waitCalls.map((call) => ({
      tableName: call.tableName,
      key: call.key,
      expectPresent: call.expectPresent,
      expectedFields: call.options?.expectedFields || null,
    })),
    [
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-a'],
        expectPresent: true,
        expectedFields: null,
      },
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-b'],
        expectPresent: true,
        expectedFields: null,
      },
      {
        tableName: TABLES.SERVICES,
        key: replicaIdByNodeId['node-c'],
        expectPresent: true,
        expectedFields: null,
      },
    ],
    'per-replica waits should only hydrate service rows before the later routing owners run',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition dispatches full initial ' +
  'replica set before per-replica cache waits consume timeout budget', async (t) => {
  const partitionId = 'tbl-provision-dispatch-order-p1';
  const localNodeId = 'node-a';
  const replicaIdByNodeId = {
    'node-a': `${partitionId}-r1`,
    'node-b': `${partitionId}-r2`,
  };
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: Date.now() + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: Date.now() + 60000,
    },
  ];
  const services = [];
  const executedTargetNodeIds = [];
  const cacheWaitCalls = [];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    get(type, key) {
      if (type === TABLES.SERVICES) {
        return services.find((row) => row.service_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: replicaIdByNodeId[move.nodeId],
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      return {success: true};
    },
  };

  const cdcIntegrationService = {
    async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
      cacheWaitCalls.push({
        tableName,
        key,
        expectPresent,
        timeoutMs: options.timeoutMs,
      });
      if (tableName !== TABLES.SERVICES || expectPresent !== true) {
        return;
      }

      const requiredDelayMs = key === replicaIdByNodeId['node-a'] ? 28 : 8;
      if (!Number.isFinite(options.timeoutMs) ||
          options.timeoutMs < requiredDelayMs) {
        throw new Error(
          `cache wait budget ${String(options.timeoutMs)}ms too small for ${key}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, requiredDelayMs));
      if (!services.some((row) => row.service_id === key)) {
        services.push({
          service_id: key,
          replica_id: key,
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: key === replicaIdByNodeId['node-a'] ? 'node-a' : 'node-b',
          address: `node/${key}`,
        });
      }
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService,
    tablePartitionProvisioningTimeoutMs: 30,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.same(
    executedTargetNodeIds,
    ['node-a', 'node-b'],
    'both CREATE_REPLICA dispatches should happen before timeout budget is consumed by waits',
  );
  t.equal(
    cacheWaitCalls.length,
    2,
    'each replica should still wait for authoritative service-row visibility',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition suppresses duplicate ' +
  'coordinator-created dispatch when executing planned replicas inline',
async (t) => {
  const tableId = 'tbl-inline-provision-dispatch';
  const partitionId = 'tbl-inline-provision-dispatch-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'users_inline_dispatch'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];
  const createOperationFlags = [];
  const executedInlineFlags = [];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createOperationFlags.push(move.emitOperationCreated === false);
      return {
        operationId: `op-${move.nodeId}`,
        replicaId: `${partitionId}-r1`,
        targetNodeId: move.nodeId,
        emitOperationCreated: move.emitOperationCreated !== false,
        ...move,
      };
    },
    async executeOperation(operation) {
      executedInlineFlags.push(operation.emitOperationCreated === false);
      if (operation.emitOperationCreated !== false) {
        return {
          success: false,
          error: 'Transaction already active on this partition',
        };
      }
      services.push({
        service_id: operation.replicaId,
        replica_id: operation.replicaId,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: operation.targetNodeId || operation.nodeId,
        raft_role: 'leader',
        address: `${operation.targetNodeId || operation.nodeId}/partition/${operation.replicaId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 200,
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.same(
    createOperationFlags,
    [true],
    'inline provisioning should suppress the coordinator-created dispatch event',
  );
  t.same(
    executedInlineFlags,
    [true],
    'inline provisioning should execute replicas with duplicate dispatch suppressed',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition skips disconnected nodes',
  async (t) => {
    const tableId = 'tbl-orders';
    const partitionId = 'tbl-orders-p1';
    const localNodeId = 'node-a';
    const createdTargetNodeIds = [];
    const nodes = [
      {node_id: localNodeId, status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'disconnected'},
      {node_id: 'node-c', status: 'active', connection_state: 'disconnected'},
      {node_id: 'node-d', status: 'active', connection_state: 'connected'},
      {node_id: 'node-e', status: 'active', connection_state: 'connected'},
    ];
    const tables = [{table_id: tableId, table_name: 'orders'}];
    const partitions = [{partition_id: partitionId, table_id: tableId}];
    const services = [];

    const cache = {
      has(type, key) {
        if (type === TABLES.TABLES) {
          return tables.some((row) => row.table_id === key);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.some((row) => row.partition_id === key);
        }
        return false;
      },
      get(type, key) {
        if (type !== TABLES.TABLES) {
          return null;
        }
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      },
      filter(type, predicate) {
        if (type === TABLES.NODES) {
          return nodes.filter(predicate);
        }
        if (type === TABLES.TABLES) {
          return tables.filter(predicate);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return services.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.NODES) {
          return nodes;
        }
        if (type === TABLES.TABLES) {
          return tables;
        }
        if (type === TABLES.PARTITIONS) {
          return partitions;
        }
        if (type === TABLES.SERVICES) {
          return services;
        }
        return [];
      },
    };

    const rebalanceCoordinator = {
      async createOperation(move) {
        createdTargetNodeIds.push(move.nodeId);
        return {
          operationId: `op-${move.nodeId}`,
          ...move,
        };
      },
      async executeOperation(operation) {
        const targetNodeId = operation.targetNodeId || operation.nodeId;
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
        return {success: true};
      },
    };

    const engine = new SQLQueryEngine({
      nodeId: localNodeId,
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator,
      tablePartitionProvisioningTimeoutMs: 500,
      tablePartitionProvisioningPollIntervalMs: 5,
    });

    await engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 3,
    });

    t.same(
      createdTargetNodeIds,
      ['node-a', 'node-d', 'node-e'],
      'provisioning should target connected/ready active nodes only',
    );
  });

test('SQLQueryEngine - provisionInitialTablePartition continues planning on ' +
  'admission-denied targets', async (t) => {
  const partitionId = 'tbl-admission-fallback-p1';
  const localNodeId = 'node-a';
  const attemptedTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const createAdmissionDeniedError = (nodeId) => {
    const error = new Error(`Provisioning admission denied on ${nodeId}`);
    error.admissionResult = {
      allowed: false,
      decisionType: 'deferred',
      blockingReasons: ['insufficient_placement_eligible_nodes'],
      ineligibleNodes: [{
        nodeId,
        failedDimensions: ['controlPlaneWritable'],
        reasonCodes: ['control_plane_write_unhealthy'],
      }],
    };
    return error;
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      attemptedTargetNodeIds.push(move.nodeId);
      if (move.nodeId === localNodeId) {
        throw createAdmissionDeniedError(move.nodeId);
      }
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 1,
  });

  t.same(
    attemptedTargetNodeIds,
    ['node-a', 'node-b'],
    'planning should continue to alternate targets after admission denial',
  );
  t.same(
    executedTargetNodeIds,
    ['node-b'],
    'dispatch should use the first admissible target',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition fails fast when ' +
  'admission blocks all targets', async (t) => {
  const partitionId = 'tbl-admission-blocked-p1';
  const localNodeId = 'node-a';
  const attemptedTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      attemptedTargetNodeIds.push(move.nodeId);
      const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
      error.admissionResult = {
        allowed: false,
        decisionType: 'deferred',
        blockingReasons: ['insufficient_placement_eligible_nodes'],
        ineligibleNodes: [{
          nodeId: move.nodeId,
          failedDimensions: ['clusterMemberHealthy'],
          reasonCodes: ['cluster_member_unhealthy'],
        }],
      };
      throw error;
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    attemptedTargetNodeIds,
    ['node-a', 'node-b'],
    'planning should evaluate all discovered candidates before failing',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition probes admission ' +
  'before creating operations', async (t) => {
  const partitionId = 'tbl-admission-probe-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: false,
        decisionType: 'deferred',
        admissionResult: {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['insufficient_placement_eligible_nodes'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['clusterMemberHealthy'],
            reasonCodes: ['cluster_member_unhealthy'],
          }],
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should evaluate all discovered candidates',
  );
  t.same(
    createdTargetNodeIds,
    [],
    'operation rows should not be created when admission probe already fails',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition downscales when ' +
  'create-phase admission leaves a smaller viable cohort', async (t) => {
  const partitionId = 'tbl-admission-race-downscale-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-b') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: 'leader',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 2,
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should still evaluate the full desired cohort first',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'create phase should attempt all previously admitted targets until shortfall is known',
  );
  t.same(
    executedTargetNodeIds,
    ['node-a'],
    'bootstrap should continue with the viable reduced cohort instead of aborting',
  );
  t.same(
    failedOperationIds,
    [],
    'successful provisional operations should not be failed when degraded bootstrap can continue',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition preserves a quorum ' +
  'floor when convergence timing leaves only one RF3 target provisionable',
async (t) => {
  const partitionId = 'tbl-admission-quorum-floor-timeout-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      const allowed = move.nodeId === localNodeId;
      return {
        allowed,
        decisionType: allowed ? 'admitted' : 'deferred',
        admissionResult: {
          allowed,
          decisionType: allowed ? 'admitted' : 'deferred',
          ...(allowed ? {} : {
            blockingReasons: ['storage_budget_unavailable'],
            ineligibleNodes: [{
              nodeId: move.nodeId,
              failedDimensions: ['storageBudgetAvailable'],
              reasonCodes: ['storage_budget_unavailable'],
            }],
          }),
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionTargetNodeConvergenceTimeoutMs: 1,
    tablePartitionProvisioningPollIntervalMs: 1,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission convergence should still probe the full RF3 cohort',
  );
  t.same(
    createdTargetNodeIds,
    [],
    'initial provisioning should not silently downscale to a single replica after convergence timeout',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition downscales RF3 ' +
  'create-phase shortfall only to quorum, not to one replica', async (t) => {
  const partitionId = 'tbl-admission-race-quorum-floor-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const services = [];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-c') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission probe should still evaluate the full RF3 cohort first',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c'],
    'create phase should still attempt all admitted RF3 targets until shortfall is known',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId, 'node-b'],
    'RF3 provisioning may degrade to the two-node quorum cohort',
  );
  t.same(
    failedOperationIds,
    [],
    'successful quorum-sized provisional operations should remain active',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition rejects RF3 ' +
  'create-phase shortfall below quorum', async (t) => {
  const partitionId = 'tbl-admission-race-below-quorum-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId !== localNodeId) {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['storage_budget_unavailable'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['storageBudgetAvailable'],
            reasonCodes: ['storage_budget_unavailable'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 3,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c'],
    'admission probe should still evaluate all RF3 targets',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c'],
    'create phase should discover the shortfall before failing',
  );
  t.same(
    failedOperationIds,
    ['op-node-a'],
    'single provisional replica should be aborted when the RF3 quorum floor is not met',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition aborts provisional ' +
  'operations when post-check planning becomes insufficient', async (t) => {
  const partitionId = 'tbl-admission-race-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const failedOperationIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-b') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async failOperation(operation) {
      failedOperationIds.push(operation.operationId);
    },
    async executeOperation() {
      throw new Error('executeOperation should not be called');
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await t.rejects(
    engine.provisionInitialTablePartition({
      partitionId,
      replicaCount: 2,
      minimumRoutableReplicaCount: 2,
    }),
    /Unable to satisfy minimum routable provisioning cohort/,
  );

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    ['node-a', 'node-b'],
    'admission probe should run for both target nodes before create phase',
  );
  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'create phase should still attempt admitted targets until minimum is met',
  );
  t.same(
    failedOperationIds,
    ['op-node-a'],
    'newly created provisional operation should be failed before returning error',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition includes active-service ' +
  'nodes despite transient disconnected cache state', async (t) => {
    const tableId = 'tbl-benchmark';
    const partitionId = 'tbl-benchmark-p1';
    const localNodeId = 'node-a';
    const createdTargetNodeIds = [];
    const nodes = [
      {node_id: localNodeId, status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'connected'},
      {node_id: 'node-c', status: 'active', connection_state: 'disconnected'},
    ];
    const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
    const partitions = [{partition_id: partitionId, table_id: tableId}];
    const services = [{
      service_id: 'mg-1-r3',
      service_type: 'message_group',
      status: 'active',
      node_id: 'node-c',
      address: 'node-c/message-group/mg-1-r3',
    }];

    const cache = {
      has(type, key) {
        if (type === TABLES.TABLES) {
          return tables.some((row) => row.table_id === key);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.some((row) => row.partition_id === key);
        }
        return false;
      },
      get(type, key) {
        if (type !== TABLES.TABLES) {
          return null;
        }
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      },
      filter(type, predicate) {
        if (type === TABLES.NODES) {
          return nodes.filter(predicate);
        }
        if (type === TABLES.TABLES) {
          return tables.filter(predicate);
        }
        if (type === TABLES.PARTITIONS) {
          return partitions.filter(predicate);
        }
        if (type === TABLES.SERVICES) {
          return services.filter(predicate);
        }
        return [];
      },
      getAll(type) {
        if (type === TABLES.NODES) {
          return nodes;
        }
        if (type === TABLES.TABLES) {
          return tables;
        }
        if (type === TABLES.PARTITIONS) {
          return partitions;
        }
        if (type === TABLES.SERVICES) {
          return services;
        }
        return [];
      },
    };

    const rebalanceCoordinator = {
      async createOperation(move) {
        createdTargetNodeIds.push(move.nodeId);
        return {
          operationId: `op-${move.nodeId}`,
          ...move,
        };
      },
      async executeOperation(operation) {
        const targetNodeId = operation.targetNodeId || operation.nodeId;
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
        return {success: true};
      },
    };

    const engine = new SQLQueryEngine({
      nodeId: localNodeId,
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
      rebalanceCoordinator,
      tablePartitionProvisioningTimeoutMs: 500,
      tablePartitionProvisioningPollIntervalMs: 5,
    });

    await engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 3,
    });

    t.same(
      createdTargetNodeIds,
      ['node-a', 'node-b', 'node-c'],
      'provisioning should not silently drop active-service nodes',
    );
  });

test('SQLQueryEngine - provisionInitialTablePartition excludes active-service ' +
  'nodes with expired ready leases', async (t) => {
  const tableId = 'tbl-benchmark';
  const partitionId = 'tbl-benchmark-p1';
  const localNodeId = 'node-a';
  const now = Date.now();
  const createdTargetNodeIds = [];
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-c',
      status: 'active',
      connection_state: 'disconnected',
      ready_lease_expires_at: now - 1000,
    },
    {
      node_id: 'node-d',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now + 60000,
    },
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [{
    service_id: 'mg-1-r3',
    service_type: 'message_group',
    status: 'active',
    node_id: 'node-c',
    address: 'node-c/message-group/mg-1-r3',
  }];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 500,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-d'],
    'provisioning should refuse active-service nodes whose ready lease expired',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition falls back to active ' +
  'service nodes when ready leases are stale', async (t) => {
  const tableId = 'tbl-ready-lease-fallback';
  const partitionId = 'tbl-ready-lease-fallback-p1';
  const localNodeId = 'node-a';
  const now = Date.now();
  const createdTargetNodeIds = [];
  const nodes = [
    {
      node_id: localNodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: now + 60000,
    },
    {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now - 1000,
    },
    {
      node_id: 'node-c',
      status: 'active',
      connection_state: 'connected',
      ready_lease_expires_at: now - 1000,
    },
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [
    {
      service_id: 'mg-1-r2',
      service_type: 'message_group',
      status: 'active',
      node_id: 'node-b',
      address: 'node-b/message-group/mg-1-r2',
    },
    {
      service_id: 'mg-1-r3',
      service_type: 'message_group',
      status: 'active',
      node_id: 'node-c',
      address: 'node-c/message-group/mg-1-r3',
    },
  ];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 1,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should avoid timeout by using active-service ownership for stale leases',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition does not block on stale ' +
  'table/partition cache metadata', async (t) => {
  const partitionId = 'tbl-stale-cache-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
  ];
  const services = [];

  const cache = {
    has() {
      return false;
    },
    get() {
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 500,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId: 'tbl-stale-cache',
    partitionId,
    replicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'provisioning should continue even when table/partition rows are not yet visible in cache',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning should still create routable replicas',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition honors explicit ' +
  'targetNodeIds for split child provisioning', async (t) => {
  const partitionId = 'tbl-split-child-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'disconnected'},
  ];
  const services = [];

  const cache = {
    has() {
      return false;
    },
    get() {
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 500,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId: 'tbl-split-child',
    partitionId,
    replicaCount: 2,
    minimumRoutableReplicaCount: 2,
    targetNodeIds: ['node-a', 'node-b'],
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b'],
    'explicit split targets should be used even when readiness filtering is stricter',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning should establish a quorum-ready child cohort from explicit targets',
  );
});

test('SQLQueryEngine - only evaluates local leader partitions for managed splits',
  async (t) => {
    const cache = createMockSystemCache(
      [{
        table_id: 'tbl-users',
        table_name: 'users',
        partition_key: 'id',
        active_partition_version: 1,
      }],
      [
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 1,
          leader_node_id: 'node-a',
        },
        {
          partition_id: 'users-p2',
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key_start: 'm',
          partition_key_end: null,
          partition_version: 1,
          leader_node_id: 'node-b',
        },
      ],
    );

    const engine = new SQLQueryEngine({
      nodeId: 'node-a',
      systemCache: cache,
      messageRouter: createMockMessageRouter(),
    });

    t.same(
      engine.listManagedSplitPartitions().map((partition) => partition.partition_id),
      ['users-p1'],
    );
  });

test('SQLQueryEngine - executeManagedSplit rejects non-leader callers', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 1,
      leader_node_id: 'node-a',
    }],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-b',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
    },
    partitionSplitMergeManager: {
      async splitPartition() {
        return {
          medianKey: 'm',
          leftPartition: {
            partitionId: 'users-p-left',
            keyRange: {start: null, end: 'm'},
          },
          rightPartition: {
            partitionId: 'users-p-right',
            keyRange: {start: 'm', end: null},
          },
        };
      },
    },
  });
  engine.provisionInitialTablePartition = async () => {};
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await t.rejects(
    engine.executeManagedSplit('users-p1'),
    /leader/i,
  );
});

test('SQLQueryEngine - executeManagedSplit delegates to the injected managed split owner',
  async (t) => {
    const calls = [];
    const engine = new SQLQueryEngine({
      managedSplitWorkflow: {
        async execute(partitionId) {
          calls.push(partitionId);
          return {success: true, partitionId};
        },
      },
    });

    const result = await engine.executeManagedSplit('users-p1');

    t.same(calls, ['users-p1']);
    t.same(result, {success: true, partitionId: 'users-p1'});
  });

test('SQLQueryEngine - waitForTablePartitionMetadata reuses CDC cache repair waits',
  async (t) => {
    const waitCalls = [];
    const engine = new SQLQueryEngine({
      systemCache: {
        onCacheChange() {},
      },
      cdcIntegrationService: {
        async waitForCacheUpdate(tableName, key, expectPresent, options) {
          waitCalls.push({tableName, key, expectPresent, options});
        },
      },
    });

    await engine.waitForTablePartitionMetadata('tbl-users', 'users-p-left');

    t.same(waitCalls, [
      {
        tableName: TABLES.PARTITIONS,
        key: 'users-p-left',
        expectPresent: true,
        options: {
          fallbackPhase: 'steady_state',
          timeoutMs: 30000,
        },
      },
      {
        tableName: TABLES.TABLES,
        key: 'tbl-users',
        expectPresent: true,
        options: {
          fallbackPhase: 'steady_state',
          timeoutMs: 30000,
        },
      },
    ]);
  });

test('SQLQueryEngine - waitForTablePartitionMetadata uses remaining budget ' +
  'for nested cache waits', async (t) => {
    const waitCalls = [];
    let nowMs = 1012;
    const parentBudget = createTimeoutBudget({
      configuredBudgetMs: 30,
      startedAtMs: 1000,
      now: () => 1000,
    });
    const engine = new SQLQueryEngine({
      systemCache: {
        onCacheChange() {},
      },
      cdcIntegrationService: {
        async waitForCacheUpdate(tableName, key, expectPresent, options) {
          waitCalls.push({tableName, key, expectPresent, options});
        },
      },
      nowFn: () => nowMs,
    });

    await engine.waitForTablePartitionMetadata(
      'tbl-users',
      'users-p-left',
      parentBudget,
    );

    t.equal(waitCalls.length, 2);
    t.equal(waitCalls[0].options.timeoutMs, 18);
    t.equal(waitCalls[1].options.timeoutMs, 18);
  });

test('SQLQueryEngine - executeManagedSplit dispatches both child metadata writes ' +
  'before waiting for child visibility', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: 'node-a',
    }],
    [
      {
        service_id: 'users-p1-r1',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/users-p1-r1',
        status: 'active',
      },
      {
        service_id: 'users-p1-r2',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/users-p1-r2',
        status: 'active',
      },
    ],
  );

  let resolveLeftInsert;
  const leftInsertPromise = new Promise((resolve) => {
    resolveLeftInsert = resolve;
  });
  let notifyLeftInsertStarted;
  const leftInsertStarted = new Promise((resolve) => {
    notifyLeftInsertStarted = resolve;
  });
  const childInsertCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row, options = {}) {
        childInsertCalls.push({
          tableName,
          partitionId: row.partition_id,
          options,
        });
        if (row.partition_id === 'users-p-left') {
          notifyLeftInsertStarted();
          await leftInsertPromise;
        }
        return {success: true};
      },
    },
  });

  engine.buildManagedSplitPlan = async () => ({
    medianKey: 'm',
    leftPartition: {
      partitionId: 'users-p-left',
      keyRange: {start: null, end: 'm'},
    },
    rightPartition: {
      partitionId: 'users-p-right',
      keyRange: {start: 'm', end: null},
    },
  });
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async () => {};
  engine.startSplitReplicationOnSourcePartition = async () => {};

  const splitPromise = engine.executeManagedSplit('users-p1');
  await leftInsertStarted;

  t.equal(
    childInsertCalls.length,
    2,
    'both child metadata writes should be dispatched before the first insert resolves',
  );
  t.same(
    childInsertCalls.map((call) => call.partitionId),
    ['users-p-left', 'users-p-right'],
    'managed split should enqueue both child partition rows before waiting',
  );
  t.same(
    childInsertCalls.map((call) => call.options.skipCacheWait),
    [true, true],
    'child metadata writes should skip per-row cache waits and defer visibility gating',
  );

  resolveLeftInsert();
  await splitPromise;
});

test('SQLQueryEngine - executeManagedSplit provisions child partitions with ' +
  'a quorum-ready cohort before backfill', async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: 'node-a',
    }],
    [
      {
        service_id: 'users-p1-r1',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/users-p1-r1',
        status: 'active',
      },
      {
        service_id: 'users-p1-r2',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/users-p1-r2',
        status: 'active',
      },
    ],
  );

  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
    },
  });

  engine.buildManagedSplitPlan = async () => ({
    medianKey: 'm',
    leftPartition: {
      partitionId: 'users-p-left',
      keyRange: {start: null, end: 'm'},
    },
    rightPartition: {
      partitionId: 'users-p-right',
      keyRange: {start: 'm', end: null},
    },
  });
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await engine.executeManagedSplit('users-p1');

  t.equal(provisionCalls.length, 2, 'both child partitions should be provisioned');
  t.same(
    provisionCalls.map((context) => context.minimumRoutableReplicaCount),
    [2, 2],
    'managed split should wait for a quorum-ready child cohort instead of the full replica count before starting backfill',
  );
});

test('SQLQueryEngine - executeManagedSplit spreads child bootstrap cohorts ' +
  'across newly eligible nodes when the split target pool is wider than one replica set',
async (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: 'node-a',
    }],
    [
      {
        service_id: 'users-p1-r1',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/users-p1-r1',
        status: 'active',
      },
      {
        service_id: 'users-p1-r2',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/users-p1-r2',
        status: 'active',
      },
      {
        service_id: 'users-p1-r3',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/users-p1-r3',
        status: 'active',
      },
    ],
    [
      {node_id: 'node-a', status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'ready'},
      {node_id: 'node-c', status: 'active', connection_state: 'ready'},
      {node_id: 'node-d', status: 'active', connection_state: 'ready'},
      {node_id: 'node-e', status: 'active', connection_state: 'ready'},
      {node_id: 'node-f', status: 'active', connection_state: 'ready'},
      {node_id: 'node-g', status: 'active', connection_state: 'ready'},
    ],
  );

  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
    },
  });

  engine.buildManagedSplitPlan = async () => ({
    medianKey: 'm',
    leftPartition: {
      partitionId: 'users-p-left',
      keyRange: {start: null, end: 'm'},
    },
    rightPartition: {
      partitionId: 'users-p-right',
      keyRange: {start: 'm', end: null},
    },
  });
  engine.waitForTablePartitionMetadata = async () => {};
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {};

  await engine.executeManagedSplit('users-p1');

  t.same(
    provisionCalls.map((context) => context.targetNodeIds),
    [
      ['node-a', 'node-d', 'node-e', 'node-f', 'node-g', 'node-b', 'node-c'],
      ['node-a', 'node-f', 'node-g', 'node-d', 'node-e', 'node-b', 'node-c'],
    ],
    'child provisioning should preserve a wider admitted split pool as ordered fallbacks instead of collapsing to one fixed cohort',
  );
});

test('SQLQueryEngine - executeManagedSplit defers before child metadata ' +
  'insertion when child provisioning precheck cannot satisfy quorum', async (t) => {
  const tables = [{
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
  }];
  const cache = createMockSystemCache(
    tables,
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: 'node-a',
    }],
    [
      {
        service_id: 'users-p1-r1',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-a',
        raft_role: 'leader',
        address: 'node-a/partition/users-p1-r1',
        status: 'active',
      },
      {
        service_id: 'users-p1-r2',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/users-p1-r2',
        status: 'active',
      },
      {
        service_id: 'users-p1-r3',
        service_type: 'partition',
        partition_id: 'users-p1',
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/users-p1-r3',
        status: 'active',
      },
    ],
    [
      {node_id: 'node-a', status: 'active', connection_state: 'ready'},
      {node_id: 'node-b', status: 'active', connection_state: 'ready'},
      {node_id: 'node-c', status: 'active', connection_state: 'ready'},
      {node_id: 'node-d', status: 'active', connection_state: 'ready'},
      {node_id: 'node-e', status: 'active', connection_state: 'ready'},
      {node_id: 'node-f', status: 'active', connection_state: 'ready'},
      {node_id: 'node-g', status: 'active', connection_state: 'ready'},
    ],
  );

  const checkedMoves = [];
  const childInsertCalls = [];
  const provisionCalls = [];
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: {
      storageAdmissionService: createAdmittedSplitAdmissionService(),
      async checkProvisioningAdmission(move) {
        checkedMoves.push({
          partitionId: move.partitionId,
          nodeId: move.nodeId,
        });
        if (move.partitionId === 'users-p-right' &&
            move.nodeId !== 'node-a') {
          return {
            allowed: false,
            decisionType: 'deferred',
            admissionResult: {
              allowed: false,
              decisionType: 'deferred',
              blockingReasons: ['control_plane_write_unhealthy'],
              ineligibleNodes: [{
                nodeId: move.nodeId,
                failedDimensions: ['controlPlaneWritable'],
                reasonCodes: ['control_plane_write_unhealthy'],
              }],
            },
          };
        }
        return {
          allowed: true,
          decisionType: 'admitted',
          admissionResult: {
            allowed: true,
            decisionType: 'admitted',
          },
        };
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === TABLES.TABLES) {
          const row = tables.find((entry) =>
            entry.table_id === whereClause.table_id,
          );
          if (row) {
            Object.assign(row, data);
          }
        }
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        childInsertCalls.push({
          tableName,
          partitionId: row.partition_id,
        });
        return {success: true};
      },
    },
  });

  engine.buildManagedSplitPlan = async () => ({
    medianKey: 'm',
    leftPartition: {
      partitionId: 'users-p-left',
      keyRange: {start: null, end: 'm'},
    },
    rightPartition: {
      partitionId: 'users-p-right',
      keyRange: {start: 'm', end: null},
    },
  });
  engine.waitForTablePartitionMetadata = async () => {
    t.fail('metadata visibility wait must not run on child precheck deferral');
  };
  engine.provisionInitialTablePartition = async (context) => {
    provisionCalls.push(context);
  };
  engine.startSplitReplicationOnSourcePartition = async () => {
    t.fail('source replication must not start on child precheck deferral');
  };

  const result = await engine.executeManagedSplit('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(
    childInsertCalls.length,
    0,
    'child metadata rows must not be inserted before child cohorts are viable',
  );
  t.equal(
    provisionCalls.length,
    0,
    'child provisioning must not start when precheck already proves a shortfall',
  );
  t.ok(
    checkedMoves.some((move) =>
      move.partitionId === 'users-p-left',
    ),
    'managed split should precheck the left child cohort',
  );
  t.ok(
    checkedMoves.some((move) =>
      move.partitionId === 'users-p-right',
    ),
    'managed split should precheck the right child cohort',
  );
  const persistedMetadata = JSON.parse(
    tables[0].partition_transition_metadata,
  );
  t.equal(
    tables[0].partition_transition_state,
    PARTITION_TRANSITION_STATE.DEFERRED,
    'the deferred workflow state should persist through the canonical table row',
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_child_provisioning_precheck_failed',
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].childProvisioningAdmissionByPartitionId['users-p-right']
      .maximumProvisionableReplicaCount,
    1,
    'persisted diagnostics should retain the failing child precheck result',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition uses explicit child ' +
  'target fallbacks when later admission rejects preferred nodes', async (t) => {
  const partitionId = 'tbl-split-child-fallback-p1';
  const localNodeId = 'node-a';
  const checkedTargetNodeIds = [];
  const createdTargetNodeIds = [];
  const executedTargetNodeIds = [];
  const services = [];
  const nodes = [
    {node_id: localNodeId, status: 'active', connection_state: 'ready'},
    {node_id: 'node-b', status: 'active', connection_state: 'ready'},
    {node_id: 'node-c', status: 'active', connection_state: 'ready'},
    {node_id: 'node-d', status: 'active', connection_state: 'ready'},
  ];

  const cache = {
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async checkProvisioningAdmission(move) {
      checkedTargetNodeIds.push(move.nodeId);
      return {
        allowed: true,
        decisionType: 'admitted',
        admissionResult: {
          allowed: true,
          decisionType: 'admitted',
        },
      };
    },
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      if (move.nodeId === 'node-b' || move.nodeId === 'node-c') {
        const error = new Error(`Provisioning admission denied on ${move.nodeId}`);
        error.admissionResult = {
          allowed: false,
          decisionType: 'deferred',
          blockingReasons: ['control_plane_write_unhealthy'],
          ineligibleNodes: [{
            nodeId: move.nodeId,
            failedDimensions: ['controlPlaneWritable'],
            reasonCodes: ['control_plane_write_unhealthy'],
          }],
        };
        throw error;
      }
      return {
        operationId: `op-${move.nodeId}`,
        createdAt: Date.now(),
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      executedTargetNodeIds.push(targetNodeId);
      services.push({
        replica_id: operation.replicaId || operation.replica_id,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
    targetNodeIds: [localNodeId, 'node-b', 'node-c', 'node-d'],
  });

  t.same(
    uniqueNodeIds(checkedTargetNodeIds),
    [localNodeId, 'node-b', 'node-c', 'node-d'],
    'explicit child provisioning targets should still be admission-probed in order',
  );
  t.same(
    createdTargetNodeIds,
    [localNodeId, 'node-b', 'node-c', 'node-d'],
    'later fallback targets should be attempted when earlier explicit targets are rejected',
  );
  t.same(
    executedTargetNodeIds,
    [localNodeId, 'node-d'],
    'provisioning should continue with later explicit fallbacks once the minimum child cohort is still satisfiable',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition fails when the full ' +
  'initial replica cohort never becomes routable', async (t) => {
  const tableId = 'tbl-initial-quorum';
  const partitionId = 'tbl-initial-quorum-p1';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'fast_return'}];
  const partitions = [{partition_id: partitionId, table_id: tableId}];
  const services = [];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      if (targetNodeId === localNodeId) {
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: 'leader',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
        return {success: true};
      }
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const startedAt = Date.now();
  await t.rejects(
    engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 3,
    }),
    new Error(`Timed out waiting for routable partition service for partition ${partitionId}`),
    'initial table creation should fail loudly when the full routable cohort never appears',
  );
  const durationMs = Date.now() - startedAt;

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'provisioning should attempt all target nodes',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    1,
    'only the local replica should have become routable in the regression setup',
  );
  t.ok(
    durationMs >= 40 && durationMs < 1000,
    'provisioning should fail on the configured timeout instead of succeeding early',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition defers active service ' +
  'enforcement to the routable cohort wait after metadata repair', async (t) => {
  const tableId = 'tbl-routable-cache-repair';
  const partitionId = 'tbl-routable-cache-repair-p1';
  const replicaId = `${partitionId}-r1`;
  const localNodeId = 'node-a';
  const nodes = [{node_id: localNodeId, status: 'active'}];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [{
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    service_type: 'partition',
    status: 'creating',
    node_id: localNodeId,
    address: `${localNodeId}/partition/${replicaId}`,
  }];
  const cacheWaitCalls = [];
  let sleepCalls = 0;

  const cache = {
    onCacheChange() {},
    offCacheChange() {},
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      if (type === TABLES.SERVICES) {
        return services.some((row) =>
          row.service_id === key || row.replica_id === key,
        );
      }
      return false;
    },
    get(type, key) {
      if (type === TABLES.TABLES) {
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (type === TABLES.SERVICES) {
        return services.find((row) =>
          row.service_id === key || row.replica_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: 'op-routable-cache-repair',
        replicaId,
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const cdcIntegrationService = {
    async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
      cacheWaitCalls.push({
        tableName,
        key,
        expectPresent,
        options,
      });
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    cdcIntegrationService,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.sleep = async () => {
    sleepCalls += 1;
    services[0] = {
      ...services[0],
      status: 'active',
      raft_role: 'leader',
    };
  };
  engine.waitForPartitionLeaderService = async () => {};

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.equal(
    cacheWaitCalls.length,
    0,
    'visible service rows should skip authoritative metadata repair and defer active enforcement to the routable wait',
  );
  t.equal(
    services[0]?.status,
    'active',
    'the later routable cohort wait should still require the service row to become active',
  );
  t.ok(
    sleepCalls > 0,
    'provisioning should keep polling the routable cohort after metadata visibility is repaired',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition starts replica metadata ' +
  'waits in parallel under one timeout budget', async (t) => {
  const tableId = 'tbl-parallel-replica-metadata-waits';
  const partitionId = 'tbl-parallel-replica-metadata-waits-p1';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];
  const metadataWaitBudgetByReplicaId = new Map();
  let nextReplicaOrdinal = 0;
  let fakeNowMs = 1000;

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      nextReplicaOrdinal += 1;
      return {
        operationId: `op-${nextReplicaOrdinal}`,
        replicaId: `${partitionId}-r${nextReplicaOrdinal}`,
        ...move,
      };
    },
    async executeOperation() {
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 35,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => fakeNowMs,
  });
  engine.waitForRoutablePartitionServiceCount = async () => {};
  engine.waitForPartitionLeaderService = async () => {};
  engine.waitForPartitionServiceMetadata = async (replicaId, timeoutBudget) => {
    const remainingBudgetMsAtStart = timeoutBudget.deadlineMs - fakeNowMs;
    metadataWaitBudgetByReplicaId.set(
      replicaId,
      remainingBudgetMsAtStart,
    );

    await Promise.resolve();

    const requiredBudgetMs = replicaId.endsWith('-r1') ? 30 : 10;
    if (remainingBudgetMsAtStart < requiredBudgetMs) {
      throw new Error(
        `Timed out waiting for partition service metadata for replica ${replicaId}`,
      );
    }
    fakeNowMs += requiredBudgetMs;
  };

  await t.resolves(
    engine.provisionInitialTablePartition({
      tableId,
      partitionId,
      replicaCount: 2,
      targetNodeIds: [localNodeId, 'node-b'],
    }),
    'metadata waits should not be serialized behind one another',
  );

  t.equal(
    metadataWaitBudgetByReplicaId.size,
    2,
    'provisioning should wait for both created replicas',
  );
  t.same(
    [...metadataWaitBudgetByReplicaId.values()].sort((a, b) => a - b),
    [35, 35],
    'each replica wait should start with the full shared deadline window',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition can stop waiting once ' +
  'the minimum routable split cohort is ready', async (t) => {
  const tableId = 'tbl-split-cohort';
  const partitionId = 'tbl-split-cohort-left';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      if (targetNodeId !== 'node-c') {
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'active',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
      }
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'split provisioning should still dispatch the full desired replica set',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'split provisioning should only require the requested minimum routable cohort before continuing',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition tolerates one failed ' +
  'replica operation when split quorum is already satisfiable', async (t) => {
  const tableId = 'tbl-split-quorum-failure-tolerance';
  const partitionId = 'tbl-split-quorum-failure-tolerance-left';
  const localNodeId = 'node-a';
  const createdTargetNodeIds = [];
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      createdTargetNodeIds.push(move.nodeId);
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      if (targetNodeId === 'node-c') {
        return {
          success: false,
          error: 'simulated split replica dispatch timeout',
        };
      }

      services.push({
        replica_id: operation.replicaId || operation.replica_id,
        partition_id: operation.partitionId,
        service_type: 'partition',
        status: 'active',
        node_id: targetNodeId,
        raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 40,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  t.same(
    createdTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'split provisioning should attempt the full desired replica set',
  );
  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'split provisioning should continue when quorum becomes routable despite one failed dispatch',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition waits for active leader ' +
  'routes before continuing', async (t) => {
  const tableId = 'tbl-split-active-leader';
  const partitionId = 'tbl-split-active-leader-left';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
    {node_id: 'node-c', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: null,
    created_at: 100,
    updated_at: 100,
  }];
  const services = [];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type !== TABLES.TABLES) {
        return null;
      }
      return tables.find((row) =>
        row.table_id === key || row.table_name === key,
      ) || null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      if (targetNodeId !== 'node-c') {
        services.push({
          partition_id: operation.partitionId,
          service_type: 'partition',
          status: 'creating',
          node_id: targetNodeId,
          raft_role: targetNodeId === localNodeId ? 'leader' : 'follower',
          address: `${targetNodeId}/partition/${operation.partitionId}`,
        });
      }
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  const provisionPromise = engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 3,
    minimumRoutableReplicaCount: 2,
  });

  const earlyOutcome = await Promise.race([
    provisionPromise.then(() => 'resolved'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 15)),
  ]);

  t.equal(
    earlyOutcome,
    'pending',
    'creating split replicas must not be treated as an active leader cohort',
  );

  for (const service of services) {
    service.status = 'active';
  }

  await provisionPromise;

  t.equal(
    engine.getRoutablePartitionServiceNodeIds(partitionId).length,
    2,
    'provisioning may continue once the active leader cohort is visible',
  );
});

test('SQLQueryEngine - provisionInitialTablePartition accepts canonical ' +
  'partition leader routing before raft_role visibility converges', async (t) => {
  const tableId = 'tbl-split-canonical-leader';
  const partitionId = 'tbl-split-canonical-leader-left';
  const localNodeId = 'node-a';
  const nodes = [
    {node_id: localNodeId, status: 'active'},
    {node_id: 'node-b', status: 'active'},
  ];
  const tables = [{table_id: tableId, table_name: 'benchmark_partition_split_events'}];
  const partitions = [{
    partition_id: partitionId,
    table_id: tableId,
    leader_node_id: localNodeId,
  }];
  const services = [];

  const cache = {
    has(type, key) {
      if (type === TABLES.TABLES) {
        return tables.some((row) => row.table_id === key);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.some((row) => row.partition_id === key);
      }
      return false;
    },
    get(type, key) {
      if (type === TABLES.TABLES) {
        return tables.find((row) =>
          row.table_id === key || row.table_name === key,
        ) || null;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.NODES) {
        return nodes.filter(predicate);
      }
      if (type === TABLES.TABLES) {
        return tables.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.NODES) {
        return nodes;
      }
      if (type === TABLES.TABLES) {
        return tables;
      }
      if (type === TABLES.PARTITIONS) {
        return partitions;
      }
      if (type === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
  };

  const rebalanceCoordinator = {
    async createOperation(move) {
      return {
        operationId: `op-${move.nodeId}`,
        ...move,
      };
    },
    async executeOperation(operation) {
      const targetNodeId = operation.targetNodeId || operation.nodeId;
      services.push({
        partition_id: operation.partitionId,
        service_type: 'partition',
        service_id: `${operation.partitionId}-${targetNodeId}`,
        status: 'active',
        node_id: targetNodeId,
        raft_role: null,
        address: `${targetNodeId}/partition/${operation.partitionId}`,
      });
      return {success: true};
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await engine.provisionInitialTablePartition({
    tableId,
    partitionId,
    replicaCount: 1,
  });

  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    `${localNodeId}/partition/${partitionId}`,
    'write routing should use canonical partition leader metadata while service raft_role lags',
  );
});

test('SQLQueryEngine - waitForPartitionLeaderService accepts a fresh ' +
  'bootstrap leader fallback before leader_node_id converges', async (t) => {
  const partitionId = 'tbl-bootstrap-leader-gap-p1';
  const cache = {
    partitions: [
      {
        partition_id: partitionId,
        table_id: 'tbl-bootstrap-leader-gap',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r1`,
        status: 'active',
        node_id: 'node-a',
        raft_role: 'follower',
        address: 'node-a/partition/tbl-bootstrap-leader-gap-p1-r1',
      },
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r2`,
        status: 'active',
        node_id: 'node-b',
        raft_role: 'leader',
        address: 'node-b/partition/tbl-bootstrap-leader-gap-p1-r2',
      },
      {
        partition_id: partitionId,
        service_type: 'partition',
        service_id: `${partitionId}-r3`,
        status: 'active',
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/tbl-bootstrap-leader-gap-p1-r3',
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
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
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions;
      }
      if (type === TABLES.SERVICES) {
        return this.services;
      }
      return [];
    },
  };

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
  });

  await t.resolves(
    engine.waitForPartitionLeaderService(partitionId),
    'fresh bootstrap leader service metadata should satisfy leader wait',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    'node-b/partition/tbl-bootstrap-leader-gap-p1-r2',
    'leader wait should expose the visible bootstrap leader route',
  );
});

test('SQLQueryEngine - waitForPartitionLeaderService accepts one bootstrap ' +
  'leader hint while service roles lag behind heartbeat publication',
async (t) => {
  const now = 510000;
  const partitionId = 'tbl-bootstrap-hint-p1';
  const localNodeId = 'node-a';
  const cache = createMockSystemCache(
    [],
    [{
      partition_id: partitionId,
      table_id: 'tbl-bootstrap-hint',
      table_name: 'tbl-bootstrap-hint',
      leader_node_id: null,
      created_at: now - 1000,
      updated_at: now - 1000,
    }],
    [
      {
        service_id: `${partitionId}-r1`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: localNodeId,
        raft_role: null,
        address: `${localNodeId}/partition/${partitionId}-r1`,
        status: 'active',
      },
      {
        service_id: `${partitionId}-r2`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-b',
        raft_role: 'follower',
        address: `node-b/partition/${partitionId}-r2`,
        status: 'active',
      },
      {
        service_id: `${partitionId}-r3`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-c',
        raft_role: 'follower',
        address: `node-c/partition/${partitionId}-r3`,
        status: 'active',
      },
    ],
    [
      {
        [COLUMN.NODE_ID]: localNodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
      {
        [COLUMN.NODE_ID]: 'node-b',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
      {
        [COLUMN.NODE_ID]: 'node-c',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
        [COLUMN.LAST_HEARTBEAT]: now - 34000,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
        [COLUMN.CPU_USAGE_PERCENT]: 10,
        [COLUMN.MEMORY_USAGE_PERCENT]: 20,
        [COLUMN.DISK_USAGE_PERCENT]: 30,
      },
    ],
  );
  const readinessService = new ControlPlaneReadinessService({
    nodeId: localNodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState(nodeId) {
        return [localNodeId, 'node-b', 'node-c'].includes(nodeId) ?
          STATE.CONNECTED :
          STATE.DISCONNECTED;
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
  const engine = new SQLQueryEngine({
    nodeId: localNodeId,
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: readinessService,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => now,
  });
  engine.waitForCondition = async () => {
    throw new Error('leader wait should not poll once bootstrap leader hint is usable');
  };

  await t.resolves(
    engine.waitForPartitionLeaderService(
      partitionId,
      null,
      {
        partitionMetadata: cache.partitions[0],
        bootstrapLeaderNodeId: localNodeId,
      },
    ),
    'bootstrap leader hint should satisfy leader wait before raft_role metadata converges',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    `${localNodeId}/partition/${partitionId}-r1`,
    'leader wait should expose the hinted bootstrap leader route',
  );
});

test('SQLQueryEngine - waitForCondition honors a predicate that flips exactly ' +
  'at the timeout boundary', async (t) => {
  const engine = new SQLQueryEngine();
  const originalDateNow = Date.now;
  let fakeNow = 1000;

  Date.now = () => fakeNow;
  engine.sleep = async (ms) => {
    fakeNow += ms;
  };

  try {
    await t.resolves(
      engine.waitForCondition(
        async () => fakeNow >= 1040,
        40,
        30,
        'boundary timeout',
      ),
      'polling should perform a final deadline check before timing out',
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('SQLQueryEngine - waitForCondition classifies exact deadline exhaustion',
  async (t) => {
    const engine = new SQLQueryEngine({nowFn: () => fakeNow});
    let fakeNow = 1000;

    engine.sleep = async (ms) => {
      fakeNow += ms;
    };

    const error = await t.rejects(
      engine.waitForCondition(
        async () => false,
        40,
        30,
        'boundary timeout',
        {
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
          nestedOperation: 'boundary_wait',
        },
      ),
    );
    t.equal(error.message, 'boundary timeout');
    t.equal(
      error.timeoutClassification.classification,
      TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT,
    );
    t.equal(
      error.timeoutClassification.originalClassification,
      TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
    );
    t.equal(error.timeoutClassification.boundaryHit, true);
    t.equal(error.timeoutClassification.configuredBudgetMs, 40);
    t.equal(error.timeoutClassification.nestedOperation, 'boundary_wait');
  });

test('SQLQueryEngine - waitForRoutablePartitionServiceCount succeeds when the ' +
  'cohort is already routable even after budget exhaustion', async (t) => {
  let fakeNow = 2000;
  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 10,
    nowFn: () => fakeNow,
  });
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: 30,
    now: () => 2000,
  });

  engine.getRoutablePartitionServiceNodeIds = () => ['node-a'];
  fakeNow = 2045;

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(
      'tbl-budget-boundary-p1',
      1,
      timeoutBudget,
    ),
    'already-satisfied routable cohorts should not fail on nested budget allocation',
  );
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount accepts fresh ' +
  'bootstrap services while transport-connected heartbeat publication lags',
async (t) => {
  const now = 520000;
  const partitionId = 'tbl-bootstrap-routable-p1';
  const nodeIds = ['node-a', 'node-b', 'node-c'];
  const cache = createMockSystemCache(
    [],
    [{
      partition_id: partitionId,
      table_id: 'tbl-bootstrap-routable',
      table_name: 'tbl-bootstrap-routable',
      leader_node_id: null,
      created_at: now - 1000,
      updated_at: now - 1000,
    }],
    nodeIds.map((nodeId, index) => ({
      service_id: `${partitionId}-r${index + 1}`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      raft_role: index === 0 ? 'leader' : 'follower',
      address: `${nodeId}/partition/${partitionId}-r${index + 1}`,
      status: 'active',
    })),
    nodeIds.map((nodeId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now - 34000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 19000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 20,
      [COLUMN.DISK_USAGE_PERCENT]: 30,
    })),
  );
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-a',
    systemTableCache: cache,
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
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    controlPlaneReadinessService: readinessService,
    tablePartitionProvisioningTimeoutMs: 80,
    tablePartitionProvisioningPollIntervalMs: 5,
    nowFn: () => now,
  });
  engine.waitForCondition = async () => {
    throw new Error('bootstrap-routable services should satisfy the count wait without polling');
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 3),
    'fresh bootstrap services should count as routable while transport stays connected',
  );
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount awaits one ' +
  'query-executor readiness repair before polling stale routing snapshots',
async (t) => {
  const partitionId = 'tbl-routable-repair-await-p1';
  const routingSnapshot = {
    partitionId,
    reasonCode:
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    activeAddressedServiceCount: 2,
    routingReadinessDimension: 'serveEligible',
    deniedByNodeId: {
      'node-a': {
        decisionDimension: 'serveEligible',
        reasonCodes: ['cluster_member_unhealthy'],
        failedDimensions: ['clusterMemberHealthy'],
      },
    },
  };
  let routableNodeIds = [];
  let repairCalls = 0;

  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.getRoutablePartitionServiceNodeIds = () => routableNodeIds;
  engine.queryExecutor = {
    getPartitionRoutingSnapshot(receivedPartitionId) {
      t.equal(
        receivedPartitionId,
        partitionId,
        'routable wait should inspect the canonical routing snapshot for the partition',
      );
      return routingSnapshot;
    },
    async maybeAwaitDeniedPartitionRoutingRepair(snapshot) {
      repairCalls += 1;
      t.equal(
        snapshot,
        routingSnapshot,
        'routable wait should route readiness repair through the query-executor owner',
      );
      routableNodeIds = ['node-a'];
      return true;
    },
  };
  engine.waitForCondition = async () => {
    throw new Error('routable poll should not run before awaited repair');
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 1),
    'a successful owner repair should satisfy the routable cohort wait without falling through to raw polling',
  );
  t.equal(repairCalls, 1);
});

test('SQLQueryEngine - waitForRoutablePartitionServiceCount retries routing ' +
  'repair while polling when the first repair does not converge',
async (t) => {
  const partitionId = 'tbl-routable-repair-repoll-p1';
  const routingSnapshot = {
    partitionId,
    reasonCode:
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    activeAddressedServiceCount: 2,
    routingReadinessDimension: 'serveEligible',
    deniedByNodeId: {
      'node-a': {
        decisionDimension: 'serveEligible',
        reasonCodes: ['cluster_member_unhealthy'],
        failedDimensions: ['clusterMemberHealthy'],
      },
    },
  };
  let routableNodeIds = [];
  let repairCalls = 0;

  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 5,
  });
  engine.getRoutablePartitionServiceNodeIds = () => routableNodeIds;
  engine.queryExecutor = {
    getPartitionRoutingSnapshot(receivedPartitionId) {
      t.equal(
        receivedPartitionId,
        partitionId,
        'repolled repair should inspect the same canonical routing snapshot',
      );
      return routingSnapshot;
    },
    async maybeAwaitDeniedPartitionRoutingRepair(snapshot) {
      repairCalls += 1;
      t.equal(
        snapshot,
        routingSnapshot,
        'repolled repair should stay routed through the query-executor owner',
      );
      if (repairCalls >= 2) {
        routableNodeIds = ['node-a'];
        return true;
      }
      return false;
    },
  };
  engine.waitForCondition = async (predicate) => {
    t.equal(
      await predicate(),
      true,
      'poll predicate should re-run readiness repair while the wait loop is active',
    );
  };

  await t.resolves(
    engine.waitForRoutablePartitionServiceCount(partitionId, 1),
    'a later routing repair during polling should still satisfy the wait',
  );
  t.equal(repairCalls, 2);
});

test('SQLQueryEngine - waitForPartitionLeaderService succeeds when leader route ' +
  'is already known even after budget exhaustion', async (t) => {
  let fakeNow = 3000;
  const engine = new SQLQueryEngine({
    tablePartitionProvisioningPollIntervalMs: 10,
    nowFn: () => fakeNow,
  });
  const timeoutBudget = createTimeoutBudget({
    configuredBudgetMs: 30,
    now: () => 3000,
  });

  engine.queryExecutor = {
    findPartitionLeaderAddress() {
      return 'node-a/partition/tbl-budget-boundary-p1-r1';
    },
  };
  fakeNow = 3045;

  await t.resolves(
    engine.waitForPartitionLeaderService(
      'tbl-budget-boundary-p1',
      timeoutBudget,
    ),
    'already-known leader routes should not fail on nested budget allocation',
  );
});
