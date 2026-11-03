import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {withRegisteredIncarnations} from
  '../test-helpers/endpoint-incarnation-fixture.js';

const SEED_NODE_ID = 'seed-node';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const SYSTEM_PARTITION_ID = 'control_plane_publications-p1';
const NON_PRIORITY_SYSTEM_PARTITION_ID = 'services-p1';

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: SEED_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeRow(nodeId, leaseOffsetMs = 60000) {
  return {
    node_id: nodeId,
    status: 'active',
    ready_lease_expires_at: Date.now() + leaseOffsetMs,
  };
}

function createNodeEndpoint(nodeId) {
  return {
    node_id: nodeId,
    transport_type: 'ws',
    status: 'active',
  };
}

function createCache(options = {}) {
  const nodes = options.nodes || [
    createNodeRow(SEED_NODE_ID),
    createNodeRow(NODE_B),
    createNodeRow(NODE_C),
  ];
  const endpoints = options.nodeEndpoints || [
    createNodeEndpoint(SEED_NODE_ID),
    createNodeEndpoint(NODE_B),
    createNodeEndpoint(NODE_C),
  ];
  const replicaOperations = options.replicaOperations || [];
  const rows = withRegisteredIncarnations({
    nodes,
    partitions: [
      {partition_id: SYSTEM_PARTITION_ID, table_id: 'control_plane_publications'},
      {partition_id: NON_PRIORITY_SYSTEM_PARTITION_ID, table_id: 'services'},
    ],
    node_endpoints: endpoints,
    services: [],
    tables: [],
    replica_operations: replicaOperations,
  });
  return {
    get(tableName, key) {
      const values = rows[tableName] || [];
      return values.find((row) =>
        row.partition_id === key || row.node_id === key,
      ) || null;
    },
    getAll(tableName) {
      return rows[tableName] || [];
    },
    filter(tableName, predicate) {
      return (rows[tableName] || []).filter(predicate);
    },
  };
}

function createRebalancer(overrides = {}) {
  const cache = overrides.cache || createCache();
  const partitionId = overrides.partitionId || SYSTEM_PARTITION_ID;
  const rebalancer = new UnifiedRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [SEED_NODE_ID, NODE_B, NODE_C],
    },
    rebalanceCoordinator: overrides.rebalanceCoordinator || {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
      getOperationsByEntity: overrides.getOperationsByEntity || (async () => []),
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: overrides.controlPlaneReadinessService || {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
        };
      },
    },
  });
  return rebalancer;
}

test(
  'Attempt 3 (a): placeholder readiness for N but committed lease current -> settle blocker is null',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer({
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          const isNodeB = nodeId === NODE_B;
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: !isNodeB,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: !isNodeB,
            },
            reasons: isNodeB ? ['placeholder_unready'] : [],
          };
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
          };
        },
      },
    });

    const blocker = rebalancer.getCriticalSystemTopologySettlingBlocker();
    t.equal(
      blocker,
      null,
      'settle blocker is null when committed lease is current, ignoring placeholder readiness',
    );
    t.end();
  },
);

test(
  'Attempt 3 (b): cache REPLICA_OPERATIONS empty, owner read has one in-flight ADD -> blocker topology_operations_in_flight source authoritative',
  async (t) => {
    initEnv();
    const authoritativeOp = {
      operation_id: 'op-inflight-add-1',
      operationId: 'op-inflight-add-1',
      type: 'ADD',
      status: 'in_progress',
      workflow_step: 'replicating',
      workflowStep: 'replicating',
      entity_type: EntityType.PARTITION,
      entity_id: SYSTEM_PARTITION_ID,
      partition_id: SYSTEM_PARTITION_ID,
      partitionId: SYSTEM_PARTITION_ID,
      target_node_id: NODE_B,
      targetNodeId: NODE_B,
    };
    const cache = createCache({replicaOperations: []});
    const rebalancer = createRebalancer({
      cache,
      getOperationsByEntity: async (_entityType, _entityId, options) => {
        if (options?.visibilityReadMode === 'owner_rpc_required') {
          return [authoritativeOp];
        }
        return [];
      },
    });

    const decision = await rebalancer.resolveTopologySettlingPlanningGateDecision();
    t.ok(decision, 'planning gate should produce a decision');
    t.equal(
      decision?.blocker?.reason,
      'topology_operations_in_flight',
      'blocker reason should be topology_operations_in_flight',
    );
    t.equal(
      decision?.blocker?.inFlightReplicaOperationsSource,
      'authoritative',
      'inFlightReplicaOperationsSource must be authoritative',
    );
    t.equal(
      decision?.blocker?.inFlightReplicaOperations,
      1,
      'inFlightReplicaOperations count should be 1',
    );
    t.end();
  },
);

test(
  'Attempt 3 (c): owner read throws -> unavailable, not the cache blocker',
  async (t) => {
    initEnv();
    const cache = createCache({
      replicaOperations: [{
        operation_id: 'cached-op-1',
        type: 'ADD',
        status: 'in_progress',
        partition_id: SYSTEM_PARTITION_ID,
        target_node_id: NODE_B,
      }],
    });
    const rebalancer = createRebalancer({
      cache,
      getOperationsByEntity: async () => {
        throw new Error('rpc leader read unavailable');
      },
    });

    const decision = await rebalancer.resolveTopologySettlingPlanningGateDecision();
    t.ok(decision, 'planning gate should produce a decision on owner read failure');
    t.equal(
      decision?.blocker?.reason,
      'unavailable',
      'settle blocker answers unavailable when owner read throws, not cache blocker',
    );
    t.end();
  },
);

test(
  'Attempt 3 (d): local-serve PRIORITY_..._PENDING on a non-priority system partition -> no defer, interval unchanged',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer({
      partitionId: NON_PRIORITY_SYSTEM_PARTITION_ID,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
            },
            reasons: [{code: 'priority_control_plane_recovery_pending'}],
          };
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: [SEED_NODE_ID, NODE_B, NODE_C],
          };
        },
      },
    });

    t.equal(
      rebalancer.isControlPlanePriorityPartition(),
      false,
      'services partition is non-priority',
    );
    t.equal(
      rebalancer.isSystemPartitionEntity(),
      true,
      'services partition is a system partition',
    );

    const initialInterval = rebalancer.currentInterval;
    const localServeDecision = rebalancer.resolveLocalServePlanningGateDecision();
    t.equal(
      localServeDecision,
      null,
      'local-serve planning gate decision is null on non-priority system partition',
    );
    t.equal(
      rebalancer.currentInterval,
      initialInterval,
      'interval should be unchanged (no 75s defer)',
    );
    t.end();
  },
);
