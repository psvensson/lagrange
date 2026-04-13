/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */
// @ts-nocheck


import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import LifeRaft from '@markwylde/liferaft';
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
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
} from '../../src/raft/constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

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

function createLoopbackTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    async deliver(address, payload) {
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      return handler({payload});
    },
  };
}

async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(predicate())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

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

test('PartitionService - persists partition size_bytes for leader-owned partitions',
  async (t) => {
    const updates = [];
    const systemTableCache = new SystemTableCache();
    const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'partitions-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
    });
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'test-partition-size-persist',
      [COLUMN.TABLE_ID]: 'size_persist_test',
      size_bytes: 0,
    });
    const partition = new PartitionService({
      partitionId: 'test-partition-size-persist',
      tableId: 'size_persist_test',
      tableName: 'size_persist_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'payload', type: 'TEXT'},
        ],
      },
      dbPath: ':memory:',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data) {
          updates.push({tableName, whereClause, data});
          return {success: true};
        },
      },
      systemTableCache,
    });

    await partition.initialize();

    await partition.insertData('size_persist_test', {
      id: 'row-1',
      payload: 'x'.repeat(2048),
    });
    await partition.updatePartitionSize();

    const persistedUpdates = updates.filter((entry) =>
      entry.tableName === TABLES.PARTITIONS &&
      entry.whereClause.partition_id === 'test-partition-size-persist',
    );
    const persistedUpdate =
      persistedUpdates[persistedUpdates.length - 1] || null;

    t.ok(persistedUpdate, 'should persist latest size_bytes to partitions table');
    t.equal(typeof persistedUpdate.data.size_bytes, 'number');
    t.ok(persistedUpdate.data.size_bytes > 0);

    await partition.shutdown();
  });

test('PartitionService - includes WAL bytes in file-backed partition size',
  async (t) => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'partition-size-wal-'),
    );
    const dbPath = path.join(tmpDir, 'partition.db');
    const partition = new PartitionService({
      partitionId: 'test-partition-size-wal',
      tableId: 'size_wal_test',
      tableName: 'size_wal_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'payload', type: 'TEXT'},
        ],
      },
      dbPath,
    });

    try {
      await partition.initialize();
      await partition.insertData('size_wal_test', {
        id: 'row-1',
        payload: 'x'.repeat(32768),
      });
      await partition.updatePartitionSize();

      const dbSize = fs.statSync(dbPath).size;
      const walPath = `${dbPath}-wal`;
      const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

      t.ok(walSize > 0, 'test should exercise WAL-backed growth');
      t.equal(
        partition.getSize(),
        dbSize + walSize,
        'partition size should include the main DB and WAL files',
      );
    } finally {
      await partition.shutdown();
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });

test('PartitionService - retries retryable partition size persistence pressure',
  async (t) => {
    const updates = [];
    let attempts = 0;
    const systemTableCache = new SystemTableCache();
    const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'partitions-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
    });
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'test-partition-size-retry',
      [COLUMN.TABLE_ID]: 'size_retry_test',
      size_bytes: 0,
    });
    const partition = new PartitionService({
      partitionId: 'test-partition-size-retry',
      tableId: 'size_retry_test',
      tableName: 'size_retry_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'payload', type: 'TEXT'},
        ],
      },
      dbPath: ':memory:',
      cdcIntegrationService: {},
      systemTableCache,
    });

    await partition.initialize();
    partition.controlPlaneSystemTableGateway = {
      async submitMutation(mutation) {
        attempts += 1;
        if (attempts === 1) {
          return {
            success: false,
            error: 'control_plane_pressure_degraded',
            retryAfterMs: 0,
          };
        }
        updates.push(mutation);
        return {success: true};
      },
    };

    await partition.insertData('size_retry_test', {
      id: 'row-1',
      payload: 'x'.repeat(2048),
    });
    await partition.updatePartitionSize();

    t.equal(attempts, 2,
      'should retry one retryable size persistence failure');
    t.equal(updates.length, 1,
      'should eventually persist size update after retry');
    t.equal(updates[0].tableName, TABLES.PARTITIONS);
    t.equal(
      updates[0].whereClause.partition_id,
      'test-partition-size-retry',
    );
    t.ok(updates[0].data.size_bytes > 0);

    await partition.shutdown();
  });

test('PartitionService - queues source writes during split backfill and suppresses target echoes',
  async (t) => {
    const mirroredWrites = [];
    const partition = new PartitionService({
      partitionId: 'users-source',
      tableId: 'tbl-users',
      tableName: 'users',
      replicaId: 'users-source-r1',
      replicaIds: ['users-source-r1'],
      dbPath: ':memory:',
    });

    partition.splitReplication = {
      metadata: {
        primaryKeyColumn: 'id',
        sourcePartitionId: 'users-source',
        splitKey: 'm',
        targetPartitionIds: ['users-left', 'users-right'],
        targetPartitionVersion: 2,
      },
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: [],
      flushInFlight: false,
      startedAt: Date.now(),
      lastError: null,
    };
    partition.replaySplitEntry = async (entry) => {
      mirroredWrites.push(entry.sql);
    };

    await partition.handleSplitReplicationAfterWrite({
      sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
      params: ['zoe', 'Zoe'],
      data: {id: 'zoe', name: 'Zoe'},
    });
    await partition.handleSplitReplicationAfterWrite({
      sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
      params: ['zoe', 'Zoe'],
      data: {id: 'zoe', name: 'Zoe'},
      splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.TARGET,
    });

    t.equal(partition.splitReplication.pendingEntries.length, 1);

    partition.splitReplication.phase =
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
    await partition.flushSplitReplicationQueue();

    t.same(mirroredWrites, ['INSERT INTO users (id, name) VALUES (?, ?)']);
    t.equal(partition.splitReplication.pendingEntries.length, 0);
  });

