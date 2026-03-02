/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

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
} from '../../src/partition/partition-service-constants.js';
import {
  SystemTableName,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

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

    partition.raft.emit('leader change', 'leader-change-partition-1-r2');
    await Promise.resolve();

    t.equal(partition.role, RaftRole.FOLLOWER);
    t.equal(partition.isLeader, false);
    t.equal(partition.leaderId, 'leader-change-partition-1-r2');
    t.equal(partition.pendingRoleUpdate, null);
    t.equal(partition.persistedRole, RaftRole.FOLLOWER);
    t.equal(partition.pendingLeaderNodeUpdate, null);
    t.equal(partition.persistedLeaderNodeId, null);

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
  partition.subscribeToCDC((event) => {
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
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });
  // Allow async buffer replay to complete, then clear replayed events
  await Promise.resolve();
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
  partition.subscribeToCDC((event) => {
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
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });
  // Allow async buffer replay to complete, then clear replayed events
  await Promise.resolve();
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
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });
  // Allow async buffer replay to complete, then clear replayed events
  await Promise.resolve();
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
  partition.subscribeToCDC((event) => {
    cdcEvents.push(event);
  });
  // Allow async buffer replay to complete, then clear replayed events
  await Promise.resolve();
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

test('PartitionService - leader applyCommittedEntry must not raise unhandled rejection when CDC fails',
  async (t) => {
    const schema = {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'INTEGER'},
      ],
    };

    const partition = new PartitionService({
      partitionId: 'test-leader-committed-cdc-failure',
      tableId: 'cdc_test',
      tableName: 'cdc_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema,
      dbPath: ':memory:',
    });

    await partition.initialize();
    await Promise.resolve();

    partition.isLeader = true;
    partition.role = RaftRole.LEADER;
    partition.generateCDCEvent = async () => {
      throw new Error('forced-cdc-failure');
    };

    let unhandledReason = null;
    const onUnhandledRejection = (reason) => {
      unhandledReason = reason;
    };
    process.once('unhandledRejection', onUnhandledRejection);

    partition.applyCommittedEntry({
      type: 'INSERT',
      sql: 'INSERT INTO cdc_test (id, value) VALUES (?, ?)',
      params: ['leader-failure-1', 7],
      timestamp: String(Date.now()),
      proposedBy: 'other-replica',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    process.removeListener('unhandledRejection', onUnhandledRejection);

    t.equal(
      unhandledReason,
      null,
      'CDC failure in committed-entry path must stay logged, not unhandled',
    );

    await partition.shutdown();
  });

test('PartitionService - buffers CDC event on subscriber failure and replays after recovery',
  async (t) => {
    const schema = {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'INTEGER'},
      ],
    };

    const partition = new PartitionService({
      partitionId: 'test-cdc-retry-buffer',
      tableId: 'cdc_test',
      tableName: 'cdc_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema,
      dbPath: ':memory:',
    });

    await partition.initialize();
    await Promise.resolve();

    let shouldFailDelivery = true;
    const delivered = [];
    const subscriber = async (event) => {
      if (shouldFailDelivery) {
        throw new Error('forced-subscriber-failure');
      }
      delivered.push(event);
    };

    await partition.subscribeToCDCWithHandshake(subscriber, {
      subscriberId: 'cdc-retry-subscriber',
    });

    await partition.insertData('cdc_test', {id: 'retry-1', value: 1});
    await new Promise((resolve) => setTimeout(resolve, 80));

    t.equal(delivered.length, 0,
      'event should not be delivered while subscriber is failing');
    t.equal(partition.cdcEventBuffer.size(), 1,
      'failed delivery should be preserved in retry buffer');

    shouldFailDelivery = false;

    const waitForReplay = async () => {
      const timeoutMs = 2000;
      const pollMs = 25;
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (delivered.length >= 1 && partition.cdcEventBuffer.size() === 0) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      return false;
    };

    t.equal(
      await waitForReplay(),
      true,
      'buffered CDC event should replay after subscriber recovers',
    );
    t.equal(delivered[0].data.id, 'retry-1',
      'replayed event should preserve original payload');

    await partition.shutdown();
  });

