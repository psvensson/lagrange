import {PriorityPublicationSafetyRows} from './priority-publication-safety-rows.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  INITIAL_PARTITION_IDS,
  OperationType,
  PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  SYSTEM_TABLE_NAME,
  decidePriorityPublicationFollowerSourceRemovalSafety,
} = SHARED;

// Observability (no behavior change): a single debug-level trace of every
// applicable, not-yet-safe priority source-leader decision. A partition
// REPLACE's leadership is decided by its named-target handoff (the REPLACE
// owner); this trace records the row-observed leadership inputs.
const PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_DECISION_LOG =
  'priority-publication leader-remove-safety decision';

class PriorityPublicationLeaderSafety extends PriorityPublicationSafetyRows {
  // leader_node_id identifies the canonical leader node, not a replica when
  // multiple voters share that node. A distinct voter-ready LEADER row can
  // therefore corroborate that this explicitly observed FOLLOWER is not it.
  // A lone follower row never suffices because saturated nodes can publish a
  // stale replica role while the canonical leader-node row still names them.
  hasCoLocatedLeaderSiblingEvidence(
    sourceReplicaId,
    sourceNodeId,
    observedSourceRoleState,
    currentVoterReadyRows,
  ) {
    if (
      observedSourceRoleState !==
        PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER ||
      sourceReplicaId === null ||
      sourceNodeId === null ||
      !Array.isArray(currentVoterReadyRows)
    ) {
      return false;
    }
    return currentVoterReadyRows.some((row) => {
      const replicaId = this.getReplicaRowIdentity(row);
      const nodeId =
        typeof row?.node_id === 'string' ? row.node_id.trim() : null;
      return (
        replicaId !== null &&
        replicaId !== sourceReplicaId &&
        nodeId === sourceNodeId &&
        this.isVoterReadyReplicaTopology(row) &&
        this.getPriorityPublicationSourceRoleState(row) ===
          PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER
      );
    });
  }

  buildPriorityPublicationLeaderRemoveSafetySnapshot(
    operation,
    sourceReplicaRow,
    replacementReplicaRow,
    partitionRow,
    planningSnapshot,
    options = {},
  ) {
    const partitionId =
      typeof operation?.partitionId === 'string' ?
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
      typeof sourceReplicaRow?.node_id === 'string' ?
        sourceReplicaRow.node_id.trim() :
        typeof operation?.sourceNodeId === 'string' ?
          operation.sourceNodeId.trim() :
          null;
    const sourceNodeId =
      rawSourceNodeId && rawSourceNodeId.length > 0 ?
        rawSourceNodeId :
        null;
    const replacementReplicaId =
      this.getReplicaRowIdentity(replacementReplicaRow) ||
      this.repository.getReplaceTargetReplicaId(operation) ||
      (typeof operation?.replicaId === 'string' &&
      operation.replicaId.length > 0 ?
        operation.replicaId :
        null);
    const replacementRoleState =
      this.getPriorityPublicationReplacementRoleState(replacementReplicaRow);
    const rawReplacementNodeId =
      typeof replacementReplicaRow?.node_id === 'string' ?
        replacementReplicaRow.node_id.trim() :
        typeof operation?.targetNodeId === 'string' ?
          operation.targetNodeId.trim() :
          null;
    const replacementNodeId =
      rawReplacementNodeId && rawReplacementNodeId.length > 0 ?
        rawReplacementNodeId :
        null;
    const sourceLeadershipReleaseObserved =
      sourceRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;
    const partitionLeaderMovedAwayFromSource =
      partitionLeaderNodeId !== null &&
      (sourceNodeId === null || partitionLeaderNodeId !== sourceNodeId);
    const partitionLeaderStillSource =
      partitionLeaderNodeId !== null &&
      sourceNodeId !== null &&
      partitionLeaderNodeId === sourceNodeId;
    const coLocatedLeaderSiblingObserved =
      this.hasCoLocatedLeaderSiblingEvidence(
        sourceReplicaId,
        sourceNodeId,
        observedSourceRoleState,
        options.currentVoterReadyRows,
      );
    const replacementLeaderOwnershipObserved =
      replacementRoleState === PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER ||
      (replacementNodeId !== null &&
        partitionLeaderMovedAwayFromSource &&
        partitionLeaderNodeId === replacementNodeId);
    const sourceLeadershipReleaseHasCanonicalSuccessor =
      sourceLeadershipReleaseObserved &&
      partitionLeaderMovedAwayFromSource;
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
        coLocatedLeaderSiblingObserved,
        sourceLeadershipReleaseObserved,
      }));
    const priorityRecoveryFollowerSourceRemovalSafe =
      followerSourceRemovalSafety.state ===
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.SAFE;
    const sourceRemovalLeadershipSafe =
      sourceReplicaRemoved ||
      sourceLeadershipReleaseHasCanonicalSuccessor ||
      replacementLeaderOwnershipObserved ||
      priorityRecoveryFollowerSourceRemovalSafe;
    const publicationStatus =
      this.normalizePriorityPublicationStatus(planningSnapshot);
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
          replacementLeaderOwnershipObserved,
          sourceLeadershipReleaseObserved,
          coLocatedLeaderSiblingObserved,
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
        priorityRecoveryFollowerSourceRemovalSafe,
        publicationPartitionId,
        publicationStatus,
      });
    }

    // A partition REPLACE's leadership is decided by its named-target handoff
    // (the REPLACE owner, priority-publication-handoff.js); the per-leg
    // handoff answers and their evidence maps are deleted (fix-f1, section 9).
    return Object.freeze({
      state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.LEADERSHIP_PENDING,
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
      priorityRecoveryFollowerSourceRemovalSafe,
      publicationPartitionId,
      publicationStatus,
    });
  }
}

export {PriorityPublicationLeaderSafety};
