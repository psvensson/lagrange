/**
 * R09 supersession: committed-node-remove-safety-wake replaces the exhausted
 * predecessor Quest's evidence-absent/lease-zero floor carve-out. Its original
 * seal, red evidence and separate five-node gate remain in the append-only
 * history. This controlled placement fixture now requires committed current
 * node leases; projection reason codes never grant floor credit.
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
import {createMockControlPlaneReadinessService, createTestCoordinator} from './test-helpers.js';

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
function createColdFormationReadinessService({denialReasonCodesByNodeId, nodeRows}) {
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
  return createMockControlPlaneReadinessService({
    readNodeRows: () => nodeRows,
    callbacks: {
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
      // REMOVE safety reads the owner surface; the same modelled formation
      // planning state is presented there, unchanged. The best-effort surfaces
      // stay for the AVAILABLE consumers in this scenario.
      async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
        return buildPlanningSnapshot(nodeId);
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
    },
  });
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

function createWedgeCoordinator({denialReasonCodesByNodeId, committedJoinersReady = false}) {
  const nodeRows = [createSeedReadyNodeRow(),
    createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_B),
    createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_C)];
  if (committedJoinersReady) {
    for (const row of nodeRows) row.ready_lease_expires_at = Date.now() + 60000;
  }
  const coordinator = createTestCoordinator({
    nodeId: TEST_SEED_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService: createColdFormationReadinessService({
      denialReasonCodesByNodeId, nodeRows,
    }),
    tablePolicyService: {
      getPolicyForPartition: () => ({
        minReplicaCount: TEST_MIN_REPLICA_COUNT,
        targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
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

for (const committedJoinersReady of [false, true]) {
  test(`R09 surplus drain consumes committed joiner leases (current=${committedJoinersReady})`,
    async (t) => {
      initializeTestEnvironment();
      const coordinator = createWedgeCoordinator({committedJoinersReady,
        denialReasonCodesByNodeId: {
          [TEST_JOINER_NODE_ID_B]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
          [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
        },
      });
      try {
        const row = coordinator.systemTableCache.get('services', TEST_JOINER_REPLACEMENT_REPLICA_ID);
        t.equal(coordinator.workflowOwner.isVoterReadyReplicaTopology(row), true);
        const operation = await coordinator.createOperation({
          type: OperationType.REMOVE, partitionId: TEST_LEDGER_PARTITION_ID,
          nodeId: TEST_SEED_NODE_ID, replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
        });
        const evaluation = await coordinator.workflowOwner.evaluateRemoveSafety(operation);
        t.equal(evaluation.classification === TEST_SAFE_CLASSIFICATION, committedJoinersReady,
          'a known expired lease never becomes credit through evidence-absent reasons: ' +
          describeEvaluation(evaluation));
        if (!committedJoinersReady) t.match(evaluation.error, TEST_VOTER_READY_FLOOR_PATTERN);
      } finally {
        await coordinator.shutdown();
        resetTestEnvironment();
      }
    });
}

test('replacement completion guards remain distinct from the committed node floor', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    committedJoinersReady: true,
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

test('expired committed joiners remain below the floor with substantive projection denial', async (t) => {
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
      'expired committed leases keep the floor closed regardless of reason class. Got: ' + describeEvaluation(evaluation),
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
