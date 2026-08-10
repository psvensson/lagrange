import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

// Lever (a) — surplus-drain prefers a NON-leader replica as the removal source.
//
// The re-framed root of the rolling-restart settle-time class (see CL-043 /
// rolling-restart-donewhen-real-blocker): draining a partition's raft LEADER
// forces a leadership move. When the leader is chosen as a REPLACE *source* it
// additionally wedges the CL-043 WAIT_REPLACEMENT_LEADER_OWNERSHIP gate (the
// replacement must acquire leadership before the source is safe to remove ->
// 602 deferrals in gate 095532Z).
//
// MovePlanner.calculateMoves grouped active replicas by node and picked the
// first replica / first remove-candidate with NO leadership awareness, so a
// leader that happened to sort first became the REPLACE source. The fix biases
// source selection so a non-leader is drained when surplus drain has a choice.
//
// IMPORTANT invariant these tests pin: the fix does NOT change WHICH replicas
// are removed (the surplus set is fixed by targetNodes) — only whether the
// leader is drained as a REPLACE source (wedge-prone) vs a plain REMOVE (normal
// re-election). So removed-replica SET parity is asserted alongside source
// preference.

function setupConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// Partition with replicas on nodes A,B,C,D. Leader is on B. Target = {A,C,E}:
// E is new (1 ADD), B and D leave (2 removes). With one ADD there is exactly
// one REPLACE; the second remove is a plain REMOVE. The leader B is ordered
// FIRST in currentReplicas so the un-fixed planner deterministically picks the
// leader as the REPLACE source (RED on revert).
const PARTITION_ID = 'orders-p7';
const LEADER_NODE = 'node-B';
const FOLLOWER_DROP_NODE = 'node-D';

function buildRebalancer() {
  const nodes = ['node-A', 'node-B', 'node-C', 'node-D', 'node-E'].map(
    (nodeId) => ({node_id: nodeId, status: 'active'}),
  );
  // Leader (B) listed before the follower drop candidate (D) so the legacy
  // first-wins selection would choose the leader as the REPLACE source.
  const replicaRows = [
    {node: 'node-A', role: 'follower'},
    {node: LEADER_NODE, role: 'leader'},
    {node: 'node-C', role: 'follower'},
    {node: FOLLOWER_DROP_NODE, role: 'follower'},
  ].map(({node, role}) => ({
    service_id: `${PARTITION_ID}-${node}`,
    replica_id: `${PARTITION_ID}-${node}`,
    partition_id: PARTITION_ID,
    node_id: node,
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
    raft_role: role,
  }));

  return createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: 'coordinator-node',
    cacheData: {
      nodes,
      services: replicaRows,
      partitions: [
        {
          partition_id: PARTITION_ID,
          table_id: 'orders',
          leader_node_id: LEADER_NODE,
        },
      ],
      replicaOperations: [],
    },
  });
}

function currentReplicas() {
  return [
    {node: 'node-A', role: 'follower'},
    {node: LEADER_NODE, role: 'leader'},
    {node: 'node-C', role: 'follower'},
    {node: FOLLOWER_DROP_NODE, role: 'follower'},
  ].map(({node, role}) => ({
    service_id: `${PARTITION_ID}-${node}`,
    replica_id: `${PARTITION_ID}-${node}`,
    node_id: node,
    status: ReplicaStatus.ACTIVE,
    raft_role: role,
  }));
}

const TARGET_STATE = {
  targetReplicaCount: 3,
  targetNodes: ['node-A', 'node-C', 'node-E'],
  availableNodeCount: 5,
};

const COLOCATED_PARTITION_ID = 'control_plane_publications-p1';
const COLOCATED_NODE_ID = 'node-seed';
const COLOCATED_LEADER_REPLICA_ID = `${COLOCATED_PARTITION_ID}-r1`;
const COLOCATED_FOLLOWER_REPLICA_ID = `${COLOCATED_PARTITION_ID}-r2`;