test('PartitionService - starts split replication workflow and marks cutover active',
  async (t) => {
    const advanceCalls = [];
    const partition = new PartitionService({
      partitionId: 'users-source',
      tableId: 'tbl-users',
      tableName: 'users',
      replicaId: 'users-source-r1',
      replicaIds: ['users-source-r1'],
      dbPath: ':memory:',
    });

    partition.sqlQueryEngine = {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(_workflowId, _ack) {
          return {result: 'accepted'};
        },
        async advanceSplitPhase(workflowId, nextPhase, phaseMetadata) {
          advanceCalls.push({workflowId, nextPhase, phaseMetadata});
        },
      },
    };

    partition.role = RaftRole.LEADER;
    partition.isLeader = true;
    partition.backfillSplitSnapshot = async () => {
      partition.splitReplication.pendingEntries.push({
        sql: 'UPDATE users SET name = ? WHERE id = ?',
        params: ['Bob', 'bob'],
        whereClause: {id: 'bob'},
      });
    };
    partition.flushSplitReplicationQueue = async function() {
      while (this.splitReplication.pendingEntries.length > 0) {
        this.splitReplication.pendingEntries.shift();
      }
    };

    const response = await partition.handleStartSplitReplication({
      partitionId: 'users-source',
      tableId: 'tbl-users',
      tableName: 'users',
      transitionMetadata: {
        [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
        [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]: 'users-source',
        [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
          'users-left',
          'users-right',
        ],
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
        [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
          'split-tbl-users-users-source-v2',
      },
    });

    await partition.splitReplicationRun;

    t.same(response, {acknowledged: true, success: true});
    t.equal(
      partition.splitReplication.phase,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    );
    t.equal(advanceCalls.length, 1,
      'cutover must delegate to workflow owner via advanceSplitPhase');
    t.equal(
      advanceCalls[0].nextPhase,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      'must advance to SPLIT_CUTOVER_ACTIVE through the workflow owner',
    );
  });

test('PartitionService - backfillSplitSnapshot streams rows and yields between batches',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'users-source',
      tableId: 'tbl-users',
      tableName: 'users',
      replicaId: 'users-source-r1',
      replicaIds: ['users-source-r1'],
      dbPath: ':memory:',
    });

    const appliedRowIds = [];
    const yieldedAfterCounts = [];
    partition.splitSnapshotBackfillYieldEveryRows = 2;
    partition.applySplitSnapshotRow = async (row, columns, metadata) => {
      appliedRowIds.push({
        id: row.id,
        columns,
        primaryKeyColumn: metadata.primaryKeyColumn,
      });
    };
    partition.yieldSplitBackfillTurn = async () => {
      yieldedAfterCounts.push(appliedRowIds.length);
    };

    const rows = [
      {id: 'a', name: 'Alice'},
      {id: 'b', name: 'Bob'},
      {id: 'c', name: 'Carol'},
      {id: 'd', name: 'Dan'},
      {id: 'e', name: 'Eve'},
    ];
    const preparedSql = [];
    const snapshotDb = {
      prepare(sql) {
        preparedSql.push(sql);
        if (sql.startsWith('PRAGMA table_info')) {
          return {
            all() {
              return [{name: 'id'}, {name: 'name'}];
            },
          };
        }
        return {
          iterate() {
            return rows[Symbol.iterator]();
          },
          all() {
            throw new Error('split snapshot rows should be streamed');
          },
        };
      },
    };

    await partition.backfillSplitSnapshot(snapshotDb, {
      primaryKeyColumn: 'id',
    });

    t.same(appliedRowIds.map((row) => row.id), ['a', 'b', 'c', 'd', 'e']);
    t.same(appliedRowIds[0].columns, ['id', 'name']);
    t.same(
      yieldedAfterCounts,
      [2, 4],
      'should yield after each configured backfill batch',
    );
    t.match(preparedSql[1], /ORDER BY id/);
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
  t.equal(partition.raft.state, LifeRaft.LEADER);

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

