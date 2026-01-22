/**
 * Unit tests for ReplicaHandler.
 * Tests CREATE_REPLICA and REMOVE_REPLICA request handling.
 * Requirements: 10.2, 3.1
 */

import {test} from 'tap';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ReplicaHandler,
  MessageType,
  ResponseStatus,
} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
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

test('ReplicaHandler', async (t) => {
  let tempDir;

  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-handler-test-'));
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
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
    });

    t.equal(handler.initialized, false, 'not initialized before init');

    handler.initialize();

    t.equal(handler.initialized, true, 'initialized after init');
    t.equal(handler.nodeId, 'test-node', 'node ID set correctly');

    handler.shutdown();
    t.equal(handler.initialized, false, 'not initialized after shutdown');
  });

  t.test('handleMessage routes to correct handler', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
    });

    handler.initialize();

    // Test CREATE_REPLICA routing
    const createEnvelope = {
      correlationId: 'corr-1',
      payload: {
        type: MessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
      },
    };

    const createResponse = await handler.handleMessage(createEnvelope);
    t.equal(createResponse.correlationId, 'corr-1', 'correlationId preserved');
    t.equal(createResponse.status, ResponseStatus.INITIATED, 'create initiated');

    // Test REMOVE_REPLICA routing for non-existent replica
    const removeEnvelope = {
      correlationId: 'corr-2',
      payload: {
        type: MessageType.REMOVE_REPLICA,
        operationId: 'op-2',
        partitionId: 'partition-1',
        replicaId: 'nonexistent',
      },
    };

    const removeResponse = await handler.handleMessage(removeEnvelope);
    t.equal(removeResponse.correlationId, 'corr-2', 'correlationId preserved');
    t.equal(removeResponse.status, ResponseStatus.NOT_FOUND, 'not found');

    // Test unknown message type
    const unknownEnvelope = {
      correlationId: 'corr-3',
      payload: {
        type: 'UNKNOWN_TYPE',
      },
    };

    const unknownResponse = await handler.handleMessage(unknownEnvelope);
    t.equal(unknownResponse.status, ResponseStatus.ERROR, 'error for unknown');

    handler.shutdown();
  });

  t.test('handleCreateReplica - returns initiated for new replica', async (t) => {
    const mockCDC = createMockCDCService();

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.initialize();

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      tableName: 'test_table',
      tableId: 'table-1',
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ResponseStatus.INITIATED, 'status is initiated');
    t.equal(response.replicaId, 'replica-1', 'replicaId in response');
    t.equal(response.nodeId, 'test-node', 'nodeId in response');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    // Check local replica was tracked
    const localReplica = handler.getLocalReplica('replica-1');
    t.ok(localReplica, 'local replica tracked');
    t.equal(localReplica.status, ReplicaStatus.CREATING, 'status is creating');

    // Wait for async creation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    handler.shutdown();
  });

  t.test('handleCreateReplica - returns already_exists for active replica',
    async (t) => {
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
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
        tableName: 'test_table',
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ResponseStatus.ALREADY_EXISTS, 'already_exists');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleCreateReplica - returns in_progress for creating replica',
    async (t) => {
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
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
        tableName: 'test_table',
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ResponseStatus.IN_PROGRESS, 'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleCreateReplica - idempotent for same operationId', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
    });

    handler.initialize();

    // Pre-populate in-progress operation
    handler.inProgressOperations.set('op-1', {
      type: MessageType.CREATE_REPLICA,
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      startedAt: Date.now(),
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ResponseStatus.IN_PROGRESS, 'in_progress');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    handler.shutdown();
  });

  t.test('handleRemoveReplica - returns not_found for missing replica',
    async (t) => {
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
      });

      handler.initialize();

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'nonexistent-replica',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ResponseStatus.NOT_FOUND, 'not_found');
      t.equal(response.replicaId, 'nonexistent-replica', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns initiated for existing replica',
    async (t) => {
      const mockCDC = createMockCDCService();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        dataDir: tempDir,
      });

      handler.initialize();

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

      t.equal(response.status, ResponseStatus.INITIATED, 'initiated');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');
      t.equal(response.operationId, 'op-1', 'operationId in response');

      // Check local replica status updated
      const localReplica = handler.getLocalReplica('replica-1');
      t.equal(localReplica.status, ReplicaStatus.REMOVING, 'status is removing');

      // Wait for async removal to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns in_progress for removing replica',
    async (t) => {
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
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

      t.equal(response.status, ResponseStatus.IN_PROGRESS, 'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns completed for removed replica',
    async (t) => {
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
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

      t.equal(response.status, ResponseStatus.COMPLETED, 'completed');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('registerExistingReplica - registers and is idempotent', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
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
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
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
    const mockCDC = createMockCDCService();
    const events = [];

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.on('replicaCreated', (e) => events.push({type: 'replicaCreated', ...e}));
    handler.on('replicaRemoved', (e) => events.push({type: 'replicaRemoved', ...e}));

    handler.initialize();

    // Create a replica
    const createRequest = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      tableName: 'test_table',
      tableId: 'table-1',
    };

    await handler.handleCreateReplica(createRequest);

    // Wait for async creation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check events were emitted
    const createdEvents = events.filter((e) => e.type === 'replicaCreated');
    t.equal(createdEvents.length, 1, 'replicaCreated event emitted');
    t.equal(createdEvents[0].replicaId, 'replica-1', 'correct replicaId');

    handler.shutdown();
  });

  t.test('async creation updates status via CDC', async (t) => {
    const mockCDC = createMockCDCService();

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.initialize();

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      tableName: 'test_table',
    };

    await handler.handleCreateReplica(request);

    // Wait for async creation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check CDC operations
    const syncingUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.SYNCING,
    );
    t.ok(syncingUpdate, 'syncing status update via CDC');

    const activeUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.ACTIVE,
    );
    t.ok(activeUpdate, 'active status update via CDC');

    handler.shutdown();
  });

  t.test('async removal updates status via CDC', async (t) => {
    const mockCDC = createMockCDCService();

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      dataDir: tempDir,
    });

    handler.initialize();

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

    // Wait for async removal
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check CDC operations
    const removingUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.REMOVING,
    );
    t.ok(removingUpdate, 'removing status update via CDC');

    const removedUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.REMOVED,
    );
    t.ok(removedUpdate, 'removed status update via CDC');

    const deleteOp = mockCDC.operations.find(
      (op) => op.type === 'delete' && op.tableName === SystemTableName.SERVICES,
    );
    t.ok(deleteOp, 'service row deleted via CDC');

    handler.shutdown();
  });

  t.test('registerWithRouter registers handler at correct address', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
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

    // Check handler was registered at correct address
    t.ok(
      registeredHandlers.has('test-node/replica-handler'),
      'handler registered at correct address',
    );

    // Test the registered handler works
    const registeredHandler = registeredHandlers.get('test-node/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: MessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
      },
    };

    const response = await registeredHandler(envelope);
    t.equal(response.acknowledged, true, 'response acknowledged');
    t.equal(response.status, ResponseStatus.INITIATED, 'create initiated');
    t.equal(response.correlationId, 'corr-1', 'correlationId preserved');

    handler.shutdown();
  });

  t.test('unregisterFromRouter removes handler', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
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
      registeredHandlers.has('test-node/replica-handler'),
      'handler registered',
    );

    handler.unregisterFromRouter(mockRouter);
    t.notOk(
      registeredHandlers.has('test-node/replica-handler'),
      'handler unregistered',
    );

    handler.shutdown();
  });

  t.test('registerWithRouter with RPC client notifies on response', async (t) => {
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
    });

    handler.initialize();

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
    const registeredHandler = registeredHandlers.get('test-node/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: MessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
      },
    };

    await registeredHandler(envelope);

    // Check RPC client was notified
    t.equal(rpcResponses.length, 1, 'RPC client notified');
    t.equal(rpcResponses[0].correlationId, 'corr-1', 'correct correlationId');
    t.equal(rpcResponses[0].response.status, ResponseStatus.INITIATED, 'correct status');

    handler.shutdown();
  });
});
