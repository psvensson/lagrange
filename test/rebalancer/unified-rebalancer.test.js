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
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
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
  REPLICA_OPERATION_SEMANTIC_PHASE,
} from '../../src/rebalancer/replica-status.js';
import {
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
  LIFECYCLE_PHASE,
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
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

const BACKPRESSURE_PENDING_COUNT = 2;
const BACKPRESSURE_MAX_PENDING = 2;
const PRIORITY_RECOVERY_PUBLICATION_EPOCH = 7;
const PRIORITY_RECOVERY_READY_REPLICA_COUNT = 2;
const PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT = 1;
const PRIORITY_RECOVERY_SPREAD_GAP = 1;
const REBALANCER_TEST_NODE_ID_A = 'node-1';
const REBALANCER_TEST_NODE_ID_B = 'node-2';
const REPLICA_OPERATION_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const REPLICA_OPERATION_PRIORITY_REPLICA_ID = 'replica_operations-p1-r1';
const PRIORITY_PROGRESS_PARTITION_ID = 'control_plane_publications-p1';
const PRIORITY_PROGRESS_NODE_ID = 'node-1';
const PRIORITY_PROGRESS_OPERATION_ID = 'op-priority-progress';
const PRIORITY_VISIBILITY_SERVICE_ID = 'control-plane-publications-r4';
const PRIORITY_VISIBILITY_TARGET_NODE_ID = 'node-4';
const PRIORITY_VISIBILITY_CDC_OPERATION = 'update';
const PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE = 'active';
const ORDINARY_PROGRESS_PARTITION_ID = 'tables-p1';
const NO_PROGRESS_LISTENERS = 0;
const ONE_PROGRESS_LISTENER = 1;
const NO_MEMBERSHIP_PUBLICATION_RECONCILE_CALLS = 0;
const ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL = 1;

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

function createNodeEndpoint(nodeId) {
  return {
    node_id: nodeId,
    transport_type: TRANSPORT_TYPE.WEBSOCKET,
    status: ENDPOINT_STATUS.ACTIVE,
  };
}

function createPostgresWireEndpoint(nodeId) {
  return {
    node_id: nodeId,
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    health_status: ENDPOINT_SYNC_HEALTH.HEALTHY,
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

test('UnifiedRebalancer - Basic Initialization', async (t) => {
  initializeTestEnvironment();

  await t.test('creates rebalancer with default options', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
      ],
    });

    t.equal(rebalancer.entityId, 'partition-1');
    t.equal(rebalancer.entityType, EntityType.PARTITION);
    t.equal(rebalancer.isLeader, false);
    t.equal(rebalancer.initialized, false);
  });

  await t.test('classifies split child system partitions using canonical table ownership',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations_p_deadbeef_left',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'replica_operations_p_deadbeef_left',
            table_id: 'replica_operations',
            replica_count: 3,
          },
        ],
      });

      t.equal(
        rebalancer.isSystemPartitionEntity(),
        true,
        'split child partitions of system tables should remain system entities',
      );
      t.equal(
        rebalancer.isCriticalSystemPartition(),
        true,
        'critical classification should follow the partition owner row table id',
      );
      t.equal(
        rebalancer.isControlPlanePriorityPartition(),
        true,
        'priority classification should include split descendants of priority tables',
      );
    });

  await t.test('initializes rebalancer', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    t.equal(rebalancer.initialized, true);
  });

  await t.test('inherits admission/accounting owners from coordinator',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
      });

      t.equal(
        rebalancer.storageAdmissionService,
        rebalancer.rebalanceCoordinator.storageAdmissionService,
      );
      t.equal(
        rebalancer.storageAccountingService,
        rebalancer.rebalanceCoordinator.storageAccountingService,
      );
      t.equal(
        rebalancer.movePlanner.storageAdmissionService,
        rebalancer.storageAdmissionService,
      );
      t.equal(
        rebalancer.movePlanner.storagePressureBehavior.accountingService,
        rebalancer.storageAccountingService,
      );
    });

  await t.test('setRebalanceCoordinator refreshes owner dependencies',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });
      const replacementCoordinator = createMockCoordinator();

      rebalancer.storageAdmissionService = null;
      rebalancer.storageAccountingService = null;
      rebalancer.movePlanner.storageAdmissionService = null;
      rebalancer.movePlanner.accountingService = null;

      rebalancer.setRebalanceCoordinator(replacementCoordinator);

      t.equal(
        rebalancer.storageAdmissionService,
        replacementCoordinator.storageAdmissionService,
      );
      t.equal(
        rebalancer.storageAccountingService,
        replacementCoordinator.storageAccountingService,
      );
      t.equal(
        rebalancer.movePlanner.storageAdmissionService,
        replacementCoordinator.storageAdmissionService,
      );
      t.equal(
        rebalancer.movePlanner.accountingService,
        replacementCoordinator.storageAccountingService,
      );
      t.equal(
        rebalancer.movePlanner.storagePressureBehavior.accountingService,
        replacementCoordinator.storageAccountingService,
      );
    });

  await t.test('rebalance applies storage pressure gating through the ' +
    'canonical pressure owner', async (t) => {
      const now = Date.now();
      const pressureCalls = [];
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        systemTableCache: createMockCache(
          [{
            node_id: 'node-1',
            status: 'active',
            ready_lease_expires_at: now + 10000,
          }, {
            node_id: 'node-2',
            status: 'active',
            ready_lease_expires_at: now + 10000,
          }],
          [{
            service_id: 'svc-1',
            partition_id: 'partition-1',
            node_id: 'node-1',
            status: 'active',
            address: 'node-1/partition/partition-1',
          }],
          [{
            partition_id: 'partition-1',
            table_id: 'tbl-1',
            leader_node_id: 'node-1',
            replica_count: 2,
          }],
          [{
            table_id: 'tbl-1',
            table_name: 'users',
            table_policies: JSON.stringify({targetReplicaCount: 2}),
          }],
          [],
        ),
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: {
          getPolicyForPartition: () => ({
            targetReplicaCount: 2,
            placementConstraints: {},
          }),
        },
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockCoordinator(),
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: []};
          },
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync: () => ({
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          }),
          getNodeReadiness: async () => ({
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          }),
        },
        storagePressureBehavior: {
          async shouldAllowMove(nodeId, criticality) {
            pressureCalls.push({nodeId, criticality});
            return {
              decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
              pressureState: nodeId === 'node-2' ?
                PRESSURE_STATE.HARD :
                PRESSURE_STATE.NORMAL,
            };
          },
        },
      });

      rebalancer.setLeader(true);
      try {
        const result = await rebalancer.rebalance(
          TriggerType.PERIODIC,
          {
            targetReplicaCount: 2,
            placementConstraints: {},
          },
        );

        t.equal(result.success, true);
        t.ok(
          pressureCalls.some((call) =>
            call.nodeId === 'node-2' &&
            call.criticality === 'critical'),
          'active rebalance path must consult the injected pressure owner ' +
          'for the storage-increasing target node',
        );
      } finally {
        rebalancer.setLeader(false);
        await rebalancer.shutdown();
      }
    });

  await t.test('sets leader status', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    t.equal(rebalancer.isLeader, false);

    rebalancer.setLeader(true);
    t.equal(rebalancer.isLeader, true);

    rebalancer.setLeader(false);
    t.equal(rebalancer.isLeader, false);

    rebalancer.shutdown();
  });

  await t.test(
    'priority recovery coordinator progress re-enters partition planning',
    async (t) => {
      const coordinator = createEventedMockCoordinator();
      const rebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        rebalanceCoordinator: coordinator,
      });
      const enqueuedReasons = [];
      rebalancer.isLeader = true;
      rebalancer.enqueueRebalanceCheck = (reason) => {
        enqueuedReasons.push(reason);
        return true;
      };

      coordinator.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
        operation: {
          operationId: PRIORITY_PROGRESS_OPERATION_ID,
          entityType: EntityType.PARTITION,
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          partitionId: PRIORITY_PROGRESS_PARTITION_ID,
        },
        newStep: WORKFLOW_STEP.ACTIVE,
      });

      t.same(
        enqueuedReasons,
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'spread-changing coordinator progress should enqueue one priority planning pass',
      );

      rebalancer.shutdown();
    },
  );

  await t.test(
    'priority recovery terminal progress re-enters membership publication planning',
    async (t) => {
      const coordinator = createEventedMockCoordinator();
      const membershipPublicationReconcileCalls = [];
      const controlPlaneReadinessService = {
        ...createMockReadinessService(createMockCache()),
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(reason, context) {
            membershipPublicationReconcileCalls.push({reason, context});
            return true;
          },
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService,
      });
      rebalancer.isLeader = true;
      rebalancer.enqueueRebalanceCheck = () => true;

      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: PRIORITY_PROGRESS_OPERATION_ID,
          entityType: EntityType.PARTITION,
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          partitionId: PRIORITY_PROGRESS_PARTITION_ID,
        },
      });

      t.equal(
        membershipPublicationReconcileCalls.length,
        ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
        'terminal priority progress should wake the publication owner once',
      );
      t.equal(
        membershipPublicationReconcileCalls[0].reason,
        RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
        'publication planning should use the canonical priority progress reason',
      );

      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: PRIORITY_PROGRESS_OPERATION_ID,
          entityType: EntityType.PARTITION,
          entityId: ORDINARY_PROGRESS_PARTITION_ID,
          partitionId: ORDINARY_PROGRESS_PARTITION_ID,
        },
      });

      t.equal(
        membershipPublicationReconcileCalls.length,
        ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
        'non-matching progress should not wake publication planning',
      );

      rebalancer.shutdown();
    },
  );

  await t.test(
    'sibling priority recovery progress re-enters partition planning',
    async (t) => {
      const coordinator = createEventedMockCoordinator();
      const rebalanceReasons = [];
      const rebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        rebalanceCoordinator: coordinator,
      });
      rebalancer.isLeader = true;
      rebalancer.enqueueRebalanceCheck = (reason) => {
        rebalanceReasons.push(reason);
        return true;
      };

      coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
        operation: {
          operationId: PRIORITY_PROGRESS_OPERATION_ID,
          entityType: EntityType.PARTITION,
          entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        },
      });

      t.same(
        rebalanceReasons,
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'terminal sibling priority progress should rearm blocked priority partitions',
      );

      rebalancer.shutdown();
    },
  );

  await t.test(
    'priority recovery active service visibility wakes membership publication planning',
    async (t) => {
      const membershipPublicationReconcileCalls = [];
      const rebalanceReasons = [];
      const controlPlaneReadinessService = {
        ...createMockReadinessService(createMockCache()),
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(reason, context) {
            membershipPublicationReconcileCalls.push({reason, context});
            return true;
          },
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        controlPlaneReadinessService,
      });
      rebalancer.isLeader = true;
      rebalancer.enqueueRebalanceCheck = (reason) => {
        rebalanceReasons.push(reason);
        return true;
      };

      const handled = rebalancer.handlePriorityRecoveryVisibilityEvent({
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        operation: PRIORITY_VISIBILITY_CDC_OPERATION,
        data: {
          service_id: PRIORITY_VISIBILITY_SERVICE_ID,
          node_id: PRIORITY_VISIBILITY_TARGET_NODE_ID,
          partition_id: PRIORITY_PROGRESS_PARTITION_ID,
          service_type: SERVICE_TYPE.PARTITION,
          status: PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
        },
      });

      t.equal(
        handled,
        true,
        'active priority service visibility should be handled as recovery progress',
      );
      t.same(
        rebalanceReasons,
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'visibility progress should wake the priority partition rebalance queue',
      );
      t.same(
        membershipPublicationReconcileCalls.map((call) => call.reason),
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'visibility progress should wake the publication owner through the canonical reason',
      );

      rebalancer.shutdown();
    },
  );

  await t.test(
    'priority recovery service cache visibility is wired to publication planning',
    async (t) => {
      const cacheChangeListeners = new Set();
      const systemTableCache = {
        ...createMockCache(),
        onCacheChange(listener) {
          cacheChangeListeners.add(listener);
        },
        offCacheChange(listener) {
          cacheChangeListeners.delete(listener);
        },
      };
      const membershipPublicationReconcileCalls = [];
      const rebalanceReasons = [];
      const controlPlaneReadinessService = {
        ...createMockReadinessService(systemTableCache),
        membershipPublicationService: {
          enqueueClusterMembershipReconcile(reason, context) {
            membershipPublicationReconcileCalls.push({reason, context});
            return true;
          },
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        systemTableCache,
        controlPlaneReadinessService,
      });
      rebalancer.isLeader = true;
      rebalancer.enqueueRebalanceCheck = (reason) => {
        rebalanceReasons.push(reason);
        return true;
      };

      t.equal(
        cacheChangeListeners.size,
        ONE_PROGRESS_LISTENER,
        'priority partition rebalancers should subscribe to service visibility',
      );

      for (const listener of cacheChangeListeners) {
        listener(
          SYSTEM_TABLE_NAME.SERVICES,
          PRIORITY_VISIBILITY_CDC_OPERATION,
          {
            service_id: PRIORITY_VISIBILITY_SERVICE_ID,
            node_id: PRIORITY_VISIBILITY_TARGET_NODE_ID,
            partition_id: PRIORITY_PROGRESS_PARTITION_ID,
            service_type: SERVICE_TYPE.PARTITION,
            status: PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
          },
        );
      }

      t.same(
        rebalanceReasons,
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'cache visibility progress should wake the priority partition queue',
      );
      t.same(
        membershipPublicationReconcileCalls.map((call) => call.reason),
        [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
        'cache visibility progress should wake the publication owner',
      );

      rebalancer.shutdown();

      t.equal(
        cacheChangeListeners.size,
        NO_PROGRESS_LISTENERS,
        'shutdown should release priority visibility cache subscriptions',
      );
    },
  );

  await t.test(
    'coordinator progress listeners are scoped to priority partitions',
    async (t) => {
      const coordinator = createEventedMockCoordinator();
      const ordinaryRebalancer = createTestRebalancer({
        entityId: ORDINARY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        rebalanceCoordinator: coordinator,
      });

      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
        NO_PROGRESS_LISTENERS,
        'ordinary partition rebalancers should not subscribe to priority progress events',
      );

      const priorityRebalancer = createTestRebalancer({
        entityId: PRIORITY_PROGRESS_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_PROGRESS_NODE_ID,
        rebalanceCoordinator: coordinator,
      });

      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
        ONE_PROGRESS_LISTENER,
        'priority partition rebalancers should own the progress trigger subscription',
      );

      priorityRebalancer.shutdown();
      ordinaryRebalancer.shutdown();

      t.equal(
        coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
        NO_PROGRESS_LISTENERS,
        'shutdown should release priority progress event listeners',
      );
    },
  );

  await t.test('returns budget_exceeded when coordinator create gate blocks scheduling',
    async (t) => {
      const mockCache = createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ]);
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-0',
        systemTableCache: mockCache,
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(move) {
            t.equal(
              move.enforceConcurrentOperationBudget,
              true,
              'rebalancer should request coordinator-side create gating',
            );
            const error = new Error('budget exceeded');
            error.rebalanceSkipReason = 'budget_exceeded';
            throw error;
          },
        },
      });

      const result = await rebalancer.executeMoveViaCoordinator({
        type: MoveType.ADD,
        nodeId: 'node-1',
        replicaId: 'partition-1-r4',
      });

      t.same(result, {
        success: false,
        skipped: true,
        reason: 'budget_exceeded',
        operation: MoveType.ADD,
        nodeId: 'node-1',
        replicaId: 'partition-1-r4',
      });

      rebalancer.shutdown();
    });

  await t.test('binds coordinator move creation to the published membership epoch',
    async (t) => {
      const mockCache = createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ]);
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-0',
        systemTableCache: mockCache,
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockMessageRouter(),
        controlPlaneReadinessService: {
          getCurrentPublishedMembershipEpochSync() {
            return 11;
          },
        },
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(move) {
            t.equal(
              move.membershipPublicationEpoch,
              11,
              'rebalancer should bind created moves to the published membership epoch',
            );
            return {
              operationId: 'op-epoch-bound',
              replicaId: move.replicaId,
            };
          },
        },
      });

      const result = await rebalancer.executeMoveViaCoordinator({
        type: MoveType.ADD,
        nodeId: 'node-1',
        replicaId: 'partition-1-r4',
      });

      t.equal(result.success, true, 'epoch-bound move should still execute');

      rebalancer.shutdown();
    });

  await t.test('binds coordinator move creation to the shared publication planning snapshot epoch',
    async (t) => {
      const mockCache = createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ]);
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-0',
        systemTableCache: mockCache,
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockMessageRouter(),
        controlPlaneReadinessService: {
          getCurrentPublishedMembershipEpochSync() {
            return 12;
          },
        },
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(move) {
            t.equal(
              move.membershipPublicationEpoch,
              12,
              'rebalancer should use the shared planning snapshot epoch when available',
            );
            return {
              operationId: 'op-shared-epoch-bound',
              replicaId: move.replicaId,
            };
          },
        },
      });

      const result = await rebalancer.executeMoveViaCoordinator({
        type: MoveType.ADD,
        nodeId: 'node-1',
        replicaId: 'partition-1-r4',
      });

      t.equal(
        result.success,
        true,
        'shared planning snapshot epoch should still allow move creation',
      );

      rebalancer.shutdown();
    });
});