test('PartitionService - non-critical Raft peer writes use background delivery',
  async (t) => {
    const deliveries = [];
    const mockTransport = {
      register: () => {},
      unregister: () => {},
      deliver: async (_address, _payload, options) => {
        deliveries.push(options);
        return {acknowledged: true};
      },
    };

    const partition = new PartitionService({
      partitionId: 'sql_transaction_participants-p1',
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
      replicaId: 'sql_transaction_participants-p1-r1',
      replicaIds: [
        'sql_transaction_participants-p1-r1',
        'sql_transaction_participants-p1-r4',
      ],
      peerAddresses: ['node-2/partition/sql_transaction_participants-p1-r4'],
      transport: mockTransport,
      dbPath: ':memory:',
    });

    await partition.initialize();

    try {
      await new Promise((resolve, reject) => {
        partition.raft.nodes[0].write({
          type: 'append',
          term: 1,
          address: 'node-1/partition/sql_transaction_participants-p1-r1',
          leader: 'node-1/partition/sql_transaction_participants-p1-r1',
          state: 1,
          last: {term: 1, index: 1},
          data: [{index: 2, term: 1, command: 'noop'}],
        }, (error) => error ? reject(error) : resolve());
      });

      t.same(
        deliveries,
        [RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS],
        'non-critical transaction-state append traffic should not consume the critical lane',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('PartitionService - append-fail peer writes prefer target priority over ' +
  'sender address', async (t) => {
  const deliveries = [];
  const mockTransport = {
    register: () => {},
    unregister: () => {},
    deliver: async (_address, _payload, options) => {
      deliveries.push(options);
      return {acknowledged: true};
    },
  };

  const partition = new PartitionService({
    partitionId: 'tbl-bench-p1',
    tableId: 'tbl-bench',
    replicaId: 'tbl-bench-p1-r1',
    replicaIds: ['tbl-bench-p1-r1', 'tbl-bench-p1-r2'],
    peerAddresses: ['node-2/partition/tbl-bench-p1-r2'],
    transport: mockTransport,
    dbPath: ':memory:',
  });

  await partition.initialize();

  try {
    await new Promise((resolve, reject) => {
      partition.raft.nodes[0].write({
        type: 'append fail',
        term: 1,
        address: 'node-1/partition/control_plane_publications-p1-r1',
        leader: 'node-1/partition/control_plane_publications-p1-r1',
        state: 1,
        last: {term: 1, index: 1},
        data: {index: 2, term: 1},
      }, (error) => error ? reject(error) : resolve());
    });

    t.same(
      deliveries,
      [RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS],
      'append-fail replication should follow the target partition lane',
    );
  } finally {
    await partition.shutdown();
  }
});

test('PartitionService - non-critical Raft responses use background delivery',
  async (t) => {
    const deliveries = [];
    const mockTransport = {
      register: () => {},
      unregister: () => {},
      deliver: async (_address, _payload, options) => {
        deliveries.push(options);
        return {acknowledged: true};
      },
    };

    const partition = new PartitionService({
      partitionId: 'sql_transaction_participants-p1',
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
      replicaId: 'sql_transaction_participants-p1-r1',
      replicaIds: ['sql_transaction_participants-p1-r1'],
      transport: mockTransport,
      dbPath: ':memory:',
    });

    await partition.initialize();

    try {
      const originalEmit = partition.raft.emit.bind(partition.raft);
      partition.raft.emit = (event, data, write) => {
        if (event === 'data' && typeof write === 'function') {
          write({
            type: 'append',
            term: 1,
            address: 'node-1/partition/sql_transaction_participants-p1-r1',
            leader: 'node-1/partition/sql_transaction_participants-p1-r1',
            state: 1,
            last: {term: 1, index: 1},
            data: [{index: 2, term: 1, command: 'noop'}],
          });
          return true;
        }
        return originalEmit(event, data, write);
      };

      await partition.handleTransportMessage({
        payload: {
          type: 'vote',
          term: 1,
          address: 'node-2/partition/sql_transaction_participants-p1-r4',
          state: 1,
          leader: '',
          last: {term: 0, index: 0},
        },
      });

      t.same(
        deliveries,
        [RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS],
        'non-critical transaction-state responses should also avoid the critical lane',
      );
    } finally {
      await partition.shutdown();
    }
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

test('PartitionService - cache reconciliation refreshes moved peers and joins new replicas',
  async (t) => {
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      service_id: 'replica-1',
      partition_id: 'test-partition-19b',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RaftRole.LEADER,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      service_id: 'replica-2',
      partition_id: 'test-partition-19b',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'node-new',
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RaftRole.FOLLOWER,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      service_id: 'replica-3',
      partition_id: 'test-partition-19b',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'node-3',
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RaftRole.FOLLOWER,
    });

    const joinedAddresses = [];
    const leftAddresses = [];
    const partition = new PartitionService({
      partitionId: 'test-partition-19b',
      tableId: 'peer_refresh_test',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'node-1',
      peerAddresses: ['node-old/partition/replica-2'],
      dbPath: ':memory:',
    });

    partition.raft = {
      nodes: [{address: 'node-old/partition/replica-2'}],
      leave(address) {
        leftAddresses.push(address);
      },
    };
    partition.raftProvider = {
      joinPeer(_raft, address) {
        joinedAddresses.push(address);
      },
    };

    partition.systemTableCache = systemTableCache;

    const refreshedAddress = partition.buildPeerAddress('replica-2');
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      refreshedAddress,
      'node-new/partition/replica-2',
      'cache-backed ownership should override stale bootstrap peer hints',
    );
    t.same(
      leftAddresses,
      ['node-old/partition/replica-2'],
      'stale raft peer address should be replaced when ownership moves',
    );
    t.same(
      joinedAddresses,
      [
        'node-new/partition/replica-2',
        'node-3/partition/replica-3',
      ],
      'newly visible peers should be joined from authoritative cache rows',
    );
    t.ok(
      partition.replicaIds.includes('replica-2') &&
      partition.replicaIds.includes('replica-3'),
      'replicaIds should expand to include cache-discovered peers',
    );
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

test('PartitionService - single-replica initialization fails closed without raft change()', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-20-missing-change',
    tableId: 'leader_event_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });
  const originalMaybeInitializeRebalancer =
    partition.maybeInitializeRebalancer.bind(partition);
  partition.maybeInitializeRebalancer = function(...args) {
    const result = originalMaybeInitializeRebalancer(...args);
    if (this.raft) {
      this.raft.change = undefined;
    }
    return result;
  };

  try {
    await t.rejects(
      partition.initialize(),
      /single-replica leadership requires raft\.change/,
      'single-replica initialization should fail instead of mutating local leader state without raft ownership',
    );
  } finally {
    await partition.shutdown().catch(() => {});
  }
});

test('PartitionService - leader activation dedupes same-term flaps and cancels on candidate demotion', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-leader-gate',
    tableId: 'leader_gate_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1', 'replica-2'],
    peerAddresses: ['node-2/partition/replica-2'],
    nodeId: 'node-1',
    transport: createLoopbackTransport(),
    dbPath: ':memory:',
    deferElection: true,
    leaderActivationStabilizationMs: 20,
  });

  await partition.initialize();

  let reconstructions = 0;
  let rebalancerLeadershipUpdates = 0;
  let leaderEvents = 0;
  partition.reconstructPreparedState = () => {
    reconstructions += 1;
    return {preparedTransactionCount: 0, prepareLostCount: 0};
  };
  partition.updateRebalancerLeadership = () => {
    rebalancerLeadershipUpdates += 1;
  };
  partition.on('leaderElected', () => {
    leaderEvents += 1;
  });

  partition.raft.term = 7;
  partition.raft.emit('leader');
  partition.raft.emit('leader');
  partition.raft.emit('leader');

  await waitForCondition(() => leaderEvents === 1, 500, 10);

  t.equal(reconstructions, 1, 'prepared-state reconstruction should run once');
  t.equal(
    rebalancerLeadershipUpdates,
    1,
    'leader-owned background work should activate once',
  );

  reconstructions = 0;
  leaderEvents = 0;
  rebalancerLeadershipUpdates = 0;

  partition.raft.term = 8;
  partition.raft.emit('leader');
  partition.raft.emit('candidate');

  await new Promise((resolve) => setTimeout(resolve, 60));

  t.equal(
    reconstructions,
    0,
    'candidate demotion should cancel pending leader reconstruction',
  );
  t.equal(
    leaderEvents,
    0,
    'candidate demotion should cancel pending leaderElected emission',
  );
  t.equal(
    rebalancerLeadershipUpdates,
    1,
    'candidate demotion should immediately revoke leader-owned background work',
  );

  await partition.shutdown();
});

