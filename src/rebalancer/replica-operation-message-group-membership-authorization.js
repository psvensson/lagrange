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
  const learner = priorLearnerStamp(row, identity, prior);
  if (!learner || next.leaderConfigurationStamp.configurationKey !== learner.configurationKey ||
    next.leaderConfigurationStamp.membershipGenerationIndex !== learner.membershipGenerationIndex ||
    next.leaderTerm < learner.term) return result(OUTCOME.INVALID, row);
  // Idempotent read-back does not renew a lease or create runtime authority.
  if (row.messageGroupMembershipPhase === spec.phase &&
    row.messageGroupMembershipPermit === nextPermit &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN) {
    const currentClaim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
    if (!membershipClaimIsLocalAndLive(repository, currentClaim, identity)) {
      return result(OUTCOME.STALE_OWNER, row);
    }
    if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
    return result(OUTCOME.RECORDED, row);
  }
  const settlement = branchSettlementGuard(repository, row, spec);
  if (!settlement ||
    row.messageGroupMembershipPhase !== PHASE.LEARNER_COMMITTED ||
    row.messageGroupMembershipPermit !== priorPermit ||
    row.messageGroupMembershipObligationState !== MEMBERSHIP_OBLIGATION.UNKNOWN ||
    row.messageGroupVoterStamp !== null || row.messageGroupRemovalStamp !== null) {
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
  } catch {
    // The exact authoritative read below resolves an uncertain write result.
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
  } catch {
    // An unknown write may still commit. Only exact owner readback resolves it.
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
function exactRecordedLearner(row, input) {
  const permit = decodeMembershipPermit(row.messageGroupMembershipPermit);
  return row.messageGroupMembershipPhase === PHASE.LEARNER_COMMITTED &&
    permit?.permitState === STATE.COMMITTED &&
    row.messageGroupMembershipPermit === committedLearnerPermit(input, permit.proposalIndex) &&
    priorLearnerStamp(row, input.identity, permit) !== null;
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
  } catch {
    // COMMIT may have succeeded. Only exact owner readback settles that answer.
  }
  // A write already submitted may have committed even if the invocation dies.
  // No host callback purports to revoke a command already inside another owner.
  if (!isCurrent() || !await membershipBootIsCurrent(repository)) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, input.operationId);
  if (!isCurrent() || !after.available) return result(OUTCOME.UNKNOWN);
  const recorded = recordingBasisRefusal(repository, after.row, input) === null &&
    after.row.messageGroupMembershipPhase === PHASE.LEARNER_COMMITTED &&
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
