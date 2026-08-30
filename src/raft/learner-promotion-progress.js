/**
 * Learner-promotion progress proof (quest learner-promotion-progress-proof).
 *
 * A partition learner becomes a voter only after the CURRENT leader proves
 * the learner has applied through a safe promotion index for the current
 * term and membership epoch. This module is the raft-layer half of that
 * contract: two pure decision functions over gathered facts.
 *
 * - `evaluateLearnerPromotionProof` runs on the LEADER: grant iff this node
 *   is the live leader in a known term, both sides observe the same
 *   membership epoch, and the leader-observed match index for the learner
 *   (its acked replication progress this tenure — see
 *   `readFollowerMatchIndex` in liferaft.js) has reached the safe promotion
 *   index, defined as the leader's committedIndex at proof-evaluation time.
 *   The committed prefix is exactly what a correct voter must hold so that
 *   counting its vote can never roll back a committed entry (Raft election
 *   restriction; the fixed-target-per-round shape of Raft §4.2.1 catch-up;
 *   the same Match-vs-leader-progress predicate etcd uses for learner
 *   promotion). The learner never self-reports an index into the grant
 *   predicate — the leader's own observation is the only progress source.
 *   Snapshot-installed learners satisfy the identical predicate through
 *   their post-install acks: one progress contract.
 *
 * - `validateLearnerPromotionProofResponse` runs on the LEARNER after the
 *   proof round trip: fail-closed refusal when the proof was not granted,
 *   the discovered leader changed, the membership epoch moved, the proof
 *   term is behind the learner's own term (stale leader), or the local
 *   replica is no longer a promotable learner (shutdown/restart — proof
 *   state is never persisted, so a restart re-derives from scratch).
 *
 * Time appears nowhere here: elapsed time is only the caller's retry
 * cadence for re-requesting a proof.
 */

const PROGRESS_PROOF_NUMERIC_ZERO = 0;

const LEARNER_PROMOTION_PROOF_DECISION = Object.freeze({
  GRANTED: 'granted',
  REFUSED: 'refused',
});

const LEARNER_PROMOTION_PROOF_REASON = Object.freeze({
  // Leader-side refusals (evaluateLearnerPromotionProof)
  NOT_LEADER: 'not_leader',
  TERM_UNAVAILABLE: 'term_unavailable',
  EPOCH_UNAVAILABLE: 'epoch_unavailable',
  EPOCH_MISMATCH: 'epoch_mismatch',
  PROGRESS_BEHIND: 'progress_behind',
  PROGRESS_PROVEN: 'progress_proven',
  // Channel-level refusals (minted by the promotion owner around the RPC)
  REQUEST_INVALID: 'request_invalid',
  TRANSPORT_FAILED: 'proof_transport_failed',
  // Learner-side refusals (validateLearnerPromotionProofResponse)
  ROLE_NOT_LEARNER: 'role_not_learner',
  PROOF_NOT_GRANTED: 'proof_not_granted',
  LEADER_CHANGED: 'leader_changed',
  EPOCH_CHANGED: 'epoch_changed',
  STALE_PROOF_TERM: 'stale_proof_term',
  PROOF_ACCEPTED: 'proof_accepted',
});

// Typed cause carried by every channel-level refusal (quest
// learner-promotion-proof-channel-wake): the leader's and the learner's
// mints of one reason are distinguishable, so the learner can react to
// the cause (re-assert its services row) instead of blind re-polling.
const LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE = Object.freeze({
  // REQUEST_INVALID
  LEARNER_ADDRESS_UNRESOLVABLE: 'learner_address_unresolvable',
  REQUEST_SHAPE: 'request_shape',
  RESPONSE_BINDING_MISMATCH: 'response_binding_mismatch',
  // TRANSPORT_FAILED
  LEADER_UNREACHABLE: 'leader_unreachable',
  DELIVERY_FAILED: 'delivery_failed',
});

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= PROGRESS_PROOF_NUMERIC_ZERO;
}

