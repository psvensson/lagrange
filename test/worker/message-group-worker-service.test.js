/**
 * Unit tests for MessageGroupWorkerService.
 *
 * Tests the message group replica running in worker process context,
 * using RaftGroup composition for Raft lifecycle, PeerAddressResolver
 * for peer resolution, and SQLite system cache for CDC replication.
 *
 * @see Requirements 1.2, 1.9, 3.1, 4.1, 4.2
 */

import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import {
  MessageGroupWorkerService,
  MESSAGE_GROUP_WORKER_DEFAULT,
  MESSAGE_GROUP_WORKER_ERROR_MSG,
  CDC_REPLICATION_TYPE,
} from '../../src/worker/message-group-worker-service.js';
import {
  WORKER_ENTITY_TYPE,
  CACHE_MESSAGE_TYPE,
  CDC_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';
import {RAFT_GROUP_ROLE} from '../../src/raft/raft-group-constants.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

/**
 * Create a mock message bridge for tests that call onInitialize
 * directly. In production, ReplicaWorkerBase.initialize() creates
 * the real bridge.
 * @return {Object} Mock message bridge with deliver and send methods.
 */
function createMockMessageBridge() {
  return {
    deliver: mock.fn(async () => ({status: 'ok'})),
    send: mock.fn(async () => ({status: 'ok'})),
    sendFireAndForget: mock.fn(() => {}),
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

/**
 * Create a service with mock bridge injected for tests that call
 * onInitialize directly.
 * @param {Object} mockLogger - Mock logger instance.
 * @param {Object} [extraOpts] - Extra constructor options.
 * @return {MessageGroupWorkerService} Service ready for onInitialize.
 */
function createServiceWithBridge(mockLogger, extraOpts = {}) {
  const svc = new MessageGroupWorkerService({
    nodeId: 'node-1',
    replicaId: 'replica-1',
    groupId: 'group-1',
    addressManager: createMockAddressManager(),
    logger: mockLogger,
    ...extraOpts,
  });
  svc.messageBridge = createMockMessageBridge();
  return svc;
}

/**
 * Create an initialized service ready for testing.
 * @param {Object} mockLogger - Mock logger instance.
 * @param {Object} [extraOpts] - Extra constructor options.
 * @return {Promise<MessageGroupWorkerService>} Initialized service.
 */
async function createInitializedService(
  mockLogger, extraOpts = {},
) {
  const svc = createServiceWithBridge(mockLogger, extraOpts);
  await svc.onInitialize();
  return svc;
}

describe('MessageGroupWorkerService', () => {
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
    it('should throw error if groupId is missing', () => {
      assert.throws(() => {
        new MessageGroupWorkerService({
          nodeId: 'node-1',
          replicaId: 'replica-1',
        });
      }, {
        message: MESSAGE_GROUP_WORKER_ERROR_MSG.MISSING_GROUP_ID,
      });
    });

    it('should create instance with valid options', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      assert.strictEqual(service.groupId, 'group-1');
      assert.strictEqual(
        service.entityType,
        WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      );
      assert.strictEqual(service.nodeId, 'node-1');
      assert.strictEqual(service.replicaId, 'replica-1');
    });

    it('should initialize with default replica IDs', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      assert.deepStrictEqual(service.replicaIds, ['replica-1']);
    });

    it('should use provided replica IDs', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        logger: mockLogger,
      });

      assert.deepStrictEqual(
        service.replicaIds,
        ['replica-1', 'replica-2', 'replica-3'],
      );
    });

    it('should build correct unified address', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      assert.strictEqual(
        service.unifiedAddress,
        'node-1/message-group/replica-1',
      );
    });

    it('should initialize with empty CDC subscriptions', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      assert.strictEqual(service.cdcSubscriptions.size, 0);
      assert.strictEqual(service.cdcSubscribed, false);
      assert.strictEqual(service.isLeaderActivated(), false);
    });
  });

  describe('onInitialize', () => {
    it('should initialize SQLite system cache', async () => {
      service = createServiceWithBridge(mockLogger);
      await service.onInitialize();

      assert.ok(service.systemCache);
      assert.ok(service.systemCache.isInitialized());
    });

    it('should initialize RaftGroup', async () => {
      service = createServiceWithBridge(mockLogger);
      await service.onInitialize();

      assert.ok(service.raftGroup);
      assert.ok(service.logAdapter);
      assert.ok(service.logDb);
    });

    it('should start as follower role', async () => {
      service = createServiceWithBridge(mockLogger, {
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/message-group/replica-1',
          'node-1/message-group/replica-2',
          'node-1/message-group/replica-3',
        ],
      });
      await service.onInitialize();

      assert.strictEqual(
        service.getRole(),
        RAFT_GROUP_ROLE.FOLLOWER,
      );
      assert.strictEqual(service.isLeaderReplica(), false);
      assert.strictEqual(service.isLeaderActivated(), false);
    });

    it('should not be subscribed to CDC initially', async () => {
      service = createServiceWithBridge(mockLogger, {
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/message-group/replica-1',
          'node-1/message-group/replica-2',
          'node-1/message-group/replica-3',
        ],
      });
      await service.onInitialize();

      assert.strictEqual(service.cdcSubscribed, false);
    });

    it('should create PeerAddressResolver', async () => {
      service = createServiceWithBridge(mockLogger);
      await service.onInitialize();

      assert.ok(service.peerAddressResolver);
    });
  });

  describe('onStop', () => {
    it('should close SQLite system cache', async () => {
      service = await createInitializedService(mockLogger);
      const cache = service.systemCache;

      await service.onStop();

      assert.strictEqual(service.systemCache, null);
      assert.strictEqual(cache.isInitialized(), false);
    });

    it('should shutdown RaftGroup', async () => {
      service = await createInitializedService(mockLogger);

      await service.onStop();

      assert.strictEqual(service.raftGroup, null);
      assert.strictEqual(service.logAdapter, null);
      assert.strictEqual(service.logDb, null);
    });

    it('should unsubscribe from CDC if subscribed', async () => {
      service = await createInitializedService(mockLogger);
      service.cdcSubscribed = true;

      await service.onStop();

      assert.strictEqual(service.cdcSubscribed, false);
    });
  });

  describe('subscribeToCDC', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger);
    });

    it('should mark as subscribed', async () => {
      await service.subscribeToCDC();

      assert.strictEqual(service.cdcSubscribed, true);
    });

    it('should be idempotent', async () => {
      await service.subscribeToCDC();
      await service.subscribeToCDC();

      assert.strictEqual(service.cdcSubscribed, true);
    });

    it('should log subscription', async () => {
      await service.subscribeToCDC();

      const infoCalls = mockLogger.info.mock.calls;
      const subscribeCall = infoCalls.find(
        (call) => call.arguments[0].includes('Subscribing'),
      );
      assert.ok(subscribeCall);
    });
  });

  describe('unsubscribeFromCDC', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger);
    });

    it('should mark as unsubscribed', async () => {
      await service.subscribeToCDC();
      await service.unsubscribeFromCDC();

      assert.strictEqual(service.cdcSubscribed, false);
    });

    it('should clear subscriptions', async () => {
      await service.subscribeToCDC();
      service.cdcSubscriptions.add('partition-1');
      service.cdcSubscriptions.add('partition-2');

      await service.unsubscribeFromCDC();

      assert.strictEqual(service.cdcSubscriptions.size, 0);
    });

    it('should be idempotent', async () => {
      await service.unsubscribeFromCDC();
      await service.unsubscribeFromCDC();

      assert.strictEqual(service.cdcSubscribed, false);
    });
  });

  describe('applyCDCEvent', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger);
      service.initialized = true;
      service.isLeaderReplica = () => false;
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      await assert.rejects(
        async () => uninitializedService.applyCDCEvent({
          tableName: 'nodes',
          operation: CDC_OPERATION.INSERT,
          data: {node_id: 'node-1'},
        }),
        {message: MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED},
      );
    });

    it('should apply CDC event to cache as follower', async () => {
      const now = Date.now();
      await service.applyCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.INSERT,
        data: {
          node_id: 'node-1',
          node_address: 'localhost:8080',
          cpu_cores: 4,
          memory_mb: 8192,
          disk_gb: 100,
          status: 'active',
          connection_state: 'connected',
          last_heartbeat: now,
          created_at: now,
        },
      });

      const record = service.systemCache.get('nodes', 'node-1');
      assert.ok(record);
      assert.strictEqual(record.node_id, 'node-1');
      assert.strictEqual(record.node_address, 'localhost:8080');
    });

    it('should handle UPDATE operation', async () => {
      const now = Date.now();
      await service.applyCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.INSERT,
        data: {
          node_id: 'node-1',
          node_address: 'localhost:8080',
          cpu_cores: 4,
          memory_mb: 8192,
          disk_gb: 100,
          status: 'active',
          connection_state: 'connected',
          last_heartbeat: now,
          created_at: now,
        },
      });

      await service.applyCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.UPDATE,
        data: {
          node_id: 'node-1',
          node_address: 'localhost:9090',
        },
      });

      const record = service.systemCache.get('nodes', 'node-1');
      assert.strictEqual(record.node_address, 'localhost:9090');
    });

    it('should handle DELETE operation', async () => {
      const now = Date.now();
      await service.applyCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.INSERT,
        data: {
          node_id: 'node-1',
          node_address: 'localhost:8080',
          cpu_cores: 4,
          memory_mb: 8192,
          disk_gb: 100,
          status: 'active',
          connection_state: 'connected',
          last_heartbeat: now,
          created_at: now,
        },
      });

      await service.applyCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.DELETE,
        data: {node_id: 'node-1'},
      });

      const record = service.systemCache.get('nodes', 'node-1');
      assert.strictEqual(record, undefined);
    });

    it('should apply raw SQL CDC payloads for dynamic tables', async () => {
      service.isLeaderReplica = () => false;

      await service.applyCDCEvent({
        tableName: 'cdc_test_data',
        operation: CDC_OPERATION.INSERT,
        data: {
          sql: 'INSERT INTO "cdc_test_data" (id, value) VALUES (?, ?)',
          params: ['row-1', 'value-1'],
        },
      });

      const rows = service.systemCache.query(
        'SELECT * FROM "cdc_test_data" WHERE id = ?',
        ['row-1'],
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].id, 'row-1');
      assert.strictEqual(rows[0].value, 'value-1');
    });
  });

  describe('replicateCDCEvent', () => {
    it('should wait for committed CDC entry before resolving', async () => {
      service = createServiceWithBridge(mockLogger);
      service.initialized = true;
      service.systemCache = {
        applyCDCEvent: mock.fn(),
        close: mock.fn(),
        isInitialized: mock.fn(() => true),
      };

      const proposedCommands = [];
      service.raftGroup = {
        getRaftInstance: () => ({
          command: (commandStr) => {
            const command = JSON.parse(commandStr);
            proposedCommands.push(command);
            queueMicrotask(() => {
              service.handleCommittedEntry(JSON.stringify(command))
                .catch(() => {});
            });
            return Promise.resolve();
          },
        }),
        shutdown: async () => {},
      };

      const promise = service.replicateCDCEvent({
        tableName: 'nodes',
        operation: CDC_OPERATION.INSERT,
        data: {
          node_id: 'node-1',
          node_address: 'localhost:8080',
        },
      });

      let settled = false;
      promise.then(() => {
        settled = true;
      });

      await new Promise((resolve) => setImmediate(resolve));

      assert.strictEqual(proposedCommands.length, 1);
      assert.strictEqual(
        service.pendingCDCCommits.size,
        0,
        'commit should resolve pending CDC entry',
      );
      assert.strictEqual(settled, true, 'promise should resolve after commit');
    });
  });

  describe('getSystemCache', () => {
    it('should return system cache instance', async () => {
      service = await createInitializedService(mockLogger);

      const cache = service.getSystemCache();

      assert.ok(cache);
      assert.strictEqual(cache, service.systemCache);
    });

    it('should return null before initialization', () => {
      service = new MessageGroupWorkerService({
        nodeId: 'node-1',
        replicaId: 'replica-1',
        groupId: 'group-1',
        logger: mockLogger,
      });

      const cache = service.getSystemCache();

      assert.strictEqual(cache, null);
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger);
      service.initialized = true;
      service.isLeaderReplica = () => false;
    });

    it('should handle CDC_EVENT message type', async () => {
      service.isLeaderReplica = () => true;
      service.applyCDCEvent = mock.fn(async () => {});
      const now = Date.now();
      const response = await service.handleMessage({
        type: CDC_MESSAGE_TYPE.CDC_EVENT,
        cdcEvent: {
          tableName: 'nodes',
          operation: CDC_OPERATION.INSERT,
          data: {
            node_id: 'node-1',
            node_address: 'localhost:8080',
            cpu_cores: 4,
            memory_mb: 8192,
            disk_gb: 100,
            status: 'active',
            connection_state: 'connected',
            last_heartbeat: now,
            created_at: now,
          },
        },
      });

      assert.strictEqual(response.status, 'ok');
      assert.strictEqual(response.replicaId, 'replica-1');
      assert.strictEqual(service.applyCDCEvent.mock.calls.length, 1);
    });

    it('should relay direct CDC_EVENT on follower to leader hint',
      async () => {
        service.getLeaderId = () => 'node-2/message-group/replica-2';
        const now = Date.now();

        const response = await service.handleMessage({
          type: CDC_MESSAGE_TYPE.CDC_EVENT,
          cdcEvent: {
            tableName: 'nodes',
            operation: CDC_OPERATION.INSERT,
            data: {
              node_id: 'node-1',
              node_address: 'localhost:8080',
              cpu_cores: 4,
              memory_mb: 8192,
              disk_gb: 100,
              status: 'active',
              connection_state: 'connected',
              last_heartbeat: now,
              created_at: now,
            },
          },
        });

        assert.strictEqual(response.status, 'ok');
        assert.strictEqual(
          response.leaderAddress,
          'node-2/message-group/replica-2',
        );
        assert.strictEqual(
          service.messageBridge.sendFireAndForget.mock.calls.length,
          1,
        );
        assert.strictEqual(
          service.messageBridge.sendFireAndForget.mock.calls[0].arguments[0],
          'node-2/message-group/replica-2',
        );

        const record = service.systemCache.get('nodes', 'node-1');
        assert.strictEqual(record, undefined);
      });

    it('should delegate unknown message types to base class',
      async () => {
        const response = await service.handleMessage({
          type: 'UNKNOWN',
          data: {},
        });

        assert.strictEqual(response.status, 'ok');
        assert.strictEqual(response.replicaId, 'replica-1');
      });

    it('should return structured CACHE_QUERY errors for missing tables',
      async () => {
        const response = await service.handleMessage({
          type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
          sql: 'SELECT * FROM "missing_table"',
          params: [],
        });

        assert.deepStrictEqual(response.rows, []);
        assert.ok(response.error.includes('no such table'));
      });
  });

  describe('handleRaftPacket', () => {
    it('should return not initialized when raftGroup is null',
      () => {
        service = new MessageGroupWorkerService({
          nodeId: 'node-1',
          replicaId: 'replica-1',
          groupId: 'group-1',
          logger: mockLogger,
        });

        const result = service.handleRaftPacket({
          type: 'vote',
          term: 1,
          address: 'node-2/message-group/replica-2',
        });

        assert.strictEqual(result.acknowledged, false);
        assert.strictEqual(
          result.error,
          MESSAGE_GROUP_WORKER_ERROR_MSG.NOT_INITIALIZED,
        );
      });

    it('should delegate to RaftGroup when initialized',
      async () => {
        service = await createInitializedService(mockLogger);

        // Use append type which doesn't trigger async responses
        const result = service.handleRaftPacket({
          type: 'appended',
          term: 1,
          address: 'node-2/message-group/replica-2',
        });

        assert.strictEqual(result.acknowledged, true);
      });
  });

  describe('getters', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger, {
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/message-group/replica-1',
          'node-2/message-group/replica-2',
          'node-3/message-group/replica-3',
        ],
      });
    });

    it('should return group ID', () => {
      assert.strictEqual(service.getGroupId(), 'group-1');
    });

    it('should return role via RaftGroup', () => {
      assert.strictEqual(
        service.getRole(),
        RAFT_GROUP_ROLE.FOLLOWER,
      );
    });

    it('should return isLeaderReplica via RaftGroup', () => {
      assert.strictEqual(service.isLeaderReplica(), false);
    });

    it('should return leader ID via RaftGroup', () => {
      assert.strictEqual(service.getLeaderId(), null);
    });

    it('should return current term via RaftGroup', () => {
      const term = service.getCurrentTerm();
      assert.strictEqual(typeof term, 'number');
    });

    it('should return CDC subscribed status', () => {
      assert.strictEqual(service.isCDCSubscribed(), false);
    });

    it('should return leader activation status', () => {
      assert.strictEqual(service.isLeaderActivated(), false);
    });

    it('should return CDC subscription count', () => {
      assert.strictEqual(service.getCDCSubscriptionCount(), 0);
    });

    it('should return RaftGroup instance', () => {
      assert.ok(service.getRaftGroup());
      assert.strictEqual(
        service.getRaftGroup(),
        service.raftGroup,
      );
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      service = await createInitializedService(mockLogger, {
        replicaIds: ['replica-1', 'replica-2', 'replica-3'],
        peerAddresses: [
          'node-1/message-group/replica-1',
          'node-2/message-group/replica-2',
          'node-3/message-group/replica-3',
        ],
      });
    });

    it('should return comprehensive stats', () => {
      const stats = service.getStats();

      assert.strictEqual(stats.groupId, 'group-1');
      assert.strictEqual(stats.role, RAFT_GROUP_ROLE.FOLLOWER);
      assert.strictEqual(stats.isLeader, false);
      assert.strictEqual(stats.leaderActivated, false);
      assert.strictEqual(stats.leaderId, null);
      assert.strictEqual(typeof stats.term, 'number');
      assert.strictEqual(stats.cdcSubscribed, false);
      assert.strictEqual(stats.cdcSubscriptionCount, 0);
      assert.strictEqual(stats.replicaCount, 3);
      assert.strictEqual(stats.replicaId, 'replica-1');
      assert.strictEqual(
        stats.entityType,
        WORKER_ENTITY_TYPE.MESSAGE_GROUP,
      );
      assert.strictEqual(stats.nodeId, 'node-1');
      assert.strictEqual(
        stats.unifiedAddress,
        'node-1/message-group/replica-1',
      );
      assert.ok(stats.cacheStats);
      assert.strictEqual(stats.cacheStats.initialized, true);
    });
  });

  describe('CDC_REPLICATION_TYPE constant', () => {
    it('should be exported', () => {
      assert.strictEqual(CDC_REPLICATION_TYPE, 'CDC_REPLICATION');
    });
  });

  describe('MESSAGE_GROUP_WORKER_DEFAULT constants', () => {
    it('should have heartbeat configuration', () => {
      assert.strictEqual(
        typeof MESSAGE_GROUP_WORKER_DEFAULT.HEARTBEAT_MS,
        'number',
      );
      assert.ok(MESSAGE_GROUP_WORKER_DEFAULT.HEARTBEAT_MS > 0);
    });

    it('should have election timeout configuration', () => {
      assert.strictEqual(
        typeof MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MIN_MS,
        'number',
      );
      assert.strictEqual(
        typeof MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MAX_MS,
        'number',
      );
      assert.ok(
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MIN_MS > 0,
      );
      assert.ok(
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MAX_MS >
        MESSAGE_GROUP_WORKER_DEFAULT.ELECTION_MIN_MS,
      );
    });

    it('should have election jitter configuration', () => {
      assert.strictEqual(
        typeof MESSAGE_GROUP_WORKER_DEFAULT
          .ELECTION_JITTER_PER_REPLICA_MS,
        'number',
      );
    });
  });
});
