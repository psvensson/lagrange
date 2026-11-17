/**
 * Deterministic proof for priority-spread fence scoping, distinct-host
 * under-spread exemption, and on-demand continuation / budget-slot-release
 * wakes in UnifiedRebalancer.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REBALANCE_PLANNING_GATE,
  REBALANCE_PLANNING_GATE_DECISION,
} from '../../src/rebalancer/rebalancer-planning-gate-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_NODE_A = '0001';
const TEST_NODE_B = '0002';
const TEST_NODE_C = '0003';
const TEST_LOG_LEVEL = 'error';
const CONCENTRATED_PARTITION_ID = 'table_a-p1';
const SPREAD_PARTITION_ID = 'table_b-p1';
const UNDECLARED_PARTITION_ID = 'undeclared-p1';
const EMPTY_REPLICAS_PARTITION_ID = 'empty_replicas-p1';
const PRIORITY_OBSERVER_ID = 'replica_operations-p1';
const NON_PRIORITY_NODES_PARTITION_ID = 'nodes-p1';
const ORDINARY_SYSTEM_PARTITION_ID = 'tables-p1';
const SCHEMA_PROVISIONING_PARTITION_ID = 'schema-provisioning-p1';
const REPLICATION_FACTOR_THREE = 3;
const INITIAL_NOW_MS = 10_000;
const MID_DWELL_ADVANCE_MS = 20_000;
const OP_COMPLETE_ADVANCE_MS = 30_000;
const REMAINING_DWELL_ADVANCE_MS = 20_000;
const INITIAL_LAST_CHECK_AT_MS = 45_000;
const BACKED_OFF_INTERVAL_MS = 120_000;
const SINGLE_WAKE_COUNT = 1;
const ZERO_COUNT = 0;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_A},
      logging: {level: TEST_LOG_LEVEL},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: TEST_LOG_LEVEL});
  }
}

function createEventedTestCoordinator() {
  const coordinator = createMockCoordinator();
  const listenersByEvent = new Map();
  coordinator.on = (eventName, listener) => {
    const listeners = listenersByEvent.get(eventName) || new Set();
    listeners.add(listener);
    listenersByEvent.set(eventName, listeners);
  };
  coordinator.off = (eventName, listener) => {
    const listeners = listenersByEvent.get(eventName);
    if (!listeners) {
      return;
    }
    listeners.delete(listener);
    if (listeners.size === ZERO_COUNT) {
      listenersByEvent.delete(eventName);
    }
  };
  coordinator.emit = (eventName, payload) => {
    const listeners = listenersByEvent.get(eventName) || new Set();
    for (const listener of [...listeners]) {
      listener(payload);
    }
  };
  coordinator.listenerCount = (eventName) =>
    (listenersByEvent.get(eventName) || new Set()).size;
  return coordinator;
}

function createObservableSystemTableCache({
  nodes = [],
  partitions = [],
  services = [],
  operations = [],
} = {}) {
  const baseCache = createMockCache({nodes, services, partitions});
  const listeners = new Set();
  const filterBase = baseCache.filter.bind(baseCache);
  return {
    ...baseCache,
    filter(tableName, predicate) {
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return operations.filter(predicate);
      }
      return filterBase(tableName, predicate);
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    emitCacheChange(tableName, operation, record) {
      for (const listener of [...listeners]) {
        listener(tableName, operation, record);
      }
    },
    cacheListenerCount() {
      return listeners.size;
    },
  };
}

function buildReadyThreeNodes(nowMs) {
  const leaseExpiry = nowMs + 600_000;
  return [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C].map((nodeId) => ({
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
    connection_state: 'ready',
    ready_lease_expires_at: leaseExpiry,
  }));
}

function buildReplicaRows(partitionId, nodeIds) {
  return nodeIds.map((nodeId, index) => ({
    service_id: `${partitionId}-r${index + 1}`,
    partition_id: partitionId,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    raft_role: index === ZERO_COUNT ? 'leader' : 'follower',
    address: `${nodeId}/partition/${partitionId}-r${index + 1}`,
  }));
}

function createClearReadinessService(systemTableCache, activeNodes) {
  return {
    ...createMockControlPlaneReadinessService({systemTableCache}),
    getPriorityRecoveryPlanningAnswerSync() {
      return {
        publishedActiveNodeIds: activeNodes.map((node) => node.node_id),
        publicationRecoveryGate: {
          prioritySpreadPending: false,
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitions: [],
          },
        },
      };
    },
  };
}

function armActivePrioritySpreadFence(readinessService, nowFn) {
  const observer = createTestRebalancer({
    entityId: PRIORITY_OBSERVER_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_NODE_A,
    controlPlaneReadinessService: readinessService,
    nowFn,
  });
  let blocked = true;
  observer.getControlPlanePrioritySpreadBlocker = () => (
    blocked ?
      {
        requiredDistinctNodeCount: REPLICATION_FACTOR_THREE,
        blockedPartitions: [{
          partitionId: PRIORITY_OBSERVER_ID,
          readyReplicaCount: 2,
          readyDistinctNodeCount: 1,
          spreadGap: 1,
        }],
      } :
      null
  );
  observer.resolvePrioritySpreadPlanningGateDecision();
  blocked = false;
  observer.resolvePrioritySpreadPlanningGateDecision();
  observer.shutdown();
}

test('distinct-host under-spread partition bypasses 70s dwell while spread and synthetic fixtures honor it',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nowFn = () => nowMs;
    const nodes = buildReadyThreeNodes(nowMs);
    const partitions = [
      {partition_id: CONCENTRATED_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      {partition_id: SPREAD_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      {partition_id: UNDECLARED_PARTITION_ID},
      {partition_id: EMPTY_REPLICAS_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
    ];
    const services = [
      ...buildReplicaRows(
        CONCENTRATED_PARTITION_ID,
        [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A],
      ),
      ...buildReplicaRows(
        SPREAD_PARTITION_ID,
        [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C],
      ),
    ];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions,
      services,
    });
    const readinessService = createClearReadinessService(
      systemTableCache,
      nodes,
    );
    armActivePrioritySpreadFence(readinessService, nowFn);

    const makeEntity = (entityId) => createTestRebalancer({
      entityId,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      controlPlaneReadinessService: readinessService,
      nowFn,
    });

    const concentrated = makeEntity(CONCENTRATED_PARTITION_ID);
    const spread = makeEntity(SPREAD_PARTITION_ID);
    const undeclared = makeEntity(UNDECLARED_PARTITION_ID);
    const emptyReplicas = makeEntity(EMPTY_REPLICAS_PARTITION_ID);
    concentrated.getAvailableNodes = () => nodes;
    spread.getAvailableNodes = () => nodes;
    undeclared.getAvailableNodes = () => nodes;
    emptyReplicas.getAvailableNodes = () => nodes;

    try {
      t.equal(
        concentrated.isPartitionBelowDeclaredDistinctHostSpread(),
        true,
        '[0001, 0001, 0001] at RF=3 across 3 hosts is below declared distinct spread',
      );
      t.equal(
        concentrated.resolvePrioritySpreadPlanningGateDecision(),
        null,
        'concentrated partition bypasses the 70s post-clear stability dwell',
      );

      t.equal(
        spread.isPartitionBelowDeclaredDistinctHostSpread(),
        false,
        '[0001, 0002, 0003] satisfies distinct-host spread',
      );
      const spreadDecision = spread.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        spreadDecision?.gate,
        REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
        'already-spread partition still honors the 70s stability dwell',
      );
      t.equal(
        spreadDecision?.logMessage,
        REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY_STABILITY,
        'already-spread partition logs stability wait',
      );

      t.equal(
        undeclared.isPartitionBelowDeclaredDistinctHostSpread(),
        false,
        'synthetic UNDECLARED partition row returns false',
      );
      t.equal(
        undeclared.resolvePrioritySpreadPlanningGateDecision()?.decision,
        REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
        'synthetic UNDECLARED partition still honors the 70s dwell',
      );

      t.equal(
        emptyReplicas.isPartitionBelowDeclaredDistinctHostSpread(),
        false,
        'synthetic empty-replica fixture returns false',
      );
      t.equal(
        emptyReplicas.resolvePrioritySpreadPlanningGateDecision()?.decision,
        REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
        'synthetic empty-replica fixture still honors the 70s dwell',
      );
    } finally {
      concentrated.shutdown();
      spread.shutdown();
      undeclared.shutdown();
      emptyReplicas.shutdown();
    }
  });

test('non-priority REPLACE/REMOVE never re-lock or reset 70s fence while priority and ADD operations hold it',
  async (t) => {
    initializeTestEnvironment();
    let nowMs = INITIAL_NOW_MS;
    const nowFn = () => nowMs;
    const nodes = buildReadyThreeNodes(nowMs);
    const operations = [];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [{partition_id: SPREAD_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE}],
      services: buildReplicaRows(SPREAD_PARTITION_ID, [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C]),
      operations,
    });
    const readinessService = createClearReadinessService(systemTableCache, nodes);
    armActivePrioritySpreadFence(readinessService, nowFn);

    const background = createTestRebalancer({
      entityId: SPREAD_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      controlPlaneReadinessService: readinessService,
      nowFn,
    });
    background.getAvailableNodes = () => nodes;
    background.randomSource = {random: () => 0};

    try {
      const nonPriorityReplace = {
        operation_id: 'nodes-replace-1',
        type: OperationType.REPLACE,
        partition_id: NON_PRIORITY_NODES_PARTITION_ID,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
      };
      const nonPriorityRemove = {
        operation_id: 'ordinary-remove-1',
        type: OperationType.REMOVE,
        partition_id: SPREAD_PARTITION_ID,
        status: ReplicaStatus.REMOVING,
        workflow_step: WORKFLOW_STEP.STOPPING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
      };
      const priorityReplace = {
        operation_id: 'priority-replace-1',
        type: OperationType.REPLACE,
        partition_id: PRIORITY_OBSERVER_ID,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
      };
      const schemaAdd = {
        operation_id: 'schema-add-1',
        type: OperationType.ADD,
        partition_id: SCHEMA_PROVISIONING_PARTITION_ID,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
      };

      t.equal(
        background.isPrioritySpreadFenceHoldingOperation(nonPriorityReplace),
        false,
        'non-priority REPLACE does not hold the priority-spread fence',
      );
      t.equal(
        background.isPrioritySpreadFenceHoldingOperation(nonPriorityRemove),
        false,
        'non-priority REMOVE does not hold the priority-spread fence',
      );
      t.equal(
        background.isPrioritySpreadFenceHoldingOperation(priorityReplace),
        true,
        'priority-partition operation holds the priority-spread fence',
      );
      t.equal(
        background.isPrioritySpreadFenceHoldingOperation(schemaAdd),
        true,
        'ADD operation holds the priority-spread fence',
      );

      operations.push(nonPriorityReplace, nonPriorityRemove);
      nowMs += MID_DWELL_ADVANCE_MS;
      const midDecision = background.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        midDecision?.blocker?.stableElapsedMs,
        MID_DWELL_ADVANCE_MS,
        'in-flight non-priority REPLACE/REMOVE must not reset the 70s clock',
      );

      nowMs += OP_COMPLETE_ADVANCE_MS;
      nonPriorityReplace.status = ReplicaStatus.ACTIVE;
      nonPriorityReplace.workflow_step = WORKFLOW_STEP.ACTIVE;
      nonPriorityReplace.updated_at = nowMs;
      nonPriorityReplace.completed_at = nowMs;
      nonPriorityRemove.status = ReplicaStatus.REMOVED;
      nonPriorityRemove.workflow_step = WORKFLOW_STEP.REMOVED;
      nonPriorityRemove.updated_at = nowMs;
      nonPriorityRemove.completed_at = nowMs;

      nowMs += REMAINING_DWELL_ADVANCE_MS;
      t.equal(
        background.resolvePrioritySpreadPlanningGateDecision(),
        null,
        'drained non-priority REPLACE/REMOVE must not extend the 70s stability window',
      );

      const secondOwner = createClearReadinessService(systemTableCache, nodes);
      armActivePrioritySpreadFence(secondOwner, nowFn);
      const secondBg = createTestRebalancer({
        entityId: SPREAD_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_A,
        systemTableCache,
        controlPlaneReadinessService: secondOwner,
        nowFn,
      });
      secondBg.getAvailableNodes = () => nodes;
      priorityReplace.created_at = nowMs;
      priorityReplace.updated_at = nowMs;
      operations.push(priorityReplace);
      nowMs += MID_DWELL_ADVANCE_MS;
      const blockedByPriorityDecision =
        secondBg.resolvePrioritySpreadPlanningGateDecision();
      t.equal(
        blockedByPriorityDecision?.blocker?.stableElapsedMs,
        ZERO_COUNT,
        'in-flight priority operation resets the 70s stability clock',
      );
      secondBg.shutdown();
    } finally {
      background.shutdown();
    }
  });

test(
  'continuation wake advances Move #2 immediately on own completion and paces contenders ' +
    'on slot release',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [{
        partition_id: CONCENTRATED_PARTITION_ID,
        replica_count: REPLICATION_FACTOR_THREE,
      }],
      services: buildReplicaRows(
        CONCENTRATED_PARTITION_ID,
        [TEST_NODE_A, TEST_NODE_A, TEST_NODE_B],
      ),
    });

    const ownWakeReasons = [];
    const ownRebalancer = createTestRebalancer({
      entityId: CONCENTRATED_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    ownRebalancer.isLeader = true;
    ownRebalancer.getAvailableNodes = () => nodes;
    ownRebalancer.currentInterval = BACKED_OFF_INTERVAL_MS;
    ownRebalancer.lastCheckAtMs = INITIAL_LAST_CHECK_AT_MS;
    ownRebalancer.enqueueRebalanceCheck = (reason) => {
      ownWakeReasons.push(reason);
      return true;
    };
    ownRebalancer.rebalance = async () => ({
      success: true,
      moves: [{success: true, operation: OperationType.REPLACE}],
    });

    const contenderWakeReasons = [];
    const contenderRebalancer = createTestRebalancer({
      entityId: SPREAD_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    contenderRebalancer.isLeader = true;
    contenderRebalancer.currentInterval = BACKED_OFF_INTERVAL_MS;
    contenderRebalancer.lastCheckAtMs = INITIAL_LAST_CHECK_AT_MS;
    contenderRebalancer.enqueueRebalanceCheck = (reason) => {
      contenderWakeReasons.push(reason);
      return true;
    };
    contenderRebalancer.rebalance = async () => ({
      success: true,
      skipped: true,
      reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      moves: [],
    });

    try {
      await ownRebalancer.advanceCheckCadence(true);
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED),
        SINGLE_WAKE_COUNT,
        'Move #1 while still under distinct spread arms terminal listener',
      );

      // Unrelated operation completion must NOT wake ownRebalancer before its own Move #1 completes.
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'other-op',
          partitionId: 'other-partition-p1',
          type: OperationType.REPLACE,
          status: ReplicaStatus.ACTIVE,
        },
      });
      await Promise.resolve();
      t.equal(
        ownWakeReasons.length,
        ZERO_COUNT,
        'unrelated operation completion does not wake Move #1 owner',
      );

      // Own Move #1 completion clears lastCheckAtMs and wakes Move #2 immediately.
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'own-move-1',
          partitionId: CONCENTRATED_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.ACTIVE,
        },
      });
      await Promise.resolve();
      t.same(
        ownWakeReasons,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'own Move #1 completion enqueues Move #2 immediately',
      );
      t.equal(
        ownRebalancer.lastCheckAtMs,
        ZERO_COUNT,
        'ownMove completion clears lastCheckAtMs so Move #2 bypasses minInterval',
      );
      t.equal(
        ownRebalancer.currentInterval,
        ownRebalancer.periodicCheckIntervalMs,
        'ownMove completion resets currentInterval',
      );
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED),
        ZERO_COUNT,
        'continuation wake disarms coordinator listeners after firing',
      );

      // Contender skipped on BUDGET_EXCEEDED wakes on any terminal operation, preserving lastCheckAtMs.
      await contenderRebalancer.advanceCheckCadence(true);
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED),
        SINGLE_WAKE_COUNT,
        'BUDGET_EXCEEDED arms slot-release wake listener',
      );
      systemTableCache.emitCacheChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
        operation_id: 'any-op-terminal',
        partition_id: 'unrelated-p1',
        type: OperationType.REPLACE,
        status: ReplicaStatus.FAILED,
        workflow_step: WORKFLOW_STEP.FAILED,
      });
      await Promise.resolve();
      t.same(
        contenderWakeReasons,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'terminal REPLICA_OPERATIONS cache event releases contender wake',
      );
      t.equal(
        contenderRebalancer.lastCheckAtMs,
        ZERO_COUNT,
        'slot-release wake clears lastCheckAtMs so minInterval never swallows a disarmed wake',
      );
      t.equal(
        contenderRebalancer.currentInterval,
        contenderRebalancer.periodicCheckIntervalMs,
        'slot-release wake resets currentInterval',
      );

      // Shutdown disarms armed listeners cleanly without firing queued wakes.
      await contenderRebalancer.advanceCheckCadence(true);
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED),
        SINGLE_WAKE_COUNT,
        're-armed contender attaches coordinator listener',
      );
      contenderRebalancer.shutdown();
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED),
        ZERO_COUNT,
        'shutdown detaches OPERATION_COMPLETED listener',
      );
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED),
        ZERO_COUNT,
        'shutdown detaches OPERATION_FAILED listener',
      );
      t.equal(
        systemTableCache.cacheListenerCount(),
        ZERO_COUNT,
        'shutdown detaches cache change listener',
      );
    } finally {
      ownRebalancer.shutdown();
      contenderRebalancer.shutdown();
    }
  });

test(
  'distinct-spread partitions get short leadership start delay, keep continuation wake armed ' +
    'and minimum interval on no_changes_needed, and separate Phase A vs Phase B global occupancy',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const operations = [];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: CONCENTRATED_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: SPREAD_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: NON_PRIORITY_NODES_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: ORDINARY_SYSTEM_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      ],
      services: [
        ...buildReplicaRows(
          CONCENTRATED_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A],
        ),
        ...buildReplicaRows(
          SPREAD_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C],
        ),
        ...buildReplicaRows(
          NON_PRIORITY_NODES_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A],
        ),
        ...buildReplicaRows(
          ORDINARY_SYSTEM_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A],
        ),
      ],
      operations,
    });
    const makeEntity = (entityId) => {
      const entity = createTestRebalancer({
        entityId,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_A,
        systemTableCache,
        rebalanceCoordinator: coordinator,
        nowFn: () => nowMs,
      });
      entity.getAvailableNodes = () => nodes;
      entity.isLeader = true;
      return entity;
    };
    const concentrated = makeEntity(CONCENTRATED_PARTITION_ID);
    const spread = makeEntity(SPREAD_PARTITION_ID);
    const nodesPartition = makeEntity(NON_PRIORITY_NODES_PARTITION_ID);
    const ordinarySystem = makeEntity(ORDINARY_SYSTEM_PARTITION_ID);

    try {
      const concentratedStartDelay = concentrated.getLeadershipStartDelayMs();
      const spreadStartDelay = spread.getLeadershipStartDelayMs();
      const nodesStartDelay = nodesPartition.getLeadershipStartDelayMs();
      t.ok(
        concentratedStartDelay >= SINGLE_WAKE_COUNT &&
          concentratedStartDelay <= concentrated.getPriorityRetryDelayMs(),
        'below-distinct-spread non-formation partition uses short leadership start delay',
      );
      t.ok(
        spreadStartDelay >= spread.periodicCheckIntervalMs,
        'already-spread partition keeps 60s..120s leadership start delay',
      );
      t.ok(
        nodesStartDelay >= SINGLE_WAKE_COUNT &&
          nodesStartDelay <= nodesPartition.getPriorityRetryDelayMs(),
        'nodes-p1 formation-liveness dependency uses short leadership start delay',
      );

      concentrated.currentInterval = concentrated.periodicCheckIntervalMs;
      concentrated.rebalance = async () => ({
        success: true,
        moves: [],
        reason: 'no_changes_needed',
      });
      const forcePriorityRetry = await concentrated.advanceCheckCadence(true);
      t.equal(forcePriorityRetry, true, 'below-spread partition forces priority retry cadence');
      t.equal(
        concentrated.currentInterval,
        concentrated.getPriorityRetryDelayMs(),
        'below-distinct-spread partition resets interval to minimum instead of 1.5x backoff',
      );
      t.equal(
        concentrated.operationContinuationWakeState?.awaitingBudgetSlotRelease,
        true,
        'below-distinct-spread partition with 0 own ops stays armed for slot release',
      );

      operations.push({
        operation_id: 'own-in-flight-1',
        partition_id: CONCENTRATED_PARTITION_ID,
        entity_type: EntityType.PARTITION,
        entity_id: CONCENTRATED_PARTITION_ID,
        type: OperationType.REPLACE,
        target_node_id: TEST_NODE_B,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
      });
      await concentrated.advanceCheckCadence(true);
      t.equal(
        concentrated.operationContinuationWakeState?.awaitingOwnOperationCompletion,
        true,
        'below-distinct-spread partition with own in-flight op keeps own-completion wake armed',
      );

      const globalOps = [
        {
          operation_id: 'sys-op-b',
          partition_id: PRIORITY_OBSERVER_ID,
          type: OperationType.REPLACE,
          target_node_id: TEST_NODE_B,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
        },
        {
          operation_id: 'sys-op-c',
          partition_id: 'services-p1',
          type: OperationType.REPLACE,
          target_node_id: TEST_NODE_C,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
        },
      ];
      const policy = {
        targetReplicaCount: REPLICATION_FACTOR_THREE,
        minReplicaCount: REPLICATION_FACTOR_THREE,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };
      for (const entity of [ordinarySystem, nodesPartition]) {
        entity.getGlobalTopologyBlockingInFlightOperations = () => globalOps;
        entity.getInFlightOperations = () => [];
      }
      const ordinaryReplicas = ordinarySystem.getCurrentReplicas();
      const ordinaryTarget = await ordinarySystem.calculateTargetState(ordinaryReplicas, policy);
      const ordinaryMoves = ordinarySystem.calculateMoves(ordinaryReplicas, ordinaryTarget);
      t.equal(
        ordinaryMoves.length,
        ZERO_COUNT,
        'ordinary system partition honors nodesWithGlobalSystemAddTransitional when all targets are globally transitional',
      );
      const nodesReplicas = nodesPartition.getCurrentReplicas();
      const nodesTarget = await nodesPartition.calculateTargetState(nodesReplicas, policy);
      const nodesMoves = nodesPartition.calculateMoves(nodesReplicas, nodesTarget);
      t.equal(
        nodesMoves.length,
        ZERO_COUNT,
        'Phase A serial-goal-state partition honors nodesWithGlobalSystemAddTransitional',
      );
    } finally {
      concentrated.shutdown();
      spread.shutdown();
      nodesPartition.shutdown();
      ordinarySystem.shutdown();
    }
  });

test(
  'slotMatch wakes only one eligible 0ms winner per operationId, staggers remaining contenders, ' +
    'deduplicates CDC echoes, and clears priority floor on gate-blocked OPERATION_COMPLETED',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const tableA = 'clusters-p1';
    const tableB = 'tables-p1';
    const tableC = 'indices-p1';
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: tableA, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: tableB, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: tableC, replica_count: REPLICATION_FACTOR_THREE},
      ],
      services: [
        ...buildReplicaRows(tableA, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_B]),
        ...buildReplicaRows(tableB, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
        ...buildReplicaRows(tableC, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
      ],
    });

    const records = new Map();
    const makeContender = (partitionId) => {
      const log = {enqueued: [], scheduled: []};
      records.set(partitionId, log);
      const entity = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_A,
        systemTableCache,
        rebalanceCoordinator: coordinator,
        nowFn: () => nowMs,
      });
      entity.isLeader = true;
      entity.getAvailableNodes = () => nodes;
      entity.lastCheckAtMs = INITIAL_LAST_CHECK_AT_MS;
      entity.enqueueRebalanceCheck = (reason) => {
        log.enqueued.push(reason);
        return true;
      };
      entity.scheduleNextCheck = (delayMs) => {
        log.scheduled.push(delayMs);
      };
      entity.syncOperationContinuationWake(null, ZERO_COUNT);
      return entity;
    };

    const contenderAlreadyOnB = makeContender(tableA);
    const contenderNeedsB = makeContender(tableB);
    const contenderSecondNeedsB = makeContender(tableC);

    const priorityRebalancer = createTestRebalancer({
      entityId: PRIORITY_OBSERVER_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    priorityRebalancer.isLeader = true;
    priorityRebalancer.lastCheckAtMs = INITIAL_LAST_CHECK_AT_MS;
    priorityRebalancer.syncLocalMutationReadinessWake(true);

    try {
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'replace-freed-b',
          partitionId: 'unrelated-p1',
          targetNodeId: TEST_NODE_B,
          type: OperationType.REPLACE,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
        },
      });
      // Synchronously cleared for gate-blocked priority partition before queue drain.
      t.equal(
        priorityRebalancer.lastCheckAtMs,
        ZERO_COUNT,
        'priority partition clears lastCheckAtMs synchronously on OPERATION_COMPLETED after gate block',
      );
      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
        SINGLE_WAKE_COUNT,
        'only the priority partition holds a STEP_CHANGED listener',
      );

      await Promise.resolve();

      t.same(
        records.get(tableA).enqueued,
        [],
        'contender already hosting targetNodeId does not steal the 0ms winner slot',
      );
      t.equal(
        records.get(tableA).scheduled.length,
        SINGLE_WAKE_COUNT,
        'ineligible-target contender is staggered instead',
      );
      t.same(
        records.get(tableB).enqueued,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'first eligible contender needing targetNodeId wakes at 0ms',
      );
      t.same(
        records.get(tableC).enqueued,
        [],
        'second eligible contender does not stampede at 0ms',
      );
      t.equal(
        records.get(tableC).scheduled.length,
        SINGLE_WAKE_COUNT,
        'second eligible contender is staggered via scheduleNextCheck',
      );
      t.ok(
        records.get(tableC).scheduled[0] > records.get(tableA).scheduled[0],
        'stagger delays strictly increase across contenders',
      );

      // Re-arm and emit duplicate CDC update for the same terminal operationId -> deduplicated.
      contenderNeedsB.syncOperationContinuationWake(null, ZERO_COUNT);
      systemTableCache.emitCacheChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
        operation_id: 'replace-freed-b',
        partition_id: 'unrelated-p1',
        target_node_id: TEST_NODE_B,
        type: OperationType.REPLACE,
        status: ReplicaStatus.REMOVED,
        workflow_step: WORKFLOW_STEP.REMOVED,
      });
      await Promise.resolve();
      t.equal(
        records.get(tableB).enqueued.length,
        SINGLE_WAKE_COUNT,
        'duplicate CDC cache event for same operationId does not double-wake',
      );
    } finally {
      contenderAlreadyOnB.shutdown();
      contenderNeedsB.shutdown();
      contenderSecondNeedsB.shutdown();
      priorityRebalancer.shutdown();
    }
  });

test(
  'Phase B enables maxPerTargetNode=2 (with STOPPING drain ops) post-nodes-p1, caps moveLimit=1, ' +
    'and orders REPLACE targets by least in-flight load',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const operations = [];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: NON_PRIORITY_NODES_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: ORDINARY_SYSTEM_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      ],
      services: [
        ...buildReplicaRows(
          NON_PRIORITY_NODES_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C],
        ),
        ...buildReplicaRows(
          ORDINARY_SYSTEM_PARTITION_ID,
          [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A],
        ),
      ],
      operations,
    });
    const ordinary = createTestRebalancer({
      entityId: ORDINARY_SYSTEM_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    ordinary.isLeader = true;
    ordinary.getAvailableNodes = () => nodes;

    const policy = {
      targetReplicaCount: REPLICATION_FACTOR_THREE,
      minReplicaCount: REPLICATION_FACTOR_THREE,
      maxReplicaCount: 7,
      placementConstraints: {spreadAcrossNodes: true},
    };
    const executedMoves = [];
    ordinary.getConfiguredRebalanceBudget = async () => 10;
    ordinary.getGlobalInFlightOperationCount = async () => 0;
    ordinary.getOrdinaryPriorityRecoverySerialGateSnapshot = async () => ({
      blocked: false,
    });
    ordinary.executeRebalancingMoves = async (limitedMoves, context) => {
      executedMoves.push({limitedMoves, moveLimit: context.moveLimit});
      return limitedMoves.map((move) => ({
        success: true,
        operation: move.type,
        nodeId: move.nodeId,
      }));
    };

    try {
      // 1 SYNCING op on 0002 and 1 STOPPING op on 0003 -> both still < 2 in Phase B.
      operations.push(
        {
          operation_id: 'phase-b-syncing-b',
          partition_id: 'services-p1',
          type: OperationType.REPLACE,
          target_node_id: TEST_NODE_B,
          status: ReplicaStatus.SYNCING,
          workflow_step: WORKFLOW_STEP.SYNCING,
        },
        {
          operation_id: 'phase-b-stopping-c',
          partition_id: 'indices-p1',
          type: OperationType.REPLACE,
          target_node_id: TEST_NODE_C,
          status: ReplicaStatus.REMOVING,
          workflow_step: WORKFLOW_STEP.STOPPING,
        },
      );
      const replicas = ordinary.getCurrentReplicas();
      const targetBothAvailable = await ordinary.calculateTargetState(replicas, policy);
      const movesBothAvailable = ordinary.calculateMoves(replicas, targetBothAvailable);
      t.equal(
        movesBothAvailable.length,
        2,
        'Phase B maxPerTargetNode=2 allows planning moves when each joiner has 1 op (including STOPPING)',
      );

      // Adding a STOPPING op on 0002 brings 0002 to 2 ops (1 SYNCING + 1 STOPPING) -> 0002 excluded!
      operations.push({
        operation_id: 'phase-b-stopping-b2',
        partition_id: 'partitions-p1',
        type: OperationType.REPLACE,
        target_node_id: TEST_NODE_B,
        status: ReplicaStatus.REMOVING,
        workflow_step: WORKFLOW_STEP.STOPPING,
      });
      const targetBFull = await ordinary.calculateTargetState(replicas, policy);
      const transitionNodes =
        targetBFull.topologyTransitionSnapshot.nodesWithGlobalSystemAddTransitional;
      t.equal(
        transitionNodes.has(TEST_NODE_B),
        true,
        'Phase B includeDrainPhase=true counts STOPPING toward maxPerTargetNode=2 cap',
      );
      t.equal(
        transitionNodes.has(TEST_NODE_C),
        false,
        '0003 with 1 op remains open when 0002 reaches 2 ops',
      );

      // Priority op in flight forces maxPerTargetNode=1 even when nodes-p1 is spread.
      operations.push({
        operation_id: 'priority-op-c',
        partition_id: PRIORITY_OBSERVER_ID,
        type: OperationType.REPLACE,
        target_node_id: TEST_NODE_C,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
      });
      const targetWithPriority = await ordinary.calculateTargetState(replicas, policy);
      const priorityTransitionNodes =
        targetWithPriority.topologyTransitionSnapshot.nodesWithGlobalSystemAddTransitional;
      t.equal(
        priorityTransitionNodes.has(TEST_NODE_C),
        true,
        'priority operation in flight restricts maxPerTargetNode back to 1',
      );

      // Reset to 1 op on 0002 and 0 ops on 0003 -> rebalance() caps moveLimit=1 and prefers 0003.
      operations.length = ZERO_COUNT;
      operations.push({
        operation_id: 'phase-b-load-b',
        partition_id: 'services-p1',
        type: OperationType.REPLACE,
        target_node_id: TEST_NODE_B,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
      });
      const rebalanceResult = await ordinary.rebalance('periodic', policy);
      t.equal(rebalanceResult.success, true, 'rebalance succeeds in Phase B');
      t.equal(executedMoves.length, SINGLE_WAKE_COUNT, 'one execution batch');
      t.equal(executedMoves[0].moveLimit, SINGLE_WAKE_COUNT, 'rebalance caps moveLimit=1');
      t.equal(executedMoves[0].limitedMoves.length, SINGLE_WAKE_COUNT, 'only Move 1 executes');
      t.equal(
        executedMoves[0].limitedMoves[0].nodeId,
        TEST_NODE_C,
        'least-loaded target ordering prefers 0003 (0 ops) over 0002 (1 op)',
      );
    } finally {
      ordinary.shutdown();
    }
  });

test(
  'continuation coordinator keeps non-winners armed across back-to-back completions, ranks nodes-p1 ' +
    '-> 2/3 -> 1/3 depth-first, hands off unused slot batons, and uses 3x safety cadence',
  async (t) => {
    initializeTestEnvironment();
    let nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const tableOneThirdA = 'tables-p1';
    const tableOneThirdB = 'indices-p1';
    const tableTwoThirds = 'services-p1';
    const services = [
      ...buildReplicaRows(NON_PRIORITY_NODES_PARTITION_ID, [TEST_NODE_A, TEST_NODE_B, TEST_NODE_C]),
      ...buildReplicaRows(tableOneThirdA, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
      ...buildReplicaRows(tableOneThirdB, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
      ...buildReplicaRows(tableTwoThirds, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_C]),
    ];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: NON_PRIORITY_NODES_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: tableOneThirdA, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: tableOneThirdB, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: tableTwoThirds, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: 'config-p1', replica_count: REPLICATION_FACTOR_THREE},
      ],
      services: [
        ...services,
        ...buildReplicaRows('config-p1', [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
      ],
    });

    const wakeLog = new Map();
    const makeEntity = (partitionId) => {
      const log = {enqueued: [], scheduled: []};
      wakeLog.set(partitionId, log);
      const entity = createTestRebalancer({
        entityId: partitionId,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_A,
        systemTableCache,
        rebalanceCoordinator: coordinator,
        nowFn: () => nowMs,
      });
      entity.isLeader = true;
      entity.getAvailableNodes = () => nodes;
      entity.enqueueRebalanceCheck = (reason) => {
        log.enqueued.push(reason);
        return true;
      };
      entity.scheduleNextCheck = (delayMs) => {
        log.scheduled.push(delayMs);
      };
      return entity;
    };

    const oneThirdA = makeEntity(tableOneThirdA);
    const twoThirds = makeEntity(tableTwoThirds);
    const oneThirdB = makeEntity(tableOneThirdB);
    const degradedEntity = makeEntity('config-p1');
    const priorityEntity = makeEntity(PRIORITY_OBSERVER_ID);

    try {
      // Fix 3A: disarmLocalMutationReadinessWake does NOT disarm operationContinuationWake,
      // and DEGRADED traffic-readiness blocker prevents arming non-priority continuation wake.
      degradedEntity.getCriticalSystemTrafficReadinessBlocker = () => ({phase: 'DEGRADED'});
      degradedEntity.syncLocalMutationReadinessWake(true);
      t.equal(
        Boolean(degradedEntity.operationContinuationWakeState),
        false,
        'DEGRADED traffic-readiness blocker prevents arming non-priority continuation wake',
      );
      priorityEntity.syncLocalMutationReadinessWake(true);
      priorityEntity.disarmLocalMutationReadinessWake();
      t.equal(
        priorityEntity.operationContinuationWakeState?.clearPriorityCheckFloorOnTerminal,
        true,
        'disarmLocalMutationReadinessWake preserves clearPriorityCheckFloorOnTerminal on priority partitions',
      );

      // Arm 1/3 first, then 2/3, then second 1/3.
      oneThirdA.syncOperationContinuationWake(null, ZERO_COUNT);
      twoThirds.syncOperationContinuationWake(null, ZERO_COUNT);
      oneThirdB.syncOperationContinuationWake(null, ZERO_COUNT);
      oneThirdA.syncLocalMutationReadinessWake(false);
      t.equal(
        oneThirdA.operationContinuationWakeState?.awaitingBudgetSlotRelease,
        true,
        'disarmLocalMutationReadinessWake preserves armed slot-release continuation wake',
      );

      // Fix 3C: Depth-first 2/3 contender beats earlier-registered 1/3 contender on 0002 release.
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'op-release-b',
          partitionId: 'unrelated-p1',
          targetNodeId: TEST_NODE_B,
          type: OperationType.REPLACE,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
        },
      });
      await Promise.resolve();
      t.same(
        wakeLog.get(tableTwoThirds).enqueued,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'Fix 3C: 2/3 contender wins 0ms slot over earlier-registered 1/3 contenders',
      );
      t.same(
        wakeLog.get(tableOneThirdA).enqueued,
        [],
        '1/3 contender is staggered instead of stealing 0ms from 2/3',
      );
      t.ok(
        oneThirdA.operationContinuationWakeState !== null &&
          oneThirdB.operationContinuationWakeState !== null,
        'Fix 3B: non-winner contenders remain armed after staggered wake',
      );

      // Fix 3B: Immediate back-to-back completion on 0003 wakes an armed contender at 0ms!
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'op-release-c',
          partitionId: 'unrelated-p2',
          targetNodeId: TEST_NODE_C,
          type: OperationType.REPLACE,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
        },
      });
      await Promise.resolve();
      t.same(
        wakeLog.get(tableOneThirdA).enqueued,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'Fix 3B: non-disarmed contender wins 0ms wake on back-to-back 0003 completion',
      );

      // Fix 3C Baton Handoff: if the 0ms slot winner finishes checkRebalance with 0 moves,
      // baton hands off to the next eligible armed contender (oneThirdB) at 0ms.
      oneThirdA.getPolicy = async () => ({
        targetReplicaCount: REPLICATION_FACTOR_THREE,
        placementConstraints: {spreadAcrossNodes: true},
      });
      oneThirdA.evaluateState = async () => true;
      oneThirdA.rebalance = async () => ({success: true, moves: [], reason: 'no_changes_needed'});
      oneThirdA.lastCheckAtMs = ZERO_COUNT;
      nowMs += 10_000;
      await oneThirdA.checkRebalance();
      t.same(
        wakeLog.get(tableOneThirdB).enqueued,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'Fix 3C baton handoff wakes next eligible contender when 0ms winner executes 0 moves',
      );

      // Fix 3D: safety cadence uses ~3x getPriorityRetryDelayMs() + jitter while armed.
      const scheduledSafetyDelay = oneThirdA.scheduledCheck ?
        null :
        wakeLog.get(tableOneThirdA).scheduled.at(-1);
      t.ok(
        scheduledSafetyDelay >= 3 * oneThirdA.getPriorityRetryDelayMs(),
        'Fix 3D: ordinary continuation-armed partition schedules >= 3x priority retry safety check',
      );
    } finally {
      oneThirdA.shutdown();
      twoThirds.shutdown();
      oneThirdB.shutdown();
      degradedEntity.shutdown();
      priorityEntity.shutdown();
    }
  });

test(
  'ordinary system partitions yield slotMatch to under-spread nodes-p1 until nodes-p1 reaches 3 hosts',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const services = [
      ...buildReplicaRows(NON_PRIORITY_NODES_PARTITION_ID, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_B]),
      ...buildReplicaRows(ORDINARY_SYSTEM_PARTITION_ID, [TEST_NODE_A, TEST_NODE_A, TEST_NODE_A]),
    ];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: NON_PRIORITY_NODES_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: ORDINARY_SYSTEM_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      ],
      services,
    });
    const ordinaryEnqueued = [];
    const ordinary = createTestRebalancer({
      entityId: ORDINARY_SYSTEM_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    ordinary.isLeader = true;
    ordinary.getAvailableNodes = () => nodes;
    ordinary.enqueueRebalanceCheck = (reason) => {
      ordinaryEnqueued.push(reason);
      return true;
    };
    ordinary.syncOperationContinuationWake(null, ZERO_COUNT);

    try {
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'nodes-move-1',
          partitionId: NON_PRIORITY_NODES_PARTITION_ID,
          targetNodeId: TEST_NODE_B,
          type: OperationType.REPLACE,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
        },
      });
      await Promise.resolve();
      t.same(
        ordinaryEnqueued,
        [],
        'ordinary system partition yields slotMatch while nodes-p1 has < 3 distinct active hosts',
      );
      t.equal(
        ordinary.operationContinuationWakeState?.awaitingBudgetSlotRelease,
        true,
        'ordinary partition remains armed while yielding to nodes-p1',
      );

      // Once nodes-p1 completes Move 2 onto 0003, ordinary partition wakes immediately on completion.
      services[1].node_id = TEST_NODE_C;
      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: 'nodes-move-2',
          partitionId: NON_PRIORITY_NODES_PARTITION_ID,
          targetNodeId: TEST_NODE_C,
          type: OperationType.REPLACE,
          status: ReplicaStatus.REMOVED,
          workflowStep: WORKFLOW_STEP.REMOVED,
        },
      });
      await Promise.resolve();
      t.same(
        ordinaryEnqueued,
        [RECONCILE_REASON.PERIODIC_CHECK],
        'ordinary system partition wakes immediately once nodes-p1 reaches 3 distinct hosts',
      );
    } finally {
      ordinary.shutdown();
    }
  });

test(
  'freshness_not_current async readiness refresh restores joiners before planning gates, ' +
    'preserves nodes-p1 Move 2 spread exemption + Phase B capacity, and runs continuation wake in finally',
  async (t) => {
    initializeTestEnvironment();
    const nowMs = INITIAL_NOW_MS;
    const nowFn = () => nowMs;
    const nodes = buildReadyThreeNodes(nowMs);
    const coordinator = createEventedTestCoordinator();
    const operations = [{
      operation_id: 'other-sys-op-c',
      partition_id: ORDINARY_SYSTEM_PARTITION_ID,
      type: OperationType.REPLACE,
      target_node_id: TEST_NODE_C,
      status: ReplicaStatus.SYNCING,
      workflow_step: WORKFLOW_STEP.SYNCING,
      created_at: nowMs,
      updated_at: nowMs,
      completed_at: null,
    }];
    const systemTableCache = createObservableSystemTableCache({
      nodes,
      partitions: [
        {partition_id: NON_PRIORITY_NODES_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
        {partition_id: ORDINARY_SYSTEM_PARTITION_ID, replica_count: REPLICATION_FACTOR_THREE},
      ],
      services: [
        ...buildReplicaRows(NON_PRIORITY_NODES_PARTITION_ID, [
          TEST_NODE_A, TEST_NODE_A, TEST_NODE_B,
        ]),
        ...buildReplicaRows(ORDINARY_SYSTEM_PARTITION_ID, [
          TEST_NODE_A, TEST_NODE_A, TEST_NODE_A,
        ]),
      ],
      operations,
    });
    const baseReadiness = createMockControlPlaneReadinessService({
      systemTableCache, now: nowFn,
    });
    const refreshedNodeIds = [];
    const refreshedSet = new Set();
    const readinessService = {
      ...baseReadiness,
      getNodeReadinessSync(nodeId, options = {}) {
        const fresh = baseReadiness.getNodeReadinessSync(nodeId, options);
        if (nodeId !== TEST_NODE_A && !refreshedSet.has(nodeId)) {
          return {
            ...fresh,
            state: 'deferred',
            readinessPlanningTokenStatus: 'stale',
            failedTerms: ['freshness_not_current'],
            reasons: [{code: 'planning_snapshot_refresh_pending'}],
            dimensions: {
              ...fresh.dimensions,
              controlPlaneRecoveryEligible: false,
              repairEligible: false,
            },
          };
        }
        return fresh;
      },
      async getNodeReadiness(nodeId, options = {}) {
        refreshedNodeIds.push(nodeId);
        refreshedSet.add(nodeId);
        return baseReadiness.getNodeReadinessSync(nodeId, options);
      },
    };
    armActivePrioritySpreadFence(readinessService, nowFn);
    const nodesRebalancer = createTestRebalancer({
      entityId: NON_PRIORITY_NODES_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService: readinessService,
      nowFn,
    });
    nodesRebalancer.isLeader = true;
    try {
      t.equal(
        nodesRebalancer.isPartitionBelowDeclaredDistinctHostSpread(),
        true,
        'nodes-p1 at [0001, 0001, 0002] remains below declared spread against 3 committed cluster hosts',
      );
      t.equal(
        nodesRebalancer.resolvePrioritySpreadPlanningGateDecision(),
        null,
        'nodes-p1 at [0001, 0001, 0002] bypasses the 70s stability fence',
      );
      const policy = {
        targetReplicaCount: REPLICATION_FACTOR_THREE,
        minReplicaCount: REPLICATION_FACTOR_THREE,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };
      t.equal(
        await nodesRebalancer.evaluateState(policy),
        true,
        'evaluateState refreshes freshness_not_current joiners and detects Move 2 needed',
      );
      t.same(refreshedNodeIds.sort(), [TEST_NODE_B, TEST_NODE_C]);
      t.equal(nodesRebalancer.getAvailableNodes().length, REPLICATION_FACTOR_THREE);
      const currentReplicas = nodesRebalancer.getCurrentReplicas();
      const targetState = await nodesRebalancer.calculateTargetState(currentReplicas, policy);
      const plannedMoves = nodesRebalancer.calculateMoves(currentReplicas, targetState);
      t.equal(plannedMoves.length, SINGLE_WAKE_COUNT);
      t.equal(plannedMoves[0].nodeId, TEST_NODE_C, 'nodes-p1 Move 2 targets joiner 0003');
      refreshedSet.delete(TEST_NODE_C);
      t.equal(
        nodesRebalancer.getAvailableNodes().length,
        2,
        'later deferred getNodeReadinessSync fails closed without serving a shadow-cached refresh',
      );
      refreshedSet.add(TEST_NODE_C);
      nodesRebalancer.disarmOperationContinuationWake();
      nodesRebalancer.rebalance = async () => {
        throw new Error('simulated rebalance failure');
      };
      await t.rejects(
        nodesRebalancer.advanceCheckCadence(true, policy),
        /simulated rebalance failure/,
        'advanceCheckCadence propagates unexpected rebalance error',
      );
      t.equal(
        nodesRebalancer.operationContinuationWakeState?.awaitingBudgetSlotRelease,
        true,
        'finally block in advanceCheckCadence arms continuation wake even when rebalance() throws',
      );
    } finally {
      nodesRebalancer.shutdown();
    }
  },
);
