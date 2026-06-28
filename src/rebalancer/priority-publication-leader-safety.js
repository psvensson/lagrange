import {PriorityPublicationSafetyRows} from './priority-publication-safety-rows.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {TIME_MS} from '../constants/time.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  INITIAL_PARTITION_IDS,
  NUM,
  OperationType,
  PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  decidePriorityPublicationFollowerSourceRemovalSafety,
} = SHARED;

// R3 (epic slow-rejoiner-progress-or-evict, "progress-or-evict / drive the handoff"):
// PROMOTED default-ON (gate `stat-gate-20260623T164130Z`: SAFE 3/3, no leadership-churn
// regression — 8 target_leader_election events; escape hatch = set the flag to 'false').
// When a priority source-leader handoff has been non-progressing for a sustained window (the
// saturated rejoiner never runs its cooperative local-timer STEP_DOWN), ESCALATES from
// re-asking the starved source to step down to actively driving the voter-ready REPLACEMENT's
// leader election instead. This is mechanism A/C: a SWIM-alive-but-quiesced
// rejoiner is neither pushed forward nor evicted, so the surplus-drain REPLACE re-dispatches the
// same source STEP_DOWN forever (the dominant replace_remove_safety_blocked wedge). Driving the
// healthy replacement's election lets a real successor win, after which removal becomes safe
// (via the natural leader_node_id row update, or immediately under R1's election-ack proof).
//
// SAFE: R3 NEVER authorizes a removal — it only changes WHICH handoff message is dispatched
// (replacement leader-election vs source step-down). The source removal still gates on the full
// sourceRemovalLeadershipSafe proof in a later evaluation (and the independent upstream
// quorum-count floor). Driving an election on a voter-ready replacement is a normal raft
// operation raft is designed to tolerate: if the source is in fact still a live healthy leader
// the replacement's campaign simply loses (a transient extra election), never a quorum loss.
// The escalation requires the replacement to be a voter-ready follower, so it can never elect a
// non-voter-ready node.
//
// COMPOSES WITH R1 (not independent): R3 newly lets a completed replacement-election ACK be
// produced WHILE the source row still shows LEADER (pre-R3 the replacement election only fired
// after the source-handoff was satisfied). With R1 also on, that ACK is then trusted as
// succession proof to authorize the removal. This is safe ONLY because the upstream quorum-COUNT
// floor (operation-workflow-remove-safety-evaluator.js:461-471, removing source excluded) and
// R1's voter-ready-replacement check both still hold.
//
// PROMOTED to unconditional (gate-validated, epic slow-rejoiner-progress-or-evict RESOLVED): the
// escalation is now always active; the on/off switch has been removed while the upstream
// quorum-count floor and the voter-ready-replacement check remain in force.
// Sustained non-progress window before escalating a stuck source-leader handoff. Well above
// healthy handoff latency (sub-second), below the source-handoff stall TTL (2 min) and the
// 120s over-target oracle, so only the genuinely-quiesced rejoiner regime escalates.
const PRIORITY_PUBLICATION_SOURCE_HANDOFF_ESCALATE_AFTER_MS =
  TIME_MS.SECOND * 30;

// Observability (no behavior change): a single debug-level trace of every
// applicable, not-yet-safe priority source-leader-handoff decision. The
// resulting safety `state` (REQUEST_SOURCE_LEADER_HANDOFF / path-1 on the
// source vs REQUEST_REPLACEMENT_LEADER_ELECTION / path-2 on the replacement vs
// WAIT_REPLACEMENT_LEADER_OWNERSHIP) is unambiguously derivable from the logged
// gate components, so this is the canonical signal for diagnosing WHY a
// surplus-drain source removal stalls (is the escalation firing? is the
// replacement voter-ready? does leadership actually move?). Emitted at debug so
// it is captured only under --debug-logs/--capture-logs with ~zero steady cost.
const PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_DECISION_LOG =
  'priority-publication leader-remove-safety decision';

