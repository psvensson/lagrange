import {createReplicaHandlerFixture} from
  '../test-helpers/replica-handler-construction-fixture.js';
/**
 * Owner-path regressions for the REMOVE flow: ReplicaHandler reports removal
 * outcomes through ExecutorOutcomeEmitter only, completes a removal after its
 * service row is deleted, and fences transaction admission on acceptance.
 * Shared fixture and contract: replica-handler-owner-path-bypass.test.js.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {
  openParticipantTransactionStore,
} from
  '../../src/partition/partition-participant-transaction-store.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from '../../src/node/replica-removal-consensus-exit.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {REPLICA_HANDLER_EVENT} from '../../src/node/replica-handler-constants.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from
  '../../src/rebalancer/replica-operation-constants.js';
import {REMOVAL_DRAINED_ANSWER} from '../test-helpers/partition-removal-serving-surface.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';
import {
  OwnerPathReplicaHandler as ReplicaHandler,
} from
  './replica-handler-owner-path-admission-fixture.js';
import {
  TEST_NODE_ID,
  TEST_PARTITION_ID,
  TEST_REPLICA_ID,
  TEST_OPERATION_ID,
  TEST_REMOVE_OPERATION_ID,
  createSeededCache,
  createMockCDCService,
  createMockPartitionServiceFactory,
  buildEnvelope,
  waitForReplicaEvent,
  registerOwnerPathTestLifecycle,
} from './replica-handler-owner-path-bypass-fixture.js';

test('ReplicaHandler owner-path bypass regressions: removal', async (t) => {
  registerOwnerPathTestLifecycle(t);

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
      const handler = createReplicaHandlerFixture(ReplicaHandler, {
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
      const handler = createReplicaHandlerFixture(ReplicaHandler, {
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
        async readAuthoritativeRows(tableName, _sql, params) {
          const row = cache.get(tableName, params[0]);
          return {success: true, rows: row ? [row] : []};
        },
      };
      handler.replicaCleanupTombstoneOwner = null;

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
    'remove acceptance fences transaction admission synchronously and waits ' +
    'for the partition-owned drain before deleting its service row',
    async (t) => {
      const cache = createSeededCache();
      const cdcService = createMockCDCService(cache);
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'rh-removal-transaction-drain-'),
      );
      let fenceCount = 0;
      let drainWaitCount = 0;
      let releaseDrain;
      const drainGate = new Promise((resolve) => {
        releaseDrain = resolve;
      });
      const db = new Database(':memory:'); // participant custody: idle
      openParticipantTransactionStore(db);
      t.teardown(() => db.close());
      const partitionService = {
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_REPLICA_ID,
        initialized: true,
        db,
        fenceServingAdmissionForRemoval() {
          fenceCount += 1;
        },
        async waitForRemovalServingDrain() {
          drainWaitCount += 1;
          await drainGate;
          return REMOVAL_DRAINED_ANSWER;
        },
        async shutdown() {},
        async syncFromLeader() {},
        async requestReplicaAdmission(operationId) {
          return {operationId, state: 'admitted', lastOutcome: 'proposed'};
        },
      };
      const handler = createReplicaHandlerFixture(ReplicaHandler, {
        nodeId: TEST_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: cdcService,
        createPartitionService: async (options) =>
          bindRegisteredReplicaHandler(partitionService, options),
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
      const artifactPaths = ['', '-wal', '-shm'].map((suffix) =>
        path.join(partitionDir, `${TEST_REPLICA_ID}.db${suffix}`));
      for (const artifactPath of artifactPaths) {
        fs.writeFileSync(artifactPath, 'replica-storage');
      }
      cdcService.operations.length = 0;
      let authoritativeServiceRow = {
        ...cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID),
      };
      const serviceMutations = [];
      const markerArtifactCounts = [];
      const matches = (row, whereClause = {}) => row &&
        Object.entries(whereClause).every(([field, value]) =>
          row[field] === value);
      const gateway = {
        async readAuthoritativeRows(tableName, _sql, params) {
          if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
            if (authoritativeServiceRow?.service_type ===
                'partition_cleanup') {
              markerArtifactCounts.push(
                artifactPaths.filter((entry) => fs.existsSync(entry)).length,
              );
            }
            const row = authoritativeServiceRow?.service_id === params[0] ?
              authoritativeServiceRow : null;
            return {success: true, rows: row ? [{...row}] : []};
          }
          const row = cache.get(tableName, params[0]);
          return {success: true, rows: row ? [row] : []};
        },
        async submitMutation(mutation) {
          const {operation, tableName, whereClause = {}, data = {}} = mutation;
          if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
            cdcService.operations.push({type: operation, tableName,
              whereClause, data});
            return {success: true, partitionResult: {affectedRows: 0}};
          }
          const before = authoritativeServiceRow &&
            {...authoritativeServiceRow};
          const applied = ['update', 'delete'].includes(operation) &&
            matches(before, whereClause);
          if (applied && operation === 'update') {
            authoritativeServiceRow = {...before, ...data};
          } else if (applied && operation === 'delete') {
            authoritativeServiceRow = null;
          }
          const entry = {type: operation, tableName, whereClause, data,
            before, after: authoritativeServiceRow &&
              {...authoritativeServiceRow},
            artifactsAbsent: artifactPaths.every((artifactPath) =>
              !fs.existsSync(artifactPath))};
          cdcService.operations.push(entry);
          serviceMutations.push(entry);
          return {success: true,
            partitionResult: {affectedRows: applied ? 1 : 0}};
        },
      };
      handler.controlPlaneSystemTableGateway = gateway;
      handler.replicaStateMachine.controlPlaneSystemTableGateway = gateway;
      handler.replicaCleanupTombstoneOwner = null;
      handler.awaitReplicaRemovalConsensusExit = async () => // portless stub
        ({reason: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED});

      const removed = waitForReplicaEvent(
        handler,
        REPLICA_HANDLER_EVENT.REMOVED,
        REPLICA_HANDLER_EVENT.REMOVAL_FAILED,
      );
      const response = await handler.handleMessage(buildEnvelope(
        ReplicaOperationMessageType.REMOVE_REPLICA,
        {
          operationId: TEST_REMOVE_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLICA_ID,
        },
      ));
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'the removal is accepted after installing its serving fence');
      t.equal(fenceCount, 1,
        'transaction admission is fenced before acceptance returns');
      await new Promise((resolve) => setImmediate(resolve));
      t.equal(drainWaitCount, 1,
        'the asynchronous removal delegates drain ownership to the partition');
      t.equal(
        cdcService.operations.some((operation) =>
          operation.type === 'delete' &&
          operation.tableName === SYSTEM_TABLE_NAME.SERVICES),
        false,
        'the routable service row remains until existing transactions drain',
      );
      t.equal(
        serviceMutations.some((mutation) =>
          mutation.data.service_type === 'partition_cleanup'),
        false,
        'cleanup ownership is not taken before the partition drain completes',
      );

      releaseDrain();
      await removed;
      const takeover = serviceMutations.find((mutation) =>
        mutation.type === 'update' &&
        mutation.data.service_type === 'partition_cleanup');
      const release = serviceMutations.find((mutation) =>
        mutation.type === 'delete');
      t.match(takeover, {
        whereClause: {service_id: TEST_REPLICA_ID,
          service_type: 'partition', partition_id: TEST_PARTITION_ID,
          node_id: TEST_NODE_ID, status: ReplicaStatus.REMOVING},
        before: {status: ReplicaStatus.REMOVING},
        after: {service_type: 'partition_cleanup', status: 'cleanup_owned'},
      }, 'REMOVING changes in place to cleanup ownership without row absence');
      t.equal(takeover.whereClause.state_entered_at,
        takeover.before.state_entered_at,
        'cleanup takeover compares the exact durable REMOVING generation');
      t.notOk(
        serviceMutations.some((mutation) =>
          mutation.type === 'delete' &&
          mutation.before?.status === ReplicaStatus.REMOVING),
        'the invalid delete-row-then-clean gap is never created',
      );
      t.same(
        [...new Set(markerArtifactCounts)],
        [3, 2, 1, 0],
        'the exact cleanup token is reread between artifacts and before release',
      );
      t.match(release, {
        whereClause: {
          service_id: TEST_REPLICA_ID,
          service_type: 'partition_cleanup',
          partition_id: TEST_PARTITION_ID,
          node_id: TEST_NODE_ID,
          status: 'cleanup_owned',
          cleanup_token: takeover.after.cleanup_token,
          updated_at: takeover.after.updated_at,
        },
        before: {cleanup_token: takeover.after.cleanup_token},
        after: null,
        artifactsAbsent: true,
      }, 'only the exact cleanup token releases the absent artifact set');
      t.equal(
        authoritativeServiceRow,
        null,
        'authoritative absence is observed only after exact-token release',
      );

      await handler.shutdown();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, {recursive: true, force: true});
      }
    },
  );
});