test('PartitionService - calculates partition size', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-9',
    tableId: 'size_test',
    tableName: 'size_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  const initialSize = partition.getSize();
  t.ok(initialSize >= 0, 'Initial size should be non-negative');

  // Insert some data
  for (let i = 0; i < 10; i++) {
    await partition.insertData('size_test', {
      id: `item-${i}`,
      data: 'x'.repeat(1000),
    });
  }

  // Force size update
  await partition.updatePartitionSize();

  const newSize = partition.getSize();
  t.ok(newSize > initialSize, 'Size should increase after inserts');

  await partition.shutdown();
});

test('PartitionService - key range management', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-10',
    tableId: 'range_test',
    replicaId: 'replica-1',
    keyRange: {start: 'a', end: 'm'},
    dbPath: ':memory:',
  });

  await partition.initialize();

  const range = partition.getKeyRange();
  t.equal(range.start, 'a');
  t.equal(range.end, 'm');

  t.equal(partition.isKeyInRange('b'), true);
  t.equal(partition.isKeyInRange('l'), true);
  t.equal(partition.isKeyInRange('a'), true);
  t.equal(partition.isKeyInRange('m'), false); // end is exclusive
  t.equal(partition.isKeyInRange('z'), false);

  await partition.shutdown();
});

test('PartitionService - full key range (null, null)', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-11',
    tableId: 'full_range_test',
    replicaId: 'replica-1',
    keyRange: {start: null, end: null},
    dbPath: ':memory:',
  });

  await partition.initialize();

  t.equal(partition.isKeyInRange('anything'), true);
  t.equal(partition.isKeyInRange(''), true);
  t.equal(partition.isKeyInRange(0), true);
  t.equal(partition.isKeyInRange(null), true);

  await partition.shutdown();
});

test('PartitionService - getStatus returns complete status', async (t) => {
  const peerAddresses = [
    'node-1/partition/replica-1',
    'node-2/partition/replica-2',
    'node-3/partition/replica-3',
  ];
  const partition = new PartitionService({
    partitionId: 'test-partition-12',
    tableId: 'status_test',
    tableName: 'status_test',
    replicaId: 'replica-1',
    nodeId: 'node-1',
    replicaIds: ['replica-1', 'replica-2', 'replica-3'],
    peerAddresses: peerAddresses,
    dbPath: ':memory:',
  });

  await partition.initialize();

  const status = partition.getStatus();

  t.equal(status.partitionId, 'test-partition-12');
  t.equal(status.tableId, 'status_test');
  t.equal(status.replicaId, 'replica-1');
  t.equal(status.nodeId, 'node-1');
  t.equal(status.replicaCount, 3);
  t.equal(status.initialized, true);
  t.equal(status.state, PartitionState.NORMAL);
  t.ok(status.sizeBytes >= 0);

  await partition.shutdown();
});

test('PartitionService - single replica becomes leader', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-13',
    tableId: 'leader_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Single replica should become leader immediately
  await Promise.resolve();

  t.equal(partition.isLeaderReplica(), true);
  t.equal(partition.getRole(), RaftRole.LEADER);
  t.equal(partition.getLeaderId(), 'replica-1');

  await partition.shutdown();
});

test('PartitionService - unsubscribe from CDC', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-14',
    tableId: 'unsub_test',
    tableName: 'unsub_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica should become leader immediately
  await Promise.resolve();

  const cdcEvents = [];
  const subscriber = (event) => cdcEvents.push(event);

  partition.subscribeToCDC(subscriber);
  await partition.insertData('unsub_test', {id: 'item-1'});
  t.equal(cdcEvents.length, 1);

  partition.unsubscribeFromCDC(subscriber);
  await partition.insertData('unsub_test', {id: 'item-2'});
  t.equal(cdcEvents.length, 1); // No new events after unsubscribe

  await partition.shutdown();
});

// Tests for liferaft-based architecture (Requirements 14.1, 14.2, 14.3, 14.4)