// R1 (epic slow-rejoiner-progress-or-evict, "proof-not-rows"): PROMOTED default-ON
// (gate `stat-gate-20260623T164130Z`: SAFE 3/3, priority-recovery remove-safety residual
// witnesses 3→0; escape hatch = set the flag to 'false'). Authorizes a priority-partition
// source-leader removal on a completed leader-election ACK for the EXACT voter-ready
// replacement, WITHOUT also requiring the source-leadership-release rows (raft_role /
// partition leader_node_id) to have caught up.
//
// Why it is needed: the source-leader handoff is a COOPERATIVE local-timer raft step the
// old leader must execute itself (STEP_DOWN_REPLICA → startElectionTimer). On a CPU-starved
// / quiesced rejoiner those timers don't fire in budget, so the source never releases
// leadership in the persisted rows and no completedLeaderHandoffEvidence is ever recorded —
// sourceLeadershipReleaseConfirmed/Fresh stay false forever and the surplus-drain REPLACE
// defers in WAIT_REPLACEMENT_LEADER_OWNERSHIP indefinitely (control plane never quiesces;
// scenario never PASSes). Meanwhile the REPLACEMENT — a healthy node — can independently ACK
// its own leader-election request. That ACK is a fresh successor signal independent of the
// lagging source rows.
//
// Why it is SAFE (subagent-verified 2026-06-23): quorum COUNT is enforced INDEPENDENTLY
// upstream of this gate (operation-workflow-remove-safety-evaluator.js:461-471 rejects the
// removal when projectedVoterReadyCount < minReplicaCount, gated on !priorityRecoveryCompletionSafe
// and computed with the removing source already excluded), and the bypass still requires the
// replacement to be voter-ready (isPriorityActiveReplaceTopologyVoterEvidenceSufficient). So
// the worst case if the source is STILL the live leader and the replacement merely accepted
// (not yet won) its election is a brief NORMAL raft re-election among the remaining
// voter-ready replicas — a transient liveness dip — NEVER a quorum or voter-ready-spread loss.
// This is a deliberate trade (accept a bounded transient re-election to un-wedge the starved
// rejoiner) vs the conservative default that refuses removal until the source-release rows
// confirm. The bypass keys strictly on the EXACT replacement replica's completed election
// (never any-replica, never a no-ack case).
//
// PROMOTED to unconditional (gate-validated, epic slow-rejoiner-progress-or-evict RESOLVED): the
// election-ACK succession proof is now always active; the on/off switch has been removed while
// the upstream quorum-count floor, the voter-ready-replacement check, and the EXACT-replacement
// completed-election ACK itself all remain in force.

