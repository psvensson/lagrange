/**
 * Learner-promotion progress-proof contract (quest
 * learner-promotion-progress-proof): decision-table tests for the two pure
 * halves of the proof — the leader-side evaluator and the learner-side
 * response validator. Every refusal is typed; the proof is bound to
 * (leader, term, membership epoch) and any drift fails closed. Channel-level
 * refusals additionally carry a typed cause (quest
 * learner-promotion-proof-channel-wake); the evaluated proof shape is
 * frozen and unchanged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
  evaluateLearnerPromotionProof,
  refuseLearnerPromotionProof,
  validateLearnerPromotionProofResponse,
} from '../../src/raft/learner-promotion-progress.js';

const TERM = 3;
const EPOCH = 2;
const COMMITTED_INDEX = 10;
const CAUGHT_UP_MATCH = 10;
const LAGGING_MATCH = 9;
const LEADER_ID = 'replica-1';
const OTHER_LEADER_ID = 'replica-9';
// The frozen evaluated-proof shape (no cause key) and the channel-refusal
// shape (the same keys plus the typed cause).
const EVALUATED_PROOF_KEYS = [
  'decision', 'reason', 'term', 'membershipEpoch', 'safePromotionIndex',
  'learnerMatchIndex',
];
const CHANNEL_REFUSAL_KEYS = [...EVALUATED_PROOF_KEYS, 'cause'];
const REQUEST_INVALID_CAUSES = [
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.REQUEST_SHAPE,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.RESPONSE_BINDING_MISMATCH,
];
const TRANSPORT_FAILED_CAUSES = [
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEADER_UNREACHABLE,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.DELIVERY_FAILED,
];

function leaderFacts(overrides = {}) {
  return {
    raftIsLeader: true,
    currentTerm: TERM,
    committedIndex: COMMITTED_INDEX,
    learnerMatchIndex: CAUGHT_UP_MATCH,
    leaderMembershipEpoch: EPOCH,
    learnerMembershipEpoch: EPOCH,
    ...overrides,
  };
}

function grantedProof(overrides = {}) {
  return evaluateLearnerPromotionProof(leaderFacts(overrides));
}

function learnerObservation(overrides = {}) {
  return {
    proof: grantedProof(),
    isPromotableLearner: true,
    requestedLeaderId: LEADER_ID,
    currentLeaderId: LEADER_ID,
    requestedMembershipEpoch: EPOCH,
    currentMembershipEpoch: EPOCH,
    localTerm: TERM,
    ...overrides,
  };
}

test('leader grants only a caught-up learner in a known term/epoch', async (t) => {
  const granted = grantedProof();
  t.equal(granted.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'caught-up learner is granted');
  t.equal(granted.reason, LEARNER_PROMOTION_PROOF_REASON.PROGRESS_PROVEN,
    'grant carries the typed reason');
  t.equal(granted.safePromotionIndex, COMMITTED_INDEX,
    'safe promotion index = leader committedIndex at proof time');
  t.equal(granted.term, TERM, 'proof is bound to the leader term');
  t.equal(granted.membershipEpoch, EPOCH, 'proof is bound to the epoch');
});

test('leader refusals are typed and fail-closed', async (t) => {
  const cases = [
    [{raftIsLeader: false}, LEARNER_PROMOTION_PROOF_REASON.NOT_LEADER,
      'a non-leader can never prove promotion'],
    [{currentTerm: null}, LEARNER_PROMOTION_PROOF_REASON.TERM_UNAVAILABLE,
      'an unknown term refuses'],
    [{leaderMembershipEpoch: null},
      LEARNER_PROMOTION_PROOF_REASON.EPOCH_UNAVAILABLE,
      'an unavailable leader epoch refuses'],
    [{learnerMembershipEpoch: EPOCH + 1},
      LEARNER_PROMOTION_PROOF_REASON.EPOCH_MISMATCH,
      'a membership-epoch mismatch refuses (membership change invalidates)'],
    [{learnerMatchIndex: LAGGING_MATCH},
      LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND,
      'a lagging learner is refused regardless of elapsed time'],
    [{learnerMatchIndex: null},
      LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND,
      'absent progress evidence reads as 0 - fail-closed'],
  ];
  for (const [overrides, reason, message] of cases) {
    const proof = grantedProof(overrides);
    t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED, message);
    t.equal(proof.reason, reason, `${message} (typed reason)`);
    t.same(Object.keys(proof), EVALUATED_PROOF_KEYS,
      `${message} (frozen evaluated shape, no channel cause)`);
  }
  t.same(Object.keys(grantedProof()), EVALUATED_PROOF_KEYS,
    'a granted proof keeps the frozen evaluated shape');
});

test('channel-level refusals carry a typed cause in the frozen shape', async (t) => {
  for (const cause of REQUEST_INVALID_CAUSES) {
    const proof = refuseLearnerPromotionProof(
      LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID, cause);
    t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
      `request_invalid/${cause} is a refusal`);
    t.equal(proof.cause, cause, `request_invalid carries cause ${cause}`);
    t.same(Object.keys(proof), CHANNEL_REFUSAL_KEYS,
      `request_invalid/${cause} has the channel-refusal shape`);
    t.ok(Object.isFrozen(proof), 'the channel refusal is frozen');
  }
  for (const cause of TRANSPORT_FAILED_CAUSES) {
    const proof = refuseLearnerPromotionProof(
      LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED, cause);
    t.equal(proof.reason, LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
      `proof_transport_failed/${cause} keeps its reason`);
    t.equal(proof.cause, cause, `proof_transport_failed carries cause ${cause}`);
  }
  const validation = validateLearnerPromotionProofResponse(
    learnerObservation({
      proof: refuseLearnerPromotionProof(
        LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE),
    }),
  );
  t.equal(validation.accepted, false, 'a channel refusal never promotes');
  t.equal(validation.proofCause,
    LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
    'the learner-side validation surfaces the typed cause');
  t.equal(validateLearnerPromotionProofResponse(learnerObservation()).proofCause,
    null, 'an evaluated proof has no channel cause to surface');
});

test('empty committed prefix grants trivially without ack evidence', async (t) => {
  // Formation case: a learner joining a group with nothing committed has
  // nothing to apply; the proof grants immediately (this is what lets a
  // formation ADD promote in about one retry tick instead of 30s).
  const proof = grantedProof({committedIndex: 0, learnerMatchIndex: null});
  t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'nothing committed means nothing to prove behind');
  t.equal(proof.safePromotionIndex, 0, 'safe index is the empty prefix');
});

test('bootstrap leader at term 0 can still prove promotion', async (t) => {
  const proof = grantedProof({currentTerm: 0, committedIndex: 0,
    learnerMatchIndex: null});
  t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
    'term 0 is a legitimate live term for a never-elected bootstrap leader');
});

test('learner accepts only a fresh, matching grant', async (t) => {
  const validation = validateLearnerPromotionProofResponse(
    learnerObservation(),
  );
  t.equal(validation.accepted, true, 'matching grant is accepted');
  t.equal(validation.reason,
    LEARNER_PROMOTION_PROOF_REASON.PROOF_ACCEPTED,
    'acceptance carries the typed reason');
});

test('learner-side validation refusals are typed and fail-closed', async (t) => {
  const cases = [
    [{isPromotableLearner: false},
      LEARNER_PROMOTION_PROOF_REASON.ROLE_NOT_LEARNER,
      'a replica that is no longer a learner (or shut down) never promotes'],
    [{proof: grantedProof({learnerMatchIndex: LAGGING_MATCH})},
      LEARNER_PROMOTION_PROOF_REASON.PROOF_NOT_GRANTED,
      'a refused proof never promotes'],
    [{proof: refuseLearnerPromotionProof(
      LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.DELIVERY_FAILED)},
    LEARNER_PROMOTION_PROOF_REASON.PROOF_NOT_GRANTED,
    'a channel refusal never promotes'],
    [{proof: null}, LEARNER_PROMOTION_PROOF_REASON.PROOF_NOT_GRANTED,
      'a missing response never promotes'],
    [{currentLeaderId: OTHER_LEADER_ID},
      LEARNER_PROMOTION_PROOF_REASON.LEADER_CHANGED,
      'a leader change across the round trip invalidates the proof'],
    [{requestedLeaderId: null, currentLeaderId: null},
      LEARNER_PROMOTION_PROOF_REASON.LEADER_CHANGED,
      'an unknown leader identity never promotes'],
    [{currentMembershipEpoch: EPOCH + 1},
      LEARNER_PROMOTION_PROOF_REASON.EPOCH_CHANGED,
      'a membership-epoch change across the round trip invalidates'],
    [{proof: grantedProof({leaderMembershipEpoch: EPOCH + 1,
      learnerMembershipEpoch: EPOCH + 1})},
    LEARNER_PROMOTION_PROOF_REASON.EPOCH_CHANGED,
    'a proof minted for a different epoch than observed invalidates'],
    [{localTerm: TERM + 1},
      LEARNER_PROMOTION_PROOF_REASON.STALE_PROOF_TERM,
      'a proof from a term behind the learner is a stale leader - refused'],
  ];
  for (const [overrides, reason, message] of cases) {
    const validation = validateLearnerPromotionProofResponse(
      learnerObservation(overrides),
    );
    t.equal(validation.accepted, false, message);
    t.equal(validation.reason, reason, `${message} (typed reason)`);
  }
});

test('a learner-supplied index is not part of the grant predicate', async (t) => {
  // The request payload carries no index at all; the evaluator's only
  // progress input is the leader's own observation. A learner claiming a
  // future index has no seam to inject it — asserted here by contract: the
  // evaluator grants/refuses purely on leader-observed learnerMatchIndex.
  const lyingLearnerFacts = leaderFacts({learnerMatchIndex: LAGGING_MATCH});
  const proof = evaluateLearnerPromotionProof({
    ...lyingLearnerFacts,
    selfReportedIndex: COMMITTED_INDEX + 100,
  });
  t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
    'unknown request fields never influence the decision');
  t.equal(proof.reason, LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND,
    'the leader-observed match index is the only progress input');
});
