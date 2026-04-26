/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
} from '../../src/raft/constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/pressure-governor.js';

const TEST_PARTITION_ID = 'partition-1';
const TEST_OWNER_NODE_ID = 'node-owner';
const TEST_STALE_OWNER_NODE_ID = 'node-stale-owner';
const TEST_LIVE_LEADER_NODE_ID = 'node-live-leader';
const TEST_OWNER_REPLICA_ID = 'replica-owner-row';
const TEST_LIVE_LEADER_REPLICA_ID = 'replica-live-leader';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});


test('PartitionService requests managed split evaluation from the local ' +
  'leader after user-table writes', async (t) => {
  const requests = [];
  const service = Object.create(PartitionService.prototype);
  Object.assign(service, {
    isLeader: true,
    partitionId: 'tbl-users-p1',
    tableName: 'users',
    managedSplitWriteActivityDebounceMs: 5000,
    lastManagedSplitWriteActivityAtMs: 0,
    sqlQueryEngine: {
      partitionSplitMergeManager: {
        requestEvaluation(context) {
          requests.push(context);
        },
      },
    },
  });

  service.requestManagedSplitEvaluationAfterWrite({
    type: PARTITION_SERVICE_OPERATION.QUERY,
    sql: 'INSERT INTO users (id) VALUES (?)',
  });
  service.requestManagedSplitEvaluationAfterWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
  });

  t.same(
    requests,
    [{
      reasonCode: 'write_activity',
      tableName: 'users',
      partitionId: 'tbl-users-p1',
      partitionIds: ['tbl-users-p1'],
    }],
    'leader-local split trigger should be emitted once per debounce window',
  );
});