test('PartitionService - handleTransportMessage routes Raft packets to liferaft', async (t) => {
  // Mock transport to avoid null reference errors when liferaft tries to respond
  const mockTransport = {
    register: () => {},
    unregister: () => {},
    deliver: () => Promise.resolve({acknowledged: true}),
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-15',
    tableId: 'raft_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    transport: mockTransport,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Track if raft.emit was called with the packet
  let emittedData = null;
  let emittedEvent = null;

  // Replace raft.emit to track calls without triggering liferaft's state machine
  partition.raft.emit = (event, data, _write) => {
    if (event === 'data') {
      emittedEvent = event;
      emittedData = data;
    }
    // Don't call original emit to avoid triggering liferaft's state machine
    return true;
  };

  // Send a Raft packet (vote request)
  const raftPacket = {
    type: 'vote',
    term: 1,
    address: 'node2/partition/replica-2',
    state: 1,
    leader: '',
    last: {term: 0, index: 0},
  };

  const result = await partition.handleTransportMessage({payload: raftPacket});

  t.equal(result.acknowledged, true, 'Raft packet should be acknowledged');
  t.equal(emittedEvent, 'data', 'Should emit data event to liferaft');
  t.ok(emittedData, 'Raft packet should be emitted to liferaft');
  t.equal(emittedData.type, 'vote', 'Packet type should be preserved');
  t.equal(emittedData.term, 1, 'Packet term should be preserved');

  await partition.shutdown();
});

test('PartitionService - handleTransportMessage handles application messages', async (t) => {
  const schema = {
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'INTEGER'},
    ],
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-16',
    tableId: 'app_msg_test',
    tableName: 'app_msg_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    schema,
    dbPath: ':memory:',
  });

  await partition.initialize();
  // Single replica becomes leader immediately
  await Promise.resolve();

  // Send a FORWARD_WRITE application message
  const forwardWriteMsg = {
    payload: {
      type: 'FORWARD_WRITE',
      operation: {
        type: 'INSERT',
        tableName: 'app_msg_test',
        data: {id: 'item-1', value: 42},
        sql: 'INSERT INTO app_msg_test (id, value) VALUES (?, ?)',
        params: ['item-1', 42],
      },
    },
  };

  const result = await partition.handleTransportMessage(forwardWriteMsg);

  t.equal(result.success, true, 'FORWARD_WRITE should succeed');
  t.equal(result.changes, 1, 'One row should be inserted');

  // Verify data was inserted
  const queryResult = await partition.executeQuery(
    'SELECT * FROM app_msg_test WHERE id = ?',
    ['item-1'],
  );
  t.equal(queryResult.rows.length, 1);
  t.equal(queryResult.rows[0].value, 42);

  await partition.shutdown();
});

test('PartitionService - handleTransportMessage unwraps message-group query envelopes', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-query-envelope',
    tableId: 'query_envelope_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  const wrappedQueryMessage = {
    payload: {
      messageId: 'mg-msg-1',
      payload: {
        type: 'QUERY',
        sql: 'SELECT 42 AS value',
        params: [],
      },
      sourceGroup: 'mg-1',
      sourceReplica: 'mg-1-r1',
    },
  };

  const result = await partition.handleTransportMessage(wrappedQueryMessage);

  t.equal(result.acknowledged, true, 'wrapped query should be acknowledged');
  t.equal(result.success, true, 'wrapped query should execute successfully');
  t.equal(result.rows?.[0]?.value, 42, 'wrapped query should return expected row');

  await partition.shutdown();
});

test('PartitionService - handleTransportMessage rejects unknown message types', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-17',
    tableId: 'unknown_msg_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Send an unknown message type
  const unknownMsg = {
    payload: {
      type: 'UNKNOWN_TYPE',
      data: 'some data',
    },
  };

  const result = await partition.handleTransportMessage(unknownMsg);

  t.equal(result.acknowledged, false, 'Unknown message should not be acknowledged');
  t.ok(result.error, 'Error message should be present');
  t.match(result.error, /Unknown message type/, 'Error should mention unknown type');

  await partition.shutdown();
});

test('PartitionService - liferaft instance is created with correct configuration', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-18',
    tableId: 'liferaft_config_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Verify liferaft instance exists
  t.ok(partition.raft, 'Liferaft instance should exist');

  // Verify unified address format is used
  t.equal(partition.getUnifiedAddress(), 'node-1/partition/replica-1');

  await partition.shutdown();
});

