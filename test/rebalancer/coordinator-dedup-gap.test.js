/**
 * Bug Test: RebalanceCoordinator deduplication gap.
 *
 * The operationsInCreation in-memory guard is released in `finally` after
 * each createOperation call completes. When MoveExecutor calls
 * createOperation sequentially (await first, then second), the guard is
 * cleared before the second call starts. The database deduplication also
 * fails because the first INSERT goes through Raft (async replication)
 * and may not be visible in the SQL query yet when the second call checks.
 *
 * This test verifies that two sequential createOperation calls for the
 * same partition+node combination are properly deduplicated.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {createTestCoordinator} from './test-helpers.js';

test('Bug: coordinator dedup gap on sequential calls', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({});
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('sequential createOperation for same partition+node deduplicates',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const move = {
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-2',
          replicaId: 'replica-1',
        };

        // First call — should create the operation
        const first = await coordinator.createOperation(move);
        t.ok(first.operationId, 'first call creates an operation');

        // Second call — same partition+node, should be deduplicated
        const second = await coordinator.createOperation({
          ...move,
          replicaId: 'replica-2', // different replicaId, same partition+node
        });

        // The second call should return the SAME operation, not create a new one
        t.equal(second.operationId, first.operationId,
          'second call should return the existing operation, not create new');
        t.equal(coordinator.stats.operationsCreated, 1,
          'only one operation should have been created');
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test('different partition+node combinations are not deduplicated',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const first = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-2',
          replicaId: 'replica-1',
        });

        const second = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-3', // different node
          replicaId: 'replica-2',
        });

        t.not(first.operationId, second.operationId,
          'different nodes should create separate operations');
        t.equal(coordinator.stats.operationsCreated, 2,
          'two operations should have been created');
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test('ADD allocation uses unique replica IDs across target nodes',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const first = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'tbl-test-p1',
          nodeId: 'node-2',
        });

        const second = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'tbl-test-p1',
          nodeId: 'node-3',
        });

        t.equal(
          first.replicaId,
          'tbl-test-p1-r1',
          'first ADD should allocate canonical replica r1',
        );
        t.equal(
          second.replicaId,
          'tbl-test-p1-r2',
          'second ADD should allocate next canonical replica',
        );
        t.not(
          second.replicaId,
          first.replicaId,
          'sequential ADD operations for one partition must not reuse replica ID',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test(
    'REPLACE allocation uses authoritative service rows when cache lags',
    async (t) => {
      const authoritativeRows = [
        {
          service_id: 'nodes-p1-r1',
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'seed-node',
        },
        {
          service_id: 'nodes-p1-r2',
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'seed-node',
        },
        {
          service_id: 'nodes-p1-r3',
          service_type: 'partition',
          partition_id: 'nodes-p1',
          node_id: 'seed-node',
        },
      ];
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        cacheData: {
          services: authoritativeRows.slice(1),
        },
        sqlQueryResults: {
          'SELECT * FROM services': {
            success: true,
            rows: authoritativeRows,
          },
        },
      });
      coordinator.initialize();

      try {
        const replicaId = await coordinator.allocateCanonicalReplicaId({
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          excludeReplicaIds: ['nodes-p1-r2'],
        });
        t.equal(
          replicaId,
          'nodes-p1-r4',
          'allocator should avoid reusing authoritative replica IDs that are missing in cache',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  t.test('REMOVE operations are deduplicated by replica intent, not only node',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const removeReplicaOne = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        const removeReplicaOneDuplicate = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        t.equal(
          removeReplicaOneDuplicate.operationId,
          removeReplicaOne.operationId,
          'same REMOVE intent should dedupe to existing operation',
        );

        const removeReplicaTwo = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r2',
        });

        t.not(
          removeReplicaTwo.operationId,
          removeReplicaOne.operationId,
          'different REMOVE replica intent should create distinct operation',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test('REMOVE is rejected when replica is owned by in-flight REPLACE',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        coordinator.repository.getOperationsByEntityAuthoritative = async () => [{
          operationId: 'replace-op-1',
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          sourceNodeId: 'seed-node',
          targetNodeId: 'node-2',
          sourceReplicaId: 'nodes-p1-r1',
          replicaId: 'nodes-p1-r4',
          status: 'active',
          workflowStep: WORKFLOW_STEP.ACTIVE,
          stepsHistory: [{
            step: WORKFLOW_STEP.ACTIVE,
            timestamp: Date.now(),
            sourceReplicaId: 'nodes-p1-r1',
          }],
        }];

        let conflictError = null;
        try {
          await coordinator.createOperation({
            type: OperationType.REMOVE,
            partitionId: 'nodes-p1',
            nodeId: 'seed-node',
            replicaId: 'nodes-p1-r4',
          });
        } catch (error) {
          conflictError = error;
        }

        t.ok(
          conflictError,
          'conflicting REMOVE should be rejected',
        );
        t.equal(
          conflictError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT,
          'conflicting remove should surface stable skip reason',
        );
        t.equal(
          conflictError?.conflictingOperationId,
          'replace-op-1',
          'conflicting replace operation id should be attached',
        );

        t.equal(
          coordinator.stats.operationsCreated,
          0,
          'no REMOVE operation should be created when conflict exists',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test(
    'critical REPLACE reuses one existing add-like recovery operation ' +
      'when authoritative entity reads miss and the planner switches target nodes',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        coordinator.repository.getOperationsByEntityAuthoritative =
          async () => [];

        const first = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'control_plane_publications-p1-r1',
          enforceConcurrentOperationBudget: true,
        });

        const second = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-3',
          sourceNodeId: 'seed-node',
          replicaId: 'control_plane_publications-p1-r2',
          enforceConcurrentOperationBudget: true,
        });

        t.equal(
          second.operationId,
          first.operationId,
          'critical partition replacement should reuse the in-flight add-like recovery operation across target-node changes',
        );
        t.equal(
          coordinator.stats.operationsCreated,
          1,
          'critical recovery should not mint duplicate PENDING replacements when authoritative entity reads miss',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  t.test(
    'terminal recent intent cache entry does not suppress create-operation recovery',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      const move = {
        type: OperationType.ADD,
        partitionId: 'nodes-p1',
        nodeId: 'node-2',
      };
      const dedupeKey = coordinator.buildOperationIntentKey(
        move,
        'partition',
        'nodes-p1',
      );
      coordinator.recentOperationIntents.set(dedupeKey, {
        operation: {
          operationId: 'stale-op',
          type: OperationType.ADD,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          targetNodeId: 'node-2',
          status: 'pending',
          workflowStep: WORKFLOW_STEP.PENDING,
        },
        expiresAt: Date.now() + 30_000,
      });

      const originalQueryAuthoritativeOperationById =
        coordinator.repository.queryAuthoritativeOperationById;
      const originalCreateOperationInternal = coordinator.createOperationInternal;
      let createdOperationCount = 0;

      coordinator.repository.queryAuthoritativeOperationById = async () => ({
        operationId: 'stale-op',
        type: OperationType.ADD,
        partitionId: 'nodes-p1',
        entityType: 'partition',
        entityId: 'nodes-p1',
        targetNodeId: 'node-2',
        status: ReplicaStatus.REMOVED,
        workflowStep: WORKFLOW_STEP.REMOVED,
      });
      coordinator.createOperationInternal = async () => {
        createdOperationCount++;
        return {
          operationId: 'replacement-op',
          type: OperationType.ADD,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          targetNodeId: 'node-2',
          status: 'pending',
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      };

      try {
        const result = await coordinator.createOperation(move);
        t.equal(
          result.operationId,
          'replacement-op',
          'createOperation should not return stale terminal cached intent',
        );
        t.equal(
          createdOperationCount,
          1,
          'createOperation should continue with create path after terminal intent validation',
        );
        t.equal(
          coordinator.recentOperationIntents.has(dedupeKey),
          false,
          'terminal recent intent entry should be removed from cache',
        );
      } finally {
        coordinator.repository.queryAuthoritativeOperationById =
          originalQueryAuthoritativeOperationById;
        coordinator.createOperationInternal = originalCreateOperationInternal;
        await coordinator.shutdown();
      }
    },
  );

  t.test(
    'priority recent intent survives authoritative dedupe misses',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      const move = {
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        nodeId: 'node-2',
        sourceNodeId: 'seed-node',
        replicaId: 'replica_operations-p1-r1',
      };
      const dedupeKey = coordinator.buildOperationIntentKey(
        move,
        'partition',
        'replica_operations-p1',
      );
      const cachedOperation = {
        operationId: 'priority-op',
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'replica_operations-p1-r4',
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
      };
      coordinator.recentOperationIntents.set(dedupeKey, {
        operation: cachedOperation,
        expiresAt: Date.now() + 1_000,
      });

      const originalQueryAuthoritativeOperationById =
        coordinator.repository.queryAuthoritativeOperationById;
      const originalCreateOperationInternal = coordinator.createOperationInternal;
      const originalArmCoordinatorCreatedOperationProgress =
        coordinator.armCoordinatorCreatedOperationProgress;
      let createdOperationCount = 0;
      const rearmedOperationIds = [];

      coordinator.repository.queryAuthoritativeOperationById = async () => null;
      coordinator.createOperationInternal = async () => {
        createdOperationCount++;
        return {
          operationId: 'replacement-op',
        };
      };
      coordinator.armCoordinatorCreatedOperationProgress = async (operation) => {
        rearmedOperationIds.push(operation?.operationId || null);
        return true;
      };

      try {
        const result = await coordinator.createOperation(move);
        const refreshedIntent =
          coordinator.recentOperationIntents.get(dedupeKey);

        t.equal(
          result.operationId,
          'priority-op',
          'priority create should reuse the cached in-flight intent when the authoritative dedupe read misses',
        );
        t.equal(
          createdOperationCount,
          0,
          'authoritative dedupe misses should not mint a duplicate priority operation',
        );
        t.same(
          rearmedOperationIds,
          ['priority-op'],
          'reused pending priority intent should be re-armed through the owner lane',
        );
        t.ok(
          refreshedIntent?.expiresAt > Date.now() + 30_000,
          'priority recent intent should extend its retention window under pressure',
        );
      } finally {
        coordinator.repository.queryAuthoritativeOperationById =
          originalQueryAuthoritativeOperationById;
        coordinator.createOperationInternal = originalCreateOperationInternal;
        coordinator.armCoordinatorCreatedOperationProgress =
          originalArmCoordinatorCreatedOperationProgress;
        await coordinator.shutdown();
      }
    },
  );

  t.test(
    'authoritative duplicate pending operation is re-armed when create dedupes',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });

      const pendingOperation = {
        operationId: 'deduped-priority-op',
        type: OperationType.REPLACE,
        partitionId: 'sql_transactions-p1',
        entityType: 'partition',
        entityId: 'sql_transactions-p1',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'sql_transactions-p1-r4',
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
      };
      const originalQueryExistingInFlightOperation =
        coordinator.queryExistingInFlightOperation;
      const originalArmCoordinatorCreatedOperationProgress =
        coordinator.armCoordinatorCreatedOperationProgress;
      const rearmedOperationIds = [];

      coordinator.queryExistingInFlightOperation = async () => pendingOperation;
      coordinator.armCoordinatorCreatedOperationProgress = async (operation) => {
        rearmedOperationIds.push(operation?.operationId || null);
        return true;
      };

      try {
        const result = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'sql_transactions-p1',
          entityType: 'partition',
          entityId: 'sql_transactions-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'sql_transactions-p1-r1',
        });

        t.equal(
          result.operationId,
          pendingOperation.operationId,
          'create should return the authoritative duplicate operation',
        );
        t.same(
          rearmedOperationIds,
          [pendingOperation.operationId],
          'deduped pending operation should be re-armed through the owner lane',
        );
      } finally {
        coordinator.queryExistingInFlightOperation =
          originalQueryExistingInFlightOperation;
        coordinator.armCoordinatorCreatedOperationProgress =
          originalArmCoordinatorCreatedOperationProgress;
        await coordinator.shutdown();
      }
    },
  );

  t.test(
    'stale priority recent intent does not suppress fresh recovery create',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      const move = {
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        nodeId: 'node-2',
        sourceNodeId: 'seed-node',
        replicaId: 'replica_operations-p1-r1',
      };
      const dedupeKey = coordinator.buildOperationIntentKey(
        move,
        'partition',
        'replica_operations-p1',
      );
      const staleTimestamp = Date.now() -
        (coordinator.config.pendingTimeoutMs + 1_000);
      const cachedOperation = {
        operationId: 'stale-priority-op',
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'replica_operations-p1-r4',
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: staleTimestamp,
        updatedAt: staleTimestamp,
      };
      coordinator.recentOperationIntents.set(dedupeKey, {
        operation: cachedOperation,
        expiresAt: Date.now() + 60_000,
      });

      const originalQueryAuthoritativeOperationById =
        coordinator.repository.queryAuthoritativeOperationById;
      const originalCreateOperationInternal = coordinator.createOperationInternal;
      let createdOperationCount = 0;

      coordinator.repository.queryAuthoritativeOperationById = async () => null;
      coordinator.createOperationInternal = async () => {
        createdOperationCount++;
        return {
          operationId: 'replacement-op',
        };
      };

      try {
        const result = await coordinator.createOperation(move);

        t.equal(
          result.operationId,
          'replacement-op',
          'stale priority intent should stop suppressing fresh recovery creation after its timeout window',
        );
        t.equal(
          createdOperationCount,
          1,
          'stale priority intent should allow a fresh recovery operation to be created',
        );
      } finally {
        coordinator.repository.queryAuthoritativeOperationById =
          originalQueryAuthoritativeOperationById;
        coordinator.createOperationInternal = originalCreateOperationInternal;
        await coordinator.shutdown();
      }
    },
  );

  t.test(
    'cache-visible terminal intent must not suppress priority recovery rearm',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      const move = {
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        nodeId: 'node-2',
        sourceNodeId: 'seed-node',
        replicaId: 'replica_operations-p1-r1',
      };
      const dedupeKey = coordinator.buildOperationIntentKey(
        move,
        'partition',
        'replica_operations-p1',
      );
      coordinator.recentOperationIntents.set(dedupeKey, {
        operation: {
          operationId: 'priority-op-terminal',
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          entityType: 'partition',
          entityId: 'replica_operations-p1',
          sourceNodeId: 'seed-node',
          targetNodeId: 'node-2',
          replicaId: 'replica_operations-p1-r4',
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        },
        expiresAt: Date.now() + 60_000,
      });

      const originalQueryOperationById = coordinator.queryOperationById;
      const originalQueryAuthoritativeOperationById =
        coordinator.repository.queryAuthoritativeOperationById;
      const originalCreateOperationInternal = coordinator.createOperationInternal;
      let createdOperationCount = 0;

      coordinator.queryOperationById = async () => ({
        operationId: 'priority-op-terminal',
        type: OperationType.REPLACE,
        partitionId: 'replica_operations-p1',
        entityType: 'partition',
        entityId: 'replica_operations-p1',
        sourceNodeId: 'seed-node',
        targetNodeId: 'node-2',
        replicaId: 'replica_operations-p1-r4',
        status: ReplicaStatus.FAILED,
        workflowStep: WORKFLOW_STEP.FAILED,
      });
      coordinator.repository.queryAuthoritativeOperationById = async () => null;
      coordinator.createOperationInternal = async () => {
        createdOperationCount++;
        return {
          operationId: 'replacement-op',
        };
      };

      try {
        const result = await coordinator.createOperation(move);

        t.equal(
          result.operationId,
          'replacement-op',
          'terminal cache-visible priority intent should allow a fresh recovery create',
        );
        t.equal(
          createdOperationCount,
          1,
          'fresh create path should run once after terminal intent pruning',
        );
        t.equal(
          coordinator.recentOperationIntents.has(dedupeKey),
          false,
          'terminal intent should be removed from recent-intent cache',
        );
      } finally {
        coordinator.queryOperationById = originalQueryOperationById;
        coordinator.repository.queryAuthoritativeOperationById =
          originalQueryAuthoritativeOperationById;
        coordinator.createOperationInternal = originalCreateOperationInternal;
        await coordinator.shutdown();
      }
    },
  );
});