test('PartitionService resolves leader replica from canonical owner metadata',
  async (t) => {
    const service = Object.create(PartitionService.prototype);
    service.partitionId = TEST_PARTITION_ID;
    service.systemTableCache = {
      filter(tableName, predicate) {
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
            [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
            [COLUMN.NODE_ID]: TEST_OWNER_NODE_ID,
            [COLUMN.REPLICA_ID]: TEST_OWNER_REPLICA_ID,
            [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
          }, {
            [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
            [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
            [COLUMN.NODE_ID]: 'node-other',
            [COLUMN.REPLICA_ID]: 'replica-stale-leader-role',
            [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          }].filter(predicate);
        }
        if (tableName === TABLES.PARTITIONS) {
          return [{
            [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
            [COLUMN.LEADER_NODE_ID]: TEST_OWNER_NODE_ID,
          }].filter(predicate);
        }
        return [];
      },
    };

    t.equal(
      service.resolveLeaderIdFromMetadata(),
      TEST_OWNER_REPLICA_ID,
      'owner-row leader_node_id should outrank stale leader-role witnesses',
    );
  });

test('PartitionService fails closed when owner metadata does not map to an ' +
  'active replica', async (t) => {
  const service = Object.create(PartitionService.prototype);
  service.partitionId = TEST_PARTITION_ID;
  service.systemTableCache = {
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return [{
          [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
          [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
          [COLUMN.NODE_ID]: 'node-follower',
          [COLUMN.REPLICA_ID]: 'replica-follower',
          [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
        }, {
          [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
          [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
          [COLUMN.NODE_ID]: TEST_LIVE_LEADER_NODE_ID,
          [COLUMN.REPLICA_ID]: TEST_LIVE_LEADER_REPLICA_ID,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
        }].filter(predicate);
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{
          [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
          [COLUMN.LEADER_NODE_ID]: TEST_STALE_OWNER_NODE_ID,
        }].filter(predicate);
      }
      return [];
    },
  };

  t.equal(
    service.resolveLeaderIdFromMetadata(),
    null,
    'leader-role witnesses should not substitute for stale owner-row truth',
  );
});

test('PartitionService does not request managed split evaluation for ' +
  'system-table writes or non-leaders', async (t) => {
  const requests = [];
  const nonLeaderService = Object.create(PartitionService.prototype);
  Object.assign(nonLeaderService, {
    isLeader: false,
    partitionId: 'tbl-users-p1',
    tableName: 'users',
    managedSplitWriteActivityDebounceMs: 0,
    lastManagedSplitWriteActivityAtMs: 0,
    sqlQueryEngine: {
      partitionSplitMergeManager: {
        requestEvaluation(context) {
          requests.push(context);
        },
      },
    },
  });

  nonLeaderService.requestManagedSplitEvaluationAfterWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
  });

  const systemService = Object.create(PartitionService.prototype);
  Object.assign(systemService, {
    isLeader: true,
    partitionId: INITIAL_PARTITION_IDS.SERVICES,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    managedSplitWriteActivityDebounceMs: 0,
    lastManagedSplitWriteActivityAtMs: 0,
    sqlQueryEngine: {
      partitionSplitMergeManager: {
        requestEvaluation(context) {
          requests.push(context);
        },
      },
    },
  });

  systemService.requestManagedSplitEvaluationAfterWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
  });

  t.same(
    requests,
    [],
    'only user-table leaders may emit split evaluation triggers',
  );
});

test('PartitionService - constructor requires partitionId', async (t) => {
  t.throws(() => {
    new PartitionService({tableId: 'test-table', replicaId: 'r1'});
  }, /requires partitionId/);
});

test('PartitionService - constructor requires tableId', async (t) => {
  t.throws(() => {
    new PartitionService({partitionId: 'p1', replicaId: 'r1'});
  }, /requires tableId/);
});

test('PartitionService - constructor requires replicaId', async (t) => {
  t.throws(() => {
    new PartitionService({partitionId: 'p1', tableId: 'test-table'});
  }, /requires replicaId/);
});

test('PartitionService - initializes with in-memory database', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-1',
    tableId: 'test-table',
    replicaId: 'replica-1',
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  t.equal(partition.initialized, true);
  t.equal(partition.partitionId, 'test-partition-1');
  t.equal(partition.tableId, 'test-table');
  t.equal(partition.replicaId, 'replica-1');
  // Single replica becomes leader immediately
  t.equal(partition.getRole(), RaftRole.LEADER);
  t.equal(partition.getState(), PartitionState.NORMAL);

  await partition.shutdown();
});

test('PartitionService - repairs legacy sql_transactions replicas by adding transaction columns',
  async (t) => {
    const LEGACY_SQL_TRANSACTIONS_SCHEMA = {
      tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      columns: [
        {name: 'transaction_id', type: 'TEXT', primaryKey: true},
        {name: 'session_id', type: 'TEXT', notNull: true},
        {name: 'status', type: 'TEXT', notNull: true},
        {name: 'created_at', type: 'INTEGER', notNull: true},
        {name: 'updated_at', type: 'INTEGER', notNull: true},
      ],
    };
    const CANONICAL_SQL_TRANSACTIONS_SCHEMA = {
      tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      columns: [
        {name: 'transaction_id', type: 'TEXT', primaryKey: true},
        {name: 'session_id', type: 'TEXT', notNull: true},
        {name: 'status', type: 'TEXT', notNull: true},
        {name: 'transaction_epoch', type: 'INTEGER'},
        {name: 'timeout_deadline', type: 'INTEGER'},
        {name: 'created_at', type: 'INTEGER', notNull: true},
        {name: 'updated_at', type: 'INTEGER', notNull: true},
      ],
    };
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'partition-service-sql-tx-'));
    const dbPath = path.join(tempDir, 'sql-transactions.db');

    const legacyPartition = new PartitionService({
      partitionId: 'sql_transactions-p1',
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      schema: LEGACY_SQL_TRANSACTIONS_SCHEMA,
      replicaId: 'sql_transactions-p1-r1',
      nodeId: 'node-1',
      dbPath,
    });

    await legacyPartition.initialize();
    await legacyPartition.shutdown();

    const repairedPartition = new PartitionService({
      partitionId: 'sql_transactions-p1',
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      schema: CANONICAL_SQL_TRANSACTIONS_SCHEMA,
      replicaId: 'sql_transactions-p1-r1',
      nodeId: 'node-1',
      dbPath,
    });

    try {
      await repairedPartition.initialize();
      const columns = repairedPartition.db
        .prepare(`PRAGMA table_info(${SYSTEM_TABLE_NAME.SQL_TRANSACTIONS})`)
        .all()
        .map((column) => column.name);

      t.ok(
        columns.includes('transaction_epoch'),
        'legacy sql_transactions replicas should add the transaction_epoch column during initialization',
      );
      t.ok(
        columns.includes('timeout_deadline'),
        'legacy sql_transactions replicas should add the timeout_deadline column during initialization',
      );
    } finally {
      await repairedPartition.shutdown();
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

test('PartitionService - suppresses lifecycle logs and emits stage callbacks', async (t) => {
  const stageEvents = [];
  const infoMessages = [];
  const partition = new PartitionService({
    partitionId: 'stage-partition-1',
    tableId: 'stage_table',
    tableName: 'stage_table',
    replicaId: 'stage-partition-1-r1',
    replicaIds: ['stage-partition-1-r1', 'stage-partition-1-r2', 'stage-partition-1-r3'],
    peerAddresses: [
      'node-1/partition/stage-partition-1-r1',
      'node-1/partition/stage-partition-1-r2',
      'node-1/partition/stage-partition-1-r3',
    ],
    nodeId: 'node-1',
    dbPath: ':memory:',
    suppressLifecycleLogs: true,
    onInitializationStage: (event) => stageEvents.push(event),
  });
  partition.logger = {
    info: (message) => infoMessages.push(message),
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  await partition.initialize();

  const stageNames = stageEvents.map((event) => event.stage);
  t.equal(stageNames[0], PARTITION_SERVICE_INIT_STAGE.STARTING);
  t.ok(stageNames.includes(PARTITION_SERVICE_INIT_STAGE.OPENING_DB));
  t.ok(stageNames.includes(PARTITION_SERVICE_INIT_STAGE.JOINING_PEERS));
  t.ok(stageNames.includes(PARTITION_SERVICE_INIT_STAGE.JOINED_PEER));
  t.equal(
    stageNames[stageNames.length - 1],
    PARTITION_SERVICE_INIT_STAGE.READY,
  );
  t.equal(
    stageEvents.filter((event) =>
      event.stage === PARTITION_SERVICE_INIT_STAGE.JOINED_PEER,
    ).length,
    2,
    'should emit one JOINED_PEER event per peer',
  );

  t.notOk(infoMessages.includes(PARTITION_SERVICE_LOG_MSG.INITIALIZING));
  t.notOk(infoMessages.includes(PARTITION_SERVICE_LOG_MSG.JOINING_PEER_ADDRESS));
  t.notOk(infoMessages.includes(PARTITION_SERVICE_LOG_MSG.INITIALIZED));

  await partition.shutdown();
});

test(
  'PartitionService - leader change demotes local leader even without follower event',
  async (t) => {
    const systemTableCache = new SystemTableCache();
    const partition = new PartitionService({
      partitionId: 'leader-change-partition-1',
      tableId: 'leader_change_table',
      tableName: 'leader_change_table',
      replicaId: 'leader-change-partition-1-r1',
      replicaIds: [
        'leader-change-partition-1-r1',
        'leader-change-partition-1-r2',
        'leader-change-partition-1-r3',
      ],
      peerAddresses: [
        'node-1/partition/leader-change-partition-1-r1',
        'node-2/partition/leader-change-partition-1-r2',
        'node-3/partition/leader-change-partition-1-r3',
      ],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      deferElection: true,
      systemTableCache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({changes: 1}),
      },
    });

    partition.isServicesLeaderAvailable = () => true;

    await partition.initialize();

    partition.role = RaftRole.LEADER;
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.persistedRole = RaftRole.LEADER;
    partition.pendingLeaderNodeUpdate = partition.nodeId;
    partition.persistedLeaderNodeId = partition.nodeId;
    const retryTimer = setTimeout(() => {}, 10000);
    partition.leaderNodeMutationHelper.retryTimer = retryTimer;

    partition.raft.emit(
      'leader change',
      'node-2/partition/leader-change-partition-1-r2',
    );
    await partition.flushRoleUpdate();
    await Promise.resolve();

    t.equal(partition.role, RaftRole.FOLLOWER);
    t.equal(partition.isLeader, false);
    t.equal(
      partition.leaderId,
      'leader-change-partition-1-r2',
      'leader-change should normalize unified leader addresses to replica ids',
    );
    t.equal(partition.pendingRoleUpdate, null);
    t.equal(partition.persistedRole, RaftRole.FOLLOWER);
    t.equal(partition.pendingLeaderNodeUpdate, null);
    t.equal(partition.persistedLeaderNodeId, null);
    t.equal(partition.leaderNodeUpdateRetryTimer, null);

    await partition.shutdown();
  },
);

test('PartitionService - leader mutation helper guards owner writes with observed row state',
  async (t) => {
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'guarded-partition-1',
      [COLUMN.TABLE_ID]: 'guarded_table',
      [COLUMN.LEADER_NODE_ID]: 'node-1',
      [COLUMN.UPDATED_AT]: 77,
    });

    let capturedWhereClause = null;
    const partition = new PartitionService({
      partitionId: 'guarded-partition-1',
      tableId: 'guarded_table',
      tableName: 'guarded_table',
      replicaId: 'guarded-partition-1-r1',
      replicaIds: ['guarded-partition-1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache,
      cdcIntegrationService: {
        updateSystemTableRow: async (_tableName, whereClause) => {
          capturedWhereClause = whereClause;
          return {success: true};
        },
      },
    });

    partition.isLeader = true;
    partition.isPartitionsLeaderAvailable = () => true;
    partition.leaderNodeMutationHelper.pendingValue = 'node-2';

    await partition.leaderNodeMutationHelper.flush();

    t.same(capturedWhereClause, {
      [COLUMN.PARTITION_ID]: 'guarded-partition-1',
      [COLUMN.LEADER_NODE_ID]: 'node-1',
      [COLUMN.UPDATED_AT]: 77,
    }, 'leader owner writes should include the observed owner-row guard fields');

    await partition.shutdown();
  });

test('PartitionService - flushes services role update when local services leader exists',
  async (t) => {
    const updates = [];
    const partition = new PartitionService({
      partitionId: 'services-p1',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'services-p1-r1',
      replicaIds: ['services-p1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {
        canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
        updateSystemTableRow: async (tableName, whereClause, data) => {
          updates.push({tableName, whereClause, data});
          return {success: true};
        },
      },
    });

    partition.pendingRoleUpdate = RaftRole.LEADER;
    partition.persistedRole = null;

    const result = await partition.flushRoleUpdate();

    t.equal(result.reason, 'applied', 'should persist when the local services leader owns the write');
    t.equal(updates.length, 1, 'should issue one services-table write');
    t.equal(updates[0].tableName, SYSTEM_TABLE_NAME.SERVICES, 'should target services');
    t.same(updates[0].whereClause, {
      service_id: 'services-p1-r1',
    }, 'should update the local services replica row');
    t.equal(
      updates[0].data?.raft_role,
      RaftRole.FOLLOWER,
      'canonical leader ownership should publish follower metadata only',
    );
    t.equal(partition.pendingRoleUpdate, null, 'should clear pending role after success');
    t.equal(partition.persistedRole, RaftRole.FOLLOWER, 'should track the published metadata role');

    await partition.shutdown();
  });

test('PartitionService - flushes partition leader update when local partitions leader exists',
  async (t) => {
    const updates = [];
    const partition = new PartitionService({
      partitionId: 'partitions-p1',
      tableId: 'partitions',
      tableName: 'partitions',
      replicaId: 'partitions-p1-r1',
      replicaIds: ['partitions-p1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {
        canWriteSystemTableLocally: (tableName) =>
          tableName === SYSTEM_TABLE_NAME.PARTITIONS,
        updateSystemTableRow: async (tableName, whereClause, data) => {
          updates.push({tableName, whereClause, data});
          return {success: true};
        },
      },
    });

    partition.isLeader = true;
    partition.pendingLeaderNodeUpdate = 'node-1';
    partition.persistedLeaderNodeId = null;

    const result = await partition.flushLeaderNodeUpdate();

    t.equal(
      result.reason,
      'applied',
      'should persist when the local partitions leader owns the write',
    );
    t.equal(updates.length, 1, 'should issue one partitions-table write');
    t.equal(
      updates[0].tableName,
      SYSTEM_TABLE_NAME.PARTITIONS,
      'should target partitions',
    );
    t.same(updates[0].whereClause, {
      [COLUMN.PARTITION_ID]: 'partitions-p1',
    }, 'should update the local partitions owner row');
    t.equal(
      updates[0].data?.[COLUMN.LEADER_NODE_ID],
      'node-1',
      'should publish the elected leader node id',
    );
    t.equal(
      partition.pendingLeaderNodeUpdate,
      null,
      'pending leader update should clear after success',
    );
    t.equal(
      partition.persistedLeaderNodeId,
      'node-1',
      'persisted leader update should track the published owner metadata',
    );

    await partition.shutdown();
  });


test('PartitionService - creates table from schema', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT', notNull: true},
      {name: 'value', type: 'INTEGER', defaultValue: 0},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-2',
    tableId: 'users',
    tableName: 'users',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'], // Single replica becomes leader
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica becomes leader immediately
  await Promise.resolve();

  // Verify table was created by inserting data
  const result = await partition.insertData('users', {
    id: 'user-1',
    name: 'Test User',
    value: 42,
  });

  t.equal(result.success, true);
  t.equal(result.changes, 1);

  await partition.shutdown();
});

