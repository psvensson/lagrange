/**
 * Property Test: Lifecycle Message Delegation
 * **Property 11: Lifecycle Message Delegation**
 * **Validates: Requirements 4.3, 4.4, 4.5**
 *
 * *For any* CREATE_REPLICA or REMOVE_REPLICA message received by the lifecycle
 * handler, the message SHALL be delegated to the corresponding
 * ReplicaLifecycleManager method and the ACK SHALL be returned.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EventEmitter} from 'events';
import {
  ReplicaLifecycleManager,
  MessageType,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock system table cache.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache() {
  const tables = new Map();
  return {
    filter: (tableName, predicate) => {
      const table = tables.get(tableName) || new Map();
      return Array.from(table.values()).filter(predicate);
    },
    get: (tableName, key) => {
      const table = tables.get(tableName) || new Map();
      return table.get(key) || null;
    },
    set: (tableName, key, value) => {
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      tables.get(tableName).set(key, value);
    },
    applySystemTableChange: (tableName, operation, data) => {
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      const table = tables.get(tableName);
      if (operation === 'INSERT' || operation === 'UPDATE') {
        const key = data.service_id || data.partition_id || data.table_id || data.node_id;
        if (key) {
          table.set(key, data);
        }
      } else if (operation === 'DELETE') {
        const key = data.service_id || data.partition_id || data.table_id || data.node_id;
        if (key) {
          table.delete(key);
        }
      }
    },
  };
}

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const operations = [];
  return {
    operations,
    async insertSystemTableRow(_tableName, _data) {
      operations.push({type: 'insert'});
      return {success: true};
    },
    async updateSystemTableRow(_tableName, _whereClause, _data) {
      operations.push({type: 'update'});
      return {success: true};
    },
    async upsertSystemTableRow(_tableName, _data) {
      operations.push({type: 'upsert'});
      return {success: true};
    },
    async deleteSystemTableRow(_tableName, _whereClause) {
      operations.push({type: 'delete'});
      return {success: true};
    },
    reset() {
      operations.length = 0;
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Object} Factory and tracking.
 */
function createMockPartitionServiceFactory() {
  const createdServices = [];
  return {
    factory: async (options) => {
      createdServices.push(options);
      return {
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        initialized: true,
        async shutdown() {},
        async syncFromLeader() {},
      };
    },
    createdServices,
  };
}

/**
 * Create a lifecycle handler function that delegates to ReplicaLifecycleManager.
 * This mirrors the implementation in BootstrapService.initializeReplicaLifecycleManager().
 * @param {ReplicaLifecycleManager} lifecycleManager - The lifecycle manager.
 * @param {EventEmitter} messageGroupService - Mock message group service for ACK events.
 * @return {Function} Lifecycle handler function.
 */
function createLifecycleHandler(lifecycleManager, messageGroupService) {
  return async (envelope) => {
    const message = envelope.payload || envelope;
    if (message.type === 'CREATE_REPLICA') {
      const ack = await lifecycleManager.handleCreateReplica(message);
      if (messageGroupService) {
        messageGroupService.emit('CREATE_REPLICA_ACK', ack);
      }
      // Flat structure: spread ACK fields directly into response
      return {acknowledged: true, ...ack};
    } else if (message.type === 'REMOVE_REPLICA') {
      const ack = await lifecycleManager.handleRemoveReplica(message);
      if (messageGroupService) {
        messageGroupService.emit('REMOVE_REPLICA_ACK', ack);
      }
      // Flat structure: spread ACK fields directly into response
      return {acknowledged: true, ...ack};
    }
    return {acknowledged: false, error: 'Unknown message type'};
  };
}

