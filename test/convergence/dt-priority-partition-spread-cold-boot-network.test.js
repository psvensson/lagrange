import t from 'tap';

import LifeRaft from '../../src/raft/liferaft.js';
import {
  createVirtualNetwork,
} from '../distributed/harness/virtual-network.js';
import {
  connectRaftCluster,
  driveNetwork,
} from '../distributed/harness/raft-network-host.js';
import {
  buildDerivedPriorityPartitionSummary,
  PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
} from
  '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  MovePlanner,
} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

// GP-5 (golden-capability-gold-plating): the cold-boot spread convergence
// end-state — "priority partitions reach 3 distinct nodes from a cold 3-node
// boot" — as a deterministic in-process test instead of a live-run-only
// property. A cold all-follower raft cohort elects a real leader over the
// VirtualNetwork; the real MovePlanner then plans one ADD per priority
// control-plane partition onto the remaining nodes; the REAL census owner
// (buildDerivedPriorityPartitionSummary) must report every priority
// partition at readyDistinctNodeCount 3 with spreadGap 0 and the summary
// satisfied. Row application is the raft replication effect made explicit
// (the planner's input seam); the election, the planning, and the census
// derivation are the production code under test.

const PRIORITY_TABLE_IDS_SORTED = Object.freeze(
  [...PRIORITY_CONTROL_PLANE_TABLE_IDS].sort(),
);
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const SEED_NODE_ID = NODE_IDS[0];
const SPREAD_NODE_IDS = Object.freeze([NODE_IDS[1], NODE_IDS[2]]);
const TARGET_REPLICA_COUNT = 3;
const ELECTION_DRIVE_MS = 200;
const ADDRESS_PORT = 9000;

// Keep election timers dormant so the test drives candidacy explicitly;
// min==max removes RNG from the cohort (dt6-raft-election-network precedent).
const DORMANT = Object.freeze({
  'election min': '100000 ms',
  'election max': '100000 ms',
  'heartbeat': '100000 ms',
  'write': (_packet, callback) => {
    if (typeof callback === 'function') callback(null);
  },
});

function partitionIdFor(tableId) {
  return `${tableId}-p1`;
}

function buildColdBootRows() {
  const partitionRows = PRIORITY_TABLE_IDS_SORTED.map((tableId) => ({
    partition_id: partitionIdFor(tableId),
    table_id: tableId,
    replica_count: TARGET_REPLICA_COUNT,
  }));
  const serviceRows = [];
  for (const tableId of PRIORITY_TABLE_IDS_SORTED) {
    const partitionId = partitionIdFor(tableId);
    for (const index of [1, 2]) {
      serviceRows.push({
        service_id: `${partitionId}-r${index}`,
        replica_id: `${partitionId}-r${index}`,
        partition_id: partitionId,
        node_id: SEED_NODE_ID,
        service_type: REBALANCER_ENTITY_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: index === 1 ? 'leader' : 'follower',
        address: `${SEED_NODE_ID}:${ADDRESS_PORT}`,
      });
    }
  }
  return {partitionRows, serviceRows};
}

function deriveCensus({partitionRows, serviceRows}) {
  return buildDerivedPriorityPartitionSummary({
    partitionRows,
    serviceRows,
    locallyEligibleNodeIds: [...NODE_IDS],
  });
}