test('PartitionService - executeQuery for SELECT', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'name', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-3',
    tableId: 'items',
    tableName: 'items',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'], // Single replica becomes leader
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica becomes leader immediately
  await Promise.resolve();

  // Insert some data first
  await partition.insertData('items', {id: 'item-1', name: 'Item One'});
  await partition.insertData('items', {id: 'item-2', name: 'Item Two'});

  // Query the data
  const result = await partition.executeQuery('SELECT * FROM items');

  t.equal(result.success, true);
  t.equal(result.count, 2);
  t.equal(result.rows.length, 2);
  t.equal(result.partitionId, 'test-partition-3');

  await partition.shutdown();
});

test('PartitionService - updateData modifies records', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'status', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-4',
    tableId: 'tasks',
    tableName: 'tasks',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('tasks', {id: 'task-1', status: 'pending'});

  const updateResult = await partition.updateData(
    'tasks',
    {id: 'task-1'},
    {status: 'completed'},
  );

  t.equal(updateResult.success, true);
  t.equal(updateResult.changes, 1);

  const selectResult = await partition.executeQuery(
    'SELECT status FROM tasks WHERE id = ?',
    ['task-1'],
  );

  t.equal(selectResult.rows[0].status, 'completed');

  await partition.shutdown();
});

test('PartitionService - deleteData removes records', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-5',
    tableId: 'records',
    tableName: 'records',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('records', {id: 'rec-1', data: 'test'});
  await partition.insertData('records', {id: 'rec-2', data: 'test2'});

  const deleteResult = await partition.deleteData('records', {id: 'rec-1'});

  t.equal(deleteResult.success, true);
  t.equal(deleteResult.changes, 1);

  const selectResult = await partition.executeQuery('SELECT * FROM records');
  t.equal(selectResult.count, 1);
  t.equal(selectResult.rows[0].id, 'rec-2');

  await partition.shutdown();
});