test('PartitionService - buildPeerAddress returns correct format', async (t) => {
  const peerAddresses = [
    'node-1/partition/replica-1',
    'node-2/partition/replica-2',
    'node-3/partition/replica-3',
  ];
  const partition = new PartitionService({
    partitionId: 'test-partition-19',
    tableId: 'peer_addr_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    peerAddresses: peerAddresses,
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Test with simple peer ID (should resolve from provided peer addresses)
  const addr1 = partition.buildPeerAddress('replica-2');
  t.equal(addr1, 'node-2/partition/replica-2', 'Should resolve correct address');

  // Test with already-formatted address (should return as-is)
  const addr2 = partition.buildPeerAddress('node-2/partition/replica-3');
  t.equal(addr2, 'node-2/partition/replica-3', 'Should return formatted address as-is');

  await partition.shutdown();
});

test('PartitionService - emits leaderElected event for single replica', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-20',
    tableId: 'leader_event_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  let leaderEvent = null;
  partition.on('leaderElected', (event) => {
    leaderEvent = event;
  });

  await partition.initialize();

  // Single replica should emit leaderElected event
  t.ok(leaderEvent, 'leaderElected event should be emitted');
  t.equal(leaderEvent.leaderId, 'replica-1', 'Leader should be this replica');
  t.equal(leaderEvent.partitionId, 'test-partition-20', 'Partition ID should match');

  await partition.shutdown();
});

test('PartitionService - persists raft role updates to services table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SystemTableName.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SystemTableName.SERVICES,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-21',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  await new Promise((resolve) => setImmediate(resolve));

  const roleUpdate = updates.find(
    (update) =>
      update.tableName === SystemTableName.SERVICES &&
      update.whereClause?.service_id === 'replica-1' &&
      update.data?.raft_role === RaftRole.LEADER,
  );

  t.ok(roleUpdate, 'raft role update should be persisted via CDC');
  t.same(
    roleUpdate?.options?.expectedCacheFields,
    {raft_role: RaftRole.LEADER},
    'cache visibility should only depend on the raft role',
  );

  await partition.shutdown();
});

test('PartitionService - retries raft role persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error('Cache update not observed for services:replica-1 within 1000ms');
        }
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SystemTableName.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SystemTableName.SERVICES,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-21-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      updates[0]?.options?.expectedCacheFields,
      {raft_role: RaftRole.LEADER},
      'retryable role persistence should only wait on raft_role visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    t.equal(
      updates.length,
      2,
      'cache visibility false negatives should trigger a role persistence retry',
    );
    t.equal(
      updates[1]?.data?.raft_role,
      RaftRole.LEADER,
      'retry should target the same raft role',
    );

    await partition.shutdown();
  });

test('PartitionService - persists initial follower role for multi-replica startup',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SystemTableName.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SystemTableName.SERVICES,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-multi',
      tableId: 'user-table',
      tableName: 'user_table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      peerAddresses: [
        'node-1/partition/replica-1',
        'node-3/partition/replica-3',
      ],
      nodeId: 'node-2',
      dbPath: ':memory:',
      deferElection: true,
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SystemTableName.SERVICES &&
        update.whereClause?.service_id === 'replica-2' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'initial follower role should be persisted via CDC');

    await partition.shutdown();
  });

test('PartitionService - persists leader node updates to partitions table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };

  const systemTableCache = new SystemTableCache();
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SystemTableName.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SystemTableName.PARTITIONS,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'partitions-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-23',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  await new Promise((resolve) => setImmediate(resolve));

  const leaderUpdate = updates.find(
    (update) =>
      update.tableName === SystemTableName.PARTITIONS &&
      update.whereClause?.[COLUMN.PARTITION_ID] === 'test-partition-23' &&
      update.data?.[COLUMN.LEADER_NODE_ID] === 'seed-node',
  );

  t.ok(leaderUpdate, 'leader node update should be persisted via CDC');
  t.same(
    leaderUpdate?.options?.expectedCacheFields,
    {leader_node_id: 'seed-node'},
    'cache visibility should only depend on leader identity',
  );

  await partition.shutdown();
});

