/**
 * Quest formation-ledger-spread-voter-ready-readiness (DT-first rung):
 * deterministic reproduction of the cold-formation operation-ledger spread
 * wedge, pinned from the live run archived at
 * run4-archive/service-data-affinity-demo (2026-08-15T11:15Z):
 *
 * The seed's spread REPLACE for replica_operations-p1 settled with
 * `sourceState: removal_required` (drain released, source retained), leaving
 * the DURABLE wedge the joiners' formation barrier observes forever:
 * 4 ACTIVE voters on 3 distinct nodes with 2 voters on the seed —
 * `settledSpreadComplete false`, `totalVoters 4, maxVotersOnOneNode 2` —
 * while every joiner burns the full 120s formation-barrier timeout and
 * restarts its join.
 *
 * The cure the barrier is waiting for is ONE surplus drain: remove one of
 * the seed's two co-located voters. That drain is refused by the
 * execution-time remove-safety voter-ready floor, because the floor counts
 * only voter-ready ROUTABLE rows —
 *   operation-workflow-remove-safety-evaluator.js:503
 *     currentVoterReadyRows = rows.filter(isVoterReadyRoutableReplica)
 *   priority-publication-safety-topology.js:133 isVoterReadyRoutableReplica
 *     -> priority-publication-safety-rows.js:215 isNodeReadyForRouting
 *     -> controlPlaneReadinessService node readiness dimensions
 * — and a formation-barrier-held joiner HAS no READY lease by construction
 * (the barrier itself withholds it), so its readiness denies with the
 * EVIDENCE-ABSENT reason class (planning_snapshot_refresh_pending /
 * owner_evidence_missing). The joiners' healthy, promoted raft voters are
 * therefore invisible to the floor, the projection drops to 1/3, and the
 * drain defers forever: the barrier waits for the spread, the spread's
 * drain waits for readiness, readiness waits for the barrier.
 *
 * These tests encode the SEALED direction (mirroring the approved
 * system-table leader fail-open in
 * src/query/query-executor-partition-routing-snapshot.js): a replica that is
 * voter-ready by TOPOLOGY (active + addressed + voter raft role) on a node
 * whose readiness denial consists EXCLUSIVELY of evidence-absent reason
 * codes must count toward the remove-safety voter-ready floor. Substantive
 * denials (liveness, membership, transport) keep the floor closed — the
 * guard case below pins that no-guard-weakening constraint and must stay
 * green before AND after the fix.
 *
 * RED at HEAD: the surplus-drain REMOVE (the wedge's only remaining cure)
 * defers with "would drop voter-ready replicas below minimum (1/3)".
 *
 * Why the REMOVE and not the REPLACE leg: an in-flight spread REPLACE whose
 * target sits in the recovery projection cohort rides the shared completion
 * contract (state `spread_satisfied_in_flight`, reasonCode
 * `replace_remove_dispatch_phase_on_eligible_target`, blocked:false), which
 * short-circuits the floor — characterized green below. The live run's
 * REPLACE settled WITHOUT draining its source
 * (`sourceState: removal_required`, `drainState: owner_unavailable_released`
 * at 11:15:37), consuming that lane; the standalone surplus REMOVE left
 * behind has no completion lane and dies at the floor. That asymmetry is
 * why the wedge is durable.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_REASON,
} from '../../src/control-plane/projection-readiness-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  getAuthoritativeOperationLedgerPlacementObservation,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_LEDGER_PARTITION_ID = 'replica_operations-p1';
const TEST_SEED_NODE_ID = 'seed-node';
const TEST_JOINER_NODE_ID_B = 'joiner-node-b';
const TEST_JOINER_NODE_ID_C = 'joiner-node-c';
const TEST_SEED_LEADER_REPLICA_ID = 'replica_operations-p1-r1';
const TEST_SEED_SURPLUS_REPLICA_ID = 'replica_operations-p1-r2';
const TEST_JOINER_REPLACEMENT_REPLICA_ID =
  'replace-replica-formation-ledger-spread';
const TEST_JOINER_SPREAD_REPLICA_ID = 'replica_operations-p1-r4';
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_AUTHORITATIVE_SOURCE = 'owner_rpc_lane';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_SAFE_CLASSIFICATION = 'safe';
const TEST_VOTER_READY_FLOOR_PATTERN =
  /would drop voter-ready replicas below minimum/;
// The evidence-absent denial class approved for fail-open carve-outs
// (query-executor-partition-routing-snapshot.js:80-83 discipline).
const TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
]);
// A substantive denial that must NEVER be carved out.
const TEST_SUBSTANTIVE_DENIAL_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
]);

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createSeedReadyNodeRow() {
  return {
    node_id: TEST_SEED_NODE_ID,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

// A formation-barrier-held joiner: process-alive and CONNECTED
// (heartbeat-only publication), but with NO ready lease — the operation
// ledger formation barrier withholds it by design
// (node-joining-operation-ledger-formation-readiness.js
// publishOperationLedgerFormationLiveness).
function createBarrierHeldJoinerNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.CONNECTED,
    ready_lease_expires_at: 0,
  };
}

function createLedgerVoterServiceRow({replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: TEST_LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// The settled live wedge (run4): the REPLACE completed without draining its
// source, then a spread ADD landed — 4 ACTIVE voters, seed hosts two.
function createSettledWedgeServiceRows() {
  return [
    createLedgerVoterServiceRow({
      replicaId: TEST_SEED_LEADER_REPLICA_ID,
      nodeId: TEST_SEED_NODE_ID,
      raftRole: 'leader',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
      nodeId: TEST_SEED_NODE_ID,
      raftRole: 'follower',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_JOINER_REPLACEMENT_REPLICA_ID,
      nodeId: TEST_JOINER_NODE_ID_B,
      raftRole: 'follower',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_JOINER_SPREAD_REPLICA_ID,
      nodeId: TEST_JOINER_NODE_ID_C,
      raftRole: 'follower',
    }),
  ];
}

/**
 * Cold-formation readiness projection: the seed satisfies every readiness
 * dimension; each denied node fails EVERY dimension and carries exactly the
 * given reason codes. The published-membership planning snapshot names the
 * whole formation cohort so the voter-ready floor is the only
 * readiness-discriminating gate on the drain path under test.
 */