test('PartitionService - generates CDC events on insert', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-6',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.INSERT);
  t.equal(cdcEvents[0].tableName, 'cdc_test');
  t.equal(cdcEvents[0].sourcePartition, 'test-partition-6');

  await partition.shutdown();
});

test('PartitionService - skips no-subscriber CDC buffering when user table external CDC is disabled',
  async (t) => {
    const schema = {
      columns: [
        {name: 'event_id', type: 'TEXT', primaryKey: true},
        {name: 'payload', type: 'INTEGER'},
      ],
    };
    const warnings = [];
    const partition = new PartitionService({
      partitionId: 'test-partition-cdc-disabled',
      tableId: 'tbl-benchmark',
      tableName: 'benchmark_events',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema,
      dbPath: ':memory:',
      systemTableCache: {
        get: (tableName, key) => {
          if (tableName === TABLES.TABLES && key === 'tbl-benchmark') {
            return {
              table_id: 'tbl-benchmark',
              table_name: 'benchmark_events',
              table_policies: JSON.stringify({externalCdcAllowed: false}),
            };
          }
          return null;
        },
      },
    });
    partition.logger = {
      info: () => {},
      debug: () => {},
      warn: (message) => warnings.push(message),
      error: () => {},
    };

    await partition.initialize();
    await partition.insertData('benchmark_events', {event_id: 'evt-1', payload: 1});

    t.equal(
      partition.cdcEventBuffer.size(),
      0,
      'user-table writes without opted-in CDC should not accumulate buffered events',
    );
    t.notOk(
      warnings.includes('CDC event buffered while no subscribers registered'),
      'disabled user-table CDC should not emit no-subscriber buffering warnings',
    );

    await partition.shutdown();
  });

