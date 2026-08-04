// Directed deterministic repro for the MovieLens "phantom predicate"
// coupling (quest movielens-nodes-priority-recovery-escape, run
// 2026-08-04T08-01-38-927Z): physical placement is correct (the
// sql_write_operations-p1 raft group is at 3/3 spread with an elected
// leader), yet the control-plane *read* of that placement never converges
// because every consumer reads leader-funneled snapshot rows that are
// stale/absent. Three measured phantoms:
//   (i)   deficit detector: replica_count_below_minimum 2<3 vs physical 3/3
//   (ii)  planning gate: operation_creation_not_required (zero ADDs minted)
//   (iii) spread fence: missingActiveLeader:true x239
// This file reproduces each phantom against a physically-healthy group, and
// pins the boundary of each predicate so a fix cannot silently regress it.

import {test} from '../../src/test-helpers/tap.js';
import {
  buildCurrentPriorityPlacementObservation,
} from
  '../../src/control-plane/current-priority-placement-observation.js';
import {
  evaluatePartitionReplicaTopology,
} from '../../src/admin/admin-shared-metadata-consistency.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

// The priority control-plane partitions resolved from a live 3-node cluster.
const PRIORITY_PARTITION_IDS = [
  'control_plane_publications-p1',
  'replica_operations-p1',
  'schema_operations-p1',
  'sql_transactions-p1',
  'sql_transaction_participants-p1',
  'sql_write_operations-p1',
];
const NODE_IDS = ['node-r1', 'node-r4', 'node-r5'];

function readyReadinessByNodeId() {
  return Object.fromEntries(
    NODE_IDS.map((nodeId) => [
      nodeId,
      {
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            true,
        },
      },
    ]),
  );
}

// A physically-healthy, fully-converged snapshot: every priority partition
// has a fresh leader_node_id and three ACTIVE voter rows, with the elected
// leader carrying raft_role 'leader' (the physical truth) and the rest
// 'follower'. This is the ground-truth the funnel FAILS to deliver.
function buildConvergedSnapshot() {
  const partitionRows = PRIORITY_PARTITION_IDS.map((partitionId, index) => ({
    partition_id: partitionId,
    table_id: partitionId.replace(/-p1$/, ''),
    leader_node_id: NODE_IDS[index % NODE_IDS.length],
    replica_count: 3,
  }));
  const serviceRows = [];
  for (const [index, partitionId] of PRIORITY_PARTITION_IDS.entries()) {
    const leaderNodeId = NODE_IDS[index % NODE_IDS.length];
    for (const nodeId of NODE_IDS) {
      serviceRows.push({
        service_type: 'partition',
        partition_id: partitionId,
        node_id: nodeId,
        address: `tcp://127.0.0.1:${4000 + NODE_IDS.indexOf(nodeId)}`,
        status: 'ACTIVE',
        raft_role: nodeId === leaderNodeId ? 'leader' : 'follower',
      });
    }
  }
  return {partitionRows, serviceRows};
}

// Phantom (iii) shape: the priority partition rows are physically spread 3/3
// with a live leader, but the leader-funneled partitions row is stale - the
// partitions.leader_node_id was never re-published ("Cache update not observed
// ... within 1000ms"), so the funneled snapshot reads leader_node_id as absent
// even though raft elected one (the 'leader' role is still visible in the
// group's own service rows - the physical truth).
function buildStaleLeaderRowSnapshot() {
  const {partitionRows, serviceRows} = buildConvergedSnapshot();
  return {
    partitionRows: partitionRows.map((row) => ({
      ...row,
      leader_node_id: null, // stale funnel: leadership elected, row never updated
    })),
    serviceRows, // raft DID elect a leader; the role survives in the group rows
  };
}

// Fail-closed control: NO leader is elected (every row is a follower) AND the
// funneled leader row is absent. The fence must still report
// missingActiveLeader here - the corrected read must not weaken the
// genuinely-missing-leader safety case.
function buildGenuinelyLeaderlessSnapshot() {
  const {partitionRows, serviceRows} = buildStaleLeaderRowSnapshot();
  return {
    partitionRows,
    serviceRows: serviceRows.map((row) => ({...row, raft_role: 'follower'})),
  };
}

// Phantom (i)+(iii) combined shape: the new replica's role-row (raft_role)
// failed to persist through the congested funnel, so its ACTIVE service row
// carries no raft_role. The group is physically 3/3 with an elected leader.
function buildStaleRoleRowSnapshot() {
  const {partitionRows, serviceRows} = buildConvergedSnapshot();
  const rows = serviceRows.map((row) =>
    row.partition_id === 'sql_write_operations-p1' &&
      row.node_id === 'node-r5' ?
      {...row, raft_role: null} : // persist failed: role row never observed
      row,
  );
  return {
    partitionRows: partitionRows.map((row) =>
      row.partition_id === 'sql_write_operations-p1' ?
        {...row, leader_node_id: null} :
        row,
    ),
    serviceRows: rows,
  };
}

