import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
/** One operation-row CAS selects promotion or pre-promotion abandonment.
 * This is a repository operation, not another workflow or runtime authority.
 * RECORDED means an exact durable intent exists; it is not a dispatch grant.
 */
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {ReplicaStatus} from './replica-status.js';
import {REBALANCE_COORDINATOR_LOG_MSG} from './rebalancer-constants.js';
import {committedStampOfAnswer, validateBootstrapMembershipStamp} from
  '../raft/raft-committed-membership-stamp.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {COMMITTED_LEARNER_ACTION_KIND as ACTION_KIND,
  COMMITTED_LEARNER_ACTION_REASON as ACTION_REASON,
  COMMITTED_MEMBERSHIP_READ_PURPOSE, COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL, COMMITTED_MEMBERSHIP_STAMP_DEFECT as STAMP_DEFECT} from '../raft/raft-committed-membership-constants.js';
import {encodeCommittedLearnerAdmission, decodeCommittedLearnerAdmission,
  INVALID_COMMITTED_LEARNER_ADMISSION} from '../raft/raft-rs-committed-membership-context.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, membershipBranchSpec,
  decodeMembershipOwnerClaim, membershipOwnerClaimFence} from
  './replica-operation-message-group-membership-permit.js';

import {observeMembershipOperation, membershipRowIdentityMatches,
  membershipClaimIsLocalAndLive, membershipBootIsCurrent,
  membershipRowWhere, neverAuthorized} from
  './replica-operation-message-group-membership-owner-claim.js';

