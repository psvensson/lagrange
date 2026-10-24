import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
/** One operation-row CAS selects promotion or pre-promotion abandonment.
 * This is a repository operation, not another workflow or runtime authority.
 * RECORDED means an exact durable intent exists; it is not a dispatch grant.
 */
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {ReplicaStatus} from './replica-status.js';
import {committedStampOfAnswer, validateBootstrapMembershipStamp} from
  '../raft/raft-committed-membership-stamp.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {ROLE_LEADER} from '../raft/raft-rs-runtime-owner-constants.js';
import {COMMITTED_LEARNER_ACTION_KIND as ACTION_KIND,
  COMMITTED_LEARNER_ACTION_REASON as ACTION_REASON,
  COMMITTED_MEMBERSHIP_READ_PURPOSE, COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL, COMMITTED_MEMBERSHIP_STAMP_DEFECT as STAMP_DEFECT} from '../raft/raft-committed-membership-constants.js';
import {encodeCommittedLearnerAdmission, decodeCommittedLearnerAdmission,
  INVALID_COMMITTED_LEARNER_ADMISSION} from '../raft/raft-rs-committed-membership-context.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, membershipBranchSpec,
  decodeMembershipOwnerClaim, membershipOwnerClaimFence, membershipActionMatches} from
  './replica-operation-message-group-membership-permit.js';

import {observeMembershipOperation, membershipRowIdentityMatches,
  membershipClaimIsLocalAndLive, membershipBootIsCurrent,
  membershipRowWhere, neverAuthorized, noteUncertainMembershipWrite} from
  './replica-operation-message-group-membership-owner-claim.js';

const result = (outcome, operation = null) => Object.freeze({outcome, operation});
function priorLearnerStamp(row, identity, prior) {
  try {
    const stamp = committedStampOfAnswer(JSON.parse(row.messageGroupLearnerStamp));
    const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
    return stamp && stamp.learners.includes(identity.targetPeerId) &&
      stamp.voters.includes(sourcePeer) &&
      stamp.identities[sourcePeer] === identity.sourceReplicaId &&
      stamp.identities[identity.targetPeerId] === identity.targetReplicaId &&
      stamp.appliedIndex >= prior.proposalIndex &&
      stamp.membershipGenerationIndex > prior.leaderConfigurationStamp.membershipGenerationIndex ?
      stamp : null;
  } catch {
    return null;
  }
}
function permitsMatch(prior, next, identity, spec) {
  return prior.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
    prior.permitState === STATE.COMMITTED && next.permitState === STATE.IN_FLIGHT &&
    next.permitStage === spec.stage && next.permitSequence === prior.permitSequence + 1 &&
    prior.transitionIdentity === identity.transitionIdentity &&
    next.transitionIdentity === identity.transitionIdentity &&
    prior.replicaIdentity === identity.targetReplicaId &&
    next.replicaIdentity === identity.targetReplicaId &&
    prior.peerId === identity.targetPeerId && next.peerId === identity.targetPeerId &&
    next.proposalIndex === null;
}
// An existing membership obligation can outlive ordinary operation settlement.
// Only exact failed settlement may newly select pre-promotion target abandonment;
// the exact completion timestamp joins the same operation-row CAS, never a new lane.
const MEMBERSHIP_SETTLEMENT_PREDICATE = Object.freeze({
  OPEN: 'completed_at IS NULL',
  EXACT_TERMINAL: 'completed_at = ?',
});
function branchSettlementGuard(repository, row, spec) {
  if (!repository.isOperationTerminal(row)) {
    return row.completedAt === null ?
      {sql: MEMBERSHIP_SETTLEMENT_PREDICATE.OPEN, params: []} : null;
  }
  if (row.status !== ReplicaStatus.FAILED || row.workflowStep !== WORKFLOW_STEP.FAILED ||
    spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||
    !Number.isSafeInteger(row.completedAt) || row.completedAt <= 0) return null;
  return {sql: MEMBERSHIP_SETTLEMENT_PREDICATE.EXACT_TERMINAL, params: [row.completedAt]};
}
const branchSelectionSql = (settlement) => `UPDATE replica_operations SET message_group_membership_phase = ?,
  message_group_membership_permit = ?, message_group_membership_obligation_state = ?
  WHERE operation_id = ? AND type = ? AND partition_id = ? AND entity_type = ?
  AND entity_id = ? AND source_replica_id = ? AND replica_id = ?
  AND source_node_id = ? AND target_node_id = ?
  AND message_group_membership_lane_key = ? AND message_group_membership_identity = ?
  AND message_group_source_lifecycle_claim = ? AND message_group_membership_owner_claim = ?
  AND status = ? AND workflow_step = ? AND ${settlement.sql}
  AND message_group_membership_phase = ? AND message_group_membership_permit = ?
  AND message_group_membership_obligation_state = ? AND message_group_learner_stamp = ?
  AND message_group_voter_stamp IS NULL AND message_group_removal_stamp IS NULL`;

