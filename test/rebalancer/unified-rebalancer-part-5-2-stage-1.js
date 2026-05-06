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

test('UnifiedRebalancer - Rebalancing Triggers chunk 1', async (t) => {
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
});