function buildColocatedPriorityRebalancer(leaderRole = 'leader') {
  const replicaRows = [
    {replicaId: COLOCATED_LEADER_REPLICA_ID, role: leaderRole},
    {replicaId: COLOCATED_FOLLOWER_REPLICA_ID, role: 'follower'},
    {replicaId: `${COLOCATED_PARTITION_ID}-r3`, role: 'follower'},
  ].map(({replicaId, role}) => ({
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: COLOCATED_PARTITION_ID,
    node_id: COLOCATED_NODE_ID,
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
    raft_role: role,
  }));

  return {
    currentReplicas: replicaRows,
    rebalancer: createTestRebalancer({
      entityId: COLOCATED_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: COLOCATED_NODE_ID,
      cacheData: {
        nodes: [COLOCATED_NODE_ID, 'node-joiner-a', 'node-joiner-b'].map(
          (nodeId) => ({node_id: nodeId, status: 'active'}),
        ),
        services: replicaRows,
        partitions: [{
          partition_id: COLOCATED_PARTITION_ID,
          table_id: 'control_plane_publications',
          leader_node_id: COLOCATED_NODE_ID,
          replica_count: 3,
        }],
        replicaOperations: [],
      },
    }),
  };
}

test('surplus drain does NOT pick the partition leader as a REPLACE source ' +
  'when a non-leader removal candidate exists (RED on revert: legacy ' +
  'first-wins selection drains the leader via REPLACE -> CL-043 wedge)', (t) => {
  setupConfig();
  const rebalancer = buildRebalancer();
  rebalancer.initialize();
  rebalancer.setLeader(true);

  const moves = rebalancer.calculateMoves(currentReplicas(), TARGET_STATE);
  rebalancer.shutdown();
  teardownConfig();

  const replaceMoves = moves.filter((m) => m.type === MoveType.REPLACE);
  t.equal(replaceMoves.length, 1, 'exactly one REPLACE move (one ADD paired)');
  t.equal(
    replaceMoves[0].sourceNodeId,
    FOLLOWER_DROP_NODE,
    'the REPLACE source is the FOLLOWER (node-D), not the leader (node-B)',
  );
  t.not(
    replaceMoves[0].sourceNodeId,
    LEADER_NODE,
    'the leader is never the REPLACE source while a non-leader is available',
  );
  t.end();
});

test('surplus drain removed-replica SET is unchanged by the leader bias ' +
  '(both B and D are removed; only REPLACE-vs-REMOVE assignment differs)', (t) => {
  setupConfig();
  const rebalancer = buildRebalancer();
  rebalancer.initialize();
  rebalancer.setLeader(true);

  const moves = rebalancer.calculateMoves(currentReplicas(), TARGET_STATE);
  rebalancer.shutdown();
  teardownConfig();

  const removedNodes = new Set();
  for (const move of moves) {
    if (move.type === MoveType.REPLACE) {
      removedNodes.add(move.sourceNodeId);
    } else if (move.type === MoveType.REMOVE) {
      removedNodes.add(move.nodeId);
    }
  }
  t.ok(removedNodes.has(LEADER_NODE), 'leader node B is still removed');
  t.ok(removedNodes.has(FOLLOWER_DROP_NODE), 'follower node D is still removed');
  t.equal(removedNodes.size, 2, 'exactly the two surplus replicas are removed');

  // The leader, when it must drain, drains as a plain REMOVE (normal
  // re-election), not as a REPLACE source (the wedge-prone path).
  const leaderRemove = moves.find(
    (m) => m.type === MoveType.REMOVE && m.nodeId === LEADER_NODE,
  );
  t.ok(leaderRemove, 'the leader drains via a plain REMOVE, not a REPLACE source');
  t.end();
});

