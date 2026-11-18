import {test} from '../../src/test-helpers/tap.js';
import {runConcurrentCreateBudgetGate} from '../../src/rebalancer/rebalance-coordinator-concurrent-add-budget.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  EntityType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createAllowAllStorageAdmissionService,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';
import {
  doesOperationOccupySystemTargetNodeSlot,
  doesOperationTransitionReleaseSystemTargetNodeSlot,
} from '../../src/rebalancer/system-spread-transition-policy.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: '0001'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

const ADD_OPERATION_TYPE = 'ADD';
const FIRST_PARTITION_ID = 'movie_genres-p1';
const SECOND_PARTITION_ID = 'movie_people-p1';
const SHARED_BUDGET_KEY = 'create-budget:add';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function createBudgetOwner(events) {
  const workflow = new DurableWorkflowCoordinator();
  return {
    getCreateBudgetSingleFlightKey: () => SHARED_BUDGET_KEY,
    operationWorkflowRunExclusive: workflow.runExclusive.bind(workflow),
    ensureConcurrentOperationBudgetAllowed: async (_moveType, context) => {
      events.push(`budget:${context.partitionId}`);
    },
  };
}

function runCreateIntent(coordinator, partitionId, executionFactory) {
  return runConcurrentCreateBudgetGate(
    coordinator,
    ADD_OPERATION_TYPE,
    {partitionId},
    executionFactory,
  );
}

test(
  'shared create-budget lane serializes distinct factories and their results',
  async (t) => {
    const events = [];
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const coordinator = createBudgetOwner(events);

    const firstIntent = runCreateIntent(
      coordinator,
      FIRST_PARTITION_ID,
      async () => {
        events.push(`start:${FIRST_PARTITION_ID}`);
        firstStarted.resolve();
        await releaseFirst.promise;
        events.push(`end:${FIRST_PARTITION_ID}`);
        return {partitionId: FIRST_PARTITION_ID};
      },
    );
    await firstStarted.promise;
    const secondIntent = runCreateIntent(
      coordinator,
      SECOND_PARTITION_ID,
      async () => {
        events.push(`start:${SECOND_PARTITION_ID}`);
        return {partitionId: SECOND_PARTITION_ID};
      },
    );

    t.same(
      events,
      [`budget:${FIRST_PARTITION_ID}`, `start:${FIRST_PARTITION_ID}`],
      'the second distinct intent waits behind the shared atomic budget lane',
    );
    releaseFirst.resolve();

    const [firstResult, secondResult] = await Promise.all([
      firstIntent,
      secondIntent,
    ]);
    t.same(firstResult, {partitionId: FIRST_PARTITION_ID});
    t.same(secondResult, {partitionId: SECOND_PARTITION_ID});
    t.same(events, [
      `budget:${FIRST_PARTITION_ID}`,
      `start:${FIRST_PARTITION_ID}`,
      `end:${FIRST_PARTITION_ID}`,
      `budget:${SECOND_PARTITION_ID}`,
      `start:${SECOND_PARTITION_ID}`,
    ]);
    t.end();
  },
);

test(
  'shared create-budget lane does not leak a holder rejection to a waiter',
  async (t) => {
    const events = [];
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const coordinator = createBudgetOwner(events);
    const holderError = new Error('first create failed');

    const firstIntent = runCreateIntent(
      coordinator,
      FIRST_PARTITION_ID,
      async () => {
        events.push(`start:${FIRST_PARTITION_ID}`);
        firstStarted.resolve();
        await releaseFirst.promise;
        throw holderError;
      },
    );
    await firstStarted.promise;
    const secondIntent = runCreateIntent(
      coordinator,
      SECOND_PARTITION_ID,
      async () => {
        events.push(`start:${SECOND_PARTITION_ID}`);
        return {partitionId: SECOND_PARTITION_ID};
      },
    );
    releaseFirst.resolve();

    const [firstOutcome, secondOutcome] = await Promise.allSettled([
      firstIntent,
      secondIntent,
    ]);
    t.equal(firstOutcome.status, 'rejected');
    t.equal(firstOutcome.reason, holderError);
    t.equal(secondOutcome.status, 'fulfilled');
    t.same(secondOutcome.value, {partitionId: SECOND_PARTITION_ID});
    t.same(events, [
      `budget:${FIRST_PARTITION_ID}`,
      `start:${FIRST_PARTITION_ID}`,
      `budget:${SECOND_PARTITION_ID}`,
      `start:${SECOND_PARTITION_ID}`,
    ]);
    t.end();
  },
);

