/**
 * Unit tests for PartitionWorkerService.
 *
 * Tests the partition replica running in worker process context,
 * using composable building blocks: RaftGroup, SQLiteStore, CDCEmitter.
 *
 * @see Requirements 1.1, 1.5, 1.9, 5.6 - Worker Process Isolation
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import {
  PartitionWorkerService,
  PARTITION_WORKER_DEFAULT,
  PARTITION_WORKER_ERROR_MSG,
} from '../../src/worker/partition-worker-service.js';
import {
  WORKER_ENTITY_TYPE,
  FACADE_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';
import {RAFT_GROUP_ROLE} from '../../src/raft/raft-group-constants.js';

/**
 * Create a mock message bridge for tests that call onInitialize directly.
 * In production, ReplicaWorkerBase.initialize() creates the real bridge.
 * @return {Object} Mock message bridge with deliver and send methods.
 */
function createMockMessageBridge() {
  return {
    deliver: mock.fn(async () => ({status: 'ok'})),
    send: mock.fn(async () => ({status: 'ok'})),
    initialize: mock.fn(async () => {}),
    shutdown: mock.fn(async () => {}),
    setMessageHandler: mock.fn(),
    getStats: mock.fn(() => ({})),
  };
}

/**
 * Create a mock AddressManager for PeerAddressResolver.
 * Handles unified address format: {nodeId}/{entityType}/{replicaId}
 * @return {Object} Mock address manager.
 */
function createMockAddressManager() {
  return {
    validate: (addr) => {
      const parts = addr.split('/');
      if (parts.length >= 3) {
        return {valid: true};
      }
      return {valid: false, error: 'Invalid format'};
    },
    parse: (addr) => {
      const parts = addr.split('/');
      return {
        nodeId: parts[0],
        serviceType: parts[1],
        serviceId: parts[2],
      };
    },
    format: (nodeId, entityType, serviceId) =>
      `${nodeId}/${entityType}/${serviceId}`,
  };
}