test('UnifiedRebalancer defers background planning when local control-plane mutation readiness is unhealthy',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
      ],
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                false,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [
              {code: 'control_plane_write_unhealthy'},
              {code: 'metadata_publication_degraded'},
            ],
          };
        },
      },
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.currentInterval = 100;
    rebalancer.maxInterval = 1000;
    rebalancer.scheduleNextCheck = () => {};

    let evaluateCalls = 0;
    const waitLogs = [];
    rebalancer.evaluateState = async () => {
      evaluateCalls += 1;
      return false;
    };
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS) {
          waitLogs.push(payload);
        }
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    try {
      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'background planning should not execute while local mutation readiness is unhealthy',
      );
      t.equal(waitLogs.length, 1, 'rebalancer should emit one defer diagnostic');
      t.same(
        waitLogs[0]?.reasonCodes,
        [
          'control_plane_write_unhealthy',
          'metadata_publication_degraded',
        ],
        'defer diagnostic should preserve readiness reason codes',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer exposes one explicit local mutation planning gate decision',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
      ],
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                false,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [
              {code: 'control_plane_write_unhealthy'},
              {code: 'metadata_publication_degraded'},
            ],
          };
        },
      },
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.currentInterval = 100;
    rebalancer.maxInterval = 1000;

    try {
      const decision = await rebalancer.resolveCheckRebalanceGateDecision();

      t.equal(
        decision?.decision,
        TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
        'gate resolution should emit the canonical defer-planning decision',
      );
      t.equal(
        decision?.nextAction,
        TEST_REBALANCE_PLANNING_GATE_ACTION.SCHEDULE_RETRY,
        'gate resolution should preserve the canonical retry action',
      );
      t.equal(
        decision?.gate,
        TEST_REBALANCE_PLANNING_GATE.LOCAL_MUTATION_READINESS,
        'gate resolution should name the local mutation blocker explicitly',
      );
      t.equal(
        decision?.scheduleMode,
        TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
        'local mutation defers should keep the priority-aware retry cadence contract',
      );
      t.equal(
        decision?.scheduleDelayMs,
        125,
        'local mutation defers should carry the normalized retry delay explicitly',
      );
      t.same(
        decision?.blocker?.reasonCodes,
        [
          'control_plane_write_unhealthy',
          'metadata_publication_degraded',
        ],
        'gate resolution should preserve canonical blocker evidence',
      );
      t.equal(
        decision?.logMessage,
        REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS,
        'gate resolution should preserve the matched diagnostic vocabulary',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer exposes one explicit priority spread planning gate decision',
  async (t) => {
    initializeTestEnvironment();

    const readinessService = {
      ...createMockReadinessService(createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ])),
      getMembershipPublicationPlanningAnswerSync() {
        return {
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          publicationRecoveryGate: {
            prioritySpreadPending: true,
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                readyReplicaCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
            },
          },
        };
      },
    };

    const rebalancer = createTestRebalancer({
      entityId: 'mg-node-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;

    try {
      const decision = await rebalancer.resolveCheckRebalanceGateDecision();

      t.equal(
        decision?.decision,
        TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
        'priority spread waits should use the same canonical defer-planning decision',
      );
      t.equal(
        decision?.gate,
        TEST_REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
        'priority spread waits should expose a distinct planning gate name',
      );
      t.equal(
        decision?.scheduleMode,
        TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE.NEXT,
        'non-priority work should schedule priority spread waits through the ordinary scheduler',
      );
      t.equal(
        decision?.scheduleDelayMs,
        rebalancer.getPriorityRetryDelayMs(),
        'priority spread waits should carry the bounded retry delay explicitly',
      );
      t.equal(
        decision?.logMessage,
        REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY,
        'priority spread waits should preserve the existing diagnostic message',
      );
      t.equal(
        decision?.blocker?.blockedPartitions?.length,
        1,
        'priority spread waits should preserve the blocked-partition evidence',
      );
      t.equal(
        decision?.blocker?.blockedPartitions?.[0]?.partitionId,
        'replica_operations-p1',
        'priority spread waits should retain the canonical blocked partition id',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer lets blocked priority recovery partitions plan through transport backpressure',
  async (t) => {
    initializeTestEnvironment();

    const readinessService = {
      ...createMockReadinessService(createMockCache([
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
      ])),
      membershipPublicationService: createMockMembershipPublicationService(
        [REBALANCER_TEST_NODE_ID_A, REBALANCER_TEST_NODE_ID_B],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
              readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT,
              readyDistinctNodeCount:
                PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
            }],
          },
        },
      ),
    };
    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: REBALANCER_TEST_NODE_ID_A,
      nodes: [
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      services: [{
        service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: REBALANCER_TEST_NODE_ID_A,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID,
        status: ReplicaStatus.ACTIVE,
      }],
      controlPlaneReadinessService: readinessService,
      messageRouter: createBackpressuredMessageRouter(),
    });

    try {
      t.equal(
        rebalancer.resolveTransportBackpressurePlanningGateDecision(),
        null,
        'the partition named by priority recovery should not park behind ordinary transport backpressure',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer keeps transport backpressure gating for priority partitions outside the blocked recovery set',
  async (t) => {
    initializeTestEnvironment();

    const readinessService = {
      ...createMockReadinessService(createMockCache([
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
      ])),
      membershipPublicationService: createMockMembershipPublicationService(
        [REBALANCER_TEST_NODE_ID_A, REBALANCER_TEST_NODE_ID_B],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitions: [],
          },
        },
      ),
    };
    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: REBALANCER_TEST_NODE_ID_A,
      nodes: [
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      controlPlaneReadinessService: readinessService,
      messageRouter: createBackpressuredMessageRouter(),
    });

    try {
      const decision =
        rebalancer.resolveTransportBackpressurePlanningGateDecision();
      t.equal(
        decision?.gate,
        TEST_REBALANCE_PLANNING_GATE.TRANSPORT_BACKPRESSURE,
        'priority partitions should only bypass backpressure when they own the active recovery gap',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer does not park non-system entities behind published convergence local mutation backoff',
  async (t) => {
    initializeTestEnvironment();

    const readinessService = {
      ...createMockReadinessService(createMockCache([
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ])),
      getNodeReadinessSync() {
        return {
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
          priorityControlPlaneRecovery: {
            active: true,
            reasonCodes: ['priority_partitions_not_spread'],
          },
        };
      },
      membershipPublicationService: createMockMembershipPublicationService(
        ['node-1', 'node-2', 'node-3'],
        7,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: 'replica_operations-p1',
              readyReplicaCount: 2,
              readyDistinctNodeCount: 1,
              spreadGap: 1,
            }],
          },
        },
      ),
    };

    const rebalancer = createTestRebalancer({
      entityId: 'mg-node-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;

    let evaluateCalls = 0;
    rebalancer.evaluateState = async () => {
      evaluateCalls += 1;
      return false;
    };

    rebalancer.scheduleNextCheck = () => {};

    const mutationWaitLogs = [];
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS) {
          mutationWaitLogs.push(payload);
        }
      },
      debug: () => {},
      warn: () => {},
      error: () => {},
    };

    try {
      t.equal(
        rebalancer.getLocalControlPlaneMutationReadinessBlocker(),
        null,
        'non-system entities should not treat published convergence as a local mutation-readiness blocker',
      );

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'non-system work should continue evaluating once the broad local mutation backoff is removed',
      );
      t.equal(
        mutationWaitLogs.length,
        0,
        'non-system work should not use the broad local mutation readiness backoff',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

test('UnifiedRebalancer budget queries use injected control-plane ' +
  'system-table gateway', async (t) => {
  initializeTestEnvironment();

  const gatewayCalls = [];
  const rebalancer = createTestRebalancer({
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('raw SQL path should not be used');
      },
    },
    controlPlaneSystemTableGateway: {
      async executeQuery(sql, params, queryOptions) {
        gatewayCalls.push({sql, params, queryOptions});
        if (sql.includes('SELECT config_value FROM config')) {
          return {success: true, rows: [{config_value: '7'}]};
        }
        return {success: true, rows: [{total_count: 2}]};
      },
    },
  });

  const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
  const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

  t.equal(configuredBudget, 7, 'gateway should provide config-backed budget');
  t.equal(inFlightCount, 2, 'gateway should provide in-flight count');
  t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
  t.equal(
    gatewayCalls[0]?.queryOptions?.workClass,
    'background',
    'ordinary rebalancers should continue using background pressure class for budget reads',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
    'ordinary rebalancers should emit the shared background workload class',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.deliveryPriority,
    'background',
    'ordinary rebalancers should continue using background delivery for budget reads',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.allowPressureDefer,
    true,
    'ordinary rebalancers should remain deferrable under pressure',
  );
});

