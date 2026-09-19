/**
 * The learner-side count check of the promotion guard: would promoting this
 * learner stay within the partition's replica target?
 *
 * This is the arithmetic the nightly formation failures refuse on
 * (`would_exceed_target_replica_count` with `maxAllowedVotersAfterPromotion`
 * 4). It is extracted here unchanged so the guard can log the inputs the
 * decision was made on from the ONE evaluation that decided: the evaluation
 * returns its own intermediate states, so nothing downstream re-derives them
 * (quest learner-promotion-guard-inputs-observed).
 *
 * The cap is `target + (one replacement or single-voter expansion) + the
 * priority-recovery temporary overflow budget`. The budget is the
 * priority-recovery completion owner's
 * (`src/control-plane/priority-recovery-completion.js`); this module only
 * spends it.
 */

const LEARNER_PROMOTION_COUNT_CHECK_REFUSAL = Object.freeze({
  WOULD_EXCEED_TARGET_REPLICA_COUNT: 'would_exceed_target_replica_count',
  WOULD_CAUSE_EVEN_VOTER_COUNT: 'would_cause_even_voter_count',
  // The named "not refused" state: the reason field is never an absent value.
  NOT_REFUSED: 'not_refused',
});

const NO_ADDITIONAL_VOTERS_ALLOWED = 0;
const ONE_REPLACEMENT_VOTER_ALLOWED = 1;

function resolveReplacementPromotionAllowed(inputs) {
  const singleReplacementPromotionAllowed =
    (inputs.isJoiningExistingGroup === true ||
      inputs.hasOwnedAddLikeOperation) &&
    inputs.learnerCount === 1 &&
    inputs.activeVoterCount >= inputs.targetReplicaCount;
  const operationOwnedCriticalReplacementPromotionAllowed =
    inputs.isCriticalSystemPartition &&
    inputs.hasOwnedAddLikeOperation &&
    inputs.activeVoterCount >= inputs.targetReplicaCount;
  return (
    singleReplacementPromotionAllowed ||
    operationOwnedCriticalReplacementPromotionAllowed
  );
}

// The three promotion allowances, and the overflow votes the
// priority-recovery completion owner granted: one replacement voter above
// target, a single-voter expansion for a joining learner, and the temporary
// overflow budget. A non-critical partition never carries the budget.
function resolvePromotionAllowances(inputs) {
  const priorityRecoveryAdditionalVotersAllowed =
    inputs.isCriticalSystemPartition &&
    Number.isFinite(inputs.temporaryOverflowVoterBudget) ?
      inputs.temporaryOverflowVoterBudget :
      NO_ADDITIONAL_VOTERS_ALLOWED;
  return {
    replacement: resolveReplacementPromotionAllowed(inputs),
    singleVoterExpansion:
      inputs.isJoiningExistingGroup === true &&
      inputs.learnerCount === 1 &&
      inputs.activeVoterCount === 1,
    priorityRecoveryOverflow:
      priorityRecoveryAdditionalVotersAllowed > NO_ADDITIONAL_VOTERS_ALLOWED,
    additionalVoters: priorityRecoveryAdditionalVotersAllowed,
  };
}

// Promoting every pending learner at once would reach an odd voter count that
// still fits the target: the escape from the even-count gate that needs no
// allowance.
function resolveAllLearnersFit(inputs) {
  const votersAfterAllLearners = inputs.activeVoterCount + inputs.learnerCount;
  return {
    votersAfterAllLearners,
    allLearnersWouldBeOdd: votersAfterAllLearners % 2 === 1,
    allLearnersWithinTarget:
      votersAfterAllLearners <= inputs.targetReplicaCount,
  };
}

// The refusal itself: exceeding the cap first, then the even-voter gate that
// any allowance (or an all-learners odd fit) opens.
function resolveCountCheckRefusal(
  wouldExceedTargetReplicaCount,
  wouldBeEven,
  allowances,
  allLearners,
) {
  const anyAllowance =
    allowances.replacement ||
    allowances.singleVoterExpansion ||
    allowances.priorityRecoveryOverflow;
  const allLearnersFitOddWithinTarget =
    allLearners.allLearnersWouldBeOdd && allLearners.allLearnersWithinTarget;
  const refusalReason = wouldExceedTargetReplicaCount ?
    LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.WOULD_EXCEED_TARGET_REPLICA_COUNT :
    wouldBeEven && !anyAllowance && !allLearnersFitOddWithinTarget ?
      LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.WOULD_CAUSE_EVEN_VOTER_COUNT :
      LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.NOT_REFUSED;
  return {
    refused:
      refusalReason !== LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.NOT_REFUSED,
    refusalReason,
  };
}

/**
 * Evaluate the count check once, and return the decision together with every
 * intermediate state the decision rests on.
 *
 * @param {Object} inputs - The decided-on inputs.
 * @param {number} inputs.targetReplicaCount - Desired RF, 0 when undeclared.
 * @param {number} inputs.activeVoterCount - Voters after the local-row
 *   correction.
 * @param {number} inputs.learnerCount - Learners after the same correction.
 * @param {boolean} inputs.isJoiningExistingGroup - The joining flag.
 * @param {boolean} inputs.hasOwnedAddLikeOperation - This learner owns an
 *   in-flight ADD-like replica operation.
 * @param {boolean} inputs.isCriticalSystemPartition - Bootstrap-critical.
 * @param {number|undefined} inputs.temporaryOverflowVoterBudget - The
 *   priority-recovery completion owner's budget, absent when not evaluated.
 * @return {Object} Frozen decision record.
 */
function evaluateLearnerPromotionCountCheck(inputs = {}) {
  const allowances = resolvePromotionAllowances(inputs);
  const maxAllowedVotersAfterPromotion =
    inputs.targetReplicaCount +
    (allowances.replacement || allowances.singleVoterExpansion ?
      ONE_REPLACEMENT_VOTER_ALLOWED :
      NO_ADDITIONAL_VOTERS_ALLOWED) +
    allowances.additionalVoters;
  const votersAfterPromotion = inputs.activeVoterCount + 1;
  const wouldExceedTargetReplicaCount =
    votersAfterPromotion > maxAllowedVotersAfterPromotion;
  const wouldBeEven = votersAfterPromotion % 2 === 0;
  const allLearners = resolveAllLearnersFit(inputs);
  const refusal = resolveCountCheckRefusal(
    wouldExceedTargetReplicaCount,
    wouldBeEven,
    allowances,
    allLearners,
  );
  return Object.freeze({
    allowances: Object.freeze({
      replacement: allowances.replacement,
      singleVoterExpansion: allowances.singleVoterExpansion,
      priorityRecoveryOverflow: allowances.priorityRecoveryOverflow,
    }),
    priorityRecoveryAdditionalVotersAllowed: allowances.additionalVoters,
    maxAllowedVotersAfterPromotion,
    votersAfterPromotion,
    wouldExceedTargetReplicaCount,
    wouldBeEven,
    votersAfterAllLearners: allLearners.votersAfterAllLearners,
    allLearnersWouldBeOdd: allLearners.allLearnersWouldBeOdd,
    allLearnersWithinTarget: allLearners.allLearnersWithinTarget,
    refused: refusal.refused,
    refusalReason: refusal.refusalReason,
  });
}

export {
  LEARNER_PROMOTION_COUNT_CHECK_REFUSAL,
  evaluateLearnerPromotionCountCheck,
};
