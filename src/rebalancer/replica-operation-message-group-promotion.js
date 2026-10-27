/** Promotion of a recorded message-group learner to voter (FreshMG 6.C slice
 * C2), subordinate to ReplicaOperationRepository.
 *
 * Selection consumes positive evidence only. Trigger: the membership holder
 * asks to promote the recorded learner at the routed group leader. Facts, every
 * one read here: the authoritative row carrying the recorded learner fact (the
 * shared pure predicate) with UNKNOWN obligation, its lane held by no
 * unresolved attempt; the routed leader's queued learner-action read answering
 * COMMITTED with exactly the recorded learner's committed origin (its
 * reservation with that origin: the learner was legitimately committed there);
 * the group leader's caught-up acknowledgement, observed through the caller's
 * capability and judged by the shared exact decision
 * (raft/learner-catch-up-acknowledgement.js: the leader's committed answer and
 * status agree on one leader and term and hold the exact learner, its commit
 * and its match for the learner are exact integers with match >= commit > 0,
 * and the learner's own applied configuration generation equals the leader's),
 * with that leader's own term applied; the routed leader's canonical boot; the
 * live local holder. C1's registry-absence vouch is never a promotion
 * prerequisite: it only proves a fenced attempt noncommitted. Action: the
 * landed branch selection
 * (selectMessageGroupMembershipBranch) with a promotion permit at the next
 * sequence bound to that leader's term, configuration, lifecycle and runtime
 * fences; it re-checks the recorded fact, settlement, the exact prior permit,
 * the obligation, the holder and boot, and applies the one row CAS. RECORDED
 * is the durable promotion authorization, the J1 boundary (forward recovery
 * only from here). It is not a proposal, a voter, CREATE_ACTIVE or a lane
 * release: the native turn re-proves leadership, configuration and caught-up
 * progress atomically before it proposes
 * (raft-rs-membership-transition-runtime.js).
 *
 * Recording. The one recorder (recordMembershipActionOutcome) records the
 * promotion's exact outcome with the voter-stamp spec below. The queued action
 * read at a hosted witness answers COMMITTED when its applied configuration
 * names the target a voter under the transition's own learner origin; the
 * voter stamp is that same-read committed configuration and must be the
 * recorded learner configuration with exactly the target promoted. The three
 * receipt columns are the phase (VOTER_COMMITTED), the permit (committed, at
 * the configuration change that made the target a voter) and the voter
 * stamp. Ordinary history, the learner stamp, the holder, the lane and the
 * UNKNOWN obligation stay untouched: handoff, source removal, absence,
 * cleanup and reservation release are later owners.
 */
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {committedStampOfAnswer} from '../raft/raft-committed-membership-stamp.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../raft/raft-operation-port-constants.js';
import {decodeCommittedLearnerAdmission, encodeCommittedLearnerAdmission} from
  '../raft/raft-rs-committed-membership-context.js';
import {COMMITTED_LEARNER_ACTION_KIND as ACTION_KIND,
  COMMITTED_LEARNER_ACTION_REASON as ACTION_REASON} from
  '../raft/raft-committed-membership-constants.js';
import {LEARNER_CATCH_UP_ACKNOWLEDGEMENT as ACK} from '../raft/learner-promotion-progress.js';
import {learnerCatchUpAcknowledgement, namesExactLearner} from
  '../raft/learner-catch-up-acknowledgement.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {MEMBERSHIP_BRANCH, MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, decodeMembershipOwnerClaim,
  membershipOwnerClaimFence, encodeMembershipPermit, membershipActionPhases,
  membershipActionMatches} from './replica-operation-message-group-membership-permit.js';
import {observeMembershipOperation, membershipRowIdentityMatches,
  membershipClaimIsLocalAndLive} from './replica-operation-message-group-membership-owner-claim.js';
import {selectMessageGroupMembershipBranch, recordedLearnerCreateBasis, actionRecordingInput,
  recordMembershipActionOutcome, recordingInvocation, recordingSettlementAllowed,
  learnerObservationRefusal, learnerWitnessUnavailable, learnerOutcomeQuery} from
  './replica-operation-message-group-membership-authorization.js';
