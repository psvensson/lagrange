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
  MoveType,
  ReplicaStatus,
  NodeStatus,
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
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
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
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {registerPriorityRecoveryFollowUpTestCases} from './unified-rebalancer-priority-recovery-follow-up-test-cases.js';
import {registerPriorityRecoverySerialWaitTestCases} from './unified-rebalancer-priority-recovery-serial-wait-test-cases.js';

import {
  createMockCdcService,
  createMockPolicyService,
  createMockReadinessService,
} from './unified-rebalancer-test-support.js';

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
// Create mock table policy service
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
const REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A = 'replica_operations-p1-r1';
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
  PRIORITY_NON_LOCAL_MOVE_REASON: 'priority_non_local_move',
  PRIORITY_PUBLICATION_ID: 'priority-publication',
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
    'checkRebalance requires explicit no-serial evidence before bypassing ordinary priority serial wait',
  SCHEDULES_RECONSTRUCTED_SQL_WRITE_WITHOUT_SERIAL_WAIT:
    'checkRebalance preserves no-serial evidence for reconstructed sql_write_operations priority recovery',
  RECLAIMS_CURRENT_NEEDS_OPERATION:
    'checkRebalance reclaims current needs_operation follow-up work when closure-witness surrogate progress only points at another partition',
  SCHEDULES_CURRENT_REPLICA_OPERATIONS_NEEDS_OPERATION:
    'checkRebalance schedules current replica_operations needs_operation work before non-local priority candidates',
  PREPENDS_CURRENT_REPLICA_OPERATIONS_BEFORE_NON_LOCAL_MOVES:
    'checkRebalance prepends current replica_operations needs_operation work before calculated non-local moves',
  RESETS_INTERVAL_ON_ACTIONABLE_MOVES:
    'checkRebalance resets interval when actionable moves are executed',
  SHORT_RETRY_NO_ACTIONABLE_MOVES:
    'checkRebalance keeps priority control-plane partitions on short retry cadence when no actionable moves execute',
  SHORT_RETRY_STABLE_STATE:
    'checkRebalance keeps priority control-plane partitions on short retry cadence when state is currently stable',
  SUITE: 'UnifiedRebalancer - Rebalancing Triggers chunk 2',
  BYPASSES_STARTUP_AND_STABILIZATION_GATES:
    'checkRebalance lets priority recovery operation creation bypass startup cluster and stabilization gates',
  ENQUEUES_PUBLICATION_EVENT_OPERATION_CREATION:
    'priority recovery publication events enqueue needs_operation scheduling',
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
  CURRENT_REPLICA_NEEDS_OPERATION_PERSISTS_OPERATION:
    'current replica_operations needs_operation should persist one recovery operation',
  CURRENT_REPLICA_NEEDS_OPERATION_RETARGETS_PARTITION:
    'current replica_operations needs_operation should target the current partition',
  CURRENT_REPLICA_NEEDS_OPERATION_RUNS_ONE_MOVE:
    'current replica_operations needs_operation should execute one scheduling move',
  CURRENT_REPLICA_NEEDS_OPERATION_USES_ELIGIBLE_TARGET:
    'current replica_operations needs_operation should use the remaining eligible target node',
  CURRENT_REPLICA_PREPENDED_BEFORE_NON_LOCAL_MOVE:
    'current replica_operations needs_operation should run before the non-local calculated move',
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
  PRIORITY_PUBLICATION_EVENT_ENQUEUES_PUBLICATION:
    'publication event should enqueue publication reconciliation',
  PRIORITY_PUBLICATION_EVENT_ENQUEUES_REBALANCE:
    'publication event should enqueue rebalance scheduling',
  PRIORITY_PUBLICATION_EVENT_HANDLED:
    'publication event with current needs_operation should be handled',
  PRIORITY_PUBLICATION_EVENT_REASON:
    'publication event should use the priority recovery progress reason',
  PRIORITY_PUBLICATION_EVENT_VISIBILITY_PROGRESS:
    'publication event should classify priority recovery visibility progress',
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
  SQL_TRANSACTIONS_MISSING_SERIAL_WAIT_BLOCKS_OPERATION:
    'sql_transactions missing serial-wait evidence should wait behind ordinary priority work',
  SQL_WRITE_RECONSTRUCTED_NO_SERIAL_WAIT_PERSISTS_OPERATION:
    'reconstructed sql_write_operations no-serial follow-up should persist one recovery operation',
  SQL_WRITE_RECONSTRUCTED_NO_SERIAL_WAIT_RETARGETS_PARTITION:
    'reconstructed sql_write_operations no-serial follow-up should target the current blocker',
  ROUTER_PRESSURE_DEFER_SCHEDULES_DELAY:
    'router pressure defer should schedule a delayed retry',
  ROUTER_PRESSURE_DEFERS_BEFORE_EVALUATION:
    'router pressure should defer the periodic cycle before evaluation',
});

