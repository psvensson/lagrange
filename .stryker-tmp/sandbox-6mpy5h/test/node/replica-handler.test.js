/**
 * Unit tests for ReplicaHandler.
 * Tests CREATE_REPLICA and REMOVE_REPLICA request handling.
 * Requirements: 10.2, 3.1
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {SERVICE_STATUS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

/**
 * Create a mock CDC integration service.
 * @param {SystemTableCache} [cache] - Optional cache to update.
 * @param {Object} [options] - Optional behavior overrides.
 * @param {Function} [options.executeSQL] - SQL execution callback.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService(cache, options = {}) {
  const operations = [];
  const executeSQL = typeof options.executeSQL === 'function' ?
    options.executeSQL :
    null;

  const service = {
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

  if (executeSQL) {
    service.executeSQL = async (sql, params = []) => {
      operations.push({type: 'executeSQL', sql, params});
      return executeSQL(sql, params);
    };
  }

  return service;
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

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(schema),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: leaderNodeId,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
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
 * Seed a cache with table/partition metadata but no partition services.
 * @param {Object} options - Seed options.
 * @return {SystemTableCache} Seeded cache.
 */
function createMetadataOnlyCache(options = {}) {
  const cache = new SystemTableCache();
  const tableId = options.tableId || 'table-1';
  const tableName = options.tableName || 'test_table';
  const partitionId = options.partitionId || 'partition-1';
  const schema = options.schema || {
    columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
  };

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(schema),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: null,
  });

  return cache;
}

/**
 * Seed a cache with partition service metadata only.
 * @param {Object} options - Seed options.
 * @return {SystemTableCache} Seeded cache.
 */
