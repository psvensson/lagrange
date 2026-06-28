import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationLeaderSafety} from '../../src/rebalancer/priority-publication-leader-safety.js';
import {PriorityPublicationSafetyTopology} from '../../src/rebalancer/priority-publication-safety-topology.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';

// R3 + Lever A below-gate DT repro (epic slow-rejoiner-progress-or-evict, "drive the handoff").
//
// A surplus-drain priority REPLACE must move leadership off a SLOW/event-loop-starved rejoiner.
// The source-leader handoff is a COOPERATIVE local-timer raft step the saturated source must run
// itself; on a starved node it never fires, so the source never releases leadership in the rows
// and no completedLeaderHandoffEvidence is recorded. The gate then re-dispatches the SAME source
// STEP_DOWN forever (the dominant replace_remove_safety_blocked wedge: the node is neither pushed
// forward nor evicted). The fix ESCALATES to driving the voter-ready REPLACEMENT's leader election
// instead — routing through the existing REQUEST_REPLACEMENT_LEADER_ELECTION dispatch; it NEVER
// authorizes a removal, it only changes which handoff message is dispatched and to which node.
//
// Lever A (latency-tail reducer): the escalation is now IMMEDIATE once a voter-ready replacement
// exists — it no longer waits for the 30s source-handoff stall (which wasted a quarter of the
// per-restart convergence budget re-asking a node that cannot respond). The cooperative step-down
// would itself cause an election, so driving the replacement's election directly is the same
// leadership transfer on a healthy node, sooner. The 30s stall age is retained only as a diagnostic.
//
// Faithfulness: drives the REAL snapshot builder + the REAL stall recorder/reader; only the
// external-state leaf readers (role/leader-id resolvers, evidence readers, voter-evidence) are
// stubbed deterministically — mirroring the row staleness a starved node produces.

const {
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
} = SHARED;

const ESCALATE_AFTER_MS = 30 * 1000;

const STARVED_NODE = 'rejoiner-7493b0ab';
const HEALTHY_NODE = 'node-healthy';
const PARTITION_ID = 'replica_operations-p1';
const SOURCE_REPLICA_ID = 'replica_operations-p1-r2';
const REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r3';

function roleFromRow(row) {
  if (row?.raft_role === 'leader') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
  }
  if (row?.raft_role === 'follower') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
  }
  return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
}

// Source rows as a starved node leaves them: still 'leader', no handoff evidence, replacement
// still a follower whose ownership is not yet row-observed. stallMs is injected to simulate the
// elapsed wall-clock since the first source handoff (the real anchor is unit-tested separately).
function makeSafety({stallMs = null, voterEvidenceSufficient = true} = {}) {
  const instance = Object.create(PriorityPublicationLeaderSafety.prototype);
  instance.repository = {
    getReplaceSourceReplicaId: (op) => op?.sourceReplicaId ?? null,
    getReplaceTargetReplicaId: (op) => op?.targetReplicaId ?? null,
  };
  instance.getPriorityPublicationSourceRoleState = roleFromRow;
  instance.getPriorityPublicationReplacementRoleState = roleFromRow;
  instance.getCriticalPartitionLeaderNodeIdForSafety = (partitionRow) =>
    (typeof partitionRow?.leader_node_id === 'string' &&
      partitionRow.leader_node_id) ||
    null;
  instance.getPriorityPublicationLeaderHandoffEvidence = () => null;
  instance.isPriorityPublicationLeaderHandoffRetrySuppressed = () => false;
  instance.getPriorityPublicationReplacementLeaderElectionEvidence = () => null;
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () =>
    voterEvidenceSufficient;
  instance.normalizePriorityPublicationStatus = () => 'PUBLISHED';
  instance.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
  instance.getPriorityPublicationSourceLeaderHandoffStallMs = () => stallMs;
  return instance;
}

function replaceOperation() {
  return {
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    sourceNodeId: STARVED_NODE,
    sourceReplicaId: SOURCE_REPLICA_ID,
    targetReplicaId: REPLACEMENT_REPLICA_ID,
    targetNodeId: HEALTHY_NODE,
  };
}