test('UnifiedRebalancer budget queries stay critical for priority control-plane partitions', async (t) => {
  initializeTestEnvironment();

  const gatewayCalls = [];
  const rebalancer = createTestRebalancer({
    entityId: 'replica_operations-p1',
    entityType: EntityType.PARTITION,
    controlPlaneSystemTableGateway: {
      async executeQuery(sql, params, queryOptions) {
        gatewayCalls.push({sql, params, queryOptions});
        if (sql.includes('SELECT config_value FROM config')) {
          return {success: true, rows: [{config_value: '5'}]};
        }
        return {success: true, rows: [{total_count: 1}]};
      },
    },
  });

  const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
  const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

  t.equal(configuredBudget, 5, 'gateway should provide config-backed budget');
  t.equal(inFlightCount, 1, 'gateway should provide in-flight count');
  t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
  t.equal(
    gatewayCalls[0]?.queryOptions?.workClass,
    'critical',
    'priority control-plane partitions should bypass background pressure gating for budget reads',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
    'priority rebalancers should emit the shared priority workload class',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.deliveryPriority,
    'critical',
    'priority control-plane partitions should route budget reads at critical delivery priority',
  );
  t.equal(
    gatewayCalls[0]?.queryOptions?.allowPressureDefer,
    false,
    'priority control-plane partitions should not defer budget reads under pressure',
  );
  t.equal(
    gatewayCalls[1]?.queryOptions?.workClass,
    'critical',
    'priority control-plane partitions should keep in-flight reads on the critical path',
  );
  t.equal(
    gatewayCalls[1]?.queryOptions?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
    'priority in-flight reads should use the same shared workload class',
  );
  t.equal(
    gatewayCalls[1]?.queryOptions?.deliveryPriority,
    'critical',
    'priority control-plane partitions should route in-flight reads at critical delivery priority',
  );
  t.equal(
    gatewayCalls[1]?.queryOptions?.allowPressureDefer,
    false,
    'priority control-plane partitions should not defer in-flight reads under pressure',
  );
});

