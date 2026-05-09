/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
} from '../../src/cdc/cdc-integration-service.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_SCALAR.CONFIG_NODE_ID},
      logging: {level: TEST_SCALAR.LOG_LEVEL_ERROR},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: TEST_SCALAR.LOG_LEVEL_ERROR});
  }
}

// Create a mock system table cache
function createMockCache(
  nodes = [],
  services = [],
  partitions = [],
  tables = [],
  replicaOperations = [],
  nodeEndpoints = [],
  serviceEndpoints = [],
) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    connection_state: Object.hasOwn(node, 'connection_state') ?
      node.connection_state : TEST_SCALAR.CONNECTION_STATE_READY,
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + TEST_NUMBER.READY_LEASE_DURATION_MS,
    ...node,
  }));
  const cache = {
    nodes: new Map(normalizedNodes.map((node) => [node.node_id, node])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(partitions.map((p) => [p.partition_id, p])),
    tables: new Map(tables.map((t) => [t.table_id, t])),
    message_groups: new Map(),
    replica_operations: new Map(replicaOperations.map((op) => [op.operation_id, op])),
    node_endpoints: new Map(nodeEndpoints.map((row, index) => [index, row])),
    service_endpoints:
      new Map(serviceEndpoints.map((row, index) => [index, row])),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
}

// Create mock CDC integration service
function createMockCdcService() {
  return {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

// Create mock table policy service
function createMockPolicyService(partitions = [], tables = []) {
  return {
    getPolicyForPartition: (partitionId) => {
      const partition = partitions.find((p) => p.partition_id === partitionId);
      if (!partition) return {...DEFAULT_TABLE_POLICY};
      const table = tables.find((t) => t.table_id === partition.table_id);
      if (!table || !table.table_policies) return {...DEFAULT_TABLE_POLICY};
      try {
        return {...DEFAULT_TABLE_POLICY, ...JSON.parse(table.table_policies)};
      } catch (_e) {
        return {...DEFAULT_TABLE_POLICY};
      }
    },
    getMessageGroupPolicy: async () => ({...DEFAULT_MESSAGE_GROUP_POLICY}),
  };
}

// Create mock message router
function createMockMessageRouter(
  connectionState = TEST_SCALAR.CONNECTION_STATE_CONNECTED,
  connectedNodes = [],
) {
  return {
    getConnectionState: () => connectionState,
    getConnectedNodes: () => [...connectedNodes],
    deliver: async () => MOCK_DELIVERY_RESULT,
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

// Create mock rebalance coordinator
function createMockCoordinator() {
  const storageAccountingService = {
    estimateReplicaBytes: () => 1,
  };
  const storageAdmissionService = {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: TEST_SCALAR.OPERATION_ID_PREFIX + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    // getStats is called synchronously by UnifiedRebalancer.getStats()
    getStats: () => ({
      operationsCreated: TEST_NUMBER.ZERO,
      operationsCompleted: TEST_NUMBER.ZERO,
      operationsFailed: TEST_NUMBER.ZERO,
      operationsTimedOut: TEST_NUMBER.ZERO,
      inFlightOperations: TEST_NUMBER.ZERO,
      totalOperations: TEST_NUMBER.ZERO,
    }),
    storageAccountingService,
    storageAdmissionService,
  };
}

// Create mock readiness service backed by the same cache
function createMockReadinessService(mockCache) {
  return {
    getNodeReadinessSync: (nodeId) => {
      const nodeRow = mockCache.get('nodes', nodeId);
      if (!nodeRow) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [],
        };
      }
      const now = Date.now();
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      const leaseValid =
        Number.isFinite(leaseExpiry) && leaseExpiry > now;
      const isActive = nodeRow.status === 'active';
      const healthy = isActive && leaseValid;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
            healthy,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: healthy,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
            healthy,
        },
        reasons: [],
      };
    },
    getNodeReadiness: async (nodeId) => {
      return createMockReadinessService(mockCache)
        .getNodeReadinessSync(nodeId);
    },
  };
}

// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = TEST_SCALAR.DEFAULT_PARTITION_ID,
    entityType = EntityType.PARTITION,
    nodeId = TEST_SCALAR.DEFAULT_NODE_ID,
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = TEST_SCALAR.CONNECTION_STATE_CONNECTED,
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    nodeEndpoints,
    serviceEndpoints,
  );
  const mockCdcService = cdcIntegrationService || createMockCdcService();
  const mockPolicyService = createMockPolicyService(
    partitions, tables,
  );
  const mockMessageRouter = messageRouter ||
    createMockMessageRouter(connectionState);
  const mockCoordinator = rebalanceCoordinator || createMockCoordinator();
  const mockSqlQueryEngine = sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  const mockReadinessService = controlPlaneReadinessService ||
    createMockReadinessService(mockCache);

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService: mockReadinessService,
    bootstrapReadinessState,
    nowFn,
    priorityRecoveryActivityStaleGraceMs,
  });
}

