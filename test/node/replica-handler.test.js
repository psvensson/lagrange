/**
 * Unit tests for ReplicaHandler.
 * Tests CREATE_REPLICA and REMOVE_REPLICA request handling.
 * Requirements: 10.2, 3.1
 */

import {test} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

/**
 * Create a mock CDC integration service.
 * @param {SystemTableCache} [cache] - Optional cache to update.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache) {
  const operations = [];

  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      operations.push({type: 'update', tableName, whereClause, data: merged});
      cache?.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      cache?.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true, operation: 'DELETE', tableName, whereClause};
    },
    reset() {
      operations.length = 0;
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

/**
 * Seed a system table cache with table/partition/service rows.
 * @param {Object} options - Seed options.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache(options = {}) {
  const cache = new SystemTableCache();
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'test_table';
  const partitionId = options.partitionId || 'partition-1';
  const leaderNodeId = options.leaderNodeId || 'leader-node';
  const leaderReplicaId = options.leaderReplicaId || 'leader-replica';
  const schema = options.schema || {
    columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
  };

  cache.applySystemTableChange(SystemTableName.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(schema),
  });

  cache.applySystemTableChange(SystemTableName.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: leaderNodeId,
  });

  cache.applySystemTableChange(SystemTableName.SERVICES, 'INSERT', {
    service_id: leaderReplicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: leaderNodeId,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address: `${leaderNodeId}/partition/${leaderReplicaId}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  return cache;
}

/**
 * Seed a replica operation row.
 * @param {SystemTableCache} cache - Cache to update.
 * @param {string} operationId - Operation ID.
 * @param {Object} overrides - Field overrides.
 */
function seedReplicaOperation(cache, operationId, overrides = {}) {
  const now = Date.now();
  cache.applySystemTableChange(SystemTableName.REPLICA_OPERATIONS, 'INSERT', {
    operation_id: operationId,
    type: overrides.type || 'ADD',
    partition_id: overrides.partitionId || 'partition-1',
    replica_id: overrides.replicaId || 'replica-1',
    source_node_id: overrides.sourceNodeId || 'seed-node',
    target_node_id: overrides.targetNodeId || 'test-node',
    status: ReplicaStatus.PENDING,
    workflow_step: 'PENDING',
    created_at: now,
    updated_at: now,
    steps_history: '[]',
    ...overrides,
  });
}

/**
 * Wait for a replica event or failure.
 * @param {ReplicaHandler} handler - Replica handler.
 * @param {string} successEvent - Success event name.
 * @param {string} failureEvent - Failure event name.
 * @return {Promise<Object>} Event payload.
 */
function waitForReplicaEvent(handler, successEvent, failureEvent) {
  return new Promise((resolve, reject) => {
    handler.once(successEvent, resolve);
    handler.once(failureEvent, (event) => {
      reject(new Error(event?.error || 'operation failed'));
    });
  });
}

