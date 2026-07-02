import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationHandoff} from '../../src/rebalancer/priority-publication-handoff.js';
import {PriorityRecoverySupersededTarget} from '../../src/rebalancer/priority-recovery-superseded-target.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';

// ============================================================================
// DT6 fidelity-spike: the rolling-restart COORDINATION-tail kill-gate root
// `replacement_leader_pending` reproduces in-process, deterministically, with a
// genuine red-on-revert handle on Lever A (commit 6d01c2b9).
// ============================================================================
//
// This is the SECOND (non-CPU) kill-gate root for the docker rolling-restart
// scenario, complementing the CPU-sink spike. It is a kernel-level repro driven
// through the REAL handoff emitter `evaluatePriorityPublicationLeaderRemoveSafety`
// — the same method that, in docker, produces the deferral the analyzer
// classifies (scripts/analyze-replace-safety-blocks.js).
//
// THE ROOT (pinned, file:line):
//   A surplus-drain REPLACE on a critical control-plane partition targets a SOURCE
//   replica that is the partition raft leader, hosted on a STARVED node (the
//   `7493b0ab` regime) whose cooperative local raft election timer
//   (src/raft/liferaft.js:383 heartbeat(timeout())) never fires in budget. Remove-
//   safety computes sourceRemovalLeadershipSafe=false while the source still leads
//   with no observed successor (priority-publication-leader-safety.js:234-239), so
//   the snapshot lands in WAIT_REPLACEMENT_LEADER_OWNERSHIP (:491-493). The handoff
//   emitter (priority-publication-handoff.js:164-176) then emits a DEFER with the
//   message " replacement leader ownership pending before safe removal" (constant
//   REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL,
//   operation-workflow-owner-shared.js:177-178) and NO handoffRequest — a pure WAIT
//   on the dead cooperative timer. The REPLACE re-defers forever,
//   inFlightReplicaOperationCount never reaches 0, and the convergence oracle FAILs.
//
//   Docker label `replacement_leader_pending` = deferReason
//   'replace_remove_safety_blocked' AND errorMessage.includes('replacement leader')
//   (analyze-replace-safety-blocks.js:44,56). We assert against EXACTLY those two
//   fields off the real evaluation, so this reproduces the docker classifier's
//   inputs, not a proxy.
//
// LEVER A (the red-on-revert handle, commit 6d01c2b9):
//   escalateReplacementLeaderElection (leader-safety.js:287-290) drops the 30s
//   sourceLeaderHandoffStalled requirement: once the replacement is voter-ready
//   (replacementElectionTargetReady, :259-267) the snapshot routes to
//   REQUEST_REPLACEMENT_LEADER_ELECTION (:456-489) and the emitter attaches a
//   handoffRequest that DRIVES the replacement's election on a healthy node
//   (priority-publication-handoff.js:116-148) instead of waiting on the dead timer.
//
// CRUCIAL FIDELITY NUANCE (asserted + reported honestly): BOTH the WAIT and the
// ESCALATE deferrals carry deferReason='replace_remove_safety_blocked' and an
// errorMessage containing 'replacement leader', so the analyzer's coarse substring
// label `replacement_leader_pending` matches BOTH. The label text alone does NOT
// flip off under Lever A. The TRUE convergence discriminator — the thing that turns
// a forever-wedge into progress — is whether the deferral carries a handoffRequest
// (escalation: drive the election -> progress -> eventually SAFE) or NONE (pure
// WAIT: re-defer on the dead timer forever). This spike asserts that discriminator
// directly: with Lever A the deferral DRIVES an election; reverted, it does not.
//
// Determinism: no wall-clock, no real cluster, seeded by construction (the leaf
// readers return fixed row staleness mirroring a starved node). Faithfulness: the
// REAL evaluatePriorityPublicationLeaderRemoveSafety + buildPriorityPublication...
// Snapshot + buildDeferred...Evaluation are driven; only the external-state leaf
// readers (role/leader-id resolvers, evidence readers, voter-evidence, partition/
// planning fetch, replace-phase) are stubbed deterministically.

const {
  OperationType,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
} = SHARED;

