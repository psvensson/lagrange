/**
 * Quest ledger-quorum-spread-hold-cure-drain-admission (diagnosis rung):
 * deterministic guard for the 2-1-1 operation-ledger surplus-drain planning
 * silence, pinned from the user-table-metadata-fanout residual archived at
 * solve/report/ledger-surplus-drain-stale-actuals-2026-08-22/
 * fanout-faceE-no-drain-planned.log.txt (2026-08-22T15:40Z):
 *
 * The ledger partition replica_operations-p1 settles at 4 ACTIVE voters on
 * 3 distinct nodes with 2 voters on the seed (2-1-1, target 3). The
 * concentration owner reports overTarget:true / spreadActionable:true /
 * feasibleTargetNodeIds:[] and the QUORUM_SPREAD hold stays engaged, which
 * keeps the joiners' formation barrier closed — so ONLY the seed holds a
 * READY lease. Across 22+ planning cycles NO surplus REMOVE is ever minted:
 * zero removal activity, zero typed deferral. The one cure the hold's own
 * policy documents (drain one seed voter) is never even planned.
 *
 * Confirmed mechanism (this is a PLANNING-path suppression, not a hold or
 * admission refusal):
 *   1. With barrier-held joiners, getAvailableNodes() = [seed], so
 *      calculatePartitionPlacement (src/rebalancer/move-planner.js:768)
 *      returns degraded:true with targetNodes:[seed].
 *   2. calculateMoves' degraded guard
 *      (src/rebalancer/move-planner-move-calculation-methods.js:508-519)
 *      then skips EVERY surplus-REMOVE candidate at debug level
 *      ("Deferring REMOVE until ADDs complete", degraded:true), leaving
 *      candidateRemoves empty.
 *   3. applyPrioritySpreadDrainCure
 *      (src/rebalancer/move-planner-priority-spread-cure.js:221) sees
 *      standaloneSafeRemoveCount 0, both drain-cure classifiers return
 *      null, and it returns silently — the pass ends "No rebalancing
 *      needed" (no_changes_needed) at an over-target concentrated ledger.
 *   4. The interaction owner ALREADY mints a ledger_surplus_drain planning
 *      capability for exactly this state
 *      (rebalancer-priority-recovery-planning-gate-methods.js:62), but the
 *      rebalance loop consumes it ONLY when availableNodes.length === 0
 *      (src/rebalancer/unified-rebalancer-rebalance-loop.js:178-199). At
 *      the live residual exactly ONE node is READY (the seed — the hold's
 *      own barrier withholds the joiners' leases), so the capability is
 *      dropped and the degraded relabel suppresses the drain: the hold
 *      defers its own cure through the READY projection it suppresses.
 *
 * RED at HEAD: the binding check below drives the REAL UnifiedRebalancer +
 * REAL RebalanceCoordinator with the live 2-1-1 barrier shape and requires
 * that a bounded number of planning passes yields a surplus-drain REMOVE
 * for the hot node — admitted, or at least surfaced with a typed refusal
 * reason. Silence (empty move set, no_changes_needed) is the bug.
 *
 * The control case and the policy sanity case must stay green before AND
 * after the fix: they prove the planner, the drain-cure classifier, the
 * surplus fence, remove safety, and the hold engagement table all admit
 * this exact drain at 2-1-1 once the READY projection is unsuppressed —
 * the hold and the admission lanes are NOT the refusers.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE} from '../../src/constants/index.js';
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
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_LEDGER_HOLD,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME,
  classifyOperationLedgerHoldMove,
  resolveOperationLedgerHoldEngagement,
} from '../../src/rebalancer/operation-ledger-hold-policy.js';
import {
  PLACEMENT_CURE_CONDITION,
  classifyLedgerSpreadSurplusDrainCureCondition,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  createAllowAllStorageAdmissionService,
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_LEDGER_PARTITION_ID = 'replica_operations-p1';
const TEST_SEED_NODE_ID = 'node-1';
const TEST_JOINER_NODE_ID_B = 'node-2';
const TEST_JOINER_NODE_ID_C = 'node-3';
const TEST_COHORT_NODE_IDS = Object.freeze([
  TEST_SEED_NODE_ID,
  TEST_JOINER_NODE_ID_B,
  TEST_JOINER_NODE_ID_C,
]);
const TEST_SEED_LEADER_REPLICA_ID = 'replica_operations-p1-r1';
const TEST_SEED_SURPLUS_REPLICA_ID = 'replica_operations-p1-r2';
const TEST_JOINER_REPLICA_ID_B = 'replica_operations-p1-r3';
const TEST_JOINER_REPLICA_ID_C = 'replica_operations-p1-r4';
const TEST_SEED_REPLICA_IDS = Object.freeze([
  TEST_SEED_LEADER_REPLICA_ID,
  TEST_SEED_SURPLUS_REPLICA_ID,
]);
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_TOTAL_VOTER_COUNT = 4;
const TEST_PARTITION_SERVICE_TYPE = 'partition';
const TEST_ADDRESS_PREFIX = 'local/partition/';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_REBALANCE_BUDGET = 5;
const TEST_NO_GLOBAL_IN_FLIGHT_OPERATIONS = 0;
const TEST_BOUNDED_PLANNING_PASS_COUNT = 3;
const TEST_AUTHORITATIVE_SOURCE = 'owner_rpc_lane';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_SERVICES_BY_PARTITION_SQL_PATTERN =
  'WHERE service_type = ? AND partition_id = ?';
const TEST_LEDGER_SURPLUS_DRAIN_CAPABILITY_KIND = 'ledger_surplus_drain';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: TEST_SEED_NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createReadyNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
  };
}

// A formation-barrier-held joiner: process-alive and CONNECTED
// (heartbeat-only publication) but with NO ready lease — the quorum-spread
// hold's startup-authority barrier withholds it by design while the ledger
// stays concentrated. This is the live residual's node shape.
function createBarrierHeldJoinerNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
    connection_state: NODE_STATE.CONNECTED,
    ready_lease_expires_at: 0,
  };
}

function createLedgerVoterServiceRow(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    service_type: TEST_PARTITION_SERVICE_TYPE,
    node_id: nodeId,
    partition_id: TEST_LEDGER_PARTITION_ID,
    replica_id: replicaId,
    address: TEST_ADDRESS_PREFIX + replicaId,
    raft_role: raftRole,
    status: ReplicaStatus.ACTIVE,
  };
}

// The canonical 2-1-1 surplus placement: 4 ACTIVE voters on 3 distinct
// nodes, 2 co-located on the seed, target 3.
function createSurplusLedgerServiceRows() {
  return [
    createLedgerVoterServiceRow(
      TEST_SEED_LEADER_REPLICA_ID, TEST_SEED_NODE_ID, TEST_RAFT_ROLE_LEADER),
    createLedgerVoterServiceRow(
      TEST_SEED_SURPLUS_REPLICA_ID, TEST_SEED_NODE_ID,
      TEST_RAFT_ROLE_FOLLOWER),
    createLedgerVoterServiceRow(
      TEST_JOINER_REPLICA_ID_B, TEST_JOINER_NODE_ID_B,
      TEST_RAFT_ROLE_FOLLOWER),
    createLedgerVoterServiceRow(
      TEST_JOINER_REPLICA_ID_C, TEST_JOINER_NODE_ID_C,
      TEST_RAFT_ROLE_FOLLOWER),
  ];
}

function createFixedTargetPolicyService() {
  return {
    getPolicyForPartition: () => ({
      minReplicaCount: TEST_TARGET_REPLICA_COUNT,
      replicaCount: TEST_TARGET_REPLICA_COUNT,
    }),
  };
}

// Full-fidelity readiness service: per-node readiness derives from the
// cache node rows (READY seed eligible, barrier-held joiners not), and the
// membership planning snapshot names the whole formation cohort so the
// published-membership remove-safety lane has evidence instead of failing
// "unavailable" for harness reasons.
function createFormationReadinessService(cache, {prioritySpreadSatisfied}) {
  const base = createMockControlPlaneReadinessService({
    systemTableCache: cache,
    defaultRepairEligible: true,
  });
  const buildPlanningSnapshot = (nodeId) => ({
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: TEST_COHORT_NODE_IDS,
    recoveryActiveNodeIds: TEST_COHORT_NODE_IDS,
    projectedServingNodeIds: TEST_COHORT_NODE_IDS,
    publishedMembershipIncludesTargetNode:
      TEST_COHORT_NODE_IDS.includes(nodeId),
    priorityPartitionSummary: {
      satisfied: prioritySpreadSatisfied,
      requiredDistinctNodeCount: TEST_TARGET_REPLICA_COUNT,
      missingPartitionIds: [],
    },
  });
  return {
    getNodeReadinessSync: (nodeId, readOptions) =>
      base.getNodeReadinessSync(nodeId, readOptions),
    getMembershipPublicationPlanningSnapshotBestEffort: async (nodeId) =>
      buildPlanningSnapshot(nodeId),
    getMembershipPublicationPlanningSnapshot: async (nodeId) =>
      buildPlanningSnapshot(nodeId),
    getMembershipPublicationPlanningSnapshotSync: (nodeId) =>
      buildPlanningSnapshot(nodeId),
  };
}

// Answer the coordinator's authoritative (owner-lane) services reads from
// the fixture rows: the surplus-REMOVE placement fence and remove safety
// consume this lane and need a real `source`. This keeps the fence's
// authority evidence GREEN so it can never be the silent refuser here.
function installAuthoritativeServicesRead(coordinator, cache) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (
    tableName, sql, params = [], readOptions = {},
  ) => {
    if (
      tableName === SYSTEM_TABLE_NAME.SERVICES &&
      String(sql).includes(TEST_SERVICES_BY_PARTITION_SQL_PATTERN)
    ) {
      return {
        success: true,
        source: TEST_AUTHORITATIVE_SOURCE,
        rows: cache
          .getAll(SYSTEM_TABLE_NAME.SERVICES)
          .filter((row) => row.partition_id === params[1])
          .map((row) => ({...row})),
      };
    }
    return originalReadAuthoritativeRows(tableName, sql, params, readOptions);
  };
}

function createDrainFixture({joinersBarrierHeld}) {
  const cache = createMockCache({
    nodes: [
      createReadyNodeRow(TEST_SEED_NODE_ID),
      joinersBarrierHeld ?
        createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_B) :
        createReadyNodeRow(TEST_JOINER_NODE_ID_B),
      joinersBarrierHeld ?
        createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_C) :
        createReadyNodeRow(TEST_JOINER_NODE_ID_C),
    ],
    services: createSurplusLedgerServiceRows(),
    partitions: [
      {
        partition_id: TEST_LEDGER_PARTITION_ID,
        leader_node_id: TEST_SEED_NODE_ID,
        replica_count: TEST_TARGET_REPLICA_COUNT,
      },
    ],
    replicaOperations: [],
  });
  const readinessService = createFormationReadinessService(cache, {
    // Live formation truth: with barrier-held joiners the priority spread
    // has NOT converged (the sibling wedge suite pins the same shape);
    // with every node READY at 3 distinct ready nodes the summary is
    // satisfied.
    prioritySpreadSatisfied: !joinersBarrierHeld,
  });
  const storageAdmissionService = createAllowAllStorageAdmissionService();
  const tablePolicyService = createFixedTargetPolicyService();
  const coordinator = createTestCoordinator({
    nodeId: TEST_SEED_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
    storageAdmissionService,
    tablePolicyService,
  });
  installAuthoritativeServicesRead(coordinator, cache);
  const rebalancer = createTestRebalancer({
    entityId: TEST_LEDGER_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_SEED_NODE_ID,
    systemTableCache: cache,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
    storageAdmissionService,
    tablePolicyService,
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

function isHotNodeSurplusDrainMoveResult(moveResult) {
  return (
    moveResult?.operation === MoveType.REMOVE &&
    (moveResult?.nodeId === TEST_SEED_NODE_ID ||
      TEST_SEED_REPLICA_IDS.includes(moveResult?.replicaId))
  );
}

function describeMoveResults(passResults) {
  return JSON.stringify(
    passResults.map((result) => ({
      reason: result.reason || null,
      moves: (result.moves || []).map((moveResult) => ({
        operation: moveResult.operation,
        nodeId: moveResult.nodeId,
        replicaId: moveResult.replicaId,
        skipped: moveResult.skipped === true,
        reason: moveResult.reason || null,
        error: moveResult.error || null,
      })),
    })),
  );
}

async function shutdownFixture(fixture) {
  fixture.rebalancer.shutdown();
  if (typeof fixture.coordinator.shutdown === 'function') {
    await fixture.coordinator.shutdown();
  }
}

test('policy sanity (must stay green): the drain REMOVE is EXEMPT under ' +
'the engaged QUORUM_SPREAD hold and the LEDGER_DRAIN_SPREAD_SURPLUS ' +
'classifier fires on the canonical 2-1-1 evidence — neither the hold ' +
'engagement table nor the cure-condition row is the refuser', (t) => {
  const moveClass = classifyOperationLedgerHoldMove(
    OperationType.REMOVE,
    TEST_LEDGER_PARTITION_ID,
  );
  t.equal(
    resolveOperationLedgerHoldEngagement(
      OPERATION_LEDGER_HOLD.QUORUM_SPREAD,
      moveClass,
    ),
    OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
    'the ledger surplus-drain REMOVE classifies as a disruptive ledger ' +
      'self-move, which the QUORUM_SPREAD hold engagement table maps to ' +
      'EXEMPT — admission is NOT what suppresses the drain',
  );
  t.equal(
    classifyLedgerSpreadSurplusDrainCureCondition({
      partitionId: TEST_LEDGER_PARTITION_ID,
      occupiedReplicaCount: TEST_TOTAL_VOTER_COUNT,
      voterReplicaCount: TEST_TOTAL_VOTER_COUNT,
      activeReplicaCount: TEST_TOTAL_VOTER_COUNT,
      activeDistinctNodeCount: TEST_TARGET_REPLICA_COUNT,
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetDistinctNodeCount: TEST_TARGET_REPLICA_COUNT,
      standaloneSafeRemoveCount: 1,
    }),
    PLACEMENT_CURE_CONDITION.LEDGER_DRAIN_SPREAD_SURPLUS,
    'the drain-cure classifier accepts the 2-1-1 evidence whenever ONE ' +
      'standalone-safe REMOVE candidate exists — its preconditions are ' +
      'satisfiable at this placement, so a null classification can only ' +
      'mean the candidate list upstream was emptied',
  );
  t.end();
});

test('CONTROL (must stay green): with every cohort node READY the same ' +
'2-1-1 surplus placement mints AND admits the surplus-drain REMOVE off ' +
'the hot node within one planning pass — planner candidates, safety ' +
'flags, drain-cure classifier, surplus fence, and remove safety all ' +
'admit this exact drain', async (t) => {
  initializeTestEnvironment();
  const fixture = createDrainFixture({joinersBarrierHeld: false});
  try {
    t.equal(
      fixture.rebalancer.getAvailableNodes().length,
      TEST_COHORT_NODE_IDS.length,
      'all three cohort nodes must be READY (control precondition)',
    );

    const result = await fixture.rebalancer.rebalance(TriggerType.PERIODIC);

    t.equal(result.success, true, 'rebalance cycle must complete');
    const drainMoveResults = (result.moves || []).filter(
      isHotNodeSurplusDrainMoveResult,
    );
    t.ok(
      drainMoveResults.length >= 1,
      'one planning pass must plan the surplus-drain REMOVE for the hot ' +
        'node; got: ' + describeMoveResults([result]),
    );
    const admittedDrainMoveResults = drainMoveResults.filter(
      (moveResult) =>
        moveResult.skipped !== true && moveResult.success !== false,
    );
    t.ok(
      admittedDrainMoveResults.length >= 1,
      'the planned drain must be ADMITTED (operation created) — proving ' +
        'the hold engagement, the surplus fence, and remove safety are ' +
        'not the refusers at 2-1-1; got: ' + describeMoveResults([result]),
    );
    const removeOperationRows = fixture.cache
      .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
      .filter(
        (operationRow) =>
          String(operationRow?.type || '').toLowerCase() ===
            MoveType.REMOVE &&
          operationRow?.partition_id === TEST_LEDGER_PARTITION_ID &&
          TEST_SEED_REPLICA_IDS.includes(operationRow?.replica_id),
      );
    t.ok(
      removeOperationRows.length >= 1,
      'a REMOVE operation row draining one of the seed\'s two co-located ' +
        'voters must be persisted; found: ' +
        JSON.stringify(
          fixture.cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
        ),
    );
  } finally {
    await shutdownFixture(fixture);
    resetTestEnvironment();
  }
});

test('RED (binding check): in the live residual shape — 2-1-1 surplus, ' +
'hold engaged, joiners barrier-held so ONLY the seed is READY — a bounded ' +
'number of planning passes must surface the surplus-drain REMOVE for the ' +
'hot node (admitted or with a typed refusal reason). At HEAD every pass ' +
'returns an empty move set (no_changes_needed): the degraded-placement ' +
'relabel silently suppresses the only cure the hold\'s policy documents',
async (t) => {
  initializeTestEnvironment();
  const fixture = createDrainFixture({joinersBarrierHeld: true});
  try {
    // Precondition: the archived live evidence signature. The hold is
    // engaged, the drain is the one actionable cure (no feasible ADD or
    // REPLACE target exists — every node already hosts the partition).
    const concentration = fixture.coordinator
      .getOperationLedgerQuorumConcentrationForPartition(
        TEST_LEDGER_PARTITION_ID,
      );
    t.ok(
      concentration &&
        concentration.overTarget === true &&
        concentration.spreadActionable === true &&
        concentration.hottestNodeId === TEST_SEED_NODE_ID &&
        concentration.totalVoters === TEST_TOTAL_VOTER_COUNT &&
        concentration.distinctVoterNodeIds.length ===
          TEST_TARGET_REPLICA_COUNT &&
        concentration.feasibleTargetNodeIds.length === 0,
      'the concentration owner must report the archived 2-1-1 residual ' +
        'signature (overTarget, spreadActionable, hottest=seed, 3 ' +
        'distinct nodes, no feasible spread target); got: ' +
        JSON.stringify(concentration),
    );

    // Precondition: the interaction owner authorizes planning the drain
    // for exactly this state — the capability exists, so a silent
    // zero-move pass cannot be excused as "no work was authorized".
    const planningGate = fixture.rebalancer
      .buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_LEDGER_PARTITION_ID,
      );
    t.equal(
      planningGate?.ledgerSurplusDrainPlanningCapability?.kind,
      TEST_LEDGER_SURPLUS_DRAIN_CAPABILITY_KIND,
      'the planning-gate owner must mint the ledger_surplus_drain ' +
        'capability for the engaged hold\'s surplus placement; got: ' +
        JSON.stringify(planningGate),
    );

    // Precondition: only the seed holds a READY lease — the hold's own
    // formation barrier withholds the joiners' leases. This is the READY
    // projection the degraded relabel consumes.
    t.equal(
      fixture.rebalancer.getAvailableNodes().length,
      1,
      'exactly one node (the seed) must be READY in the residual shape',
    );

    const passResults = [];
    let drainSurfaced = false;
    for (
      let pass = 0;
      pass < TEST_BOUNDED_PLANNING_PASS_COUNT && !drainSurfaced;
      pass += 1
    ) {
      const result =
        await fixture.rebalancer.rebalance(TriggerType.PERIODIC);
      t.equal(
        result.success,
        true,
        'planning pass ' + (pass + 1) + ' must complete (the planner ran)',
      );
      passResults.push(result);
      drainSurfaced = (result.moves || []).some(
        isHotNodeSurplusDrainMoveResult,
      );
    }

    // THE BINDING CHECK — RED at HEAD. The engaged hold's documented cure
    // must stay reachable: the drain REMOVE is planned (and admitted, or
    // refused with a typed reason that names the blocker). Today every
    // pass is silent — moves: [], reason: no_changes_needed — because the
    // one-READY-node projection relabels the plan degraded and the
    // degraded guard drops every REMOVE candidate at debug level
    // (move-planner-move-calculation-methods.js:508), so the drain-cure
    // classifiers never see a candidate
    // (move-planner-priority-spread-cure.js:221) and the
    // ledger_surplus_drain capability is consumed only at ZERO ready
    // nodes (unified-rebalancer-rebalance-loop.js:178). The hold defers
    // its own cure, violating the cure-stays-admissible invariant of
    // docs/specs/decision-tables/operation-ledger-hold-engagement.json.
    t.ok(
      drainSurfaced,
      'within ' + TEST_BOUNDED_PLANNING_PASS_COUNT + ' planning passes ' +
        'the surplus-drain REMOVE for the hot node must be planned — ' +
        'admitted or typed-refused; SILENCE is the bug. Passes: ' +
        describeMoveResults(passResults),
    );
  } finally {
    await shutdownFixture(fixture);
    resetTestEnvironment();
  }
});
