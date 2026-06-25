import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationLeaderSafety} from '../../src/rebalancer/priority-publication-leader-safety.js';
import {PriorityPublicationSafetyTopology} from '../../src/rebalancer/priority-publication-safety-topology.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';

// R3 below-gate DT repro (epic slow-rejoiner-progress-or-evict, lever R3 "drive the handoff").
//
// A surplus-drain priority REPLACE must move leadership off a SLOW/event-loop-starved rejoiner.
// The source-leader handoff is a COOPERATIVE local-timer raft step the saturated source must run
// itself; on a starved node it never fires, so the source never releases leadership in the rows
// and no completedLeaderHandoffEvidence is recorded. The gate then re-dispatches the SAME source
// STEP_DOWN forever (the dominant replace_remove_safety_blocked wedge: the node is neither pushed
// forward nor evicted). R3 detects a sustained-non-progressing source handoff (>= 30s anchored on
// the first attempt) and ESCALATES to driving the voter-ready REPLACEMENT's leader election
// instead — routing through the existing REQUEST_REPLACEMENT_LEADER_ELECTION dispatch. R3 NEVER
// authorizes a removal; it only changes which handoff message is dispatched.
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

test('R3: a FRESH (not-yet-stalled) source handoff re-asks the source — no escalation', (t) => {
  const safety = makeSafety({stallMs: 1000});
  const snapshot = buildSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,
    'below the 30s floor the gate still requests the source-leader handoff (no premature escalation)',
  );
  t.equal(snapshot.escalateReplacementLeaderElection, undefined,
    'a source-handoff snapshot does not carry the escalation flag');
  t.end();
});

test('R3 PROMOTED (unconditional): a STALLED source handoff (>=30s) escalates to driving the ' +
  'voter-ready replacement leader election', (t) => {
  const safety = makeSafety({stallMs: ESCALATE_AFTER_MS + 1000});
  const snapshot = buildSnapshot(safety);
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
    'the stuck source handoff escalates to the replacement leader election (without R3 the ' +
      'source-still-leader state would stay REQUEST_SOURCE_LEADER_HANDOFF forever)',
  );
  t.equal(snapshot.escalateReplacementLeaderElection, true, 'escalation flag is set');
  t.equal(snapshot.replacementNodeId, HEALTHY_NODE,
    'the election is dispatched to the healthy replacement node, not the starved source');
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