test('PartitionService - skips no-subscriber CDC buffering for non-propagated control tables',
  async (t) => {
    const schema = {
      columns: [
        {name: 'operation_id', type: 'TEXT', primaryKey: true},
        {name: 'sql_text', type: 'TEXT'},
      ],
    };
    const warnings = [];
    const partition = new PartitionService({
      partitionId: 'sql-write-operations-p1',
      tableId: TABLES.SQL_WRITE_OPERATIONS,
      tableName: TABLES.SQL_WRITE_OPERATIONS,
      replicaId: 'sql-write-operations-p1-r1',
      replicaIds: ['sql-write-operations-p1-r1'],
      schema,
      dbPath: ':memory:',
    });
    partition.logger = {
      info: () => {},
      debug: () => {},
      warn: (message) => warnings.push(message),
      error: () => {},
    };

    await partition.initialize();
    await partition.insertData(TABLES.SQL_WRITE_OPERATIONS, {
      operation_id: 'op-1',
      sql_text: 'INSERT INTO benchmark_events VALUES (...)',
    });

    t.equal(
      partition.cdcEventBuffer.size(),
      0,
      'non-propagated control tables should not buffer CDC without subscribers',
    );
    t.notOk(
      warnings.includes('CDC event buffered while no subscribers registered'),
      'non-propagated control tables should not emit no-subscriber buffering warnings',
    );

    await partition.shutdown();
  });

