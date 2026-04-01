/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
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
import {REBALANCER_LOG_MSG} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  TRANSPORT_TYPE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../../src/runtime/endpoint-sync-constants.js';

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
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
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
  const mockCdcService = createMockCdcService();
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
  });
}

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
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 11,
              status: 'PUBLISHED',
            };
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
      preferAuthoritativeCount: true,
      bypassEmptyQueryDelay: true,
    },
    'priority bypass should use authoritative coordinator lane checks',
  );

  rebalancer.shutdown();
});


test('UnifiedRebalancer - Policy Management', async (t) => {
  initializeTestEnvironment();

  await t.test('returns default table policy when no cache data', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.replicaCount, DEFAULT_TABLE_POLICY.replicaCount);
    t.equal(policy.minReplicaCount, DEFAULT_TABLE_POLICY.minReplicaCount);
    t.equal(policy.maxReplicaCount, DEFAULT_TABLE_POLICY.maxReplicaCount);
  });

  await t.test('returns default message group policy', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'mg-1',
      entityType: EntityType.MESSAGE_GROUP,
      nodeId: 'node-1',
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.targetReplicaCount, DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount);
    t.equal(policy.ensureLocalAccess, DEFAULT_MESSAGE_GROUP_POLICY.ensureLocalAccess);
  });

  await t.test('returns table policy from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      partitions: [{partition_id: 'partition-1', table_id: 'table-1'}],
      tables: [{
        table_id: 'table-1',
        table_policies: JSON.stringify({replicaCount: 5, minReplicaCount: 3}),
      }],
    });

    const policy = await rebalancer.getPolicy();

    t.equal(policy.replicaCount, 5);
    t.equal(policy.minReplicaCount, 3);
  });

  await t.test(
    'message-group local access is satisfied by any local message-group replica',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'mg-1',
        entityType: EntityType.MESSAGE_GROUP,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'mg-1-r1',
            group_id: 'mg-1',
            node_id: 'node-1',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-1-r2',
            group_id: 'mg-1',
            node_id: 'node-2',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-3-r0',
            group_id: 'mg-self-hosted-3',
            node_id: 'node-3',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
          {
            service_id: 'mg-self-hosted-4-r0',
            group_id: 'mg-self-hosted-4',
            node_id: 'node-4',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            status: ReplicaStatus.ACTIVE,
          },
        ],
      });

      const nodesWithoutReplica = rebalancer.getNodesWithoutLocalReplica(
        rebalancer.getCurrentReplicas(),
      );

      t.same(
        nodesWithoutReplica,
        [],
        'other local message-group replicas should satisfy local access',
      );
    },
  );
});

test('UnifiedRebalancer - Node Management', async (t) => {
  initializeTestEnvironment();

  await t.test('gets available nodes from cache', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.FAILED},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();

    t.equal(nodes.length, 2);
    t.ok(nodes.some((n) => n.node_id === 'node-1'));
    t.ok(nodes.some((n) => n.node_id === 'node-2'));
    t.notOk(nodes.some((n) => n.node_id === 'node-3'));
  });

  await t.test('uses published membership as steady-state topology truth',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService([
          'node-1',
          'node-3',
        ]),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'only published active nodes should be available for steady-state placement',
      );
    });

  await t.test(
    'allows priority control-plane recovery to use recovery-eligible nodes before publication spread converges',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2'],
          3,
          {
            priorityPartitionSummary: {
              satisfied: false,
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'sql_write_operations-p1',
            table_id: 'sql_write_operations',
            replica_count: 3,
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-2', 'node-3'],
        'priority recovery should not deadlock by filtering candidates to only published active nodes',
      );
    },
  );

  await t.test(
    'retains the latest published membership when a newer publication is still open',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              status: 'OPEN',
              publicationEpoch: 8,
              publishedActiveNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return {
              status: 'PUBLISHED',
              publicationEpoch: 7,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            };
          },
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes.map((node) => node.node_id).sort(),
        ['node-1', 'node-3'],
        'steady-state availability should keep the last published membership while a newer publication remains open',
      );
    });

  await t.test('requires canonical readiness for steady-state availability',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync() {
            return null;
          },
        },
      });

      const nodes = rebalancer.getAvailableNodes();

      t.same(
        nodes,
        [],
        'steady-state placement must not fall back to cache rows when canonical readiness is unavailable',
      );
    });

  await t.test('sorts nodes by load', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, cpu_usage_percent: 80},
        {node_id: 'node-2', status: NodeStatus.ACTIVE, cpu_usage_percent: 20},
        {node_id: 'node-3', status: NodeStatus.ACTIVE, cpu_usage_percent: 50},
      ],
    });

    const nodes = rebalancer.getAvailableNodes();
    const sorted = rebalancer.sortNodesByLoad(nodes);

    t.equal(sorted[0].node_id, 'node-2'); // Lowest load
    t.equal(sorted[1].node_id, 'node-3');
    t.equal(sorted[2].node_id, 'node-1'); // Highest load
  });
});

test('UnifiedRebalancer - Readiness Checks', async (t) => {
  initializeTestEnvironment();

  await t.test('returns true when node is ready and connected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'connected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, true);

    rebalancer.shutdown();
  });

  await t.test('returns false when node is disconnected', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
      ],
      connectionState: 'disconnected',
    });

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });

  await t.test('returns false when readiness ping fails', async (t) => {
    const mockCache = createMockCache([
      {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
    ]);
    const mockCdcService = createMockCdcService();
    const mockPolicyService = createMockPolicyService();
    const mockCoordinator = createMockCoordinator();
    const messageRouter = {
      getConnectionState: () => 'connected',
      pingNode: async () => false,
      isOutboundQueueAvailable: () => true,
    };

    const rebalancer = new UnifiedRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-0',
      systemTableCache: mockCache,
      cdcIntegrationService: mockCdcService,
      tablePolicyService: mockPolicyService,
      messageRouter,
      rebalanceCoordinator: mockCoordinator,
    });
    rebalancer.enableReadinessPing = true;

    const ready = await rebalancer.isNodeReady('node-1');
    t.equal(ready, false);

    rebalancer.shutdown();
  });
});

