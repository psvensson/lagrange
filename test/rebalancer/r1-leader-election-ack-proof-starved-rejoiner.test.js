import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationLeaderSafety} from '../../src/rebalancer/priority-publication-leader-safety.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';

// R1 below-gate DT repro (epic slow-rejoiner-progress-or-evict, lever R1 "proof-not-rows").
//
// Scenario: a surplus-drain priority REPLACE must move partition leadership off a
// SLOW/event-loop-starved rejoiner (the `7493b0ab` regime). The source-leader handoff is a
// COOPERATIVE local-timer raft step the old leader must run itself (STEP_DOWN_REPLICA →
// startElectionTimer); on a starved node those timers never fire in budget, so:
//   - the source NEVER releases leadership in the persisted rows (raft_role still 'leader',
//     partition leader_node_id still names the starved node), AND
//   - no completedLeaderHandoffEvidence is ever recorded (the STEP_DOWN was never ACKed).
// The healthy REPLACEMENT, however, independently ACKs its own leader-election request
// (replacementLeaderElectionEvidence.completedReplicaIds includes the EXACT replacement).
//
// This is the "the row still says source-leader" falsifier: the rows alone can NEVER make
// removal safe (the gate re-dispatches a STEP_DOWN to the starved source forever — the
// observed 56x replace_remove_safety_blocked wedge). The completed election ACK is a fresh
// successor signal independent of those lagging rows.
//
// Faithfulness: we drive the REAL buildPriorityPublicationLeaderRemoveSafetySnapshot and the
// REAL isCompletedReplacementElectionSafeForPriorityRecovery; only the external-state leaf
// helpers (role/leader-id resolvers, evidence readers, voter-evidence) are stubbed
// deterministically — exactly mirroring the row-staleness an event-loop-starved node produces.

const {
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
} = SHARED;

const STARVED_NODE = 'rejoiner-7493b0ab'; // slow/quiesced: local STEP_DOWN timer never fires
const HEALTHY_NODE = 'node-healthy';
const PARTITION_ID = 'replica_operations-p1'; // priority, non-publication: skip publication gates
const SOURCE_REPLICA_ID = 'replica_operations-p1-r2'; // surplus voter being drained (the leader)
const REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r3';
const OTHER_REPLICA_ID = 'replica_operations-p1-r9';

function roleFromRow(row) {
  if (row?.raft_role === 'leader') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER;
  }
  if (row?.raft_role === 'follower') {
    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
  }
  return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;
}

// election-evidence shape carries completedReplicaIds; handoff evidence is null on a starved
// node. Retry-suppression mirrors real semantics: suppressed once evidence is recorded.
function makeSafety({
  electionCompletedReplicaIds = [REPLACEMENT_REPLICA_ID],
  voterEvidenceSufficient = true,
} = {}) {
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
  // Starved node: STEP_DOWN local timer never fired → no source-handoff ACK recorded.
  instance.getPriorityPublicationLeaderHandoffEvidence = () => null;
  // The healthy replacement DID ACK its leader election.
  instance.getPriorityPublicationReplacementLeaderElectionEvidence = () => ({
    completedReplicaIds: electionCompletedReplicaIds,
    notFoundReplicaIds: [],
  });
  // Retry is suppressed once evidence exists (election evidence present, handoff absent).
  instance.isPriorityPublicationLeaderHandoffRetrySuppressed = (evidence) =>
    Array.isArray(evidence?.completedReplicaIds) &&
    evidence.completedReplicaIds.length > 0;
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () =>
    voterEvidenceSufficient;
  instance.normalizePriorityPublicationStatus = () => 'PUBLISHED';
  instance.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
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

// Rows as a STARVED node leaves them: source still 'leader', partition leader_node_id still
// names the starved node, replacement still 'follower' (its ownership not yet row-observed).
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

function buildWedgeSnapshot(safety) {
  return safety.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    starvedSourceRow,
    replacementFollowerRow,
    stalePartitionRow,
    {},
    {priorityRecoveryCompletionSafe: false},
  );
}

function evaluateFastPath(safety, snapshot) {
  return safety.isCompletedReplacementElectionSafeForPriorityRecovery(
    snapshot,
    replacementFollowerRow,
    {operation: replaceOperation(), priorityRecoveryCompletionSafe: false},
  );
}

test('R1 repro: the rows ALONE never authorize removal off a starved rejoiner — the snapshot ' +
  'defers (with Lever A, by driving the voter-ready replacement election, not re-asking the source)', (t) => {
  const safety = makeSafety();
  const snapshot = buildWedgeSnapshot(safety);

  t.equal(
    snapshot.sourceRoleState,
    PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER,
    'source rows still say leader (the starved node never released leadership)',
  );
  t.equal(
    snapshot.sourceRemovalLeadershipSafe,
    false,
    'no row-based disjunct authorizes removal: source still leads, no handoff evidence, ' +
      'replacement ownership not row-observed',
  );
  // Pre-Lever-A this wedged in REQUEST_SOURCE_LEADER_HANDOFF (re-asking the starved source
  // forever — the original 56x replace_remove_safety_blocked state). Lever A escalates
  // immediately to the voter-ready replacement (this fixture has a voter-ready follower
  // replacement); with the replacement election already dispatched (evidence suppressed) it
  // now WAITS for replacement ownership rather than re-pinging the node that cannot respond.
  // The core R1 point is unchanged: rows alone still do NOT authorize removal (asserted above).
  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_REPLACEMENT_LEADER_OWNERSHIP,
    'the gate drives the replacement election + waits for ownership (Lever A) — still no removal',
  );
  t.end();
});

test('R1 PROMOTED (unconditional): the EXACT replacement\'s completed election ACK ' +
  'authorizes source removal despite the lagging source-leader rows', (t) => {
  const safety = makeSafety();
  const snapshot = buildWedgeSnapshot(safety);

  t.equal(
    evaluateFastPath(safety, snapshot),
    true,
    'the completed election ACK is accepted as proof of succession → SAFE → the drain ' +
      'progresses (R1 is now always active)',
  );
  t.end();
});

test('R1 SAFETY: a NO-ack case is NEVER authorized', (t) => {
  const safety = makeSafety({electionCompletedReplicaIds: []});
  const snapshot = buildWedgeSnapshot(safety);

  t.equal(
    evaluateFastPath(safety, snapshot),
    false,
    'no completed election evidence → not authorized: R1 is evidence-gated, not a bypass ' +
      'of the safety check',
  );
  t.end();
});

test('R1 SAFETY: an election completed for a DIFFERENT replica does NOT authorize removal ' +
  '(requires the EXACT replacement)', (t) => {
  const safety = makeSafety({electionCompletedReplicaIds: [OTHER_REPLICA_ID]});
  const snapshot = buildWedgeSnapshot(safety);

  t.equal(
    evaluateFastPath(safety, snapshot),
    false,
    'completion evidence for another replica is not proof THIS replacement is the successor',
  );
  t.end();
});

test('R1 SAFETY: a replacement that is NOT voter-ready is NEVER authorized ' +
  '(preserves the voter-ready floor — the worst case must be a transient re-election, ' +
  'never a quorum/spread loss)', (t) => {
  const safety = makeSafety({voterEvidenceSufficient: false});
  const snapshot = buildWedgeSnapshot(safety);

  t.equal(
    evaluateFastPath(safety, snapshot),
    false,
    'replacement not voter-ready → no genuine successor candidate → not authorized',
  );
  t.end();
});