test('UnifiedRebalancer budget queries prefer authoritative CDC owner reads when available', async (t) => {
  initializeTestEnvironment();

  const cdcCalls = [];
  const gatewayCalls = [];
  const rebalancer = createTestRebalancer({
    entityId: 'replica_operations-p1',
    entityType: EntityType.PARTITION,
    cdcIntegrationService: {
      ...createMockCdcService(),
      async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
        cdcCalls.push({tableName, sql, params, options});
        if (tableName === 'config') {
          return {success: true, rows: [{config_value: '6'}]};
        }
        return {success: true, rows: [{total_count: 2}]};
      },
    },
    controlPlaneSystemTableGateway: {
      async executeQuery(sql, params, queryOptions) {
        gatewayCalls.push({sql, params, queryOptions});
        return {success: true, rows: []};
      },
    },
  });

  const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
  const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

  t.equal(configuredBudget, 6,
    'authoritative CDC owner reads should provide config-backed budget');
  t.equal(inFlightCount, 2,
    'authoritative CDC owner reads should provide in-flight count');
  t.equal(cdcCalls.length, 2,
    'budget probes should use the authoritative CDC owner path');
  t.equal(gatewayCalls.length, 0,
    'budget probes should not fall through to the gateway when CDC owner reads are available');
  t.equal(
    cdcCalls[0]?.options?.localReadConsistency,
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
    'budget probes should allow any local authoritative replica for config reads',
  );
  t.equal(
    cdcCalls[0]?.options?.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    'budget probes should report the canonical local-only authoritative read mode',
  );
  t.equal(
    cdcCalls[1]?.options?.queryOptions?.deliveryPriority,
    'critical',
    'priority control-plane budget probes should preserve critical delivery priority on owner reads',
  );
});