const REPLACE_REMOVE_SAFETY_BLOCKED = 'replace_remove_safety_blocked';
// Mirrors analyze-replace-safety-blocks.js:56 — the docker `replacement_leader_pending`
// label substring probe.
const REPLACEMENT_LEADER_LABEL_MATCH = 'replacement leader';
// The exact constant the emitter surfaces (operation-workflow-owner-shared.js:178).
const REPLACEMENT_LEADER_PENDING_MESSAGE =
  ' replacement leader ownership pending before safe removal';

const ESCALATE_AFTER_MS = 30 * 1000;

const STARVED_NODE = 'rejoiner-7493b0ab'; // cooperative election timer never fires
const HEALTHY_NODE = 'node-healthy';
const PARTITION_ID = 'replica_operations-p1'; // priority, non-publication
const SOURCE_REPLICA_ID = 'replica_operations-p1-r2'; // surplus voter = the leader
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

// Rows as a STARVED node leaves them: source still 'leader', partition leader_node_id
// still names the starved node, replacement still 'follower' (voter-ready, ownership
// not yet row-observed because no successor election has completed).
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

function replaceOperation() {
  return {
    operationId: 'op-replace-leader-pending-1',
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    sourceNodeId: STARVED_NODE,
    sourceReplicaId: SOURCE_REPLICA_ID,
    targetReplicaId: REPLACEMENT_REPLICA_ID,
    targetNodeId: HEALTHY_NODE,
  };
}

// Host the REAL handoff emitter (PriorityPublicationHandoff) on deterministic leaf
// readers. `stallMs` lets us model the source-handoff stall age; the starved source
// never produces handoff evidence (its cooperative timer never fires).
function makeHandoff({stallMs = 1000} = {}) {
  const instance = Object.create(PriorityPublicationHandoff.prototype);
  instance.repository = {
    getReplaceSourceReplicaId: (op) => op?.sourceReplicaId ?? null,
    getReplaceTargetReplicaId: (op) => op?.targetReplicaId ?? null,
    isReplaceRemovePhase: () => true, // surplus-drain REMOVE phase of the REPLACE
  };
  instance.getReplicaRowIdentity = (row) => row?.replica_id ?? null;
  instance.getPriorityPublicationSourceRoleState = roleFromRow;
  instance.getPriorityPublicationReplacementRoleState = roleFromRow;
  instance.resolvePriorityPublicationSourceRoleState = (
    _operation,
    observedSourceRoleState,
  ) => observedSourceRoleState;
  instance.getCriticalPartitionLeaderNodeIdForSafety = (partitionRow) =>
    (typeof partitionRow?.leader_node_id === 'string' &&
      partitionRow.leader_node_id) ||
    null;
  // Starved node: STEP_DOWN local timer never fired -> no source-handoff ACK.
  instance.getPriorityPublicationLeaderHandoffEvidence = () => null;
  instance.isPriorityPublicationLeaderHandoffRetrySuppressed = () => false;
  // No replacement election has completed yet (ownership not row-observed): the
  // replacement is merely a voter-ready follower available to be driven.
  instance.getPriorityPublicationReplacementLeaderElectionEvidence = () => null;
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () => true;
  instance.normalizePriorityPublicationStatus = () => 'PUBLISHED';
  instance.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
  instance.getPriorityPublicationSourceLeaderHandoffStallMs = () => stallMs;
  // Async leaf fetches the real emitter awaits.
  instance.getCriticalPartitionRowForSafety = async () => stalePartitionRow;
  instance.getPriorityRecoveryPlanningSnapshot = async () => ({});
  // The deferral/safe/fail constructors live on a SUBCLASS
  // (PriorityRecoverySupersededTarget) further down the runtime chain. Bind the
  // REAL ones so the deferReason resolution (replace_remove_safety_blocked) and the
  // {error, handoffRequest} shape are produced by production code, not re-stated.
  instance.buildSafeRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildSafeRemoveSafetyEvaluation;
  instance.buildDeferredRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildDeferredRemoveSafetyEvaluation;
  instance.buildFailedRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildFailedRemoveSafetyEvaluation;
  instance.buildDeferredRemoveSafetyEvaluationForOperation =
    PriorityRecoverySupersededTarget.prototype
      .buildDeferredRemoveSafetyEvaluationForOperation;
  instance.resolveRemoveSafetyDeferredReason =
    PriorityRecoverySupersededTarget.prototype.resolveRemoveSafetyDeferredReason;
  return instance;
}

