/**
 * S6a divergence probe (quest critical-placement-causal-trace): the move
 * planner's placement target follows the WRONG authority, witnessed with the
 * two authorities forced apart and NO behaviour change anywhere.
 *
 * Persisted policy: partitions.replica_count = 5 (the authoritative desired
 * RF). Table-policy route: no `tables` row exists for the system table, so
 * TablePolicyService.getPolicyForPartition reads the authoritative partition
 * row at table-policy-service.js:213, DISCARDS it at :222, and returns the
 * DEFAULT_TABLE_POLICY (replicaCount 3). The REAL planner driven through the
 * REAL TablePolicyService then plans toward 3: with three distinct active
 * holders it emits no spread-restoring move at all, while the replication-
 * target authority proves the same partition KNOWN_NOT_CONVERGED at 3 < 5.
 * That is the architectural wedge S6b must close before S4 may become
 * authoritative: readiness requiring 5 while placement converges toward 3
 * wedges TRAFFIC_READY permanently. Recorded here as evidence; repair is
 * S6b's, and today production has 3 == 3 so this divergence is NOT claimed
 * as the cause of the current formation failure.
 */

import {test} from '../../src/test-helpers/tap.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  resolveCriticalPartitionPlacement,
} from '../../src/bootstrap/critical-placement-convergence.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createMockCache, createTestRebalancer} from './test-helpers.js';

const PROBE_PARTITION_ID = `${SYSTEM_TABLE_NAME.SERVICES}-p1`;
const PROBE_TABLE_ID = SYSTEM_TABLE_NAME.SERVICES;
const PERSISTED_DESIRED_RF = 5;
const TABLE_POLICY_FALLBACK_RF = 3;
const HOLDER_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const FREE_NODE_IDS = Object.freeze(['node-d', 'node-e']);

function probePartitionRow(replicaCount) {
  return {
    partition_id: PROBE_PARTITION_ID,
    table_id: PROBE_TABLE_ID,
    replica_count: replicaCount,
  };
}

function probeCacheData({persistedReplicaCount, holderCount}) {
  const allNodeIds = [...HOLDER_NODE_IDS, ...FREE_NODE_IDS];
  const nodes = allNodeIds.map((nodeId) => ({
    node_id: nodeId,
    status: 'ACTIVE',
    last_heartbeat: Date.now(),
  }));
  const services = HOLDER_NODE_IDS.slice(0, holderCount)
    .map((nodeId, index) => ({
      service_id: `svc-${PROBE_PARTITION_ID}-r${index + 1}`,
      service_type: 'partition',
      node_id: nodeId,
      partition_id: PROBE_PARTITION_ID,
      replica_id: `${PROBE_PARTITION_ID}-r${index + 1}`,
      raft_role: index === 0 ? 'leader' : 'follower',
      status: 'active',
    }));
  return {
    nodes,
    services,
    partitions: [probePartitionRow(persistedReplicaCount)],
    // Deliberately NO tables row: system tables have none, which is exactly
    // the route by which the table-policy fallback answers 3.
    tables: [],
    replicaOperations: [],
  };
}

// The planner adopts storageAdmissionService FROM the coordinator
// (syncOwnerDependenciesFromCoordinator), and its capacity filter requires
// the {decision: 'allow'} shape (move-planner.js reads result.decision).
// The shared createMockCoordinator stub answers {allowed: true}, which the
// filter reads as a rejection of EVERY node - a probe wired through it
// emits zero moves for any authority and witnesses nothing (found by
// independent verification of the first candidate). The probe therefore
// carries its own correctly-shaped admission stub and proves the wiring
// alive with a true-deficit control arrow before asserting any silence.
function probeCoordinator() {
  let operationCounter = 0;
  return {
    getMoveSafetyError: () => null,
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {
      checkAdd: async () => ({decision: 'allow'}),
      checkReplace: async () => ({decision: 'allow'}),
      checkSplit: async () => ({decision: 'allow'}),
    },
    createOperation: async (move) => {
      operationCounter += 1;
      return {
        operationId: `probe-op-${operationCounter}`,
        type: move.type,
        partitionId: move.partitionId,
        targetNodeId: move.nodeId,
        status: 'pending',
        workflowStep: 'pending',
      };
    },
  };
}