const result = (outcome, operation = null) => Object.freeze({outcome, operation});
// A membership write whose answer was an error is neither committed nor lost:
// the caller resolves it by exact authoritative readback. The error is named
// here so an uncertain write is never silent.
function noteUncertainMembershipWrite(repository, operationId, error) {
  repository.logger?.debug?.(REBALANCE_COORDINATOR_LOG_MSG.MEMBERSHIP_WRITE_UNCERTAIN,
    {nodeId: repository.nodeId, operationId, error: error?.message || String(error)});
}
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
async function readBackSelectedBranch(repository, row, identity, prior, next) {
  const learner = priorLearnerStamp(row, identity, prior);
  if (!learner || !nextPermitFollowsLearner(next, learner)) return result(OUTCOME.INVALID, row);
  const currentClaim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  if (!membershipClaimIsLocalAndLive(repository, currentClaim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
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

async function selectMessageGroupMembershipBranch(repository, request) {
  // The only accepted representations here are scalar strings and encoded row values.
  if (!request || typeof request !== 'object') return result(OUTCOME.INVALID);
  const {operationId, identity: encodedIdentity, priorPermit, nextPermit, branch} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const prior = decodeMembershipPermit(priorPermit);
  const next = decodeMembershipPermit(nextPermit);
  const spec = membershipBranchSpec(branch);
  if (!identity || identity.operationId !== operationId || !prior || !next || !spec ||
    !permitsMatch(prior, next, identity, spec)) return result(OUTCOME.INVALID);
  const before = await observeMembershipOperation(repository, operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity)) {
    return result(OUTCOME.CONFLICT, row);
  }
  if (selectedBranchRecorded(row, spec, nextPermit)) {
    return readBackSelectedBranch(repository, row, identity, prior, next);
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
  const params = [spec.phase, nextPermit, MEMBERSHIP_OBLIGATION.UNKNOWN,
    operationId, row.type, row.partitionId, row.entityType, row.entityId,
    row.sourceReplicaId, row.replicaId, row.sourceNodeId, row.targetNodeId,
    row.messageGroupMembershipLaneKey, row.messageGroupMembershipIdentity,
    row.messageGroupSourceLifecycleClaim, row.messageGroupMembershipOwnerClaim, row.status,
    row.workflowStep, ...settlement.params, PHASE.LEARNER_COMMITTED, priorPermit,
    MEMBERSHIP_OBLIGATION.UNKNOWN, row.messageGroupLearnerStamp];
  // A false or lost answer is not a cancellation. Re-observe the exact row;
  // retrying this same CAS or its competing branch is safe on the same basis.
  try {
    await repository.executeOperationMutationWithRetry(branchSelectionSql(settlement), params);
  } catch (error) {
    // The exact authoritative read below resolves an uncertain write result.
    noteUncertainMembershipWrite(repository, operationId, error);
  }
  const after = await observeMembershipOperation(repository, operationId);
  if (!after.available) return result(OUTCOME.UNKNOWN);
  const observed = after.row;
  if (membershipRowIdentityMatches(observed, identity, encodedIdentity) &&
    observed.messageGroupMembershipPhase === spec.phase &&
    observed.messageGroupMembershipPermit === nextPermit &&
    observed.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    observed.messageGroupLearnerStamp === row.messageGroupLearnerStamp &&
    observed.messageGroupSourceLifecycleClaim === row.messageGroupSourceLifecycleClaim &&
    observed.messageGroupMembershipOwnerClaim === row.messageGroupMembershipOwnerClaim &&
    membershipClaimIsLocalAndLive(repository, claim, identity) &&
    await membershipBootIsCurrent(repository)) {
    return result(OUTCOME.RECORDED, observed);
  }
  return result(OUTCOME.UNKNOWN, observed);
}
export {selectMessageGroupMembershipBranch};

function initialLearnerActionMatches(permit, identity) {
  return permit.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
    permit.permitSequence === 1 && permit.transitionIdentity === identity.transitionIdentity &&
    permit.replicaIdentity === identity.targetReplicaId && permit.peerId === identity.targetPeerId;
}
function initialLearnerPermitMatches(permit, identity) {
  return initialLearnerActionMatches(permit, identity) &&
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
function learnerRecordingInput(request) {
  const data = copyStrictOwnDataRecord(request);
  if (!data) return null;
  const {operationId, identity: encodedIdentity, permit: encodedPermit, executionClaim} = data;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const permit = decodeMembershipPermit(encodedPermit);
  const claim = decodeMembershipOwnerClaim(executionClaim);
  if (!identity || identity.operationId !== operationId || !permit || !claim ||
    !initialLearnerActionMatches(permit, identity)) return null;
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
// Preserve the native owner's distinction: unresolved history is not a conflict,
// and an invalid/mismatched origin is not transient transport unavailability.
function learnerObservationRefusal(observed) {
  if (observed?.kind === ACTION_KIND.UNRESOLVED &&
    observed.reason === ACTION_REASON.NOT_RECORDED) return OUTCOME.UNKNOWN;
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
  const refusal = learnerObservationRefusal(observed);
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
async function observeLearnerRecording(readCommittedLearner, input) {
  const query = learnerOutcomeQuery(input);
  try {
    return learnerOutcomeEvidence(await readCommittedLearner(query), input, query);
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
async function recordObservedLearner(repository, row, input, evidence, isCurrent) {
  const basis = membershipRowWhere(row);
  const submissionIsCurrent = () => isCurrent() &&
    membershipClaimIsLocalAndLive(repository, input.claim, input.identity);
  // A retry is a NEW submission, even when it retains the logical write ID.
  // Sample boot authority through its owner each time; after that await the
  // gateway checks local invocation/lease again immediately before submission.
  const beforeAttempt = async () => submissionIsCurrent() &&
    await membershipBootIsCurrent(repository);
  try {
    await repository.executeOperationMutationWithRetry(
      `UPDATE replica_operations SET message_group_membership_phase = ?,
        message_group_membership_permit = ?, message_group_learner_stamp = ?
        WHERE ${basis.where}`,
      [PHASE.LEARNER_COMMITTED, evidence.committedPermit, evidence.stamp, ...basis.params],
      {beforeAttempt, submissionIsCurrent});
  } catch (error) {
    // COMMIT may have succeeded. Only exact owner readback settles that answer.
    noteUncertainMembershipWrite(repository, input.operationId, error);
  }
  // A write already submitted may have committed even if the invocation dies.
  // No host callback purports to revoke a command already inside another owner.
  if (!isCurrent() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, input.operationId);
  if (!isCurrent() || !after.available) return result(OUTCOME.UNKNOWN);
  const recorded = recordingBasisRefusal(repository, after.row, input) === null &&
    recordedLearnerFactIsValid(after.row, input.identity, input.encodedIdentity) &&
    after.row.messageGroupMembershipPermit === evidence.committedPermit &&
    after.row.messageGroupLearnerStamp === evidence.stamp;
  return result(recorded ? OUTCOME.RECORDED : OUTCOME.UNKNOWN, after.row);
}
function finishLearnerRecording(repository, row, input, evidence, isCurrent) {
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const refusal = recordingBasisRefusal(repository, row, input);
  if (refusal !== null) return result(refusal, row);
  if (exactRecordedLearner(row, input)) return result(OUTCOME.RECORDED, row);
  // An already-recorded observation cannot regress back into an in-flight row.
  if (evidence === null) return result(OUTCOME.CONFLICT, row);
  return recordObservedLearner(repository, row, input, evidence, isCurrent);
}
/** Advance only the membership phase after actual, exact native observation.
 * The same-row CAS includes immutable identity, prior permit, holder, phase,
 * terminal status/step/time and every membership stamp. Ordinary progress,
 * membership debt/lane, reservations and physical CREATE remain untouched.
 */
async function recordMessageGroupLearnerOutcome(repository, request, readCommittedLearner,
  isInvocationCurrent) {
  const input = learnerRecordingInput(request);
  if (!input || typeof readCommittedLearner !== 'function' ||
    (isInvocationCurrent !== undefined && typeof isInvocationCurrent !== 'function')) {
    return result(OUTCOME.INVALID);
  }
  const isCurrent = () => {
    try {
      return !repository.isShuttingDownRequested() &&
        (isInvocationCurrent === undefined || isInvocationCurrent() === true);
    } catch {
      return false;
    }
  };
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const initialRefusal = recordingBasisRefusal(repository, before.row, input);
  if (initialRefusal !== null) return result(initialRefusal, before.row);
  const evidence = exactRecordedLearner(before.row, input) ? null :
    await observeLearnerRecording(readCommittedLearner, input);
  if (evidence?.refusal) return result(evidence.refusal, before.row);
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE);
  // Neither the native read nor boot observation can carry an earlier row
  // across an await. Use the actual final row as the exact conditional basis.
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available) return result(OUTCOME.UNAVAILABLE);
  return finishLearnerRecording(repository, current.row, input, evidence, isCurrent);
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

/** The one validity predicate of a recorded initial learner fact, shared by
 * discovery's settled-row classification, the recorder's replay/readback and
 * new (not already-selected) promotion/abandonment branch selection.
 * It judges only the immutable historical record: the row's identity columns,
 * the committed phase with a COMMITTED initial ADD_LEARNER permit of this
 * transition, no voter or removal stamp (the learner phase allows neither),
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
    permit.permitState !== STATE.COMMITTED || !initialLearnerActionMatches(permit, identity) ||
    row.messageGroupVoterStamp !== null || row.messageGroupRemovalStamp !== null ||
    row.messageGroupMembershipPermit !== JSON.stringify(permit)) return false;
  const stamp = priorLearnerStamp(row, identity, permit);
  return stamp !== null && row.messageGroupLearnerStamp === JSON.stringify(stamp);
}
export {recordedLearnerFactIsValid};

// The recorded fact's columns a current CREATE's admission CAS repeats, as the
// [column, decoded field] pairs membershipRowWhere takes (rowToOperation keeps
// each of these values exactly, so the decoded value is the column value).
const RECORDED_LEARNER_FACT_COLUMNS = Object.freeze([
  ['message_group_membership_identity', 'messageGroupMembershipIdentity'],
  ['message_group_membership_phase', 'messageGroupMembershipPhase'],
  ['message_group_membership_obligation_state', 'messageGroupMembershipObligationState'],
  ['message_group_membership_permit', 'messageGroupMembershipPermit'],
  ['message_group_learner_stamp', 'messageGroupLearnerStamp'],
  ['message_group_voter_stamp', 'messageGroupVoterStamp'],
  ['message_group_removal_stamp', 'messageGroupRemovalStamp']]);
/** Current CREATE consumes the recorded fact like a new branch selection: the
 * shared predicate first, then the still-outstanding UNKNOWN obligation. The
 * answer is the decoded identity, the recorded stamp and permit, the fact's
 * exact membership columns as the basis the CREATE admission CAS, its
 * MATERIALIZED advance and the learner install repeat, so a later phase (a
 * REMOVE selection) defeats them, and the exact committed origin bytes the
 * native ADD_LEARNER left (recordedLearnerOrigin). Null when the row carries
 * no such fact. Pure; not a grant. */
function recordedLearnerCreateBasis(row) {
  const identity = decodeMembershipIdentity(row?.messageGroupMembershipIdentity);
  if (!identity || !recordedLearnerFactIsValid(row, identity, row.messageGroupMembershipIdentity) ||
    row.messageGroupMembershipObligationState !== MEMBERSHIP_OBLIGATION.UNKNOWN) return null;
  const where = Object.freeze(Object.fromEntries(
    RECORDED_LEARNER_FACT_COLUMNS.map(([column, field]) => [column, row[field]])));
  return Object.freeze({identity, where,
    learnerStamp: row.messageGroupLearnerStamp, committedPermit: row.messageGroupMembershipPermit,
    learnerOrigin: recordedLearnerOrigin(identity,
      decodeMembershipPermit(row.messageGroupMembershipPermit))});
}
export {recordedLearnerCreateBasis};

/** The exact committed origin of a recorded learner, in the native owner's own
 * encoding: the recorder records a permit only when the original action's
 * origin matched this action at its proposal index and leader term
 * (originalLearnerOriginMatches, committedLearnerPermit), so every replica that
 * applied the ADD_LEARNER, and every image sealed after it, carries exactly
 * these bytes beside the learner's reservation. Pure. */
function recordedLearnerOrigin(identity, permit) {
  const action = learnerOutcomeQuery({operationId: identity.operationId, identity, permit}).action;
  return encodeCommittedLearnerAdmission({groupId: identity.groupId,
    index: String(permit.proposalIndex), term: String(permit.leaderTerm), context: action});
}