test('PartitionService - generates CDC events on update', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-7',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });
  cdcEvents.length = 0;

  await partition.updateData('cdc_test', {id: 'cdc-1'}, {value: 200});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.UPDATE);

  await partition.shutdown();
});

test('PartitionService - suppresses CDC for no-op updates', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-7-noop',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  await Promise.resolve();

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });

  const updateResult = await partition.updateData(
    'cdc_test',
    {id: 'missing-row'},
    {value: 999},
  );

  t.equal(updateResult.success, true);
  t.equal(updateResult.changes, 0, 'update should affect zero rows');
  t.equal(cdcEvents.length, 0, 'no-op update must not emit CDC');

  await partition.shutdown();
});

test('PartitionService - generates CDC events on delete', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-8',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  await partition.insertData('cdc_test', {id: 'cdc-1', value: 100});

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });
  cdcEvents.length = 0;

  await partition.deleteData('cdc_test', {id: 'cdc-1'});

  t.equal(cdcEvents.length, 1);
  t.equal(cdcEvents[0].operation, CDCOperation.DELETE);
  // Verify DELETE CDC event contains the primary key from whereClause
  t.equal(cdcEvents[0].data.id, 'cdc-1', 'DELETE CDC event should contain primary key');

  await partition.shutdown();
});

test('PartitionService - generates CDC UPSERT events on upsert', async (t) => {
  // Bug: generateCDCEvent mapped UPSERT to CDCOperation.INSERT,
  // causing "INSERT on existing key" warnings in the system cache.
  // UPSERT operations must produce CDCOperation.UPSERT events so the
  // cache uses its UPSERT handler (insert-or-merge) without warnings.
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-upsert-cdc',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  await Promise.resolve();

  // Insert initial row
  await partition.upsertData('cdc_test', {id: 'u1', value: 10});

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });
  cdcEvents.length = 0;

  // Upsert same key — should produce UPSERT, not INSERT
  await partition.upsertData('cdc_test', {id: 'u1', value: 20});

  t.equal(cdcEvents.length, 1);
  t.equal(
    cdcEvents[0].operation,
    CDCOperation.UPSERT,
    'UPSERT operation must produce CDCOperation.UPSERT, not INSERT',
  );
  t.equal(cdcEvents[0].data.id, 'u1');

  await partition.shutdown();
});