const PRIORITY_FOLLOW_UP_NODE_ID_A = 'node-priority-a';
const PRIORITY_FOLLOW_UP_NODE_ID_B = 'node-priority-b';
const PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX = 'addr-';
const PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER = 'voter';
const PRIORITY_RECOVERY_PUBLICATION_EPOCH = 7;
const PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL = 2;
const PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT = 1;
const PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT = 2;
const PRIORITY_RECOVERY_SPREAD_GAP = 1;
const PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED = false;
const PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING = true;
const PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
const PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT =
  'recovering_in_flight';
const PRIORITY_SURROGATE_CREATED_OPERATION_ID =
  'priority-created-operation';
const PRIORITY_SURROGATE_PENDING_OPERATION_ID =
  'priority-surrogate-pending-operation';
const PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS =
  'wait_for_operation_progress';
const PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKER_REASON =
  'priority_operation_serial_wait';
const PRIORITY_RECOVERY_ABSENT_OPERATION = null;
const SQL_TRANSACTIONS_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A = 'sql_transactions-p1-r1';
const SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID =
  'sql_transaction_participants-p1';
const SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A =
  'sql_transaction_participants-p1-r1';
const SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A = 'sql_write_operations-p1-r1';
const CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID =
  'control_plane_publications-p1';
const REPLICA_OPERATIONS_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID =
  'priority-serial-wait-publication';
const PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID =
  'priority-serial-wait-replica-operation';
const PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID =
  'priority-serial-wait-transaction';
const PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID =
  'priority-existing-ordinary-operation';
