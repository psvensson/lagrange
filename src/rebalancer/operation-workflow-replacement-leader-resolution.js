import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  resolvePriorityPublicationReplacementLeaderCandidateState,
  resolvePriorityPublicationReplacementLeaderCandidateAction,
  resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds,
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION,
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE,
} from './operation-workflow-replacement-leader-state.js';

const {
  OperationType,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Checks if there is a replacement leader retarget candidate after not found.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object[]} currentVoterReadyRows
 * @param {string|null} operationReplicaId
 * @param {Object|null} replacementReplicaRow
 * @returns {boolean}
 */
function hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound(
  context,
  operation,
  currentVoterReadyRows,
  operationReplicaId,
  replacementReplicaRow,
) {
  if (
    !operation ||
    operation.type !== OperationType.REPLACE ||
    !context.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId)
  ) {
    return false;
  }
  const currentReplacementReplicaId =
    context.getReplicaRowIdentity(replacementReplicaRow) ||
    context.repository.getReplaceTargetReplicaId(operation) ||
    null;
  if (!currentReplacementReplicaId) {
    return false;
  }
  const sourceNodeId =
    typeof operation.sourceNodeId === 'string' ?
      operation.sourceNodeId.trim() :
      null;
  const normalizedOperationReplicaId =
    typeof operationReplicaId === 'string' ?
      operationReplicaId.trim() :
      null;
  const candidateRows = Array.isArray(currentVoterReadyRows) ?
    currentVoterReadyRows :
    [];
  const electionEvidence =
    context.getFreshPriorityPublicationReplacementLeaderElectionEvidence(
      operation,
    );
  const blockedReplicaIds = new Set(
    Array.isArray(electionEvidence?.notFoundReplicaIds) ?
      electionEvidence.notFoundReplicaIds :
      [],
  );
  const completedReplicaIds = Array.isArray(
    electionEvidence?.completedReplicaIds,
  ) ?
    electionEvidence.completedReplicaIds :
    [];
  for (const completedReplicaId of completedReplicaIds) {
    blockedReplicaIds.add(completedReplicaId);
  }
  blockedReplicaIds.add(currentReplacementReplicaId);
  return candidateRows.some((row) => {
    const rowReplicaId = context.getReplicaRowIdentity(row);
    const rowNodeId =
      typeof row?.node_id === 'string' ? row.node_id.trim() : null;
    return (
      rowReplicaId &&
      rowNodeId &&
      rowReplicaId !== normalizedOperationReplicaId &&
      !blockedReplicaIds.has(rowReplicaId) &&
      (!sourceNodeId || rowNodeId !== sourceNodeId)
    );
  });
}

/**
 * Resolves priority publication replacement leader candidate row.
 * @param {Object} context - Segment/Class context instance.
 * @param {Object} operation
 * @param {Object|null} replacementReplicaRow
 * @param {Object[]} currentVoterReadyRows
 * @param {string|null} operationReplicaId
 * @returns {Promise<Object|null>}
 */
