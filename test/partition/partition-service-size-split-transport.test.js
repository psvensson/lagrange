/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

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
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
} from '../../src/raft/constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/pressure-governor.js';


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
        [{
          ...RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
          deliverySource:
            'raft:append:entries:node-2/partition/sql_transaction_participants-p1-r4',
        }],
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
        [{
          ...RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
          deliverySource:
            'raft:append:entries:node-2/partition/sql_transaction_participants-p1-r4',
        }],
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
