/**
 * Integration test: critical partition learner-safety guard.
 *
 * Requirement focus:
 * - 1.2: source REMOVE must not proceed before safe replacement state
 * - 6.1 / 6.3: readiness gating for critical system partition transitions
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  createInProcHttpPost,
  gracefulJoiningShutdown,
  gracefulShutdown,
  getUniquePort,
  TEST_CONFIG,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const SYSTEM_PARTITION_IDS = new Set(
  Object.values(SystemTableName).map((tableName) => `${tableName}-p1`),
);

function isVoterReadyReplica(row) {
  if (!row) {
    return false;
  }
  if (!row.address || row.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  return row.raft_role !== 'learner';
}

function findUnsafeSystemPartitionReplacement(systemTableCache, sourceNodeId, nodeId) {
  const sourceRows = systemTableCache.filter(
    SystemTableName.SERVICES,
    (row) =>
      row.service_type === 'partition' &&
      row.node_id === sourceNodeId &&
      row.status === ReplicaStatus.ACTIVE &&
      SYSTEM_PARTITION_IDS.has(row.partition_id),
  ) || [];

  const visited = new Set();
  for (const sourceReplica of sourceRows) {
    const partitionId = sourceReplica.partition_id;
    if (!partitionId || visited.has(partitionId)) {
      continue;
    }
    visited.add(partitionId);

    const joiningRows = systemTableCache.filter(
      SystemTableName.SERVICES,
      (row) =>
        row.partition_id === partitionId &&
        row.service_type === 'partition' &&
        row.node_id === nodeId,
    ) || [];
    const hasVoterReady = joiningRows.some((row) => isVoterReadyReplica(row));

    if (!hasVoterReady) {
      return {
        partitionId,
        replacementReplica: joiningRows[0] || null,
        sourceReplica,
      };
    }
  }

  return null;
}

function findCriticalSystemPartitionPair(systemTableCache, sourceNodeId, nodeId) {
  const sourceRows = systemTableCache.filter(
    SystemTableName.SERVICES,
    (row) =>
      row.service_type === 'partition' &&
      row.node_id === sourceNodeId &&
      row.status === ReplicaStatus.ACTIVE &&
      SYSTEM_PARTITION_IDS.has(row.partition_id),
  ) || [];

  const visited = new Set();
  for (const sourceReplica of sourceRows) {
    const partitionId = sourceReplica.partition_id;
    if (!partitionId || visited.has(partitionId)) {
      continue;
    }
    visited.add(partitionId);

    const joiningRows = systemTableCache.filter(
      SystemTableName.SERVICES,
      (row) =>
        row.partition_id === partitionId &&
        row.service_type === 'partition' &&
        row.node_id === nodeId,
    ) || [];

    if (joiningRows.length > 0) {
      return {
        partitionId,
        joiningRows,
        sourceReplica,
      };
    }
  }

  return null;
}

test('Critical partition learner safety', {timeout: 120000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 1000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 1000,
      },
      replicaHandler: {
        syncTimeoutMs: 3000,
      },
    });
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('blocks REMOVE while replacement replica is still learner', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440121';
    const seedWsPort = getUniquePort();
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440122';
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});

      const seedQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedQueryEngine);

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      let unsafeReplacement = null;
      const replacementObserved = await waitFor(async () => {
        unsafeReplacement = findUnsafeSystemPartitionReplacement(
          systemTableCache,
          seedNodeId,
          joiningNodeId,
        );
        return !!unsafeReplacement;
      }, 12000, 100);

      if (!replacementObserved) {
        let candidate = null;
        const candidateObserved = await waitFor(async () => {
          candidate = findCriticalSystemPartitionPair(
            systemTableCache,
            seedNodeId,
            joiningNodeId,
          );
          return !!candidate;
        }, 12000, 100);

        t.equal(
          candidateObserved,
          true,
          'should find a critical partition with source and joining replicas',
        );

        if (candidateObserved) {
          const forcedUpdatedAt = Date.now() + 10000;
          for (const joiningRow of candidate.joiningRows) {
            systemTableCache.applySystemTableChange(
              SystemTableName.SERVICES,
              'UPDATE',
              {
                ...joiningRow,
                raft_role: 'learner',
                updated_at: forcedUpdatedAt,
              },
            );
          }

          unsafeReplacement = findUnsafeSystemPartitionReplacement(
            systemTableCache,
            seedNodeId,
            joiningNodeId,
          );
        }
      }

      t.ok(
        unsafeReplacement,
        'should establish critical partition replacement state without voter-ready target',
      );

      const criticalPartitionId = unsafeReplacement?.partitionId;
      t.ok(criticalPartitionId, 'replacement replica should include partition id');

      const voterReadyReplacement = systemTableCache.filter(
        SystemTableName.SERVICES,
        (row) =>
          row.partition_id === criticalPartitionId &&
          row.service_type === 'partition' &&
          row.node_id === joiningNodeId &&
          isVoterReadyReplica(row),
      ) || [];
      t.equal(
        voterReadyReplacement.length,
        0,
        'replacement should not be voter-ready when REMOVE attempt starts',
      );

      const sourceReplica = unsafeReplacement?.sourceReplica;
      t.ok(sourceReplica, 'seed should still host an active source replica');

      const coordinator = bootstrapService.rebalanceCoordinator;
      t.ok(coordinator, 'seed should expose RebalanceCoordinator');

      const removeOperation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: criticalPartitionId,
        entityType: 'partition',
        entityId: criticalPartitionId,
        nodeId: seedNodeId,
        replicaId: sourceReplica.service_id,
      });
      t.ok(removeOperation?.operationId, 'should create remove operation record');

      const execution = await coordinator.executeOperation(removeOperation);

      t.equal(
        execution.success,
        false,
        'REMOVE should be blocked while replacement remains learner',
      );

      const updatedOperation = systemTableCache.get(
        SystemTableName.REPLICA_OPERATIONS,
        removeOperation.operationId,
      );
      t.not(
        updatedOperation?.workflow_step,
        WORKFLOW_STEP.STOPPING,
        'blocked REMOVE must not advance to STOPPING',
      );

      // If current behavior incorrectly started REMOVE, wait briefly so teardown
      // does not race in-flight async cleanup and flood logs.
      if (execution.success) {
        await waitFor(async () => {
          const row = systemTableCache.get(
            SystemTableName.REPLICA_OPERATIONS,
            removeOperation.operationId,
          );
          return row?.workflow_step === WORKFLOW_STEP.REMOVED ||
            row?.workflow_step === WORKFLOW_STEP.FAILED;
        }, 3000, 100);
      }
    } finally {
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });
});
