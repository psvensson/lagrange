import {createMockCoordinator, createMockControlPlaneReadinessService} from './test-helpers.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {withRegisteredIncarnations} from
  '../test-helpers/endpoint-incarnation-fixture.js';

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
    connection_state: 'ready',
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
  const rows = withRegisteredIncarnations({
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

function createReadinessService(cache) {
  return createMockControlPlaneReadinessService({systemTableCache: cache, callbacks: {
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
  }});
}

function createRebalancer() {
  const cache = createCache();
  const controlPlaneReadinessService = createReadinessService(cache);
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
      getPolicyForPartition: () => ({minReplicaCount: 3, targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: createMockCoordinator({controlPlaneReadinessService}),
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService,
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

// ---- END-2: topology-settling defers an over-target partition's own drain ----
// An over-replicated priority partition whose only topology-settling blocker is
// its OWN in-flight add-half DEFERS its surplus drain behind that add. This is
// the unconditional production behavior.

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
  'END-2: an over-target partition with its own in-flight add-half DEFERS',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 4});
    const blocker = buildOwnInFlightBlocker(TEST_PARTITION_ID);

    const snapshot =
      rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);

    t.equal(snapshot.planningState, 'topology_settling_blocked',
      'classified as topology_settling_blocked');
    t.equal(snapshot.shouldDefer, true,
      'drain is deferred behind the in-flight add');
  },
);

test(
  'END-2: NOT over target -> still defers (no premature drain)',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 3});
    const blocker = buildOwnInFlightBlocker(TEST_PARTITION_ID);

    const snapshot =
      rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);

    t.equal(snapshot.shouldDefer, true,
      'at target (3/3): the in-flight op is not surplus -> still defers');
  },
);

test(
  'END-2: an UNRELATED partition in-flight -> still defers',
  async (t) => {
    initEnv();
    const rebalancer = createOverTargetRebalancer({replicaCount: 4});
    // Blocker carries an in-flight op for a DIFFERENT partition.
    const blocker = buildOwnInFlightBlocker('replica_operations-p1');

    const snapshot =
      rebalancer.buildTopologySettlingPlanningGateSnapshot(blocker);

    t.equal(snapshot.shouldDefer, true,
      'unrelated partition transitional -> never relax the settling gate');
  },
);