function refusedProof(reason, facts = {}) {
  return Object.freeze({
    decision: LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    reason,
    term: isNonNegativeInteger(facts.currentTerm) ? facts.currentTerm : null,
    membershipEpoch: isNonNegativeInteger(facts.leaderMembershipEpoch) ?
      facts.leaderMembershipEpoch :
      null,
    safePromotionIndex: isNonNegativeInteger(facts.safePromotionIndex) ?
      facts.safePromotionIndex :
      null,
    learnerMatchIndex: isNonNegativeInteger(facts.learnerMatchIndex) ?
      facts.learnerMatchIndex :
      null,
  });
}

/**
 * Mint a typed refused proof outside the fact-evaluation table (malformed
 * request, transport failure). Same frozen shape as an evaluated refusal
 * plus the typed channel cause, so every consumer sees one proof grammar
 * and can tell WHICH side refused and why.
 * @param {string} reason LEARNER_PROMOTION_PROOF_REASON member
 * @param {string} cause LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE member
 * @return {Object} frozen refused proof
 */
function refuseLearnerPromotionProof(reason, cause) {
  return Object.freeze({...refusedProof(reason), cause});
}

/**
 * Leader-side proof evaluation over gathered facts. Single decision table;
 * every exit is a typed frozen outcome.
 * @param {Object} facts
 * @param {boolean} facts.raftIsLeader this node's live raft state is LEADER
 * @param {number} facts.currentTerm leader's current term (positive int)
 * @param {number} facts.committedIndex leader's committed index at proof
 *   time (the safe promotion index)
 * @param {number} facts.learnerMatchIndex leader-observed acked index for
 *   the learner this tenure (0 when no ack observed — fail-closed)
 * @param {number} facts.leaderMembershipEpoch leader-observed membership
 *   epoch (non-negative int; 0 at bootstrap)
 * @param {number} facts.learnerMembershipEpoch learner-observed membership
 *   epoch carried on the request
 * @return {Object} frozen proof outcome
 */
function evaluateLearnerPromotionProof(facts = {}) {
  if (facts.raftIsLeader !== true) {
    return refusedProof(LEARNER_PROMOTION_PROOF_REASON.NOT_LEADER, facts);
  }
  // Term 0 is a legitimate live term for a bootstrap leader that has never
  // run an election (single-replica formation before expansion), so the
  // binding is non-negative, not positive.
  if (!isNonNegativeInteger(facts.currentTerm)) {
    return refusedProof(LEARNER_PROMOTION_PROOF_REASON.TERM_UNAVAILABLE, facts);
  }
  if (
    !isNonNegativeInteger(facts.leaderMembershipEpoch) ||
    !isNonNegativeInteger(facts.learnerMembershipEpoch)
  ) {
    return refusedProof(
      LEARNER_PROMOTION_PROOF_REASON.EPOCH_UNAVAILABLE,
      facts,
    );
  }
  if (facts.leaderMembershipEpoch !== facts.learnerMembershipEpoch) {
    return refusedProof(LEARNER_PROMOTION_PROOF_REASON.EPOCH_MISMATCH, facts);
  }
  const safePromotionIndex = isNonNegativeInteger(facts.committedIndex) ?
    facts.committedIndex :
    PROGRESS_PROOF_NUMERIC_ZERO;
  const learnerMatchIndex = isNonNegativeInteger(facts.learnerMatchIndex) ?
    facts.learnerMatchIndex :
    PROGRESS_PROOF_NUMERIC_ZERO;
  if (learnerMatchIndex < safePromotionIndex) {
    return refusedProof(LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND, {
      ...facts,
      safePromotionIndex,
      learnerMatchIndex,
    });
  }
  return Object.freeze({
    decision: LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    reason: LEARNER_PROMOTION_PROOF_REASON.PROGRESS_PROVEN,
    term: facts.currentTerm,
    membershipEpoch: facts.leaderMembershipEpoch,
    safePromotionIndex,
    learnerMatchIndex,
  });
}