test('PartitionService - publishes leader state as follower metadata in services table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
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
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'replica-1' &&
      update.data?.raft_role === RaftRole.FOLLOWER,
  );

  t.ok(roleUpdate, 'raft role update should be persisted via CDC');
  t.same(
    roleUpdate?.options?.expectedCacheFields,
    {
      raft_role: RaftRole.FOLLOWER,
    },
    'cache visibility should converge only the published role field',
  );
  t.equal(
    roleUpdate?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'raft role persistence should route through control-plane recovery readiness',
  );
  t.equal(
    roleUpdate?.options?.deliveryPriority,
    'background',
    'non-control-plane partition role publication should not consume the critical lane',
  );
  t.equal(
    roleUpdate?.options?.workClass,
    'background',
    'partition raft-role publication should use background admission',
  );
  t.equal(
    roleUpdate?.options?.allowPressureDefer,
    true,
    'partition raft-role publication should defer under pressure',
  );
  t.notOk(
    updates.some((update) => update.data?.raft_role === RaftRole.LEADER),
    'leader authority should not be republished through services.raft_role',
  );

  await partition.shutdown();
});

test('PartitionService - publishes candidate role as follower metadata', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'replica-1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: 'test-partition-candidate',
    [COLUMN.REPLICA_ID]: 'replica-1',
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.CANDIDATE,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/replica-1',
    [COLUMN.UPDATED_AT]: 1,
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-candidate',
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
  updates.length = 0;

  partition.queueRoleUpdate(RaftRole.CANDIDATE);
  await new Promise((resolve) => setImmediate(resolve));

  const candidateUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'replica-1',
  );

  t.notOk(
    candidateUpdate,
    'candidate publication should not emit a redundant write once follower metadata is converged',
  );
  t.equal(
    partition.persistedRole,
    RaftRole.FOLLOWER,
    'candidate publication should still converge the advisory metadata role to follower',
  );
  t.notOk(
    updates.some((update) => update.data?.raft_role === RaftRole.CANDIDATE),
    'candidate metadata should not be written to services',
  );

  await partition.shutdown();
});

test('PartitionService - retries raft role persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error('Cache update not observed for services:replica-1 within 1000ms');
        }
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
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
      {
        raft_role: RaftRole.FOLLOWER,
      },
      'retryable role persistence should only wait for the published role visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    t.equal(
      updates.length,
      2,
      'cache visibility false negatives should trigger a role persistence retry',
    );
    t.equal(
      updates[1]?.data?.raft_role,
      RaftRole.FOLLOWER,
      'retry should target the same raft role',
    );

    await partition.shutdown();
  });

test(
  'PartitionService - learner promotion retries follower metadata publication after observed state change',
  async (t) => {
    const updates = [];
    const scheduledRetries = [];
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];

    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_COUNT]: 3,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-1',
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-1/partition/replica-1',
      [COLUMN.UPDATED_AT]: 1,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-2',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-2',
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-2/partition/replica-2',
      [COLUMN.UPDATED_AT]: 1,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-3',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-3',
      [COLUMN.NODE_ID]: 'node-3',
      [COLUMN.RAFT_ROLE]: RaftRole.LEARNER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-3/partition/replica-3',
      [COLUMN.UPDATED_AT]: 1,
    });

    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        }
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    };

    const partition = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-3',
      replicaIds: ['replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    let electionStarted = false;
    partition.startElection = () => {
      electionStarted = true;
    };
    partition.roleMutationHelper.setTimeoutFn = (callback) => {
      scheduledRetries.push(callback);
      return callback;
    };
    partition.roleMutationHelper.clearTimeoutFn = () => {};

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(partition.role, RaftRole.FOLLOWER,
      'promotion should advance the learner to follower before persistence converges');
    t.equal(partition.isJoiningExistingGroup, false,
      'promotion should clear join-mode gating before the retry path runs');
    t.equal(electionStarted, true,
      'promotion should restart elections once the learner becomes a voter');
    t.equal(updates.length, 1,
      'promotion should attempt follower metadata publication immediately');
    t.equal(updates[0]?.tableName, SYSTEM_TABLE_NAME.SERVICES,
      'promotion should publish through the services table');
    t.same(updates[0]?.whereClause, {
      service_id: 'replica-3',
      raft_role: RaftRole.LEARNER,
      updated_at: 1,
    }, 'first promotion write should target the learner row snapshot');
    t.equal(updates[0]?.data?.raft_role, RaftRole.FOLLOWER,
      'promotion should publish follower metadata for the promoted learner');
    t.equal(scheduledRetries.length, 1,
      'guard misses during learner promotion should schedule a retry');

    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE, {
      [COLUMN.SERVICE_ID]: 'replica-3',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-3',
      [COLUMN.NODE_ID]: 'node-3',
      [COLUMN.RAFT_ROLE]: RaftRole.LEARNER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-3/partition/replica-3',
      [COLUMN.UPDATED_AT]: 2,
    });

    await scheduledRetries[0]();

    t.equal(updates.length, 2,
      'retry should re-attempt follower publication after the guarded miss');
    t.same(updates[1].whereClause, {
      service_id: 'replica-3',
      raft_role: RaftRole.LEARNER,
      updated_at: 2,
    }, 'retry should refresh the guard from the latest observed learner row');
    t.equal(updates[1].data.raft_role, RaftRole.FOLLOWER,
      'retry should keep publishing follower metadata for the promoted learner');
    t.equal(partition.persistedRole, RaftRole.FOLLOWER,
      'successful retry should converge the persisted follower metadata');
    t.equal(partition.pendingRoleUpdate, null,
      'successful retry should clear the queued role update');

    partition.roleMutationHelper.shutdown();
  },
);

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
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
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
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'replica-2' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'initial follower role should be persisted via CDC');
    t.notOk(
      Object.prototype.hasOwnProperty.call(roleUpdate?.data || {}, 'status'),
      'initial follower role persistence should not rewrite lifecycle status',
    );

    await partition.shutdown();
  });

