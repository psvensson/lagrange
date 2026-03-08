/**
 * Owner-path regressions proving ReplicaHandler cannot bypass the
 * RebalanceCoordinator for replica_operations workflow mutations.
 *
 * These tests enforce the single-writer contract from Requirement 1:
 * RebalanceCoordinator is the only component allowed to create
 * replica_operations rows and mutate owner-owned workflow fields
 * (status, workflow_step, completed_at, error_message, steps_history).
 *
 * ReplicaHandler reports typed outcomes via ExecutorOutcomeEmitter.
 * The coordinator consumes those outcomes through the owner-key
 * reconcile queue and decides whether to transition the workflow.
 *
 * Uses ReplicaHandler.emitExecutorOutcome → ExecutorOutcomeEmitter
 * as the only outcome reporting path (no direct SQL writes).
 *
 * Validates: Requirements 1, 6, 8
 * Design: §2, §7, Phase 2
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {test} from '../../src/test-helpers/tap.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from '../../src/rebalancer/executor-outcome-emitter.js';
import {
  REPLICA_HANDLER_EVENT,
} from '../../src/node/replica-handler-constants.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

const TEST_NODE_ID = 'test-node';
const TEST_PARTITION_ID = 'partition-1';
const TEST_TABLE_ID = 'table-1';
const TEST_TABLE_NAME = 'test_table';
const TEST_REPLICA_ID = 'replica-1';
const TEST_LEADER_NODE_ID = 'leader-node';
const TEST_LEADER_REPLICA_ID = 'leader-replica';
const TEST_OPERATION_ID = 'op-bypass-1';
const TEST_REMOVE_OPERATION_ID = 'op-remove-bypass-1';
const TEST_CORRELATION_ID = 'corr-bypass-1';
const TEST_SCHEMA = {
  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
};

/**
 * Create a seeded SystemTableCache with table, partition, and leader
 * service metadata sufficient for ReplicaHandler context resolution.
 * @return {SystemTableCache} Seeded cache.
 */
function createSeededCache() {
  const cache = new SystemTableCache();

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: TEST_TABLE_ID,
    table_name: TEST_TABLE_NAME,
    schema_definition: JSON.stringify(TEST_SCHEMA),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: TEST_PARTITION_ID,
    table_id: TEST_TABLE_ID,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: TEST_LEADER_NODE_ID,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: TEST_LEADER_REPLICA_ID,
    service_type: 'partition',
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_LEADER_NODE_ID,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address:
      `${TEST_LEADER_NODE_ID}/partition/${TEST_LEADER_REPLICA_ID}`,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  return cache;
}

/**
 * Create a mock CDC integration service that tracks all operations.
 * @param {SystemTableCache} cache - Cache to update on writes.
 * @return {Object} Mock CDC service with operation log.
 */