test(
  'native Phase B interaction witness: 3 concurrent system-partition moves toward joiner B ' +
    'admit 2 at serialized create-budget:add gate, defer the 3rd, keep slot occupied through ' +
    'STOPPING drain, and wake + admit + persist the 3rd when slot releases on REMOVED',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = 1_700_000_000_000;
    const nodeA = '0001';
    const nodeB = '0002';
    const nodeC = '0003';
    const nodesPartitionId = 'nodes-p1';
    const contenderPartitions = ['tables-p1', 'indices-p1', 'config-p1'];
    const nodes = [nodeA, nodeB, nodeC].map((nodeId) => ({
      node_id: nodeId,
      status: NodeStatus.ACTIVE,
      connection_state: 'ready',
      ready_lease_expires_at: nowMs + 600_000,
    }));
    const partitions = [
      {partition_id: nodesPartitionId, replica_count: 3},
      ...contenderPartitions.map((partitionId) => ({
        partition_id: partitionId,
        replica_count: 3,
      })),
    ];
    const buildReplicaRows = (partitionId, hostIds) =>
      hostIds.map((nodeId, idx) => ({
        service_id: `${partitionId}-r${idx + 1}`,
        replica_id: `${partitionId}-r${idx + 1}`,
        partition_id: partitionId,
        service_type: EntityType.PARTITION,
        node_id: nodeId,
        status: ReplicaStatus.ACTIVE,
        raft_role: idx === 0 ? 'leader' : 'follower',
        address: `${nodeId}/partition/${partitionId}-r${idx + 1}`,
      }));
    const services = [
      ...buildReplicaRows(nodesPartitionId, [nodeA, nodeB, nodeC]),
      ...contenderPartitions.flatMap((partitionId) =>
        buildReplicaRows(partitionId, [nodeA, nodeA, nodeC]),
      ),
    ];
    const operations = [];
    const cacheListeners = new Set();
    const systemTableCache = {
      get(tableName, key) {
        if (tableName === TABLES.PARTITIONS) {
          return partitions.find((row) => row.partition_id === key) || null;
        }
        if (tableName === TABLES.NODES) {
          return nodes.find((row) => row.node_id === key) || null;
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          return operations.find((row) => row.operation_id === key) || null;
        }
        return null;
      },
      getAll(tableName) {
        if (tableName === TABLES.NODES) return [...nodes];
        if (tableName === TABLES.PARTITIONS) return [...partitions];
        if (tableName === TABLES.SERVICES) return [...services];
        if (tableName === TABLES.REPLICA_OPERATIONS) return [...operations];
        return [];
      },
      filter(tableName, predicate) {
        return this.getAll(tableName).filter(predicate);
      },
      onCacheChange(listener) {
        cacheListeners.add(listener);
      },
      offCacheChange(listener) {
        cacheListeners.delete(listener);
      },
      emitCacheChange(tableName, operation, record) {
        for (const listener of [...cacheListeners]) {
          listener(tableName, operation, record);
        }
      },
    };
    const readinessService = createMockControlPlaneReadinessService({
      systemTableCache,
      now: () => nowMs,
    });
    const admissionHistory = [];
    const persistedOperationRows = [];
    const coordinator = createTestCoordinator({
      nodeId: nodeA,
      systemTableCache,
      controlPlaneReadinessService: readinessService,
      maxConcurrentAdds: 6,
      maxConcurrentRemoves: 6,
    });
    coordinator.initialized = true;
    coordinator.storageAdmissionService =
      createAllowAllStorageAdmissionService();
    coordinator.storageAccountingService = {estimateReplicaBytes: () => 1};
    coordinator.ensureProvisioningAdmissionAllowed = async () => {};
    coordinator.canStartAddOperation = async () => true;
    coordinator.ensureCreateTopologyGuardAllowed = async () => {};
    coordinator.dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn =
      async () => {};
    const originalPersistNewOperation =
      coordinator.repository.persistNewOperation.bind(coordinator.repository);
    coordinator.repository.persistNewOperation = async (op, opts) => {
      const result = await originalPersistNewOperation(op, opts);
      const row = {
        operation_id: op.operationId,
        type: op.type,
        partition_id: op.partitionId,
        replica_id: op.replicaId,
        source_node_id: op.sourceNodeId,
        target_node_id: op.targetNodeId,
        status: op.status,
        workflow_step: op.workflowStep,
        created_at: op.createdAt,
        updated_at: op.updatedAt,
        completed_at: op.completedAt,
        entity_type: op.entityType,
        entity_id: op.entityId,
      };
      operations.push(row);
      persistedOperationRows.push(row);
      return result;
    };
    const originalEnsureBudget =
      coordinator.ensureConcurrentOperationBudgetAllowed.bind(coordinator);
    coordinator.ensureConcurrentOperationBudgetAllowed = async (
      moveType,
      options,
    ) => {
      try {
        await originalEnsureBudget(moveType, options);
        admissionHistory.push({
          partitionId: options.partitionId,
          targetNodeId: options.targetNodeId,
          outcome: 'admitted',
        });
      } catch (error) {
        admissionHistory.push({
          partitionId: options.partitionId,
          targetNodeId: options.targetNodeId,
          outcome: 'deferred',
          skipReason: error.rebalanceSkipReason,
          reasonCode: error.reasonCode,
          limit: error.limit,
        });
        throw error;
      }
    };

    const policy = {
      targetReplicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
      placementConstraints: {spreadAcrossNodes: true},
    };
    const wakeEventsByPartition = new Map();
    const rebalancers = contenderPartitions.map((partitionId) => {
      wakeEventsByPartition.set(partitionId, []);
      const entity = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        nodeId: nodeA,
        systemTableCache,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nowFn: () => nowMs,
      });
      entity.isLeader = true;
      entity.getCheckRebalanceBlocker = async () => null;
      entity.getAvailableNodes = () => nodes;
      entity.getPolicy = async () => policy;
      entity.getConfiguredRebalanceBudget = async () => 6;
      entity.getGlobalInFlightOperationCount = async () => 0;
      entity.getOrdinaryPriorityRecoverySerialGateSnapshot = async () => ({
        blocked: false,
      });
      entity.shouldRequireMoveTargetReadiness = () => false;
      entity.enqueueRebalanceCheck = (reason) => {
        wakeEventsByPartition.get(partitionId).push(reason);
        return true;
      };
      return entity;
    });

    try {
      // 1) Launch all 3 system-partition rebalancers concurrently in Phase B targeting joiner B (0002).
      await Promise.all(
        rebalancers.map((rebalancer) => rebalancer.checkRebalance()),
      );

      const admittedInitial = admissionHistory.filter(
        (entry) => entry.outcome === 'admitted',
      );
      const deferredInitial = admissionHistory.filter(
        (entry) => entry.outcome === 'deferred',
      );
      t.equal(
        admittedInitial.length,
        2,
        'serialized create-budget:add admission admits exactly 2 moves targeting joiner 0002',
      );
      t.equal(
        deferredInitial.length,
        1,
        'serialized create-budget:add admission refuses/defers the 3rd concurrent contender',
      );
      t.equal(
        deferredInitial[0].skipReason,
        REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        'deferred 3rd contender receives typed BUDGET_EXCEEDED skip reason',
      );
      t.equal(
        deferredInitial[0].reasonCode,
        'system_target_node_slot_limit_reached',
        'deferred 3rd contender surfaces canonical system_target_node_slot_limit_reached reasonCode',
      );
      t.equal(
        deferredInitial[0].limit,
        2,
        'Phase B per-target slot limit is 2',
      );
      t.equal(
        persistedOperationRows.length,
        2,
        'only the 2 admitted operations are persisted to replica_operations',
      );

      const deferredPartitionId = deferredInitial[0].partitionId;
      const deferredRebalancer = rebalancers.find(
        (entity) => entity.entityId === deferredPartitionId,
      );
      t.equal(
        deferredRebalancer.operationContinuationWakeState
          ?.awaitingBudgetSlotRelease,
        true,
        '3rd contender is armed for slot-release continuation wake',
      );
      t.equal(
        deferredRebalancer.operationContinuationWakeState
          ?.awaitingBudgetExhausted,
        true,
        '3rd contender records awaitingBudgetExhausted=true',
      );

      // 2) Transition the first admitted operation into STOPPING (drain phase) -> still occupies slot in Phase B.
      const firstPersisted = operations[0];
      firstPersisted.status = ReplicaStatus.REMOVING;
      firstPersisted.workflow_step = WORKFLOW_STEP.STOPPING;
      t.equal(
        doesOperationOccupySystemTargetNodeSlot(firstPersisted, {
          includeDrainPhase: true,
        }),
        true,
        'STOPPING drain operation continues to occupy its target-host slot in Phase B',
      );
      t.equal(
        doesOperationTransitionReleaseSystemTargetNodeSlot(firstPersisted),
        false,
        'STOPPING drain transition does not prematurely release the target-host slot',
      );
      systemTableCache.emitCacheChange(
        TABLES.REPLICA_OPERATIONS,
        'UPDATE',
        firstPersisted,
      );
      await Promise.resolve();
      t.same(
        wakeEventsByPartition.get(deferredPartitionId),
        [],
        'STOPPING drain update does not wake the deferred 3rd contender before terminal release',
      );

      // 3) Transition the first operation to REMOVED (terminal slot release) -> wakes 3rd contender,
      //    which then passes serialized admission and persists!
      firstPersisted.status = ReplicaStatus.REMOVED;
      firstPersisted.workflow_step = WORKFLOW_STEP.REMOVED;
      firstPersisted.completed_at = nowMs + 500;
      t.equal(
        doesOperationTransitionReleaseSystemTargetNodeSlot(firstPersisted),
        true,
        'terminal REMOVED transition releases the target-host slot',
      );
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: firstPersisted.operation_id,
          partitionId: firstPersisted.partition_id,
          targetNodeId: firstPersisted.target_node_id,
          type: firstPersisted.type,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
          completedAt: firstPersisted.completed_at,
        },
      });
      await Promise.resolve();
      t.same(
        wakeEventsByPartition.get(deferredPartitionId),
        [RECONCILE_REASON.PERIODIC_CHECK],
        'slot release wakes the deferred 3rd contender immediately at 0ms',
      );

      deferredRebalancer.lastCheckAtMs = 0;
      await deferredRebalancer.checkRebalance();
      t.equal(
        persistedOperationRows.length,
        3,
        'woken 3rd contender is admitted and persisted once the slot releases',
      );
      t.equal(
        persistedOperationRows[2].partition_id,
        deferredPartitionId,
        'the newly persisted operation belongs to the previously deferred 3rd contender',
      );
      t.equal(
        persistedOperationRows[2].target_node_id,
        nodeB,
        'the newly persisted operation targets joiner B (0002)',
      );
    } finally {
      for (const rebalancer of rebalancers) {
        rebalancer.shutdown();
      }
      await coordinator.shutdown();
    }
  },
);