test(
  'PartitionService - publishes role metadata before traffic ready when services leader is local',
  async (t) => {
    const updates = [];
    const now = Date.now();
    const readinessState = createTrafficReadinessState();
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.NODES, CDCOperation.INSERT, {
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-ready-gate',
      tableId: 'user-table',
      tableName: 'user_table',
      replicaId: 'replica-ready-gate',
      replicaIds: ['replica-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
      bootstrapReadinessState: readinessState,
    });

    partition.pendingRoleUpdate = RaftRole.LEADER;
    partition.persistedRole = null;

    const publishResult = await partition.flushRoleUpdate();
    t.equal(
      publishResult.reason,
      'applied',
      'partition role publication should not wait on lifecycle readiness once the local services leader can accept the write',
    );
    t.equal(
      updates.length,
      1,
      'partition role publication should write immediately when the local services leader is available',
    );

    systemTableCache.applySystemTableChange(TABLES.NODES, CDCOperation.UPDATE, {
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now + 1,
        [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60_000,
      });

    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const noopResult = await partition.flushRoleUpdate();
    t.equal(noopResult.reason, 'noop', 'later readiness transitions should not force duplicate writes');
    t.equal(updates.length, 1, 'later readiness transitions should not create duplicate role writes');

    await partition.shutdown();
  },
);

test(
  'PartitionService - defers rebalancer initialization until traffic ready',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    const partition = new PartitionService({
      partitionId: 'test-partition-rebalancer-ready-gate',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-ready-gate',
      replicaIds: ['replica-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    });

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    partition.cdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    partition.tablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    partition.messageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    partition.sqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    partition.rebalanceCoordinator = {
      initialize: () => {},
    };

    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
    });
    partition.maybeInitializeRebalancer();
    t.notOk(
      partition.rebalancer,
      'should not initialize rebalancer before traffic-ready lifecycle',
    );

    readinessState.transitionTo(LIFECYCLE_PHASE.TRAFFIC_READY, {
      ready: true,
      reasons: [],
    });
    partition.maybeInitializeRebalancer();
    t.ok(
      partition.rebalancer,
      'should initialize rebalancer after traffic-ready lifecycle',
    );

    await partition.shutdown();
  },
);

test(
  'PartitionService - priority control-plane rebalancer starts once lifecycle owner opens metadata publication',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    const partition = new PartitionService({
      partitionId:
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      replicaId: 'replica-control-plane-ready-gate',
      replicaIds: ['replica-control-plane-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    });

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    partition.cdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    partition.tablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    partition.messageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    partition.sqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    partition.rebalanceCoordinator = {
      initialize: () => {},
    };

    readinessState.transitionTo(LIFECYCLE_PHASE.JOIN_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    });
    partition.maybeInitializeRebalancer();
    t.ok(
      partition.rebalancer,
      'priority control-plane partitions should initialize the rebalancer once metadata publication is allowed',
    );

    await partition.shutdown();
  },
);

test('PartitionService - persists leader node updates to partitions table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };

  const systemTableCache = new SystemTableCache();
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'partitions-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
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
      update.tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
      update.whereClause?.[COLUMN.PARTITION_ID] === 'test-partition-23' &&
      update.data?.[COLUMN.LEADER_NODE_ID] === 'seed-node',
  );

  t.ok(leaderUpdate, 'leader node update should be persisted via CDC');
  t.same(
    leaderUpdate?.options?.expectedCacheFields,
    {leader_node_id: 'seed-node'},
    'cache visibility should only depend on leader identity',
  );
  t.equal(
    leaderUpdate?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'leader node persistence should route through control-plane recovery readiness',
  );
  t.equal(
    leaderUpdate?.options?.deliveryPriority,
    'background',
    'non-control-plane partition leader publication should not consume the critical lane',
  );

  await partition.shutdown();
});

