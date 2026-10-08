/** One operation-row CAS selects promotion or pre-promotion abandonment.
 * This is a repository operation, not another workflow or runtime authority.
 * RECORDED means an exact durable intent exists; it is not a dispatch grant.
 */
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {ReplicaStatus} from './replica-status.js';
import {committedStampOfAnswer} from '../raft/raft-committed-membership-stamp.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
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
function branchSettlementGuard(repository, row, spec) {
  if (!repository.isOperationTerminal(row)) {
    return row.completedAt === null ? {sql: 'completed_at IS NULL', params: []} : null;
  }
  if (row.status !== ReplicaStatus.FAILED || row.workflowStep !== WORKFLOW_STEP.FAILED ||
    spec.phase !== PHASE.TARGET_REMOVAL_IN_FLIGHT ||
    !Number.isSafeInteger(row.completedAt) || row.completedAt <= 0) return null;
  return {sql: 'completed_at = ?', params: [row.completedAt]};
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

function initialLearnerPermitMatches(permit, identity) {
  return permit.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
    permit.permitState === STATE.IN_FLIGHT && permit.permitSequence === 1 &&
    permit.proposalIndex === null && permit.transitionIdentity === identity.transitionIdentity &&
    permit.replicaIdentity === identity.targetReplicaId && permit.peerId === identity.targetPeerId;
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