function activeNodeViews() {
  return {
    locallyEligibleNodeIds: [...NODE_IDS],
    effectiveActiveNodeIds: [...NODE_IDS],
    projectedServingNodeIds: [...NODE_IDS],
    publishedActiveNodeIds: [...NODE_IDS],
  };
}

// ---------------------------------------------------------------------------
// Phantom (iii): the spread fence's canonicalLeaderReplica predicate.
// Physical truth: elected leader, 3/3 spread. Snapshot read: leader row is
// stale/absent -> the fence reports a missing active leader.
// ---------------------------------------------------------------------------

test('FIXED: the spread fence does not report missingActiveLeader when the ' +
  'funneled leader_node_id is stale but raft elected a leader (Cut 2)',
async (t) => {
  const {partitionRows, serviceRows} = buildStaleLeaderRowSnapshot();
  const observation = buildCurrentPriorityPlacementObservation({
    partitionRows,
    serviceRows,
    readinessByNodeId: readyReadinessByNodeId(),
    activeNodeViews: activeNodeViews(),
  });

  t.equal(
    observation.leaderCoverage.satisfied,
    true,
    'leader coverage is satisfied from proven-local leadership even though ' +
      'the funneled leader_node_id row is stale',
  );
  t.equal(
    observation.leaderCoverage.missingLeaderPartitionCount,
    0,
    'no partition is reported as missing an active leader',
  );
  t.end();
});

test('FAIL-CLOSED: the fence still reports missingActiveLeader when no ' +
  'leader is actually elected (no role, no funneled leader)',
async (t) => {
  const {partitionRows, serviceRows} = buildGenuinelyLeaderlessSnapshot();
  const observation = buildCurrentPriorityPlacementObservation({
    partitionRows,
    serviceRows,
    readinessByNodeId: readyReadinessByNodeId(),
    activeNodeViews: activeNodeViews(),
  });

  t.equal(
    observation.leaderCoverage.satisfied,
    false,
    'leader coverage reports unsatisfied when no leader is actually elected',
  );
  t.ok(
    observation.leaderCoverage.missingLeaderPartitionIds.length > 0,
    'genuinely-leaderless partitions are reported as missing an active leader',
  );
  t.equal(
    observation.satisfied,
    false,
    'the fence still emits missingActiveLeader:true for the leaderless case ' +
      '(fail-closed preserved)',
  );
  t.end();
});

test('topology predicate isolates the phantom: a healthy 3/3 group with a ' +
  'stale/absent leader_node_id fails canonicalLeaderReplica',
async (t) => {
  const topology = evaluatePartitionReplicaTopology({
    partitionRow: {
      partition_id: 'sql_write_operations-p1',
      leader_node_id: null, // stale funnel read
      replica_count: 3,
    },
    serviceRows: NODE_IDS.map((nodeId, index) => ({
      service_type: 'partition',
      partition_id: 'sql_write_operations-p1',
      node_id: nodeId,
      address: `tcp://127.0.0.1:${4100 + index}`,
      status: 'ACTIVE',
      raft_role: index === 1 ? 'leader' : 'follower', // raft DID elect one
    })),
    requiresAddress: true,
    requireLeaderNodeId: true,
  });

  t.equal(
    topology.canonicalLeaderReplica,
    false,
    'canonicalLeaderReplica is false: the predicate requires the funneled ' +
      'leader_node_id row, not the elected raft role',
  );
  t.equal(
    topology.leaderServiceVisible,
    true,
    'a leader service IS visible in raft roles (physical leader exists)',
  );
  t.equal(
    topology.leaderKnown,
    true,
    'leaderKnown is true via the role fallback - the phantom exists ONLY ' +
      'because the observation reads canonicalLeaderReplica',
  );
  t.end();
});

test('boundary: a converged leader_node_id satisfies the fence for the same ' +
  'physical group',
async (t) => {
  const {partitionRows, serviceRows} = buildConvergedSnapshot();
  const observation = buildCurrentPriorityPlacementObservation({
    partitionRows,
    serviceRows,
    readinessByNodeId: readyReadinessByNodeId(),
    activeNodeViews: activeNodeViews(),
  });

  t.equal(
    observation.leaderCoverage.satisfied,
    true,
    'leader coverage is satisfied once the funneled leader row is fresh',
  );
  t.equal(
    observation.leaderCoverage.missingLeaderPartitionCount,
    0,
    'no partition is reported as missing a leader',
  );
  t.end();
});