function buildColdBootPlanner({serviceRows, partitionId}) {
  const provider = {
    systemTableCache: null,
    getAvailableNodes: () =>
      NODE_IDS.map((nodeId) => ({node_id: nodeId, status: ReplicaStatus.ACTIVE})),
    getCurrentReplicas: () => serviceRows,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getTopologyBlockingInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
  return new MovePlanner({
    entityId: partitionId,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
  });
}

function mintReplicaId(serviceRows, partitionId) {
  const used = new Set(serviceRows.map((row) => row.replica_id));
  for (let index = 1; ; index += 1) {
    const candidate = `${partitionId}-r${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function applyPlannerAdd(serviceRows, move, partitionId, raftRole) {
  const replicaId = move.replicaId || mintReplicaId(serviceRows, partitionId);
  serviceRows.push({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: move.nodeId,
    service_type: REBALANCER_ENTITY_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: raftRole,
    address: `${move.nodeId}:${ADDRESS_PORT}`,
  });
}

function applyPlannerRemove(serviceRows, move) {
  const sourceReplicaId = move.sourceReplicaId || move.replicaId;
  const index = serviceRows.findIndex(
    (row) => row.replica_id === sourceReplicaId,
  );
  if (index < 0) {
    throw new Error(`REMOVE source ${sourceReplicaId} not in service rows`);
  }
  serviceRows.splice(index, 1);
}

t.test(
  'cold 3-node boot: real election then real planner spread satisfies the ' +
    'production census at 3 distinct nodes for every priority partition',
  async (t) => {
    const net = createVirtualNetwork();
    const rafts = connectRaftCluster(net, NODE_IDS, () => ({...DORMANT}));
    t.teardown(() => rafts.forEach((raft) => raft.end()));

    rafts.get(SEED_NODE_ID).promote();
    await driveNetwork(net, {untilMs: ELECTION_DRIVE_MS});
    t.equal(
      rafts.get(SEED_NODE_ID).state,
      LifeRaft.LEADER,
      'the cold cohort elected a real leader over the virtual network',
    );

    const rows = buildColdBootRows();
    const coldCensus = deriveCensus(rows);
    t.notOk(
      coldCensus.satisfied,
      'the cold-boot 2-on-one-node start is genuinely census-blocked',
    );

    // The real convergence loop: plan one move at a time from the current
    // rows, apply its replication effect, and re-plan — the same shape the
    // formation-barrier DTs drive. The witnessed cold-boot state (2 replicas
    // concentrated on the seed, target 3 on 3 nodes) converges through the
    // retained spread-cure ADD onto a distinct node followed by the
    // monotonic surplus drain REMOVE off the seed.
    const MAX_PLAN_CYCLES = 8;
    const moveTrace = [];
    for (const tableId of PRIORITY_TABLE_IDS_SORTED) {
      const partitionId = partitionIdFor(tableId);
      const planner = buildColdBootPlanner({
        serviceRows: rows.serviceRows,
        partitionId,
      });
      for (let cycle = 0; cycle < MAX_PLAN_CYCLES; cycle += 1) {
        const replicas = rows.serviceRows.filter(
          (row) => row.partition_id === partitionId,
        );
        const targetState = await planner.calculateTargetState(replicas, {
          targetReplicaCount: TARGET_REPLICA_COUNT,
          placementConstraints: {spreadAcrossNodes: true},
        });
        const moves = planner.calculateMoves(replicas, targetState);
        if (moves.length === 0) break;
        const move = moves[0];
        moveTrace.push({
          tableId,
          type: move.type,
          nodeId: move.nodeId,
          replicaCountBefore: replicas.length,
        });
        if (move.type === REBALANCER_MOVE_TYPE.ADD) {
          t.ok(
            SPREAD_NODE_IDS.includes(move.nodeId),
            `${tableId}: the cure ADD targets a distinct spread node ` +
              `(${move.nodeId}), not the concentrated seed`,
          );
          applyPlannerAdd(rows.serviceRows, move, partitionId, 'follower');
        } else if (move.type === REBALANCER_MOVE_TYPE.REMOVE) {
          applyPlannerRemove(rows.serviceRows, move);
        } else {
          throw new Error(`unexpected cold-boot move ${move.type}`);
        }
      }
    }
    const firstAddIndex = moveTrace.findIndex(
      (entry) => entry.type === REBALANCER_MOVE_TYPE.ADD,
    );
    const firstRemoveIndex = moveTrace.findIndex(
      (entry) => entry.type === REBALANCER_MOVE_TYPE.REMOVE,
    );
    t.ok(firstAddIndex >= 0, 'the planner produced the spread-cure ADD');
    t.ok(
      firstRemoveIndex > firstAddIndex,
      'the monotonic surplus drain REMOVE followed the cure ADD',
    );
    const convergedReplicaCounts = PRIORITY_TABLE_IDS_SORTED.map((tableId) =>
      rows.serviceRows.filter(
        (row) => row.partition_id === partitionIdFor(tableId),
      ).length);
    t.same(
      convergedReplicaCounts,
      PRIORITY_TABLE_IDS_SORTED.map(() => TARGET_REPLICA_COUNT),
      'every priority partition converged to exactly the target replica count',
    );

    const spreadCensus = deriveCensus(rows);
    t.ok(
      spreadCensus.satisfied,
      'the production census reports the converged end-state satisfied',
    );
    t.equal(
      spreadCensus.totalPriorityPartitionCount,
      PRIORITY_TABLE_IDS_SORTED.length,
      'every priority control-plane partition is censused',
    );
    t.same(
      spreadCensus.missingPartitionIds,
      [],
      'no priority partition remains blocked',
    );
    t.equal(
      spreadCensus.requiredDistinctNodeCount,
      PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
      'the census kept the production 3-distinct-node bar',
    );
  },
);

t.test(
  'red witness: without the planner spread moves the same census stays ' +
    'blocked at 2 distinct nodes with the row_absent reason attributed',
  async (t) => {
    const rows = buildColdBootRows();
    const census = deriveCensus(rows);
    t.notOk(census.satisfied, 'cold-boot census is not satisfied');
    t.equal(
      census.blockedPartitions.length,
      PRIORITY_TABLE_IDS_SORTED.length,
      'every priority partition is blocked at the cold-boot state',
    );
    for (const blocked of census.blockedPartitions) {
      t.equal(
        blocked.readyDistinctNodeCount,
        1,
        `${blocked.partitionId}: only the seed node counts ready`,
      );
      t.equal(
        blocked.spreadGap,
        PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT - 1,
        `${blocked.partitionId}: the spread gap is two distinct nodes`,
      );
      t.equal(
        blocked.exclusionReasonCounts.row_absent,
        1,
        `${blocked.partitionId}: the missing third replica is attributed`,
      );
    }
  },
);
