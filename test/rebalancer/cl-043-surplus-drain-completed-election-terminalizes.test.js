import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationLeaderSafety} from '../../src/rebalancer/priority-publication-leader-safety.js';

// CL-043 (re-diagnosis 2026-06-18): a surplus-drain REPLACE on a priority partition
// (replica_operations / sql_transactions / sql_transaction_participants /
// sql_write_operations) removes a SOURCE that is the partition LEADER. The leader-handoff
// safety snapshot can only observe the successor via the persisted replacement raft_role +
// partition leader_node_id rows, which lag live raft leadership (CL-016/CL-035 write-through
// family). When they lag, sourceRemovalLeadershipSafe never goes true and the gate wedges in
// WAIT_REPLACEMENT_LEADER_OWNERSHIP — the drain defers indefinitely and the control plane
// never quiesces (gate 095532Z run1: 602 deferrals, surplus stuck 5/3).
//
// The completed replacement-leader ELECTION evidence (the EXACT replacement acknowledged its
// leader-election handoff request) is a fresh successor-candidate signal independent of those
// lagging rows — the election was requested/accepted, not necessarily already won, so the worst
// case is a brief normal raft re-election among the remaining voter-ready replicas, never a
// quorum loss (quorum count is enforced independently upstream).
// It is exactly what the priority-recovery completion path already trusts; the fix authorizes
// removal on it for the same class of priority partitions even outside priority-recovery
// completion — requiring the EXACT replacement replica and keeping every other guardrail.
// Quorum COUNT stays enforced independently upstream (the evaluator minReplicaCount check),
// so this governs leadership SUCCESSION only.
//
// These falsifiers drive the REAL isCompletedReplacementElectionSafeForPriorityRecovery; only
// the voter-evidence-sufficient leaf (external topology read) is stubbed.

const REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r3';
const OTHER_REPLICA_ID = 'replica_operations-p1-r9';

function makeSafety({voterEvidenceSufficient = true} = {}) {
  const instance = Object.create(PriorityPublicationLeaderSafety.prototype);
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () =>
    voterEvidenceSufficient;
  return instance;
}

// The wedge snapshot: source released leadership (handoff evidence recorded), the EXACT
// replacement completed its leader election, but the replacement's row ownership is NOT yet
// observed (raft_role / leader_node_id still lag). This is the state that deferred 602x.
function wedgeSnapshot(overrides = {}) {
  return {
    replacementReplicaId: REPLACEMENT_REPLICA_ID,
    replacementLeaderElectionEvidence: {
      completedReplicaIds: [REPLACEMENT_REPLICA_ID],
    },
    completedLeaderHandoffEvidence: {observedAt: 1000},
    sourceLeadershipReleaseObserved: true,
    handoffRequestRetrySuppressed: true,
    replacementLeaderOwnershipObserved: false,
    ...overrides,
  };
}

function options(overrides = {}) {
  return {
    operation: {type: 'REPLACE', partitionId: 'replica_operations-p1'},
    priorityRecoveryCompletionSafe: false,
    ...overrides,
  };
}

test('CL-043 surplus-drain wedge: a completed replacement-leader election makes removal ' +
  'SAFE even outside priority-recovery completion (red on revert: requires ' +
  'priorityRecoveryCompletionSafe===true → false → wedge forever)', (t) => {
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot(),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    true,
    'the exact replacement completed its leader election + source released + voter-ready ' +
      '→ leadership succession is confirmed → SAFE, breaking the lagging-row wedge',
  );
  t.end();
});

test('CL-043 priority-recovery behavior is unchanged: completion-safe path still authorizes ' +
  'via election-completion-ready', (t) => {
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot(),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options({priorityRecoveryCompletionSafe: true}),
    ),
    true,
    'priorityRecoveryCompletionSafe=true still reaches SAFE (no regression to the existing path)',
  );
  t.end();
});

test('CL-043 NO weakening: without completed-election evidence the gate does NOT go SAFE ' +
  'outside priority-recovery (still defers — no blanket bypass)', (t) => {
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot({replacementLeaderElectionEvidence: {completedReplicaIds: []}}),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    false,
    'no election completion evidence → not SAFE (the fix is evidence-gated, not a relaxation)',
  );
  t.end();
});

test('CL-043 NO false positive: election completed for a DIFFERENT replica only does NOT ' +
  'authorize removal outside priority-recovery (requires the exact replacement)', (t) => {
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot({
        replacementLeaderElectionEvidence: {completedReplicaIds: [OTHER_REPLICA_ID]},
      }),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    false,
    'completion evidence for another replica is not proof THIS replacement won — not SAFE',
  );
  t.end();
});

test('CL-043 + R1 (now unconditional): even when the source-release rows STILL LAG (no handoff ' +
  'evidence, leadership not row-observed), the EXACT replacement\'s completed election ACK ' +
  'authorizes removal — the starved-rejoiner un-wedge', (t) => {
  // R1 is now unconditional: a completed election ACK for the EXACT replacement is itself proof
  // of leadership succession, accepted in lieu of the lagging source-release rows. This is the
  // starved-rejoiner regime (the source never releases leadership in the rows). The upstream
  // quorum-count floor and the voter-ready-replacement check still gate the removal.
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot({
        completedLeaderHandoffEvidence: null,
        sourceLeadershipReleaseObserved: false,
        handoffRequestRetrySuppressed: false,
      }),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    true,
    'R1 unconditional: the EXACT replacement election ACK proves succession despite lagging rows',
  );
  t.end();
});

test('CL-043 SAFETY preserved: insufficient replacement voter evidence → not SAFE', (t) => {
  const safety = makeSafety({voterEvidenceSufficient: false});
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot(),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    false,
    'replacement not voter-ready → removal not authorized',
  );
  t.end();
});

test('CL-043 NO-OP when ownership already row-observed (the non-lagging case is handled by the ' +
  'snapshot SAFE path, not this evidence bypass)', (t) => {
  const safety = makeSafety();
  t.equal(
    safety.isCompletedReplacementElectionSafeForPriorityRecovery(
      wedgeSnapshot({replacementLeaderOwnershipObserved: true}),
      {replica_id: REPLACEMENT_REPLICA_ID, raft_role: 'follower'},
      options(),
    ),
    false,
    'when ownership is already observed this bypass is inert (snapshot reaches SAFE on its own)',
  );
  t.end();
});