test('PartitionService - raw SQL INSERT OR REPLACE generates CDC UPSERT', async (t) => {
  // Bug: When INSERT OR REPLACE SQL arrives via the QUERY path,
  // the SQL parser detects it as INSERT (startsWith('INSERT')),
  // producing CDCOperation.INSERT instead of UPSERT.
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-sql-upsert',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  await Promise.resolve();

  // Insert initial row via raw SQL
  await partition.executeQuery(
    'INSERT OR REPLACE INTO cdc_test (id, value) VALUES (?, ?)',
    ['s1', 10],
  );

  const cdcEvents = [];
  await partition.subscribeToCDCWithHandshake((event) => {
    cdcEvents.push(event);
  });
  cdcEvents.length = 0;

  // Upsert same key via raw SQL — should produce UPSERT, not INSERT
  await partition.executeQuery(
    'INSERT OR REPLACE INTO cdc_test (id, value) VALUES (?, ?)',
    ['s1', 20],
  );

  t.equal(cdcEvents.length, 1);
  t.equal(
    cdcEvents[0].operation,
    CDCOperation.UPSERT,
    'INSERT OR REPLACE SQL must produce CDCOperation.UPSERT',
  );

  await partition.shutdown();
});

test('PartitionService - raw SQL nested parenthesized DELETE preserves composite CDC key',
  async (t) => {
    const schema = {
      columns: [
        {name: 'service_id', type: 'TEXT'},
        {name: 'service_type', type: 'TEXT'},
        {name: 'node_id', type: 'TEXT'},
        {name: 'status', type: 'TEXT'},
      ],
    };

    const partition = new PartitionService({
      partitionId: 'test-partition-sql-delete-composite',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema,
      dbPath: ':memory:',
    });

    await partition.initialize();
    await Promise.resolve();

    await partition.executeQuery(
      'INSERT INTO services (service_id, service_type, node_id, status) ' +
        'VALUES (?, ?, ?, ?)',
      ['svc-1', 'partition', 'node-1', 'active'],
    );

    const cdcEvents = [];
    await partition.subscribeToCDCWithHandshake((event) => {
      cdcEvents.push(event);
    });
    cdcEvents.length = 0;

    await partition.executeQuery(
      'DELETE FROM services WHERE (((service_id = ?) AND ' +
        '(service_type = ?)) AND (node_id = ?))',
      ['svc-1', 'partition', 'node-1'],
    );

    t.equal(cdcEvents.length, 1);
    t.equal(cdcEvents[0].operation, CDCOperation.DELETE);
    t.same(cdcEvents[0].data, {
      service_id: 'svc-1',
      service_type: 'partition',
      node_id: 'node-1',
    });

    await partition.shutdown();
  });

test('PartitionService - follower applyCommittedEntry must not emit CDC', async (t) => {
  // Bug: applyCommittedEntry generates CDC events on ALL replicas
  // (leader + followers). Only the leader should emit CDC events;
  // the leader already does so in applyWrite. Follower CDC events
  // cause duplicate cache updates and "INSERT on existing key" warnings.
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-follower-cdc',
    tableId: 'cdc_test',
    tableName: 'cdc_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  await Promise.resolve();

  // Force to follower state to simulate a non-leader replica
  partition.role = 'follower';
  partition.isLeader = false;

  const cdcEvents = [];
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });

  // Directly call applyCommittedEntry as liferaft would on a follower
  partition.applyCommittedEntry({
    type: 'INSERT',
    sql: 'INSERT INTO cdc_test (id, value) VALUES (?, ?)',
    params: ['f1', 42],
    timestamp: String(Date.now()),
    proposedBy: 'other-replica',
  });

  // Allow any async CDC generation to complete
  await Promise.resolve();

  t.equal(
    cdcEvents.length,
    0,
    'Follower must not emit CDC events from applyCommittedEntry',
  );

  await partition.shutdown();
});