function createServiceOnlyCache(options = {}) {
  const cache = new SystemTableCache();
  const partitionId = options.partitionId || 'partition-1';
  const leaderNodeId = options.leaderNodeId || 'leader-node';
  const leaderReplicaId = options.leaderReplicaId || 'leader-replica';

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
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
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'INSERT', {
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

    await handler.shutdown();
    t.equal(handler.initialized, false, 'not initialized after shutdown');
  });

  t.test(
    'querySystemTableRows throws typed gateway error when ingress is missing',
    async (t) => {
      const cache = createSeededCache();
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: createMockCDCService(cache),
        createPartitionService: createMockPartitionServiceFactory(),
      });

      try {
        await handler.querySystemTableRows(
          null,
          SYSTEM_TABLE_NAME.PARTITIONS,
          'SELECT * FROM partitions WHERE partition_id = ?',
          ['partition-1'],
        );
        t.fail(
          'ReplicaHandler should not silently treat missing metadata ingress as empty state',
        );
      } catch (error) {
        t.equal(error.code, 'SYSTEM_METADATA_GATEWAY_REQUIRED');
        t.equal(error.outcome, 'owner_not_ready');
      }
    });

  t.test(
    'emitExecutorOutcome emits typed outcomes via executorOutcomeEmitter',
    async (t) => {
      const cache = createSeededCache();
      const emittedOutcomes = [];
      const executorOutcomeEmitter = {
        emitOutcome(outcomeType, operationId, workflowStep, options) {
          emittedOutcomes.push({
            outcomeType, operationId, workflowStep, ...options,
          });
        },
      };

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: createMockCDCService(cache),
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter,
      });
      handler.initialize();

      handler.emitExecutorOutcome(
        'REPLICA_CREATE_ACTIVE',
        'op-outcome-1',
        WORKFLOW_STEP.ACTIVE,
        {replicaId: 'replica-1'},
      );

      t.equal(emittedOutcomes.length, 1,
        'should emit exactly one outcome');
      t.equal(emittedOutcomes[0].outcomeType,
        'REPLICA_CREATE_ACTIVE',
        'outcome type should match');
      t.equal(emittedOutcomes[0].operationId,
        'op-outcome-1',
        'operationId should match');
      t.equal(emittedOutcomes[0].workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'workflowStep should match');
      t.equal(emittedOutcomes[0].replicaId,
        'replica-1',
        'replicaId should be forwarded');

      await handler.shutdown();
    },
  );

  t.test(
    'emitExecutorOutcome is a no-op when emitter is absent',
    async (t) => {
      const cache = createSeededCache();

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: createMockCDCService(cache),
        createPartitionService: createMockPartitionServiceFactory(),
      });
      handler.initialize();

      // Should not throw when executorOutcomeEmitter is null.
      handler.emitExecutorOutcome(
        'REPLICA_CREATE_ACTIVE',
        'op-no-emitter',
        WORKFLOW_STEP.ACTIVE,
        {replicaId: 'replica-1'},
      );

      t.pass('no error when executorOutcomeEmitter is absent');

      await handler.shutdown();
    },
  );

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
    t.equal(localReplica.status, ReplicaStatus.PENDING, 'status is pending');

    await created;

    await handler.shutdown();
  });

  t.test(
    'handleCreateReplica - returns ACK before slow pending status persistence completes',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-slow-pending');
      const mockCDC = createMockCDCService(cache);
      let releasePendingStatus = null;
      let pendingStatusStarted = false;
      const createdReplicaIds = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
        replicaStateMachine: {
          getState() {
            return null;
          },
          async transition(replicaId, newStatus) {
            if (replicaId === 'replica-slow' &&
                newStatus === ReplicaStatus.PENDING) {
              pendingStatusStarted = true;
              await new Promise((resolve) => {
                releasePendingStatus = resolve;
              });
            }
          },
        },
        dataDir: tempDir,
      });

      handler.initialize();

      const responsePromise = handler.handleCreateReplica({
        operationId: 'op-slow-pending',
        partitionId: 'partition-1',
        replicaId: 'replica-slow',
      });

      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('CREATE_REPLICA ACK should not wait for pending status persistence'));
          }, 25);
        }),
      ]);

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should ACK immediately even when pending status persistence is slow',
      );
      t.equal(
        handler.getLocalReplica('replica-slow')?.status,
        ReplicaStatus.PENDING,
        'local idempotency state should still become pending before ACK',
      );
      t.same(
        createdReplicaIds,
        [],
        'replica creation should not begin before pending persistence is released',
      );

      await new Promise((resolve) => setImmediate(resolve));
      t.equal(
        pendingStatusStarted,
        true,
        'slow pending-status persistence should begin in the detached background task after ACK',
      );
      t.type(
        releasePendingStatus,
        'function',
        'background pending-status persistence should expose the test release gate',
      );

      releasePendingStatus();
      await waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      t.same(
        createdReplicaIds,
        ['replica-slow'],
        'replica creation should continue after pending persistence completes',
      );

      await handler.shutdown();
    },
  );

  t.test('shutdown prevents queued createReplicaAsync work from starting', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-shutdown');
    const mockCDC = createMockCDCService(cache);
    let createCalls = 0;

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      dataDir: tempDir,
      createPartitionService: async () => {
        createCalls += 1;
        return {
          async shutdown() {},
          async syncFromLeader() {},
        };
      },
    });

    handler.initialize();
    await handler.handleCreateReplica({
      operationId: 'op-shutdown',
      partitionId: 'partition-1',
      replicaId: 'replica-shutdown',
    });

    await handler.shutdown();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(createCalls, 0, 'shutdown should block queued replica creation');
    t.equal(
      handler.inProgressOperations.size,
      0,
      'shutdown should clear queued in-progress operations',
    );
  });

  t.test(
    'handleCreateReplica - passes lifecycle stage callback options to partition factory',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.equal(capturedOptions.suppressLifecycleLogs, true,
        'lifecycle logs are suppressed for dynamic replica creation');
      t.equal(typeof capturedOptions.onInitializationStage, 'function',
        'stage callback is passed to partition service factory');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - first replica should not be treated as joining existing group',
    async (t) => {
      const cache = createMetadataOnlyCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'first replica should bootstrap leadership instead of learner join mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - provisional sibling rows without leader should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.CREATING,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'fresh partition replicas should bootstrap voters until a leader exists',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - active sibling rows without raft roles should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          raft_role: null,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'active rows without explicit voter roles should still bootstrap fresh partitions',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - roleless active rows should not invent a leader or voters',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1');

      t.equal(
        context.leaderAddress,
        null,
        'should not infer a leader from missing raft_role metadata',
      );
      t.equal(
        context.existingReplicaCount,
        0,
        'should not count roleless active rows as established voters',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - fresh partition bootstrap should not turn later peers into learners',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.LEADER,
        address: 'node-2/partition/replica-2',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-3',
        status: ReplicaStatus.PENDING,
        raft_role: null,
        address: 'node-3/partition/replica-3',
        created_at: now,
        updated_at: now,
      });

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1');

      t.equal(
        context.existingReplicaCount,
        0,
        'fresh partitions without persisted leader metadata should keep the initial cohort in bootstrap mode',
      );
      t.equal(
        context.leaderAddress,
        null,
        'without canonical leader_node_id the handler should not invent a leader address',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - stale leader rows on a not-ready node should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createSeededCache({
        partitionId,
        leaderNodeId: 'dead-node',
        leaderReplicaId: 'replica-2',
      });
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'dead-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now - 1000,
        ready_lease_expires_at: now - 1,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'live-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'dead-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'dead-node/partition/replica-3',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-4',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'live-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'live-node/partition/replica-4',
        created_at: now,
        updated_at: now,
      });

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        null,
        'expired node readiness should suppress stale leader addresses',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'replacement should bootstrap recovery instead of joining a dead leader as learner',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - ready leader should still use learner join mode',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'leader-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        'leader-node/partition/leader-replica',
        'ready leader metadata should still provide a join target',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'healthy leader metadata should preserve learner join mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - explicit bootstrap cohort should seed full peer topology ' +
      'for a fresh partition',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      const bootstrapReplicaIds = ['replica-1', 'replica-2', 'replica-3'];
      const bootstrapPeerAddresses = [
        'node-1/partition/replica-1',
        'node-2/partition/replica-2',
        'node-3/partition/replica-3',
      ];
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
        replicaIds: bootstrapReplicaIds,
        peerAddresses: bootstrapPeerAddresses,
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.same(
        capturedOptions.replicaIds,
        bootstrapReplicaIds,
        'fresh bootstrap should use the explicit initial replica cohort',
      );
      t.same(
        capturedOptions.peerAddresses,
        bootstrapPeerAddresses,
        'fresh bootstrap should use the explicit peer addresses for the cohort',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'explicit bootstrap topology should still remain in bootstrap mode',
      );

      handler.shutdown();
    },
  );

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

  t.test('handleCreateReplica - retries metadata resolution during cache lag',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
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

      const delayedMetadataSeedTimer = setTimeout(() => {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
          }),
        });
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
          partition_id: partitionId,
          table_id: tableId,
          partition_key_start: null,
          partition_key_end: null,
          leader_node_id: 'leader-node',
        });
      }, 50);
      t.teardown(() => clearTimeout(delayedMetadataSeedTimer));

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const failedOperationUpdates = mockCDC.operations.filter((operation) =>
        operation.type === 'update' &&
        operation.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        operation.data?.workflow_step === 'FAILED',
      );
      t.equal(failedOperationUpdates.length, 0,
        'replica operation should not fail during transient metadata lag');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after delayed metadata propagation');

      handler.shutdown();
    });

  t.test(
    'handleCreateReplica - hydrates missing metadata from authoritative system table SQL',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
      const mockCDC = createMockCDCService(cache, {
        executeSQL: async (sql, params = []) => {
          if (String(sql).includes('FROM partitions') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                partition_id: partitionId,
                table_id: tableId,
                partition_key_start: null,
                partition_key_end: null,
                leader_node_id: 'leader-node',
              }],
            };
          }
          if (String(sql).includes('FROM tables') &&
              params[0] === tableId) {
            return {
              success: true,
              rows: [{
                table_id: tableId,
                table_name: tableName,
                schema_definition: JSON.stringify({
                  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
                }),
              }],
            };
          }
          if (String(sql).includes('FROM services') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                service_id: 'leader-replica',
                service_type: 'partition',
                partition_id: partitionId,
                node_id: 'leader-node',
                raft_role: 'leader',
                status: ReplicaStatus.ACTIVE,
                address: 'leader-node/partition/leader-replica',
                created_at: Date.now(),
                updated_at: Date.now(),
              }],
            };
          }
          return {success: true, rows: []};
        },
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 300;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'authoritative metadata should stay on the handler path instead of mutating cache');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'partition metadata should not be patched directly into cache');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after metadata hydration');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.ok(metadataQueries.length >= 2,
        'handler should query authoritative system tables during metadata hydration');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - uses bootstrap metadata payload when cache rows ' +
      'have not propagated yet',
    async (t) => {
      const partitionId = 'partition-bootstrap';
      const replicaId = 'partition-bootstrap-r2';
      const operationId = 'op-bootstrap';
      const tableId = 'table-bootstrap';
      const tableName = 'split_bootstrap_events';
      const cache = new SystemTableCache();
      seedReplicaOperation(cache, operationId, {
        partitionId,
        replicaId,
        targetNodeId: 'test-node',
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 200;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
        replicaIds: [
          'partition-bootstrap-r1',
          'partition-bootstrap-r2',
          'partition-bootstrap-r3',
        ],
        peerAddresses: [
          'node-a/partition/partition-bootstrap-r1',
          'test-node/partition/partition-bootstrap-r2',
          'node-c/partition/partition-bootstrap-r3',
        ],
        bootstrapTableMetadata: {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'event_id', type: 'TEXT', primaryKey: true}],
          }),
        },
        bootstrapPartitionMetadata: {
          partition_id: partitionId,
          table_id: tableId,
          table_name: tableName,
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
          replica_count: 3,
          size_bytes: 0,
          leader_node_id: null,
          state: 'NORMAL',
          created_at: 100,
          updated_at: 100,
        },
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'bootstrap table metadata should remain operation-scoped');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'bootstrap partition metadata should not patch cache directly');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE from bootstrap metadata alone');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.equal(metadataQueries.length, 0,
        'handler should not need authoritative metadata SQL when bootstrap metadata is provided');

      handler.shutdown();
    },
  );

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

  t.test('handleRemoveReplica finalizes local state tracking after durable delete',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);
      let nowValue = 1000;
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        removingTimeoutMs: 50,
        now: () => nowValue,
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
        replicaStateMachine,
      });

      handler.initialize();

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
      fs.mkdirSync(partitionDir, {recursive: true});

      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      await handler.handleRemoveReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      });

      await removed;

      nowValue = 1200;
      t.equal(replicaStateMachine.checkTimeoutsNow(), 0,
        'durable removal should not later time out from the removing state');
      t.equal(replicaStateMachine.getState('replica-1'), null,
        'durably removed replicas should be cleared from local tracking');

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

  t.test('handleRemoveReplica reconciles stale service rows for removed replica',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        node_id: 'test-node',
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address: 'test-node/partition/replica-1',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVED,
        service: null,
      });
      handler.localServices.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
      });

      const response = await handler.handleRemoveReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'replace_source_removal',
      });

      t.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
        'already removed replica should still reconcile stale cleanup');
      t.notOk(cache.get(SYSTEM_TABLE_NAME.SERVICES, 'replica-1'),
        'stale service row should be removed durably');
      t.notOk(handler.localServices.has('replica-1'),
        'local tracked service should be cleared');
      t.ok(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === 'replica-1' &&
          op.whereClause?.service_type === 'partition' &&
          op.whereClause?.partition_id === 'partition-1' &&
          op.whereClause?.node_id === 'test-node',
        ),
        'stale removed replica should still delete its typed local service row',
      );

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
    t.ok(stats.pendingRequestTracker, 'pending request tracker aggregate exists');

    handler.shutdown();
  });

  t.test('getStats aggregates pending request tracker telemetry',
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
      handler.localServices.set('replica-a', {
        getStats() {
          return {
            pendingRequestTracker: {
              pendingCount: 2,
              maxPendingRequests: 5,
              availableCapacity: 3,
              trackedTotal: 10,
              resolvedTotal: 7,
              rejectedTotal: 3,
              timedOutTotal: 1,
              staleCleanedTotal: 0,
              backpressureRejectTotal: 2,
              maxPendingObserved: 4,
            },
          };
        },
      });
      handler.localServices.set('replica-b', {
        getStats() {
          return {
            pendingRequestTracker: {
              pendingCount: 1,
              maxPendingRequests: 10,
              availableCapacity: 9,
              trackedTotal: 8,
              resolvedTotal: 6,
              rejectedTotal: 2,
              timedOutTotal: 0,
              staleCleanedTotal: 1,
              backpressureRejectTotal: 0,
              maxPendingObserved: 3,
            },
          };
        },
      });

      const stats = handler.getStats();
      const pending = stats.pendingRequestTracker;

      t.equal(
        pending.replicaCountWithTracker,
        2,
        'should count services with tracker telemetry',
      );
      t.equal(pending.pendingCount, 3, 'aggregates pending counts');
      t.equal(pending.maxPendingRequests, 15, 'aggregates capacity');
      t.equal(pending.availableCapacity, 12, 'aggregates available capacity');
      t.equal(pending.backpressureRejectTotal, 2, 'aggregates backpressure');
      t.equal(pending.maxPendingObserved, 4, 'retains highest observed pending');
      t.equal(pending.saturationPercent, 20, 'computes aggregate saturation');

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
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.SYNCING,
    );
    t.ok(syncingUpdate, 'syncing status update via CDC');

    const activeUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.ACTIVE,
    );
    t.ok(activeUpdate, 'active status update via CDC');

    handler.shutdown();
  });

  t.test('status update does not overwrite raft role owned by partition service',
    async (t) => {
      const cache = createMetadataOnlyCache({partitionId: 'partition-1'});
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        node_id: 'test-node',
        replica_id: 'replica-1',
        raft_role: null,
        status: ReplicaStatus.SYNCING,
        address: 'test-node/partition/replica-1',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      handler.localServices.set('replica-1', {
        getRole() {
          return RAFT_ROLE.LEADER;
        },
      });

      await handler.updateReplicaStatus('replica-1', ReplicaStatus.ACTIVE, {
        partitionId: 'partition-1',
      });

      const activeUpdate = mockCDC.operations.find((op) =>
        op.type === 'update' && op.data.service_id === 'replica-1' &&
        op.data.status === ReplicaStatus.ACTIVE,
      );
      t.ok(activeUpdate, 'status update should emit an update');
      t.notOk(
        Object.prototype.hasOwnProperty.call(activeUpdate?.data || {}, 'raft_role'),
        'status update should not write raft_role',
      );
    });

  t.test('create replica routes lifecycle through replica state machine',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      const transitions = [];
      const mockReplicaStateMachine = {
        transition(replicaId, newState, context) {
          transitions.push({replicaId, newState, context});
          return true;
        },
        getState() {
          return null;
        },
        registerReplicaSnapshot() {
          return true;
        },
      };

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine: mockReplicaStateMachine,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.same(
        transitions.map((transition) => transition.newState),
        [
          ReplicaStatus.PENDING,
          ReplicaStatus.CREATING,
          ReplicaStatus.SYNCING,
          ReplicaStatus.ACTIVE,
        ],
        'handler should drive replica lifecycle via the shared state machine',
      );
    });

  t.test('updateReplicaStatus throws when the replica state machine rejects a transition',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine: {
          getState() {
            return null;
          },
          transition() {
            return false;
          },
        },
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      await t.rejects(
        handler.updateReplicaStatus('replica-1', ReplicaStatus.CREATING, {
          partitionId: 'partition-1',
        }),
        /Replica state transition rejected/,
        'invalid transitions should fail fast instead of being treated as success',
      );
    });

  t.test('async removal updates status via CDC', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: 'test-node',
      replica_id: 'replica-1',
      raft_role: RAFT_ROLE.FOLLOWER,
      status: ReplicaStatus.ACTIVE,
      address: 'test-node/partition/replica-1',
      created_at: Date.now(),
      updated_at: Date.now(),
    });
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
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.REMOVING,
    );
    t.ok(removingUpdate, 'removing status update via CDC');

    const deleteOp = mockCDC.operations.find(
      (op) => op.type === 'delete' && op.tableName === SYSTEM_TABLE_NAME.SERVICES,
    );
    t.ok(deleteOp, 'service row deleted via CDC');
    t.same(deleteOp.whereClause, {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: 'test-node',
    }, 'partition removal should delete through the canonical typed owner path');

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