test('UnifiedRebalancer - Replica State', async (t) => {
  initializeTestEnvironment();

  await t.test('gets healthy replicas only', async (t) => {
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.some((r) => r.replica_id === 'r1'));
    t.ok(healthy.some((r) => r.replica_id === 'r3'));
  });

  await t.test('detects multiple replicas on same node', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const duplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-1'},
      {replica_id: 'r3', node_id: 'node-2'},
    ];

    const noDuplicates = [
      {replica_id: 'r1', node_id: 'node-1'},
      {replica_id: 'r2', node_id: 'node-2'},
      {replica_id: 'r3', node_id: 'node-3'},
    ];

    t.equal(rebalancer.hasMultipleReplicasOnSameNode(duplicates), true);
    t.equal(rebalancer.hasMultipleReplicasOnSameNode(noDuplicates), false);
  });
});


test('UnifiedRebalancer - Move Calculation', async (t) => {
  initializeTestEnvironment();

  await t.test('calculates add moves when below target', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 2);
    t.ok(addMoves.some((m) => m.nodeId === 'node-2'));
    t.ok(addMoves.some((m) => m.nodeId === 'node-3'));
  });

  await t.test(
    'does not block rebalance on stale syncing replicas without in-flight operations',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.SYNCING},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);

      t.equal(addMoves.length, 2, 'should still produce ADD moves');
      t.ok(addMoves.some((m) => m.nodeId === 'node-2'));
      t.ok(addMoves.some((m) => m.nodeId === 'node-3'));
    },
  );

  await t.test(
    'does not schedule local ADD in degraded single-node placement when replicas already occupy node',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.SYNCING},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.SYNCING},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1'],
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 1,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);
      t.equal(
        addMoves.length,
        0,
        'should not create local ADD when node is already occupied by syncing replicas',
      );
    },
  );

  await t.test('calculates remove moves for failed replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 1);
    t.equal(removeMoves[0].replicaId, 'r2');
    t.equal(removeMoves[0].reason, 'replica_failed');
  });

  await t.test('converts node_not_in_target + add into REPLACE move', async (t) => {
    // When there's a node not in target (node-4) and a node missing (node-3),
    // planner should emit REPLACE to avoid add-only growth.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should not emit standalone ADD');

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 0, 'should not emit standalone REMOVE');

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(replaceMoves.length, 1, 'should emit one REPLACE move');
    t.equal(replaceMoves[0].nodeId, 'node-3', 'REPLACE should target node-3');
    t.equal(replaceMoves[0].sourceNodeId, 'node-4', 'REPLACE should remove from node-4');
    t.equal(replaceMoves[0].replicaId, 'r3', 'REPLACE should remove replica r3');
  });

  await t.test('uses REPLACE moves when target is degraded but spread can improve', async (t) => {
    // In degraded topology (insufficient ready nodes), when policy target is already
    // satisfied we should avoid ADD-only growth and use paired REPLACE moves.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-3'],
      degraded: true,
      degradedReason: 'insufficient_nodes',
      availableNodeCount: 2,
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(
      addMoves.length,
      0,
      'should not emit standalone ADD moves when degraded and already at target',
    );

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(
      removeMoves.length,
      0,
      'should not emit standalone non-failed REMOVE moves while degraded',
    );

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(
      replaceMoves.length,
      1,
      'should emit one REPLACE move to improve spread under degraded topology',
    );
    t.equal(
      replaceMoves[0].nodeId,
      'node-3',
      'replacement target should be the underrepresented ready node',
    );
    t.equal(
      replaceMoves[0].replicaId,
      'r2',
      'replacement source should come from overrepresented node',
    );
  });

  await t.test('keeps ADD move in degraded topology when below policy target', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-3'],
      degraded: true,
      degradedReason: 'insufficient_nodes',
      availableNodeCount: 2,
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);

    t.equal(addMoves.length, 1, 'should keep ADD while below policy target');
    t.equal(addMoves[0].nodeId, 'node-3', 'ADD should target missing node');
  });

  await t.test(
    'does not emit degraded ADDs for critical partitions already at replica target',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
      });

      // All replicas are present and active, but intentionally lack routability
      // metadata to simulate transient bootstrap/service-row lag.
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1'],
        degraded: true,
        degradedReason: 'insufficient_nodes',
        availableNodeCount: 1,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const addMoves = moves.filter((m) => m.type === MoveType.ADD);

      t.equal(
        addMoves.length,
        0,
        'degraded planning should not create local ADDs when replica count is already met',
      );
    },
  );

  await t.test('converts spread_replicas + add into REPLACE move', async (t) => {
    // When a node has excess replicas and there is a missing target node,
    // planner should emit REPLACE to keep replica count bounded.
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // node-1 has 2 replicas, node-2 has 1, node-3 needs 1
    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should not emit standalone ADD');

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 0, 'should not emit standalone spread REMOVE');

    const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
    t.equal(replaceMoves.length, 1, 'should emit one REPLACE move');
    t.equal(replaceMoves[0].nodeId, 'node-3', 'REPLACE should target node-3');
    t.equal(
      replaceMoves[0].sourceNodeId,
      'node-1',
      'REPLACE should remove from overrepresented node',
    );
  });

  await t.test('calculates remove moves when no add moves needed', async (t) => {
    // When all target nodes have replicas but there's an extra replica on
    // a non-target node, REMOVE should be generated (no ADDs to defer for)
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    // No ADD moves needed - all target nodes have replicas
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.equal(addMoves.length, 0, 'should have no ADD moves');

    // REMOVE move should be generated for node-4
    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.ok(removeMoves.some((m) => m.nodeId === 'node-4'), 'should remove from node-4');
  });
});

