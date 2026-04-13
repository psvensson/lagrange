/**
 * Unit tests for ReplicaLifecycleManager.
 * Tests CREATE_REPLICA and REMOVE_REPLICA message handling.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9,
 *               10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16,
 *               10.17, 10.18, 10.19, 10.26, 10.27, 10.28, 10.29
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
  MessageType,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true, operation: 'UPDATE', tableName, whereClause, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
    reset() {
      operations.length = 0;
    },
  };
}

/**
 * Create a mock system table cache.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock cache.
 */
function createMockCache(data = {}) {
  const cache = {
    services: data.services || [],
    nodes: data.nodes || [],
  };

  return {
    filter(tableName, predicate) {
      const items = cache[tableName] || [];
      return items.filter(predicate);
    },
    get(tableName, id) {
      const items = cache[tableName] || [];
      return items.find((item) => item.service_id === id || item.node_id === id);
    },
    setServices(services) {
      cache.services = services;
    },
  };
}

/**
 * Create a mock message group service.
 * @return {Object} Mock message group service.
 */
function createMockMessageGroupService() {
  const handlers = new Map();

  return {
    handlers,
    registerHandler(type, handler) {
      handlers.set(type, handler);
    },
    getHandler(type) {
      return handlers.get(type);
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => {
    return {
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      initialized: true,
      async shutdown() {},
      async syncFromLeader() {},
    };
  };
}

test('ReplicaLifecycleManager', async (t) => {
  let tempDir;

  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-test-'));
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  t.test('initialization', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: createMockCache(),
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    t.equal(manager.isInitialized(), false, 'not initialized before init');

    manager.initialize();

    t.equal(manager.isInitialized(), true, 'initialized after init');
    t.equal(manager.nodeId, 'test-node', 'node ID set correctly');

    await manager.shutdown();
    t.equal(manager.isInitialized(), false, 'not initialized after shutdown');
  });

  t.test('shutdown cascades to the delegated replica handler once', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: createMockCache(),
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    let shutdownCalls = 0;
    manager.replicaHandler.shutdown = async () => {
      shutdownCalls += 1;
    };

    manager.initialize();

    await manager.shutdown();
    await manager.shutdown();

    t.equal(shutdownCalls, 1, 'delegated handler shutdown should be idempotent');
    t.equal(manager.isInitialized(), false, 'manager should be marked uninitialized');
  });

  t.test('initializes with message group service', async (t) => {
    const mockMsgService = createMockMessageGroupService();
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      messageGroupService: mockMsgService,
      dataDir: tempDir,
      systemTableCache: createMockCache(),
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    manager.initialize();

    // Message handlers are now registered via transport at ${nodeId}/lifecycle
    // instead of directly with the message group service.
    // The ReplicaLifecycleManager just needs to be initialized.
    t.ok(manager.isInitialized(), 'manager should be initialized');
    t.equal(manager.nodeId, 'test-node', 'node ID should be set');

    manager.shutdown();
  });

  t.test('status transition validation', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: createMockCache(),
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    // Valid transitions
    t.ok(
      manager.isValidTransition(ReplicaStatus.STARTING, ReplicaStatus.SYNCING),
      'starting -> syncing is valid',
    );
    t.ok(
      manager.isValidTransition(ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE),
      'syncing -> active is valid',
    );
    t.ok(
      manager.isValidTransition(ReplicaStatus.ACTIVE, ReplicaStatus.STOPPING),
      'active -> stopping is valid',
    );
    t.ok(
      manager.isValidTransition(ReplicaStatus.STOPPING, ReplicaStatus.STOPPED),
      'stopping -> stopped is valid',
    );

    // Any state can transition to FAILED
    t.ok(
      manager.isValidTransition(ReplicaStatus.STARTING, ReplicaStatus.FAILED),
      'starting -> failed is valid',
    );
    t.ok(
      manager.isValidTransition(ReplicaStatus.ACTIVE, ReplicaStatus.FAILED),
      'active -> failed is valid',
    );

    // Invalid transitions
    t.notOk(
      manager.isValidTransition(ReplicaStatus.STARTING, ReplicaStatus.ACTIVE),
      'starting -> active is invalid (must go through syncing)',
    );
    t.notOk(
      manager.isValidTransition(ReplicaStatus.ACTIVE, ReplicaStatus.STARTING),
      'active -> starting is invalid',
    );
    t.notOk(
      manager.isValidTransition(ReplicaStatus.STOPPED, ReplicaStatus.ACTIVE),
      'stopped -> active is invalid (terminal state)',
    );
  });


  t.test('handleCreateReplica - returns already_exists for duplicate', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    // Pre-populate local replica
    manager.localReplicas.set('replica-1', {
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      status: ReplicaStatus.ACTIVE,
    });

    const message = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      table_name: 'test_table',
    };

    const ack = await manager.handleCreateReplica(message);

    t.equal(ack.type, MessageType.CREATE_REPLICA_ACK, 'correct ACK type');
    t.equal(ack.status, AckStatus.ALREADY_EXISTS, 'status is already_exists');
    t.equal(ack.replica_id, 'replica-1', 'replica_id in ACK');
    t.equal(ack.request_id, 'req-1', 'request_id in ACK');

    manager.shutdown();
  });

  t.test('handleCreateReplica - returns initiated for new replica', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    const message = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      table_name: 'test_table',
      table_id: 'table-1',
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    };

    const ack = await manager.handleCreateReplica(message);

    t.equal(ack.type, MessageType.CREATE_REPLICA_ACK, 'correct ACK type');
    t.equal(ack.status, AckStatus.INITIATED, 'status is initiated');
    t.equal(ack.replica_id, 'replica-1', 'replica_id in ACK');
    t.equal(ack.node_id, 'test-node', 'node_id in ACK');

    // Note: pending operations are now tracked by ReplicaHandler, not lifecycle manager
    // The ACK confirms the operation was initiated

    manager.shutdown();
  });

  t.test('handleRemoveReplica - returns not_found for missing replica', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    const message = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'nonexistent-replica',
      reason: 'rebalancing',
    };

    const ack = await manager.handleRemoveReplica(message);

    t.equal(ack.type, MessageType.REMOVE_REPLICA_ACK, 'correct ACK type');
    t.equal(ack.status, AckStatus.NOT_FOUND, 'status is not_found');
    t.equal(ack.replica_id, 'nonexistent-replica', 'replica_id in ACK');

    manager.shutdown();
  });

  t.test('handleRemoveReplica - returns initiated for existing replica', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    // Pre-populate local replica
    manager.localReplicas.set('replica-1', {
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      status: ReplicaStatus.ACTIVE,
      service: {
        async shutdown() {},
      },
    });

    const message = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      reason: 'rebalancing',
    };

    const ack = await manager.handleRemoveReplica(message);

    t.equal(ack.type, MessageType.REMOVE_REPLICA_ACK, 'correct ACK type');
    t.equal(ack.status, AckStatus.INITIATED, 'status is initiated');
    t.equal(ack.replica_id, 'replica-1', 'replica_id in ACK');

    manager.shutdown();
  });

  t.test('node recovery - queries services in transitional states', async (t) => {
    const mockCDC = createMockCDCService();
    let filterCalled = false;
    let filterPredicate = null;

    const mockCache = {
      filter(tableName, predicate) {
        filterCalled = true;
        filterPredicate = predicate;
        // Return empty array to avoid cleanup issues
        return [];
      },
      get(_tableName, _id) {
        return null;
      },
    };

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    await manager.handleNodeRecovery();

    // Verify that filter was called to query services
    t.ok(filterCalled, 'filter was called on system table cache');

    // Verify the predicate filters correctly
    if (filterPredicate) {
      // Should match starting replicas on this node
      t.ok(
        filterPredicate({
          node_id: 'test-node',
          service_type: 'partition',
          status: ReplicaStatus.STARTING,
        }),
        'predicate matches starting replicas',
      );

      // Should not match active replicas
      t.notOk(
        filterPredicate({
          node_id: 'test-node',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        }),
        'predicate does not match active replicas',
      );

      // Should not match replicas on other nodes
      t.notOk(
        filterPredicate({
          node_id: 'other-node',
          service_type: 'partition',
          status: ReplicaStatus.STARTING,
        }),
        'predicate does not match other nodes',
      );
    }

    manager.shutdown();
  });

  t.test('node recovery - skips stale cleanup when guarded replica update misses',
    async (t) => {
      const mockCDC = {
        operations: [],
        async updateSystemTableRow(tableName, whereClause, data) {
          this.operations.push({type: 'update', tableName, whereClause, data});
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
        async deleteSystemTableRow() {
          t.fail('guard miss should not delete stale replica rows');
        },
      };
      const staleService = {
        service_id: 'replica-1',
        partition_id: 'partition-1',
        node_id: 'test-node',
        service_type: 'partition',
        status: ReplicaStatus.STARTING,
        updated_at: 12345,
      };
      const mockCache = createMockCache({
        services: [staleService],
      });

      const manager = new ReplicaLifecycleManager({
        nodeId: 'test-node',
        systemTableCache: mockCache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      manager.initialize();

      let cleanupCalls = 0;
      manager.cleanupReplicaResources = async () => {
        cleanupCalls += 1;
      };

      await manager.handleNodeRecovery();

      t.equal(cleanupCalls, 0,
        'guard miss should not clean up potentially fresh replica resources');
      t.same(
        mockCDC.operations[0]?.whereClause,
        {
          service_id: 'replica-1',
          node_id: 'test-node',
          status: ReplicaStatus.STARTING,
          updated_at: 12345,
        },
        'recovery guard should target the observed replica snapshot',
      );

      manager.shutdown();
    });

  t.test('getStats returns correct statistics', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    // Add some local replicas
    manager.localReplicas.set('replica-1', {status: ReplicaStatus.ACTIVE});
    manager.localReplicas.set('replica-2', {status: ReplicaStatus.ACTIVE});

    // Add pending operation
    manager.pendingOperations.set('req-1', {type: 'CREATE_REPLICA'});

    const stats = manager.getStats();

    t.equal(stats.nodeId, 'test-node', 'correct node ID');
    t.equal(stats.initialized, true, 'initialized flag correct');
    t.equal(stats.localReplicaCount, 2, 'correct local replica count');
    t.equal(stats.pendingOperationCount, 1, 'correct pending operation count');

    manager.shutdown();
  });

  t.test('cleanupExpiredOperations removes old completed operations', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    // Add old completed operation
    manager.pendingOperations.set('old-req', {
      type: 'CREATE_REPLICA',
      startedAt: Date.now() - 400000, // 400 seconds ago
      status: 'completed',
    });

    // Add recent completed operation
    manager.pendingOperations.set('recent-req', {
      type: 'CREATE_REPLICA',
      startedAt: Date.now() - 1000, // 1 second ago
      status: 'completed',
    });

    // Add pending operation
    manager.pendingOperations.set('pending-req', {
      type: 'CREATE_REPLICA',
      startedAt: Date.now() - 400000, // 400 seconds ago
      status: 'pending',
    });

    manager.cleanupExpiredOperations(300000); // 5 minute max age

    t.notOk(
      manager.pendingOperations.has('old-req'),
      'old completed operation removed',
    );
    t.ok(
      manager.pendingOperations.has('recent-req'),
      'recent completed operation kept',
    );
    t.ok(
      manager.pendingOperations.has('pending-req'),
      'pending operation kept (not completed)',
    );

    manager.shutdown();
  });

  t.test('handleCreateReplica returns correct ACK structure', async (t) => {
    const mockCDC = createMockCDCService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: createMockCache(),
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.initialize();

    // Create a replica
    const createMsg = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      table_name: 'test_table',
      table_id: 'table-1',
    };

    const ack = await manager.handleCreateReplica(createMsg);

    // Verify ACK structure
    t.equal(ack.type, MessageType.CREATE_REPLICA_ACK, 'correct ACK type');
    t.equal(ack.request_id, 'req-1', 'request_id in ACK');
    t.equal(ack.replica_id, 'replica-1', 'replica_id in ACK');
    t.equal(ack.node_id, 'test-node', 'node_id in ACK');
    t.ok(
      ack.status === AckStatus.INITIATED || ack.status === AckStatus.ALREADY_EXISTS,
      'status is initiated or already_exists',
    );

    manager.shutdown();
  });
});
