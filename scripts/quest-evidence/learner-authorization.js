
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
/** Record the initial exact learner action under the existing membership holder.
 * The operation-row commit is durable intent, NOT a runtime or physical grant.
 * Destination/term/configuration freshness is still checked by the runtime consumer.
 */
async function authorizeMessageGroupLearner(repository, request) {
  if (!request || typeof request !== 'object') return result(OUTCOME.INVALID);
  const {operationId, identity: encodedIdentity, permit: encodedPermit} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  const permit = decodeMembershipPermit(encodedPermit);
  if (!identity || identity.operationId !== operationId || !permit ||
    !initialLearnerPermitMatches(permit, identity)) return result(OUTCOME.INVALID);
  const before = await observeMembershipOperation(repository, operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity)) {
    return result(OUTCOME.CONFLICT, row);
  }
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  // Same recorded bytes survive ordinary settlement and holder takeover. Reading
  // them does not renew, replace, cancel or dispatch that original action.
  if (recordedLearnerIntent(row, encodedPermit)) {
    if (!membershipClaimIsLocalAndLive(repository, claim, identity)) {
      return result(OUTCOME.STALE_OWNER, row);
    }
    if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
    return result(OUTCOME.RECORDED, row);
  }
  if (repository.isOperationTerminal(row) || row.completedAt !== null ||
    !neverAuthorized(row) ||
    row.messageGroupMembershipObligationState !== MEMBERSHIP_OBLIGATION.INTENT_RECORDED) {
    return result(OUTCOME.CONFLICT, row);
  }
  if (!membershipPermitMatchesHolder(repository, permit, claim, identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  if (!await membershipBootIsCurrent(repository)) return result(OUTCOME.UNAVAILABLE, row);
  // Reuse the exact row predicate shared with claim/T0, including ordinary
  // terminal fields and the observed holder. A stale preterminal read cannot win.
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
export {authorizeMessageGroupLearner};