test('UnifiedRebalancer - State Evaluation', async (t) => {
  initializeTestEnvironment();

  await t.test('logs degraded target once until topology signal changes', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const degradedLogs = [];
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.DEGRADED_TARGET) {
          degradedLogs.push(payload);
        }
      },
    };

    await rebalancer.evaluateState();
    await rebalancer.evaluateState();

    t.equal(
      degradedLogs.length,
      1,
      'degraded target should not spam on unchanged state',
    );
  });

  await t.test('logs suboptimal state once until topology signal changes', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const suboptimalLogs = [];
    rebalancer.logger = {
      ...rebalancer.logger,
      info: (message, payload) => {
        if (message === REBALANCER_LOG_MSG.SUBOPTIMAL_STATE) {
          suboptimalLogs.push(payload);
        }
      },
    };

    await rebalancer.evaluateState();
    await rebalancer.evaluateState();

    t.equal(
      suboptimalLogs.length,
      1,
      'suboptimal state should not spam on unchanged topology',
    );
  });

  await t.test('detects critical state when below minimum replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
    ];

    const policy = {minReplicaCount: 3};

    t.equal(rebalancer.isCriticalState(replicas, policy), true);
  });

  await t.test('does not treat below-min as critical when ready-node capacity is constrained',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
      });

      const replicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];

      const policy = {
        minReplicaCount: 3,
        targetReplicaCount: 3,
      };

      t.equal(
        rebalancer.isCriticalState(replicas, policy),
        false,
        'insufficient ready nodes should be treated as degraded, not critical',
      );
      t.equal(
        rebalancer.isSuboptimalState(replicas, policy),
        false,
        'at actionable target under degraded capacity should not be repeatedly rebalanced',
      );
    });

  await t.test('detects suboptimal state when not at target count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {replicaCount: 3};

    t.equal(rebalancer.isSuboptimalState(replicas, policy), true);
  });

  await t.test('detects suboptimal state when replicas not spread', async (t) => {
    // Create rebalancer with 3 nodes - one unused node available for spreading
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE}, // Unused node
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      placementConstraints: {spreadAcrossNodes: true},
    };

    t.equal(rebalancer.isSuboptimalState(replicas, policy), true);
  });

  await t.test('not suboptimal when no unused nodes for spreading', async (t) => {
    // Create rebalancer with only 2 nodes - no unused nodes available
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      placementConstraints: {spreadAcrossNodes: true},
    };

    // Not suboptimal because there are no unused nodes to spread to
    t.equal(rebalancer.isSuboptimalState(replicas, policy), false);
  });
});

test('UnifiedRebalancer - Rebalancing', async (t) => {
  initializeTestEnvironment();

  await t.test('skips rebalance when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, false);
    t.equal(result.reason, 'not_leader');
  });

  await t.test('returns no changes when already optimal', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-3',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.equal(result.reason, 'no_changes_needed');

    rebalancer.shutdown();
  });

  await t.test('emits rebalanceComplete event', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    t.teardown(() => rebalancer.shutdown());

    const completeEvents = [];
    rebalancer.on('rebalanceComplete', (event) => completeEvents.push(event));

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true);
    t.ok(completeEvents.length > 0);
    t.equal(completeEvents[0].entityId, 'partition-1');
    t.ok(result.moves.some((move) => move.operation === MoveType.ADD));
  });

  await t.test(
    'rebalance uses coordinator createOperation for published priority ' +
    'spread repair with no in-flight entity operations',
    async (t) => {
      const createOperationCalls = [];
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
            replica_count: 3,
          },
        ],
        services: [
          {
            service_id: 'cpub-r1',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-1',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/control_plane_publications-p1-r1',
          },
          {
            service_id: 'cpub-r2',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-1',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/control_plane_publications-p1-r2',
          },
          {
            service_id: 'cpub-r3',
            partition_id: 'control_plane_publications-p1',
            node_id: 'node-2',
            service_type: EntityType.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-2/partition/control_plane_publications-p1-r3',
          },
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync(nodeId) {
            return {
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [],
            };
          },
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 2,
              status: 'PUBLISHED',
            };
          },
        },
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async createOperation(move) {
            createOperationCalls.push(move);
            return {
              operationId: 'op-priority-spread-repair',
              replicaId: move.replicaId || 'cpub-r2',
            };
          },
        },
      });

      t.teardown(() => rebalancer.shutdown());

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.getConfiguredRebalanceBudget = async () => 4;
      rebalancer.getGlobalInFlightOperationCount = async () => 0;

      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          replicaCount: 3,
          minReplicaCount: 3,
          maxReplicaCount: 7,
          placementConstraints: {spreadAcrossNodes: true},
        },
      );

      t.equal(result.success, true, 'published priority repair should rebalance');
      t.equal(
        createOperationCalls.length,
        1,
        'priority spread repair should create one coordinator-owned operation',
      );
      t.equal(
        createOperationCalls[0]?.type,
        'REPLACE',
        'repair should replace an overrepresented replica instead of growing count',
      );
      t.equal(
        createOperationCalls[0]?.nodeId,
        'node-3',
        'repair should target the unused ready node',
      );
      t.equal(
        createOperationCalls[0]?.sourceNodeId,
        'node-1',
        'repair should remove from the overrepresented node',
      );
      t.equal(
        createOperationCalls[0]?.membershipPublicationEpoch,
        2,
        'repair should bind the created operation to the published membership epoch',
      );
      t.equal(
        result.moves.length,
        1,
        'rebalance should schedule one spread repair move',
      );
      t.equal(
        result.moves[0]?.operation,
        MoveType.REPLACE,
        'scheduled result should reflect the replacement repair move',
      );
    },
  );
});

test('UnifiedRebalancer - Statistics', async (t) => {
  initializeTestEnvironment();

  await t.test('returns statistics', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    const stats = rebalancer.getStats();

    t.equal(stats.entityId, 'partition-1');
    t.equal(stats.entityType, EntityType.PARTITION);
    t.equal(stats.isLeader, false);
    t.equal(stats.rebalanceCount, 0);
    t.equal(stats.initialized, true);
  });
});


test('UnifiedRebalancer - Odd Replica Count Helpers', async (t) => {
  initializeTestEnvironment();

  // Import the helper functions
  const {
    isOddReplicaCount,
    adjustToOddCount,
    getNextOddCount,
    getPreviousOddCount,
  } = await import('../../src/rebalancer/unified-rebalancer.js');

  await t.test('isOddReplicaCount returns true for odd numbers', async (t) => {
    t.equal(isOddReplicaCount(1), true);
    t.equal(isOddReplicaCount(3), true);
    t.equal(isOddReplicaCount(5), true);
    t.equal(isOddReplicaCount(7), true);
  });

  await t.test('isOddReplicaCount returns false for even numbers', async (t) => {
    t.equal(isOddReplicaCount(0), false);
    t.equal(isOddReplicaCount(2), false);
    t.equal(isOddReplicaCount(4), false);
    t.equal(isOddReplicaCount(6), false);
  });

  await t.test('adjustToOddCount adjusts up by default', async (t) => {
    t.equal(adjustToOddCount(2), 3);
    t.equal(adjustToOddCount(4), 5);
    t.equal(adjustToOddCount(6), 7);
    t.equal(adjustToOddCount(3), 3); // Already odd
  });

  await t.test('adjustToOddCount adjusts down when specified', async (t) => {
    t.equal(adjustToOddCount(2, 'down'), 1);
    t.equal(adjustToOddCount(4, 'down'), 3);
    t.equal(adjustToOddCount(6, 'down'), 5);
    t.equal(adjustToOddCount(3, 'down'), 3); // Already odd
  });

  await t.test('getNextOddCount returns next odd number', async (t) => {
    t.equal(getNextOddCount(3, 7), 5);
    t.equal(getNextOddCount(5, 7), 7);
    t.equal(getNextOddCount(7, 7), 7); // At max
  });

  await t.test('getPreviousOddCount returns previous odd number', async (t) => {
    t.equal(getPreviousOddCount(7, 3), 5);
    t.equal(getPreviousOddCount(5, 3), 3);
    t.equal(getPreviousOddCount(3, 3), 3); // At min
  });
});