test('PartitionService - retries leader node persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error(
            'Cache update not observed for partitions:test-partition-23-retry within 1000ms',
          );
        }
        return {success: true};
      },
    };

    const systemTableCache = new SystemTableCache();
    const partitionsPartitionId = INITIAL_PARTITION_IDS[SystemTableName.PARTITIONS];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.TABLE_ID]: SystemTableName.PARTITIONS,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'partitions-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-23-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      updates[0]?.options?.expectedCacheFields,
      {leader_node_id: 'seed-node'},
      'retryable leader persistence should only wait on leader_node_id visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    t.equal(
      updates.length,
      2,
      'cache visibility false negatives should trigger a leader persistence retry',
    );
    t.equal(
      updates[1]?.data?.[COLUMN.LEADER_NODE_ID],
      'seed-node',
      'retry should target the same leader node',
    );

    await partition.shutdown();
  });

test('PartitionService - setCdcIntegrationService sets service on partition and rebalancer',
  async (t) => {
    const mockCdcIntegrationService = {
      deleteSystemTableRow: async () => ({success: true}),
      insertSystemTableRow: async () => ({success: true}),
    };

    const partition = new PartitionService({
      partitionId: 'test-partition-22',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    // Initially no cdcIntegrationService
    t.equal(partition.cdcIntegrationService, null, 'Initially null');

    // Provide stubbed rebalancer/coordinator to verify propagation.
    partition.rebalancer = {cdcIntegrationService: null, shutdown: () => {}};
    partition.rebalanceCoordinator = {cdcIntegrationService: null};

    // Set the CDC integration service
    partition.setCdcIntegrationService(mockCdcIntegrationService);

    // Verify it was set on the partition
    t.equal(
      partition.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on partition',
    );

    // Verify it was set on the rebalancer
    t.equal(
      partition.rebalancer.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on rebalancer',
    );

    // Verify it was set on the coordinator
    t.equal(
      partition.rebalanceCoordinator.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on coordinator',
    );

    await partition.shutdown();
  });

test('PartitionService - setRebalanceCoordinator replaces local coordinator',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition-24',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    const previousCoordinator = {
      shutdownCalled: false,
      shutdown: async function() {
        this.shutdownCalled = true;
      },
    };
    const sharedCoordinator = {shared: true};
    let rebalancerCoordinator = null;

    partition.ownsRebalanceCoordinator = true;
    partition.rebalanceCoordinator = previousCoordinator;
    partition.rebalancer = {
      setRebalanceCoordinator: (coordinator) => {
        rebalancerCoordinator = coordinator;
      },
      shutdown: () => {},
      setLeader: () => {},
    };

    partition.setRebalanceCoordinator(sharedCoordinator);
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      partition.rebalanceCoordinator,
      sharedCoordinator,
      'Should use shared coordinator',
    );
    t.equal(
      partition.ownsRebalanceCoordinator,
      false,
      'Shared coordinator should not be owned by partition',
    );
    t.equal(
      rebalancerCoordinator,
      sharedCoordinator,
      'Rebalancer should receive shared coordinator',
    );
    t.equal(
      previousCoordinator.shutdownCalled,
      true,
      'Owned coordinator should be shutdown when replaced',
    );

    await partition.shutdown();
  });

