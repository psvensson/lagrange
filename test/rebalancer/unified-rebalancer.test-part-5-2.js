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
} from '../../src/rebalancer/unified-rebalancer.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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
} from '../../src/bootstrap/system-table-schemas-constants.js';
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

test('UnifiedRebalancer - Rebalancing Triggers', async (t) => {
  initializeTestEnvironment();

  await t.test(
    'checkRebalance ignores authoritative priority rows targeting nodes outside the current eligible cohort',
    async (t) => {
      let authoritativeEntityReadCalls = 0;
      const nodes = [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
        {node_id: 'node-3', status: NodeStatus.ACTIVE},
      ];
      const nodeEndpoints = [
        createNodeEndpoint('node-1'),
        createNodeEndpoint('node-2'),
        createNodeEndpoint('node-3'),
      ];
      const serviceEndpoints = [
        createPostgresWireEndpoint('node-1'),
        createPostgresWireEndpoint('node-2'),
        createPostgresWireEndpoint('node-3'),
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(
          nodes,
          [],
          [],
          [],
          [],
          nodeEndpoints,
          serviceEndpoints,
        )),
        async getMembershipPublicationPlanningSnapshot() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-1', 'node-2'],
            projectedServingNodeIds: ['node-1', 'node-2'],
            locallyEligibleNodeIds: ['node-1', 'node-2'],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [{
                partitionId: 'sql_write_operations-p1',
                spreadGap: 1,
              }],
              missingPartitionIds: ['sql_write_operations-p1'],
              requiredDistinctNodeCount: 3,
            },
          };
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'sql_write_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes,
        partitions: [{
          partition_id: 'sql_write_operations-p1',
          table_id: 'sql_write_operations',
        }],
        nodeEndpoints,
        serviceEndpoints,
        replicaOperations: [{
          operation_id: 'op-cache-topology',
          type: 'ADD',
          partition_id: 'sql_write_operations-p1',
          entity_type: EntityType.PARTITION,
          entity_id: 'sql_write_operations-p1',
          source_node_id: 'node-1',
          target_node_id: 'node-3',
          status: ReplicaStatus.CREATING,
          workflow_step: WORKFLOW_STEP.CREATING,
        }],
        controlPlaneReadinessService: readinessService,
        rebalanceCoordinator: {
          ...createMockCoordinator(),
          async getOperationsByEntity() {
            authoritativeEntityReadCalls += 1;
            return [{
              operation_id: 'op-authoritative-priority-mismatch',
              type: 'REPLACE',
              partition_id: 'sql_write_operations-p1',
              entity_type: EntityType.PARTITION,
              entity_id: 'sql_write_operations-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-3',
              status: ReplicaStatus.PENDING,
              workflow_step: WORKFLOW_STEP.SENDING,
              steps_history: JSON.stringify([
                {step: 'PENDING', status: 'pending', inFlight: true},
                {step: 'SENDING', status: 'pending', inFlight: true},
              ]),
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
        'topology blocker revalidation should still consult authoritative entity operations',
      );
      t.equal(
        evaluateStateCalls,
        1,
        'priority operations outside the current eligible cohort should not keep topology-settling closed',
      );
    },
  );
await t.test(
  'checkRebalance ignores cache-in-flight priority ACTIVE replace rows that satisfy ' +
      'spread on the eligible target',
  async (t) => {
    const nodes = [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ];
    const nodeEndpoints = [
      createNodeEndpoint('node-1'),
      createNodeEndpoint('node-2'),
      createNodeEndpoint('node-3'),
    ];
    const serviceEndpoints = [
      createPostgresWireEndpoint('node-1'),
      createPostgresWireEndpoint('node-2'),
      createPostgresWireEndpoint('node-3'),
    ];
    const readinessService = {
      ...createMockReadinessService(createMockCache(
        nodes,
        [],
        [],
        [],
        [],
        nodeEndpoints,
        serviceEndpoints,
      )),
      getMembershipPublicationPlanningAnswerSync() {
        return {
          publishedActiveNodeIdsPresent: true,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
          locallyEligibleNodeIds: ['node-1', 'node-2'],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: ['control_plane_publications-p1'],
            requiredDistinctNodeCount: 3,
          },
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes,
      partitions: [{
        partition_id: 'control_plane_publications-p1',
        table_id: 'control_plane_publications',
      }],
      nodeEndpoints,
      serviceEndpoints,
      replicaOperations: [{
        operation_id: 'op-cache-replace-active',
        type: 'REPLACE',
        partition_id: 'control_plane_publications-p1',
        entity_type: EntityType.PARTITION,
        entity_id: 'control_plane_publications-p1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
      }],
      controlPlaneReadinessService: readinessService,
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
      evaluateStateCalls,
      1,
      'in-flight priority ACTIVE replace rows on eligible targets should not block topology settling in cache',
    );
  },
);

await t.test(
  'checkRebalance ignores combined cache-in-flight priority ACTIVE replace rows ' +
      'that satisfy spread for one partition',
  async (t) => {
    const nodes = [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ];
    const nodeEndpoints = [
      createNodeEndpoint('node-1'),
      createNodeEndpoint('node-2'),
      createNodeEndpoint('node-3'),
    ];
    const serviceEndpoints = [
      createPostgresWireEndpoint('node-1'),
      createPostgresWireEndpoint('node-2'),
      createPostgresWireEndpoint('node-3'),
    ];
    const readinessService = {
      ...createMockReadinessService(createMockCache(
        nodes,
        [],
        [],
        [],
        [],
        nodeEndpoints,
        serviceEndpoints,
      )),
      getMembershipPublicationPlanningAnswerSync() {
        return {
          publishedActiveNodeIdsPresent: true,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
          locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'sql_transaction_participants-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: ['sql_transaction_participants-p1'],
            requiredDistinctNodeCount: 3,
          },
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'sql_transaction_participants-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes,
      partitions: [{
        partition_id: 'sql_transaction_participants-p1',
        table_id: 'sql_transaction_participants',
      }],
      nodeEndpoints,
      serviceEndpoints,
      replicaOperations: [{
        operation_id: 'op-cache-replace-active-1',
        type: 'REPLACE',
        partition_id: 'sql_transaction_participants-p1',
        entity_type: EntityType.PARTITION,
        entity_id: 'sql_transaction_participants-p1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
      }, {
        operation_id: 'op-cache-replace-active-2',
        type: 'REPLACE',
        partition_id: 'sql_transaction_participants-p1',
        entity_type: EntityType.PARTITION,
        entity_id: 'sql_transaction_participants-p1',
        source_node_id: 'node-1',
        target_node_id: 'node-3',
        status: ReplicaStatus.ACTIVE,
        workflow_step: WORKFLOW_STEP.ACTIVE,
      }],
      controlPlaneReadinessService: readinessService,
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
      evaluateStateCalls,
      1,
      'combined ACTIVE replace rows on eligible targets should not block topology settling once the partition is spread-satisfied in flight',
    );
  },
);

await t.test(
  'checkRebalance keeps cache-in-flight priority replace rows blocking when ' +
      'they still do not satisfy spread',
  async (t) => {
    const nodes = [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ];
    const nodeEndpoints = [
      createNodeEndpoint('node-1'),
      createNodeEndpoint('node-2'),
      createNodeEndpoint('node-3'),
    ];
    const serviceEndpoints = [
      createPostgresWireEndpoint('node-1'),
      createPostgresWireEndpoint('node-2'),
      createPostgresWireEndpoint('node-3'),
    ];
    const readinessService = {
      ...createMockReadinessService(createMockCache(
        nodes,
        [],
        [],
        [],
        [],
        nodeEndpoints,
        serviceEndpoints,
      )),
      getMembershipPublicationPlanningAnswerSync() {
        return {
          publishedActiveNodeIdsPresent: true,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
          locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 1,
              spreadGap: 2,
            }],
            missingPartitionIds: ['control_plane_publications-p1'],
            requiredDistinctNodeCount: 3,
          },
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes,
      partitions: [{
        partition_id: 'control_plane_publications-p1',
        table_id: 'control_plane_publications',
      }],
      nodeEndpoints,
      serviceEndpoints,
      replicaOperations: [{
        operation_id: 'op-cache-replace-creating',
        type: 'REPLACE',
        partition_id: 'control_plane_publications-p1',
        entity_type: EntityType.PARTITION,
        entity_id: 'control_plane_publications-p1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: ReplicaStatus.CREATING,
        workflow_step: WORKFLOW_STEP.CREATING,
      }],
      controlPlaneReadinessService: readinessService,
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
    let scheduledDelayMs = null;
    rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
      scheduledDelayMs = overrideDelayMs;
    };

    await rebalancer.checkRebalance();

    t.equal(
      evaluateStateCalls,
      0,
      'in-flight priority replace rows outside the active spread completion invariant should keep topology-settling closed',
    );
    t.equal(
      scheduledDelayMs,
      rebalancer.criticalCheckDelayMs,
      'topology-settling blocker should defer on the priority check cadence',
    );
  },
);

await t.test(
  'checkRebalance does not wait behind the global priority blocker when the ' +
      'current priority partition is itself blocked',
  async (t) => {
    const nodes = [
      {node_id: 'node-1', status: NodeStatus.ACTIVE},
      {node_id: 'node-2', status: NodeStatus.ACTIVE},
      {node_id: 'node-3', status: NodeStatus.ACTIVE},
    ];
    const nodeEndpoints = [
      createNodeEndpoint('node-1'),
      createNodeEndpoint('node-2'),
      createNodeEndpoint('node-3'),
    ];
    const serviceEndpoints = [
      createPostgresWireEndpoint('node-1'),
      createPostgresWireEndpoint('node-2'),
      createPostgresWireEndpoint('node-3'),
    ];
    const readinessService = {
      ...createMockReadinessService(createMockCache(
        nodes,
        [],
        [],
        [],
        [],
        nodeEndpoints,
        serviceEndpoints,
      )),
      getMembershipPublicationPlanningAnswerSync() {
        return {
          publishedActiveNodeIdsPresent: true,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
          locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
          priorityPartitionSummary: {
            blockedPartitions: [{
              partitionId: 'control_plane_publications-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }, {
              partitionId: 'replica_operations-p1',
              requiredDistinctNodeCount: 3,
              readyDistinctNodeCount: 2,
              spreadGap: 1,
            }],
            missingPartitionIds: [
              'control_plane_publications-p1',
              'replica_operations-p1',
            ],
            requiredDistinctNodeCount: 3,
          },
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes,
      partitions: [{
        partition_id: 'control_plane_publications-p1',
        table_id: 'control_plane_publications',
      }],
      nodeEndpoints,
      serviceEndpoints,
      controlPlaneReadinessService: readinessService,
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
    let scheduledDelayMs = null;
    rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
      scheduledDelayMs = overrideDelayMs;
    };

    let evaluateStateCalls = 0;
    rebalancer.evaluateState = async () => {
      evaluateStateCalls += 1;
      return false;
    };

    await rebalancer.checkRebalance();

    t.equal(
      evaluateStateCalls,
      1,
      'a blocked priority partition should keep evaluating repair work instead of waiting behind the global priority blocker',
    );
    t.equal(
      scheduledDelayMs,
      null,
      'self-repair should not immediately reschedule on the global priority wait gate',
    );
  },
);

await t.test(
  'checkRebalance keeps priority control-plane partitions on short retry cadence ' +
      'when no actionable moves execute',
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
      1,
      'entity-scoped cache reads should infer partition ownership instead of dropping malformed syncing rows',
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
  'checkRebalance preserves priority retry cadence after retryable ' +
      'control-plane failures',
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
      error.retryAfterMs = 250;
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
      'priority recovery should keep its short retry loop after transient control-plane failures',
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
  'checkRebalance lets blocked priority recovery continue under contained ' +
    'router pressure',
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
      'contained pressure should not suppress the blocked priority partition',
    );
  },
);

await t.test(
  'checkRebalance defers blocked priority recovery when the control-plane ' +
    'critical reserve is exhausted',
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

    let evaluateCalls = 0;
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
      0,
      'critical reserve exhaustion should defer before evaluation',
    );
    t.equal(
      scheduledDelayMs,
      rebalancer.getPriorityRetryDelayMs(),
      'priority recovery pressure defer should keep the short retry cadence',
    );
  },
);

await t.test(
  'checkRebalance lets blocked priority recovery create missing work when ' +
    'the control-plane critical reserve is exhausted',
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

    let evaluateCalls = 0;
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
      'cached planning evidence should identify missing priority work',
    );
    t.equal(
      evaluateCalls,
      1,
      'missing priority work should reach evaluation despite critical reserve exhaustion',
    );
  },
);