test('PartitionService - keeps control-plane metadata publication critical', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'partitions-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
  });

  const partition = new PartitionService({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
    tableId: SYSTEM_TABLE_NAME.NODES,
    tableName: SYSTEM_TABLE_NAME.NODES,
    replicaId: 'nodes-p1-r1',
    replicaIds: ['nodes-p1-r1'],
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
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'nodes-p1-r1',
  );
  const leaderUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
      update.whereClause?.[COLUMN.PARTITION_ID] === INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
  );

  t.equal(
    roleUpdate?.options?.deliveryPriority,
    'background',
    'control-plane partition role publication should be advisory background metadata',
  );
  t.equal(
    leaderUpdate?.options?.deliveryPriority,
    'critical',
    'control-plane partition leader publication should stay on the critical lane',
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
    const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'partitions-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
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
    partition.rebalancer = {
      cdcIntegrationService: null,
      setRebalanceCoordinator: () => {},
      shutdown: () => {},
    };
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

test('PartitionService - initializeRebalancer passes sqlQueryEngine to gateway',
  async (t) => {
    // Bug reproduction: initializeRebalancer() creates UnifiedRebalancer
    // without passing sqlQueryEngine, so the gateway is created with null.
    // Later, maybeInitializeRebalancer() sets rebalancer.sqlQueryEngine
    // but does NOT propagate to the gateway. The gateway retains null
    // forever, causing "requires sqlQueryEngine" errors when the
    // rebalancer tries to call getConfiguredRebalanceBudget() or
    // getGlobalInFlightOperationCount().
    const mockSqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    const mockSystemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    const mockCdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    const mockTablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    const mockMessageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    const mockRebalanceCoordinator = {
      systemTableCache: null,
      cdcIntegrationService: null,
      tablePolicyService: null,
      sqlQueryEngine: null,
      initialize: () => {},
    };

    const partition = new PartitionService({
      partitionId: 'test-partition-gw-1',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    // Wire all dependencies so initializeRebalancer() fires
    partition.rebalanceCoordinator = mockRebalanceCoordinator;
    partition.systemTableCache = mockSystemTableCache;
    partition.cdcIntegrationService = mockCdcIntegrationService;
    partition.tablePolicyService = mockTablePolicyService;
    partition.messageRouter = mockMessageRouter;
    partition.isLeader = true;
    partition.setSqlQueryEngine(mockSqlQueryEngine);

    // Rebalancer should now exist
    t.ok(partition.rebalancer, 'rebalancer should be initialized');

    // The gateway must have the sqlQueryEngine — this is the bug
    const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
    t.ok(gateway, 'gateway should exist on rebalancer');
    t.equal(
      gateway.sqlQueryEngine,
      mockSqlQueryEngine,
      'gateway.sqlQueryEngine must be set after initializeRebalancer ' +
      '(uses injected owner path via constructor)',
    );

    // Verify the gateway can actually execute a query without throwing
    const result = await gateway.executeQuery(
      'SELECT 1',
      [],
      {},
    );
    t.ok(result, 'gateway.executeQuery should succeed');

    await partition.shutdown();
  });

test('PartitionService - maybeInitializeRebalancer propagates sqlQueryEngine ' +
  'to gateway on refresh',
async (t) => {
  // Bug reproduction: when maybeInitializeRebalancer() refreshes an
  // existing rebalancer, it sets rebalancer.sqlQueryEngine but does NOT
  // propagate to the gateway. The gateway retains the stale engine.
  const firstEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'first'}),
  };
  const secondEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'second'}),
  };
  const mockSystemTableCache = {
    get: () => null,
    filter: () => [],
    onCacheChange: () => {},
    offCacheChange: () => {},
  };
  const mockCdcIntegrationService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    deleteSystemTableRow: async () => ({success: true}),
  };
  const mockTablePolicyService = {
    getPolicyForPartition: () => ({targetReplicaCount: 3}),
  };
  const mockMessageRouter = {
    getConnectionState: () => 'connected',
    send: async () => {},
  };
  const mockRebalanceCoordinator = {
    systemTableCache: null,
    cdcIntegrationService: null,
    tablePolicyService: null,
    sqlQueryEngine: null,
    initialize: () => {},
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-gw-2',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'test-node',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Initialize with first engine
  partition.rebalanceCoordinator = mockRebalanceCoordinator;
  partition.systemTableCache = mockSystemTableCache;
  partition.cdcIntegrationService = mockCdcIntegrationService;
  partition.tablePolicyService = mockTablePolicyService;
  partition.messageRouter = mockMessageRouter;
  partition.isLeader = true;
  partition.setSqlQueryEngine(firstEngine);

  t.ok(partition.rebalancer, 'rebalancer should be initialized');

  const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
  t.equal(
    gateway.sqlQueryEngine,
    firstEngine,
    'gateway should have first engine after init',
  );

  // Now update to second engine — this triggers maybeInitializeRebalancer
  partition.setSqlQueryEngine(secondEngine);

  // The gateway must have the updated engine — this is the bug
  t.equal(
    gateway.sqlQueryEngine,
    secondEngine,
    'gateway.sqlQueryEngine must be updated when ' +
    'maybeInitializeRebalancer refreshes (uses injected owner path)',
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

test('PartitionService - learner promotes one temporary replacement voter above target for non-critical partitions', async (t) => {
  // Create a mock system table cache with 3 active voters and a 3-voter target.
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 3,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'test-partition',
          replica_count: 3,
        }].filter(predicate);
      }
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

  // One temporary replacement learner above target is allowed so the
  // source voter can be removed after the replacement becomes ready.
  t.equal(
    partition.role,
    RaftRole.FOLLOWER,
    'Should promote one temporary replacement learner above target',
  );
  t.equal(
    partition.isJoiningExistingGroup,
    false,
    'Promotion should exit joining-existing-group mode',
  );
  t.equal(
    partition.learnerPromotionTimer,
    null,
    'Single replacement promotion should not reschedule',
  );

  // Clean up timer
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes one temporary replacement voter above target for critical partitions during REPLACE', async (t) => {
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'nodes-p1') {
        return {
          partition_id: 'nodes-p1',
          replica_count: 3,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'nodes-p1',
          replica_count: 3,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'nodes-p1-r1',
            partition_id: 'nodes-p1',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'nodes-p1-r2',
            partition_id: 'nodes-p1',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'nodes-p1-r3',
            partition_id: 'nodes-p1',
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

  const partition = new PartitionService({
    partitionId: 'nodes-p1',
    tableId: 'nodes',
    replicaId: 'nodes-p1-r4',
    replicaIds: ['nodes-p1-r4'],
    nodeId: 'node-d',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'nodes-p1-r1';

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.FOLLOWER,
    'critical REPLACE should allow the bounded temporary replacement voter',
  );
  t.equal(
    partition.isJoiningExistingGroup,
    false,
    'Promotion should exit joining-existing-group mode for critical replacement learners',
  );
  t.equal(
    partition.learnerPromotionTimer,
    null,
    'critical replacement promotion should not reschedule',
  );

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
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 5,
        }];
        return partitions.filter(predicate);
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
  'PartitionService - deferred learner promotion uses catch-up recheck cadence',
  async (t) => {
    const scheduledDelayMs = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback, delayMs) => {
      scheduledDelayMs.push(delayMs);
      return {callback, delayMs};
    };
    t.teardown(() => {
      global.setTimeout = originalSetTimeout;
    });

    const mockCache = {
      get: () => null,
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          const partitions = [{
            partition_id: 'test-partition',
            replica_count: 5,
          }];
          return partitions.filter(predicate);
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
      learnerPromotionDelayMs: 30000,
      learnerCatchUpCheckIntervalMs: 1000,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = null;
    partition.checkLearnerPromotion();

    t.equal(
      scheduledDelayMs[0],
      1000,
      'deferred promotion checks should use catch-up interval instead of full floor',
    );
    partition.learnerPromotionTimer = null;
  },
);