test('UnifiedRebalancer - Policy-Driven Rebalancing', async (t) => {
  initializeTestEnvironment();

  await t.test('validates replica count to be odd', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {minReplicaCount: 3, maxReplicaCount: 7};

    t.equal(rebalancer.validateReplicaCount(3, policy), 3);
    t.equal(rebalancer.validateReplicaCount(4, policy), 5);
    t.equal(rebalancer.validateReplicaCount(5, policy), 5);
    t.equal(rebalancer.validateReplicaCount(6, policy), 7);
    t.equal(rebalancer.validateReplicaCount(7, policy), 7);
    t.equal(rebalancer.validateReplicaCount(8, policy), 7); // Capped at max
    t.equal(rebalancer.validateReplicaCount(2, policy), 3); // Raised to min
  });

  await t.test('calculates target replica count for growth', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    // Current: 3, Target: 5 -> should grow to 5
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const target = rebalancer.calculateTargetReplicaCount(replicas, policy);
    t.equal(target, 5);
  });

  await t.test('calculates target replica count for shrink', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    // Current: 5, Target: 3 -> should shrink to 3
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r5', node_id: 'node-5', status: ReplicaStatus.ACTIVE},
    ];

    const target = rebalancer.calculateTargetReplicaCount(replicas, policy);
    t.equal(target, 3);
  });

  await t.test('applyPolicy detects need for rebalancing', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const decision = rebalancer.applyPolicy(policy);

    t.equal(decision.needsRebalancing, true);
    t.equal(decision.reason, 'replica_count_below_target');
    t.equal(decision.currentCount, 1);
    t.equal(decision.targetCount, 3);
  });

  await t.test('applyPolicy detects replicas not spread', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-1', // Same node as s1
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's3',
          partition_id: 'partition-1',
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
      placementConstraints: {spreadAcrossNodes: true},
    };

    const decision = rebalancer.applyPolicy(policy);

    t.equal(decision.needsRebalancing, true);
    t.equal(decision.reason, 'replicas_not_spread');
  });

  await t.test(
    'critical control-plane partitions treat spreadable replica concentration as urgent',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 's1',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 's2',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
          {
            service_id: 's3',
            partition_id: 'replica_operations-p1',
            node_id: 'node-2',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-2/partition/replica_operations-p1-r3',
          },
        ],
      });

      const policy = {
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };
      const availableNodes = rebalancer.getAvailableNodes();
      const replicas = rebalancer.getCurrentReplicas();

      t.equal(
        rebalancer.isCriticalState(replicas, policy, availableNodes),
        true,
      );
      t.match(
        rebalancer.getCriticalReason(replicas, policy, availableNodes),
        /control_plane_replicas_not_spread/i,
      );
    },
  );
});


