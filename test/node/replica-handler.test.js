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
import {
  registerReplicaHandlerCreateAdmissionTests,
} from './replica-handler-create-admission-test-cases.js';
import {
  registerReplicaHandlerCreateTopologyTests,
} from './replica-handler-create-topology-test-cases.js';
import {registerReplicaHandlerTailTests} from './replica-handler-tail-test-cases.js';

const TEST_STEP_DOWN_OPERATION_ID = 'step-down-op';
const TEST_STEP_DOWN_PARTITION_ID = 'partition-1';
const TEST_STEP_DOWN_REPLICA_ID = 'leader-replica';
const TEST_STEP_DOWN_REASON = 'replace_source_leader_handoff';
const TEST_STEP_DOWN_TARGET_ELECTION_REASON = 'replace_target_leader_election';
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
const TEST_IN_PROGRESS_OPERATION_ID = 'op-in-progress';
const TEST_IN_PROGRESS_PARTITION_ID = 'partition-1';
const TEST_IN_PROGRESS_REPLICA_ID = 'replica-1';
const TEST_PENDING_RESTART_OPERATION_ID = 'op-pending-restart';
const TEST_PENDING_RESTART_PARTITION_ID = 'partition-1';
const TEST_PENDING_RESTART_REPLICA_ID = 'replica-pending-restart';
const TEST_RETRYABLE_CREATE_STATUS_OPERATION_ID =
  'op-retryable-create-status';
const TEST_RETRYABLE_CREATE_STATUS_PARTITION_ID = 'partition-1';
const TEST_RETRYABLE_CREATE_STATUS_REPLICA_ID =
  'replica-retryable-create-status';
const TEST_RETRYABLE_CREATE_STATUS_ERROR =
  'Distributed operation failed due to participant failures';
const TEST_RETRYABLE_CREATE_STATUS_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const TEST_RETRYABLE_CREATE_STATUS_RETRY_AFTER_MS = 1;
const TEST_WAIT_FOR_CONDITION_TIMEOUT_MS = 100;
const TEST_WAIT_FOR_CONDITION_POLL_MS = 5;
const TEST_WAIT_FOR_CONDITION_TIMEOUT_ERROR = 'condition not reached';

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

/**
 * Wait for a short-lived async test condition.
 * @param {Function} predicate - Predicate returning true when ready.
 * @return {Promise<void>}
 */