test(
  'PartitionService - priority recovery expedites initial learner promotion check',
  async (t) => {
    const scheduledDelayMs = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback, delayMs) => {
      scheduledDelayMs.push(delayMs);
      return {callback, delayMs};
    };
    t.teardown(() => {
      global.setTimeout = originalSetTimeout;
    });

    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const partition = new PartitionService({
      partitionId: `${SYSTEM_TABLE_NAME.SQL_TRANSACTIONS}-p1`,
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      replicaId: 'replica-3',
      replicaIds: ['replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      bootstrapReadinessState: readinessState,
      learnerPromotionDelayMs: 30000,
      learnerPromotionPriorityRecoveryDelayMs: 5000,
    });

    partition.scheduleLearnerPromotion(
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY,
    );

    t.equal(
      scheduledDelayMs[0],
      5000,
      'priority control-plane recovery should shorten initial promotion floor',
    );
    partition.learnerPromotionTimer = null;
  },
);

test(
  'PartitionService - priority recovery allows one bounded overflow learner promotion for critical partitions',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`) {
          return {
            partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-5',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
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
      partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-5',
      replicaIds: ['replica-5'],
      nodeId: 'node-5',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'priority recovery should allow one extra temporary voter to unblock critical control-plane convergence',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'successful overflow promotion should not reschedule',
    );
  },
);

test(
  'PartitionService - priority recovery promotes replacement-owned learners even when voters are already target+2',
  async (t) => {
    const partitionId = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: partitionId,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-5',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-6',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          const operations = [{
            operation_id: 'op-replace-6',
            type: OperationType.REPLACE,
            partition_id: partitionId,
            target_node_id: 'node-6',
            status: ReplicaStatus.SYNCING,
          }];
          return operations.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-6',
      replicaIds: ['replica-6'],
      nodeId: 'node-6',
      dbPath: ':memory:',
      isJoiningExistingGroup: false,
      bootstrapReadinessState: readinessState,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'priority recovery should not deadlock when replacement-owned learners must promote above target to unblock removals',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'successful bounded overflow promotion should not reschedule',
    );
  },
);

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
  t.equal(
    partition.isJoiningExistingGroup,
    false,
    'Promotion should clear join-mode gating before elections restart',
  );
  t.equal(electionStarted, true, 'promotion should start elections as a voter');

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test(
  'PartitionService - joining learner ignores candidate and follower demotion events before promotion',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'joiner-partition',
      tableId: 'joiner-table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2'],
      peerAddresses: ['node-1/partition/replica-1'],
      nodeId: 'node-2',
      transport: createLoopbackTransport(),
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
    });

    try {
      await partition.initialize();
      const initialPendingRoleUpdate = partition.pendingRoleUpdate;

      t.equal(
        partition.role,
        RaftRole.LEARNER,
        'joining replica should start as learner',
      );

      partition.raft.emit('candidate');
      partition.raft.emit('follower');

      t.equal(
        partition.role,
        RaftRole.LEARNER,
        'joining learner should ignore raw demotion events before promotion',
      );
      t.equal(
        partition.pendingRoleUpdate,
        initialPendingRoleUpdate,
        'joining learner should not queue a persisted demotion before promotion',
      );
      t.equal(
        partition.electionStarted,
        false,
        'joining learner should keep elections disabled before promotion',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

test(
  'PartitionService - reconciled single-replica leader keeps promoted joiner follower',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      raft: {
        heartbeatIntervalMs: 20,
        electionTimeoutMinMs: 100,
        electionTimeoutMaxMs: 200,
      },
    });
    const logger = LoggingService.getInstance();
    logger.initialize({level: 'error'});

    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      service_id: 'replica-1',
      partition_id: 'stable-join-partition',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RaftRole.LEADER,
    });

    const transport = createLoopbackTransport();
    const leader = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'node-1',
      transport,
      systemTableCache,
      dbPath: ':memory:',
    });
    const joiner = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2'],
      peerAddresses: [
        'node-1/partition/replica-1',
        'node-2/partition/replica-2',
      ],
      nodeId: 'node-2',
      transport,
      systemTableCache,
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      leaderAddress: 'node-1/partition/replica-1',
      learnerPromotionDelayMs: 25,
    });

    try {
      await leader.initialize();
      await joiner.initialize();

      t.equal(
        leader.raft.state,
        LifeRaft.LEADER,
        'single-replica owner should become a real raft leader before expansion',
      );

      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
        service_id: 'replica-2',
        partition_id: 'stable-join-partition',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'node-2',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: RaftRole.LEARNER,
      });

      const peerJoined = await waitForCondition(
        () => leader.raft.nodes.some(
          (node) => node?.address === 'node-2/partition/replica-2',
        ),
        1000,
        10,
      );
      t.equal(peerJoined, true, 'leader should reconcile the joiner as a raft peer');

      const promoted = await waitForCondition(
        () => joiner.role === RaftRole.FOLLOWER,
        1000,
        10,
      );
      t.equal(promoted, true, 'joiner should promote from learner to follower');

      await new Promise((resolve) => setTimeout(resolve, 320));

      t.equal(
        joiner.role,
        RaftRole.FOLLOWER,
        'joiner should remain follower after promotion when leader heartbeats are active',
      );
      t.equal(
        joiner.raft.state,
        LifeRaft.FOLLOWER,
        'joiner raft state should stay follower instead of drifting to candidate',
      );
      t.equal(
        joiner.leaderId,
        'replica-1',
        'joiner should retain the reconciled leader replica identity after promotion',
      );
    } finally {
      await joiner.shutdown();
      await leader.shutdown();
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

test('PartitionService - critical partition defers second learner when replacement window is exhausted', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 3,
        }];
        return partitions.filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-4',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
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
    partitionId: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
    tableId: SYSTEM_TABLE_NAME.CONFIG,
    replicaId: 'replica-5',
    replicaIds: ['replica-5'],
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
    'Critical partitions should defer when a second learner would exceed the bounded replacement window',
  );
  t.ok(
    partition.learnerPromotionTimer,
    'Exhausted critical replacement window should reschedule',
  );

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes when multiple learners reach odd count within target replica count', async (t) => {
  // Create a mock system table cache with 3 active voters and 2 learners
  // 3 voters + 2 learners = 5 (odd) - should allow promotion
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 5,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 5,
        }];
        return partitions.filter(predicate);
      }
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
  // and stays within the configured target of 5 voters.
  t.equal(partition.role, RaftRole.FOLLOWER,
    'Should promote when all learners would reach odd count within target');

  // Clean up any timers
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner defers when multiple learners would exceed target replica count', async (t) => {
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 3,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 3,
        }];
        return partitions.filter(predicate);
      }
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

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Should defer when multi-learner promotion would exceed target',
  );
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner deferred when all learners would still be even', async (t) => {
  // Create a mock system table cache with 3 active voters and 3 learners.
  // 3 voters + 3 learners = 6 (even), so the learner should still defer.
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 6,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'test-partition',
          replica_count: 6,
        }].filter(predicate);
      }
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
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-6',
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
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should remain learner because 3 + 1 = 4 (even) and promoting all learners
  // would still leave the group at an even count of 6.
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

test(
  'PartitionService - learner promotion ignores orphan learners that do not have active add-like operations',
  async (t) => {
    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
          return {
            partition_id: 'test-partition',
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'test-partition',
            replica_count: 3,
          }].filter(predicate);
        }
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
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-5',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-6',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          const operations = [
            {
              operation_id: 'op-replace-1',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-4',
              status: ReplicaStatus.SYNCING,
            },
            {
              operation_id: 'op-replace-2',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-5',
              status: ReplicaStatus.REMOVED,
            },
            {
              operation_id: 'op-replace-3',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-6',
              status: ReplicaStatus.FAILED,
            },
          ];
          return operations.filter(predicate);
        }
        return [];
      },
    };

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

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'orphan learner rows should not block promotion when only one add-like operation is active',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'promotion should complete without a defer timer',
    );

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

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

test('PartitionService - executeQuery keeps non-transactional writes out of unrelated active transactions', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  const beginResult = await partition.beginTransaction('tx-active', 101);
  t.equal(beginResult.success, true, 'setup transaction should begin');

  const proposedWrites = [];
  partition.proposeWrite = async (operation) => {
    proposedWrites.push(operation);
    return {
      success: true,
      changes: 1,
      partitionId: partition.partitionId,
    };
  };

  const result = await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'rebalance-coordinator:op-1'},
  );

  t.equal(result.success, true, 'non-transactional write should still succeed');
  t.equal(proposedWrites.length, 1, 'write should use the normal propose path');
  t.equal(
    partition.activeTransactions.get('tx-active')?.operations.length,
    0,
    'unrelated active transaction should not capture the write',
  );

  await partition.rollbackTransaction('tx-active');
  partition.shutdown();
});

test('PartitionService - beginTransaction is idempotent for the same active session', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  const firstResult = await partition.beginTransaction('tx-active', 101);
  const secondResult = await partition.beginTransaction('tx-active', 101);

  t.equal(firstResult.success, true, 'initial transaction should begin');
  t.equal(secondResult.success, true, 'same-session begin retry should succeed');
  t.equal(secondResult.idempotent, true,
    'same-session begin retry should be marked idempotent');
  t.equal(partition.activeTransactions.size, 1,
    'same-session begin retry should not create a second active transaction');

  await partition.rollbackTransaction('tx-active');
  partition.shutdown();
});

test('PartitionService - beginTransaction is idempotent for the same prepared session', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  const beginResult = await partition.beginTransaction('tx-prepared', 202);
  t.equal(beginResult.success, true, 'initial transaction should begin');

  await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'tx-prepared'},
  );

  const prepareResult = await partition.prepareTransaction('tx-prepared');
  t.equal(prepareResult.success, true, 'transaction should prepare');
  t.equal(partition.isInTransaction(), true,
    'prepared transaction should still count as in-flight');

  const retryResult = await partition.beginTransaction('tx-prepared', 202);
  t.equal(retryResult.success, true, 'same-session begin retry should succeed');
  t.equal(retryResult.idempotent, true,
    'same-session begin retry should be marked idempotent');
  t.equal(partition.preparedTransactions.size, 1,
    'same-session begin retry should not create a second prepared transaction');

  await partition.rollbackTransaction('tx-prepared');
  partition.shutdown();
});

test('PartitionService - beginTransaction rejects other sessions while a prepared transaction is open', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  await partition.beginTransaction('tx-prepared', 202);
  await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'tx-prepared'},
  );
  const prepareResult = await partition.prepareTransaction('tx-prepared');
  t.equal(prepareResult.success, true, 'transaction should prepare');

  await t.rejects(
    () => partition.beginTransaction('tx-other', 303),
    /Transaction already active on this partition/,
    'different-session begin should fail before SQLite re-entry',
  );

  await partition.rollbackTransaction('tx-prepared');
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
