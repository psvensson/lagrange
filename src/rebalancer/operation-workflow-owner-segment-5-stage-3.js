import {OperationWorkflowOwnerSegment5Stage2} from './operation-workflow-owner-segment-5-stage-2.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-5-stage-shared.js';

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

class OperationWorkflowOwnerSegment5Stage3 extends OperationWorkflowOwnerSegment5Stage2 {
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
        sourceLeadershipReleaseObserved,
      }));
    const priorityRecoveryFollowerSourceRemovalSafe =
      followerSourceRemovalSafety.state ===
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.SAFE;
    const sourceRemovalLeadershipSafe =
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
    return (
      options.priorityRecoveryCompletionSafe === true &&
      sourceLeadershipReleaseConfirmed &&
      sourceLeadershipReleaseFresh &&
      replacementElectionCompletionReady &&
      safetySnapshot?.replacementLeaderOwnershipObserved !== true &&
      this.isPriorityActiveReplaceTopologyVoterEvidenceSufficient(
        options.operation || null,
        replacementReplicaRow,
      )
    );
  }
}

export {OperationWorkflowOwnerSegment5Stage3};