const starvedSourceRow = {
  replica_id: SOURCE_REPLICA_ID,
  node_id: STARVED_NODE,
  raft_role: 'leader',
};
const replacementFollowerRow = {
  replica_id: REPLACEMENT_REPLICA_ID,
  node_id: HEALTHY_NODE,
  raft_role: 'follower',
};
const stalePartitionRow = {leader_node_id: STARVED_NODE};

function buildSnapshot(safety) {
  return safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    starvedSourceRow,
    replacementFollowerRow,
    stalePartitionRow,
    {},
    {priorityRecoveryCompletionSafe: false},
  );
}

test('Lever A: a FRESH (stall=0) source-leader handoff with a VOTER-READY replacement escalates ' +
  'IMMEDIATELY — it does not wait for the 30s stall', (t) => {
  // stallMs well below the old 30s floor. Pre-Lever-A this stayed
  // REQUEST_SOURCE_LEADER_HANDOFF (re-asking the saturated source); Lever A
  // escalates straight to the replacement election. This is the red-on-revert
  // assertion: restoring the `sourceLeaderHandoffStalled &&` guard makes this
  // fall back to REQUEST_SOURCE_LEADER_HANDOFF and FAIL.
  const safety = makeSafety({stallMs: 1000});
  const snapshot = buildSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
    'a voter-ready replacement escalates immediately (no 30s wait re-asking the starved source)',
  );
  t.equal(snapshot.escalateReplacementLeaderElection, true, 'escalation flag is set immediately');
  t.equal(snapshot.replacementNodeId, HEALTHY_NODE,
    'the election is dispatched to the healthy replacement node, not the starved source');
  t.end();
});

test('Lever A: escalation is stall-INDEPENDENT — a long-stalled handoff also escalates ' +
  '(behaviour unchanged from the >=30s R3 path it generalizes)', (t) => {
  const safety = makeSafety({stallMs: ESCALATE_AFTER_MS + 1000});
  const snapshot = buildSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
    'a stuck source handoff still escalates to the replacement leader election',
  );
  t.equal(snapshot.escalateReplacementLeaderElection, true, 'escalation flag is set');
  t.equal(snapshot.replacementNodeId, HEALTHY_NODE,
    'the election is dispatched to the healthy replacement node, not the starved source');
  t.end();
});

// Authoritative-leadership escalation (instrument-confirmed stat-gate-20260628T130105Z):
// a CPU-saturated source leaves a STALE per-replica raft_role row — it reads `follower`
// even while leader_node_id still names the source node. The pre-fix escalation gate
// (sourceRoleState !== FOLLOWER) is then never true, so the escalation is DORMANT and the
// surplus-drain source removal sits in passive WAIT_REPLACEMENT_LEADER_OWNERSHIP with
// nothing driving the transfer off the saturated node (28/28 stuck-drain decisions).
const staleFollowerSourceRow = {
  replica_id: SOURCE_REPLICA_ID,
  node_id: STARVED_NODE,
  raft_role: 'follower',
};
function buildStaleFollowerSnapshot(safety) {
  return safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    staleFollowerSourceRow,
    replacementFollowerRow,
    stalePartitionRow,
    {},
    {priorityRecoveryCompletionSafe: false},
  );
}

test('Authoritative-leadership: a STALE-follower source row whose partition leader_node_id ' +
  'still names the source NODE escalates to the replacement election (red-on-revert: the ' +
  'pre-fix sourceRoleState!==FOLLOWER gate leaves it dormant in WAIT_REPLACEMENT_LEADER_OWNERSHIP)',
(t) => {
  const safety = makeSafety({stallMs: 1000});
  const snapshot = buildStaleFollowerSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
    'leadership still on the source node (authoritative leader_node_id) drives the replacement ' +
      'election despite the stale follower replica role',
  );
  t.equal(snapshot.escalateReplacementLeaderElection, true,
    'escalation fires on the authoritative partition-leadership signal');
  t.equal(snapshot.replacementNodeId, HEALTHY_NODE,
    'the election is dispatched to the healthy off-node replacement, not the saturated source');
  t.end();
});