async function probeAddLikeMoves({persistedReplicaCount, holderCount}) {
  const cacheData = probeCacheData({persistedReplicaCount, holderCount});
  const tablePolicyService = new TablePolicyService({
    systemTableCache: createMockCache(cacheData),
  });
  const rebalancer = createTestRebalancer({
    entityId: PROBE_PARTITION_ID,
    nodeId: HOLDER_NODE_IDS[0],
    cacheData,
    tablePolicyService,
    rebalanceCoordinator: probeCoordinator(),
  });
  rebalancer.initialize();
  rebalancer.setLeader(true);
  try {
    const result = await rebalancer.rebalance('divergence_probe');
    if (result.success !== true) {
      throw new Error(`probe evaluation cycle failed: ${JSON.stringify(result)}`);
    }
    return (result.moves || []).filter((move) => {
      const operation = String(move?.operation || '').toLowerCase();
      return operation === 'add' || operation === 'replace';
    });
  } finally {
    rebalancer.shutdown();
  }
}

test('planner-target-authority-divergence-probe', async (t) => {
  // The authoritative reading: the persisted row REQUIRES five.
  const desired = resolveDesiredReplicationFactor(
    probePartitionRow(PERSISTED_DESIRED_RF));
  t.equal(desired.source, REPLICATION_TARGET_SOURCE.PARTITION_ROW);
  t.equal(desired.replicationFactor, PERSISTED_DESIRED_RF,
    'the persisted partitions row is the authoritative desired RF');

  const wedgeData = probeCacheData({
    persistedReplicaCount: PERSISTED_DESIRED_RF,
    holderCount: HOLDER_NODE_IDS.length,
  });
  const placement = resolveCriticalPartitionPlacement({
    partitionId: PROBE_PARTITION_ID,
    partitionRow: wedgeData.partitions[0],
    serviceRows: wedgeData.services,
  });
  t.equal(placement.requiredReplicaCount, PERSISTED_DESIRED_RF);
  t.equal(placement.distinctNodeCount, HOLDER_NODE_IDS.length);
  t.equal(placement.evidenceState,
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED,
    'three holders under an authoritative requirement of five is a deficit');

  // The REAL policy route the planner consumes: the authoritative row is
  // read, discarded, and the table-policy default answers three.
  const tablePolicyService = new TablePolicyService({
    systemTableCache: createMockCache(wedgeData),
  });
  const plannerPolicy =
    await tablePolicyService.getPolicyForPartition(PROBE_PARTITION_ID);
  t.equal(plannerPolicy.replicaCount, TABLE_POLICY_FALLBACK_RF,
    'the table-policy route answers the fallback default, not the row');

  // WIRING-ALIVE CONTROL: a true deficit by the planner's OWN target (two
  // holders under fallback three, free nodes available) emits an add-like
  // move through this exact wiring. Without this arrow, every later silence
  // is unattributable (the first candidate's silence was a mis-shaped
  // admission stub rejecting every node).
  const wiringMoves = await probeAddLikeMoves({
    persistedReplicaCount: TABLE_POLICY_FALLBACK_RF,
    holderCount: 2,
  });
  t.ok(wiringMoves.length >= 1,
    'two holders under the planner-visible target of three emit an ' +
    'add-like move: the probe wiring demonstrably reaches emission');

  // AT-TARGET AGREEMENT: with the authorities agreeing (persisted 3, three
  // holders) the same wiring is correctly silent.
  const agreementMoves = await probeAddLikeMoves({
    persistedReplicaCount: TABLE_POLICY_FALLBACK_RF,
    holderCount: HOLDER_NODE_IDS.length,
  });
  t.equal(agreementMoves.length, 0,
    'at target by both authorities the planner is rightly silent');

  // THE WEDGE: persisted five, three holders - the authority proves a
  // deficit of two, free ACTIVE nodes exist, the wiring is proven able to
  // emit - and the planner is SILENT because its target came from the
  // table-policy fallback, not the persisted desired RF.
  const wedgeMoves = await probeAddLikeMoves({
    persistedReplicaCount: PERSISTED_DESIRED_RF,
    holderCount: HOLDER_NODE_IDS.length,
  });
  t.equal(wedgeMoves.length, 0,
    'the planner emits NO spread-restoring move for a partition the ' +
    'authority proves two replicas short: its target follows the ' +
    'table-policy fallback - the S6b divergence, witnessed against a ' +
    'wiring-alive control');

  const agreeingPlacement = resolveCriticalPartitionPlacement({
    partitionId: PROBE_PARTITION_ID,
    partitionRow: probePartitionRow(TABLE_POLICY_FALLBACK_RF),
    serviceRows: wedgeData.services,
  });
  t.equal(agreeingPlacement.evidenceState,
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED,
    'with the authorities agreeing the same holders ARE the target');
});