// ---------------------------------------------------------------------------
// Phantom (i): the deficit detector's replica_count_below_minimum predicate.
// The new replica's role-row failed to persist, so its ACTIVE row is
// excluded from the ready count -> 2 < 3 against a physically-healthy 3/3.
// ---------------------------------------------------------------------------

test('phantom deficit: role-row persist failure drops the ready count to ' +
  '2<3 against a physically-healthy 3/3 spread group',
async (t) => {
  const {partitionRows, serviceRows} = buildStaleRoleRowSnapshot();
  const observation = buildCurrentPriorityPlacementObservation({
    partitionRows,
    serviceRows,
    readinessByNodeId: readyReadinessByNodeId(),
    activeNodeViews: activeNodeViews(),
  });

  const summary = observation.priorityPartitionSummary;
  const blocked = (summary?.blockedPartitions || []).find(
    (partition) => partition.partitionId === 'sql_write_operations-p1',
  );

  t.ok(blocked, 'sql_write_operations-p1 is reported as spread-blocked');
  t.equal(
    blocked.exclusionReasonCounts.raft_role_missing,
    1,
    'the persist-failed replica is excluded for raft_role_missing - the ' +
      'CL-021 witness attribution',
  );
  t.equal(
    blocked.readyReplicaCount,
    2,
    'ready replica count reads 2 against a physical 3-replica group',
  );
  t.equal(
    observation.satisfied,
    false,
    'the phantom keeps the whole placement observation unsatisfied',
  );
  t.end();
});

test('deficit detector emits replica_count_below_minimum 2<3 when the ' +
  'state provider under-reports healthy replicas',
async (t) => {
  const planner = new MovePlanner({
    entityId: 'sql_write_operations-p1',
    entityType: 'partition',
    moveStateProvider: {
      // The under-report: one replica is excluded (stale role/status row),
      // so only 2 of the physical 3 are returned as healthy.
      getHealthyReplicas: (replicas) =>
        replicas.filter((replica) => replica.raftRole),
      getAvailableNodes: () =>
        NODE_IDS.map((nodeId) => ({node_id: nodeId})),
      getCurrentReplicas: () => [],
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getPartitionDescriptorEpochEvidence: () => null,
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });

  const physicalReplicas = [
    {node_id: 'node-r1', status: 'ACTIVE', raftRole: 'follower'},
    {node_id: 'node-r4', status: 'ACTIVE', raftRole: 'leader'},
    {node_id: 'node-r5', status: 'ACTIVE', raftRole: null}, // persist failed
  ];
  const policy = {
    targetReplicaCount: 3,
    minReplicaCount: 3,
    maxReplicaCount: 5,
  };
  const availableNodes = NODE_IDS.map((nodeId) => ({node_id: nodeId}));

  t.equal(
    planner.isCriticalState(physicalReplicas, policy, availableNodes),
    true,
    'the detector treats the under-reported group as critical',
  );
  t.equal(
    planner.getCriticalReason(physicalReplicas, policy, availableNodes),
    'replica_count_below_minimum: 2 < 3',
    'the measured phantom reason string is reproduced exactly',
  );
  t.end();
});

// ---------------------------------------------------------------------------
// Phantom (ii): the planning gate's operation_creation_not_required predicate.
// Because the ready-count deficit and the leader-phantom are reads of the
// same stale funnel, the follow-up decision snapshot sees no *fresh* deficit
// requiring an ADD, so the gate returns "not required" and zero cure moves
// are minted - the self-sustaining wedge.
// ---------------------------------------------------------------------------

test('phantom planning gate: the deficit detector under-report and the ' +
  'leader phantom are the SAME stale-read failure, so the gate mints no ADD',
async (t) => {
  const {partitionRows, serviceRows} = buildStaleRoleRowSnapshot();
  const observation = buildCurrentPriorityPlacementObservation({
    partitionRows,
    serviceRows,
    readinessByNodeId: readyReadinessByNodeId(),
    activeNodeViews: activeNodeViews(),
  });

  // Both phantom predicates hold simultaneously on one stale snapshot.
  const summaryBlocked =
    observation.priorityPartitionSummary?.satisfied === false;
  const leaderBlocked = observation.leaderCoverage?.satisfied === false;
  t.ok(
    summaryBlocked && leaderBlocked,
    'both the spread deficit and the leader phantom hold on the stale ' +
      'snapshot - the coupling that produces operation_creation_not_required',
  );
  t.end();
});