function validationOutcome(accepted, reason, proof) {
  return Object.freeze({
    accepted,
    reason,
    proofReason: proof && typeof proof.reason === 'string' ?
      proof.reason :
      null,
    proofCause: proof && typeof proof.cause === 'string' ?
      proof.cause :
      null,
  });
}

function normalizeLocalTerm(localTerm) {
  return isNonNegativeInteger(localTerm) ?
    localTerm :
    PROGRESS_PROOF_NUMERIC_ZERO;
}

// Learner-side validation decision table, evaluated in order; the first
// violated rule names the typed refusal. Rules after PROOF_NOT_GRANTED may
// assume a granted proof object.
const PROOF_RESPONSE_VALIDATION_RULES = Object.freeze([
  Object.freeze({
    reason: LEARNER_PROMOTION_PROOF_REASON.ROLE_NOT_LEARNER,
    violated: (observation) => observation.isPromotableLearner !== true,
  }),
  Object.freeze({
    reason: LEARNER_PROMOTION_PROOF_REASON.PROOF_NOT_GRANTED,
    violated: (observation) =>
      observation.proof?.decision !==
        LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
  }),
  Object.freeze({
    reason: LEARNER_PROMOTION_PROOF_REASON.LEADER_CHANGED,
    violated: (observation) =>
      typeof observation.requestedLeaderId !== 'string' ||
      observation.requestedLeaderId.length === PROGRESS_PROOF_NUMERIC_ZERO ||
      observation.currentLeaderId !== observation.requestedLeaderId,
  }),
  Object.freeze({
    reason: LEARNER_PROMOTION_PROOF_REASON.EPOCH_CHANGED,
    violated: (observation) =>
      !isNonNegativeInteger(observation.requestedMembershipEpoch) ||
      observation.currentMembershipEpoch !==
        observation.requestedMembershipEpoch ||
      observation.proof.membershipEpoch !==
        observation.currentMembershipEpoch,
  }),
  Object.freeze({
    reason: LEARNER_PROMOTION_PROOF_REASON.STALE_PROOF_TERM,
    violated: (observation) =>
      !isNonNegativeInteger(observation.proof.term) ||
      observation.proof.term < normalizeLocalTerm(observation.localTerm),
  }),
]);

/**
 * Learner-side fail-closed validation of a proof response after the round
 * trip. Any drift between the observation the request was minted under and
 * the observation at receipt refuses; the caller reschedules on its retry
 * cadence.
 * @param {Object} observation
 * @param {Object|null} observation.proof the leader's response proof
 * @param {boolean} observation.isPromotableLearner local role is still a
 *   catch-up learner and the service is not shut down
 * @param {string|null} observation.requestedLeaderId leader the proof was
 *   requested from
 * @param {string|null} observation.currentLeaderId leader observed at
 *   receipt
 * @param {number} observation.requestedMembershipEpoch epoch observed when
 *   the request was minted
 * @param {number} observation.currentMembershipEpoch epoch observed at
 *   receipt
 * @param {number} observation.localTerm learner's current raft term (0 when
 *   unavailable)
 * @return {Object} frozen {accepted, reason, proofReason, proofCause}
 */
function validateLearnerPromotionProofResponse(observation = {}) {
  const violatedRule = PROOF_RESPONSE_VALIDATION_RULES.find((rule) =>
    rule.violated(observation),
  );
  return validationOutcome(
    !violatedRule,
    violatedRule ?
      violatedRule.reason :
      LEARNER_PROMOTION_PROOF_REASON.PROOF_ACCEPTED,
    observation.proof,
  );
}

export {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
  evaluateLearnerPromotionProof,
  refuseLearnerPromotionProof,
  validateLearnerPromotionProofResponse,
};