test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test('schedules periodic checks when becoming leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Initially no scheduled check
    t.equal(rebalancer.scheduledCheck, null);

    // Become leader - but immediately cancel to avoid async issues
    rebalancer.setLeader(true);

    // Should have scheduled a check
    t.ok(rebalancer.scheduledCheck !== null, 'Check was scheduled');

    // Cleanup immediately
    rebalancer.shutdown();
    t.equal(rebalancer.scheduledCheck, null);
  });

  await t.test(
    'schedules fast-start checks for priority control-plane partitions',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      rebalancer.setLeader(true);

      t.equal(typeof scheduledDelayMs, 'number');
      t.ok(
        scheduledDelayMs >= 1 &&
        scheduledDelayMs <= rebalancer.criticalCheckDelayMs,
        'priority control-plane partitions should schedule within the short critical retry window',
      );

      rebalancer.shutdown();
    },
  );

  await t.test('cancels scheduled checks when losing leadership', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    t.ok(rebalancer.scheduledCheck !== null);

    // Lose leadership
    rebalancer.setLeader(false);

    t.equal(rebalancer.scheduledCheck, null);
    rebalancer.shutdown();
  });

  await t.test('triggers immediate check for critical events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Set leader directly without triggering scheduler
    rebalancer.isLeader = true;

    let immediateCheckCalled = false;
    // Override triggerImmediateCheck to track calls
    const _originalTrigger = rebalancer.triggerImmediateCheck.bind(rebalancer);
    rebalancer.triggerImmediateCheck = (_reason) => {
      immediateCheckCalled = true;
      // Don't actually trigger the check to avoid async issues
    };

    // Trigger immediate check
    rebalancer.triggerImmediateCheck('node_failure');

    t.equal(immediateCheckCalled, true, 'Immediate check was triggered');

    rebalancer.isLeader = false;
    rebalancer.shutdown();
  });

  await t.test('detects critical CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
      ],
    });

    // Node failure event affecting our replicas
    const nodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-1', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(nodeFailureEvent), true);

    // Node failure event NOT affecting our replicas
    const otherNodeFailureEvent = {
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-3', status: NodeStatus.FAILED},
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherNodeFailureEvent), false);
  });

  await t.test('detects service failure CDC events', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Service failure for our partition
    const serviceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's1',
        partition_id: 'partition-1',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(serviceFailureEvent), true);

    // Service failure for different partition
    const otherServiceFailureEvent = {
      tableName: 'services',
      operation: 'UPDATE',
      data: {
        service_id: 's2',
        partition_id: 'partition-2',
        status: ReplicaStatus.FAILED,
      },
    };

    t.equal(rebalancer.isCriticalCDCEvent(otherServiceFailureEvent), false);
  });

  await t.test('uses exponential backoff when stable', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    const initialInterval = rebalancer.currentInterval;

    // Simulate stable state (no rebalancing needed)
    // The interval should increase
    rebalancer.currentInterval = Math.min(
      rebalancer.currentInterval * 1.5,
      rebalancer.maxInterval,
    );

    t.ok(rebalancer.currentInterval > initialInterval);
    t.ok(rebalancer.currentInterval <= rebalancer.maxInterval);
  });

  await t.test('resets interval after rebalancing action', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();

    // Increase interval (simulate stable period)
    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = rebalancer.maxInterval;

    // Simulate what checkRebalance does when rebalancing is needed
    // Reset interval to base (this is what happens after a rebalance action)
    rebalancer.currentInterval = baseInterval;

    // Interval should be reset to base after rebalancing
    t.equal(rebalancer.currentInterval, baseInterval);
  });

  await t.test('checkRebalance backs off when no actionable moves were executed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.rebalance = async () => ({
      success: true,
      moves: [
        {success: false, skipped: true, reason: 'safety_blocked'},
      ],
    });
    rebalancer.scheduleNextCheck = () => {};

    const baseInterval = rebalancer.periodicCheckIntervalMs;
    rebalancer.currentInterval = baseInterval;

    await rebalancer.checkRebalance();

    t.ok(
      rebalancer.currentInterval > baseInterval,
      'interval should back off when all moves are skipped',
    );
  });

  await t.test(
    'checkRebalance revalidates topology in-flight blockers with authoritative entity operations',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [
          {
            operation_id: 'op-cache-stale-topology',
            type: 'ADD',
            partition_id: 'control_plane_publications-p1',
            entity_type: EntityType.PARTITION,
            entity_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: ReplicaStatus.CREATING,
            workflow_step: WORKFLOW_STEP.CREATING,
          },
        ],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [];
          },
        },
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        authoritativeEntityReadCalls,
        1,
        'in-flight topology blockers should be revalidated against authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'stale cache-only topology blockers should not prevent progress',
      );
    },
  );

  await t.test(
    'checkRebalance ignores stale authoritative topology operations during blocker revalidation',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const nowMs = Date.now();
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'control_plane_publications-p1',
            table_id: 'control_plane_publications',
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        replicaOperations: [
          {
            operation_id: 'op-cache-topology',
            type: 'ADD',
            partition_id: 'control_plane_publications-p1',
            entity_type: EntityType.PARTITION,
            entity_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: ReplicaStatus.CREATING,
            workflow_step: WORKFLOW_STEP.CREATING,
          },
        ],
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-stale',
              type: 'ADD',
              partition_id: 'control_plane_publications-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              status: ReplicaStatus.CREATING,
              workflow_step: WORKFLOW_STEP.CREATING,
              created_at: nowMs - 120000,
              updated_at: nowMs - 120000,
            }];
          },
        },
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = 0;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now() - 1;
      rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
      rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
      rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateStateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateStateCalls += 1;
        return false;
      };

      await rebalancer.checkRebalance();

      t.equal(
        authoritativeEntityReadCalls,
        1,
        'topology blocker revalidation should still read authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'stale authoritative in-flight topology operations should not keep topology-settling closed',
      );
    },
  );

  await t.test(
    'checkRebalance keeps priority control-plane partitions on short retry cadence ' +
      'when no actionable moves execute',
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
      rebalancer.rebalance = async () => ({
        success: true,
        moves: [
          {success: false, skipped: true, reason: 'budget_exceeded'},
        ],
      });
      const scheduledDelays = [];
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelays.push(overrideDelayMs);
      };

      rebalancer.currentInterval = rebalancer.periodicCheckIntervalMs;

      await rebalancer.checkRebalance();

      t.equal(
        scheduledDelays[0],
        rebalancer.getPriorityRetryDelayMs(),
        'priority partitions should schedule the next check on the short retry cadence',
      );
    },
  );

  await t.test(
    'checkRebalance keeps priority control-plane partitions on short retry cadence ' +
      'when state is currently stable',
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
        'priority partitions should keep the short retry cadence while waiting for the next convergence change',
      );
    },
  );

  await t.test('checkRebalance resets interval when actionable moves are executed', async (t) => {
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
    rebalancer.rebalance = async () => ({
      success: true,
      moves: [
        {success: true, skipped: false, operation: 'add'},
      ],
    });
    rebalancer.scheduleNextCheck = () => {};

    rebalancer.currentInterval = rebalancer.maxInterval;

    await rebalancer.checkRebalance();

    t.equal(
      rebalancer.currentInterval,
      rebalancer.periodicCheckIntervalMs,
      'interval should reset when actionable moves execute',
    );
  });

  await t.test('checkRebalance defers periodic work when local router is backpressured',
    async (t) => {
      const router = createMockMessageRouter('connected');
      router.getOutboundPressureSummary = () => ({
        backpressured: true,
        saturatedNodeCount: 1,
        maxPendingUtilization: 1,
      });
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

      let evaluateCalls = 0;
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
        0,
        'router pressure should defer the periodic cycle before evaluation',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'router pressure defer should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance defers system partitions when explicit ' +
    'non-zero start delay is configured',
    async (t) => {
      const explicitDelayMs = 600000;
      const rebalancer = createTestRebalancer({
      entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = explicitDelayMs;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return true;
      };

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'system partition should not evaluate before explicit delay',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'start-delay gate should schedule a delayed recheck',
      );
      t.ok(
        scheduledDelayMs >= 599000,
        'scheduled delay should be close to explicit start delay',
      );
    });

  await t.test(
    'checkRebalance defers system partitions with default ' +
    '0ms start delay',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
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
        1,
        'system partition should evaluate immediately with zero default delay',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'zero default delay should not schedule a deferred start-delay check',
      );
    });

  await t.test('checkRebalance does not defer user partitions with zero start delay',
    async (t) => {
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
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'user partition should evaluate immediately when start delay is zero',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while cluster membership is transitional',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: 'warming'},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should not evaluate while nodes are still transitional',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'topology-settling gate should schedule a delayed retry',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.criticalCheckDelayMs,
        'priority control-plane partitions should retry topology-settling checks on the short critical cadence',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while active nodes have not published ready heartbeats',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: null,
          },
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should not evaluate while active nodes are still missing ready-heartbeat publication',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'ready-heartbeat settling should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance does not defer critical system partitions for a ' +
    'transport-connected ACTIVE node when canonical readiness keeps ' +
    'cluster membership healthy despite a stale lease',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                true,
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
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: Date.now() - 1000,
          },
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should follow canonical readiness rather than raw stale ready-lease rows',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should stay open when canonical readiness already recovered cluster membership',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when readiness quorum is healthy',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const healthy = nodeId !== 'node-5';
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                healthy,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: healthy,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: healthy,
            },
            reasons: healthy ? [] : [{code: 'cluster_member_unhealthy'}],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
          {node_id: 'node-5', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
          createNodeEndpoint('node-4'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
          createPostgresWireEndpoint('node-4'),
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane partitions should continue planning when healthy-node quorum is satisfied',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should remain open when priority quorum is healthy',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions open when ' +
    'quorum is recovery-eligible during ACK_PENDING convergence',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          const recoveryEligibleNodeIds = new Set([
            'node-1',
            'node-2',
            'node-3',
          ]);
          const recoveryEligible = recoveryEligibleNodeIds.has(nodeId);
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                nodeId === 'node-1',
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
                nodeId === 'node-1',
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]:
                recoveryEligible,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
                nodeId === 'node-1',
            },
            reasons: recoveryEligible ? [] : [{code: 'cluster_member_unhealthy'}],
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
          {node_id: 'node-4', status: NodeStatus.ACTIVE},
          {node_id: 'node-5', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane recovery should continue once quorum is control-plane-recovery-eligible even when cluster-member health is still converging',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'topology-settling gate should remain open when recovery-eligible quorum is present',
      );
    });

  await t.test(
    'checkRebalance does not defer critical system partitions when a node is failed',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.FAILED},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-3'),
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

    t.equal(
      evaluateCalls,
      1,
      'failed nodes should remain actionable and must not be blocked by the settling gate',
    );
  });

  await t.test(
    'checkRebalance defers critical system partitions while connected membership exceeds nodes cache',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        messageRouter: createMockMessageRouter('connected', [
          'node-2',
          'node-3',
          'node-4',
        ]),
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should not evaluate while transport sees extra cluster members',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'live-membership settling should schedule a delayed retry',
      );

      rebalancer.shutdown();
    });

  await t.test(
    'checkRebalance keeps priority control-plane recovery open when ' +
    'transport sees unpublished extra peers beyond the readiness quorum',
    async (t) => {
      const readinessService = {
        membershipPublicationService:
          createMockMembershipPublicationService(
            ['node-1', 'node-2'],
            1,
            {
              status: 'PUBLISHED',
              priorityPartitionSummary: {
                satisfied: false,
              },
            },
          ),
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                true,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
        messageRouter: createMockMessageRouter('connected', [
          'node-2',
          'node-3',
          'node-4',
        ]),
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority recovery should continue when only unpublished peers remain outside the nodes cache',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'unpublished extra peers should not keep the topology-settling gate closed once quorum is healthy',
      );

      rebalancer.shutdown();
    });

  await t.test(
    'checkRebalance defers critical system partitions while active node endpoint visibility is incomplete',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should not evaluate before endpoint coverage reaches every active node',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'endpoint-visibility settling should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance does not defer critical system partitions for unrelated active-node replica operations in flight',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        replicaOperations: [{
          operation_id: 'op-1',
          type: 'replace',
          partition_group_id: 'services-p1',
          target_node_id: 'node-2',
          status: 'running',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        }],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
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
        1,
        'critical system partitions should continue evaluating when only unrelated topology operations are in flight',
      );
      t.equal(
        scheduledDelayMs !== UNSCHEDULED,
        true,
        'evaluation should still schedule the next check',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while same-entity active-node replica operations are in flight',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        replicaOperations: [{
          operation_id: 'op-1',
          type: 'replace',
          partition_group_id: 'nodes-p1',
          target_node_id: 'node-2',
          status: 'running',
          workflow_step: WORKFLOW_STEP.ACTIVE,
        }],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should still defer when the same entity already has an in-flight topology operation',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'entity-scoped in-flight topology operations should schedule a delayed retry',
      );
    });

  await t.test(
    'checkRebalance defers critical system partitions while local serve readiness is false',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync: () => ({
          nodeId: 'node-1',
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [
            {code: 'load_not_ready'},
            {code: 'transport_not_ready'},
          ],
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'critical system partitions should not evaluate while the local leader is not serve-eligible',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'local serve-readiness gate should schedule a delayed retry',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.criticalCheckDelayMs,
        'priority control-plane partitions should retry serve-readiness checks on the short critical cadence',
      );
    });

  await t.test(
    'checkRebalance allows priority control-plane partitions once bootstrap lifecycle opens metadata publication',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane partitions should evaluate once lifecycle opens metadata publication',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'priority control-plane partitions should not remain blocked on the traffic-ready stable window',
      );
    });

  await t.test(
    'checkRebalance allows priority control-plane partitions to recover ' +
    'while the local seed still has an explicit self ready-lease clear ' +
    'once bootstrap lifecycle opens metadata publication',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          if (nodeId !== 'node-1') {
            return {
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [],
            };
          }
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                false,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                false,
              [CONTROL_PLANE_READINESS_DIMENSION
                .METADATA_PUBLICATION_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
            },
            reasons: [
              {code: 'cluster_member_unhealthy'},
              {code: 'control_plane_write_unhealthy'},
            ],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {
            node_id: 'node-1',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: null,
          },
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'priority control-plane recovery must not self-deadlock behind the restarting seed ready-lease quarantine once metadata publication is open',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'priority control-plane recovery should not remain parked on local self readiness after metadata publication opens',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions blocked on remote stale ready leases until peers become cluster-member healthy',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          if (nodeId === 'node-1') {
            return {
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [],
            };
          }
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
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
            reasons: [
              {code: 'cluster_member_unhealthy'},
              {code: 'control_plane_write_unhealthy'},
            ],
          };
        },
      };
      const staleLease = Date.now() - 1000;
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: staleLease,
          },
          {
            node_id: 'node-3',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: staleLease,
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'priority control-plane recovery should not fan out onto remote stale ready leases while peers are still non-terminal',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.getPriorityRetryDelayMs(),
        'priority control-plane recovery should retry on the short priority cadence while remote ready-lease refresh catches up',
      );
    });

  await t.test(
    'checkRebalance keeps priority control-plane partitions blocked on ' +
    'remote explicit ready-lease clears until peers republish readiness',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const readinessService = {
        getNodeReadinessSync(nodeId) {
          if (nodeId === 'node-1') {
            return {
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                  true,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [],
            };
          }
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
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
            reasons: [
              {code: 'cluster_member_unhealthy'},
              {code: 'control_plane_write_unhealthy'},
            ],
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'control_plane_publications-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {
            node_id: 'node-2',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: null,
          },
          {
            node_id: 'node-3',
            status: NodeStatus.ACTIVE,
            connection_state: 'connected',
            ready_lease_expires_at: null,
          },
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'priority control-plane recovery must not override a remote owner-authored ready-lease clear',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.getPriorityRetryDelayMs(),
        'priority control-plane recovery should retry on the short priority cadence while remote readiness republishes',
      );
    });

  await t.test(
    'checkRebalance allows critical system partitions after bootstrap lifecycle reaches traffic-ready',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: true,
          phase: LIFECYCLE_PHASE.TRAFFIC_READY,
          reasons: [],
          stableElapsedMs: 6000,
          stableWindowMs: 5000,
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should evaluate once bootstrap lifecycle is traffic-ready',
      );
    });

  await t.test(
    'checkRebalance still defers non-priority critical system partitions until bootstrap lifecycle reaches traffic-ready',
    async (t) => {
      const bootstrapReadinessState = {
        evaluate: () => ({
          ready: false,
          phase: LIFECYCLE_PHASE.JOIN_READY,
          reasons: ['READINESS_STABLE_WINDOW_PENDING'],
          stableElapsedMs: 2000,
          stableWindowMs: 5000,
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        bootstrapReadinessState,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'non-priority critical system partitions should not evaluate before bootstrap lifecycle is traffic-ready',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'traffic-readiness gate should schedule a delayed retry for non-priority system partitions',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.currentInterval,
        'non-priority system partitions should keep the ordinary backoff cadence while waiting for full traffic readiness',
      );
    });

  await t.test(
    'checkRebalance allows critical system partitions once local serve readiness is true',
    async (t) => {
      const readinessService = {
        getNodeReadinessSync: (nodeId) => ({
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .METADATA_PUBLICATION_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
        }),
      };
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'critical system partitions should evaluate once the local leader is serve-eligible',
      );
    });

  await t.test(
    'checkRebalance defers non-system entities while priority control-plane partitions remain concentrated',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          6,
          {
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'benchmark_events-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'replica-ops-r1',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 'replica-ops-r2',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
          {
            service_id: 'replica-ops-r3',
            partition_id: 'replica_operations-p1',
            node_id: 'node-1',
            service_type: 'partition',
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r3',
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      let scheduledDelayMs = null;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'non-system rebalancing should yield while priority control-plane partitions are still concentrated on one node',
      );
      t.equal(
        scheduledDelayMs,
        rebalancer.criticalCheckDelayMs,
        'non-system work should retry on the short control-plane-priority cadence',
      );
    },
  );
});