function evaluate(handoff) {
  return handoff.evaluatePriorityPublicationLeaderRemoveSafety(
    replaceOperation(),
    starvedSourceRow,
    replacementFollowerRow,
    {priorityRecoveryCompletionSafe: false},
  );
}

// ----------------------------------------------------------------------------
// Lever A REVERTED: restore the pre-6d01c2b9 guard. Pre-Lever-A the escalation
// required the source handoff to have stalled >= 30s FIRST
// (`sourceLeaderHandoffStalled && replacementElectionTargetReady`). On the starved
// rejoiner that 30s wait was wasted re-asking a node that cannot respond. We model
// the revert faithfully by re-running the REAL builder and, when the source handoff
// stall is FRESH (< 30s), re-imposing the original stall conjunct: under the
// PRE-Lever-A code a fresh handoff never escalated, so the snapshot fell back to the
// cooperative WAIT. This isolates the SINGLE conjunct the commit removed.
// ----------------------------------------------------------------------------
function makeRevertedHandoff() {
  const instance = makeHandoff({stallMs: 1000}); // FRESH: < 30s
  const realBuilder =
    PriorityPublicationHandoff.prototype
      .buildPriorityPublicationLeaderRemoveSafetySnapshot;
  instance.buildPriorityPublicationLeaderRemoveSafetySnapshot = function(
    operation,
    sourceReplicaRow,
    replacementReplicaRow,
    partitionRow,
    planningSnapshot,
    options,
  ) {
    const snapshot = realBuilder.call(
      this,
      operation,
      sourceReplicaRow,
      replacementReplicaRow,
      partitionRow,
      planningSnapshot,
      options,
    );
    const stallMs = this.getPriorityPublicationSourceLeaderHandoffStallMs(
      operation,
    );
    const stalled = Number.isFinite(stallMs) && stallMs >= ESCALATE_AFTER_MS;
    // PRE-Lever-A: a FRESH (not-yet-stalled) handoff never escalates. If the live
    // builder escalated only because Lever A dropped the stall guard, revert it to
    // the cooperative WAIT the source-handoff would have produced.
    if (!stalled && snapshot.escalateReplacementLeaderElection === true) {
      return Object.freeze({
        ...snapshot,
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE
            .WAIT_REPLACEMENT_LEADER_OWNERSHIP,
        escalateReplacementLeaderElection: false,
      });
    }
    return snapshot;
  };
  return instance;
}

// ============================================================================
// 1. THE WEDGE (Lever A reverted): the deferral surfaces the
//    `replacement_leader_pending` label with NO handoffRequest -> pure WAIT on the
//    dead cooperative timer -> the REPLACE stays in-flight -> oracle FAILs.
// ============================================================================
test('replacement_leader_pending WEDGE (Lever A reverted): a fresh source-leader ' +
  'handoff off a starved rejoiner DEFERs in WAIT_REPLACEMENT_LEADER_OWNERSHIP with ' +
  'the docker `replacement_leader_pending` label and NO drive (re-defers forever)', async (t) => {
  const handoff = makeRevertedHandoff();
  const evaluation = await evaluate(handoff);

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'the REPLACE is DEFERred (not SAFE) — removal is not authorized',
  );
  // The two fields the docker analyzer classifies on
  // (analyze-replace-safety-blocks.js:44,56).
  t.equal(
    evaluation.deferReason,
    REPLACE_REMOVE_SAFETY_BLOCKED,
    'deferReason is the umbrella replace_remove_safety_blocked',
  );
  t.ok(
    String(evaluation.error).includes(REPLACEMENT_LEADER_LABEL_MATCH),
    'errorMessage matches the replacement_leader_pending sub-reason probe',
  );
  t.ok(
    String(evaluation.error).includes(REPLACEMENT_LEADER_PENDING_MESSAGE),
    'errorMessage is the exact REPLACEMENT_LEADER_OWNERSHIP_PENDING constant',
  );
  // The convergence discriminator: NO handoffRequest -> nothing drives the
  // replacement election -> the cooperative source timer never fires -> the
  // REPLACE re-defers forever -> inFlightReplicaOperationCount never reaches 0.
  t.equal(
    evaluation.handoffRequest,
    null,
    'the WAIT deferral carries NO drive — it waits on the dead cooperative timer ' +
      '(inFlightReplicaOperationCount > 0 forever -> convergence oracle FAILs)',
  );
  t.end();
});