function createMockCDCService(cache) {
  const operations = [];
  return {
    operations,
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      operations.push({
        type: 'update', tableName, whereClause, data: merged,
      });
      cache.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      cache.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true};
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory that returns a minimal partition service.
 */
function createMockPartitionServiceFactory() {
  return async (options) => ({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    initialized: true,
    async shutdown() {},
    async syncFromLeader() {},
  });
}

/**
 * Build a properly formatted envelope for handleMessage.
 * @param {string} type - Message type constant.
 * @param {Object} payload - Message payload fields.
 * @return {Object} Envelope with correlationId and payload.
 */
function buildEnvelope(type, payload) {
  return {
    correlationId: TEST_CORRELATION_ID,
    payload: {type, ...payload},
  };
}

/**
 * Wait for a replica event or failure.
 * @param {ReplicaHandler} handler - Handler instance.
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

test('ReplicaHandler owner-path bypass regressions', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'create flow emits outcomes through ExecutorOutcomeEmitter, ' +
    'not direct replica_operations writes ' +
    '(uses executorOutcomeEmitter.emitOutcome)',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );

      const envelope = buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      );

      const response = await handler.handleMessage(envelope);
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'create should be initiated',
      );

      await created;

      // Verify outcomes were emitted through the emitter.
      const outcomeTypes =
        emittedOutcomes.map((o) => o.outcomeType);
      t.ok(
        outcomeTypes.includes(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
        ),
        'REPLICA_CREATE_SYNCING must be emitted through emitter',
      );
      t.ok(
        outcomeTypes.includes(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        ),
        'REPLICA_CREATE_ACTIVE must be emitted through emitter',
      );

      // Verify no CDC operation touched replica_operations.
      const replicaOpsWrites = cdcService.operations.filter(
        (op) => op.tableName ===
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
      t.equal(
        replicaOpsWrites.length,
        0,
        'ReplicaHandler must not write to ' +
        'replica_operations directly',
      );

      await handler.shutdown();
    },
  );

  await t.test(
    'remove flow emits outcomes through ExecutorOutcomeEmitter, ' +
    'not direct replica_operations writes ' +
    '(uses executorOutcomeEmitter.emitOutcome)',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'rh-bypass-'),
      );
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();

      // First create the replica so we can remove it.
      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await created;

      // Create the partition directory so cleanupReplicaResources
      // does not throw ENOENT during removal.
      const partitionDir = path.join(
        tempDir, 'partitions', TEST_PARTITION_ID,
      );
      fs.mkdirSync(partitionDir, {recursive: true});

      // Clear tracking for the remove phase.
      cdcService.operations.length = 0;
      emittedOutcomes.length = 0;

      // Seed a service row so removal can delete it.
      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: TEST_REPLICA_ID,
          service_type: 'partition',
          partition_id: TEST_PARTITION_ID,
          node_id: TEST_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          address:
            `${TEST_NODE_ID}/partition/${TEST_REPLICA_ID}`,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      );

      const removed = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.REMOVED,
        REPLICA_HANDLER_EVENT.REMOVAL_FAILED,
      );

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.REMOVE_REPLICA,
        {
          operationId: TEST_REMOVE_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await removed;

      // Verify remove outcome was emitted through the emitter.
      const outcomeTypes =
        emittedOutcomes.map((o) => o.outcomeType);
      t.ok(
        outcomeTypes.includes(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
        ),
        'REPLICA_REMOVE_COMPLETED must be emitted through emitter',
      );

      // Verify no CDC operation touched replica_operations.
      const replicaOpsWrites = cdcService.operations.filter(
        (op) => op.tableName ===
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
      t.equal(
        replicaOpsWrites.length,
        0,
        'ReplicaHandler remove must not write to ' +
        'replica_operations directly',
      );

      await handler.shutdown();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, {recursive: true, force: true});
      }
    },
  );

  await t.test(
    'create failure emits REPLICA_CREATE_FAILED through emitter, ' +
    'not direct replica_operations writes ' +
    '(uses executorOutcomeEmitter.emitOutcome)',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);

      // Factory that throws to simulate creation failure.
      const failingFactory = async () => {
        throw new Error('simulated partition service failure');
      };

      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: failingFactory,
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();

      const failed = new Promise((resolve) => {
        handler.once(
          REPLICA_HANDLER_EVENT.CREATION_FAILED, resolve,
        );
      });

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await failed;

      // Verify failure outcome was emitted through the emitter.
      const failOutcomes = emittedOutcomes.filter(
        (o) => o.outcomeType ===
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      );
      t.equal(
        failOutcomes.length,
        1,
        'REPLICA_CREATE_FAILED must be emitted through emitter',
      );
      t.ok(
        failOutcomes[0].errorMessage,
        'failure outcome must carry errorMessage',
      );

      // Verify no CDC operation touched replica_operations.
      const replicaOpsWrites = cdcService.operations.filter(
        (op) => op.tableName ===
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
      t.equal(
        replicaOpsWrites.length,
        0,
        'ReplicaHandler failure must not write to ' +
        'replica_operations directly',
      );

      await handler.shutdown();
    },
  );

  await t.test(
    'without executorOutcomeEmitter, outcomes are silently ' +
    'dropped with no fallback replica_operations write',
    async (t) => {
      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);

      // Construct handler without an emitter — the null path.
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: null,
      });
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await created;

      // Even without an emitter, no fallback write to
      // replica_operations should occur.
      const replicaOpsWrites = cdcService.operations.filter(
        (op) => op.tableName ===
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      );
      t.equal(
        replicaOpsWrites.length,
        0,
        'missing emitter must not trigger fallback ' +
        'replica_operations writes',
      );

      await handler.shutdown();
    },
  );

  await t.test(
    'emitted outcomes carry operationId so coordinator can ' +
    'route through owner-key reconcile queue',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await created;

      // Every emitted outcome must carry the operationId so the
      // coordinator can build the owner-key for runExclusive.
      for (const outcome of emittedOutcomes) {
        t.equal(
          outcome.operationId,
          TEST_OPERATION_ID,
          `outcome ${outcome.outcomeType} must carry operationId`,
        );
        t.ok(
          outcome.workflowStep,
          `outcome ${outcome.outcomeType} must carry ` +
          'workflowStep',
        );
        t.ok(
          typeof outcome.timestamp === 'number',
          `outcome ${outcome.outcomeType} must carry timestamp`,
        );
      }

      await handler.shutdown();
    },
  );

  await t.test(
    'ReplicaHandler CDC operations only touch services table, ' +
    'never owner-owned replica_operations fields',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await created;

      // All CDC writes from ReplicaHandler must target the services
      // table (replica status transitions via ReplicaStateMachine).
      // None may target replica_operations.
      const tableNames = [
        ...new Set(
          cdcService.operations.map((op) => op.tableName),
        ),
      ];
      t.notOk(
        tableNames.includes(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        ),
        'ReplicaHandler must never write to ' +
        `replica_operations; wrote to: [${tableNames.join(', ')}]`,
      );

      await handler.shutdown();
    },
  );
});