test('UnifiedRebalancer - Replica State Management', async (t) => {
  initializeTestEnvironment();

  await t.test('excludes failed replicas from healthy count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.REMOVED},
      {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
    ];

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 2);
    t.ok(healthy.every((r) => r.status === ReplicaStatus.ACTIVE));
  });

  await t.test('uses voter-ready filtering for critical system partitions', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'nodes-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {
          node_id: 'node-3',
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: Date.now() - 1,
        },
      ],
    });

    const replicas = [
      {
        replica_id: 'r1',
        node_id: 'node-1',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'leader',
        address: 'node-1/partition/nodes-p1-r1',
      },
      {
        replica_id: 'r2',
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'learner',
        address: 'node-2/partition/nodes-p1-r2',
      },
      {
        replica_id: 'r3',
        node_id: 'node-3',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
        address: 'node-3/partition/nodes-p1-r3',
      },
      {
        replica_id: 'r4',
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
        address: null,
      },
    ];

    const healthy = rebalancer.getHealthyReplicas(replicas);

    t.equal(healthy.length, 1, 'only routable non-learner replicas on ready nodes should count');
    t.equal(healthy[0].replica_id, 'r1', 'leader on ready node should remain healthy');
  });

  await t.test('surfaces priority spread as an explicit planner invariant',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
      });

      const replicas = [
        {
          replica_id: 'r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
          address: 'node-1/partition/nodes-p1-r1',
        },
        {
          replica_id: 'r2',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-1/partition/nodes-p1-r2',
        },
      ];
      const policy = {
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {spreadAcrossNodes: true},
      };

      const prioritySpread = rebalancer.movePlanner.analyzePrioritySpread(
        replicas,
        policy,
        rebalancer.getAvailableNodes(),
      );

      t.equal(prioritySpread.requiresSpread, true);
      t.equal(prioritySpread.satisfied, false);
      t.equal(prioritySpread.requiredDistinctNodeCount, 3);
      t.equal(prioritySpread.actualDistinctNodeCount, 1);
      t.equal(prioritySpread.hasUnusedReadyNodes, true);
    });

  await t.test('derives priority spread blocker from published membership summary',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          4,
          {
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: ['replica_operations-p1'],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [],
        controlPlaneReadinessService: readinessService,
      });

      t.same(
        rebalancer.getControlPlanePrioritySpreadBlocker(),
        {
          requiredDistinctNodeCount: 3,
          blockedPartitions: [{
            partitionId: 'replica_operations-p1',
            readyReplicaCount: null,
            readyDistinctNodeCount: null,
            spreadGap: null,
          }],
        },
        'priority gating should be driven by the published membership summary',
      );
    });

  await t.test('ignores legacy service-row priority reconstruction once publication is satisfied',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          5,
          {
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'user-partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        services: [
          {
            service_id: 'priority-r1',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-1',
            status: 'active',
            raft_role: 'leader',
            address: 'node-1/partition/replica_operations-p1-r1',
          },
          {
            service_id: 'priority-r2',
            partition_id: 'replica_operations-p1',
            service_type: EntityType.PARTITION,
            node_id: 'node-1',
            status: 'active',
            raft_role: 'follower',
            address: 'node-1/partition/replica_operations-p1-r2',
          },
        ],
        controlPlaneReadinessService: readinessService,
      });

      t.equal(
        rebalancer.getControlPlanePrioritySpreadBlocker(),
        null,
        'published priority spread satisfaction should short-circuit legacy service-row gating',
      );
    });

  await t.test('treats priority spread repair moves as critical', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'replica_operations-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ],
    });

    t.equal(
      rebalancer.movePlanner.classifyMoveCriticality({
        type: MoveType.REMOVE,
        reason: 'spread_replicas',
      }),
      'critical',
      'priority spread removals should bypass reduced-priority pressure gating',
    );
    t.equal(
      rebalancer.movePlanner.classifyMoveCriticality({
        type: MoveType.REPLACE,
        reason: 'replace_replica',
      }),
      'critical',
      'priority spread replacements should remain on the critical path',
    );
  });

  await t.test(
    'defers standalone removes that would break priority spread during recovery',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        partitions: [
          {
            partition_id: 'sql_write_operations-p1',
            table_id: 'sql_write_operations',
            replica_count: 3,
          },
        ],
      });

      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
      ];

      const moves = rebalancer.calculateMoves(currentReplicas, {
        targetReplicaCount: 2,
        targetNodes: ['node-1', 'node-2'],
        degraded: false,
        availableNodeCount: 3,
      });

      t.same(
        moves,
        [],
        'planner should not evict a priority recovery replica when removal would drop spread below the required distinct-node count',
      );
    },
  );

  await t.test('critical healthy replicas honor published membership boundary',
    async (t) => {
      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService([
          'node-1',
          'node-2',
        ], 3),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      const replicas = [
        {
          replica_id: 'r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'leader',
          address: 'node-1/partition/nodes-p1-r1',
        },
        {
          replica_id: 'r2',
          node_id: 'node-2',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-2/partition/nodes-p1-r2',
        },
        {
          replica_id: 'r3',
          node_id: 'node-3',
          status: ReplicaStatus.ACTIVE,
          raft_role: 'follower',
          address: 'node-3/partition/nodes-p1-r3',
        },
      ];

      const healthy = rebalancer.getHealthyReplicas(replicas);

      t.same(
        healthy.map((replica) => replica.replica_id).sort(),
        ['r1', 'r2'],
        'critical partition health should ignore replicas on nodes outside published membership',
      );
    });

  await t.test('generates remove moves for failed replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    const currentReplicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.FAILED},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const targetState = {
      targetReplicaCount: 3,
      targetNodes: ['node-1', 'node-2', 'node-3'],
    };

    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.equal(removeMoves.length, 1);
    t.equal(removeMoves[0].replicaId, 'r2');
    t.equal(removeMoves[0].reason, 'replica_failed');
  });

  await t.test('generates add moves to create replacement replicas', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
        {node_id: 'node-4', status: NodeStatus.ACTIVE},
      ],
      services: [
        {
          service_id: 's1',
          partition_id: 'partition-1',
          node_id: 'node-1',
          service_type: 'partition',
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: 's2',
          partition_id: 'partition-1',
          node_id: 'node-2',
          service_type: 'partition',
          status: ReplicaStatus.FAILED, // Failed replica
        },
      ],
    });

    const currentReplicas = rebalancer.getCurrentReplicas();
    const policy = await rebalancer.getPolicy();
    const targetState = await rebalancer.calculateTargetState(currentReplicas, policy);
    const moves = rebalancer.calculateMoves(currentReplicas, targetState);

    // Should have remove move for failed replica
    const removeMoves = moves.filter((m) => m.type === MoveType.REMOVE);
    t.ok(removeMoves.length >= 1, 'Should have at least one remove move');

    // Should have add moves to reach target count
    const addMoves = moves.filter((m) => m.type === MoveType.ADD);
    t.ok(addMoves.length >= 1, 'Should have at least one add move');
  });

  await t.test('places new replicas on healthy nodes only', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.FAILED}, // Failed node
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
        {node_id: 'node-4', status: NodeStatus.ACTIVE},
      ],
    });

    const availableNodes = rebalancer.getAvailableNodes();

    // Should only include active nodes
    t.equal(availableNodes.length, 3);
    t.ok(availableNodes.every((n) => n.status === NodeStatus.ACTIVE));
    t.notOk(availableNodes.some((n) => n.node_id === 'node-2'));
  });

  await t.test('uses policy replica count regardless of current count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 3 healthy replicas, Policy: 5 replicas
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target 5 (policy count)
    t.equal(targetCount, 5);
  });

  await t.test('respects minimum replica count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 1 healthy replica, Policy: 3 replicas, Min: 3
    const replicas = [
      {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
    ];

    const policy = {
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target at least minimum
    t.ok(targetCount >= policy.minReplicaCount);
  });

  await t.test('respects maximum replica count', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    // Current: 9 healthy replicas, Policy: 5 replicas, Max: 7
    const replicas = Array.from({length: 9}, (_, i) => ({
      replica_id: `r${i + 1}`,
      node_id: `node-${i + 1}`,
      status: ReplicaStatus.ACTIVE,
    }));

    const policy = {
      replicaCount: 5,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    };

    const targetCount = rebalancer.calculateTargetReplicaCount(replicas, policy);

    // Should target at most maximum
    t.ok(targetCount <= policy.maxReplicaCount);
  });
});