import {canonicalBootIncarnation} from './replica-operation-message-group-learner-successor.js';

// PROMOTION_IN_FLIGHT while the outcome is owed, VOTER_COMMITTED once recorded.
const PROMOTION = membershipActionPhases(STAGE.PROMOTE);
const VOTER_RECEIPT_SET = 'message_group_membership_phase = ?, ' +
  'message_group_membership_permit = ?, message_group_voter_stamp = ?';
const result = (outcome, operation = null) => Object.freeze({outcome, operation});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

// The transition's promotion of its exact target, at any attempt sequence (the
// selected attempt or an ordered successor of it). Pure.
function promotionActionMatches(permit, identity) {
  return membershipActionMatches(permit, identity, STAGE.PROMOTE);
}
// A committed stamp from its recorded encoding, or null.
function recordedStamp(encoded) {
  try {
    return committedStampOfAnswer(JSON.parse(encoded));
  } catch {
    return null;
  }
}
function sameMembers(left, right) {
  return left.length === right.length && right.every((peer) => left.includes(peer));
}
// The row's recorded learner stamp as this transition's learner configuration
// (the exact learner target and the source a voter; a validated committed
// stamp maps every member to the identity its peer id derives from,
// raft-committed-membership-stamp.js), or null. The learner recorder validated
// it when it wrote it; the voter stamp is judged against it, so it is judged
// again here, never trusted as a column.
function learnerConfigurationOf(row, identity) {
  const learner = recordedStamp(row.messageGroupLearnerStamp);
  return learner !== null && namesExactLearner(learner, identity) &&
    learner.voters.includes(deriveRaftRsPeerId(identity.sourceReplicaId)) ? learner : null;
}
// The voter configuration is the recorded learner configuration with exactly
// the target promoted (the voters are the learner configuration's plus the
// target, the learners its learners minus the target: the target and the
// source are voters under their own identities because the learner
// configuration held them so and the stamp validator binds identities), and
// the configuration changed after the promotion was anchored, in a term at or
// past the attempt's.
function voterStampFollows(stamp, learner, identity, permit) {
  const target = identity.targetPeerId;
  return sameMembers(stamp.voters, [...learner.voters, target]) &&
    sameMembers(stamp.learners, learner.learners.filter((peer) => peer !== target)) &&
    stamp.membershipGenerationIndex > permit.leaderConfigurationStamp.membershipGenerationIndex &&
    stamp.term >= permit.leaderTerm;
}
// The row's promotion permit of this transition, canonically encoded, on a
// VOTER_COMMITTED row with no removal stamp, or null. That it is COMMITTED is
// the fact predicate's: the permit codec admits a proposal index only on a
// COMMITTED permit, and the fact binds the voter stamp's generation to it.
function recordedVoterPermit(row, identity, encodedIdentity) {
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  return permit !== null && membershipRowIdentityMatches(row, identity, encodedIdentity) &&
    row.messageGroupMembershipPhase === PROMOTION.committed &&
    promotionActionMatches(permit, identity) && row.messageGroupRemovalStamp === null &&
    row.messageGroupMembershipPermit === JSON.stringify(permit) ? permit : null;
}
/** The one validity predicate of a recorded voter fact, shared by the voter
 * recorder's exact replay and readback and by the later stages that consume
 * the fact: a committed promotion permit of this transition and a canonical
 * voter stamp that is the recorded learner configuration with exactly the
 * target promoted, at the permit's proposal index. Pure: no claim, lease,
 * boot or clock read. */
function recordedVoterFactIsValid(row, identity, encodedIdentity) {
  const permit = recordedVoterPermit(row, identity, encodedIdentity);
  const learner = permit === null ? null : learnerConfigurationOf(row, identity);
  const voter = learner === null ? null : recordedStamp(row.messageGroupVoterStamp);
  return voter !== null && row.messageGroupVoterStamp === JSON.stringify(voter) &&
    voter.membershipGenerationIndex === permit.proposalIndex &&
    voterStampFollows(voter, learner, identity, permit);
}

