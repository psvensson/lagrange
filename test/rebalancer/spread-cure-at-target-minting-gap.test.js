/**
 * Deterministic reproduction for the `spread-cure-at-target-minting-gap`
 * quest, pinned from live run 2026-07-19T07-22-01-510Z (service-data-affinity
 * demo):
 *
 * The partition's surplus drain COMPLETED (REMOVE c98831ba done 07:18:57)
 * and from 07:19 on there were ZERO non-terminal operations for
 * sql_write_operations-p1 — yet every spread ADD was denied
 * `replica_inventory_unusable` until schema-admission timeout at 07:22.
 * The ops table still held the TERMINAL rows of the drained lineage (ADD
 * 54d00075 completed 07:17:55, REMOVE completed 07:18:57; deletion is
 * lazy and nothing new was being written). SELECT_OPERATIONS_BY_ENTITY has
 * no terminal filter, the union inventory builder keeps terminal rows, and
 * the conservative-union escape's final condition treats ANY inventory
 * operation of a topology-increasing TYPE as "already in flight" — so the
 * completed ADD row defeated the escape for the whole window.
 *
 * The clean [A,A,B] shape passes on HEAD
 * (test/rebalancer/critical-spread-terminal-stall-repro.test.js). These
 * cases replay the drain residue on top of it and assert the quest's sealed
 * result: one evaluation cycle produces an ADMITTED spread-restoring
 * operation targeting a free node, even with lagging terminal rows.
 *
 * Out of scope by sealed design (not asserted here): a REPLACE still in its
 * remove-dispatch (drain) phase blocks a second add-like workflow via
 * ensureEntityAddLikeCreateLaneAvailable — that is the run4 over-creation
 * invariant, and its convergence path is drain-completes-then-repair.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildSpreadScenarioHelpers,
  createAllowAllStorageAdmissionService,
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
  initializeSpreadTestEnvironment,
  isAddLikeMoveResult,
} from './test-helpers.js';

const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_TABLE_ID = SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const TEST_UNRELATED_PARTITION_ID = 'message_groups-p1';
const TEST_UNRELATED_TABLE_ID = SYSTEM_TABLE_NAME.MESSAGE_GROUPS;
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
const TEST_DRAINED_REPLICA_ID = 'sql_write_operations-p1-r0';
const TEST_UNRELATED_REPLICA_ID = 'message_groups-p1-r1';
const TEST_PARTITION_SERVICE_TYPE = 'partition';
const TEST_ADDRESS_PREFIX = 'local/partition/';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_REBALANCE_BUDGET = 5;
const TEST_NO_GLOBAL_IN_FLIGHT_OPERATIONS = 0;
const TEST_AUTHORITATIVE_SERVICES_READ_UNAVAILABLE = Object.freeze({
  success: false,
  error: 'authoritative services owner unavailable',
});
const TEST_SERVICES_SQL_PATTERN = 'FROM services';
// Distinctive clause of SELECT_OPERATIONS_BY_ENTITY — must NOT shadow the
// post-create confirmation read (SELECT_OPERATION_BY_ID) in the mock engine.
const TEST_OPERATIONS_SQL_PATTERN = 'entity_type = ? AND entity_id = ?';
// Terminal encodings per replica-operation-progress.js:
// ADD terminalizes at status ACTIVE / step ACTIVE, REMOVE at REMOVED/REMOVED.
const TEST_TERMINAL_ADD_ROW_STATE = Object.freeze({
  status: ReplicaStatus.ACTIVE,
  workflow_step: 'ACTIVE',
});
const TEST_TERMINAL_REMOVE_ROW_STATE = Object.freeze({
  status: ReplicaStatus.REMOVED,
  workflow_step: 'REMOVED',
});

function initializeTestEnvironment() {
  initializeSpreadTestEnvironment(TEST_NODE_ID_A);
}

const {createNodeRow, createReplicaRow, isSpreadRestoringOperationRow} =
  buildSpreadScenarioHelpers({
    partitionId: TEST_PARTITION_ID,
    serviceType: TEST_PARTITION_SERVICE_TYPE,
    addressPrefix: TEST_ADDRESS_PREFIX,
    freeNodeIds: TEST_FREE_NODE_IDS,
  });

function createOperationRow({
  operationId,
  partitionId,
  replicaId,
  targetNodeId,
  type,
  rowState,
}) {
  return {
    operation_id: operationId,
    type,
    partition_id: partitionId,
    entity_type: EntityType.PARTITION,
    entity_id: partitionId,
    replica_id: replicaId,
    target_node_id: targetNodeId,
    status: rowState?.status || ReplicaStatus.PENDING,
    workflow_step: rowState?.workflow_step || 'PENDING',
    completed_at: rowState ? 1 : null,
  };
}

// The live drain residue: BOTH terminal rows of the drained lineage — the
// ADD that created the (since drained) surplus replica and the REMOVE that
// drained it — still visible to entity operation reads.
function createDrainResidueOperationRows() {
  return [
    createOperationRow({
      operationId: 'op-completed-surplus-add',
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_DRAINED_REPLICA_ID,
      targetNodeId: TEST_NODE_ID_A,
      type: MoveType.ADD.toUpperCase(),
      rowState: TEST_TERMINAL_ADD_ROW_STATE,
    }),
    createOperationRow({
      operationId: 'op-completed-surplus-remove',
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_DRAINED_REPLICA_ID,
      targetNodeId: TEST_NODE_ID_A,
      type: MoveType.REMOVE.toUpperCase(),
      rowState: TEST_TERMINAL_REMOVE_ROW_STATE,
    }),
  ];
}

function createAtTargetGapCache({partitions, replicaOperations}) {
  return createMockCache({
    nodes: [
      createNodeRow(TEST_NODE_ID_A),
      createNodeRow(TEST_NODE_ID_B),
      createNodeRow(TEST_NODE_ID_C),
      createNodeRow(TEST_NODE_ID_D),
      createNodeRow(TEST_NODE_ID_E),
    ],
    services: [
      createReplicaRow(TEST_REPLICA_ID_1, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_LEADER),
      createReplicaRow(TEST_REPLICA_ID_2, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_FOLLOWER),
      createReplicaRow(TEST_REPLICA_ID_3, TEST_NODE_ID_B,
        TEST_RAFT_ROLE_FOLLOWER),
    ],
    partitions,
    replicaOperations,
  });
}

// Surface the same rows through the mock's authoritative operations read
// that live guards saw (inFlightOperationsState: "present" over terminal
// rows only). The live read is entity-scoped SQL; only wire it when every
// mock row belongs to the partition under test, or the blanket pattern
// would feed other entities' rows into an entity-scoped read.
function createOperationAwareSqlResults(cache, {wireOperationsRead}) {
  const results = {
    [TEST_SERVICES_SQL_PATTERN]:
      TEST_AUTHORITATIVE_SERVICES_READ_UNAVAILABLE,
  };
  if (wireOperationsRead) {
    results[TEST_OPERATIONS_SQL_PATTERN] = {
      success: true,
      rows: cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
    };
  }
  return results;
}

async function runAtTargetGapCycle(t, {
  label,
  replicaOperations,
  partitions,
  wireOperationsRead = true,
}) {
  initializeTestEnvironment();

  const cache = createAtTargetGapCache({partitions, replicaOperations});
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
    sqlQueryResults: createOperationAwareSqlResults(cache, {
      wireOperationsRead,
    }),
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
    t.equal(
      rebalancer.getAvailableNodes().length,
      5,
      label + ': all five active nodes must be available (harness sanity)',
    );
    t.equal(
      rebalancer.getCurrentReplicas().length,
      TEST_TARGET_REPLICA_COUNT,
      label + ': partition must observe its three ACTIVE replicas ' +
        '(harness sanity)',
    );

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true, label + ': rebalance cycle must complete');
    const addLikeMoveResults = (result.moves || []).filter(
      isAddLikeMoveResult,
    );
    const allMoveDiagnostics = (result.moves || []).map((moveResult) => ({
      operation: moveResult.operation,
      nodeId: moveResult.nodeId,
      reason: moveResult.reason,
      skipped: moveResult.skipped === true,
      admissionReason: moveResult.admission?.reason || null,
    }));
    t.ok(
      addLikeMoveResults.length >= 1,
      label + ': planner must emit a spread-restoring add-like move for ' +
        '[A,A,B] with free active nodes; moves: ' +
        JSON.stringify(allMoveDiagnostics),
    );

    const admittedAddLikeMoveResults = addLikeMoveResults.filter(
      (moveResult) =>
        moveResult.skipped !== true && moveResult.success !== false,
    );
    t.ok(
      admittedAddLikeMoveResults.length >= 1,
      label + ': the spread-restoring move must be ADMITTED within one ' +
        'evaluation cycle despite the drain residue; moves: ' +
        JSON.stringify(allMoveDiagnostics),
    );

    const spreadRestoringOperations = cache
      .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
      .filter(isSpreadRestoringOperationRow);
    t.ok(
      spreadRestoringOperations.length >= 1,
      label + ': a spread-restoring operation row targeting a free node ' +
        'must be persisted',
    );
  } finally {
    rebalancer.shutdown();
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  }
}

test('at-target [A,A,B] priority partition with the TERMINAL rows of its ' +
'drained lineage (completed surplus ADD + completed REMOVE) still receives ' +
'an admitted spread-restoring operation within one evaluation cycle', async (
  t,
) => {
  await runAtTargetGapCycle(t, {
    label: 'terminal-drain-residue',
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      },
    ],
    replicaOperations: createDrainResidueOperationRows(),
  });
});

test('guard: the conservative-union escape admits a spread-typed ADD for ' +
'an at-target [A,A,B] priority partition whose entity operation read ' +
'surfaces only TERMINAL rows while the authoritative services read is ' +
'unavailable', async (t) => {
  initializeTestEnvironment();

  const cache = createAtTargetGapCache({
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      },
    ],
    replicaOperations: createDrainResidueOperationRows(),
  });
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
    defaultRepairEligible: true,
  });
  const coordinator = createTestCoordinator({
    nodeId: TEST_NODE_ID_A,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
    storageAdmissionService: createAllowAllStorageAdmissionService(),
    sqlQueryResults: createOperationAwareSqlResults(cache, {
      wireOperationsRead: true,
    }),
  });

  try {
    let createError = null;
    let operation = null;
    try {
      operation = await coordinator.createOperation({
        type: MoveType.ADD.toUpperCase(),
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_NODE_ID_C,
        reason: 'spread_replicas',
        emitOperationCreated: false,
        enforceConcurrentOperationBudget: true,
      });
    } catch (error) {
      createError = error;
    }

    t.equal(
      createError,
      null,
      'the spread-typed ADD must be admitted (no create error); got: ' +
        (createError?.admissionResult ?
          JSON.stringify({
            decisionType: createError.admissionResult.decisionType,
            blockingReasons: createError.admissionResult.blockingReasons,
          }) :
          String(createError)),
    );
    t.ok(
      operation,
      'createOperation must return the admitted spread-restoring operation',
    );
  } finally {
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  }
});

test('at-target [A,A,B] priority partition still receives an admitted ' +
'spread-restoring operation while an UNRELATED entity has an in-flight ' +
'operation row', async (t) => {
  await runAtTargetGapCycle(t, {
    label: 'unrelated-in-flight',
    wireOperationsRead: false,
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      },
      {
        partition_id: TEST_UNRELATED_PARTITION_ID,
        table_id: TEST_UNRELATED_TABLE_ID,
      },
    ],
    replicaOperations: [
      // Live signature: the in-flight source's newest revision belonged to
      // mg-1-r1 while sql_write_operations-p1 spread ADDs were denied.
      createOperationRow({
        operationId: 'op-unrelated-add',
        partitionId: TEST_UNRELATED_PARTITION_ID,
        replicaId: TEST_UNRELATED_REPLICA_ID,
        targetNodeId: TEST_NODE_ID_C,
        type: MoveType.ADD.toUpperCase(),
      }),
    ],
  });
});

// --- Quest over-target-cap-spread-cure-wipe additions ---------------------
// The at-target cases above pin the terminal-residue escape. The two cases
// below pin the OVER-target cap decision table on top of the same residue:
// an over-target partition below its distinct-node floor keeps exactly the
// floor-restoring cure; an over-target partition already at its floor keeps
// the fail-closed refusal (zero add-like moves).

const TEST_OVER_TARGET_REPLICA_ID_4 = 'sql_write_operations-p1-r4';
const TEST_OVER_TARGET_ACTIVE_COUNT = 4;

function createOverTargetTestStack({services, replicaOperations}) {
  const cache = createMockCache({
    nodes: [
      createNodeRow(TEST_NODE_ID_A),
      createNodeRow(TEST_NODE_ID_B),
      createNodeRow(TEST_NODE_ID_C),
      createNodeRow(TEST_NODE_ID_D),
      createNodeRow(TEST_NODE_ID_E),
    ],
    services,
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      },
    ],
    replicaOperations,
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
    sqlQueryResults: createOperationAwareSqlResults(cache, {
      wireOperationsRead: true,
    }),
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
  return {cache, coordinator, rebalancer};
}

test('over-target [A,A,A,B] priority partition below its distinct-node ' +
'floor, with the TERMINAL rows of a drained lineage still visible, gets an ' +
'admitted spread-restoring move — the over-creation cap retains the open ' +
'spread cure through the drain residue', async (t) => {
  initializeTestEnvironment();

  const {cache, coordinator, rebalancer} = createOverTargetTestStack({
    services: [
      createReplicaRow(TEST_REPLICA_ID_1, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_LEADER),
      createReplicaRow(TEST_REPLICA_ID_2, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_FOLLOWER),
      createReplicaRow(TEST_REPLICA_ID_3, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_FOLLOWER),
      createReplicaRow(TEST_OVER_TARGET_REPLICA_ID_4, TEST_NODE_ID_B,
        TEST_RAFT_ROLE_FOLLOWER),
    ],
    replicaOperations: createDrainResidueOperationRows(),
  });

  try {
    t.equal(
      rebalancer.getCurrentReplicas().length,
      TEST_OVER_TARGET_ACTIVE_COUNT,
      'partition must observe its four ACTIVE replicas (harness sanity)',
    );

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true, 'rebalance cycle must complete');
    const addLikeMoveResults = (result.moves || []).filter(
      isAddLikeMoveResult,
    );
    const allMoveDiagnostics = (result.moves || []).map((moveResult) => ({
      operation: moveResult.operation,
      nodeId: moveResult.nodeId,
      reason: moveResult.reason,
      skipped: moveResult.skipped === true,
      admissionReason: moveResult.admission?.reason || null,
    }));
    t.ok(
      addLikeMoveResults.length >= 1,
      'the over-target cap must retain the floor-restoring add-like move ' +
        'despite the terminal drain residue; moves: ' +
        JSON.stringify(allMoveDiagnostics),
    );
    const admittedAddLikeMoveResults = addLikeMoveResults.filter(
      (moveResult) =>
        moveResult.skipped !== true && moveResult.success !== false,
    );
    t.ok(
      admittedAddLikeMoveResults.length >= 1,
      'the retained spread cure must be ADMITTED within one evaluation ' +
        'cycle; moves: ' + JSON.stringify(allMoveDiagnostics),
    );
    const spreadRestoringOperations = cache
      .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
      .filter(isSpreadRestoringOperationRow);
    t.ok(
      spreadRestoringOperations.length >= 1,
      'a spread-restoring operation row targeting a free node must be ' +
        'persisted',
    );
  } finally {
    rebalancer.shutdown();
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  }
});

test('over-target priority partition ALREADY AT its distinct-node floor ' +
'([A,A,B] plus a stray replica on a fourth node) gets ZERO add-like ' +
'moves — surplus growth on an already-spread partition stays refused ' +
'(fail-closed floor)', async (t) => {
  initializeTestEnvironment();

  const {cache, coordinator, rebalancer} = createOverTargetTestStack({
    services: [
      createReplicaRow(TEST_REPLICA_ID_1, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_LEADER),
      createReplicaRow(TEST_REPLICA_ID_2, TEST_NODE_ID_A,
        TEST_RAFT_ROLE_FOLLOWER),
      createReplicaRow(TEST_REPLICA_ID_3, TEST_NODE_ID_B,
        TEST_RAFT_ROLE_FOLLOWER),
      // The stray fourth replica sits on node D: distinct nodes {A,B,D}
      // already satisfy the min(target 3, distinct targets) floor, so the
      // partition is over target AND spread — retention must not fire even
      // though a free target node exists.
      createReplicaRow(TEST_OVER_TARGET_REPLICA_ID_4, TEST_NODE_ID_D,
        TEST_RAFT_ROLE_FOLLOWER),
    ],
    replicaOperations: [],
  });

  try {
    t.equal(
      rebalancer.getCurrentReplicas().length,
      TEST_OVER_TARGET_ACTIVE_COUNT,
      'partition must observe its four ACTIVE replicas (harness sanity)',
    );

    const result = await rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true, 'rebalance cycle must complete');
    const addLikeMoveResults = (result.moves || []).filter(
      isAddLikeMoveResult,
    );
    t.same(
      addLikeMoveResults.map((moveResult) => ({
        operation: moveResult.operation,
        nodeId: moveResult.nodeId,
      })),
      [],
      'no ADD/REPLACE may be planned for an already-spread over-target ' +
        'partition',
    );
    const addLikeOperationRows = cache
      .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
      .filter(isSpreadRestoringOperationRow);
    t.same(
      addLikeOperationRows,
      [],
      'no add-like operation row may be created for an already-spread ' +
        'over-target partition',
    );
  } finally {
    rebalancer.shutdown();
    if (typeof coordinator.shutdown === 'function') {
      coordinator.shutdown();
    }
  }
});
