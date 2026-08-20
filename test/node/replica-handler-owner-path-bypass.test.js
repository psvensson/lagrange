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
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
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
function createSeededCache({
  tableId = TEST_TABLE_ID,
  tableName = TEST_TABLE_NAME,
  partitionId = TEST_PARTITION_ID,
  leaderReplicaId = TEST_LEADER_REPLICA_ID,
} = {}) {
  const cache = new SystemTableCache();

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
    table_id: tableId,
    table_name: tableName,
    schema_definition: JSON.stringify(TEST_SCHEMA),
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: partitionId,
    table_id: tableId,
    partition_key_start: null,
    partition_key_end: null,
    leader_node_id: TEST_LEADER_NODE_ID,
  });

  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: leaderReplicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: TEST_LEADER_NODE_ID,
    raft_role: 'leader',
    status: ReplicaStatus.ACTIVE,
    address:
      `${TEST_LEADER_NODE_ID}/partition/${leaderReplicaId}`,
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
    'voter-ready create publishes provisional ACTIVE while durable lifecycle ' +
      'persistence remains deferred',
    async (t) => {
      const partitionId = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
      const replicaId = `${partitionId}-r2`;
      const leaderReplicaId = `${partitionId}-r1`;
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache({
        tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        partitionId,
        leaderReplicaId,
      });
      const cdcService = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: createMockPartitionServiceFactory(),
        executorOutcomeEmitter: emitter,
      });
      const voterReadyWaits = [];
      handler.waitForVoterReadyActivation = async (
        waitedReplicaId,
        waitedPartitionId,
      ) => {
        voterReadyWaits.push({
          replicaId: waitedReplicaId,
          partitionId: waitedPartitionId,
        });
      };
      handler.initialize();

      const originalPersistReplicaStatusWithRetry =
        handler.persistReplicaStatusWithRetry.bind(handler);
      let releaseActivePersistence;
      const activePersistenceGate = new Promise((resolve) => {
        releaseActivePersistence = resolve;
      });
      let announceActivePersistence;
      const activePersistenceStarted = new Promise((resolve) => {
        announceActivePersistence = resolve;
      });
      handler.persistReplicaStatusWithRetry = async (
        replicaId,
        newStatus,
        additionalData,
      ) => {
        if (newStatus === ReplicaStatus.ACTIVE) {
          announceActivePersistence();
          await activePersistenceGate;
        }
        return originalPersistReplicaStatusWithRetry(
          replicaId,
          newStatus,
          additionalData,
        );
      };

      const created = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.CREATED,
        REPLICA_HANDLER_EVENT.CREATION_FAILED,
      );
      const response = await handler.handleMessage(
        buildEnvelope(
          ReplicaOperationMessageType.CREATE_REPLICA,
          {
            operationId: TEST_OPERATION_ID,
            operationType: OperationType.REPLACE,
            partitionId,
            replicaId,
          },
        ),
      );
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'create should be admitted',
      );

      await activePersistenceStarted;
      t.same(
        voterReadyWaits,
        [{replicaId, partitionId}],
        'critical REPLACE reaches the voter-ready boundary before persistence',
      );
      t.ok(
        emittedOutcomes.some(
          (outcome) =>
            outcome.outcomeType ===
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        ),
        'voter-ready ACTIVE evidence is not withheld by durable persistence',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId)?.status,
        ReplicaStatus.SYNCING,
        'the owner still observes a non-terminal durable projection',
      );

      releaseActivePersistence();
      await created;
      t.equal(
        emittedOutcomes.filter(
          (outcome) =>
            outcome.outcomeType ===
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
        ).length,
        1,
        'the provisional ACTIVE outcome is emitted exactly once',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId)?.status,
        ReplicaStatus.ACTIVE,
        'durable lifecycle persistence may converge after the outcome',
      );

      await handler.shutdown();
    },
  );

  await t.test(
    'definitive ACTIVE persistence failure follows provisional executor ' +
      'evidence with a FAILED outcome',
    async (t) => {
      const persistenceErrorCode = 'ACTIVE_PERSISTENCE_REJECTED';
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
      const originalPersistReplicaStatusWithRetry =
        handler.persistReplicaStatusWithRetry.bind(handler);
      handler.persistReplicaStatusWithRetry = async (
        replicaId,
        newStatus,
        additionalData,
      ) => {
        if (newStatus === ReplicaStatus.ACTIVE) {
          const error = new Error('definitive ACTIVE persistence rejection');
          error.code = persistenceErrorCode;
          throw error;
        }
        return originalPersistReplicaStatusWithRetry(
          replicaId,
          newStatus,
          additionalData,
        );
      };
      handler.initialize();

      const creationFailed = new Promise((resolve) => {
        handler.once(REPLICA_HANDLER_EVENT.CREATION_FAILED, resolve);
      });
      const response = await handler.handleMessage(
        buildEnvelope(
          ReplicaOperationMessageType.CREATE_REPLICA,
          {
            operationId: TEST_OPERATION_ID,
            partitionId: TEST_PARTITION_ID,
            replicaId: TEST_REPLICA_ID,
          },
        ),
      );
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'create should be admitted before its asynchronous persistence fails',
      );
      await creationFailed;

      const outcomeTypes = emittedOutcomes.map(
        (outcome) => outcome.outcomeType,
      );
      const activeIndex = outcomeTypes.indexOf(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      );
      const failedIndex = outcomeTypes.indexOf(
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      );
      t.ok(
        activeIndex >= 0,
        'provisional ACTIVE evidence is emitted before persistence',
      );
      t.ok(
        failedIndex > activeIndex,
        'definitive failure evidence follows and can supersede ACTIVE',
      );
      t.equal(
        emittedOutcomes[failedIndex]?.errorCode,
        persistenceErrorCode,
        'FAILED preserves the definitive lifecycle error code',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID)?.status,
        ReplicaStatus.FAILED,
        'the lifecycle projection converges to the definitive failure',
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
    'remove completion waits for service row delete before emitter ' +
    'signals completion (uses control-plane gateway owner path)',
    async (t) => {
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const emittedOutcomes = [];
      emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
        emittedOutcomes.push(outcome);
      });

      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'rh-bypass-delete-fail-'),
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

      const partitionDir = path.join(
        tempDir, 'partitions', TEST_PARTITION_ID,
      );
      fs.mkdirSync(partitionDir, {recursive: true});

      cdcService.operations.length = 0;
      emittedOutcomes.length = 0;

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

      handler.controlPlaneSystemTableGateway = {
        submitMutation: async () => {
          throw new Error('simulated service row delete failure');
        },
      };

      const removalFailed = new Promise((resolve) => {
        handler.once(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, resolve);
      });

      await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.REMOVE_REPLICA,
        {
          operationId: TEST_REMOVE_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      await removalFailed;

      const outcomeTypes =
        emittedOutcomes.map((o) => o.outcomeType);
      t.notOk(
        outcomeTypes.includes(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
        ),
        'remove completion must not emit before source row delete succeeds',
      );
      t.ok(
        outcomeTypes.includes(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
        ),
        'remove failure must be emitted when source row delete fails',
      );

      await handler.shutdown();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, {recursive: true, force: true});
      }
    },
  );

  await t.test(
    'CREATE failure fences a started learner before publishing failure',
    async (t) => {
      const partitionId = 'schema_operations-p1';
      const cases = [
        {label: 'terminal', deferRetry: false},
        {label: 'retryable', deferRetry: true},
        {label: 'cleanup-error', deferRetry: false, shutdownThrows: true},
      ];

      for (const failureCase of cases) {
        const replicaId = `schema-learner-${failureCase.label}`;
        const operationId = `op-create-${failureCase.label}`;
        const timeline = [];
        const emittedOutcomes = [];
        let promotionCount = 0;
        let partitionService = null;
        let factoryCount = 0;
        let liveRuntimeCount = 0;
        let maxLiveRuntimeCount = 0;
        const emitter = new ExecutorOutcomeEmitter({logger: console});
        emitter.on(OUTCOME_EVENT_NAME, (outcome) => {
          emittedOutcomes.push(outcome);
          if (
            outcome.outcomeType ===
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED
          ) {
            timeline.push('failure-published');
          }
        });
        const cache = createSeededCache({partitionId});
        const cdcService = createMockCDCService(cache);
        const handler = new ReplicaHandler({
          nodeId: TEST_NODE_ID,
          systemTableCache: cache,
          cdcIntegrationService: cdcService,
          createPartitionService: async () => {
            factoryCount += 1;
            liveRuntimeCount += 1;
            maxLiveRuntimeCount = Math.max(
              maxLiveRuntimeCount,
              liveRuntimeCount,
            );
            partitionService = {
              isShutdown: false,
              role: 'learner',
              async shutdown() {
                if (!this.isShutdown) {
                  liveRuntimeCount -= 1;
                }
                this.isShutdown = true;
                timeline.push('runtime-fenced');
                if (failureCase.shutdownThrows) {
                  throw new Error('injected post-fence cleanup failure');
                }
              },
              async syncFromLeader() {},
              async checkLearnerPromotion() {
                if (!this.isShutdown) {
                  promotionCount += 1;
                }
              },
            };
            return partitionService;
          },
          executorOutcomeEmitter: emitter,
        });
        let voterReadyAttempt = 0;
        handler.waitForVoterReadyActivation = async () => {
          voterReadyAttempt += 1;
          if (failureCase.deferRetry && voterReadyAttempt > 1) {
            return;
          }
          const error = new Error(
            `${failureCase.label} voter-ready failure`,
          );
          if (failureCase.deferRetry) {
            error.deferRetry = true;
          }
          throw error;
        };
        handler.initialize();

        const failed = new Promise((resolve) => {
          handler.once(REPLICA_HANDLER_EVENT.CREATION_FAILED, resolve);
        });
        const response = await handler.handleMessage(buildEnvelope(
          ReplicaOperationMessageType.CREATE_REPLICA,
          {
            operationId,
            operationType: OperationType.ADD,
            partitionId,
            replicaId,
          },
        ));
        t.equal(
          response.status,
          ReplicaOperationResponseStatus.INITIATED,
          `${failureCase.label} create reaches the real async owner path`,
        );
        await failed;
        await partitionService.checkLearnerPromotion();

        const failedOutcome = emittedOutcomes.find(
          (outcome) =>
            outcome.outcomeType ===
              EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
        );
        t.same(
          timeline.slice(0, 2),
          ['runtime-fenced', 'failure-published'],
          `${failureCase.label} failure is published only after its ` +
            'runtime is non-promotable',
        );
        t.equal(
          handler.getTrackedService(replicaId),
          null,
          `${failureCase.label} failed runtime is absent from local routing`,
        );
        t.equal(
          promotionCount,
          0,
          `${failureCase.label} failed learner cannot promote after failure`,
        );
        t.equal(
          failedOutcome?.deferRetry === true,
          failureCase.deferRetry,
          `${failureCase.label} failure preserves its owner retry type`,
        );

        if (failureCase.deferRetry) {
          handler.replicaStateMachine.clear();
          handler.localReplicas.clear();
          t.equal(
            handler.replicaStateMachine.getState(replicaId),
            null,
            'redrive can reconstruct participant lifecycle after restart',
          );
          const redriveSettled = new Promise((resolve) => {
            const onOutcome = (outcome) => {
              if (
                outcome.operationId !== operationId ||
                ![
                  EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
                  EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
                ].includes(outcome.outcomeType)
              ) {
                return;
              }
              emitter.off(OUTCOME_EVENT_NAME, onOutcome);
              resolve(
                outcome.outcomeType ===
                  EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE ?
                  'created' :
                  'failed',
              );
            };
            emitter.on(OUTCOME_EVENT_NAME, onOutcome);
          });
          const redriveResponse = await handler.handleMessage(buildEnvelope(
            ReplicaOperationMessageType.CREATE_REPLICA,
            {
              operationId,
              operationType: OperationType.ADD,
              partitionId,
              replicaId,
            },
          ));
          t.equal(
            redriveResponse.status,
            ReplicaOperationResponseStatus.INITIATED,
            'the durable owner can re-dispatch the same retryable CREATE',
          );
          t.equal(
            await redriveSettled,
            'created',
            'the retryable CREATE redrive reaches success from participant ' +
              'lifecycle state',
          );
          t.equal(
            factoryCount,
            2,
            'redrive creates exactly one clean replacement runtime',
          );
          t.equal(
            maxLiveRuntimeCount,
            1,
            'redrive never overlaps the failed and replacement runtimes',
          );
          t.equal(
            handler.getTrackedService(replicaId),
            partitionService,
            'successful redrive tracks only the replacement runtime',
          );
        }

        await handler.shutdown();
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
    'non-priority retryable CREATE replays from durable FAILED state',
    async (t) => {
      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const emitter = new ExecutorOutcomeEmitter({logger: console});
      let factoryCount = 0;
      const handler = new ReplicaHandler({
        nodeId: TEST_NODE_ID,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: async (options) => {
          factoryCount += 1;
          if (factoryCount === 1) {
            const error = new Error('injected retryable factory failure');
            error.deferRetry = true;
            throw error;
          }
          return createMockPartitionServiceFactory()(options);
        },
        executorOutcomeEmitter: emitter,
      });
      handler.initialize();
      let staleRuntimeShutdownCount = 0;
      const envelope = buildEnvelope(
        ReplicaOperationMessageType.CREATE_REPLICA,
        {
          operationId: TEST_OPERATION_ID,
          operationType: OperationType.ADD,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      );
      const failed = new Promise((resolve) => {
        handler.once(REPLICA_HANDLER_EVENT.CREATION_FAILED, resolve);
      });
      await handler.handleMessage(envelope);
      await failed;
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID)?.status,
        ReplicaStatus.FAILED,
        'first attempt leaves durable participant failure evidence',
      );

      handler.replicaStateMachine.clear();
      handler.localReplicas.clear();
      const staleRuntime = {
        async shutdown() {
          staleRuntimeShutdownCount += 1;
        },
      };
      handler.localServices.set(TEST_REPLICA_ID, staleRuntime);
      handler.setLocalReplica(TEST_REPLICA_ID, {
        replicaId: TEST_REPLICA_ID,
        partitionId: TEST_PARTITION_ID,
        status: ReplicaStatus.FAILED,
        service: staleRuntime,
      });
      const created = new Promise((resolve) => {
        handler.once(REPLICA_HANDLER_EVENT.CREATED, resolve);
      });
      const response = await handler.handleMessage(envelope);
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'owner redrive is admitted after participant restart',
      );
      await created;
      t.equal(
        factoryCount,
        2,
        'non-priority redrive creates one replacement runtime',
      );
      t.equal(
        staleRuntimeShutdownCount,
        1,
        'redrive fences a stale runtime left by historical failure ordering',
      );
      t.not(
        handler.getTrackedService(TEST_REPLICA_ID),
        staleRuntime,
        'historical stale runtime is replaced rather than overwritten',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID)?.status,
        ReplicaStatus.ACTIVE,
        'successful redrive supersedes durable FAILED participant state',
      );
      t.equal(
        handler.replicaStateMachine.isValidTransition(
          ReplicaStatus.FAILED,
          ReplicaStatus.CREATING,
        ),
        false,
        'ordinary FAILED lifecycle transitions remain terminal',
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
