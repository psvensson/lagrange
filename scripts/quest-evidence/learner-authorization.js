
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
