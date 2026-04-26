/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/query/query-constants.js';
import {
  COLUMN,
  METRICS_LOG_TAG,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from './routing-repair-test-helpers.js';

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


test('SQLQueryEngine emits shared pressure diagnostics with query-plane ' +
  'resource keys', async (t) => {
  const metricEvents = [];
  const engine = new SQLQueryEngine({
    nodeId: 'query-pressure-node',
    systemCache: createMockSystemCache([], [], []),
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
  });
  engine.logger = {
    info(tag, data) {
      metricEvents.push({tag, data});
    },
    debug() {},
    warn() {},
    error() {},
  };

  await engine.executeQuery('SELECT * FROM users', [], {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    pressureRetryAfterMs: 250,
  });

  const pressureMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.PRESSURE_POLICY;
  }) || null;

  t.ok(pressureMetric, 'pressure policy metric should be emitted');
  t.same(
    pressureMetric?.data?.resourceKeys,
    ['query-plane:read', 'query-plane:statement:select'],
    'pressure diagnostics should preserve query-plane resource keys',
  );
  t.equal(
    pressureMetric?.data?.capacityPartition,
    'query-plane',
    'pressure diagnostics should preserve the query-plane partition',
  );
});

test('SQLQueryEngine logs typed admission defer reasons for harness playback',
  async (t) => {
    const warnings = [];
    const engine = new SQLQueryEngine({
      nodeId: 'query-admission-node',
      systemCache: createMockSystemCache([], [], []),
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
    });
    engine.logger = {
      info() {},
      debug() {},
      warn(message, data) {
        warnings.push({message, data});
      },
      error() {},
    };

    const result = await engine.executeQuery('SELECT * FROM users', [], {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      pressureRetryAfterMs: 275,
    });

    t.equal(result.error, 'query_admission_deferred',
      'query ingress should surface deferred admission');
    t.equal(warnings.length, 1, 'query ingress should emit one warning');
    t.equal(
      warnings[0].message,
      'Query admission deferred',
      'warning should identify the deferred query admission path',
    );
    t.equal(
      warnings[0].data.pressureReason,
      'transport_backpressure',
      'warning should include the typed defer reason',
    );
    t.equal(
      warnings[0].data.retryAfterMs,
      275,
      'warning should include retry hints for the harness',
    );
  });

test('Shared pressure policy preserves plane isolation between query ingress ' +
  'and metadata ingress', async (t) => {
  const messageRouter = {
    getStats() {
      return {
        outboundQueues: {
          'node-b': {
            pending: 48,
            pendingCritical: 0,
            pendingBackground: 48,
            criticalReserve: 16,
            backgroundPendingLimit: 48,
            maxPending: 64,
          },
        },
      };
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'pressure-node',
    systemCache: createMockSystemCache([], [], []),
    messageRouter,
  });
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'pressure-node',
    messageRouter,
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const queryResult = await engine.executeQuery(
    'SELECT * FROM users',
    [],
    {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      pressureRetryAfterMs: 111,
    },
  );
  const metadataResult = await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
    {
      allowPressureDegrade: false,
      allowPressureDefer: true,
    },
  );

  t.equal(queryResult.pressureAction, 'defer',
    'query ingress should defer when the query-plane background partition is saturated');
  t.equal(metadataResult.success, true,
    'metadata ingress should stay admissible while control-plane reserve remains available');
  t.equal(metadataResult.outcome, 'authoritative',
    'metadata ingress should continue through the authoritative owner path');
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
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
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
        leader_node_id: 'test-node',
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
  const partitionSplitMergeManager = {
    requestEvaluation(context) {
      requestedContexts.push(context);
    },
  };
  const engine = new SQLQueryEngine({
    nodeId: 'test-node',
    systemCache: cache,
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
      partitionIds: ['users-p1'],
    },
    'write-activity evaluation should only target locally-owned split partitions',
  );
  t.same(
    engine.lastWriteSplitEvaluationByTable.get('users'),
    {
      requestedAtMs:
        engine.lastWriteSplitEvaluationByTable.get('users').requestedAtMs,
      partitionIds: ['users-p1', 'users-p2'],
      localLeaderPartitionIds: ['users-p1'],
    },
    'write tracking should retain full and locally-owned partition context',
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

test('SQLQueryEngine - preserves structured retry metadata from thrown ' +
  'execution errors', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], []),
    messageRouter: createMockMessageRouter(),
  });
  engine.executeSelect = async () => {
    const error = new Error('query_admission_deferred');
    error.errorCode = 'CONTROL_PLANE_PRESSURE_DEGRADED';
    error.retryAfterMs = 321;
    error.deferRetry = true;
    error.participantFailures = [{
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 321,
      deferRetry: true,
      failedTable: 'replica_operations',
    }];
    error.firstFailedParticipant = error.participantFailures[0];
    throw error;
  };

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, false);
  t.equal(result.error, 'query_admission_deferred');
  t.equal(
    result.errorCode,
    'CONTROL_PLANE_PRESSURE_DEGRADED',
    'explicit lower-layer error codes should survive executeQuery catch handling',
  );
  t.equal(
    result.retryAfterMs,
    321,
    'retry-after hints should survive executeQuery catch handling',
  );
  t.equal(
    result.deferRetry,
    true,
    'defer markers should survive executeQuery catch handling',
  );
  t.equal(
    result.firstFailedParticipant?.failedTable,
    'replica_operations',
    'participant failure details should survive executeQuery catch handling',
  );
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

test('SQLQueryEngine - does not persist successful non-transactional ' +
  'distributed write operations',
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
  t.equal(writeOpRows.length, 0,
    'successful non-transactional writes should not emit tracking rows');
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