function createColdFormationReadinessService({denialReasonCodesByNodeId}) {
  const cohortNodeIds = Object.freeze([
    TEST_SEED_NODE_ID,
    TEST_JOINER_NODE_ID_B,
    TEST_JOINER_NODE_ID_C,
  ]);
  const buildPlanningSnapshot = (nodeId) => ({
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: cohortNodeIds,
    recoveryActiveNodeIds: cohortNodeIds,
    projectedServingNodeIds: cohortNodeIds,
    publishedMembershipIncludesTargetNode: cohortNodeIds.includes(nodeId),
    // Live formation state: priority recovery is ACTIVE (the ledger spread
    // has not converged), so the completion-safe short circuit in
    // evaluateRemoveSafety does not apply and the voter-ready floor is
    // evaluated — exactly the live gate distribution (floor 318x).
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: TEST_TARGET_REPLICA_COUNT,
      missingPartitionIds: [],
    }),
  });
  return {
    getNodeReadinessSync(nodeId) {
      const denialReasonCodes = denialReasonCodesByNodeId[nodeId] || null;
      const eligible = !denialReasonCodes;
      const dimensions = {};
      for (const dimensionName of Object.values(
        CONTROL_PLANE_READINESS_DIMENSION,
      )) {
        if (typeof dimensionName === 'string') {
          dimensions[dimensionName] = eligible;
        }
      }
      // Both denial-reason surfaces of the production snapshot: `reasons`
      // ([{code}] — the shape the query-executor fail-open consumes) and
      // the flat `reasonCodes` list.
      return {
        nodeId,
        dimensions,
        reasons: denialReasonCodes ?
          denialReasonCodes.map((code) => ({code})) :
          [],
        reasonCodes: denialReasonCodes ? [...denialReasonCodes] : [],
        observedAt: Date.now(),
      };
    },
    async getMembershipPublicationPlanningSnapshotBestEffort(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
    async getMembershipPublicationPlanningSnapshot(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
    getMembershipPublicationPlanningSnapshotSync(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
  };
}

// Answer the coordinator's authoritative (owner_rpc_lane) services reads
// from the wedge rows: both the surplus-REMOVE placement fence
// (rebalance-coordinator-topology-guard-methods.js
// ensurePrioritySurplusRemovePlacementFenceAllowed) and
// getCriticalReplicaRowsForSafety consume this lane. The fence judges RAFT
// topology (active voters / distinct nodes) and correctly ALLOWS the drain;
// only the remove-safety floor's readiness-filtered projection refuses it.
function installAuthoritativeServicesRead(coordinator, rowsProvider) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    options = {},
  ) => {
    if (
      tableName === 'services' &&
      String(sql).includes('WHERE service_type = ? AND partition_id = ?')
    ) {
      const rows = typeof rowsProvider === 'function' ?
        rowsProvider(params[1]) :
        rowsProvider;
      return {
        success: true,
        source: TEST_AUTHORITATIVE_SOURCE,
        rows: Array.isArray(rows) ? rows.map((row) => ({...row})) : [],
      };
    }
    return originalReadAuthoritativeRows(tableName, sql, params, options);
  };
}