test('ReplicaHandler', async (t) => {
  let tempDir;

  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-handler-test-'));
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  t.test('initialization', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    t.equal(handler.initialized, false, 'not initialized before init');

    handler.initialize();

    t.equal(handler.initialized, true, 'initialized after init');
    t.equal(handler.nodeId, 'test-node', 'node ID set correctly');

    handler.shutdown();
    t.equal(handler.initialized, false, 'not initialized after shutdown');
  });

  t.test('handleMessage routes to correct handler', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Test CREATE_REPLICA routing
    const createEnvelope = {
      correlationId: 'corr-1',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      },
    };

    const createResponse = await handler.handleMessage(createEnvelope);
    t.equal(createResponse.correlationId, 'corr-1', 'correlationId preserved');
    t.equal(createResponse.status, ReplicaOperationResponseStatus.INITIATED,
      'create initiated');

    await created;

    // Test REMOVE_REPLICA routing for non-existent replica
    const removeEnvelope = {
      correlationId: 'corr-2',
      payload: {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        operationId: 'op-2',
        partitionId: 'partition-1',
        replicaId: 'nonexistent',
      },
    };

    const removeResponse = await handler.handleMessage(removeEnvelope);
    t.equal(removeResponse.correlationId, 'corr-2', 'correlationId preserved');
    t.equal(removeResponse.status, ReplicaOperationResponseStatus.NOT_FOUND,
      'not found');

    // Test unknown message type
    const unknownEnvelope = {
      correlationId: 'corr-3',
      payload: {
        type: 'UNKNOWN_TYPE',
      },
    };

    const unknownResponse = await handler.handleMessage(unknownEnvelope);
    t.equal(unknownResponse.status, ReplicaOperationResponseStatus.ERROR,
      'error for unknown');

    handler.shutdown();
  });

  t.test('handleCreateReplica - returns initiated for new replica', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'status is initiated');
    t.equal(response.replicaId, 'replica-1', 'replicaId in response');
    t.equal(response.nodeId, 'test-node', 'nodeId in response');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    // Check local replica was tracked
    const localReplica = handler.getLocalReplica('replica-1');
    t.ok(localReplica, 'local replica tracked');
    t.equal(localReplica.status, ReplicaStatus.CREATING, 'status is creating');

    await created;

    handler.shutdown();
  });

  t.test('handleCreateReplica - returns already_exists for active replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Pre-populate local replica
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.ALREADY_EXISTS,
        'already_exists');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleCreateReplica - returns in_progress for creating replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Pre-populate local replica in creating state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.CREATING,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleCreateReplica - idempotent for same operationId', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Pre-populate in-progress operation
    handler.inProgressOperations.set('op-1', {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      startedAt: Date.now(),
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'in_progress');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    handler.shutdown();
  });

  t.test('handleRemoveReplica - returns not_found for missing replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'nonexistent-replica',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.NOT_FOUND,
        'not_found');
      t.equal(response.replicaId, 'nonexistent-replica',
        'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns initiated for existing replica',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      // Create partition directory structure for cleanup
      const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
      fs.mkdirSync(partitionDir, {recursive: true});

      // Pre-populate local replica
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'initiated');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');
      t.equal(response.operationId, 'op-1', 'operationId in response');

      // Check local replica status updated
      const localReplica = handler.getLocalReplica('replica-1');
      t.equal(localReplica.status, ReplicaStatus.REMOVING, 'status is removing');

      await removed;

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns in_progress for removing replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Pre-populate local replica in removing state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVING,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns completed for removed replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Pre-populate local replica in removed state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVED,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
        'completed');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('registerExistingReplica - registers and is idempotent', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Register replica
    handler.registerExistingReplica({
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
      status: ReplicaStatus.ACTIVE,
    });

    const replica = handler.getLocalReplica('replica-1');
    t.ok(replica, 'replica registered');
    t.equal(replica.status, ReplicaStatus.ACTIVE, 'status correct');

    // Register again (idempotent)
    handler.registerExistingReplica({
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
      status: ReplicaStatus.SYNCING, // Different status
    });

    // Should still have original status
    const replica2 = handler.getLocalReplica('replica-1');
    t.equal(replica2.status, ReplicaStatus.ACTIVE, 'status unchanged');

    handler.shutdown();
  });

  t.test('getStats returns correct statistics', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Add some local replicas
    handler.localReplicas.set('replica-1', {status: ReplicaStatus.ACTIVE});
    handler.localReplicas.set('replica-2', {status: ReplicaStatus.ACTIVE});

    // Add in-progress operation
    handler.inProgressOperations.set('op-1', {type: 'CREATE_REPLICA'});

    const stats = handler.getStats();

    t.equal(stats.nodeId, 'test-node', 'correct node ID');
    t.equal(stats.initialized, true, 'initialized flag correct');
    t.equal(stats.localReplicaCount, 2, 'correct local replica count');
    t.equal(stats.inProgressOperationCount, 1, 'correct in-progress count');

    handler.shutdown();
  });

  t.test('emits events during lifecycle operations', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);
    const events = [];

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.on('replicaCreated', (e) => events.push({type: 'replicaCreated', ...e}));

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create a replica
    const createRequest = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    await handler.handleCreateReplica(createRequest);

    await created;

    // Check events were emitted
    const createdEvents = events.filter((e) => e.type === 'replicaCreated');
    t.equal(createdEvents.length, 1, 'replicaCreated event emitted');
    t.equal(createdEvents[0].replicaId, 'replica-1', 'correct replicaId');

    handler.shutdown();
  });

  t.test('async creation updates status via CDC', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    await handler.handleCreateReplica(request);
    await created;

    // Check CDC operations
    const syncingUpdate = mockCDC.operations.find(
      (op) => op.type === 'upsert' && op.data.status === ReplicaStatus.SYNCING,
    );
    t.ok(syncingUpdate, 'syncing status update via CDC');

    const activeUpdate = mockCDC.operations.find(
      (op) => op.type === 'upsert' && op.data.status === ReplicaStatus.ACTIVE,
    );
    t.ok(activeUpdate, 'active status update via CDC');

    handler.shutdown();
  });

  t.test('async removal updates status via CDC', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      dataDir: tempDir,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const removed = waitForReplicaEvent(
      handler,
      'replicaRemoved',
      'replicaRemovalFailed',
    );

    // Create partition directory structure for cleanup
    const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
    fs.mkdirSync(partitionDir, {recursive: true});

    // Pre-populate local replica
    handler.localReplicas.set('replica-1', {
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      status: ReplicaStatus.ACTIVE,
      service: {
        async shutdown() {},
      },
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      reason: 'rebalancing',
    };

    await handler.handleRemoveReplica(request);
    await removed;

    // Check CDC operations
    const removingUpdate = mockCDC.operations.find(
      (op) => op.type === 'upsert' && op.data.status === ReplicaStatus.REMOVING,
    );
    t.ok(removingUpdate, 'removing status update via CDC');

    const removedUpdate = mockCDC.operations.find(
      (op) => op.type === 'upsert' && op.data.status === ReplicaStatus.REMOVED,
    );
    t.ok(removedUpdate, 'removed status update via CDC');

    const deleteOp = mockCDC.operations.find(
      (op) => op.type === 'delete' && op.tableName === SystemTableName.SERVICES,
    );
    t.ok(deleteOp, 'service row deleted via CDC');

    handler.shutdown();
  });

  t.test('registerWithRouter registers handler at correct address', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter);

    // Check handler was registered at correct address
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered at correct address',
    );

    // Test the registered handler works
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      },
    };

    const response = await registeredHandler(envelope);
    t.equal(response.acknowledged, true, 'response acknowledged');
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'create initiated');
    t.equal(response.correlationId, 'corr-1', 'correlationId preserved');

    await created;

    handler.shutdown();
  });

  t.test('unregisterFromRouter removes handler', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter);
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered',
    );

    handler.unregisterFromRouter(mockRouter);
    t.notOk(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler unregistered',
    );

    handler.shutdown();
  });

  t.test('registerWithRouter with RPC client notifies on response', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create mock RPC client
    const rpcResponses = [];
    const mockRpcClient = {
      handleResponse(correlationId, response) {
        rpcResponses.push({correlationId, response});
      },
    };

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter, {rpcClient: mockRpcClient});

    // Test the registered handler notifies RPC client
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      },
    };

    await registeredHandler(envelope);
    await created;

    // Check RPC client was notified
    t.equal(rpcResponses.length, 1, 'RPC client notified');
    t.equal(rpcResponses[0].correlationId, 'corr-1', 'correct correlationId');
    t.equal(rpcResponses[0].response.status,
      ReplicaOperationResponseStatus.INITIATED, 'correct status');

    handler.shutdown();
  });

  t.test('shouldGateActivationOnVoterReadiness - critical joins gate only with paired REMOVE',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', true),
        false,
        'should not gate when operation metadata is missing and no REMOVE is in flight',
      );

      seedReplicaOperation(cache, 'remove-in-flight', {
        type: 'REMOVE',
        partitionId: 'nodes-p1',
      });
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', false),
        false,
        'should not infer gating outside joining flow when metadata is missing',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', true),
        true,
        'should gate when a paired REMOVE is in flight during join',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('partition-1', 'missing-op', true),
        false,
        'should not gate non-critical partitions',
      );

      handler.shutdown();
    });

  t.test('shouldGateActivationOnVoterReadiness - respects explicit operation type when available',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);
      seedReplicaOperation(cache, 'add-op', {
        type: 'ADD',
        partitionId: 'nodes-p1',
      });
      seedReplicaOperation(cache, 'remove-op', {
        type: 'REMOVE',
        partitionId: 'nodes-p1',
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'add-op', false),
        true,
        'should gate ADD operations on critical partitions',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'remove-op', false),
        false,
        'should not gate non-ADD operations when metadata is explicit',
      );

      handler.shutdown();
    });
});