test('serial priority spread expands without selecting a leader source, then ' +
  'drains an explicit follower', (t) => {
  setupConfig();
  const {currentReplicas: replicas, rebalancer} =
    buildColocatedPriorityRebalancer();
  rebalancer.initialize();
  rebalancer.setLeader(true);

  const targetState = {
    targetReplicaCount: 3,
    targetNodes: [COLOCATED_NODE_ID, 'node-joiner-a', 'node-joiner-b'],
    availableNodeCount: 3,
  };
  const expandMoves = rebalancer.calculateMoves(replicas, targetState);
  const postExpandReplicas = [
    ...replicas,
    {
      service_id: `${COLOCATED_PARTITION_ID}-r4`,
      replica_id: `${COLOCATED_PARTITION_ID}-r4`,
      partition_id: COLOCATED_PARTITION_ID,
      node_id: 'node-joiner-a',
      service_type: 'partition',
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
    },
  ];
  // Quest over-target-cap-spread-cure-wipe: below the distinct-node floor
  // the target-plus-one shape keeps expanding (drain of a co-located source
  // is spread-gated there); the drain under test fires once the floor is
  // met (three distinct nodes).
  const secondExpandMoves = rebalancer.calculateMoves(
    postExpandReplicas,
    targetState,
  );
  const postFullSpreadReplicas = [
    ...postExpandReplicas,
    {
      service_id: `${COLOCATED_PARTITION_ID}-r5`,
      replica_id: `${COLOCATED_PARTITION_ID}-r5`,
      partition_id: COLOCATED_PARTITION_ID,
      node_id: 'node-joiner-b',
      service_type: 'partition',
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
    },
  ];
  const drainMoves = rebalancer.calculateMoves(
    postFullSpreadReplicas,
    targetState,
  );
  rebalancer.shutdown();
  teardownConfig();

  const addMoves = expandMoves.filter((move) => move.type === MoveType.ADD);
  t.equal(addMoves.length, 1,
    'critical spread starts with one serial expansion');
  t.equal(
    expandMoves.some((move) => move.type === MoveType.REPLACE),
    false,
    'the expansion phase does not choose a leadership-bearing source',
  );
  t.equal(
    secondExpandMoves.some((move) => move.type === MoveType.ADD),
    true,
    'below the distinct-node floor the surplus keeps expanding, not draining',
  );
  const removeMoves = drainMoves.filter(
    (move) => move.type === MoveType.REMOVE,
  );
  t.equal(removeMoves.length, 1,
    'the floor-met surplus shape drains one redundant voter');
  t.equal(
    removeMoves[0].replicaId,
    COLOCATED_FOLLOWER_REPLICA_ID,
    'the explicit follower drains before the co-located leader',
  );
  t.not(
    removeMoves[0].replicaId,
    COLOCATED_LEADER_REPLICA_ID,
    'partition leader-node fallback cannot overwrite explicit follower role',
  );
  t.end();
});

test('at-target spread retains node-level leadership fallback when the ' +
  'leader replica role is missing', (t) => {
  setupConfig();
  const {currentReplicas: replicas, rebalancer} =
    buildColocatedPriorityRebalancer(null);
  t.equal(
    replicas[0].raft_role,
    null,
    'fixture leaves the leader replica role absent so node fallback is tested',
  );
  rebalancer.initialize();
  rebalancer.setLeader(true);

  // Floor-met surplus shape (quest over-target-cap-spread-cure-wipe: the
  // drain fires only once the distinct-node floor is met, so both joiner
  // nodes host a replica here).
  const moves = rebalancer.calculateMoves([...replicas, {
    service_id: `${COLOCATED_PARTITION_ID}-r4`,
    replica_id: `${COLOCATED_PARTITION_ID}-r4`,
    partition_id: COLOCATED_PARTITION_ID,
    node_id: 'node-joiner-a',
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
  }, {
    service_id: `${COLOCATED_PARTITION_ID}-r5`,
    replica_id: `${COLOCATED_PARTITION_ID}-r5`,
    partition_id: COLOCATED_PARTITION_ID,
    node_id: 'node-joiner-b',
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
  }], {
    targetReplicaCount: 3,
    targetNodes: [COLOCATED_NODE_ID, 'node-joiner-a', 'node-joiner-b'],
    availableNodeCount: 3,
  });
  rebalancer.shutdown();
  teardownConfig();

  const removeMove = moves.find((move) => move.type === MoveType.REMOVE);
  t.equal(
    removeMove.replicaId,
    COLOCATED_FOLLOWER_REPLICA_ID,
    'a missing-role row on leader_node_id stays conservative while an ' +
      'explicit follower remains selectable',
  );
  t.end();
});
