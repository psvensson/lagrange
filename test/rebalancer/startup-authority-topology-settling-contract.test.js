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

const TEST_SEED_NODE_ID = 'seed-node';
const TEST_COHORT_NODE_ID_B = 'node-2';
const TEST_COHORT_NODE_ID_C = 'node-3';
const TEST_NON_COHORT_NODE_ID_D = 'node-4';
const TEST_NON_COHORT_NODE_ID_E = 'node-5';
const TEST_PARTITION_ID = 'control_plane_publications-p1';
const TEST_TABLE_ID = 'control_plane_publications';
const TEST_READY_LEASE_OFFSET_MS = 60000;
const TEST_STALE_LEASE_OFFSET_MS = -60000;

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_SEED_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeRow(nodeId, readyLeaseOffsetMs) {
  return {
    node_id: nodeId,
    status: 'active',
    ready_lease_expires_at: Date.now() + readyLeaseOffsetMs,
  };
}

function createNodeEndpoint(nodeId) {
  return {
    node_id: nodeId,
    transport_type: 'ws',
    status: 'active',
  };
}

function createServiceEndpoint(nodeId) {
  return {
    node_id: nodeId,
    service_id: 'sys-postgres-wire',
    health_status: 'healthy',
  };
}

function createCache() {
  const rows = {
    nodes: [
      createNodeRow(TEST_SEED_NODE_ID, TEST_READY_LEASE_OFFSET_MS),
      createNodeRow(TEST_COHORT_NODE_ID_B, TEST_READY_LEASE_OFFSET_MS),
      createNodeRow(TEST_COHORT_NODE_ID_C, TEST_READY_LEASE_OFFSET_MS),
      createNodeRow(TEST_NON_COHORT_NODE_ID_D, TEST_STALE_LEASE_OFFSET_MS),
      createNodeRow(TEST_NON_COHORT_NODE_ID_E, TEST_STALE_LEASE_OFFSET_MS),
    ],
    partitions: [
      {partition_id: TEST_PARTITION_ID, table_id: TEST_TABLE_ID},
    ],
    node_endpoints: [
      createNodeEndpoint(TEST_SEED_NODE_ID),
      createNodeEndpoint(TEST_COHORT_NODE_ID_B),
      createNodeEndpoint(TEST_COHORT_NODE_ID_C),
    ],
    service_endpoints: [
      createServiceEndpoint(TEST_SEED_NODE_ID),
      createServiceEndpoint(TEST_COHORT_NODE_ID_B),
      createServiceEndpoint(TEST_COHORT_NODE_ID_C),
    ],
    services: [],
    tables: [],
    replica_operations: [],
  };
  return {
    get(tableName, key) {
      const values = rows[tableName] || [];
      return values.find((row) =>
        row.partition_id === key || row.node_id === key
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

function createReadinessService(cache) {
  return {
    getNodeReadinessSync(nodeId) {
      const nodeRow = cache.get('nodes', nodeId);
      const ready =
        nodeRow !== null &&
        Number(nodeRow.ready_lease_expires_at) > Date.now() &&
        nodeRow.status === 'active';
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: ready,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: ready,
        },
        reasons: [],
      };
    },
    getStartupAuthoritySnapshotSync() {
      return {
        authorityAvailable: true,
        canonicalStartupNodeIds: [
          TEST_SEED_NODE_ID,
          TEST_COHORT_NODE_ID_B,
          TEST_COHORT_NODE_ID_C,
        ],
      };
    },
  };
}

function createRebalancer() {
  const cache = createCache();
  return new UnifiedRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_SEED_NODE_ID,
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
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
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
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: createReadinessService(cache),
  });
}

test(
  'UnifiedRebalancer constrains critical-system topology settling to the startup-authority cohort',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer();

    t.equal(
      rebalancer.getCriticalSystemTopologySettlingBlocker(),
      null,
      'non-cohort ACTIVE rows should not reopen topology settling once startup authority is available',
    );
    t.end();
  },
);

test(
  'UnifiedRebalancer checkRebalance reaches evaluation when only non-cohort ACTIVE rows are unready',
  async (t) => {
    initEnv();
    const rebalancer = createRebalancer();

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
      'topology settling should not stall on unready non-cohort ACTIVE rows',
    );
  },
);