const PRIORITY_RECOVERY_REBALANCER_TEST_CONTEXT = Object.freeze({
  createMockCache,
  createMockCoordinator,
  createMockReadinessService,
  createTestRebalancer,
  EntityType,
  MoveType,
  NodeStatus,
  OperationType,
  PRIORITY_FOLLOW_UP_NODE_ID_A,
  PRIORITY_FOLLOW_UP_NODE_ID_B,
  PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
  PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
  PRIORITY_RECOVERY_ABSENT_OPERATION,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
  PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PUBLICATION_EPOCH,
  PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
  PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
  PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKER_REASON,
  PRIORITY_RECOVERY_SPREAD_GAP,
  PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
  PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
  PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
  PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
  PRIORITY_SURROGATE_CREATED_OPERATION_ID,
  PRIORITY_SURROGATE_PENDING_OPERATION_ID,
  REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
  REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
  ReplicaStatus,
  SERVICE_TYPE,
  SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
  SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
  SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
  SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
  SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
  SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
  SYSTEM_TABLE_NAME,
  TEST_MESSAGE,
  TEST_NAME,
  TEST_NUMBER,
  TEST_SCALAR,
  TriggerType,
  WORKFLOW_STEP,
  CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
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
    'checkRebalance lets priority recovery operation creation bypass empty local node cache',
    async (t) => {
      const TEST_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_PUBLICATION_EPOCH = 7;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const TEST_READY_DISTINCT_NODE_COUNT = 1;
      const TEST_SPREAD_GAP = 2;
      const TEST_NODE_ID_A = 'node-1';
      const TEST_NODE_ID_B = 'node-2';
      const TEST_NODE_ID_C = 'node-3';
      const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
        'eligible_but_no_operation_created';
      const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
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
      const cache = createMockCache([]);
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
        nodes: [],
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

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        TEST_NUMBER.ONE,
        'checkRebalance lets priority recovery operation creation bypass empty local node cache',
      );
    },
  );

  await t.test(
    TEST_NAME.ENQUEUES_PUBLICATION_EVENT_OPERATION_CREATION,
    async (t) => {
      const nodeRows = Object.freeze([
        Object.freeze({
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        }),
        Object.freeze({
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        }),
      ]);
      const priorityPartitionSummary = Object.freeze({
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        })]),
      });
      const planningSnapshot = Object.freeze({
        publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        publishedActiveNodeIds: Object.freeze([
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ]),
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: Object.freeze({
          snapshots: Object.freeze([Object.freeze({
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            blockerReasons: Object.freeze([
              PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
            ]),
            progress: Object.freeze({
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                  .CREATE_RECOVERY_OPERATION,
            }),
            planner: Object.freeze({
              requiredDistinctNodeCount:
                PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
                PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                PRIORITY_FOLLOW_UP_NODE_ID_A,
                PRIORITY_FOLLOW_UP_NODE_ID_B,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                PRIORITY_FOLLOW_UP_NODE_ID_A,
                PRIORITY_FOLLOW_UP_NODE_ID_B,
              ]),
            }),
          })]),
        }),
      });
      const cache = createMockCache(
        nodeRows,
        [],
        [Object.freeze({
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        })],
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        nodes: nodeRows,
        controlPlaneReadinessService: readinessService,
      });
      const event = Object.freeze({
        tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
        data: Object.freeze({
          publication_id: TEST_SCALAR.PRIORITY_PUBLICATION_ID,
          priority_partition_summary: JSON.stringify(priorityPartitionSummary),
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        }),
      });
      const rebalanceReasons = [];
      const publicationReasons = [];

      rebalancer.setLeader(true);
      rebalancer.enqueueRebalanceCheck = (reason) => {
        rebalanceReasons.push(reason);
        return true;
      };
      rebalancer.enqueueMembershipPublicationReconcile = (reason) => {
        publicationReasons.push(reason);
        return true;
      };

      const decision =
        rebalancer.buildPriorityRecoveryVisibilityRebalanceDecision(event);
      const handled = rebalancer.handlePriorityRecoveryVisibilityEvent(event);

      t.equal(
        decision.visibilityProgress,
        true,
        TEST_MESSAGE.PRIORITY_PUBLICATION_EVENT_VISIBILITY_PROGRESS,
      );
      t.equal(
        handled,
        true,
        TEST_MESSAGE.PRIORITY_PUBLICATION_EVENT_HANDLED,
      );
      t.equal(
        rebalanceReasons.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.PRIORITY_PUBLICATION_EVENT_ENQUEUES_REBALANCE,
      );
      t.equal(
        publicationReasons.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.PRIORITY_PUBLICATION_EVENT_ENQUEUES_PUBLICATION,
      );
      t.equal(
        rebalanceReasons[TEST_NUMBER.ZERO],
        RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
        TEST_MESSAGE.PRIORITY_PUBLICATION_EVENT_REASON,
      );
    },
  );

  await registerPriorityRecoveryFollowUpTestCases(
    t,
    PRIORITY_RECOVERY_REBALANCER_TEST_CONTEXT,
  );
  await registerPriorityRecoverySerialWaitTestCases(
    t,
    PRIORITY_RECOVERY_REBALANCER_TEST_CONTEXT,
  );
});
