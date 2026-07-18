/**
 * Deterministic RED reproduction of the critical-spread terminal stall
 * observed live in run-2026-07-18T17-41-00-777Z (service-data-affinity demo):
 *
 * A 5-node cluster with every node ACTIVE ends with the priority partition
 * sql_write_operations-p1 holding 3 ACTIVE replicas on only 2 distinct nodes
 * ([A, A, B]), zero in-flight operations, and 3 free active nodes. The
 * planner correctly emits the spread-restoring ADD (spread_replicas) every
 * evaluation tick, but the coordinator's create-time topology guard blocks
 * it with `replica_inventory_unusable` whenever the AUTHORITATIVE services
 * owner read is unavailable (`committedRowsState: "unavailable"` ->
 * `provenance.topologyIncreaseUsable: false`), even though the cache-visible
 * topology proves the same [A, A, B] facts the guard needs. The
 * `isConcentratedLedgerRecoveryMove` escape covers only the operation-ledger
 * partition (replica_operations), so an ordinary priority partition's spread
 * cure is silently re-blocked tick after tick and the
 * critical_system_spread_gap never closes (live: 17:37:26 -> 17:40:24
 * deadline, schema admission denied throughout).
 *
 * Swallowing condition:
 *   src/rebalancer/rebalance-coordinator-topology-guard-methods.js:330-336
 *   (decision row `!inventory.provenance.topologyIncreaseUsable &&
 *   !concentratedLedgerRecoveryMove` -> REPLICA_INVENTORY_UNUSABLE), fed by
 *   the `available: false` authoritative observation at
 *   rebalance-coordinator-operation-read-methods.js:455-495.
 *
 * This test drives the REAL UnifiedRebalancer + REAL RebalanceCoordinator
 * in-process with the live topology and an unavailable authoritative
 * services read, and asserts that ONE evaluation cycle produces an admitted
 * spread-restoring operation (spread-typed ADD or count-neutral REPLACE)
 * targeting a free node. It FAILS on current source because the topology
 * guard blocks the cure with `replica_inventory_unusable`.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EntityType,
  MoveType,
  NodeStatus,
  ReplicaStatus,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_TABLE_ID = SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const TEST_NODE_ID_A = 'node-spread-a';
const TEST_NODE_ID_B = 'node-spread-b';
const TEST_NODE_ID_C = 'node-spread-c';
const TEST_NODE_ID_D = 'node-spread-d';
const TEST_NODE_ID_E = 'node-spread-e';
const TEST_FREE_NODE_IDS = Object.freeze([
  TEST_NODE_ID_C,
  TEST_NODE_ID_D,
  TEST_NODE_ID_E,
]);
const TEST_REPLICA_ID_1 = 'sql_write_operations-p1-r1';
const TEST_REPLICA_ID_2 = 'sql_write_operations-p1-r2';
const TEST_REPLICA_ID_3 = 'sql_write_operations-p1-r3';
const TEST_PARTITION_SERVICE_TYPE = 'partition';
const TEST_ADDRESS_PREFIX = 'local/partition/';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_REBALANCE_BUDGET = 5;
const TEST_NO_GLOBAL_IN_FLIGHT_OPERATIONS = 0;
// The live failure signature this repro re-creates: the authoritative
// services owner read stays unavailable while the cache remains readable
// (run archive: authoritativeAvailable:false, authoritativeReasonCode:null,
// committedRowsState:"unavailable" on every skipped attempt).
const TEST_AUTHORITATIVE_SERVICES_READ_UNAVAILABLE = Object.freeze({
  success: false,
  error: 'authoritative services owner unavailable',
});
const TEST_SERVICES_SQL_PATTERN = 'FROM services';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID_A},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
  };
}

function createReplicaRow(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    service_type: TEST_PARTITION_SERVICE_TYPE,
    node_id: nodeId,
    partition_id: TEST_PARTITION_ID,
    replica_id: replicaId,
    address: TEST_ADDRESS_PREFIX + replicaId,
    raft_role: raftRole,
    status: ReplicaStatus.ACTIVE,
  };
}

// The planner checks `result.decision === 'allow'` while coordinator-side
// callers check `allowed`/`decisionType`; provide both shapes so storage
// capacity never interferes (the live run logged "Storage admission
// allowed" throughout).
function createAllowAllStorageAdmissionService() {
  const allow = async () => ({
    decision: 'allow',
    allowed: true,
    decisionType: 'admitted',
  });
  return {
    checkAdd: allow,
    checkReplace: allow,
    checkSplit: allow,
  };
}

function isAddLikeMoveResult(moveResult) {
  return (
    moveResult?.operation === MoveType.ADD ||
    moveResult?.operation === MoveType.REPLACE
  );
}

function isSpreadRestoringOperationRow(operationRow) {
  const operationType = String(
    operationRow?.type || '',
  ).toLowerCase();
  const targetNodeId =
    operationRow?.target_node_id || operationRow?.targetNodeId || null;
  return (
    (operationType === MoveType.ADD || operationType === MoveType.REPLACE) &&
    TEST_FREE_NODE_IDS.includes(targetNodeId)
  );
}

test('critical priority partition [A,A,B] with free active nodes gets a ' +
'spread-restoring operation within one evaluation cycle even while the ' +
'authoritative services read is unavailable', async (t) => {
  initializeTestEnvironment();

  const cache = createMockCache({
    nodes: [
      createNodeRow(TEST_NODE_ID_A),
      createNodeRow(TEST_NODE_ID_B),
      createNodeRow(TEST_NODE_ID_C),
      createNodeRow(TEST_NODE_ID_D),
      createNodeRow(TEST_NODE_ID_E),
    ],
    services: [
      // TWO replicas co-located on node A, one on node B — the live
      // terminal topology (critical_system_spread_gap = 1 at target 3).
      createReplicaRow(TEST_REPLICA_ID_1, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_LEADER),
      createReplicaRow(TEST_REPLICA_ID_2, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_FOLLOWER),
      createReplicaRow(TEST_REPLICA_ID_3, TEST_NODE_ID_B,
        TEST_RAFT_ROLE_FOLLOWER),
    ],
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      },
    ],
    // No in-flight operations: the live window had zero replica_operations
    // rows in flight for this partition while the gate demanded creation.
    replicaOperations: [],
  });
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
    defaultRepairEligible: true,
  });
  const storageAdmissionService = createAllowAllStorageAdmissionService();
  const coordinator = createTestCoordinator({
    nodeId: TEST_NODE_ID_A,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
    storageAdmissionService,
    // The live suppressor precondition: every authoritative read of the
    // services owner fails while cache reads keep working.
    sqlQueryResults: {
      [TEST_SERVICES_SQL_PATTERN]:
        TEST_AUTHORITATIVE_SERVICES_READ_UNAVAILABLE,
    },
  });
  const rebalancer = createTestRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_NODE_ID_A,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
    storageAdmissionService,
    storageAccountingService: {estimateReplicaBytes: () => 1},
  });

  rebalancer.setLeader(true);
  rebalancer.clusterReadinessConfirmed = true;
  rebalancer.isStabilized = () => true;
  rebalancer.getConfiguredRebalanceBudget = async () =>
    TEST_REBALANCE_BUDGET;
  rebalancer.getGlobalInFlightOperationCount = async () =>
    TEST_NO_GLOBAL_IN_FLIGHT_OPERATIONS;

  try {
    // Harness sanity: all 5 active nodes are visible, replicas read [A,A,B].
    t.equal(
      rebalancer.getAvailableNodes().length,
      5,
      'all five active nodes must be available to placement (harness sanity)',
    );
    t.equal(
      rebalancer.getCurrentReplicas().length,
      TEST_TARGET_REPLICA_COUNT,
      'partition must observe its three ACTIVE replicas (harness sanity)',
    );

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true, 'rebalance cycle must complete');
    const addLikeMoveResults = (result.moves || []).filter(
      isAddLikeMoveResult,
    );
    // Planner-level sanity: this PASSES on current source — the bare planner
    // correctly emits the spread cure for [A,A,B]. It isolates the red
    // assertion below to the admission layer, not the planner.
    t.ok(
      addLikeMoveResults.length >= 1,
      'planner must emit a spread-restoring add-like move for [A,A,B] ' +
        'with free active nodes (planner sanity; failure here would be a ' +
        'harness problem, not the live bug)',
    );

    const admittedAddLikeMoveResults = addLikeMoveResults.filter(
      (moveResult) =>
        moveResult.skipped !== true && moveResult.success !== false,
    );
    const skipDiagnostics = addLikeMoveResults
      .filter((moveResult) => moveResult.skipped === true)
      .map((moveResult) => ({
        operation: moveResult.operation,
        nodeId: moveResult.nodeId,
        reason: moveResult.reason,
        admissionReason: moveResult.admission?.reason || null,
        admissionDecisionType: moveResult.admission?.decisionType || null,
      }));

    // RED on current source: the create-time topology guard blocks the cure
    // with replica_inventory_unusable because the authoritative services
    // read is unavailable — the exact live terminal stall.
    t.ok(
      admittedAddLikeMoveResults.length >= 1,
      'the spread-restoring move must be ADMITTED (operation created) ' +
        'within one evaluation cycle — a persistently-unavailable ' +
        'authoritative services read must not permanently block the only ' +
        'cure for a critical spread gap; skipped moves: ' +
        JSON.stringify(skipDiagnostics),
    );

    const spreadRestoringOperations = cache
      .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
      .filter(isSpreadRestoringOperationRow);
    t.ok(
      spreadRestoringOperations.length >= 1,
      'a spread-restoring operation row (ADD or count-neutral REPLACE ' +
        'targeting a free node) must be persisted; found: ' +
        JSON.stringify(
          cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
        ),
    );
  } finally {
    rebalancer.shutdown();
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  }
});