async function waitForCondition(predicate) {
  const deadline = Date.now() + TEST_WAIT_FOR_CONDITION_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_WAIT_FOR_CONDITION_POLL_MS);
    });
  }
  throw new Error(TEST_WAIT_FOR_CONDITION_TIMEOUT_ERROR);
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

  await registerReplicaHandlerCreateAdmissionTests({
    t,
    ReplicaHandler,
    ReplicaStatus,
    ReplicaStateMachine,
    SYSTEM_TABLE_NAME,
    createMockCDCService,
    createMockPartitionServiceFactory,
    createSeededCache,
    createMetadataOnlyCache,
    seedReplicaOperation,
    applyGatewayMutationToCache,
    waitForReplicaEvent,
    getTempDir: () => tempDir,
    ReplicaOperationResponseStatus,
  });

  await registerReplicaHandlerCreateTopologyTests({
    t,
    ReplicaHandler,
    ReplicaStatus,
    SYSTEM_TABLE_NAME,
    SERVICE_STATUS,
    RAFT_ROLE,
    createMockCDCService,
    createMockPartitionServiceFactory,
    createSeededCache,
    createMetadataOnlyCache,
    seedReplicaOperation,
    waitForReplicaEvent,
    getTempDir: () => tempDir,
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
              partitionId: TEST_ALREADY_ACTIVE_PARTITION_ID,
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
      const emittedOutcomes = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: {
          emitOutcome(outcomeType, operationId, workflowStep, options) {
            emittedOutcomes.push({
              outcomeType,
              operationId,
              workflowStep,
              options,
            });
          },
        },
      });

      handler.initialize();

      // Pre-populate local replica in creating state
      handler.localReplicas.set(TEST_IN_PROGRESS_REPLICA_ID, {
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        status: ReplicaStatus.CREATING,
      });

      const request = {
        operationId: TEST_IN_PROGRESS_OPERATION_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, TEST_IN_PROGRESS_REPLICA_ID,
        'replicaId in response');
      t.same(
        emittedOutcomes,
        [
          {
            outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
            operationId: TEST_IN_PROGRESS_OPERATION_ID,
            workflowStep: WORKFLOW_STEP.CREATING,
            options: {
              replicaId: TEST_IN_PROGRESS_REPLICA_ID,
              partitionId: TEST_IN_PROGRESS_PARTITION_ID,
            },
          },
        ],
        'creating idempotency should emit canonical owner progress',
      );

      handler.shutdown();
    });

  t.test('handleCreateReplica - emits creating outcome for pending replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);
      const emittedOutcomes = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: {
          emitOutcome(outcomeType, operationId, workflowStep, options) {
            emittedOutcomes.push({
              outcomeType,
              operationId,
              workflowStep,
              options,
            });
          },
        },
      });

      handler.initialize();

      handler.localReplicas.set(TEST_IN_PROGRESS_REPLICA_ID, {
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        status: ReplicaStatus.PENDING,
      });
      handler.inProgressOperations.set(TEST_IN_PROGRESS_OPERATION_ID, {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        startedAt: Date.now(),
      });

      const response = await handler.handleCreateReplica({
        operationId: TEST_IN_PROGRESS_OPERATION_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress',
      );
      t.same(
        emittedOutcomes,
        [
          {
            outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_CREATING,
            operationId: TEST_IN_PROGRESS_OPERATION_ID,
            workflowStep: WORKFLOW_STEP.CREATING,
            options: {
              replicaId: TEST_IN_PROGRESS_REPLICA_ID,
              partitionId: TEST_IN_PROGRESS_PARTITION_ID,
            },
          },
        ],
        'pending idempotency should emit accepted create progress',
      );

      handler.shutdown();
    });

  t.test('handleCreateReplica - restarts stale pending replica creation',
    async (t) => {
      const cache = createSeededCache({
        partitionId: TEST_PENDING_RESTART_PARTITION_ID,
      });
      seedReplicaOperation(cache, TEST_PENDING_RESTART_OPERATION_ID, {
        partitionId: TEST_PENDING_RESTART_PARTITION_ID,
        replicaId: TEST_PENDING_RESTART_REPLICA_ID,
      });
      const mockCDC = createMockCDCService(cache);
      const createCalls = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: async (options) => {
          createCalls.push(options);
          return createMockPartitionServiceFactory()(options);
        },
      });

      handler.initialize();
      handler.localReplicas.set(TEST_PENDING_RESTART_REPLICA_ID, {
        replicaId: TEST_PENDING_RESTART_REPLICA_ID,
        partitionId: TEST_PENDING_RESTART_PARTITION_ID,
        status: ReplicaStatus.PENDING,
      });

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );
      const response = await handler.handleCreateReplica({
        operationId: TEST_PENDING_RESTART_OPERATION_ID,
        partitionId: TEST_PENDING_RESTART_PARTITION_ID,
        replicaId: TEST_PENDING_RESTART_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'stale pending replica should restart async creation',
      );

      await created;

      t.equal(createCalls.length, 1, 'stale pending replay creates one service');
      t.equal(
        handler.getLocalReplica(TEST_PENDING_RESTART_REPLICA_ID)?.status,
        ReplicaStatus.ACTIVE,
        'restarted pending replica converges to active',
      );
      t.equal(
        handler.inProgressOperations.size,
        0,
        'restarted pending replica clears operation tracking',
      );

      handler.shutdown();
    });

  t.test(
    'handleCreateReplica - retryable initial status failure drains locally',
    async (t) => {
      const cache = createSeededCache({
        partitionId: TEST_RETRYABLE_CREATE_STATUS_PARTITION_ID,
      });
      seedReplicaOperation(cache, TEST_RETRYABLE_CREATE_STATUS_OPERATION_ID, {
        partitionId: TEST_RETRYABLE_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_RETRYABLE_CREATE_STATUS_REPLICA_ID,
      });
      const mockCDC = createMockCDCService(cache);
      let creatingTransitionAttempted = false;
      let creatingTransitionFailures = 0;
      let createCallCount = 0;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: async (options) => {
          createCallCount += 1;
          return createMockPartitionServiceFactory()(options);
        },
        replicaStateMachine: {
          getState() {
            return null;
          },
          async transition(replicaId, newStatus) {
            if (
              replicaId === TEST_RETRYABLE_CREATE_STATUS_REPLICA_ID &&
              newStatus === ReplicaStatus.CREATING
            ) {
              creatingTransitionAttempted = true;
              if (creatingTransitionFailures > 0) {
                return true;
              }
              creatingTransitionFailures += 1;
              const error = new Error(TEST_RETRYABLE_CREATE_STATUS_ERROR);
              error.code = TEST_RETRYABLE_CREATE_STATUS_CODE;
              error.retryAfterMs =
                TEST_RETRYABLE_CREATE_STATUS_RETRY_AFTER_MS;
              throw error;
            }
            return true;
          },
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId: TEST_RETRYABLE_CREATE_STATUS_OPERATION_ID,
        partitionId: TEST_RETRYABLE_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_RETRYABLE_CREATE_STATUS_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'first create should ACK',
      );

      await created;

      t.equal(
        creatingTransitionAttempted,
        true,
        'retryable initial status persistence should be attempted',
      );
      t.equal(
        createCallCount,
        1,
        'partition service should start after CREATING persistence retries',
      );
      t.equal(
        handler.getLocalReplica(TEST_RETRYABLE_CREATE_STATUS_REPLICA_ID)
          ?.status,
        ReplicaStatus.ACTIVE,
        'retryable initial status pressure should converge to active locally',
      );
      t.equal(
        handler.inProgressOperations.size,
        0,
        'completed local retry should clear operation tracking',
      );

      await handler.shutdown();
    },
  );

  t.test('handleCreateReplica - emits syncing outcome for syncing replica',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);
      const emittedOutcomes = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: {
          emitOutcome(outcomeType, operationId, workflowStep, options) {
            emittedOutcomes.push({
              outcomeType,
              operationId,
              workflowStep,
              options,
            });
          },
        },
      });

      handler.initialize();

      handler.localReplicas.set(TEST_IN_PROGRESS_REPLICA_ID, {
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        status: ReplicaStatus.SYNCING,
      });

      const request = {
        operationId: TEST_IN_PROGRESS_OPERATION_ID,
        partitionId: TEST_IN_PROGRESS_PARTITION_ID,
        replicaId: TEST_IN_PROGRESS_REPLICA_ID,
      };

      const response = await handler.handleCreateReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, TEST_IN_PROGRESS_REPLICA_ID,
        'replicaId in response');
      t.same(
        emittedOutcomes,
        [
          {
            outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            operationId: TEST_IN_PROGRESS_OPERATION_ID,
            workflowStep: WORKFLOW_STEP.SYNCING,
            options: {
              replicaId: TEST_IN_PROGRESS_REPLICA_ID,
              partitionId: TEST_IN_PROGRESS_PARTITION_ID,
            },
          },
        ],
        'syncing idempotency should emit canonical workflow progress',
      );

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
    TEST_STEP_DOWN_TARGET_ELECTION_REASON,
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