// ---- END-2: drain-planning continuity (gate stat-gate-20260624T134940Z) ----
// An over-replicated priority partition whose only topology-settling blocker is
// its OWN in-flight add-half must not serialize its surplus drain behind that
// add — that keeps the raft voter set over target ~186s across leader churn.
// LAGRANGE_PR_DRAIN_THROUGH_SETTLING lets such a partition PLAN the drain.
const DRAIN_THROUGH_SETTLING_FLAG = 'LAGRANGE_PR_DRAIN_THROUGH_SETTLING';

function buildOwnInFlightBlocker(partitionId) {
  return {
    reason: 'topology_operations_in_flight',
    inFlightReplicaOperations: 1,
    inFlightReplicaOperationDetails: [{partitionId}],
    inFlightReplicaOperationsSource: 'cache',
  };
}

function createOverTargetRebalancer({replicaCount}) {
  const rebalancer = createRebalancer();
  // Isolate the new decision logic from the (unrelated) priority-recovery and
  // operation-creation-target bypass paths.
  rebalancer.buildPriorityRecoveryPlanningGateBypassSnapshot = () => ({
    operationCreationGate: null,
  });
  rebalancer.getPriorityControlPlaneTargetReplicaCount = () => 3;
  rebalancer.getCurrentReplicas = () =>
    Array.from({length: replicaCount}, (_unused, index) => ({
      replica_id: `${TEST_PARTITION_ID}-r${index + 1}`,
      node_id: index < 4 ? `node-${index + 1}` : 'node-1',
      status: 'active',
    }));
  return rebalancer;
}

test(
  'END-2 flag-off: an over-target partition with its own in-flight add-half ' +
  'still DEFERS (byte-identical)',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 4});
    const blocker = buildOwnInFlightBlocker(TEST_PARTITION_ID);

    const snapshot =
      rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);

    t.equal(snapshot.planningState, 'topology_settling_blocked',
      'flag-off: classified as topology_settling_blocked');
    t.equal(snapshot.shouldDefer, true,
      'flag-off: drain is deferred behind the in-flight add (prior behavior)');
  },
);

test(
  'END-2 flag-on: over-target + own in-flight add-half ALLOWS planning the drain',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 4});
    const blocker = buildOwnInFlightBlocker(TEST_PARTITION_ID);

    process.env[DRAIN_THROUGH_SETTLING_FLAG] = 'true';
    let snapshot;
    try {
      snapshot = rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);
    } finally {
      delete process.env[DRAIN_THROUGH_SETTLING_FLAG];
    }

    t.equal(snapshot.planningState, 'over_replicated_own_drain_ready',
      'flag-on: classified as over_replicated_own_drain_ready');
    t.equal(snapshot.shouldDefer, false,
      'flag-on: planning proceeds so the surplus drain can be computed');
  },
);

test(
  'END-2 flag-on safety: NOT over target -> still defers (no premature drain)',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 3});
    const blocker = buildOwnInFlightBlocker(TEST_PARTITION_ID);

    process.env[DRAIN_THROUGH_SETTLING_FLAG] = 'true';
    let snapshot;
    try {
      snapshot = rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);
    } finally {
      delete process.env[DRAIN_THROUGH_SETTLING_FLAG];
    }

    t.equal(snapshot.shouldDefer, true,
      'at target (3/3): the in-flight op is not surplus -> still defers');
  },
);

test(
  'END-2 flag-on safety: an UNRELATED partition in-flight -> still defers',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 4});
    // Blocker carries an in-flight op for a DIFFERENT partition.
    const blocker = buildOwnInFlightBlocker('replica_operations-p1');

    process.env[DRAIN_THROUGH_SETTLING_FLAG] = 'true';
    let snapshot;
    try {
      snapshot = rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);
    } finally {
      delete process.env[DRAIN_THROUGH_SETTLING_FLAG];
    }

    t.equal(snapshot.shouldDefer, true,
      'unrelated partition transitional -> never relax the settling gate');
  },
);