test('UnifiedRebalancer allows priority spread scheduling when global budget is ' +
  'saturated by non-priority work', async (t) => {
  initializeTestEnvironment();

  const rebalancer = createTestRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    nodes: [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ],
  });

  const priorityBudgetLaneChecks = [];
  rebalancer.rebalanceCoordinator.canStartPriorityAddOperation = async (options) => {
    priorityBudgetLaneChecks.push(options || null);
    return true;
  };

  rebalancer.setLeader(true);
  rebalancer.getCurrentReplicas = () => [];
  rebalancer.getAvailableNodes = () => ([
    {node_id: 'node-1'},
    {node_id: 'node-2'},
  ]);
  rebalancer.movePlanner.calculateTargetState = async () => ({
    targetReplicaCount: 2,
  });
  rebalancer.movePlanner.calculateMoves = () => ([
    {
      type: MoveType.ADD,
      nodeId: 'node-2',
      replicaId: 'control-plane-publications-r2',
    },
  ]);
  rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
  rebalancer.movePlanner.isCriticalState = () => true;
  rebalancer.getConfiguredRebalanceBudget = async () => 1;
  rebalancer.getGlobalInFlightOperationCount = async () => 2;
  rebalancer.executeRebalancingMoves = async (moves) => moves.map((move) => ({
    success: true,
    skipped: false,
    operation: move.type,
    nodeId: move.nodeId,
    replicaId: move.replicaId,
  }));

  const result = await rebalancer.rebalance(
    TriggerType.PERIODIC,
    {targetReplicaCount: 2, placementConstraints: {}},
  );

  t.equal(result.success, true, 'priority partition should still schedule recovery work');
  t.equal(result.moves.length, 1, 'priority partition should schedule one move');
  t.equal(
    result.moves[0]?.operation,
    MoveType.ADD,
    'scheduled move should remain an add-like spread operation',
  );
  t.equal(
    priorityBudgetLaneChecks.length,
    1,
    'rebalancer should consult coordinator priority add lane before bypassing global budget',
  );
  t.same(
    priorityBudgetLaneChecks[0],
    {
      concurrentBudgetReadMode:
        REBALANCER_CONCURRENT_BUDGET_READ_MODE
          .OWNER_RPC_RECHECK_ON_SATURATION,
      bypassEmptyQueryDelay: true,
      partitionId: 'control_plane_publications-p1',
    },
    'priority bypass should use authoritative coordinator lane checks',
  );

  rebalancer.shutdown();
});