function createWedgeCoordinator({denialReasonCodesByNodeId}) {
  const coordinator = createTestCoordinator({
    nodeId: TEST_SEED_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService: createColdFormationReadinessService({
      denialReasonCodesByNodeId,
    }),
    tablePolicyService: {
      getPolicyForPartition: () => ({
        minReplicaCount: TEST_MIN_REPLICA_COUNT,
        replicaCount: TEST_TARGET_REPLICA_COUNT,
      }),
    },
    cacheData: {
      nodes: [
        createSeedReadyNodeRow(),
        createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_B),
        createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_C),
      ],
      services: createSettledWedgeServiceRows(),
      partitions: [
        {
          partition_id: TEST_LEDGER_PARTITION_ID,
          leader_node_id: TEST_SEED_NODE_ID,
          replica_count: TEST_TARGET_REPLICA_COUNT,
        },
      ],
    },
  });
  installAuthoritativeServicesRead(
    coordinator,
    () => createSettledWedgeServiceRows(),
  );
  return coordinator;
}

function describeEvaluation(evaluation) {
  return JSON.stringify({
    classification: evaluation?.classification || null,
    error: evaluation?.error || null,
    deferReason: evaluation?.deferReason || null,
  });
}

test('RED (binding check): draining one of the seed\'s two co-located ' +
'ledger voters must be SAFE when the remaining topology-voter-ready ' +
'replicas sit on formation-barrier-held joiners whose readiness denials ' +
'are exclusively evidence-absent — at HEAD the remove-safety voter-ready ' +
'floor (operation-workflow-remove-safety-evaluator.js SIMPLE_FLOOR via ' +
'isVoterReadyRoutableReplica -> isNodeReadyForRouting) refuses 1/3',
async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    denialReasonCodesByNodeId: {
      [TEST_JOINER_NODE_ID_B]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
      [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
    },
  });
  coordinator.initialize();
  try {
    // Harness sanity: the joiner replicas ARE voter-ready by topology (the
    // replacement promoted; only node readiness is withheld). If this fails
    // the fixture no longer models the live wedge.
    const joinerReplicaRow = coordinator.systemTableCache.get(
      'services',
      TEST_JOINER_REPLACEMENT_REPLICA_ID,
    );
    t.equal(
      coordinator.workflowOwner.isVoterReadyReplicaTopology(joinerReplicaRow),
      true,
      'joiner replacement replica must be voter-ready by TOPOLOGY ' +
        '(active + addressed + voter raft role) — the wedge is not a ' +
        'promotion/topology problem',
    );

    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });

    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);

    t.equal(
      evaluation.classification,
      TEST_SAFE_CLASSIFICATION,
      'the surplus drain that releases the formation barrier must be SAFE: ' +
        'post-removal there are 3 topology-voter-ready replicas on 3 ' +
        'distinct nodes, and every non-seed readiness denial is ' +
        'evidence-absent (planning_snapshot_refresh_pending / ' +
        'owner_evidence_missing). Blocking check at HEAD: the voter-ready ' +
        'floor counts only isVoterReadyRoutableReplica rows, so ' +
        'barrier-held joiners project 1/3 and the drain defers forever ' +
        '(readiness <- barrier <- spread <- drain <- readiness ' +
        'circularity). Got: ' + describeEvaluation(evaluation),
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('CHARACTERIZATION (binding-check exoneration, must stay green): the ' +
'in-flight spread REPLACE\'s own source removal at the ACTIVE ' +
'(remove-dispatch) step is NOT refused by the voter-ready floor — the ' +
'completion contract (spread_satisfied_in_flight / ' +
'replace_remove_dispatch_phase_on_eligible_target) covers it. Only the ' +
'standalone surplus REMOVE (previous test) lacks a lane and binds at the ' +
'floor', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    denialReasonCodesByNodeId: {
      [TEST_JOINER_NODE_ID_B]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
      [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
    },
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_JOINER_NODE_ID_B,
      sourceNodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });
    // Replicate the live drain leg: replacement created and promoted, the
    // workflow at ACTIVE dispatches source removal (repository
    // isReplaceRemovePhase).
    operation.replicaId = TEST_JOINER_REPLACEMENT_REPLICA_ID;
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';

    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);

    // Scoped assertion: later REPLACE-specific gates (source-leader handoff
    // serialization) may legitimately defer this leg; the voter-ready FLOOR
    // must never be what refuses it — before or after the fix.
    t.notMatch(
      String(evaluation?.error || ''),
      TEST_VOTER_READY_FLOOR_PATTERN,
      'the REPLACE remove-leg must not defer on the voter-ready floor when ' +
        'the only uncounted voters are topology-voter-ready replicas on ' +
        'evidence-absent-denied barrier-held joiners. Got: ' +
        describeEvaluation(evaluation),
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('GUARD (no guard weakening — must stay green before and after the ' +
'fix): the same surplus drain stays refused when a joiner\'s readiness ' +
'denial carries a SUBSTANTIVE reason', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    denialReasonCodesByNodeId: {
      // One joiner is genuinely unhealthy: the projection may not count it,
      // so the post-removal voter-ready count is at most 2/3 and the floor
      // must keep refusing the drain.
      [TEST_JOINER_NODE_ID_B]: TEST_SUBSTANTIVE_DENIAL_REASON_CODES,
      [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
    },
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });

    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);

    t.not(
      evaluation.classification,
      TEST_SAFE_CLASSIFICATION,
      'a substantive readiness denial (cluster_member_unhealthy) must keep ' +
        'the voter-ready floor closed — only the evidence-absent class may ' +
        'be carved out. Got: ' + describeEvaluation(evaluation),
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('coupling sanity: the refused drain is exactly the formation ' +
'barrier\'s release condition — the settled wedge placement is UNSPREAD ' +
'(concentrated) and flips to SPREAD once one seed voter drains', (t) => {
  const wedgeObservation = getAuthoritativeOperationLedgerPlacementObservation({
    available: true,
    rows: createSettledWedgeServiceRows(),
    source: TEST_AUTHORITATIVE_SOURCE,
    partitionId: TEST_LEDGER_PARTITION_ID,
    targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
  });
  t.equal(
    wedgeObservation.observedVoterCount,
    4,
    'the settled wedge observes 4 voters (live: totalVoters 4)',
  );
  t.equal(
    wedgeObservation.maxVotersOnOneNode,
    2,
    'the seed hosts two co-located voters (live: maxVotersOnOneNode 2)',
  );
  t.equal(
    wedgeObservation.concentrated,
    true,
    'the wedge is quorum-concentrated, so the startup-authority owner keeps ' +
      'the joiner barrier closed',
  );
  t.equal(
    wedgeObservation.spreadComplete,
    false,
    'the canonical spread evidence stays false while the surplus persists',
  );

  const drainedRows = createSettledWedgeServiceRows().filter(
    (row) => row.replica_id !== TEST_SEED_SURPLUS_REPLICA_ID,
  );
  const drainedObservation =
    getAuthoritativeOperationLedgerPlacementObservation({
      available: true,
      rows: drainedRows,
      source: TEST_AUTHORITATIVE_SOURCE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
    });
  t.equal(
    drainedObservation.spreadComplete,
    true,
    'draining ONE seed voter completes the spread (3 voters on 3 distinct ' +
      'nodes), allowing the readiness owner to release the barrier — the ' +
      'REMOVE refused by the voter-ready floor is the exact missing step',
  );
  t.end();
});