const TEST_NUMBER = Object.freeze({
  ZERO: 0,
  ONE: 1,
  READY_LEASE_DURATION_MS: 10000,
  RETRY_AFTER_MS: 250,
});
const TEST_SCALAR = Object.freeze({
  CONFIG_NODE_ID: 'test-node',
  CONNECTION_STATE_CONNECTED: 'connected',
  CONNECTION_STATE_READY: 'ready',
  DEFAULT_NODE_ID: 'node-1',
  DEFAULT_PARTITION_ID: 'partition-1',
  DELIVERY_STATUS_COMPLETED: 'completed',
  EXECUTED_OPERATION_ADD: 'add',
  LOG_LEVEL_ERROR: 'error',
  OPERATION_ID_PREFIX: 'op-',
  SKIP_REASON_BUDGET_EXCEEDED: 'budget_exceeded',
  TYPE_NUMBER: 'number',
});
const MOCK_DELIVERY_RESULT = Object.freeze({
  acknowledged: true,
  status: TEST_SCALAR.DELIVERY_STATUS_COMPLETED,
});
const TEST_NAME = Object.freeze({
  CONTAINED_ROUTER_PRESSURE:
    'checkRebalance lets blocked priority recovery continue under contained router pressure',
  CREATE_MISSING_WORK_UNDER_CRITICAL_RESERVE:
    'checkRebalance lets blocked priority recovery create missing work when the control-plane critical reserve is exhausted',
  DEFERS_FOR_LOCAL_ROUTER_BACKPRESSURE:
    'checkRebalance defers periodic work when local router is backpressured',
  DEFERS_UNDER_CRITICAL_RESERVE:
    'checkRebalance defers blocked priority recovery when the control-plane critical reserve is exhausted',
  PRESERVES_PRIORITY_RETRY_AFTER_FAILURE:
    'checkRebalance preserves priority retry cadence after retryable control-plane failures',
  RECONSTRUCTS_CURRENT_NEEDS_OPERATION:
    'checkRebalance reconstructs current needs_operation follow-up when stale serial-wait planning lacks closure witness',
  SCHEDULES_SQL_TRANSACTIONS_WITHOUT_SERIAL_WAIT:
    'checkRebalance schedules sql_transactions needs_operation follow-up when no serial wait remains',
  RECLAIMS_CURRENT_NEEDS_OPERATION:
    'checkRebalance reclaims current needs_operation follow-up work when closure-witness surrogate progress only points at another partition',
  RESETS_INTERVAL_ON_ACTIONABLE_MOVES:
    'checkRebalance resets interval when actionable moves are executed',
  SHORT_RETRY_NO_ACTIONABLE_MOVES:
    'checkRebalance keeps priority control-plane partitions on short retry cadence when no actionable moves execute',
  SHORT_RETRY_STABLE_STATE:
    'checkRebalance keeps priority control-plane partitions on short retry cadence when state is currently stable',
  SUITE: 'UnifiedRebalancer - Rebalancing Triggers chunk 2',
  BYPASSES_STARTUP_AND_STABILIZATION_GATES:
    'checkRebalance lets priority recovery operation creation bypass startup cluster and stabilization gates',
});
const TEST_MESSAGE = Object.freeze({
  CACHED_PLANNING_IDENTIFIES_MISSING_PRIORITY_WORK:
    'cached planning evidence should identify missing priority work',
  CONTAINED_PRESSURE_DOES_NOT_SUPPRESS_BLOCKED_PARTITION:
    'contained pressure should not suppress the blocked priority partition',
  CRITICAL_RESERVE_DEFERS_BEFORE_EVALUATION:
    'critical reserve exhaustion should defer before evaluation',
  CURRENT_NEEDS_OPERATION_SCHEDULES_FOLLOW_UP:
    'current needs_operation partition should still schedule one follow-up move',
  ENTITY_SCOPED_CACHE_INFERRED_OWNERSHIP:
    'entity-scoped cache reads should infer partition ownership instead of dropping malformed syncing rows',
  FALLBACK_PERSISTS_ONE_RECOVERY_OPERATION:
    'fallback should persist one recovery operation',
  FALLBACK_RETARGETS_CURRENT_BLOCKED_PARTITION:
    'fallback should keep recovery work on the current blocked partition',
  FALLBACK_USES_REMAINING_ELIGIBLE_TARGET:
    'fallback follow-up should use the remaining eligible target node',
  INTERVAL_RESETS_WHEN_ACTIONABLE_MOVES_EXECUTE:
    'interval should reset when actionable moves execute',
  MISSING_PRIORITY_WORK_REACHES_EVALUATION:
    'missing priority work should reach evaluation despite critical reserve exhaustion',
  PRIORITY_OPERATION_CREATION_BYPASSES_STARTUP_GATES:
    'priority operation creation should not wait behind startup planning gates',
  PRIORITY_PARTITIONS_KEEP_SHORT_RETRY_WHILE_WAITING:
    'priority partitions should keep the short retry cadence while waiting for the next convergence change',
  PRIORITY_PRESSURE_DEFER_KEEPS_SHORT_RETRY:
    'priority recovery pressure defer should keep the short retry cadence',
  PRIORITY_RETRY_LOOP_AFTER_TRANSIENT_FAILURE:
    'priority recovery should keep its short retry loop after transient control-plane failures',
  PRIORITY_SHORT_RETRY_CADENCE:
    'priority partitions should schedule the next check on the short retry cadence',
  RECONSTRUCTED_FOLLOW_UP_PERSISTS_OPERATION:
    'reconstructed current needs_operation should persist one recovery operation',
  RECONSTRUCTED_FOLLOW_UP_RETARGETS_CURRENT_PARTITION:
    'reconstructed current needs_operation should target the current partition',
  SQL_TRANSACTIONS_NO_SERIAL_WAIT_PERSISTS_OPERATION:
    'sql_transactions no-serial follow-up should persist one recovery operation',
  SQL_TRANSACTIONS_NO_SERIAL_WAIT_RETARGETS_PARTITION:
    'sql_transactions no-serial follow-up should target the current blocker',
  ROUTER_PRESSURE_DEFER_SCHEDULES_DELAY:
    'router pressure defer should schedule a delayed retry',
  ROUTER_PRESSURE_DEFERS_BEFORE_EVALUATION:
    'router pressure should defer the periodic cycle before evaluation',
});