test('UnifiedRebalancer reserves one global move slot for priority recovery ' +
  'while priority spread is still unsatisfied', async (t) => {
  initializeTestEnvironment();

  const rebalancer = createTestRebalancer({
    entityId: 'tables-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    nodes: [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
    ],
  });
  rebalancer.controlPlaneReadinessService.membershipPublicationService =
    createMockMembershipPublicationService(
      ['node-1', 'node-2'],
      1,
      {
        priorityPartitionSummary: {
          satisfied: false,
        },
      },
    );

  rebalancer.setLeader(true);
  rebalancer.getCurrentReplicas = () => [];
  rebalancer.getAvailableNodes = () => ([
    {node_id: 'node-1'},
    {node_id: 'node-2'},
  ]);
  rebalancer.movePlanner.calculateTargetState = async () => ({
    targetReplicaCount: 2,
  });
  rebalancer.movePlanner.calculateMoves = () => ([
    {
      type: MoveType.ADD,
      nodeId: 'node-2',
      replicaId: 'tables-p1-r2',
    },
  ]);
  rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
  rebalancer.movePlanner.isCriticalState = () => false;
  rebalancer.getConfiguredRebalanceBudget = async () => 1;
  rebalancer.getGlobalInFlightOperationCount = async () => 0;
  rebalancer.executeRebalancingMoves = async () => {
    t.fail(
      'non-priority system rebalancing should not consume the reserved global priority recovery slot',
    );
  };

  const result = await rebalancer.rebalance(
    TriggerType.PERIODIC,
    {targetReplicaCount: 2, placementConstraints: {}},
  );

  t.equal(
    result.success,
    true,
    'reserved-slot deferral should remain a clean skip, not a rebalance failure',
  );
  t.equal(
    result.skipped,
    true,
    'non-priority system rebalancing should yield while the reserved priority slot is held back',
  );
  t.equal(
    result.reason,
    REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
    'reserved global slot should surface through the existing budget skip reason',
  );

  rebalancer.shutdown();
});
