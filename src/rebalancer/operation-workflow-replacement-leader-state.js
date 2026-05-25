import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  ReplicaOperationResponseStatus,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE =
  Object.freeze({
    USE_FALLBACK: 'use_fallback',
    USE_CONFIRMED_EVIDENCE: 'use_confirmed_evidence',
    RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP:
      'retarget_after_completed_without_ownership',
    RETARGET_AFTER_NOT_FOUND: 'retarget_after_not_found',
  });

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION =
  Object.freeze({
    USE_FALLBACK: 'use_fallback',
    USE_EVIDENCE: 'use_evidence',
    RETARGET: 'retarget',
  });

const PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION_BY_STATE =
  Object.freeze(
    new Map([
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_FALLBACK,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .USE_CONFIRMED_EVIDENCE,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_EVIDENCE,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET,
      ],
      [
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
          .RETARGET_AFTER_NOT_FOUND,
        PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.RETARGET,
      ],
    ]),
  );

/**
 * Resolve priority publication replacement leader candidate state.
 * @param {Object} options
 * @returns {string}
 */
function resolvePriorityPublicationReplacementLeaderCandidateState(options = {}) {
  if (!options.electionEvidence) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
    );
  }
  if (
    options.notFoundReplicaIds?.has(options.normalizedReplacementReplicaId) &&
    !options.replacementOwnershipObserved
  ) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
        .RETARGET_AFTER_NOT_FOUND
    );
  }
  if (
    options.electionEvidence.responseStatus ===
      ReplicaOperationResponseStatus.COMPLETED &&
    options.evidenceCandidateRow &&
    options.evidenceCandidateOwnershipObserved
  ) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
        .USE_CONFIRMED_EVIDENCE
    );
  }
  if (options.electionRetrySuppressed) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
    );
  }
  if (
    options.electionEvidence.responseStatus ===
      ReplicaOperationResponseStatus.COMPLETED &&
    options.evidenceCandidateRow &&
    !options.evidenceCandidateOwnershipObserved
  ) {
    return (
      PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE
        .RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP
    );
  }
  return (
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE.USE_FALLBACK
  );
}

/**
 * Resolve priority publication replacement leader candidate action.
 * @param {string} state
 * @returns {string}
 */
function resolvePriorityPublicationReplacementLeaderCandidateAction(state) {
  return (
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION_BY_STATE.get(
      state,
    ) ||
    PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION.USE_FALLBACK
  );
}

/**
 * Resolve priority publication completed without ownership replica IDs.
 * @param {Object} electionEvidence
 * @param {Object[]} candidateRows
 * @param {Function} hasReplacementLeaderOwnership
 * @param {Function} getReplicaRowIdentity
 * @returns {Set<string>}
 */
function resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds(
  electionEvidence,
  candidateRows,
  hasReplacementLeaderOwnership,
  getReplicaRowIdentity,
) {
  const completedReplicaIds = Array.isArray(
    electionEvidence?.completedReplicaIds,
  ) ?
    electionEvidence.completedReplicaIds :
    [];
  return new Set(
    completedReplicaIds.filter((replicaId) => {
      const row =
        candidateRows.find(
          (candidateRow) =>
            getReplicaRowIdentity(candidateRow) === replicaId,
        ) || null;
      return !hasReplacementLeaderOwnership(row);
    }),
  );
}

export {
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_STATE,
  PRIORITY_PUBLICATION_REPLACEMENT_LEADER_CANDIDATE_ACTION,
  resolvePriorityPublicationReplacementLeaderCandidateState,
  resolvePriorityPublicationReplacementLeaderCandidateAction,
  resolvePriorityPublicationCompletedWithoutOwnershipReplicaIds,
};
