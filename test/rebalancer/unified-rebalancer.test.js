/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
} from '../../src/rebalancer/replica-status.js';
import {
  MOVE_REASON,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

import {
  registerUnifiedRebalancerLifecycleAndRecoveryProgressEventsTests,
} from './unified-rebalancer-lifecycle-and-recovery-progress-events-test-cases.js';
import {
  registerUnifiedRebalancerPlanningGateDecisionsTests,
} from './unified-rebalancer-planning-gate-decisions-test-cases.js';
import {
  createMockReadinessService,
} from './unified-rebalancer-test-support.js';
import {
  registerUnifiedRebalancerPriorityFollowupCreationTests,
} from './unified-rebalancer-priority-followup-creation-test-cases.js';
import {
  registerUnifiedRebalancerSurrogateFollowupSynthesisTests,
} from './unified-rebalancer-surrogate-followup-synthesis-test-cases.js';
import {
  registerUnifiedRebalancerClosureWitnessFollowupTests,
} from './unified-rebalancer-closure-witness-followup-test-cases.js';
import {
  registerUnifiedRebalancerBudgetArbitrationCleanupTests,
} from './unified-rebalancer-budget-arbitration-cleanup-test-cases.js';
const BACKPRESSURE_PENDING_COUNT = 2;
const BACKPRESSURE_MAX_PENDING = 2;
const PRIORITY_RECOVERY_PUBLICATION_EPOCH = 7;
const PRIORITY_RECOVERY_READY_REPLICA_COUNT = 2;
const PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT = 1;
const PRIORITY_RECOVERY_SPREAD_GAP = 1;
const REBALANCER_TEST_NODE_ID_A = 'node-1';
const REBALANCER_TEST_NODE_ID_B = 'node-2';
const REBALANCER_TEST_NODE_ID_C = 'node-3';
const REPLICA_OPERATION_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const REPLICA_OPERATION_PRIORITY_REPLICA_ID = 'replica_operations-p1-r1';
const REPLICA_OPERATION_PRIORITY_REPLICA_ID_B = 'replica_operations-p1-r2';
const REPLICA_OPERATION_PRIORITY_REPLICA_ID_C = 'replica_operations-p1-r3';
const SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A =
  'sql_write_operations-p1-r1';
const SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B =
  'sql_write_operations-p1-r2';
const SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C =
  'sql_write_operations-p1-r3';
const SQL_TRANSACTIONS_PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A = 'sql_transactions-p1-r1';
const SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_B = 'sql_transactions-p1-r2';
const SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_C = 'sql_transactions-p1-r3';
const SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D = 'sql_transactions-p1-r4';
const PRIORITY_PROGRESS_PARTITION_ID = 'control_plane_publications-p1';
const PRIORITY_PROGRESS_NODE_ID = 'node-1';
const PRIORITY_PROGRESS_OPERATION_ID = 'op-priority-progress';
const PRIORITY_FOLLOW_UP_NODE_ID_A = 'node-priority-a';
const PRIORITY_FOLLOW_UP_NODE_ID_B = 'node-priority-b';
const PRIORITY_FOLLOW_UP_NODE_ID_C = 'node-priority-c';
const PRIORITY_FOLLOW_UP_NODE_ID_D = 'node-priority-d';
const PRIORITY_FOLLOW_UP_NODE_ID_E = 'node-priority-e';
const PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID =
  'replica_operations-p1-source';
const PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID =
  'replica_operations-p1-occupied';
const PRIORITY_FOLLOW_UP_CREATED_OPERATION_ID = 'op-priority-follow-up';
const PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX = 'local/partition/';
const PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER = 'follower';
const NO_GLOBAL_IN_FLIGHT_OPERATIONS = 0;
const PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
const PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED =
  'blocked_unclassified';
const PRIORITY_RECOVERY_WORKFLOW_STATE_TERMINAL = 'terminal';
const PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION =
  'create_recovery_operation';
const PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_SCHEDULE_FOLLOWUP_REBALANCE =
  'schedule_followup_rebalance';
const PRIORITY_RECOVERY_BLOCKING_BOUNDARY_REBALANCER_HANDOFF =
  'rebalancer_handoff';
const PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION =
  'eligible_but_no_operation_created';
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT =
  'recovering_in_flight';
const PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL = 2;
const PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION =
  'current_partition';
const PRIORITY_SURROGATE_CREATED_OPERATION_ID =
  'op-priority-surrogate-follow-up';
const PRIORITY_SURROGATE_STALE_OPERATION_ID =
  'op-priority-surrogate-stale-summary';
const PRIORITY_SURROGATE_OWNER_REPLICA_ID =
  'control_plane_publications-p1-r1';
const PRIORITY_VISIBILITY_SERVICE_ID = 'control-plane-publications-r4';
const PRIORITY_VISIBILITY_TARGET_NODE_ID = 'node-4';
const PRIORITY_VISIBILITY_CDC_OPERATION = 'update';
const PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE = 'active';
const PRIORITY_VISIBILITY_TERMINAL_OPERATION_ID =
  'op-priority-terminal-visibility';
const PRIORITY_VISIBILITY_NON_TERMINAL_OPERATION_ID =
  'op-priority-non-terminal-visibility';
const PRIORITY_VISIBILITY_OPERATION_TYPE = OperationType.REPLACE;
const PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED = ReplicaStatus.FAILED;
const PRIORITY_VISIBILITY_OPERATION_STATUS_SYNCING = ReplicaStatus.SYNCING;
const PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_FAILED =
  WORKFLOW_STEP.FAILED;
const PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_SYNCING =
  WORKFLOW_STEP.SYNCING;
const ORDINARY_PROGRESS_PARTITION_ID = 'tables-p1';
const NON_PRIORITY_SYSTEM_PARTITION_ID = 'logs-p1';
const NO_PROGRESS_LISTENERS = 0;
const ONE_PROGRESS_LISTENER = 1;
const ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL = 1;
const ONE_REBALANCE_EVALUATE_CALL = 1;
const NO_REBALANCE_PLANNING_GATE_DECISION = null;
const LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY =
  'control_plane_write_unhealthy';
const LOCAL_MUTATION_TEST_METADATA_PUBLICATION_DEGRADED =
  'metadata_publication_degraded';

const resolveNoRebalancePlanningGateDecision = () =>
  NO_REBALANCE_PLANNING_GATE_DECISION;
const resolveNoAsyncRebalancePlanningGateDecision = async () =>
  NO_REBALANCE_PLANNING_GATE_DECISION;

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
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
      node.connection_state : 'ready',
    ready_lease_expires_at: Object.hasOwn(node, 'ready_lease_expires_at') ?
      node.ready_lease_expires_at : now + 10000,
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
  connectionState = 'connected',
  connectedNodes = [],
) {
  return {
    getConnectionState: () => connectionState,
    getConnectedNodes: () => [...connectedNodes],
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

function createBackpressuredMessageRouter() {
  return {
    ...createMockMessageRouter(),
    getStats() {
      return {
        outboundQueues: {
          [REBALANCER_TEST_NODE_ID_B]: {
            pending: BACKPRESSURE_PENDING_COUNT,
            maxPending: BACKPRESSURE_MAX_PENDING,
          },
        },
      };
    },
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
      operationId: 'op-' + Date.now(),
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    // getStats is called synchronously by UnifiedRebalancer.getStats()
    getStats: () => ({
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: 0,
    }),
    storageAccountingService,
    storageAdmissionService,
  };
}

function createEventedMockCoordinator() {
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
    if (listeners.size === 0) {
      listenersByEvent.delete(eventName);
    }
  };
  coordinator.emit = (eventName, payload) => {
    const listeners = listenersByEvent.get(eventName) || new Set();
    for (const listener of listeners) {
      listener(payload);
    }
  };
  coordinator.listenerCount = (eventName) =>
    (listenersByEvent.get(eventName) || new Set()).size;
  return coordinator;
}

function createMockMembershipPublicationService(
  publishedActiveNodeIds = [],
  publicationEpoch = 1,
  options = {},
) {
  return {
    getLatestClusterPublicationSync() {
      return {
        status: 'PUBLISHED',
        publicationEpoch,
        publishedActiveNodeIds,
        ...(options && typeof options === 'object' ? options : {}),
      };
    },
  };
}

// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = 'connected',
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    systemTableCache = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = systemTableCache || createMockCache(
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

const TEST_REBALANCE_PLANNING_GATE = Object.freeze({
  LOCAL_MUTATION_READINESS: 'local_mutation_readiness',
  CONTROL_PLANE_PRIORITY_SPREAD: 'control_plane_priority_spread',
  TRANSPORT_BACKPRESSURE: 'transport_backpressure',
});

const TEST_REBALANCE_PLANNING_GATE_DECISION = Object.freeze({
  DEFER_PLANNING: 'defer_planning',
});

const TEST_REBALANCE_PLANNING_GATE_ACTION = Object.freeze({
  SCHEDULE_RETRY: 'schedule_retry',
});

const TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE = Object.freeze({
  NEXT: 'next',
  PRIORITY_AWARE: 'priority_aware',
});

const unifiedRebalancerTestContext = {
  BACKPRESSURE_MAX_PENDING,
  BACKPRESSURE_PENDING_COUNT,
  ConfigurationManager,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  createBackpressuredMessageRouter,
  createEventedMockCoordinator,
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMembershipPublicationService,
  createMockMessageRouter,
  createMockPolicyService,
  createMockReadinessService,
  createTestRebalancer,
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  EntityType,
  initializeTestEnvironment,
  LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY,
  LOCAL_MUTATION_TEST_METADATA_PUBLICATION_DEGRADED,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  MOVE_REASON,
  MoveType,
  NO_GLOBAL_IN_FLIGHT_OPERATIONS,
  NO_PROGRESS_LISTENERS,
  NO_REBALANCE_PLANNING_GATE_DECISION,
  NodeStatus,
  NON_PRIORITY_SYSTEM_PARTITION_ID,
  ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
  ONE_PROGRESS_LISTENER,
  ONE_REBALANCE_EVALUATE_CALL,
  OperationType,
  ORDINARY_PROGRESS_PARTITION_ID,
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_STATE,
  PRIORITY_FOLLOW_UP_CREATED_OPERATION_ID,
  PRIORITY_FOLLOW_UP_NODE_ID_A,
  PRIORITY_FOLLOW_UP_NODE_ID_B,
  PRIORITY_FOLLOW_UP_NODE_ID_C,
  PRIORITY_FOLLOW_UP_NODE_ID_D,
  PRIORITY_FOLLOW_UP_NODE_ID_E,
  PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID,
  PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
  PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
  PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
  PRIORITY_PROGRESS_NODE_ID,
  PRIORITY_PROGRESS_OPERATION_ID,
  PRIORITY_PROGRESS_PARTITION_ID,
  PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_SCHEDULE_FOLLOWUP_REBALANCE,
  PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION,
  PRIORITY_RECOVERY_PUBLICATION_EPOCH,
  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_READY_REPLICA_COUNT,
  PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
  PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
  PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
  PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
  PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
  PRIORITY_RECOVERY_SPREAD_GAP,
  PRIORITY_RECOVERY_WORKFLOW_STATE_TERMINAL,
  PRIORITY_SURROGATE_CREATED_OPERATION_ID,
  PRIORITY_SURROGATE_OWNER_REPLICA_ID,
  PRIORITY_SURROGATE_STALE_OPERATION_ID,
  PRIORITY_VISIBILITY_CDC_OPERATION,
  PRIORITY_VISIBILITY_NON_TERMINAL_OPERATION_ID,
  PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED,
  PRIORITY_VISIBILITY_OPERATION_STATUS_SYNCING,
  PRIORITY_VISIBILITY_OPERATION_TYPE,
  PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_FAILED,
  PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_SYNCING,
  PRIORITY_VISIBILITY_SERVICE_ID,
  PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
  PRIORITY_VISIBILITY_TARGET_NODE_ID,
  PRIORITY_VISIBILITY_TERMINAL_OPERATION_ID,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
  REBALANCER_TEST_NODE_ID_A,
  REBALANCER_TEST_NODE_ID_B,
  REBALANCER_TEST_NODE_ID_C,
  RECONCILE_REASON,
  REPLICA_OPERATION_PRIORITY_PARTITION_ID,
  REPLICA_OPERATION_PRIORITY_REPLICA_ID,
  REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
  REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
  ReplicaStatus,
  resolveNoAsyncRebalancePlanningGateDecision,
  resolveNoRebalancePlanningGateDecision,
  SERVICE_TYPE,
  SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
  SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
  SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_B,
  SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_C,
  SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
  SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
  SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
  SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
  SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
  SYSTEM_TABLE_NAME,
  test,
  TEST_REBALANCE_PLANNING_GATE,
  TEST_REBALANCE_PLANNING_GATE_ACTION,
  TEST_REBALANCE_PLANNING_GATE_DECISION,
  TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE,
  TriggerType,
  UnifiedRebalancer,
  WORKFLOW_STEP,
};

registerUnifiedRebalancerLifecycleAndRecoveryProgressEventsTests(unifiedRebalancerTestContext);
registerUnifiedRebalancerPlanningGateDecisionsTests(unifiedRebalancerTestContext);
registerUnifiedRebalancerPriorityFollowupCreationTests(unifiedRebalancerTestContext);
registerUnifiedRebalancerSurrogateFollowupSynthesisTests(unifiedRebalancerTestContext);
registerUnifiedRebalancerClosureWitnessFollowupTests(unifiedRebalancerTestContext);
registerUnifiedRebalancerBudgetArbitrationCleanupTests(unifiedRebalancerTestContext);