// ============================================================================
// 2. RED-ON-REVERT, the other direction (Lever A enabled = live src): the SAME
//    starved-source scenario routes to REQUEST_REPLACEMENT_LEADER_ELECTION and the
//    deferral DRIVES the replacement's election on the healthy node -> progress.
// ============================================================================
test('Lever A ENABLED (live src): the SAME wedge IMMEDIATELY drives the voter-ready ' +
  'replacement election on the healthy node (deferral carries a handoffRequest -> ' +
  'progress, no 30s wait on the dead timer)', async (t) => {
  const handoff = makeHandoff({stallMs: 1000}); // FRESH stall: Lever A ignores it
  const evaluation = await evaluate(handoff);

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'still a DEFER — Lever A never authorizes a removal, it only redirects the handoff',
  );
  // The drive: a handoffRequest dispatching the replacement leader election to the
  // HEALTHY node (priority-publication-handoff.js:116-148). THIS is the field that
  // turns the forever-wedge into progress.
  t.ok(
    evaluation.handoffRequest,
    'the escalation deferral carries a handoffRequest (it DRIVES the election)',
  );
  t.equal(
    evaluation.handoffRequest.dispatchNodeId,
    HEALTHY_NODE,
    'the election is dispatched to the healthy replacement node, not the dead source',
  );
  t.equal(
    evaluation.handoffRequest.requestReplicaId,
    REPLACEMENT_REPLICA_ID,
    'the drive targets the EXACT voter-ready replacement replica',
  );
  t.end();
});

// ============================================================================
// 3. The lever is the SOLE difference: identical scenario + identical starved
//    source, the ONLY change between #1 and #2 is Lever A's immediate escalation.
//    This is the genuine red-on-revert pin: revert -> WAIT (no drive); live -> DRIVE.
// ============================================================================
test('red-on-revert pin: the ONLY behavioural change is the drive — reverted Lever A ' +
  'WAITs (handoffRequest=null), live Lever A DRIVEs (handoffRequest set); both keep ' +
  'the replacement_leader_pending label, so the label text alone is NOT the ' +
  'discriminator — the handoffRequest is', async (t) => {
  const reverted = await evaluate(makeRevertedHandoff());
  const live = await evaluate(makeHandoff({stallMs: 1000}));

  // Same docker label on BOTH (the honest fidelity nuance).
  for (const [name, ev] of [['reverted', reverted], ['live', live]]) {
    t.equal(ev.deferReason, REPLACE_REMOVE_SAFETY_BLOCKED,
      `${name}: same umbrella deferReason`);
    t.ok(String(ev.error).includes(REPLACEMENT_LEADER_LABEL_MATCH),
      `${name}: same replacement_leader_pending label substring`);
  }

  // The discriminator flips with the lever.
  t.equal(reverted.handoffRequest, null,
    'reverted: WAITs on the dead cooperative timer (no drive) -> wedge');
  t.ok(live.handoffRequest,
    'live: DRIVEs the replacement election immediately -> progress');
  t.not(
    Boolean(reverted.handoffRequest),
    Boolean(live.handoffRequest),
    'reverting Lever A removes the drive — a true red-on-revert handle',
  );
  t.end();
});

// ============================================================================
// 4. SAFETY: Lever A is evidence-gated, not a bypass. A NON-voter-ready
//    replacement never escalates — it stays the cooperative source-handoff path
//    (so the lever can never drive a stale node to leadership / split-brain).
// ============================================================================
test('SAFETY: a NON-voter-ready replacement never escalates under Lever A — it keeps ' +
  'the cooperative source-handoff (the lever cannot drive a stale node to leadership)', async (t) => {
  const handoff = makeHandoff({stallMs: 1000});
  handoff.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () => false;
  const evaluation = await evaluate(handoff);

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'still a DEFER',
  );
  // With no voter-ready replacement to elect, escalation is suppressed and the gate
  // falls back to re-asking the SOURCE (the cooperative source handoff path), whose
  // drive (if any) targets the source replica, never the replacement.
  t.not(
    evaluation.handoffRequest?.requestReplicaId,
    REPLACEMENT_REPLICA_ID,
    'no escalation drive to the non-voter-ready replacement',
  );
  t.end();
});
