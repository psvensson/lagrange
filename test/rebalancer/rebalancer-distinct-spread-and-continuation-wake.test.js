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
    'and minimum interval on no_changes_needed, and do not hard-skip when all targets are ' +
    'globally transitional',
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
      ],
      operations,
    });

    const concentrated = createTestRebalancer({
      entityId: CONCENTRATED_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    const spread = createTestRebalancer({
      entityId: SPREAD_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    const systemConcentrated = createTestRebalancer({
      entityId: NON_PRIORITY_NODES_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_A,
      systemTableCache,
      rebalanceCoordinator: coordinator,
      nowFn: () => nowMs,
    });
    concentrated.getAvailableNodes = () => nodes;
    spread.getAvailableNodes = () => nodes;
    systemConcentrated.getAvailableNodes = () => nodes;
    concentrated.isLeader = true;
    spread.isLeader = true;
    systemConcentrated.isLeader = true;

    try {
      const concentratedStartDelay = concentrated.getLeadershipStartDelayMs();
      const spreadStartDelay = spread.getLeadershipStartDelayMs();
      t.ok(
        concentratedStartDelay >= SINGLE_WAKE_COUNT &&
          concentratedStartDelay <= concentrated.getPriorityRetryDelayMs(),
        'below-distinct-spread partition uses short priority leadership start delay',
      );
      t.ok(
        spreadStartDelay >= spread.periodicCheckIntervalMs,
        'already-spread partition keeps 60s..120s leadership start delay',
      );

      // When no_changes_needed occurs with 0 own in-flight ops, below-spread partition arms
      // slot-release wake and resets interval to minimum (5s) instead of backing off to 90s.
      concentrated.currentInterval = concentrated.periodicCheckIntervalMs;
      concentrated.rebalance = async () => ({
        success: true,
        moves: [],
        reason: 'no_changes_needed',
      });
      const forcePriorityRetry = await concentrated.advanceCheckCadence(true);
      t.equal(
        forcePriorityRetry,
        true,
        'below-distinct-spread partition forces priority retry cadence on 0 executed moves',
      );
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

      // When own op is in flight and intermediate check returns no_changes_needed, keep
      // awaitingOwnOperationCompletion armed.
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

      // When BOTH 0002 and 0003 have cross-partition system adds in flight, MovePlanner does NOT
      // hard-skip all targets to [].
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
          partition_id: 'clusters-p1',
          type: OperationType.REPLACE,
          target_node_id: TEST_NODE_C,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
        },
      ];
      systemConcentrated.getGlobalTopologyBlockingInFlightOperations = () => globalOps;
      systemConcentrated.getInFlightOperations = () => [];
      const currentReplicas = systemConcentrated.getCurrentReplicas();
      const targetState = await systemConcentrated.calculateTargetState(currentReplicas, {
        targetReplicaCount: REPLICATION_FACTOR_THREE,
        minReplicaCount: REPLICATION_FACTOR_THREE,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      });
      const moves = systemConcentrated.calculateMoves(currentReplicas, targetState);
      t.ok(
        moves.length > ZERO_COUNT,
        'system partition emits REPLACE move when all needed target nodes are globally transitional',
      );
    } finally {
      concentrated.shutdown();
      spread.shutdown();
      systemConcentrated.shutdown();
    }
  });
