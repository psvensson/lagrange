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
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {SERVICE_STATUS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {registerReplicaHandlerTailTests} from './replica-handler-tail-test-cases.js';

const TEST_STEP_DOWN_OPERATION_ID = 'step-down-op';
const TEST_STEP_DOWN_PARTITION_ID = 'partition-1';
const TEST_STEP_DOWN_REPLICA_ID = 'leader-replica';
const TEST_STEP_DOWN_REASON = 'replace_source_leader_handoff';
const TEST_STEP_DOWN_CORRELATION_ID = 'corr-step-down';
const TEST_STEP_DOWN_EMPTY_LEADER_ID = '';
const TEST_STATUS_RETRY_PARTITION_ID = 'partition-status-retry';
const TEST_STATUS_RETRY_REPLICA_ID = 'partition-status-retry-r2';
const TEST_STATUS_RETRY_OPERATION_ID = 'partition-status-retry-op';
const TEST_STATUS_RETRY_SERVICE_ID = TEST_STATUS_RETRY_REPLICA_ID;
const TEST_STATUS_RETRY_SERVICE_ADDRESS =
  'test-node/partition/partition-status-retry-r2';
const TEST_STATUS_RETRY_ERROR =
  'Distributed operation failed due to participant failures';
const TEST_ACTIVE_REPAIR_OPERATION_ID = 'active-repair-op';
const TEST_ACTIVE_REPAIR_PARTITION_ID = 'active-repair-partition';
const TEST_ACTIVE_REPAIR_REPLICA_ID = 'active-repair-replica';
const TEST_ACTIVE_REPAIR_NODE_ID = 'test-node';
const TEST_REMOVE_DELETE_FAILURE_OPERATION_ID = 'remove-delete-failure-op';
const TEST_REMOVE_DELETE_FAILURE_PARTITION_ID = 'partition-1';
const TEST_REMOVE_DELETE_FAILURE_REPLICA_ID = 'remove-delete-failure-r1';
const TEST_REMOVE_DELETE_FAILURE_REASON = 'replace_source_removal';
const TEST_REMOVE_DELETE_FAILURE_MESSAGE = 'delete service row failed';
const TEST_REMOVED_CLEANUP_OPERATION_ID = 'removed-cleanup-op';
const TEST_REMOVED_CLEANUP_PARTITION_ID = 'partition-1';
const TEST_REMOVED_CLEANUP_REPLICA_ID = 'removed-cleanup-r1';
const TEST_REMOVED_CLEANUP_REASON = 'replace_source_removal';
const TEST_REMOVED_CLEANUP_DEFERRED_ERROR = 'cleanup needs retry';
const TEST_ALREADY_ACTIVE_OPERATION_ID = 'op-already-active';
const TEST_ALREADY_ACTIVE_PARTITION_ID = 'partition-1';
const TEST_ALREADY_ACTIVE_REPLICA_ID = 'replica-1';

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

function applyGatewayMutationToCache(cache, mutation) {
  if (!cache || !mutation) {
    return;
  }
  if (mutation.tableName !== SYSTEM_TABLE_NAME.SERVICES) {
    return;
  }
  if (mutation.operation === 'upsert') {
    cache.applySystemTableChange(mutation.tableName, 'INSERT', mutation.row);
    return;
  }
  if (mutation.operation === 'update') {
    cache.applySystemTableChange(
      mutation.tableName,
      'UPDATE',
      {...mutation.whereClause, ...mutation.data},
    );
  }
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
      const emittedOutcomes = [];
      handler.executorOutcomeEmitter = {
        emitOutcome(outcomeType, operationId, workflowStep, options) {
          emittedOutcomes.push({
            outcomeType,
            operationId,
            workflowStep,
            options,
          });
        },
      };

      handler.localReplicas.set(TEST_ALREADY_ACTIVE_REPLICA_ID, {
        replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
        partitionId: TEST_ALREADY_ACTIVE_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
      });
      handler.localServices.set(TEST_ALREADY_ACTIVE_REPLICA_ID, {
        replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
        partitionId: TEST_ALREADY_ACTIVE_PARTITION_ID,
        async shutdown() {},
        async syncFromLeader() {},
      });

      const request = {
        operationId: TEST_ALREADY_ACTIVE_OPERATION_ID,
        partitionId: TEST_ALREADY_ACTIVE_PARTITION_ID,
        replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.ALREADY_EXISTS,
        'already_exists');
      t.equal(response.replicaId, TEST_ALREADY_ACTIVE_REPLICA_ID,
        'replicaId in response');
      t.same(
        emittedOutcomes,
        [
          {
            outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            operationId: TEST_ALREADY_ACTIVE_OPERATION_ID,
            workflowStep: WORKFLOW_STEP.ACTIVE,
            options: {
              replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
            },
          },
        ],
        'already-active create idempotency should emit canonical active workflow progress',
      );

      handler.shutdown();
    });

  t.test('handleCreateReplica - repairs cache-only active replica without tracked service',
    async (t) => {
      const createCalls = [];
      const cache = createSeededCache({
        partitionId: TEST_ACTIVE_REPAIR_PARTITION_ID,
        leaderNodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        leaderReplicaId: TEST_ACTIVE_REPAIR_REPLICA_ID,
      });
      seedReplicaOperation(cache, TEST_ACTIVE_REPAIR_OPERATION_ID, {
        partitionId: TEST_ACTIVE_REPAIR_PARTITION_ID,
        replicaId: TEST_ACTIVE_REPAIR_REPLICA_ID,
        targetNodeId: TEST_ACTIVE_REPAIR_NODE_ID,
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: async (options) => {
          createCalls.push(options);
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

      const response = await handler.handleCreateReplica({
        operationId: TEST_ACTIVE_REPAIR_OPERATION_ID,
        partitionId: TEST_ACTIVE_REPAIR_PARTITION_ID,
        replicaId: TEST_ACTIVE_REPAIR_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'cache-only active replica should start repair instead of returning already_exists',
      );

      await created;

      t.equal(createCalls.length, 1, 'repair path creates one local partition service');
      t.ok(
        handler.localServices.has(TEST_ACTIVE_REPAIR_REPLICA_ID),
        'repair path tracks the recreated local service',
      );
      t.equal(
        handler.getLocalReplica(TEST_ACTIVE_REPAIR_REPLICA_ID)?.status,
        ReplicaStatus.ACTIVE,
        'repair path restores the local replica to active runtime state',
      );

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

  await registerReplicaHandlerTailTests({
    t,
    fs,
    path,
    os,
    ReplicaHandler,
    OperationType,
    ReplicaStatus,
    SYSTEM_TABLE_NAME,
    SystemTableCache,
    ConfigurationManager,
    LoggingService,
    ReplicaStateMachine,
    SERVICE_STATUS,
    WORKFLOW_STEP,
    ReplicaOperationField,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    RAFT_ROLE,
    LifeRaft,
    TEST_STEP_DOWN_OPERATION_ID,
    TEST_STEP_DOWN_PARTITION_ID,
    TEST_STEP_DOWN_REPLICA_ID,
    TEST_STEP_DOWN_REASON,
    TEST_STEP_DOWN_CORRELATION_ID,
    TEST_STEP_DOWN_EMPTY_LEADER_ID,
    TEST_STATUS_RETRY_PARTITION_ID,
    TEST_STATUS_RETRY_REPLICA_ID,
    TEST_STATUS_RETRY_OPERATION_ID,
    TEST_STATUS_RETRY_SERVICE_ID,
    TEST_STATUS_RETRY_SERVICE_ADDRESS,
    TEST_STATUS_RETRY_ERROR,
    TEST_ACTIVE_REPAIR_OPERATION_ID,
    TEST_ACTIVE_REPAIR_PARTITION_ID,
    TEST_ACTIVE_REPAIR_REPLICA_ID,
    TEST_ACTIVE_REPAIR_NODE_ID,
    TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
    TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
    TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
    TEST_REMOVE_DELETE_FAILURE_REASON,
    TEST_REMOVE_DELETE_FAILURE_MESSAGE,
    TEST_REMOVED_CLEANUP_OPERATION_ID,
    TEST_REMOVED_CLEANUP_PARTITION_ID,
    TEST_REMOVED_CLEANUP_REPLICA_ID,
    TEST_REMOVED_CLEANUP_REASON,
    TEST_REMOVED_CLEANUP_DEFERRED_ERROR,
    createMockCDCService,
    createMockPartitionServiceFactory,
    createSeededCache,
    createMetadataOnlyCache,
    createServiceOnlyCache,
    seedReplicaOperation,
    applyGatewayMutationToCache,
    waitForReplicaEvent,
    tempDir,
  });
});