test('Property 11: Lifecycle Message Delegation', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any CREATE_REPLICA message, the handler delegates to
   * handleCreateReplica and returns an ACK.
   */
  t.test('CREATE_REPLICA messages are delegated and return ACK', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 30}), // table_name
        async (requestId, partitionId, replicaId, tableName) => {
          const nodeId = 'test-node';
          const messageGroupService = new EventEmitter();
          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
          });
          manager.initialize();

          const handler = createLifecycleHandler(manager, messageGroupService);

          // Track ACK event emission
          let ackEmitted = false;
          let emittedAck = null;
          messageGroupService.once('CREATE_REPLICA_ACK', (ack) => {
            ackEmitted = true;
            emittedAck = ack;
          });

          const message = {
            type: 'CREATE_REPLICA',
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: tableName,
          };

          const result = await handler(message);

          await manager.shutdown();

          // Invariants:
          // 1. Handler returns acknowledged: true
          // 2. Result contains ACK fields directly (flat structure)
          // 3. ACK event was emitted
          // 4. ACK has valid status (initiated or already_exists)
          return result.acknowledged === true &&
            result.request_id === requestId &&
            result.type === MessageType.CREATE_REPLICA_ACK &&
            ackEmitted === true &&
            emittedAck !== null &&
            emittedAck.request_id === requestId &&
            (result.status === AckStatus.INITIATED ||
             result.status === AckStatus.ALREADY_EXISTS);
        },
      ),
      {numRuns: 10},
    );

    t.pass('CREATE_REPLICA messages are delegated and return ACK');
  });

  /**
   * Property: For any REMOVE_REPLICA message with existing replica,
   * the handler delegates to handleRemoveReplica and returns ACK.
   */
  t.test('REMOVE_REPLICA messages for existing replicas return initiated ACK', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 30}), // table_name
        async (requestId, partitionId, replicaId, tableName) => {
          const nodeId = 'test-node';
          const messageGroupService = new EventEmitter();
          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
          });
          manager.initialize();

          // First seed the cache with the replica so it exists
          mockCache.applySystemTableChange('services', 'INSERT', {
            service_id: replicaId,
            service_type: 'partition',
            partition_id: partitionId,
            node_id: nodeId,
            raft_role: 'follower',
            status: 'active',
            address: `${nodeId}/partition/${replicaId}`,
            created_at: Date.now(),
            updated_at: Date.now(),
          });

          // Then register the replica with the manager
          manager.registerExistingReplica({
            replicaId,
            partitionId,
            tableName,
            status: 'active',
          });

          const handler = createLifecycleHandler(manager, messageGroupService);

          // Track ACK event emission
          let ackEmitted = false;
          let emittedAck = null;
          messageGroupService.once('REMOVE_REPLICA_ACK', (ack) => {
            ackEmitted = true;
            emittedAck = ack;
          });

          const message = {
            type: 'REMOVE_REPLICA',
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const result = await handler(message);

          await manager.shutdown();

          // Invariants:
          // 1. Handler returns acknowledged: true
          // 2. Result contains ACK fields directly (flat structure)
          // 3. ACK event was emitted
          // 4. ACK status is 'initiated' for existing replica
          return result.acknowledged === true &&
            result.request_id === requestId &&
            result.type === MessageType.REMOVE_REPLICA_ACK &&
            ackEmitted === true &&
            emittedAck !== null &&
            emittedAck.request_id === requestId &&
            result.status === AckStatus.INITIATED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA messages for existing replicas return initiated ACK');
  });

  /**
   * Property: For any REMOVE_REPLICA message with non-existing replica,
   * the handler returns not_found ACK.
   */
  t.test('REMOVE_REPLICA messages for non-existing replicas return not_found ACK', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id (not registered)
        async (requestId, partitionId, replicaId) => {
          const nodeId = 'test-node';
          const messageGroupService = new EventEmitter();
          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
          });
          manager.initialize();

          // Do NOT register the replica - it should not exist

          const handler = createLifecycleHandler(manager, messageGroupService);

          // Track ACK event emission
          let ackEmitted = false;
          messageGroupService.once('REMOVE_REPLICA_ACK', (_ack) => {
            ackEmitted = true;
          });

          const message = {
            type: 'REMOVE_REPLICA',
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const result = await handler(message);

          await manager.shutdown();

          // Invariants:
          // 1. Handler returns acknowledged: true
          // 2. ACK status is 'not_found' for non-existing replica (flat structure)
          // 3. ACK event was still emitted
          return result.acknowledged === true &&
            result.request_id === requestId &&
            result.status === AckStatus.NOT_FOUND &&
            ackEmitted === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA messages for non-existing replicas return not_found ACK');
  });

  /**
   * Property: For any unknown message type, the handler returns
   * acknowledged: false with error.
   */
  t.test('unknown message types return acknowledged false', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 30}).filter(
          (s) => s !== 'CREATE_REPLICA' && s !== 'REMOVE_REPLICA',
        ), // unknown type
        fc.uuid(), // request_id
        async (unknownType, requestId) => {
          const nodeId = 'test-node';
          const messageGroupService = new EventEmitter();
          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
          });
          manager.initialize();

          const handler = createLifecycleHandler(manager, messageGroupService);

          const message = {
            type: unknownType,
            request_id: requestId,
          };

          const result = await handler(message);

          await manager.shutdown();

          // Invariant: unknown types return acknowledged: false with error
          return result.acknowledged === false &&
            result.error === 'Unknown message type';
        },
      ),
      {numRuns: 10},
    );

    t.pass('unknown message types return acknowledged false');
  });

  /**
   * Property: Messages wrapped in envelope.payload are correctly extracted.
   */
  t.test('messages in envelope.payload are correctly extracted', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 30}), // table_name
        async (requestId, partitionId, replicaId, tableName) => {
          const nodeId = 'test-node';
          const messageGroupService = new EventEmitter();
          const mockCache = createMockSystemTableCache();
          const mockCDC = createMockCDCService();
          const {factory} = createMockPartitionServiceFactory();

          const manager = new ReplicaLifecycleManager({
            nodeId,
            dataDir: '/tmp/test-lifecycle',
            systemTableCache: mockCache,
            cdcIntegrationService: mockCDC,
            createPartitionService: factory,
          });
          manager.initialize();

          const handler = createLifecycleHandler(manager, messageGroupService);

          // Wrap message in envelope with payload
          const envelope = {
            payload: {
              type: 'CREATE_REPLICA',
              request_id: requestId,
              partition_id: partitionId,
              replica_id: replicaId,
              table_name: tableName,
            },
          };

          const result = await handler(envelope);

          await manager.shutdown();

          // Invariant: message is extracted from payload and processed (flat structure)
          return result.acknowledged === true &&
            result.request_id === requestId &&
            result.type === MessageType.CREATE_REPLICA_ACK;
        },
      ),
      {numRuns: 10},
    );

    t.pass('messages in envelope.payload are correctly extracted');
  });
});
