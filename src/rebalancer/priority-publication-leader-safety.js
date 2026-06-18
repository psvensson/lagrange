import {PriorityPublicationSafetyRows} from './priority-publication-safety-rows.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';

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
      (!completedLeaderHandoffEvidence || !handoffRequestRetrySuppressed)
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
      sourceLeaderHandoffSatisfied &&
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
    return (
      replacementElectionAuthorizesRemoval &&
      sourceLeadershipReleaseConfirmed &&
      sourceLeadershipReleaseFresh &&
      safetySnapshot?.replacementLeaderOwnershipObserved !== true &&
      this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
        options.operation || null,
        replacementReplicaRow,
      )
    );
  }
}

export {PriorityPublicationLeaderSafety};