test(TEST_NAME.SUITE, async (t) => {
  initializeTestEnvironment();
  await t.test(
    TEST_NAME.SHORT_RETRY_NO_ACTIONABLE_MOVES,
    async (t) => {
      const inferredOwnershipRebalancer = createTestRebalancer({
        entityId: 'sql_transactions-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        replicaOperations: [{
          operation_id: 'op-sql-transactions-r4',
          type: '',
          status: ReplicaStatus.SYNCING,
          workflow_step: WORKFLOW_STEP.SYNCING,
          replica_id: 'sql_transactions-p1-r4',
          steps_history: JSON.stringify([{
            step: WORKFLOW_STEP.PENDING,
            sourceReplicaId: 'sql_transactions-p1-r1',
            replicaIds: [
              'sql_transactions-p1-r2',
              'sql_transactions-p1-r3',
              'sql_transactions-p1-r4',
            ],
            peerAddresses: [
              'node-1/partition/sql_transactions-p1-r2',
              'node-1/partition/sql_transactions-p1-r3',
              'node-4/partition/sql_transactions-p1-r4',
            ],
          }, {
            step: WORKFLOW_STEP.SYNCING,
            readinessSnapshot: {
              nodeId: 'node-4',
            },
          }]),
        }],
      });

      t.equal(
        inferredOwnershipRebalancer.getInFlightOperations().length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.ENTITY_SCOPED_CACHE_INFERRED_OWNERSHIP,
      );

      const rebalancer = createTestRebalancer({
        entityId: 'sql_transactions-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.evaluateState = async () => true;
      const TEST_SKIPPED_MOVE_RESULT = Object.freeze({
        success: true,
        moves: [
          {success: false, skipped: true,
            reason: TEST_SCALAR.SKIP_REASON_BUDGET_EXCEEDED},
        ],
      });
      rebalancer.rebalance = async () => ({
        ...TEST_SKIPPED_MOVE_RESULT,
      });
      const scheduledDelays = [];
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelays.push(overrideDelayMs);
      };

      rebalancer.currentInterval = rebalancer.periodicCheckIntervalMs;

      await rebalancer.checkRebalance();

      t.equal(
        scheduledDelays[TEST_NUMBER.ZERO],
        rebalancer.getPriorityRetryDelayMs(),
        TEST_MESSAGE.PRIORITY_SHORT_RETRY_CADENCE,
      );
    },
  );

  await t.test(
    TEST_NAME.PRESERVES_PRIORITY_RETRY_AFTER_FAILURE,
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'sql_transactions-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.evaluateState = async () => true;
      rebalancer.rebalance = async () => {
        const error =
          new Error('Workflow participant replica_operations-p1 not found');
        error.deferRetry = true;
        error.retryAfterMs = TEST_NUMBER.RETRY_AFTER_MS;
        throw error;
      };
      const scheduledDelays = [];
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelays.push(overrideDelayMs);
      };

      await rebalancer.checkRebalance();

      t.same(
        scheduledDelays,
        [rebalancer.getPriorityRetryDelayMs()],
        TEST_MESSAGE.PRIORITY_RETRY_LOOP_AFTER_TRANSIENT_FAILURE,
      );
    },
  );

  await t.test(
    TEST_NAME.SHORT_RETRY_STABLE_STATE,
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'sql_transactions-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.evaluateState = async () => false;
      rebalancer.scheduleNextCheck = () => {};

      rebalancer.currentInterval = rebalancer.maxInterval;

      await rebalancer.checkRebalance();

      t.equal(
        rebalancer.currentInterval,
        rebalancer.getPriorityRetryDelayMs(),
        TEST_MESSAGE.PRIORITY_PARTITIONS_KEEP_SHORT_RETRY_WHILE_WAITING,
      );
    },
  );

  await t.test(TEST_NAME.RESETS_INTERVAL_ON_ACTIONABLE_MOVES, async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
      ],
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    const TEST_EXECUTED_MOVE_RESULT = Object.freeze({
      success: true,
      moves: [
        {
          success: true,
          skipped: false,
          operation: TEST_SCALAR.EXECUTED_OPERATION_ADD,
        },
      ],
    });
    rebalancer.rebalance = async () => ({...TEST_EXECUTED_MOVE_RESULT});
    rebalancer.scheduleNextCheck = () => {};

    rebalancer.currentInterval = rebalancer.maxInterval;

    await rebalancer.checkRebalance();

    t.equal(
      rebalancer.currentInterval,
      rebalancer.periodicCheckIntervalMs,
      TEST_MESSAGE.INTERVAL_RESETS_WHEN_ACTIONABLE_MOVES_EXECUTE,
    );
  });

  await t.test(TEST_NAME.DEFERS_FOR_LOCAL_ROUTER_BACKPRESSURE,
    async (t) => {
      const router = createMockMessageRouter('connected');
      const TEST_LOCAL_ROUTER_BACKPRESSURE_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: TEST_NUMBER.ONE,
        maxPendingUtilization: TEST_NUMBER.ONE,
      });
      router.getOutboundPressureSummary = () =>
        TEST_LOCAL_ROUTER_BACKPRESSURE_SUMMARY;
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        messageRouter: router,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = TEST_NUMBER.ZERO;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        TEST_NUMBER.ZERO,
        TEST_MESSAGE.ROUTER_PRESSURE_DEFERS_BEFORE_EVALUATION,
      );
      t.equal(
        typeof scheduledDelayMs,
        TEST_SCALAR.TYPE_NUMBER,
        TEST_MESSAGE.ROUTER_PRESSURE_DEFER_SCHEDULES_DELAY,
      );
    });

  await t.test(
    TEST_NAME.CONTAINED_ROUTER_PRESSURE,
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
      const TEST_CONTAINED_PRESSURE_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: 1,
        totalPending: 8,
        totalPendingCritical: 4,
        totalPendingBackground: 0,
        criticalReserveExhausted: false,
        maxPendingUtilization: 0.5,
      });
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () => TEST_CONTAINED_PRESSURE_SUMMARY;
      const rebalancer = createTestRebalancer({
        entityId: TEST_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        messageRouter: router,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.getPriorityRecoveryAdmissionPlan = () => Object.freeze({
        recoveryActive: true,
        hasBlockedPartition: (partitionId) =>
          partitionId === TEST_PRIORITY_PARTITION_ID,
      });

      let evaluateCalls = TEST_NUMBER.ZERO;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.CONTAINED_PRESSURE_DOES_NOT_SUPPRESS_BLOCKED_PARTITION,
      );
    },
  );

  await t.test(
    TEST_NAME.DEFERS_UNDER_CRITICAL_RESERVE,
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
      const TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: 1,
        totalPending: 36,
        totalPendingCritical: 36,
        totalPendingBackground: 0,
        criticalReserveExhausted: true,
        maxPendingUtilization: 0.5625,
      });
      const TEST_UNSCHEDULED = Symbol('unscheduled');
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () =>
        TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY;
      const rebalancer = createTestRebalancer({
        entityId: TEST_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        messageRouter: router,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.getPriorityRecoveryAdmissionPlan = () => Object.freeze({
        recoveryActive: true,
        hasBlockedPartition: (partitionId) =>
          partitionId === TEST_PRIORITY_PARTITION_ID,
      });

      let evaluateCalls = TEST_NUMBER.ZERO;
      let scheduledDelayMs = TEST_UNSCHEDULED;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return true;
      };
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        TEST_NUMBER.ZERO,
        TEST_MESSAGE.CRITICAL_RESERVE_DEFERS_BEFORE_EVALUATION,
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.getPriorityRetryDelayMs(),
        TEST_MESSAGE.PRIORITY_PRESSURE_DEFER_KEEPS_SHORT_RETRY,
      );
    },
  );

  await t.test(
    TEST_NAME.CREATE_MISSING_WORK_UNDER_CRITICAL_RESERVE,
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_PUBLICATION_EPOCH = 4;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_NODE_ID_D = 'node-4';
      const TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY = Object.freeze({
        backpressured: true,
        saturatedNodeCount: 1,
        totalPending: 36,
        totalPendingCritical: 36,
        totalPendingBackground: 0,
        criticalReserveExhausted: true,
        maxPendingUtilization: 0.5625,
      });
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: TEST_PRIORITY_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        })]),
        missingPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
          TEST_NODE_ID_D,
        ]),
        priorityPartitionSummary,
      });
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () =>
        TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY;
      const cache = createMockCache([
        {node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: TEST_NODE_ID_D, status: NodeStatus.ACTIVE},
      ]);
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {priorityPartitionSummary};
          },
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: TEST_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_ID_A,
        messageRouter: router,
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;

      let evaluateCalls = TEST_NUMBER.ZERO;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      const gateSnapshot =
      rebalancer.buildTransportBackpressurePlanningGateSnapshot();
      await rebalancer.checkRebalance();

      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationRequired,
        true,
        TEST_MESSAGE.CACHED_PLANNING_IDENTIFIES_MISSING_PRIORITY_WORK,
      );
      t.equal(
        evaluateCalls,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.MISSING_PRIORITY_WORK_REACHES_EVALUATION,
      );
    },
  );

  await t.test(
    TEST_NAME.BYPASSES_STARTUP_AND_STABILIZATION_GATES,
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_PUBLICATION_EPOCH = 7;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_CLUSTER_READINESS_CONDITION = 'cache_hydrated';
      const TEST_START_DELAY_MS = 60000;
      const TEST_STABILIZATION_DELAY_MS = 30000;
      const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
      'eligible_but_no_operation_created';
      const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
      const nodes = Object.freeze([
        Object.freeze({node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE}),
        Object.freeze({node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE}),
      ]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: TEST_PRIORITY_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: TEST_SPREAD_GAP,
        })]),
        missingPartitionIds: Object.freeze([TEST_PRIORITY_PARTITION_ID]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        projectedServingNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        locallyEligibleNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
        ]),
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([Object.freeze({
            partitionId: TEST_PRIORITY_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: Object.freeze([
              TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
            ]),
            progress: Object.freeze({
              nextRequiredAction: TEST_NEXT_ACTION_CREATE_OPERATION,
            }),
            planner: Object.freeze({
              requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
              spreadGap: TEST_SPREAD_GAP,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              concreteEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
              publishedActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          })]),
        }),
      });
      const cache = createMockCache(nodes);
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {priorityPartitionSummary};
          },
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: TEST_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: TEST_NODE_ID_A,
        nodes,
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = false;
      rebalancer.clusterReadinessSignal = {
        evaluate: () => Object.freeze({
          ready: false,
          unmetConditions: Object.freeze([TEST_CLUSTER_READINESS_CONDITION]),
        }),
      };
      rebalancer.getTimeUntilRebalanceStartEligible = () => TEST_START_DELAY_MS;
      rebalancer.isStabilized = () => false;
      rebalancer.getTimeUntilStabilized = () => TEST_STABILIZATION_DELAY_MS;
      rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;

      let evaluateCalls = TEST_NUMBER.ZERO;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.PRIORITY_OPERATION_CREATION_BYPASSES_STARTUP_GATES,
      );
    },
  );

  await t.test(
    TEST_NAME.RECLAIMS_CURRENT_NEEDS_OPERATION,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
      ];
      const serviceRows = [
        {
          service_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const partitionRows = [
        {
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        },
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        },
      ];
      const replicaOperations = [{
        operation_id: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        type: OperationType.REPLACE,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.PENDING,
        target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
      }];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
          {
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
        ],
      };
      const priorityRecoveryClosureWitness = {
        blockedPartitionIds: [
          SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        ],
        unresolvedSemanticStateIds: [
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
        ],
      };
      const planningSnapshot = {
        publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
        priorityPartitionSummary,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        },
        priorityRecoveryClosureWitness,
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
              blockerReasons: [],
              coordinator: {
                operationCount: TEST_NUMBER.ONE,
                operationIds: [PRIORITY_SURROGATE_PENDING_OPERATION_ID],
                operation: {
                  operationId: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
                  partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
                  targetNodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
                },
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
            },
            {
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKER_REASON],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
              },
            },
          ],
        },
      };
      const cache = createMockCache(
        nodeRows,
        serviceRows,
        partitionRows,
        [],
        replicaOperations,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return planningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
            };
          },
        },
      };
      const createdOperations = [];
      const coordinator = {
        ...createMockCoordinator(),
        createOperation: async (move) => {
          createdOperations.push(move);
          return {
            operationId: PRIORITY_SURROGATE_CREATED_OPERATION_ID,
            type: move.type,
            partitionId: move.partitionId,
            entityId: move.entityId,
            targetNodeId: move.nodeId,
            replicaId: move.replicaId,
            status: ReplicaStatus.PENDING,
            workflowStep: WORKFLOW_STEP.PENDING,
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
        replicaOperations,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () => TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      const result = await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        result.moves.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.CURRENT_NEEDS_OPERATION_SCHEDULES_FOLLOW_UP,
      );
      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.FALLBACK_PERSISTS_ONE_RECOVERY_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.FALLBACK_RETARGETS_CURRENT_BLOCKED_PARTITION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        TEST_MESSAGE.FALLBACK_USES_REMAINING_ELIGIBLE_TARGET,
      );
    },
  );

  await t.test(
    TEST_NAME.SCHEDULES_SQL_TRANSACTIONS_WITHOUT_SERIAL_WAIT,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
      ];
      const serviceRows = [
        {
          service_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const partitionRows = [
        {
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        },
        {
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        },
      ];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
        ],
      };
      const priorityRecoveryClosureWitness = {
        blockedPartitionIds: [
          SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        ],
        unresolvedSemanticStateIds: [
          PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        ],
      };
      const planningSnapshot = {
        publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
        priorityPartitionSummary,
        priorityRecoveryClosureWitness,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        },
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
              ],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .CREATE_RECOVERY_OPERATION,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
                serialWaitOperationCount: TEST_NUMBER.ZERO,
                serialWaitOperationIds: [],
                serialWaitPartitionIds: [],
              },
            },
          ],
        },
      };
      const cache = createMockCache(
        nodeRows,
        serviceRows,
        partitionRows,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return planningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
              priorityRecoveryClosureWitness,
            };
          },
        },
      };
      const createdOperations = [];
      const coordinator = {
        ...createMockCoordinator(),
        getConcurrentAddCountByPriorityClass: async () => ({
          priorityCount: TEST_NUMBER.ONE,
          ordinaryPriorityCount: TEST_NUMBER.ONE,
          emergencyPriorityCount: TEST_NUMBER.ZERO,
          nonPriorityCount: TEST_NUMBER.ZERO,
        }),
        createOperation: async (move) => {
          createdOperations.push(move);
          return {
            operationId: PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID,
            type: move.type,
            partitionId: move.partitionId,
            entityId: move.entityId,
            targetNodeId: move.nodeId,
            replicaId: move.replicaId,
            status: ReplicaStatus.PENDING,
            workflowStep: WORKFLOW_STEP.PENDING,
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.SQL_TRANSACTIONS_NO_SERIAL_WAIT_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.SQL_TRANSACTIONS_NO_SERIAL_WAIT_RETARGETS_PARTITION,
      );
    },
  );

  await t.test(
    TEST_NAME.RECONSTRUCTS_CURRENT_NEEDS_OPERATION,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
      ];
      const serviceRows = [
        {
          service_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const partitionRows = [
        {
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        },
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        },
      ];
      const replicaOperations = [
        {
          operation_id: PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
          partition_id: CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
      ];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
          {
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
        ],
      };
      const planningSnapshot = {
        publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId:
                SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
              ],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
                serialWaitOperationCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                serialWaitOperationIds: [
                  PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
                  PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
                  PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
                ],
                serialWaitPartitionIds: [
                  CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
                  REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
                  SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
                ],
              },
            },
            {
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
              blockerReasons: [],
              coordinator: {
                operationCount: TEST_NUMBER.ONE,
                operationIds: [PRIORITY_SURROGATE_PENDING_OPERATION_ID],
                operation: {
                  operationId: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
                  partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
                  targetNodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
                },
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
            },
          ],
        },
      };
      const cache = createMockCache(
        nodeRows,
        serviceRows,
        partitionRows,
        [],
        replicaOperations,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerBestEffort() {
          return planningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
            };
          },
        },
      };
      const createdOperations = [];
      const coordinator = {
        ...createMockCoordinator(),
        createOperation: async (move) => {
          createdOperations.push(move);
          return {
            operationId: PRIORITY_SURROGATE_CREATED_OPERATION_ID,
            type: move.type,
            partitionId: move.partitionId,
            entityId: move.entityId,
            targetNodeId: move.nodeId,
            replicaId: move.replicaId,
            status: ReplicaStatus.PENDING,
            workflowStep: WORKFLOW_STEP.PENDING,
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
        replicaOperations,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.RECONSTRUCTED_FOLLOW_UP_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.RECONSTRUCTED_FOLLOW_UP_RETARGETS_CURRENT_PARTITION,
      );
    },
  );
});