// --- Selection -------------------------------------------------------------

function promotionRequest(request) {
  const data = copyStrictOwnDataRecord(request);
  if (!data || !nonempty(data.operationId) || !nonempty(data.destinationNodeId) ||
    !nonempty(data.destinationReplicaId)) return null;
  return Object.freeze({operationId: data.operationId,
    destinationNodeId: data.destinationNodeId, destinationReplicaId: data.destinationReplicaId});
}
// The row already carries this transition's promotion (in flight, or since
// recorded): the durable authorization exists, whoever selected it. The row
// was read by the request's operation id; its identity columns, the operation
// id among them, must match its encoded identity.
function promotionSelected(row) {
  const identity = decodeMembershipIdentity(row?.messageGroupMembershipIdentity);
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  return identity !== null && permit !== null &&
    membershipRowIdentityMatches(row, identity, row.messageGroupMembershipIdentity) &&
    [PROMOTION.inFlight, PROMOTION.committed].includes(row.messageGroupMembershipPhase) &&
    promotionActionMatches(permit, identity);
}
// The recorded learner fact a promotion may be selected over, or null: the
// recorded-fact owner's basis (the shared predicate, which matches the row's
// identity columns to its encoded identity, then the outstanding UNKNOWN
// obligation; the same basis current CREATE consumes). A row whose lane
// holder still owes an unresolved attempt has no such fact.
function recordedLearnerBasis(row) {
  const fact = recordedLearnerCreateBasis(row);
  if (fact === null) return null;
  return Object.freeze({identity: fact.identity, learner: recordedStamp(fact.learnerStamp),
    prior: decodeMembershipPermit(fact.committedPermit), learnerOrigin: fact.learnerOrigin});
}
// Positive evidence at the routed leader: its queued learner-action read of the
// recorded learner action answers COMMITTED with exactly the recorded committed
// origin bytes. Null when it does; UNAVAILABLE when the read is unavailable;
// ORIGIN_UNRECORDED for anything else (no origin there, another one, a
// malformed answer): that leader offers no evidence of the learner.
async function learnerOriginUnproven(readCommittedAction, basis) {
  const query = learnerOutcomeQuery({operationId: basis.identity.operationId,
    identity: basis.identity, permit: basis.prior});
  let observed;
  try {
    observed = await readCommittedAction(query);
  } catch {
    // A thrown read is unavailability, never evidence.
    return OUTCOME.UNAVAILABLE;
  }
  if (learnerObservationRefusal(observed, basis.prior) === OUTCOME.UNAVAILABLE) {
    return OUTCOME.UNAVAILABLE;
  }
  try {
    return observed?.kind === ACTION_KIND.COMMITTED && observed.reason === ACTION_REASON.APPLIED &&
      encodeCommittedLearnerAdmission(observed.receipt) === basis.learnerOrigin ?
      null : OUTCOME.ORIGIN_UNRECORDED;
  } catch {
    // A receipt the origin codec refuses is no positive evidence either.
    return OUTCOME.ORIGIN_UNRECORDED;
  }
}
// The shared exact decision on the caller's observation of the leader and of
// the learner's own committed view (held only when it names itself the exact
// learner). The leader's commit must reach the recorded learner fact's applied
// index. A thrown or malformed observation is no acknowledgement.
async function observeCaughtUp(observeCatchUp, basis) {
  const {identity, learner} = basis;
  try {
    const observation = await observeCatchUp(Object.freeze({groupId: identity.groupId,
      targetReplicaId: identity.targetReplicaId, targetPeerId: identity.targetPeerId}));
    const own = committedStampOfAnswer(observation?.own);
    const acknowledgement = learnerCatchUpAcknowledgement(observation,
      own !== null && namesExactLearner(own, identity) ? own : null, identity,
      learner.appliedIndex);
    return {acknowledgement, status: observation?.status};
  } catch {
    // A thrown observation route is no leader observed: no acknowledgement.
    return {acknowledgement: {state: ACK.LEADER_UNAVAILABLE, proofReason: null}};
  }
}
// Current promotion authority: the acknowledging leader has applied an entry of
// its own term, by positive evidence only. Either its native observation says
// so (currentTermApplied: it applied past its pending configuration index), or
// the recorded learner action is itself an entry of the leader's current term
// (the recorder matched that action's origin at the permit's term and index)
// and the leader's applied index has reached it. The native flag alone reads
// false right after the leader's own configuration change applies.
function leaderTermApplied(status, basis) {
  return status?.currentTermApplied === true ||
    (status?.term === basis.prior.leaderTerm && Number.isSafeInteger(status.appliedIndex) &&
      status.appliedIndex >= basis.prior.proposalIndex);
}
function notCaughtUp(acknowledgement, row) {
  return Object.freeze({outcome: OUTCOME.NOT_CAUGHT_UP, operation: row,
    acknowledgement: acknowledgement.state, proofReason: acknowledgement.proofReason ?? null});
}
// The promotion attempt at the next sequence of the transition, bound to the
// acknowledging leader's term, committed configuration, lifecycle and runtime
// fences, the routed destination and the live holder's fences; null when the
// codec refuses it, which the branch selection answers INVALID before any read.
function promotionPermit(repository, basis, claim, caughtUp, destination) {
  const {prior} = basis;
  const {acknowledgement, status} = caughtUp;
  return encodeMembershipPermit({version: prior.version,
    transitionIdentity: prior.transitionIdentity, permitSequence: prior.permitSequence + 1,
    permitStage: STAGE.PROMOTE, permitState: STATE.IN_FLIGHT,
    workflowOwnerNodeId: claim.ownerNodeId, workflowOwnerFence: membershipOwnerClaimFence(claim),
    membershipLeaseExpiresAt: claim.expiresAt, proposerNodeId: repository.nodeId,
    proposerBootIncarnation: repository.membershipOwnerBootIncarnation,
    destinationNodeId: destination.nodeId, destinationBootIncarnation: destination.bootIncarnation,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, leaderTerm: acknowledgement.term,
    leaderConfigurationStamp: {configurationKey: acknowledgement.leader.configurationKey,
      membershipGenerationIndex: acknowledgement.leader.membershipGenerationIndex},
    proposalIndex: null, replicaIdentity: prior.replicaIdentity, peerId: prior.peerId});
}
async function selectOverCaughtUpLearner(repository, input, basis, row, observeCatchUp, isCurrent) {
  const caughtUp = await observeCaughtUp(observeCatchUp, basis);
  if (caughtUp.acknowledgement.state !== ACK.ACKNOWLEDGED) {
    return notCaughtUp(caughtUp.acknowledgement, row);
  }
  if (!leaderTermApplied(caughtUp.status, basis)) {
    return notCaughtUp({state: ACK.LEADER_TERM_UNAPPLIED}, row);
  }
  // The proof must be the routed destination's: the permit binds that leader.
  if (caughtUp.acknowledgement.leaderReplicaId !== input.destinationReplicaId) {
    return result(OUTCOME.CONFLICT, row);
  }
  const bootIncarnation = await canonicalBootIncarnation(repository, input.destinationNodeId);
  if (bootIncarnation === null || !isCurrent()) return result(OUTCOME.UNAVAILABLE, row);
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  if (!membershipClaimIsLocalAndLive(repository, claim, basis.identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  return selectMessageGroupMembershipBranch(repository, {operationId: input.operationId,
    identity: row.messageGroupMembershipIdentity, priorPermit: row.messageGroupMembershipPermit,
    nextPermit: promotionPermit(repository, basis, claim, caughtUp,
      {nodeId: input.destinationNodeId, bootIncarnation}), branch: MEMBERSHIP_BRANCH.PROMOTE},
  isCurrent);
}
/** Select the promotion of the row's recorded learner when, and only when, the
 * routed leader evidences the learner's committed origin and its exact
 * observation acknowledges the learner caught up under that leader's applied
 * term. The caller supplies the operation, the routed leader (node and
 * replica), the read capability at that leader (the queued learner-action
 * read), the observation capability ({membership: the leader's
 * BOOTSTRAP-purpose committed answer, status: that leader's status, own: the
 * learner's own committed answer}) and its invocation lifetime, never evidence
 * or a permit. NOT_CAUGHT_UP names the acknowledgement state and proof reason;
 * ORIGIN_UNRECORDED and UNAVAILABLE name the missing evidence; nothing is
 * written then. */
async function selectMessageGroupPromotion(repository, request, readCommittedAction,
  observeCatchUp, isInvocationCurrent) {
  const input = promotionRequest(request);
  if (!input || typeof readCommittedAction !== 'function' ||
    typeof observeCatchUp !== 'function' || typeof isInvocationCurrent !== 'function') {
    return result(OUTCOME.INVALID);
  }
  const isCurrent = recordingInvocation(repository, isInvocationCurrent);
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available || !isCurrent()) return result(OUTCOME.UNAVAILABLE);
  if (promotionSelected(before.row)) return result(OUTCOME.RECORDED, before.row);
  const basis = recordedLearnerBasis(before.row);
  if (!basis) return result(OUTCOME.CONFLICT, before.row);
  const unproven = await learnerOriginUnproven(readCommittedAction, basis);
  if (unproven !== null) return result(unproven, before.row);
  return selectOverCaughtUpLearner(repository, input, basis, before.row, observeCatchUp, isCurrent);
}

// --- Voter-stamp recording -------------------------------------------------

// The promotion row this recording may write: the recorded learner stamp
// kept, no removal stamp, the request's holder and the outstanding debt, on an
// open or exactly failed operation (J1: forward recovery after authorization).
function voterRowMatches(repository, row, input) {
  return membershipRowIdentityMatches(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipOwnerClaim === input.executionClaim &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    row.messageGroupLearnerStamp !== null && row.messageGroupRemovalStamp === null &&
    recordingSettlementAllowed(repository, row);
}
function promotionIntent(row, input) {
  return row.messageGroupMembershipPhase === PROMOTION.inFlight &&
    row.messageGroupMembershipPermit === input.encodedPermit &&
    row.messageGroupVoterStamp === null;
}
function committedVoterPermit(input, index) {
  return JSON.stringify({...input.permit, permitState: STATE.COMMITTED, proposalIndex: index});
}
function exactRecordedVoter(row, input) {
  const permit = recordedVoterPermit(row, input.identity, input.encodedIdentity);
  return recordedVoterFactIsValid(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipPermit === committedVoterPermit(input, permit.proposalIndex);
}
function voterBasisRefusal(repository, row, input) {
  if (!voterRowMatches(repository, row, input)) return OUTCOME.CONFLICT;
  if (!membershipClaimIsLocalAndLive(repository, input.claim, input.identity)) {
    return OUTCOME.STALE_OWNER;
  }
  if (input.permit.permitState === STATE.COMMITTED) {
    return exactRecordedVoter(row, input) ? null : OUTCOME.CONFLICT;
  }
  return promotionIntent(row, input) || exactRecordedVoter(row, input) ? null : OUTCOME.CONFLICT;
}
// The receipt as the origin codec reads it, or null when the codec refuses it
// (the codec admits only the transition's ADD_LEARNER as an origin).
function decodedLearnerOrigin(receipt) {
  try {
    return decodeCommittedLearnerAdmission(encodeCommittedLearnerAdmission(receipt));
  } catch {
    // A receipt the origin codec refuses is no evidence of anything.
    return null;
  }
}
// The target's learner origin is this transition's learner action, earlier in
// the transition than the recorded promotion attempt (the peer id is the
// context codec's: it derives from the replica identity on both sides).
function learnerOriginPrecedes(origin, query) {
  const {context} = origin;
  const {action} = query;
  return origin.groupId === query.groupId && context.operationId === action.operationId &&
    context.transitionIdentity === action.transitionIdentity &&
    context.replicaIdentity === action.replicaIdentity &&
    context.permitSequence < action.permitSequence;
}
// The voter stamp a COMMITTED promotion answer supports, or the refusal that
// keeps the debt (the absence classification and its fence are the shared
// recorder's: NONCOMMITTED, UNKNOWN, UNAVAILABLE or CONFLICT).
function voterOutcomeEvidence(observed, input, query, row) {
  const refusal = learnerObservationRefusal(observed, input.permit);
  if (refusal !== null) return {refusal};
  const origin = decodedLearnerOrigin(observed.receipt);
  if (origin === null || !learnerOriginPrecedes(origin, query)) return {refusal: OUTCOME.CONFLICT};
  if (learnerWitnessUnavailable(observed.membership)) return {refusal: OUTCOME.UNAVAILABLE};
  const stamp = committedStampOfAnswer(observed.membership);
  const learner = learnerConfigurationOf(row, input.identity);
  if (stamp === null || learner === null ||
    stamp.appliedIndex !== observed.observedAppliedIndex ||
    !voterStampFollows(stamp, learner, input.identity, input.permit)) {
    return {refusal: OUTCOME.CONFLICT};
  }
  return {committedPermit: committedVoterPermit(input, stamp.membershipGenerationIndex),
    stamp: JSON.stringify(stamp)};
}
const VOTER_RECORDING = Object.freeze({
  basisRefusal: voterBasisRefusal,
  recorded: exactRecordedVoter,
  evidence: voterOutcomeEvidence,
  receipt: (evidence) => ({set: VOTER_RECEIPT_SET,
    params: [PROMOTION.committed, evidence.committedPermit, evidence.stamp]}),
  // Readback: the row is this input's exactly recorded voter fact (the basis
  // refusal's exact recorded voter: the committed permit at the stamp's
  // generation, which is this evidence's permit) carrying this evidence's stamp.
  readback: (repository, row, input, evidence) =>
    voterBasisRefusal(repository, row, input) === null &&
    row.messageGroupVoterStamp === evidence.stamp,
});
/** Record the exact outcome of an issued promotion as the voter stamp, never
 * dispatch membership work. A COMMITTED permit is readback-only. */
function recordMessageGroupVoterOutcome(repository, request, readCommittedAction,
  isInvocationCurrent) {
  const input = actionRecordingInput(request, promotionActionMatches);
  if (!input || typeof readCommittedAction !== 'function' ||
    (isInvocationCurrent !== undefined && typeof isInvocationCurrent !== 'function')) {
    return Promise.resolve(result(OUTCOME.INVALID));
  }
  return recordMembershipActionOutcome(repository, input, VOTER_RECORDING,
    readCommittedAction, recordingInvocation(repository, isInvocationCurrent));
}
/** Recover the voter outcome by operation ID from the authoritative row. */
async function recoverMessageGroupVoterOutcome(repository, operationId, readCommittedAction,
  isInvocationCurrent) {
  if (!nonempty(operationId)) return result(OUTCOME.INVALID);
  const observed = await observeMembershipOperation(repository, operationId);
  if (!observed.available) return result(OUTCOME.UNAVAILABLE);
  if (!observed.row) return result(OUTCOME.CONFLICT);
  return recordMessageGroupVoterOutcome(repository, {operationId,
    identity: observed.row.messageGroupMembershipIdentity,
    permit: observed.row.messageGroupMembershipPermit,
    executionClaim: observed.row.messageGroupMembershipOwnerClaim},
  readCommittedAction, isInvocationCurrent);
}

export {selectMessageGroupPromotion, recordMessageGroupVoterOutcome,
  recoverMessageGroupVoterOutcome, recordedVoterFactIsValid,
  recordedStamp, sameMembers};