class PriorityPublicationLeaderSafety extends PriorityPublicationSafetyRows {
  buildPriorityPublicationLeaderRemoveSafetySnapshot(
    operation,
    sourceReplicaRow,
    replacementReplicaRow,
    partitionRow,
    planningSnapshot,
    options = {},
  ) {
    const partitionId =
      typeof operation?.partitionId === TYPEOF.STRING ?
        operation.partitionId :
        null;
    const publicationPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
    const sourceReplicaId =
      this.getReplicaRowIdentity(sourceReplicaRow) ||
      this.repository.getReplaceSourceReplicaId(operation) ||
      null;
    // CL-038: sourceReplicaRow comes from the authoritative-merged critical replica
    // rows (getCriticalReplicaRowsForSafety: authoritative gateway read merged with
    // cache, fail-closed on an empty partition upstream). When a REPLACE declares a
    // source replica to remove but that source row is ABSENT from this authoritative
    // view, the source has already been removed. A removed replica cannot be a raft
    // leader, so its leadership is necessarily released and there is no live source
    // leader left to hand off from. Without this, resolvePriorityPublicationSourceRoleState
    // infers LEADER from the now-stale partitionRow.leader_node_id (which still names
    // the removed source's node until a successor is elected/published), poisoning every
    // sourceRemovalLeadershipSafe disjunct, so the gate never reaches SAFE and the
    // workflow re-dispatches a STEP_DOWN handoff to a replica that no longer exists —
    // wedging the surplus-drain REPLACE indefinitely (topology never quiesces though
    // publication has converged). This is scoped strictly to source-row absence; a
    // source that is still present and leader is never released without a real handoff.
    const sourceReplicaRemoved =
      Boolean(this.repository.getReplaceSourceReplicaId(operation)) &&
      !this.getReplicaRowIdentity(sourceReplicaRow);
    const observedSourceRoleState =
      this.getPriorityPublicationSourceRoleState(sourceReplicaRow);
    const sourceRoleState = this.resolvePriorityPublicationSourceRoleState(
      operation,
      observedSourceRoleState,
      partitionRow,
      sourceReplicaId,
    );
    const partitionLeaderNodeId =
      this.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
    const rawSourceNodeId =
      typeof sourceReplicaRow?.node_id === TYPEOF.STRING ?
        sourceReplicaRow.node_id.trim() :
        typeof operation?.sourceNodeId === TYPEOF.STRING ?
          operation.sourceNodeId.trim() :
          null;
    const sourceNodeId =
      rawSourceNodeId && rawSourceNodeId.length > NUM.ZERO ?
        rawSourceNodeId :
        null;
    const replacementReplicaId =
      this.getReplicaRowIdentity(replacementReplicaRow) ||
      this.repository.getReplaceTargetReplicaId(operation) ||
      (typeof operation?.replicaId === TYPEOF.STRING &&
      operation.replicaId.length > NUM.ZERO ?
        operation.replicaId :
        null);
    const replacementRoleState =
      this.getPriorityPublicationReplacementRoleState(replacementReplicaRow);
    const rawReplacementNodeId =
      typeof replacementReplicaRow?.node_id === TYPEOF.STRING ?
        replacementReplicaRow.node_id.trim() :
        typeof operation?.targetNodeId === TYPEOF.STRING ?
          operation.targetNodeId.trim() :
          null;
    const replacementNodeId =
      rawReplacementNodeId && rawReplacementNodeId.length > NUM.ZERO ?
        rawReplacementNodeId :
        null;
    const completedLeaderHandoffEvidence =
      this.getPriorityPublicationLeaderHandoffEvidence(
        operation,
        sourceReplicaId,
      );
    const handoffRequestRetrySuppressed =
      this.isPriorityPublicationLeaderHandoffRetrySuppressed(
        completedLeaderHandoffEvidence,
      );
    const replacementLeaderElectionEvidence =
      this.getPriorityPublicationReplacementLeaderElectionEvidence(
        operation,
        replacementReplicaId,
      );
    const replacementReplicaNotFoundByElection =
      Array.isArray(replacementLeaderElectionEvidence?.notFoundReplicaIds) &&
      typeof replacementReplicaId === TYPEOF.STRING &&
      replacementReplicaId.length > NUM.ZERO &&
      replacementLeaderElectionEvidence.notFoundReplicaIds.includes(
        replacementReplicaId,
      );
    const replacementLeaderElectionRetrySuppressed =
      this.isPriorityPublicationLeaderHandoffRetrySuppressed(
        replacementLeaderElectionEvidence,
      );
    const sourceLeaderHandoffSatisfied =
      sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER ||
      completedLeaderHandoffEvidence !== null;
    const sourceLeadershipReleaseObserved =
      sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    const partitionLeaderMovedAwayFromSource =
      partitionLeaderNodeId !== null &&
      (sourceNodeId === null || partitionLeaderNodeId !== sourceNodeId);
    const partitionLeaderStillSource =
      partitionLeaderNodeId !== null &&
      sourceNodeId !== null &&
      partitionLeaderNodeId === sourceNodeId;
    const replacementLeaderOwnershipObserved =
      replacementRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER ||
      (replacementNodeId !== null &&
        partitionLeaderMovedAwayFromSource &&
        partitionLeaderNodeId === replacementNodeId);
    const sourceLeadershipReleaseHasCanonicalSuccessor =
      sourceLeadershipReleaseObserved &&
      partitionLeaderMovedAwayFromSource;
    const priorityRecoveryFollowerElectionSafe =
      options?.priorityRecoveryCompletionSafe === true &&
      sourceLeadershipReleaseObserved &&
      replacementLeaderElectionRetrySuppressed === true &&
      this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
        operation,
        replacementReplicaRow,
      );
    const followerSourceRemovalSafety =
      decidePriorityPublicationFollowerSourceRemovalSafety(Object.freeze({
        priorityRecoveryCompletionSafe:
          options?.priorityRecoveryCompletionSafe === true,
        publicationPartition: partitionId === publicationPartitionId,
        replacementTopologyVoterSufficient:
          this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
            operation,
            replacementReplicaRow,
          ),
        partitionLeaderStillSource,
        sourceLeadershipReleaseObserved,
      }));
    const priorityRecoveryFollowerSourceRemovalSafe =
      followerSourceRemovalSafety.state ===
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.SAFE;
    const sourceRemovalLeadershipSafe =
      sourceReplicaRemoved ||
      sourceLeadershipReleaseHasCanonicalSuccessor ||
      replacementLeaderOwnershipObserved ||
      priorityRecoveryFollowerElectionSafe ||
      priorityRecoveryFollowerSourceRemovalSafe;
    const publicationStatus =
      this.normalizePriorityPublicationStatus(planningSnapshot);
    const replacementLeaderElectionNotFoundTerminal =
      options?.replacementLeaderElectionNotFoundTerminal === true;
    // R3 (now unconditional): escalate a sustained-non-progressing source-leader handoff to
    // driving the voter-ready replacement's election. Only active when the source is still leader
    // (not released), the replacement is a voter-ready follower available to win, and the
    // replacement's leadership is not yet observed. The escalation suppresses the source-handoff
    // re-ask and routes through the existing REQUEST_REPLACEMENT_LEADER_ELECTION dispatch; it
    // never authorizes a removal.
    const sourceLeaderHandoffStallMs =
      typeof this.getPriorityPublicationSourceLeaderHandoffStallMs ===
        TYPEOF.FUNCTION ?
        this.getPriorityPublicationSourceLeaderHandoffStallMs(operation) :
        null;
    const sourceLeaderHandoffStalled =
      Number.isFinite(sourceLeaderHandoffStallMs) &&
      sourceLeaderHandoffStallMs >=
        PRIORITY_PUBLICATION_SOURCE_HANDOFF_ESCALATE_AFTER_MS;
    const replacementElectionTargetReady =
      replacementRoleState ===
        PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER &&
      replacementReplicaId !== null &&
      replacementNodeId !== null &&
      this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
        operation,
        replacementReplicaRow,
      );
    // Lever A (latency-tail reducer): escalate to driving the voter-ready
    // replacement's election IMMEDIATELY, not only after the source handoff has
    // stalled PRIORITY_PUBLICATION_SOURCE_HANDOFF_ESCALATE_AFTER_MS (30s). The
    // source handoff is a COOPERATIVE local election timer the source must run
    // itself; when the source is the CPU-pegged rejoiner that timer never fires
    // in budget, so the prior design wasted up to 30s (a quarter of the
    // per-restart convergence budget) re-asking a node that cannot respond
    // before escalating. Once a voter-ready replacement exists there is no reason
    // to wait: the cooperative step-down would itself cause an election (the
    // source arms an election timer and a follower wins), so driving the
    // replacement's election directly is the SAME leadership transfer, just on a
    // healthy node and without the 30s wait + the round-trip to the saturated
    // source — no extra election churn. The stall age is retained below as a
    // diagnostic field. Safety is identical to R3 (the predicate this generalizes):
    // escalation NEVER authorizes removal (sourceRemovalLeadershipSafe still
    // gates it) and requires the replacement be voter-ready, so it can never
    // drive a stale node to leadership / split-brain. When the replacement is NOT
    // yet voter-ready (replacementElectionTargetReady false) the cooperative
    // source handoff path below is preserved unchanged.
    const escalateReplacementLeaderElection =
      sourceRoleState !== PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER &&
      !replacementLeaderOwnershipObserved &&
      replacementElectionTargetReady;

    if (
      operation?.type === OperationType.REPLACE &&
      this.isReplaceSourceLeaderHandoffRequiredPartition(partitionId) &&
      !sourceRemovalLeadershipSafe
    ) {
      this.logger?.debug?.(
        PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_DECISION_LOG,
        {
          operationId: operation?.operationId ?? null,
          partitionId,
          sourceNodeId,
          partitionLeaderNodeId,
          replacementNodeId,
          sourceRoleState,
          replacementRoleState,
          replacementElectionTargetReady,
          escalateReplacementLeaderElection,
          replacementLeaderOwnershipObserved,
          sourceLeadershipReleaseObserved,
          sourceLeaderHandoffStalled,
          sourceLeaderHandoffStallMs,
          handoffRequestRetrySuppressed,
          replacementLeaderElectionRetrySuppressed,
        },
      );
    }

    if (
      operation?.type !== OperationType.REPLACE ||
      !this.isReplaceSourceLeaderHandoffRequiredPartition(partitionId)
    ) {
      return Object.freeze({
        state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.NOT_APPLICABLE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        replacementLeaderElectionEvidence,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (partitionId === publicationPartitionId && !publicationStatus) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.PUBLICATION_STATUS_UNAVAILABLE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        replacementLeaderElectionEvidence,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus: null,
      });
    }

    if (
      partitionId === publicationPartitionId &&
      publicationStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    ) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_PUBLICATION_PUBLISHED,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        replacementLeaderElectionEvidence,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (sourceRemovalLeadershipSafe) {
      return Object.freeze({
        state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.SAFE,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceReplicaRemoved,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        replacementLeaderElectionEvidence,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (
      sourceRoleState !== PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER &&
      (!completedLeaderHandoffEvidence || !handoffRequestRetrySuppressed) &&
      !escalateReplacementLeaderElection
    ) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        handoffRequestRetrySuppressed,
        replacementLeaderElectionEvidence,
        replacementLeaderElectionRetrySuppressed,
        replacementLeaderElectionNotFoundTerminal,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (
      sourceLeaderHandoffSatisfied &&
      replacementReplicaNotFoundByElection &&
      !replacementLeaderOwnershipObserved
    ) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE
            .FAIL_REPLACEMENT_REPLICA_NOT_FOUND,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        handoffRequestRetrySuppressed,
        replacementLeaderElectionEvidence,
        replacementLeaderElectionRetrySuppressed,
        replacementReplicaNotFoundByElection,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    if (
      (sourceLeaderHandoffSatisfied || escalateReplacementLeaderElection) &&
      replacementRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER &&
      replacementReplicaId !== null &&
      replacementNodeId !== null &&
      !replacementLeaderElectionRetrySuppressed
    ) {
      return Object.freeze({
        state:
          PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
        partitionId,
        sourceRoleState,
        observedSourceRoleState,
        sourceReplicaId,
        sourceNodeId,
        partitionLeaderNodeId,
        replacementReplicaId,
        replacementNodeId,
        replacementRoleState,
        sourceLeadershipReleaseObserved,
        replacementLeaderOwnershipObserved,
        sourceRemovalLeadershipSafe,
        completedLeaderHandoffEvidence,
        handoffRequestRetrySuppressed,
        replacementLeaderElectionEvidence,
        replacementLeaderElectionRetrySuppressed,
        replacementLeaderElectionNotFoundTerminal,
        escalateReplacementLeaderElection,
        sourceLeaderHandoffStalled,
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    return Object.freeze({
      state:
        PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.WAIT_REPLACEMENT_LEADER_OWNERSHIP,
      partitionId,
      sourceRoleState,
      observedSourceRoleState,
      sourceReplicaId,
      sourceNodeId,
      partitionLeaderNodeId,
      replacementReplicaId,
      replacementNodeId,
      replacementRoleState,
      sourceLeadershipReleaseObserved,
      replacementLeaderOwnershipObserved,
      sourceRemovalLeadershipSafe,
      completedLeaderHandoffEvidence,
      handoffRequestRetrySuppressed,
      replacementLeaderElectionEvidence,
      replacementLeaderElectionRetrySuppressed,
      escalateReplacementLeaderElection,
      sourceLeaderHandoffStalled,
      priorityRecoveryFollowerSourceRemovalSafe,
      publicationPartitionId,
      publicationStatus,
    });
  }

  isCompletedReplacementElectionSafeForPriorityRecovery(
    safetySnapshot,
    replacementReplicaRow,
    options = {},
  ) {
    const replacementReplicaId =
      typeof safetySnapshot?.replacementReplicaId === TYPEOF.STRING ?
        safetySnapshot.replacementReplicaId :
        null;
    const completedReplicaIds = Array.isArray(
      safetySnapshot?.replacementLeaderElectionEvidence?.completedReplicaIds,
    ) ?
      safetySnapshot.replacementLeaderElectionEvidence.completedReplicaIds :
      [];
    const replacementElectionCompletedForCurrentReplica =
      replacementReplicaId !== null &&
      replacementReplicaId.length > NUM.ZERO &&
      completedReplicaIds.includes(replacementReplicaId);
    const replacementElectionCompletedForAnyReplica =
      completedReplicaIds.length > NUM.ZERO;
    const replacementElectionCompletionReady =
      replacementElectionCompletedForCurrentReplica ||
      (
        replacementElectionCompletedForAnyReplica &&
        options.replacementLeaderRetargetCandidateAvailable !== true
      );
    const sourceLeadershipReleaseConfirmed =
      Boolean(safetySnapshot?.completedLeaderHandoffEvidence) ||
      safetySnapshot?.sourceLeadershipReleaseObserved === true;
    const sourceLeadershipReleaseFresh =
      safetySnapshot?.sourceLeadershipReleaseObserved === true ||
      safetySnapshot?.handoffRequestRetrySuppressed === true;
    // CL-043 (2026-06-18): a surplus-drain REPLACE on a priority partition removes a
    // source that is the partition LEADER. The snapshot can only observe the successor
    // via the persisted replacement raft_role + partition leader_node_id rows, which lag
    // live raft leadership (CL-016/CL-035 write-through family). When they lag, the gate
    // wedges in WAIT_REPLACEMENT_LEADER_OWNERSHIP and the drain defers indefinitely
    // (control plane never quiesces). The completed replacement-leader ELECTION evidence
    // means the EXACT replacement replica acknowledged its leader-election handoff request
    // (it accepted the election or was already a live follower) — a fresh successor-
    // candidate signal independent of those lagging rows, and exactly what the priority-
    // recovery completion path already trusts. Authorize removal on it for the SAME class
    // of priority partitions even outside priority-recovery completion, requiring the
    // EXACT replacement replica (not just any replica) and keeping every other guardrail
    // (source leadership released, replacement voter-ready, ownership not yet row-observed).
    // This is SAFE because: (a) quorum COUNT is enforced INDEPENDENTLY upstream
    // (operation-workflow-remove-safety-evaluator.js minReplicaCount + published-membership
    // checks, both gated on !priorityRecoveryCompletionSafe and run BEFORE this gate), so a
    // voter floor always remains; (b) the replacement is voter-ready. The evidence proves
    // the election was requested/accepted, NOT necessarily already won — so the worst case
    // if that specific election loses is a brief NORMAL raft re-election among the remaining
    // voter-ready replicas (a transient liveness dip), never a quorum loss. This governs
    // leadership SUCCESSION only and cannot drop voters below the minimum.
    const replacementElectionAuthorizesRemoval =
      replacementElectionCompletionReady &&
      (options.priorityRecoveryCompletionSafe === true ||
        replacementElectionCompletedForCurrentReplica);
    // R1 (now unconditional): when the EXACT replacement replica's leader election has completed,
    // that ACK is itself proof of leadership succession — accept it in lieu of the lagging
    // source-leadership-release rows so a surplus-drain REPLACE off a starved rejoiner can
    // make progress. The EXACT-replacement completed-election ACK is the safety proof and is
    // required here; only the on/off switch has been removed.
    const sourceLeadershipSuccessionProven =
      (sourceLeadershipReleaseConfirmed && sourceLeadershipReleaseFresh) ||
      replacementElectionCompletedForCurrentReplica;
    return (
      replacementElectionAuthorizesRemoval &&
      sourceLeadershipSuccessionProven &&
      safetySnapshot?.replacementLeaderOwnershipObserved !== true &&
      this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
        options.operation || null,
        replacementReplicaRow,
      )
    );
  }
}

export {PriorityPublicationLeaderSafety};