test('Authoritative-leadership SAFETY: a stale-follower source whose partition leader is ' +
  'on a THIRD node (already off the source node) does NOT escalate — removal is SAFE ' +
  '(a canonical successor already holds leadership)',
(t) => {
  const safety = makeSafety({stallMs: 1000});
  const snapshot = safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    staleFollowerSourceRow,
    replacementFollowerRow,
    {leader_node_id: 'node-third'},
    {},
    {priorityRecoveryCompletionSafe: false},
  );
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
    'leadership already off the source node → removal is safe, no needless election driven',
  );
  t.not(snapshot.escalateReplacementLeaderElection, true,
    'the authoritative gate does not fire when the source node is not the partition leader');
  t.end();
});

test('R3 SAFETY: escalation requires a VOTER-READY replacement — a non-voter-ready replacement ' +
  'never escalates (can never drive a non-voter-ready node to leadership)', (t) => {
  const safety = makeSafety({
    stallMs: ESCALATE_AFTER_MS + 1000,
    voterEvidenceSufficient: false,
  });
  const snapshot = buildSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,
    'no voter-ready replacement to elect → no escalation, keep re-asking the source',
  );
  t.end();
});

test('R3 SAFETY: R3 NEVER produces SAFE — it only redirects the handoff, never authorizes a ' +
  'removal (the removal still gates on the full leadership-safe proof)', (t) => {
  const safety = makeSafety({stallMs: ESCALATE_AFTER_MS + 1000});
  const snapshot = buildSnapshot(safety);
  t.not(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
    'escalation is a DEFER (drive the election) — source removal is not authorized by R3',
  );
  t.equal(snapshot.sourceRemovalLeadershipSafe, false,
    'leadership-safe remains false: R3 does not relax the removal proof');
  t.end();
});

// The real stall recorder/reader pair (anchored on the FIRST attempt, set-if-absent, TTL-bounded).
test('R3 stall anchor: records the first source-leader handoff attempt and measures elapsed stall', (t) => {
  const owner = Object.create(PriorityPublicationSafetyTopology.prototype);
  const operation = {operationId: 'op-r3-1'};
  const sourceHandoff = {
    messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    requestReason: ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
  };

  t.equal(owner.getPriorityPublicationSourceLeaderHandoffStallMs(operation), null,
    'no anchor before any handoff is recorded');

  owner.recordPriorityPublicationSourceLeaderHandoffRequested(operation, sourceHandoff);
  const firstStall = owner.getPriorityPublicationSourceLeaderHandoffStallMs(operation);
  t.ok(Number.isFinite(firstStall) && firstStall >= 0 && firstStall < 5000,
    'a fresh anchor reads a small non-negative stall');

  // set-if-absent: back-date the anchor, then a second record must NOT reset it.
  const map = owner.getPriorityPublicationSourceLeaderHandoffRequestedAtMap();
  map.set(operation.operationId, Date.now() - (ESCALATE_AFTER_MS + 5000));
  owner.recordPriorityPublicationSourceLeaderHandoffRequested(operation, sourceHandoff);
  t.ok(owner.getPriorityPublicationSourceLeaderHandoffStallMs(operation) >= ESCALATE_AFTER_MS,
    'the anchor stays on the FIRST attempt (set-if-absent) so the stall age is honest');
  t.end();
});

test('R3 stall anchor: a NON source-leader handoff (e.g. target election) is not anchored', (t) => {
  const owner = Object.create(PriorityPublicationSafetyTopology.prototype);
  const operation = {operationId: 'op-r3-2'};
  owner.recordPriorityPublicationSourceLeaderHandoffRequested(operation, {
    messageType: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
    requestReason: ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
  });
  t.equal(owner.getPriorityPublicationSourceLeaderHandoffStallMs(operation), null,
    'only the REPLACE_SOURCE_LEADER_HANDOFF reason anchors the stall');
  t.end();
});
