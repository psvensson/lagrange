/**
 * Planner x REPLACE owner agreement about leadership movement (BR11 as
 * superseded 2026-11-11, leadership retained).
 *
 * A fresh formation starts 3-0-0: one seed node hosts all three replicas of
 * a priority control-plane partition and joiners become ready one at a time.
 * Whether a joiner is ready before or after a planning pass decides the plan
 * shape (expand-then-drain or REPLACE). Over every such interleaving, every
 * leader, every row order and every shape of cached leadership evidence:
 *  - planner: a REPLACE source, and a drained surplus replica, is never the
 *    leader while a co-located non-leader source exists - decided from the
 *    planning rebalancer's own live leadership, never from cached rows;
 *  - owner: for the REPLACE the planner chose, the leadership decision
 *    requests no transfer, because the leader is not the removed replica; the
 *    one named handoff is the answer only for a source that itself leads.
 *
 * Red before the change: with role-less or stale-role rows the node-level
 * leader hint marked co-located replicas as leaders beside the real one, row
 * order chose the source, and the leader was planned as a REPLACE source;
 * and the owner answered ISSUE for every leader other than the target.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {
  REPLACE_HANDOFF_DECISION,
  decideRemovalNamedHandoff,
} from '../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {createTestRebalancer} from './test-helpers.js';

const SEED_NODE_ID = 'node-seed';
const JOINER_A = 'node-joiner-a';
const JOINER_B = 'node-joiner-b';
const PARTITION_IDS = Object.freeze([
  'control_plane_publications-p1',
  'sql_transactions-p1',
  'replica_operations-p1',
]);
const REPLICA_SUFFIXES = Object.freeze(['r1', 'r2', 'r3']);
const ROW_ORDERS = Object.freeze([
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]);
const TERM = 3;

// What the cached services rows say about leadership. Durable rows collapse
// the leader to follower; a row can also lack a role or carry a stale one.
const ROW_ROLE_SHAPES = Object.freeze({
  'durable rows: every replica reads follower': () => 'follower',
  'the leader row reads leader': (isLeader) =>
    (isLeader ? 'leader' : 'follower'),
  'role-less rows': () => null,
  'a stale leader role on a non-leader row': (isLeader, index) =>
    (!isLeader && index === 0 ? 'leader' : 'follower'),
  'only the leader row has a role': (isLeader) => (isLeader ? 'follower' : null),
});

// The node sets a planning pass can see, in the order joiners become ready.
// Each interleaving is the sequence of target-node sets of successive passes.
const INTERLEAVINGS = Object.freeze({
  'first pass before any joiner is ready': [
    [SEED_NODE_ID, SEED_NODE_ID, SEED_NODE_ID],
    [SEED_NODE_ID, SEED_NODE_ID, JOINER_A],
    [SEED_NODE_ID, JOINER_A, JOINER_B],
  ],
  'one joiner ready before the first pass': [
    [SEED_NODE_ID, SEED_NODE_ID, JOINER_A],
    [SEED_NODE_ID, JOINER_A, JOINER_B],
  ],
  'both joiners ready before the first pass': [
    [SEED_NODE_ID, JOINER_A, JOINER_B],
  ],
});

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

function replicaRows(partitionId, order, leaderReplicaId, roleOf) {
  return order.map((position, index) => {
    const replicaId = `${partitionId}-${REPLICA_SUFFIXES[position]}`;
    return {
      service_id: replicaId,
      replica_id: replicaId,
      partition_id: partitionId,
      node_id: SEED_NODE_ID,
      service_type: 'partition',
      status: ReplicaStatus.ACTIVE,
      raft_role: roleOf(replicaId === leaderReplicaId, index),
    };
  });
}

// The planning rebalancer of the partition's leader replica: its own replica
// identity and its own live leadership, as its partition service sets them.
function leaderRebalancer(partitionId, rows, leaderReplicaId) {
  const rebalancer = createTestRebalancer({
    entityId: partitionId,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    cacheData: {
      nodes: [SEED_NODE_ID, JOINER_A, JOINER_B].map((nodeId) =>
        ({node_id: nodeId, status: 'active'})),
      services: rows,
      partitions: [{
        partition_id: partitionId,
        table_id: partitionId.replace(/-p1$/u, ''),
        leader_node_id: SEED_NODE_ID,
        replica_count: 3,
      }],
      replicaOperations: [],
    },
  });
  rebalancer.replicaId = leaderReplicaId;
  rebalancer.initialize();
  rebalancer.setLeader(true);
  return rebalancer;
}

// The source replicas a plan removes: REPLACE sources and drained replicas.
function plannedSources(moves) {
  return moves
    .filter((move) => move.type === MoveType.REPLACE ||
      move.type === MoveType.REMOVE)
    .map((move) => ({type: move.type, replicaId: move.replicaId}));
}

// The fresh reads the REPLACE owner's leadership decision is taken from when
// the group's leader is `leaderReplicaId`: the target's own port and the
// leader's own, corroborated answer.
function leadershipReads(partitionId, leaderReplicaId, targetReplicaId) {
  const voters = [
    ...REPLICA_SUFFIXES.map((suffix) => `${partitionId}-${suffix}`),
    targetReplicaId,
  ];
  const observation = (replicaId) => Object.freeze({
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
    replicaId,
    leaderReplicaId,
    term: TERM,
    gateOpen: true,
    voterReplicaIds: voters,
    votersOutgoingReplicaIds: [],
    transferWindowMaxMs: 1_000,
  });
  return {
    witness: observation(targetReplicaId),
    leaderAuthority: observation(leaderReplicaId),
  };
}

async function ownerDecision(partitionId, sourceReplicaId, leaderReplicaId) {
  const targetReplicaId = `${partitionId}-r4`;
  const {witness, leaderAuthority} =
    leadershipReads(partitionId, leaderReplicaId, targetReplicaId);
  const decision = await decideRemovalNamedHandoff(
    {},
    {operationId: `replace-${sourceReplicaId}`, partitionId},
    {
      witness,
      replicaIds: {sourceReplicaId, targetReplicaId},
      readLeaderAuthority: async () => ({authority: leaderAuthority,
        confirmingVoterAnswers: new Map()}),
      routeOf: () => null,
    },
  );
  return decision.state;
}

// Tally one planning pass's sources: REPLACEs and drains, any that is the
// leader, and any REPLACE whose owner would not retain leadership.
async function countPlannedSources(counts, partitionId, leaderReplicaId, sources) {
  for (const source of sources) {
    counts.replaces += source.type === MoveType.REPLACE ? 1 : 0;
    counts.removes += source.type === MoveType.REMOVE ? 1 : 0;
    if (source.replicaId === leaderReplicaId) {
      counts.leaderSources += 1;
      continue;
    }
    if (source.type === MoveType.REPLACE &&
        await ownerDecision(partitionId, source.replicaId,
          leaderReplicaId) !==
          REPLACE_HANDOFF_DECISION.LEADER_RETAINED) {
      counts.transfers += 1;
    }
  }
}

test('3-0-0 spread: over every joiner-ready interleaving the planner never ' +
  'removes the leader while a co-located non-leader exists, and the ' +
  'REPLACE owner requests no leadership transfer for its choice', async (t) => {
  setupConfig();
  const counts = {cases: 0, replaces: 0, removes: 0, leaderSources: 0,
    transfers: 0};
  try {
    for (const partitionId of PARTITION_IDS) {
      for (const leaderSuffix of REPLICA_SUFFIXES) {
        const leaderReplicaId = `${partitionId}-${leaderSuffix}`;
        for (const order of ROW_ORDERS) {
          for (const roleOf of Object.values(ROW_ROLE_SHAPES)) {
            const rows =
              replicaRows(partitionId, order, leaderReplicaId, roleOf);
            for (const passes of Object.values(INTERLEAVINGS)) {
              const rebalancer =
                leaderRebalancer(partitionId, rows, leaderReplicaId);
              for (const targetNodes of passes) {
                counts.cases += 1;
                const sources = plannedSources(rebalancer.calculateMoves(rows, {
                  targetReplicaCount: 3,
                  targetNodes,
                  availableNodeCount: new Set(targetNodes).size,
                }));
                await countPlannedSources(counts, partitionId,
                  leaderReplicaId, sources);
              }
              rebalancer.shutdown();
            }
          }
        }
      }
    }
  } finally {
    teardownConfig();
  }
  t.ok(counts.replaces > 0,
    `the enumeration plans REPLACEs (${counts.replaces} over ${
      counts.cases} planning passes; ${counts.removes} drains)`);
  t.equal(counts.leaderSources, 0,
    'the leader is never a REPLACE source or a drained replica while a ' +
      'co-located non-leader exists');
  t.equal(counts.transfers, 0,
    'the REPLACE owner retains leadership for every planned source: no ' +
      'transfer is requested when the leader is not the removed replica');
});

test('control: the one named handoff is for a source that itself leads; a ' +
  'third leader is retained; the target leading is safe', async (t) => {
  const [partitionId] = PARTITION_IDS;
  const sourceReplicaId = `${partitionId}-r1`;
  t.equal(await ownerDecision(partitionId, sourceReplicaId, sourceReplicaId),
    REPLACE_HANDOFF_DECISION.ISSUE, 'the source leads: one named handoff');
  t.equal(await ownerDecision(partitionId, sourceReplicaId,
    `${partitionId}-r2`), REPLACE_HANDOFF_DECISION.LEADER_RETAINED,
  'a third replica leads: leadership is retained');
  t.equal(await ownerDecision(partitionId, sourceReplicaId,
    `${partitionId}-r4`), REPLACE_HANDOFF_DECISION.LEADERSHIP_SAFE,
  'the target leads: safe, as before');
});