async function resolvePriorityPublicationReplacementLeaderCandidateRow(
  context,
  operation,
  replacementReplicaRow,
  currentVoterReadyRows,
  operationReplicaId,
) {
  const fallbackReplacementReplicaRow = replacementReplicaRow || null;
  if (
    !operation ||
    operation.type !== OperationType.REPLACE ||
    !context.isReplaceSourceLeaderHandoffRequiredPartition(operation.partitionId)
  ) {
    return fallbackReplacementReplicaRow;
  }

  const replacementReplicaId =
    context.getReplicaRowIdentity(replacementReplicaRow) ||
    context.repository.getReplaceTargetReplicaId(operation) ||
    null;
  if (!replacementReplicaId) {
    return fallbackReplacementReplicaRow;
  }

  const electionEvidence =
    context.getFreshPriorityPublicationReplacementLeaderElectionEvidence(
      operation,
    );
  const electionRetrySuppressed =
    context.isPriorityPublicationLeaderHandoffRetrySuppressed(electionEvidence);
  if (!electionEvidence) {
    return fallbackReplacementReplicaRow;
  }

  const sourceNodeId =
    typeof operation.sourceNodeId === 'string' ?
      operation.sourceNodeId.trim() :
      null;
  const normalizedOperationReplicaId =
    typeof operationReplicaId === 'string' ?
      operationReplicaId.trim() :
      null;
  const normalizedReplacementReplicaId = replacementReplicaId.trim();
  const candidateRows = Array.isArray(currentVoterReadyRows) ?
    currentVoterReadyRows :
    [];
  const notFoundReplicaIds = new Set(
    Array.isArray(electionEvidence?.notFoundReplicaIds) ?
      electionEvidence.notFoundReplicaIds :
      [],
  );
  const partitionRow = await context.getCriticalPartitionRowForSafety(
    operation.partitionId,
  );
  const partitionLeaderNodeId =
    context.getCriticalPartitionLeaderNodeIdForSafety(partitionRow);
  const hasReplacementLeaderOwnership = (replicaRow) => {
    const replacementRoleState =
      context.getPriorityPublicationReplacementRoleState(replicaRow);
    const replacementNodeId =
      typeof replicaRow?.node_id === 'string' ?
        replicaRow.node_id.trim() :
        typeof operation.targetNodeId === 'string' ?
          operation.targetNodeId.trim() :
          null;
    return (
      replacementRoleState ===
        PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER ||
      (replacementNodeId !== null &&
        partitionLeaderNodeId === replacementNodeId)
    );
  };
  const replacementOwnershipObserved =
    hasReplacementLeaderOwnership(replacementReplicaRow);
  const getReplicaRowIdentity = (row) => context.getReplicaRowIdentity(row);
  const completedWithoutOwnershipReplicaIds =
    resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
      electionEvidence,
      candidateRows,
      hasReplacementLeaderOwnership,
      getReplicaRowIdentity,
    );
  const evidenceReplicaId =
    typeof electionEvidence?.replacementReplicaId === 'string' ?
      electionEvidence.replacementReplicaId.trim() :
      null;
  const isEligibleCandidateRow = (row, blockedReplicaIds) => {
    const rowReplicaId = context.getReplicaRowIdentity(row);
    const rowNodeId =
      typeof row?.node_id === 'string' ? row.node_id.trim() : null;
    return (
      rowReplicaId &&
      rowNodeId &&
      rowReplicaId !== normalizedOperationReplicaId &&
      !blockedReplicaIds.has(rowReplicaId) &&
      (!sourceNodeId || rowNodeId !== sourceNodeId)
    );
  };
  const findEligibleCandidateRow = (blockedReplicaIds) =>
    candidateRows.find((row) =>
      isEligibleCandidateRow(row, blockedReplicaIds),
    ) || null;
  const evidenceCandidateBlockedReplicaIds = new Set(
    [...notFoundReplicaIds].filter(
      (replicaId) => replicaId !== evidenceReplicaId,
    ),
  );

  const evidenceCandidateRow =
    evidenceReplicaId === null ?
      null :
      candidateRows.find(
        (row) =>
          context.getReplicaRowIdentity(row) === evidenceReplicaId &&
            isEligibleCandidateRow(row, evidenceCandidateBlockedReplicaIds),
      ) || null;
  const evidenceCandidateOwnershipObserved =
    hasReplacementLeaderOwnership(evidenceCandidateRow);
  const candidateState =
    resolvePriorityPublicationReplacementLeaderCandidateState({
      electionEvidence,
      electionRetrySuppressed,
      evidenceCandidateRow,
      evidenceCandidateOwnershipObserved,
      normalizedReplacementReplicaId,
      notFoundReplicaIds,
      replacementOwnershipObserved,
    });
  const candidateAction =
    resolvePriorityPublicationReplacementLeaderCandidateAction(
      candidateState,
    );
  if (
    candidateAction ===
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_EVIDENCE
  ) {
    return evidenceCandidateRow || fallbackReplacementReplicaRow;
  }
  if (
    candidateAction !==
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET
  ) {
    return fallbackReplacementReplicaRow;
  }
  const retargetBlockedReplicaIds = new Set([
    ...notFoundReplicaIds,
    ...completedWithoutOwnershipReplicaIds,
  ]);
  if (
    candidateState ===
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
      .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP &&
    evidenceReplicaId !== null
  ) {
    retargetBlockedReplicaIds.add(evidenceReplicaId);
  }
  return (
    findEligibleCandidateRow(retargetBlockedReplicaIds) ||
    fallbackReplacementReplicaRow
  );
}

export {
  hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound,
  resolvePriorityPublicationReplacementLeaderCandidateRow,
};