describe('PartitionWorkerService', () => {
  let service;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: mock.fn(),
      debug: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      trace: mock.fn(),
    };
  });

  afterEach(async () => {
    if (service) {
      try {
        await service.onStop();
      } catch (_err) {
        // Ignore cleanup errors
      }
    }
    service = null;
  });

  describe('constructor', () => {
    it('should throw error if partitionId is missing', () => {
      assert.throws(() => {
        new PartitionWorkerService({
          nodeId: 'node-1',
          replicaId: 'replica-1',
          tableId: 'table-1',
        });
      }, {
        message: PARTITION_WORKER_ERROR_MSG.MISSING_PARTITION_ID,
      });
    });

    it('should throw error if tableId is missing', () => {
      assert.throws(() => {
        new PartitionWorkerService({
          nodeId: 'node-1',
          replicaId: 'replica-1',
          partitionId: 'partition-1',
        });
      }, {
        message: PARTITION_WORKER_ERROR_MSG.MISSING_TABLE_ID,
      });
    });

    it('should create instance with valid options', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });

      assert.strictEqual(service.partitionId, 'partition-1');
      assert.strictEqual(service.tableId, 'table-1');
      assert.strictEqual(service.tableName, 'table-1');
      assert.strictEqual(
        service.entityType,
        WORKER_ENTITY_TYPE.PARTITION,
      );
      assert.strictEqual(
        service.dbPath,
        PARTITION_WORKER_DEFAULT.MEMORY_DB_PATH,
      );
    });

    it('should use custom tableName if provided', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        tableName: 'custom_table',
        logger: mockLogger,
      });

      assert.strictEqual(service.tableName, 'custom_table');
    });

    it('should use custom dbPath if provided', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        dbPath: '/tmp/test.db',
        logger: mockLogger,
      });

      assert.strictEqual(service.dbPath, '/tmp/test.db');
    });

    it('should initialize with default replica IDs', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });

      assert.deepStrictEqual(service.replicaIds, ['replica-1']);
    });

    it('should use provided replica IDs', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        logger: mockLogger,
      });

      assert.deepStrictEqual(
        service.replicaIds,
        ['replica-1', 'replica-2', 'replica-3'],
      );
    });

    it('should build correct unified address', () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });

      assert.strictEqual(
        service.unifiedAddress,
        'node-1/partition/replica-1',
      );
    });
  });

  describe('onInitialize', () => {
    /**
     * Helper to create a service with mock bridge injected.
     * @param {Object} [extraOpts] - Extra constructor options.
     * @return {PartitionWorkerService} Service ready for onInitialize.
     */
    function createServiceWithBridge(extraOpts = {}) {
      const svc = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
        ...extraOpts,
      });
      svc.messageBridge = createMockMessageBridge();
      return svc;
    }

    it('should initialize SQLiteStore', async () => {
      service = createServiceWithBridge();
      await service.onInitialize();

      assert.ok(service.getSQLiteStore());
      const db = service.getSQLiteStore().getDatabase();
      assert.ok(db);
      assert.ok(db.open);
    });

    it('should initialize RaftGroup', async () => {
      service = createServiceWithBridge();
      await service.onInitialize();

      assert.ok(service.getRaftGroup());
      assert.ok(service.logAdapter);
    });

    it('should initialize CDCEmitter', async () => {
      service = createServiceWithBridge();
      await service.onInitialize();

      assert.ok(service.getCDCEmitter());
    });

    it('should create table if schema provided', async () => {
      service = createServiceWithBridge({
        tableId: 'table_1',
        tableName: 'test_table',
        schema: {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'name', type: 'TEXT', notNull: true},
            {name: 'value', type: 'INTEGER'},
          ],
        },
      });
      await service.onInitialize();

      const db = service.getSQLiteStore().getDatabase();
      const tableInfo = db.prepare(
        'SELECT name FROM sqlite_master ' +
        'WHERE type=\'table\' AND name=?',
      ).get('test_table');

      assert.ok(tableInfo);
      assert.strictEqual(tableInfo.name, 'test_table');
    });

    it('should start as follower role', async () => {
      service = createServiceWithBridge({
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/partition/replica-1',
          'node-1/partition/replica-2',
          'node-1/partition/replica-3',
        ],
      });
      await service.onInitialize();

      assert.strictEqual(
        service.getRole(),
        RAFT_GROUP_ROLE.FOLLOWER,
      );
      assert.strictEqual(service.isLeaderReplica(), false);
    });
  });

  describe('onStop', () => {
    /**
     * Helper to create an initialized service.
     * @param {Object} [extraOpts] - Extra constructor options.
     * @return {Promise<PartitionWorkerService>} Initialized service.
     */
    async function createInitializedService(extraOpts = {}) {
      const svc = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
        ...extraOpts,
      });
      svc.messageBridge = createMockMessageBridge();
      await svc.onInitialize();
      return svc;
    }

    it('should close SQLiteStore', async () => {
      service = await createInitializedService();
      const db = service.getSQLiteStore().getDatabase();

      await service.onStop();

      assert.strictEqual(service.getSQLiteStore(), null);
      assert.strictEqual(db.open, false);
    });

    it('should stop RaftGroup', async () => {
      service = await createInitializedService();

      await service.onStop();

      assert.strictEqual(service.getRaftGroup(), null);
      assert.strictEqual(service.logAdapter, null);
    });

    it('should shutdown CDCEmitter', async () => {
      service = await createInitializedService();

      await service.onStop();

      assert.strictEqual(service.getCDCEmitter(), null);
    });

    it('should clear CDC subscribers', async () => {
      service = await createInitializedService();
      service.cdcSubscribers.add('subscriber-1');
      assert.strictEqual(service.cdcSubscribers.size, 1);

      await service.onStop();

      assert.strictEqual(service.cdcSubscribers.size, 0);
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'test_table',
        schema: {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'name', type: 'TEXT'},
            {name: 'value', type: 'INTEGER'},
          ],
        },
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();
    });

    it('should throw error if not initialized', () => {
      const uninitializedService = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });

      assert.throws(
        () => uninitializedService.executeQuery('SELECT 1'),
        {message: PARTITION_WORKER_ERROR_MSG.NOT_INITIALIZED},
      );
    });

    it('should execute SELECT query', () => {
      const db = service.getSQLiteStore().getDatabase();
      db.exec(
        'INSERT INTO test_table (id, name, value) ' +
        'VALUES (\'1\', \'test\', 100)',
      );

      const result = service.executeQuery(
        'SELECT * FROM test_table',
      );

      assert.ok(result.rows);
      assert.strictEqual(result.rows.length, 1);
      assert.strictEqual(result.rows[0].id, '1');
      assert.strictEqual(result.rows[0].name, 'test');
      assert.strictEqual(result.rows[0].value, 100);
    });

    it('should execute INSERT query', () => {
      const result = service.executeQuery(
        'INSERT INTO test_table (id, name, value) ' +
        'VALUES (?, ?, ?)',
        ['1', 'test', 100],
      );

      assert.strictEqual(result.changes, 1);

      const db = service.getSQLiteStore().getDatabase();
      const row = db.prepare(
        'SELECT * FROM test_table WHERE id = ?',
      ).get('1');
      assert.ok(row);
      assert.strictEqual(row.name, 'test');
    });

    it('should execute UPDATE query', () => {
      const db = service.getSQLiteStore().getDatabase();
      db.exec(
        'INSERT INTO test_table (id, name, value) ' +
        'VALUES (\'1\', \'test\', 100)',
      );

      const result = service.executeQuery(
        'UPDATE test_table SET value = ? WHERE id = ?',
        [200, '1'],
      );

      assert.strictEqual(result.changes, 1);

      const row = db.prepare(
        'SELECT * FROM test_table WHERE id = ?',
      ).get('1');
      assert.strictEqual(row.value, 200);
    });

    it('should execute DELETE query', () => {
      const db = service.getSQLiteStore().getDatabase();
      db.exec(
        'INSERT INTO test_table (id, name, value) ' +
        'VALUES (\'1\', \'test\', 100)',
      );

      const result = service.executeQuery(
        'DELETE FROM test_table WHERE id = ?',
        ['1'],
      );

      assert.strictEqual(result.changes, 1);

      const row = db.prepare(
        'SELECT * FROM test_table WHERE id = ?',
      ).get('1');
      assert.strictEqual(row, undefined);
    });

    it('should handle EXECUTE_QUERY alias messages', async () => {
      const response = await service.handleMessage({
        type: FACADE_MESSAGE_TYPE.EXECUTE_QUERY,
        sql: 'INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)',
        params: ['2', 'alias-test', 200],
      });

      assert.strictEqual(response.status, 'ok');
      assert.strictEqual(response.result.changes, 1);

      const db = service.getSQLiteStore().getDatabase();
      const row = db.prepare(
        'SELECT * FROM test_table WHERE id = ?',
      ).get('2');
      assert.ok(row);
      assert.strictEqual(row.name, 'alias-test');
    });
  });

  describe('CDC subscription messaging', () => {
    beforeEach(async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'test_table',
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();
    });

    it('should include partitionId in SUBSCRIBE_CDC responses', async () => {
      const response = await service.handleMessage({
        type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
        subscriberAddress: 'node-2/message-group/replica-1',
      });

      assert.strictEqual(response.status, 'ok');
      assert.strictEqual(response.partitionId, 'partition-1');
      assert.strictEqual(response.replicaId, 'replica-1');
    });
  });

  describe('CDCEmitter integration', () => {
    beforeEach(async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'test_table',
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();
    });

    it('should have CDCEmitter after initialization', () => {
      const emitter = service.getCDCEmitter();
      assert.ok(emitter);
    });

    it('should emit CDC events via CDCEmitter', async () => {
      const events = [];
      const emitter = service.getCDCEmitter();
      emitter.subscribe((event) => {
        events.push(event);
      });

      await emitter.emit('INSERT', {id: '1', name: 'test'});

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].operation, 'INSERT');
      assert.strictEqual(
        events[0].sourcePartition,
        'partition-1',
      );
      assert.strictEqual(
        events[0].sourceReplica,
        'replica-1',
      );
    });

    it('should emit to multiple subscribers', async () => {
      const events1 = [];
      const events2 = [];
      const emitter = service.getCDCEmitter();

      emitter.subscribe((event) => events1.push(event));
      emitter.subscribe((event) => events2.push(event));

      await emitter.emit('DELETE', {id: '1'});

      assert.strictEqual(events1.length, 1);
      assert.strictEqual(events2.length, 1);
    });

    it('should include timestamp in CDC event', async () => {
      const events = [];
      const emitter = service.getCDCEmitter();
      emitter.subscribe((event) => events.push(event));

      await emitter.emit('INSERT', {id: '1'});

      assert.ok(events[0].timestamp);
    });
  });

  describe('getters', () => {
    beforeEach(async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        tableName: 'custom_table',
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/partition/replica-1',
          'node-2/partition/replica-2',
          'node-3/partition/replica-3',
        ],
        addressManager: createMockAddressManager(),
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();
    });

    it('should return partition ID', () => {
      assert.strictEqual(service.getPartitionId(), 'partition-1');
    });

    it('should return table ID', () => {
      assert.strictEqual(service.getTableId(), 'table-1');
    });

    it('should return role', () => {
      assert.strictEqual(
        service.getRole(),
        RAFT_GROUP_ROLE.FOLLOWER,
      );
    });

    it('should return isLeaderReplica', () => {
      assert.strictEqual(service.isLeaderReplica(), false);
    });

    it('should return leader ID', () => {
      assert.strictEqual(service.getLeaderId(), null);
    });

    it('should return current term', () => {
      const term = service.getCurrentTerm();
      assert.strictEqual(typeof term, 'number');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/partition/replica-1',
          'node-2/partition/replica-2',
          'node-3/partition/replica-3',
        ],
        addressManager: createMockAddressManager(),
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();
    });

    it('should return comprehensive stats', () => {
      const stats = service.getStats();

      assert.strictEqual(stats.partitionId, 'partition-1');
      assert.strictEqual(stats.tableId, 'table-1');
      assert.strictEqual(stats.role, RAFT_GROUP_ROLE.FOLLOWER);
      assert.strictEqual(stats.isLeader, false);
      assert.strictEqual(stats.leaderId, null);
      assert.strictEqual(typeof stats.term, 'number');
      assert.strictEqual(stats.cdcSubscriberCount, 0);
      assert.strictEqual(stats.replicaCount, 3);
      assert.strictEqual(stats.replicaId, 'replica-1');
      assert.strictEqual(
        stats.entityType,
        WORKER_ENTITY_TYPE.PARTITION,
      );
      assert.strictEqual(stats.nodeId, 'node-1');
      assert.strictEqual(
        stats.unifiedAddress,
        'node-1/partition/replica-1',
      );
    });
  });

  describe('SQLite native module', () => {
    it('should have access to better-sqlite3', async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();

      const db = service.getSQLiteStore().getDatabase();
      assert.ok(db);
      assert.ok(db.open);

      const result = db.prepare('SELECT 1 + 1 as sum').get();
      assert.strictEqual(result.sum, 2);
    });

    it('should support WAL mode for in-memory dbs', async () => {
      service = new PartitionWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        tableId: 'table-1',
        logger: mockLogger,
      });
      service.messageBridge = createMockMessageBridge();
      await service.onInitialize();

      const db = service.getSQLiteStore().getDatabase();
      const result = db.pragma('journal_mode');
      assert.ok(
        result[0].journal_mode === 'memory' ||
        result[0].journal_mode === 'wal',
        'Expected journal_mode to be memory or wal, got ' +
        result[0].journal_mode,
      );
    });
  });
});