function nextPermitFollowsLearner(next, learner) {
  return next.leaderConfigurationStamp.configurationKey === learner.configurationKey &&
    next.leaderConfigurationStamp.membershipGenerationIndex === learner.membershipGenerationIndex &&
    next.leaderTerm >= learner.term;
}
function selectedBranchRecorded(row, spec, nextPermit) {
  return row.messageGroupMembershipPhase === spec.phase &&
    row.messageGroupMembershipPermit === nextPermit &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN;
}
// The selected branch is a later phase than the recorded learner fact, so its
// idempotent read-back keeps its own request/holder/boot logic. It does not
// renew a lease or create runtime authority.
async function readBackSelectedBranch(repository, row, identity, prior, next, isCurrent) {
  const learner = priorLearnerStamp(row, identity, prior);
  if (!learner || !nextPermitFollowsLearner(next, learner)) return result(OUTCOME.INVALID, row);
  const currentClaim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  if (!membershipClaimIsLocalAndLive(repository, currentClaim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
  if (!isCurrent()) return result(OUTCOME.UNKNOWN, row);
  if (!membershipClaimIsLocalAndLive(repository, currentClaim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  return result(OUTCOME.RECORDED, row);
}
// A new selection consumes the recorder's one pure recorded-fact predicate
// first; a row failing it is not a basis for any branch and is surfaced as
// CONFLICT. Only then must the next permit follow that learner configuration.
function newBranchFactRefusal(row, identity, encodedIdentity, next) {
  if (!recordedLearnerFactIsValid(row, identity, encodedIdentity)) return OUTCOME.CONFLICT;
  const learner = committedStampOfAnswer(JSON.parse(row.messageGroupLearnerStamp));
  return nextPermitFollowsLearner(next, learner) ? null : OUTCOME.INVALID;
}
function selectedBranchMatches(observed, prior, identity, encodedIdentity, nextPermit, spec) {
  return membershipRowIdentityMatches(observed, identity, encodedIdentity) &&
    observed.messageGroupMembershipPhase === spec.phase &&
    observed.messageGroupMembershipPermit === nextPermit &&
    observed.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    observed.messageGroupLearnerStamp === prior.messageGroupLearnerStamp &&
    observed.messageGroupSourceLifecycleClaim === prior.messageGroupSourceLifecycleClaim &&
    observed.messageGroupMembershipOwnerClaim === prior.messageGroupMembershipOwnerClaim;
}
function decodedBranchSelectionRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const {operationId, identity: encodedIdentity, priorPermit, nextPermit, branch} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const prior = decodeMembershipPermit(priorPermit);
  const next = decodeMembershipPermit(nextPermit);
  const spec = membershipBranchSpec(branch);
  return identity && identity.operationId === operationId && prior && next && spec &&
    permitsMatch(prior, next, identity, spec) ? {operationId, encodedIdentity,
      priorPermit, nextPermit, identity, prior, next, spec} : null;
}
const observationIsCurrent = (observation, isCurrent) =>
  observation.available && isCurrent();

async function submitSelectedBranch(repository, input) {
  const {row, identity, encodedIdentity, operationId, priorPermit, nextPermit,
    spec, settlement, claim, isCurrent} = input;
  const submissionIsCurrent = () => isCurrent() &&
    membershipClaimIsLocalAndLive(repository, claim, identity);
  const beforeAttempt = async () => submissionIsCurrent() &&
    await membershipBootIsCurrent(repository);
  const params = [spec.phase, nextPermit, MEMBERSHIP_OBLIGATION.UNKNOWN,
    operationId, row.type, row.partitionId, row.entityType, row.entityId,
    row.sourceReplicaId, row.replicaId, row.sourceNodeId, row.targetNodeId,
    row.messageGroupMembershipLaneKey, row.messageGroupMembershipIdentity,
    row.messageGroupSourceLifecycleClaim, row.messageGroupMembershipOwnerClaim, row.status,
    row.workflowStep, ...settlement.params, PHASE.LEARNER_COMMITTED, priorPermit,
    MEMBERSHIP_OBLIGATION.UNKNOWN, row.messageGroupLearnerStamp];
  try {
    await repository.executeOperationMutationWithRetry(branchSelectionSql(settlement), params,
      {beforeAttempt, submissionIsCurrent});
  } catch (error) {
    noteUncertainMembershipWrite(repository, operationId, error);
  }
  const after = await observeMembershipOperation(repository, operationId);
  if (!after.available || !isCurrent()) return result(OUTCOME.UNKNOWN);
  const observed = after.row;
  const recorded = selectedBranchMatches(
    observed, row, identity, encodedIdentity, nextPermit, spec) &&
    await membershipBootIsCurrent(repository) && submissionIsCurrent();
  return result(recorded ? OUTCOME.RECORDED : OUTCOME.UNKNOWN, observed);
}

async function selectMessageGroupMembershipBranch(repository, request, isInvocationCurrent) {
  // The only accepted representations here are scalar strings and encoded row values.
  const input = decodedBranchSelectionRequest(request);
  if (input === null) return result(OUTCOME.INVALID);
  const {operationId, encodedIdentity, priorPermit, nextPermit,
    identity, prior, next, spec} = input;
  const isCurrent = recordingInvocation(repository, isInvocationCurrent);
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, operationId);
  if (!observationIsCurrent(before, isCurrent)) return result(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity)) {
    return result(OUTCOME.CONFLICT, row);
  }
  if (selectedBranchRecorded(row, spec, nextPermit)) {
    return readBackSelectedBranch(repository, row, identity, prior, next, isCurrent);
  }
  const factRefusal = newBranchFactRefusal(row, identity, encodedIdentity, next);
  if (factRefusal !== null) return result(factRefusal, row);
  const settlement = branchSettlementGuard(repository, row, spec);
  if (!settlement || row.messageGroupMembershipPermit !== priorPermit ||
    row.messageGroupMembershipObligationState !== MEMBERSHIP_OBLIGATION.UNKNOWN) {
    return result(OUTCOME.CONFLICT, row);
  }
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  if (!membershipPermitMatchesHolder(repository, next, claim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
  // A false or lost answer is not a cancellation. Re-observe the exact row;
  // retrying this same CAS or its competing branch is safe on the same basis.
  return submitSelectedBranch(repository, {row, identity, encodedIdentity, operationId,
    priorPermit, nextPermit, spec, settlement, claim, isCurrent});
}
export {selectMessageGroupMembershipBranch};

/** The learner action of this transition: an ADD_LEARNER permit for the exact
 * target. The codec retains any positive sequence already present in durable
 * history; current initial authorization admits only sequence 1. Pure. */
function learnerActionMatches(permit, identity) {
  return membershipActionMatches(permit, identity, RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER);
}
// Initial issuance is always the first attempt.
function initialLearnerPermitMatches(permit, identity) {
  return learnerActionMatches(permit, identity) && permit.permitSequence === 1 &&
    permit.permitState === STATE.IN_FLIGHT && permit.proposalIndex === null;
}
function membershipPermitMatchesHolder(repository, permit, claim, identity) {
  return membershipClaimIsLocalAndLive(repository, claim, identity) &&
    permit.workflowOwnerNodeId === claim.ownerNodeId &&
    permit.proposerNodeId === repository.nodeId &&
    permit.proposerBootIncarnation === repository.membershipOwnerBootIncarnation &&
    permit.workflowOwnerFence === membershipOwnerClaimFence(claim) &&
    permit.membershipLeaseExpiresAt === claim.expiresAt;
}
function recordedLearnerIntent(row, encodedPermit) {
  return row.messageGroupMembershipPhase === PHASE.LEARNER_IN_FLIGHT &&
    row.messageGroupMembershipPermit === encodedPermit &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    row.messageGroupLearnerStamp === null && row.messageGroupVoterStamp === null &&
    row.messageGroupRemovalStamp === null;
}
function decodeInitialLearnerRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const {operationId, identity: encodedIdentity, permit: encodedPermit} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const permit = decodeMembershipPermit(encodedPermit);
  return identity && identity.operationId === operationId && permit &&
    initialLearnerPermitMatches(permit, identity) ?
    {operationId, encodedIdentity, encodedPermit, identity, permit} : null;
}
function initialLearnerRowEligible(repository, row) {
  return !repository.isOperationTerminal(row) && row.completedAt === null &&
    neverAuthorized(row) &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.INTENT_RECORDED;
}
async function observeRecordedLearner(repository, row, claim, identity) {
  if (!membershipClaimIsLocalAndLive(repository, claim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
  return result(OUTCOME.RECORDED, row);
}
async function persistInitialLearnerIntent(repository, row, claim, input) {
  const {operationId, identity, encodedIdentity, encodedPermit} = input;
  // The shared predicate includes ordinary terminal fields and observed holder.
  const basis = membershipRowWhere(row);
  try {
    await repository.executeOperationMutationWithRetry(
      `UPDATE replica_operations SET message_group_membership_phase = ?,
        message_group_membership_permit = ?, message_group_membership_obligation_state = ?
        WHERE ${basis.where}`,
      [PHASE.LEARNER_IN_FLIGHT, encodedPermit, MEMBERSHIP_OBLIGATION.UNKNOWN, ...basis.params]);
  } catch (error) {
    // An unknown write may still commit. Only exact owner readback resolves it.
    noteUncertainMembershipWrite(repository, operationId, error);
  }
  const after = await observeMembershipOperation(repository, operationId);
  if (!after.available) return result(OUTCOME.UNKNOWN);
  if (membershipRowIdentityMatches(after.row, identity, encodedIdentity) &&
    recordedLearnerIntent(after.row, encodedPermit) &&
    after.row.messageGroupMembershipOwnerClaim === row.messageGroupMembershipOwnerClaim &&
    membershipClaimIsLocalAndLive(repository, claim, identity) &&
    await membershipBootIsCurrent(repository)) {
    return result(OUTCOME.RECORDED, after.row);
  }
  return result(OUTCOME.UNKNOWN, after.row);
}
/** Record initial learner intent under the existing holder; never dispatch.
 * Destination/term/configuration freshness still belongs to the runtime consumer.
 */
async function authorizeMessageGroupLearner(repository, request) {
  const input = decodeInitialLearnerRequest(request);
  if (!input) return result(OUTCOME.INVALID);
  const {operationId, identity, encodedIdentity, encodedPermit, permit} = input;
  const before = await observeMembershipOperation(repository, operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity)) {
    return result(OUTCOME.CONFLICT, row);
  }
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  // Exact replay survives settlement/takeover without changing the old action.
  if (recordedLearnerIntent(row, encodedPermit)) {
    return observeRecordedLearner(repository, row, claim, identity);
  }
  if (!initialLearnerRowEligible(repository, row)) return result(OUTCOME.CONFLICT, row);
  if (!membershipPermitMatchesHolder(repository, permit, claim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
  return persistInitialLearnerIntent(repository, row, claim, input);
}
export {authorizeMessageGroupLearner};


// Record recovered fact, never issue an action. The host supplies the existing
// native read port as a capability, not wire/payload-provided receipt bytes.
// The action matcher binds the recorded learner action to this transition.
function actionRecordingInput(request, actionMatches = learnerActionMatches) {
  const data = copyStrictOwnDataRecord(request);
  if (!data) return null;
  const {operationId, identity: encodedIdentity, permit: encodedPermit, executionClaim} = data;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const permit = decodeMembershipPermit(encodedPermit);
  const claim = decodeMembershipOwnerClaim(executionClaim);
  if (!identity || identity.operationId !== operationId || !permit || !claim ||
    !actionMatches(permit, identity)) return null;
  // This read/record-only input may already be COMMITTED after a lost answer.
  // Never rewrite it as IN_FLIGHT or pass it to the proposal authorizer.
  return {operationId, encodedIdentity, encodedPermit, identity, permit, executionClaim, claim};
}
function recordingSettlementAllowed(repository, row) {
  if (!repository.isOperationTerminal(row)) return row.completedAt === null;
  return row.status === ReplicaStatus.FAILED && row.workflowStep === WORKFLOW_STEP.FAILED &&
    Number.isSafeInteger(row.completedAt) && row.completedAt > 0;
}
function recordingRowMatches(repository, row, input) {
  return membershipRowIdentityMatches(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipOwnerClaim === input.executionClaim &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    row.messageGroupVoterStamp === null && row.messageGroupRemovalStamp === null &&
    recordingSettlementAllowed(repository, row);
}
function learnerOutcomeQuery(input) {
  return Object.freeze({purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.LEARNER_ACTION,
    groupId: input.identity.groupId, action: Object.freeze({operationId: input.operationId,
      transitionIdentity: input.identity.transitionIdentity,
      permitSequence: input.permit.permitSequence, stage: input.permit.permitStage,
      replicaIdentity: input.identity.targetReplicaId, peerId: input.identity.targetPeerId})});
}
function committedLearnerPermit(input, index) {
  return JSON.stringify({...input.permit, permitState: STATE.COMMITTED,
    proposalIndex: Number(index)});
}
// The shared historical-fact predicate, plus this request's binding: the
// recorded permit is exactly the requested action committed at its index.
function exactRecordedLearner(row, input) {
  const permit = decodeMembershipPermit(row.messageGroupMembershipPermit);
  return recordedLearnerFactIsValid(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipPermit === committedLearnerPermit(input, permit.proposalIndex);
}
function originalLearnerOriginMatches(origin, input, query) {
  return origin !== INVALID_COMMITTED_LEARNER_ADMISSION &&
    origin.groupId === query.groupId &&
    JSON.stringify(origin.context) === JSON.stringify(query.action) &&
    Number(origin.term) === input.permit.leaderTerm &&
    Number(origin.index) > input.permit.leaderConfigurationStamp.membershipGenerationIndex;
}
// The facts the native owner attaches to an absent origin, by type. The registry
// vouch is the one fact an observation may lack: a native owner that cannot vouch
// attaches none, and an absent vouch, like a false one, never fences.
const ABSENCE_TEXT_KEYS = Object.freeze(['replicaIdentity', 'role', 'configurationKey',
  'lifecycleIncarnation']);
const ABSENCE_INTEGER_KEYS = Object.freeze(['term', 'appliedIndex',
  'membershipGenerationIndex', 'runtimeGeneration']);
const ABSENCE_FLAG_KEYS = Object.freeze(['currentTermApplied']);
const ABSENCE_VOUCH_KEY = 'originRegistryComplete';
const absenceFlagKeys = (data) => (Object.hasOwn(data, ABSENCE_VOUCH_KEY) ?
  [...ABSENCE_FLAG_KEYS, ABSENCE_VOUCH_KEY] : ABSENCE_FLAG_KEYS);
function canonicalAbsenceObservation(value) {
  const data = copyStrictOwnDataRecord(value);
  if (!data) return null;
  const flags = absenceFlagKeys(data);
  if (Object.keys(data).length !==
      ABSENCE_TEXT_KEYS.length + ABSENCE_INTEGER_KEYS.length + flags.length ||
    !ABSENCE_TEXT_KEYS.every((key) => typeof data[key] === 'string' && data[key].length > 0) ||
    !ABSENCE_INTEGER_KEYS.every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0) ||
    !flags.every((key) => typeof data[key] === 'boolean')) return null;
  return Object.freeze(data);
}
// The fence: the observed replica leads a strictly newer term than the action
// was issued for, has applied an entry of that term, and its registry vouches
// that its origin records are complete for the target. The action can only
// ever be appended at its own term's leader (the native turn requires that
// exact term), raft log terms never decrease along the log, and the committed
// log is one sequence, so the action could now only commit inside that
// replica's applied prefix, where its target would hold a reservation with the
// recorded origin. A registry holding the target's reservation without an
// origin (stamp or image bootstrap, migrated schema, local proposal) vouches
// for nothing and never fences.
function absenceFencesLearnerAction(observation, permit) {
  return observation.role === ROLE_LEADER && observation.currentTermApplied === true &&
    observation.originRegistryComplete === true && observation.term > permit.leaderTerm;
}
/** The recorder's one classification of a native NOT_RECORDED answer for an
 * in-flight learner action: NONCOMMITTED (with the observation) only when the
 * same observation fences the action; UNKNOWN when it does not (an absent or
 * false registry vouch included), or carries no observation (absence alone proves
 * nothing); CONFLICT when the attached observation is malformed. Pure: no clock,
 * claim, boot or row read. */
function learnerActionAbsence(observed, permit) {
  if (observed.observation === undefined || permit.permitState !== STATE.IN_FLIGHT) {
    return Object.freeze({outcome: OUTCOME.UNKNOWN, observation: null});
  }
  const observation = canonicalAbsenceObservation(observed.observation);
  if (observation === null) return Object.freeze({outcome: OUTCOME.CONFLICT, observation});
  return Object.freeze({outcome: absenceFencesLearnerAction(observation, permit) ?
    OUTCOME.NONCOMMITTED : OUTCOME.UNKNOWN, observation});
}
const notRecorded = (observed) => observed?.kind === ACTION_KIND.UNRESOLVED &&
  observed.reason === ACTION_REASON.NOT_RECORDED;
// Preserve the native owner's distinction: unresolved history is not a conflict,
// and an invalid/mismatched origin is not transient transport unavailability.
function learnerObservationRefusal(observed, permit) {
  if (notRecorded(observed)) return learnerActionAbsence(observed, permit).outcome;
  if (observed?.kind === ACTION_KIND.REFUSED &&
    observed.reason === ACTION_REASON.UNAVAILABLE) return OUTCOME.UNAVAILABLE;
  return observed?.kind === ACTION_KIND.COMMITTED && observed.reason === ACTION_REASON.APPLIED ?
    null : OUTCOME.CONFLICT;
}
function learnerWitnessUnavailable(membership) {
  if (membership?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED &&
    validateBootstrapMembershipStamp(membership).defect === STAMP_DEFECT.JOINT) {
    return true;
  }
  return membership?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED &&
    [COMMITTED_MEMBERSHIP_REFUSAL.HELD,
      COMMITTED_MEMBERSHIP_REFUSAL.CONFIGURATION_GENERATION_UNAVAILABLE]
      .includes(membership.reason);
}
function learnerOutcomeEvidence(observed, input, query) {
  const refusal = learnerObservationRefusal(observed, input.permit);
  if (refusal !== null) return {refusal};
  try {
    const encodedOrigin = encodeCommittedLearnerAdmission(observed.receipt);
    const origin = decodeCommittedLearnerAdmission(encodedOrigin);
    if (!originalLearnerOriginMatches(origin, input, query)) {
      return {refusal: OUTCOME.CONFLICT};
    }
    if (learnerWitnessUnavailable(observed.membership)) return {refusal: OUTCOME.UNAVAILABLE};
    const encodedStamp = JSON.stringify(observed.membership);
    const committedPermit = committedLearnerPermit(input, origin.index);
    const stamp = priorLearnerStamp({messageGroupLearnerStamp: encodedStamp}, input.identity,
      decodeMembershipPermit(committedPermit));
    if (!stamp || stamp.appliedIndex !== observed.observedAppliedIndex ||
      stamp.membershipGenerationIndex < Number(origin.index) || stamp.term < Number(origin.term)) {
      return {refusal: OUTCOME.CONFLICT};
    }
    return {committedPermit, stamp: JSON.stringify(stamp)};
  } catch {
    return {refusal: OUTCOME.CONFLICT};
  }
}
// The recording spec's own reading of the native answer to the exact action
// query; a thrown read is UNAVAILABLE, never evidence.
async function observeActionRecording(readCommittedAction, input, spec, row) {
  const query = learnerOutcomeQuery(input);
  try {
    return spec.evidence(await readCommittedAction(query), input, query, row);
  } catch {
    return {refusal: OUTCOME.UNAVAILABLE};
  }
}
function recordingBasisRefusal(repository, row, input) {
  if (!recordingRowMatches(repository, row, input)) return OUTCOME.CONFLICT;
  if (!membershipClaimIsLocalAndLive(repository, input.claim, input.identity)) {
    return OUTCOME.STALE_OWNER;
  }
  if (input.permit.permitState === STATE.COMMITTED) {
    return exactRecordedLearner(row, input) ? null : OUTCOME.CONFLICT;
  }
  return recordedLearnerIntent(row, input.encodedPermit) || exactRecordedLearner(row, input) ?
    null : OUTCOME.CONFLICT;
}
// One conditional UPDATE of the three receipt columns the spec names, over
// the full observed row as basis, then exact authoritative readback.
async function recordObservedAction(repository, row, input, evidence, isCurrent, spec) {
  const basis = membershipRowWhere(row);
  const receipt = spec.receipt(evidence);
  const submissionIsCurrent = () => isCurrent() &&
    membershipClaimIsLocalAndLive(repository, input.claim, input.identity);
  // A retry is a NEW submission, even when it retains the logical write ID.
  // Sample boot authority through its owner each time; after that await the
  // gateway checks local invocation/lease again immediately before submission.
  const beforeAttempt = async () => submissionIsCurrent() &&
    await membershipBootIsCurrent(repository);
  try {
    await repository.executeOperationMutationWithRetry(
      `UPDATE replica_operations SET ${receipt.set}
        WHERE ${basis.where}`,
      [...receipt.params, ...basis.params], {beforeAttempt, submissionIsCurrent});
  } catch (error) {
    // COMMIT may have succeeded. Only exact owner readback settles that answer.
    noteUncertainMembershipWrite(repository, input.operationId, error);
  }
  // A write already submitted may have committed even if the invocation dies.
  // No host callback purports to revoke a command already inside another owner.
  if (!isCurrent() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, input.operationId);
  if (!isCurrent() || !after.available) return result(OUTCOME.UNKNOWN);
  return result(spec.readback(repository, after.row, input, evidence) ?
    OUTCOME.RECORDED : OUTCOME.UNKNOWN, after.row);
}
function finishActionRecording(repository, row, input, evidence, isCurrent, spec) {
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const refusal = spec.basisRefusal(repository, row, input);
  if (refusal !== null) return result(refusal, row);
  if (spec.recorded(row, input)) return result(OUTCOME.RECORDED, row);
  // An already-recorded observation cannot regress back into an in-flight row.
  if (evidence === null) return result(OUTCOME.CONFLICT, row);
  return recordObservedAction(repository, row, input, evidence, isCurrent, spec);
}
/** The learner outcome recorder uses one internal recording spec. The spec
 * answers basisRefusal(repository, row, input), recorded(row, input),
 * evidence(observed, input, query, row) -> {committedPermit, stamp} or
 * {refusal}, receipt(evidence) -> {set, params} (its three receipt columns)
 * and readback(repository, row, input, evidence). The same-row CAS includes
 * immutable identity, prior permit, holder, phase, terminal status/step/time
 * and every membership stamp. Ordinary progress, membership debt/lane,
 * reservations and physical CREATE remain untouched. */
async function recordMembershipActionOutcome(repository, input, spec, readCommittedAction,
  isCurrent) {
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const initialRefusal = spec.basisRefusal(repository, before.row, input);
  if (initialRefusal !== null) return result(initialRefusal, before.row);
  const evidence = spec.recorded(before.row, input) ? null :
    await observeActionRecording(readCommittedAction, input, spec, before.row);
  if (evidence?.refusal) return result(evidence.refusal, before.row);
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE);
  // Neither the native read nor boot observation can carry an earlier row
  // across an await. Use the actual final row as the exact conditional basis.
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available) return result(OUTCOME.UNAVAILABLE);
  return finishActionRecording(repository, current.row, input, evidence, isCurrent, spec);
}
/** The caller's local invocation lifetime as a predicate (an absent one is
 * current); unavailable lifetime evidence is never current. */
function recordingInvocation(repository, isInvocationCurrent) {
  return () => {
    try {
      return !repository.isShuttingDownRequested() &&
        (isInvocationCurrent === undefined || isInvocationCurrent() === true);
    } catch {
      return false;
    }
  };
}
const LEARNER_RECEIPT_SET = 'message_group_membership_phase = ?, ' +
  'message_group_membership_permit = ?, message_group_learner_stamp = ?';
const LEARNER_RECORDING = Object.freeze({
  basisRefusal: recordingBasisRefusal,
  recorded: exactRecordedLearner,
  evidence: (observed, input, query) => learnerOutcomeEvidence(observed, input, query),
  receipt: (evidence) => ({set: LEARNER_RECEIPT_SET,
    params: [PHASE.LEARNER_COMMITTED, evidence.committedPermit, evidence.stamp]}),
  readback: (repository, row, input, evidence) =>
    recordingBasisRefusal(repository, row, input) === null &&
    recordedLearnerFactIsValid(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipPermit === evidence.committedPermit &&
    row.messageGroupLearnerStamp === evidence.stamp,
});
/** Advance only the learner phase after actual, exact native observation. */
async function recordMessageGroupLearnerOutcome(repository, request, readCommittedLearner,
  isInvocationCurrent) {
  const input = actionRecordingInput(request);
  if (!input || typeof readCommittedLearner !== 'function' ||
    (isInvocationCurrent !== undefined && typeof isInvocationCurrent !== 'function')) {
    return result(OUTCOME.INVALID);
  }
  return recordMembershipActionOutcome(repository, input, LEARNER_RECORDING,
    readCommittedLearner, recordingInvocation(repository, isInvocationCurrent));
}
export {recordMessageGroupLearnerOutcome};


/** Reconstruct only recording inputs from the authoritative operation owner.
 * No original caller packet is needed after restart or a lost write answer.
 * The ordinary action-issuance decoder still accepts only IN_FLIGHT permits.
 */
async function recoverMessageGroupLearnerOutcome(repository, operationId, readCommittedLearner,
  isInvocationCurrent) {
  if (typeof operationId !== 'string' || operationId.length === 0) return result(OUTCOME.INVALID);
  const observed = await observeMembershipOperation(repository, operationId);
  if (!observed.available) return result(OUTCOME.UNAVAILABLE);
  const row = observed.row;
  if (!row) return result(OUTCOME.CONFLICT);
  return recordMessageGroupLearnerOutcome(repository, {
    operationId, identity: row.messageGroupMembershipIdentity,
    permit: row.messageGroupMembershipPermit,
    executionClaim: row.messageGroupMembershipOwnerClaim,
  }, readCommittedLearner, isInvocationCurrent);
}
export {recoverMessageGroupLearnerOutcome};

/** The one validity predicate of a recorded learner fact, shared by
 * discovery's settled-row classification, the recorder's replay/readback and
 * new (not already-selected) promotion/abandonment branch selection.
 * It judges only the immutable historical record: the row's identity columns,
 * the committed phase with a COMMITTED ADD_LEARNER permit of this transition
 * (at the sequence carried by its persisted permit, whose exact origin the
 * recorder matched), no voter or removal stamp (the learner phase allows neither),
 * canonical permit and stamp encodings, and a learner stamp naming this
 * transition's source voter and target learner at or past the proposal index.
 * Pure: no claim, lease, boot or clock read, so a settled fact stays settled
 * after its lease expired or its owner restarted. The recorder's live write
 * gate stays in the recorder. A row that fails this is surfaced for owned
 * repair, never treated as settled debt. */
function recordedLearnerFactIsValid(row, identity, encodedIdentity) {
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  if (permit === null || !membershipRowIdentityMatches(row, identity, encodedIdentity) ||
    row.messageGroupMembershipPhase !== PHASE.LEARNER_COMMITTED ||
    permit.permitState !== STATE.COMMITTED || !learnerActionMatches(permit, identity) ||
    row.messageGroupVoterStamp !== null || row.messageGroupRemovalStamp !== null ||
    row.messageGroupMembershipPermit !== JSON.stringify(permit)) return false;
  const stamp = priorLearnerStamp(row, identity, permit);
  return stamp !== null && row.messageGroupLearnerStamp === JSON.stringify(stamp);
}
export {recordedLearnerFactIsValid};