await t.test(
  'checkRebalance lets a priority owner create surrogate recovery work when ' +
    'the control-plane critical reserve is exhausted',
  async (t) => {
    const TEST_OWNER_PARTITION_ID = 'replica_operations-p1';
    const TEST_BLOCKED_PARTITION_ID = 'sql_write_operations-p1';
    const TEST_OWNER_TABLE_ID = 'replica_operations';
    const TEST_BLOCKED_TABLE_ID = 'sql_write_operations';
    const TEST_PUBLICATION_EPOCH = 5;
    const TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
    const TEST_READY_DISTINCT_NODE_COUNT = 1;
    const TEST_SPREAD_GAP = 2;
    const TEST_NODE_ID_A = 'node-1';
    const TEST_NODE_ID_B = 'node-2';
    const TEST_NODE_ID_C = 'node-3';
    const TEST_OWNER_REPLICA_ID_A = 'replica_operations-p1-r1';
    const TEST_OWNER_REPLICA_ID_B = 'replica_operations-p1-r2';
    const TEST_OWNER_REPLICA_ID_C = 'replica_operations-p1-r3';
    const TEST_BLOCKED_REPLICA_ID_A = 'sql_write_operations-p1-r1';
    const TEST_SERVICE_TYPE_PARTITION = 'partition';
    const TEST_RAFT_ROLE_FOLLOWER = 'follower';
    const TEST_SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
    const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
      'eligible_but_no_operation_created';
    const TEST_NEXT_ACTION_CREATE_OPERATION = 'create_recovery_operation';
    const TEST_SCOPE_SURROGATE = 'surrogate_partition';
    const TEST_CREATED_OPERATION_ID = 'op-surrogate-priority-recovery';
    const TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY = Object.freeze({
      backpressured: true,
      saturatedNodeCount: 1,
      totalPending: 36,
      totalPendingCritical: 36,
      totalPendingBackground: 0,
      criticalReserveExhausted: true,
      maxPendingUtilization: 0.5625,
    });
    const nodes = Object.freeze([
      Object.freeze({node_id: TEST_NODE_ID_A, status: NodeStatus.ACTIVE}),
      Object.freeze({node_id: TEST_NODE_ID_B, status: NodeStatus.ACTIVE}),
      Object.freeze({node_id: TEST_NODE_ID_C, status: NodeStatus.ACTIVE}),
    ]);
    const ownerServices = Object.freeze([
      Object.freeze({
        service_id: TEST_OWNER_REPLICA_ID_A,
        service_type: TEST_SERVICE_TYPE_PARTITION,
        node_id: TEST_NODE_ID_A,
        partition_id: TEST_OWNER_PARTITION_ID,
        replica_id: TEST_OWNER_REPLICA_ID_A,
        raft_role: TEST_RAFT_ROLE_FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: `${TEST_NODE_ID_A}/partition/${TEST_OWNER_REPLICA_ID_A}`,
      }),
      Object.freeze({
        service_id: TEST_OWNER_REPLICA_ID_B,
        service_type: TEST_SERVICE_TYPE_PARTITION,
        node_id: TEST_NODE_ID_B,
        partition_id: TEST_OWNER_PARTITION_ID,
        replica_id: TEST_OWNER_REPLICA_ID_B,
        raft_role: TEST_RAFT_ROLE_FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: `${TEST_NODE_ID_B}/partition/${TEST_OWNER_REPLICA_ID_B}`,
      }),
      Object.freeze({
        service_id: TEST_OWNER_REPLICA_ID_C,
        service_type: TEST_SERVICE_TYPE_PARTITION,
        node_id: TEST_NODE_ID_C,
        partition_id: TEST_OWNER_PARTITION_ID,
        replica_id: TEST_OWNER_REPLICA_ID_C,
        raft_role: TEST_RAFT_ROLE_FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: `${TEST_NODE_ID_C}/partition/${TEST_OWNER_REPLICA_ID_C}`,
      }),
    ]);
    const blockedServices = Object.freeze([Object.freeze({
      service_id: TEST_BLOCKED_REPLICA_ID_A,
      service_type: TEST_SERVICE_TYPE_PARTITION,
      node_id: TEST_NODE_ID_A,
      partition_id: TEST_BLOCKED_PARTITION_ID,
      replica_id: TEST_BLOCKED_REPLICA_ID_A,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      status: ReplicaStatus.ACTIVE,
      address: `${TEST_NODE_ID_A}/partition/${TEST_BLOCKED_REPLICA_ID_A}`,
    })]);
    const priorityPartitionSummary = Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
      blockedPartitions: Object.freeze([Object.freeze({
        partitionId: TEST_BLOCKED_PARTITION_ID,
        readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        spreadGap: TEST_SPREAD_GAP,
      })]),
      missingPartitionIds: Object.freeze([TEST_BLOCKED_PARTITION_ID]),
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
          partitionId: TEST_BLOCKED_PARTITION_ID,
          semanticState: TEST_SEMANTIC_STATE_NEEDS_OPERATION,
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
    const router = createMockMessageRouter('connected');
    router.getOutboundPressureSummary = () =>
      TEST_CRITICAL_RESERVE_EXHAUSTED_SUMMARY;
    const cache = createMockCache(
      nodes,
      [...ownerServices, ...blockedServices],
      [
        {partition_id: TEST_OWNER_PARTITION_ID, table_id: TEST_OWNER_TABLE_ID},
        {
          partition_id: TEST_BLOCKED_PARTITION_ID,
          table_id: TEST_BLOCKED_TABLE_ID,
        },
      ],
    );
    const readinessService = {
      ...createMockReadinessService(cache),
      getPriorityRecoveryPlanningAnswerSync() {
        return planningSnapshot;
      },
      async getPriorityRecoveryPlanningAnswerBestEffort() {
        return planningSnapshot;
      },
      getMembershipPublicationPlanningAnswerSync() {
        return planningSnapshot;
      },
      async getMembershipPublicationPlanningAnswerBestEffort() {
        return planningSnapshot;
      },
      membershipPublicationService: {
        getLatestClusterPublicationSync() {
          return {priorityPartitionSummary};
        },
      },
    };
    const createdOperations = [];
    const rebalancer = createTestRebalancer({
      entityId: TEST_OWNER_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      nodes,
      services: [...ownerServices, ...blockedServices],
      partitions: [
        {partition_id: TEST_OWNER_PARTITION_ID, table_id: TEST_OWNER_TABLE_ID},
        {
          partition_id: TEST_BLOCKED_PARTITION_ID,
          table_id: TEST_BLOCKED_TABLE_ID,
        },
      ],
      messageRouter: router,
      controlPlaneReadinessService: readinessService,
      rebalanceCoordinator: {
        ...createMockCoordinator(),
        async createOperation(operationRequest) {
          createdOperations.push(operationRequest);
          return {
            operationId: TEST_CREATED_OPERATION_ID,
            replicaId: operationRequest.replicaId,
            targetNodeId: operationRequest.nodeId,
          };
        },
      },
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
    rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
    rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
    rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_REQUIRED_DISTINCT_NODE_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.scheduleNextCheck = () => {};

    const gateSnapshot =
      rebalancer.buildTransportBackpressurePlanningGateSnapshot();
    await rebalancer.checkRebalance();

    t.equal(
      gateSnapshot.priorityRecoveryOperationCreationRequired,
      true,
      'surrogate missing priority work should bypass pressure deferral',
    );
    t.equal(
      gateSnapshot.priorityRecoveryOperationCreationPartitionId,
      TEST_BLOCKED_PARTITION_ID,
      'transport gate should report the blocked surrogate partition',
    );
    t.equal(
      gateSnapshot.priorityRecoveryOperationCreationScope,
      TEST_SCOPE_SURROGATE,
      'transport gate should identify surrogate operation creation',
    );
    t.equal(
      createdOperations.length,
      1,
      'surrogate priority recovery should create exactly one operation',
    );
    t.equal(
      createdOperations[0]?.partitionId,
      TEST_BLOCKED_PARTITION_ID,
      'created operation should target the blocked priority partition',
    );
    t.equal(
      createdOperations[0]?.nodeId,
      TEST_NODE_ID_B,
      'created operation should choose a missing eligible node',
    );
  },
);

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
    rebalancer.clusterReadinessConfirmed = true;
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

});