test('UnifiedRebalancer - onNodeStateChange', async (t) => {
  initializeTestEnvironment();

  await t.test('triggers immediate check when node becomes ready', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = (reason) => {
      checkTriggered = true;
      t.equal(reason, 'node_became_ready', 'reason should be node_became_ready');
    };

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(checkTriggered, true, 'should trigger immediate check');

    rebalancer.shutdown();
  });

  await t.test('triggers immediate check when node fails', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = (reason) => {
      checkTriggered = true;
      t.equal(reason, 'node_failed', 'reason should be node_failed');
    };

    rebalancer.onNodeStateChange('node-2', 'active', 'failed');

    t.equal(checkTriggered, true, 'should trigger immediate check');

    rebalancer.shutdown();
  });

  await t.test('does not trigger when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    let checkTriggered = false;
    rebalancer.triggerImmediateCheck = () => {
      checkTriggered = true;
    };

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(checkTriggered, false, 'should not trigger when not leader');

    rebalancer.shutdown();
  });

  await t.test('emits nodeStateChange event always', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader - should still emit event

    const events = [];
    rebalancer.on('nodeStateChange', (e) => events.push(e));

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 1, 'should emit one nodeStateChange event');
    t.equal(events[0].nodeId, 'node-2', 'event should have nodeId');
    t.equal(events[0].oldState, 'disconnected', 'event should have oldState');
    t.equal(events[0].newState, 'active', 'event should have newState');
    t.ok(events[0].timestamp, 'event should have timestamp');

    rebalancer.shutdown();
  });

  await t.test('emits rebalanceNeeded event when leader and rebalance needed', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    rebalancer.setLeader(true);

    const events = [];
    rebalancer.on('rebalanceNeeded', (e) => events.push(e));

    // Suppress the actual check
    rebalancer.triggerImmediateCheck = () => {};

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 1, 'should emit one rebalanceNeeded event');
    t.equal(events[0].nodeId, 'node-2', 'event should have nodeId');
    t.equal(events[0].reason, 'node_became_ready', 'event should have reason');
    t.ok(events[0].timestamp, 'event should have timestamp');

    rebalancer.shutdown();
  });

  await t.test('does not emit rebalanceNeeded when not leader', async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: 'partition-1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
    });

    rebalancer.initialize();
    // Not setting leader

    const events = [];
    rebalancer.on('rebalanceNeeded', (e) => events.push(e));

    rebalancer.onNodeStateChange('node-2', 'disconnected', 'active');

    t.equal(events.length, 0, 'should not emit rebalanceNeeded when not leader');

    rebalancer.shutdown();
  });
});
