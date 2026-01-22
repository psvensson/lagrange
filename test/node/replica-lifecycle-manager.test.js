/**
 * Unit tests for ReplicaLifecycleManager.
 * Tests CREATE_REPLICA and REMOVE_REPLICA message handling.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9,
 *               10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16,
 *               10.17, 10.18, 10.19, 10.26, 10.27, 10.28, 10.29
 */

import {test} from 'tap';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
  VALID_STATUS_TRANSITIONS,
  MessageType,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas.js';
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
    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      dataDir: tempDir,
    });

    t.equal(manager.isInitialized(), false, 'not initialized before init');

    manager.initialize();

    t.equal(manager.isInitialized(), true, 'initialized after init');
    t.equal(manager.nodeId, 'test-node', 'node ID set correctly');

    manager.shutdown();
    t.equal(manager.isInitialized(), false, 'not initialized after shutdown');
  });

  t.test('initializes with message group service', async (t) => {
    const mockMsgService = createMockMessageGroupService();

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      messageGroupService: mockMsgService,
      dataDir: tempDir,
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
    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      dataDir: tempDir,
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

    // Check pending operation was tracked
    const pending = manager.getPendingOperation('req-1');
    t.ok(pending, 'pending operation tracked');
    t.equal(pending.type, MessageType.CREATE_REPLICA, 'correct operation type');
    t.equal(pending.partition_id, 'partition-1', 'partition_id tracked');

    // Wait for async creation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    manager.shutdown();
  });

  t.test('handleRemoveReplica - returns not_found for missing replica', async (t) => {
    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
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

    // Check pending operation was tracked
    const pending = manager.getPendingOperation('req-1');
    t.ok(pending, 'pending operation tracked');
    t.equal(pending.type, MessageType.REMOVE_REPLICA, 'correct operation type');
    t.equal(pending.reason, 'rebalancing', 'reason tracked');

    // Wait for async removal to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    manager.shutdown();
  });

  t.test('node recovery - cleans up orphaned replicas', async (t) => {
    const mockCDC = createMockCDCService();
    const mockCache = createMockCache({
      services: [
        {
          service_id: 'replica-starting',
          node_id: 'test-node',
          partition_id: 'partition-1',
          service_type: 'partition',
          status: ReplicaStatus.STARTING,
        },
        {
          service_id: 'replica-syncing',
          node_id: 'test-node',
          partition_id: 'partition-2',
          service_type: 'partition',
          status: ReplicaStatus.SYNCING,
        },
        {
          service_id: 'replica-stopping',
          node_id: 'test-node',
          partition_id: 'partition-3',
          service_type: 'partition',
          status: ReplicaStatus.STOPPING,
        },
        {
          service_id: 'replica-active',
          node_id: 'test-node',
          partition_id: 'partition-4',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCDC,
      dataDir: tempDir,
    });

    manager.initialize();

    await manager.handleNodeRecovery();

    // Check that starting/syncing replicas were marked as failed
    const failedUpdates = mockCDC.operations.filter(
      (op) =>
        op.type === 'update' &&
        op.tableName === SystemTableName.SERVICES &&
        op.data.status === ReplicaStatus.FAILED,
    );
    t.equal(failedUpdates.length, 2, 'two replicas marked as failed');

    // Check that stopping replica was completed
    const stoppedUpdates = mockCDC.operations.filter(
      (op) =>
        op.type === 'update' &&
        op.tableName === SystemTableName.SERVICES &&
        op.data.status === ReplicaStatus.STOPPED,
    );
    t.equal(stoppedUpdates.length, 1, 'one replica marked as stopped');

    // Check that stopping replica was deleted
    const deletes = mockCDC.operations.filter(
      (op) =>
        op.type === 'delete' &&
        op.tableName === SystemTableName.SERVICES,
    );
    t.equal(deletes.length, 1, 'one replica deleted');

    manager.shutdown();
  });

  t.test('getStats returns correct statistics', async (t) => {
    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
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
    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
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

  t.test('emits events during lifecycle operations', async (t) => {
    const mockCDC = createMockCDCService();
    const events = [];

    const manager = new ReplicaLifecycleManager({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    manager.on('statusChanged', (e) => events.push({type: 'statusChanged', ...e}));
    manager.on('replicaCreated', (e) => events.push({type: 'replicaCreated', ...e}));
    manager.on('replicaRemoved', (e) => events.push({type: 'replicaRemoved', ...e}));

    manager.initialize();

    // Create a replica
    const createMsg = {
      request_id: 'req-1',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      table_name: 'test_table',
      table_id: 'table-1',
    };

    await manager.handleCreateReplica(createMsg);

    // Wait for async creation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check events were emitted
    const statusEvents = events.filter((e) => e.type === 'statusChanged');
    t.ok(statusEvents.length >= 2, 'status change events emitted');

    const createdEvents = events.filter((e) => e.type === 'replicaCreated');
    t.equal(createdEvents.length, 1, 'replicaCreated event emitted');

    manager.shutdown();
  });
});