test('PartitionService - learner promotion deferred for even voter count', async (t) => {
  // Create a mock system table cache with 3 active voters
  const mockCache = {
    get: () => null, // Not used for voter counting
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        // Return 3 active partition replicas (odd count)
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition without initializing to test checkLearnerPromotion directly
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4', // New replica joining
    replicaIds: ['replica-4'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true, // Start as learner
    systemTableCache: mockCache,
  });

  // Manually set role to learner (simulating post-initialization state)
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should still be learner because promoting would cause 4 voters (even)
  t.equal(partition.role, RaftRole.LEARNER, 'Should remain learner to avoid even voter count');

  // Verify promotion timer was rescheduled
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  // Clean up timer
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes when voter count would be odd', async (t) => {
  // Create a mock system table cache with 2 active voters (one was removed)
  const mockCache = {
    get: () => null, // Not used for voter counting
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        // Return 2 active partition replicas (one was removed)
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition without initializing to test checkLearnerPromotion directly
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-3', // New replica joining
    replicaIds: ['replica-3'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true, // Start as learner
    systemTableCache: mockCache,
  });

  // Manually set role to learner (simulating post-initialization state)
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should promote because 2 + 1 = 3 voters (odd)
  t.equal(partition.role, RaftRole.FOLLOWER, 'Should promote to follower for odd voter count');

  // Clean up any timers
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotion deferred until leader is known', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            replica_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            node_id: 'node-1',
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-2',
            replica_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            node_id: 'node-2',
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-3',
    replicaIds: ['replica-3'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = null;

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Should remain learner until canonical leader metadata is discovered',
  );
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test(
  'PartitionService - learner promotion uses startup leader hint for stable joins',
  async (t) => {
    const mockCache = {
      get: () => null,
      filter: (tableName, predicate) => {
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'test-table',
      replicaId: 'replica-3',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
      leaderAddress: 'node-1/partition/replica-1',
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = null;
    let electionStarted = false;
    partition.startElection = () => {
      electionStarted = true;
    };

    partition.checkLearnerPromotion();

    t.equal(
      partition.leaderId,
      'replica-1',
      'startup leader hint should seed leader identity for learner promotion',
    );
    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'learner should promote once leader identity is known and voter count stays odd',
    );
    t.equal(electionStarted, true, 'promotion should start elections as a voter');

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test(
  'PartitionService - learner promotion resolves leader from canonical metadata when hint is absent',
  async (t) => {
    const mockCache = {
      get: () => null,
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [
            {
              partition_id: 'test-partition',
              leader_node_id: 'node-1',
            },
          ].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              replica_id: 'replica-1',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-1',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-2',
              replica_id: 'replica-2',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-3',
              replica_id: 'replica-3',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-3',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'test-table',
      replicaId: 'replica-3',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = null;
    let electionStarted = false;
    partition.startElection = () => {
      electionStarted = true;
    };

    partition.checkLearnerPromotion();

    t.equal(
      partition.leaderId,
      'replica-1',
      'canonical partition leader_node_id should resolve the leader replica',
    );
    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'learner should promote once canonical metadata identifies the leader',
    );
    t.equal(electionStarted, true, 'promotion should start elections as a voter');

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test('PartitionService - critical partition defers learner on even voter count', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: `${SystemTableName.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: `${SystemTableName.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: `${SystemTableName.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-4',
            partition_id: `${SystemTableName.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: `${SystemTableName.CONFIG}-p1`,
    tableId: SystemTableName.CONFIG,
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Critical partitions should also defer promotion that creates even voters',
  );
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes when multiple learners reach odd count', async (t) => {
  // Create a mock system table cache with 3 active voters and 2 learners
  // 3 voters + 2 learners = 5 (odd) - should allow promotion
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          // Two learners waiting to promote
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition as one of the learners
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  // Manually set role to learner
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should promote because 3 voters + 2 learners = 5 (odd)
  // Even though 3 + 1 = 4 (even), all learners promoting gives odd count
  t.equal(partition.role, RaftRole.FOLLOWER,
    'Should promote when all learners would reach odd count');

  // Clean up any timers
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner deferred when all learners would still be even', async (t) => {
  // Create a mock system table cache with 3 active voters and 1 learner
  // 3 voters + 1 learner = 4 (even) - should defer promotion
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          // Only one learner
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition as the learner
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  // Manually set role to learner
  partition.role = RaftRole.LEARNER;

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should remain learner because 3 + 1 = 4 (even)
  t.equal(partition.role, RaftRole.LEARNER,
    'Should remain learner when all learners would still be even');

  // Verify promotion timer was rescheduled
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  // Clean up timer
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - countPendingLearners counts learner replicas', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.FAILED, // Should be excluded
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-5',
    replicaIds: ['replica-5'],
    nodeId: 'node-1',
    dbPath: ':memory:',
    systemTableCache: mockCache,
  });

  // Count pending learners - should count replica-2 and replica-3 (not failed replica-4)
  const learnerCount = partition.countPendingLearners();
  t.equal(learnerCount, 2, 'Should count only active learner replicas');
});

test('PartitionService - countActiveVoters excludes learners, failed replicas, ' +
  'and roleless rows', async (t) => {
  const mockCache = {
    get: () => null, // Not used for voter counting
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner', // Should be excluded
          },
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.FAILED, // Should be excluded
            raft_role: 'follower',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.REMOVING, // Should be excluded
            raft_role: 'follower',
          },
          {
            service_id: 'replica-6',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: null, // Roleless replicas must not count as voters
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-7',
    replicaIds: ['replica-7'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-1',
    dbPath: ':memory:',
    systemTableCache: mockCache,
  });

  // Count active voters - should only count replica-1 and replica-2
  const voterCount = partition.countActiveVoters();
  t.equal(voterCount, 2, 'Should count only active non-learner replicas');
});

test('PartitionService - handleRemoteQuery returns redirect for writes on follower', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Set role to follower and set a known leader
  partition.role = 'follower';
  partition.leaderId = 'leader-replica';

  // Mock resolveLeaderAddress to return a known address
  partition.resolveLeaderAddress = () => 'leader-node/partition/test-partition';

  // Call handleRemoteQuery with a write query
  const result = await partition.handleRemoteQuery({
    sql: 'INSERT INTO test_table (id, name) VALUES (1, \'test\')',
    params: [],
  });

  t.equal(result.acknowledged, true, 'should acknowledge the request');
  t.equal(result.success, false, 'should not succeed (redirect instead)');
  t.equal(result.redirect, 'LEADER_REDIRECT', 'should return redirect type');
  t.equal(result.leaderAddress, 'leader-node/partition/test-partition',
    'should include leader address');

  partition.shutdown();
});

test('PartitionService - handleRemoteQuery executes reads on follower', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Create a test table
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');
  partition.db.exec('INSERT INTO test_data (id, name) VALUES (1, \'Alice\')');

  // Set role to follower
  partition.role = 'follower';

  // Call handleRemoteQuery with a read query - should execute locally
  const result = await partition.handleRemoteQuery({
    sql: 'SELECT * FROM test_data',
    params: [],
  });

  t.equal(result.acknowledged, true, 'should acknowledge the request');
  t.equal(result.success, true, 'should succeed for reads');
  t.equal(result.rows.length, 1, 'should return data');
  t.equal(result.rows[0].name, 'Alice', 'should return correct data');

  partition.shutdown();
});

test('PartitionService - isWriteQuery detects write operations', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  t.equal(partition.isWriteQuery('INSERT INTO t VALUES (1)'), true, 'INSERT is write');
  t.equal(partition.isWriteQuery('UPDATE t SET x = 1'), true, 'UPDATE is write');
  t.equal(partition.isWriteQuery('DELETE FROM t'), true, 'DELETE is write');
  t.equal(partition.isWriteQuery('CREATE TABLE t (id INT)'), true, 'CREATE is write');
  t.equal(partition.isWriteQuery('DROP TABLE t'), true, 'DROP is write');
  t.equal(partition.isWriteQuery('ALTER TABLE t ADD col INT'), true, 'ALTER is write');
  t.equal(partition.isWriteQuery('SELECT * FROM t'), false, 'SELECT is not write');
  t.equal(partition.isWriteQuery('  select * from t'), false, 'lowercase SELECT is not write');
  t.equal(partition.isWriteQuery(null), false, 'null is not write');
  t.equal(partition.isWriteQuery(''), false, 'empty string is not write');
});

test('PartitionService - election jitter prevents timeout overlap', async (t) => {
  // Bug: ELECTION_JITTER_PER_REPLICA_MS (500ms) is smaller than the
  // election timeout range width (3000 - 1000 = 2000ms). This means
  // r1 [1000,3000] and r2 [1500,3500] overlap, so r2 can fire before
  // r1, causing unnecessary re-elections and leadership instability.
  // The jitter must be >= (electionMax - electionMin) to guarantee
  // that replica N always times out before replica N+1.
  const {PARTITION_SERVICE_VALUE} = await import(
    '../../src/partition/partition-service-constants.js'
  );

  const electionRange =
    PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS -
    PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS;
  const jitter = PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS;

  t.ok(
    jitter >= electionRange,
    `Jitter (${jitter}ms) must be >= election range width ` +
    `(${electionRange}ms) to prevent timeout overlap between replicas`,
  );
});
