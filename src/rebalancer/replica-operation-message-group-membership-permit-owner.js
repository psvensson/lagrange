import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway.js';
import {committedStampOfAnswer} from
  '../raft/raft-committed-membership-stamp.js';
import {buildMessageGroupMembershipWorkflowOwnerFence,
  encodeMessageGroupMembershipIdentity,
  encodeMessageGroupMembershipPermit, membershipLeaseExpiry,
  MESSAGE_GROUP_MEMBERSHIP_PERMIT_STAGE as STAGE,
  MESSAGE_GROUP_MEMBERSHIP_PERMIT_STATE as STATE,
  normalizeMessageGroupMembershipIdentity,
  normalizeMessageGroupMembershipPermit, stageOrdinal} from
  './replica-operation-message-group-membership-permit.js';

const objectIs = Object.is.bind(Object);
const jsonStringify = JSON.stringify.bind(JSON);
const numberIsSafeInteger = Number.isSafeInteger.bind(Number);

const READ = Object.freeze({authoritativeReadMode:
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED});
const OUTCOME = Object.freeze({APPLIED: 'applied', CONFLICT: 'conflict',
  UNAVAILABLE: 'unavailable', APPLIED_UNOBSERVED: 'applied_unobserved',
  TERMINAL_FIRST: 'terminal_first', OBSERVED: 'observed'});
const OBLIGATION = Object.freeze({DEFINITIVE_NON_ADMISSION:
  'definitive_non_admission', RESOLVED_ABSENT: 'resolved_absent',
UNKNOWN: 'unknown'});
const INITIAL_PHASE = 'learner_requested';
const PHASE = Object.freeze({[STAGE.ADD_LEARNER]:
  'learner_proposal_in_flight', [STAGE.PROMOTE]:
  'promotion_proposal_in_flight', [STAGE.REMOVE]:
  'removal_proposal_in_flight'});
const COMMITTED_PHASE = Object.freeze({[STAGE.ADD_LEARNER]:
  'learner_committed', [STAGE.PROMOTE]: 'voter_committed',
[STAGE.REMOVE]: 'removal_committed'});
const STAMP_COLUMN = Object.freeze({
  [STAGE.ADD_LEARNER]: 'message_group_learner_stamp',
  [STAGE.PROMOTE]: 'message_group_voter_stamp',
  [STAGE.REMOVE]: 'message_group_removal_stamp',
});
const STAMP_FIELD = Object.freeze({
  [STAGE.ADD_LEARNER]: 'messageGroupLearnerStamp',
  [STAGE.PROMOTE]: 'messageGroupVoterStamp',
  [STAGE.REMOVE]: 'messageGroupRemovalStamp',
});

function result(outcome, operation = null) {
  return Object.freeze({outcome, operation});
}
function changed(answer) {
  return answer?.success === true &&
    Number(answer.affectedRows ?? answer.changes) === 1;
}
function possiblyChanged(answer) {
  return changed(answer) || answer?.unknownMutationOutcome === true ||
    answer instanceof Error;
}
function permitFenceMatches(permit) {
  return permit.workflowOwnerFence ===
    buildMessageGroupMembershipWorkflowOwnerFence(
      permit.workflowOwnerNodeId, permit.membershipLeaseExpiresAt);
}
function exactPermitTransition(prior, next) {
  return permitFenceMatches(prior) && permitFenceMatches(next) &&
    next.transitionIdentity === prior.transitionIdentity &&
    next.workflowOwnerNodeId === prior.workflowOwnerNodeId &&
    next.permitSequence === prior.permitSequence + 1 &&
    next.permitState === STATE.IN_FLIGHT && next.proposalIndex === null &&
    stageOrdinal(next.permitStage) === stageOrdinal(prior.permitStage) + 1;
}
function arrayHasValue(values, expected) {
  if (!Array.isArray(values)) return false;
  for (const value of values) {
    if (value === expected) return true;
  }
  return false;
}
function targetAbsent(stamp, peerId) {
  return !arrayHasValue(stamp.voters, peerId) &&
    !arrayHasValue(stamp.votersOutgoing, peerId) &&
    !arrayHasValue(stamp.learners, peerId) &&
    !arrayHasValue(stamp.learnersNext, peerId);
}
function stageSatisfied(stage, stamp, peerId) {
  if (stage === STAGE.ADD_LEARNER) return arrayHasValue(stamp.learners, peerId);
  if (stage === STAGE.PROMOTE) return arrayHasValue(stamp.voters, peerId);
  return targetAbsent(stamp, peerId);
}
function positiveSafeInteger(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) &&
    !objectIs(value, -0) && value > 0;
}
function nonnegativeSafeInteger(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) &&
    !objectIs(value, -0) && value >= 0;
}
function receiptOrdered(receipt, permit, stamp) {
  const settlement = receipt?.settlementAppliedIndex;
  return positiveSafeInteger(permit.proposalIndex) &&
    positiveSafeInteger(settlement) && settlement >= permit.proposalIndex &&
    stamp.appliedIndex >= settlement;
}
function receiptConfigurationCoherent(permit, stamp) {
  const prior = permit.leaderConfigurationStamp;
  return stamp.membershipGenerationIndex > prior.membershipGenerationIndex ||
    (stamp.membershipGenerationIndex === prior.membershipGenerationIndex &&
      stamp.configurationKey === prior.configurationKey);
}
function numericLeaseExpiresAt(operation) {
  const value = operation?.ownerLeaseExpiresAt ?? operation?.lease_expires_at;
  return typeof value === 'number' && numberIsSafeInteger(value) &&
    !objectIs(value, -0) && value > 0 ? value : null;
}
function rowOwnerBinding(repository, operation) {
  const ownerNodeId = typeof repository.resolveOperationOwnerNodeId === 'function' ?
    repository.resolveOperationOwnerNodeId(operation) : null;
  const leaseExpiresAt = numericLeaseExpiresAt(operation);
  const workflowOwnerFence = buildMessageGroupMembershipWorkflowOwnerFence(
    ownerNodeId, leaseExpiresAt);
  return ownerNodeId && leaseExpiresAt && workflowOwnerFence ?
    Object.freeze({ownerNodeId, leaseExpiresAt, workflowOwnerFence}) : null;
}
function exactExpiredTakeover(prior, next, leaseExpiry, identity) {
  return prior.membershipLeaseExpiresAt <= leaseExpiry &&
    next.membershipLeaseExpiresAt === leaseExpiry &&
    prior.transitionIdentity === identity.transitionIdentity &&
    next.transitionIdentity === identity.transitionIdentity &&
    next.permitSequence === prior.permitSequence + 1 &&
    next.permitStage === prior.permitStage &&
    permitFenceMatches(prior) && permitFenceMatches(next) &&
    next.workflowOwnerNodeId !== prior.workflowOwnerNodeId &&
    next.workflowOwnerFence !== prior.workflowOwnerFence &&
    next.permitState === STATE.IN_FLIGHT && next.proposalIndex === null;
}
function committedReceipt(receipt, permit, identity) {
  const stamp = committedStampOfAnswer(receipt?.committedMembership);
  if (!stamp || !receiptOrdered(receipt, permit, stamp) ||
      !receiptConfigurationCoherent(permit, stamp) ||
      !stageSatisfied(permit.permitStage, stamp, identity.targetPeerId)) {
    return null;
  }
  return Object.freeze({stamp, encoded: jsonStringify(stamp)});
}

class ReplicaOperationMessageGroupMembershipPermitOwner {
  constructor(repository) {
    this.repository = repository;
  }
  async observe(operationId) {
    try {
      const operation = await this.repository.queryAuthoritativeOperationById(
        operationId, READ);
      return operation ? result(OUTCOME.OBSERVED, operation) :
        result(OUTCOME.CONFLICT);
    } catch (_error) {
      return result(OUTCOME.UNAVAILABLE);
    }
  }
  async mutate(sql, params, operationId, winner) {
    let answer = null;
    try {
      answer = await this.repository.executeOperationMutationWithRetry(
        sql, params);
    } catch (error) {
      answer = Object.freeze({success: false, unknownMutationOutcome: true,
        error});
    }
    const observed = await this.observe(operationId);
    if (observed.outcome === OUTCOME.UNAVAILABLE) {
      return possiblyChanged(answer) ? result(OUTCOME.APPLIED_UNOBSERVED) :
        observed;
    }
    if (winner(observed.operation)) {
      return result(OUTCOME.APPLIED,
        observed.operation);
    }
    return result(OUTCOME.CONFLICT, observed.operation);
  }
  authorizeLearner(operationId, identityInput, permitInput, nowMs) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const permit = normalizeMessageGroupMembershipPermit(permitInput);
    const encodedIdentity = encodeMessageGroupMembershipIdentity(identity);
    const encodedPermit = encodeMessageGroupMembershipPermit(permit);
    if (identity.operationId !== operationId ||
        identity.transitionIdentity !== permit.transitionIdentity ||
        !nonnegativeSafeInteger(nowMs) ||
        permit.permitSequence !== 1 ||
        permit.permitStage !== STAGE.ADD_LEARNER ||
        permit.permitState !== STATE.IN_FLIGHT || permit.proposalIndex !== null) {
      return Promise.resolve(result(OUTCOME.CONFLICT));
    }
    return this.observe(operationId).then((observed) => {
      if (observed.outcome !== OUTCOME.OBSERVED) return observed;
      const binding = rowOwnerBinding(this.repository, observed.operation);
      if (!binding || binding.leaseExpiresAt <= nowMs ||
          binding.ownerNodeId !== permit.workflowOwnerNodeId ||
          binding.leaseExpiresAt !== permit.membershipLeaseExpiresAt ||
          binding.workflowOwnerFence !== permit.workflowOwnerFence) {
        return result(OUTCOME.CONFLICT, observed.operation);
      }
      return this.mutate(`UPDATE replica_operations SET
        message_group_membership_phase = 'learner_proposal_in_flight',
        message_group_membership_obligation_state = 'unknown',
        message_group_membership_permit = ?
        WHERE operation_id = ? AND message_group_membership_lane_key = ?
        AND message_group_membership_identity = ?
        AND message_group_membership_phase = 'learner_requested'
        AND message_group_membership_obligation_state = 'intent_recorded'
        AND message_group_membership_permit IS NULL AND completed_at IS NULL
        AND source_node_id = ? AND target_node_id = ? AND lease_expires_at = ?`,
      [encodedPermit, operationId, identity.membershipLaneKey, encodedIdentity,
        observed.operation.sourceNodeId, observed.operation.targetNodeId,
        binding.leaseExpiresAt],
      operationId, (row) => row?.messageGroupMembershipIdentity ===
        encodedIdentity &&
        row?.messageGroupMembershipLaneKey === identity.membershipLaneKey &&
        row?.messageGroupMembershipPhase === PHASE[STAGE.ADD_LEARNER] &&
        row?.messageGroupMembershipObligationState === OBLIGATION.UNKNOWN &&
        row?.messageGroupMembershipPermit === encodedPermit);
    });
  }
  settleTerminalFirst(operationId, identityInput) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const encodedIdentity = encodeMessageGroupMembershipIdentity(identity);
    return this.mutate(`UPDATE replica_operations SET
      message_group_membership_lane_key = NULL,
      message_group_membership_obligation_state = 'definitive_non_admission'
      WHERE operation_id = ? AND message_group_membership_lane_key = ?
      AND message_group_membership_identity = ?
      AND message_group_membership_phase = 'learner_requested'
      AND message_group_membership_obligation_state = 'intent_recorded'
      AND message_group_membership_permit IS NULL
      AND completed_at IS NOT NULL`,
    [operationId, identity.membershipLaneKey, encodedIdentity], operationId,
    (row) => row?.messageGroupMembershipIdentity === encodedIdentity &&
      row?.messageGroupMembershipLaneKey === null &&
      row?.messageGroupMembershipPhase === INITIAL_PHASE &&
      row?.messageGroupMembershipObligationState ===
        OBLIGATION.DEFINITIVE_NON_ADMISSION &&
      row?.messageGroupMembershipPermit === null).then((answer) =>
      answer.outcome === OUTCOME.APPLIED ?
        result(OUTCOME.TERMINAL_FIRST, answer.operation) : answer);
  }
  takeOverExpired(operationId, identityInput, priorInput, nextInput, nowMs) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const prior = normalizeMessageGroupMembershipPermit(priorInput);
    const next = normalizeMessageGroupMembershipPermit(nextInput);
    const leaseExpiry = membershipLeaseExpiry(nowMs);
    if (!exactExpiredTakeover(prior, next, leaseExpiry, identity) ||
        prior.membershipLeaseExpiresAt > nowMs) {
      return Promise.resolve(result(OUTCOME.CONFLICT));
    }
    return this.replacePermit(operationId, identity, prior, next,
      PHASE[prior.permitStage]);
  }
  advanceStage(operationId, identityInput, priorInput, nextInput, nowMs) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const prior = normalizeMessageGroupMembershipPermit(priorInput);
    const next = normalizeMessageGroupMembershipPermit(nextInput);
    const leaseExpiry = membershipLeaseExpiry(nowMs);
    if (prior.permitState !== STATE.COMMITTED ||
        prior.membershipLeaseExpiresAt <= nowMs ||
        next.membershipLeaseExpiresAt !== leaseExpiry ||
        !exactPermitTransition(prior, next)) {
      return Promise.resolve(result(OUTCOME.CONFLICT));
    }
    return this.replacePermit(operationId, identity, prior, next,
      COMMITTED_PHASE[prior.permitStage], PHASE[next.permitStage]);
  }
  recordProposalAnchor(operationId, identityInput, priorInput, proposalIndex) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const prior = normalizeMessageGroupMembershipPermit(priorInput);
    if (!numberIsSafeInteger(proposalIndex) || objectIs(proposalIndex, -0) ||
        proposalIndex <= 0 || prior.permitState !== STATE.IN_FLIGHT ||
        prior.proposalIndex !== null) {
      return Promise.resolve(
        result(OUTCOME.CONFLICT));
    }
    return this.replacePermit(operationId, identity, prior,
      {...prior, permitState: STATE.ANCHORED, proposalIndex},
      PHASE[prior.permitStage]);
  }
  recordCommittedStage(operationId, identityInput, priorInput, receipt) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const prior = normalizeMessageGroupMembershipPermit(priorInput);
    const committed = prior.permitState === STATE.ANCHORED ?
      committedReceipt(receipt, prior, identity) : null;
    if (!committed) return Promise.resolve(result(OUTCOME.CONFLICT));
    const before = encodeMessageGroupMembershipPermit(prior);
    const after = encodeMessageGroupMembershipPermit({...prior,
      permitState: STATE.COMMITTED});
    const column = STAMP_COLUMN[prior.permitStage];
    return this.mutate(`UPDATE replica_operations SET ${column} = ?,
      message_group_membership_permit = ?,
      message_group_membership_phase = ?
      WHERE operation_id = ? AND message_group_membership_lane_key = ?
      AND message_group_membership_identity = ?
      AND message_group_membership_phase = ?
      AND message_group_membership_permit = ?`,
    [committed.encoded, after, COMMITTED_PHASE[prior.permitStage], operationId,
      identity.membershipLaneKey, encodeMessageGroupMembershipIdentity(identity),
      PHASE[prior.permitStage], before], operationId,
    (row) => row?.messageGroupMembershipIdentity ===
      encodeMessageGroupMembershipIdentity(identity) &&
      row?.messageGroupMembershipLaneKey === identity.membershipLaneKey &&
      row?.messageGroupMembershipPermit === after &&
      row?.messageGroupMembershipPhase === COMMITTED_PHASE[prior.permitStage] &&
      row?.[STAMP_FIELD[prior.permitStage]] === committed.encoded);
  }
  releaseLane(operationId, identityInput, permitInput, receipt) {
    const identity = normalizeMessageGroupMembershipIdentity(identityInput);
    const permit = normalizeMessageGroupMembershipPermit(permitInput);
    const committed = permit.permitStage === STAGE.REMOVE &&
      permit.permitState === STATE.COMMITTED ?
      committedReceipt(receipt, {...permit, permitState: STATE.ANCHORED}, identity) :
      null;
    if (!committed) return Promise.resolve(result(OUTCOME.CONFLICT));
    const encodedPermit = encodeMessageGroupMembershipPermit(permit);
    return this.mutate(`UPDATE replica_operations SET
      message_group_membership_lane_key = NULL,
      message_group_membership_obligation_state = 'resolved_absent'
      WHERE operation_id = ? AND message_group_membership_lane_key = ?
      AND message_group_membership_identity = ?
      AND message_group_membership_phase = 'removal_committed'
      AND message_group_membership_permit = ?
      AND message_group_removal_stamp = ?`,
    [operationId, identity.membershipLaneKey,
      encodeMessageGroupMembershipIdentity(identity), encodedPermit,
      committed.encoded], operationId,
    (row) => row?.messageGroupMembershipLaneKey === null &&
      row?.messageGroupMembershipObligationState === OBLIGATION.RESOLVED_ABSENT &&
      row?.messageGroupMembershipPhase === COMMITTED_PHASE[STAGE.REMOVE] &&
      row?.messageGroupMembershipIdentity === encodeMessageGroupMembershipIdentity(
        identity) &&
      row?.messageGroupMembershipPermit === encodedPermit &&
      row?.messageGroupRemovalStamp === committed.encoded);
  }
  replacePermit(operationId, identity, prior, next, expectedPhase,
    nextPhase = expectedPhase) {
    const before = encodeMessageGroupMembershipPermit(prior);
    const after = encodeMessageGroupMembershipPermit(next);
    return this.mutate(`UPDATE replica_operations SET
      message_group_membership_permit = ?,
      message_group_membership_phase = ?
      WHERE operation_id = ? AND message_group_membership_lane_key = ?
      AND message_group_membership_identity = ?
      AND message_group_membership_phase = ?
      AND message_group_membership_permit = ?`,
    [after, nextPhase, operationId, identity.membershipLaneKey,
      encodeMessageGroupMembershipIdentity(identity), expectedPhase, before],
    operationId, (row) => row?.messageGroupMembershipIdentity ===
      encodeMessageGroupMembershipIdentity(identity) &&
      row?.messageGroupMembershipLaneKey === identity.membershipLaneKey &&
      row?.messageGroupMembershipPermit === after &&
      row?.messageGroupMembershipPhase === nextPhase);
  }
}

export {OUTCOME as MESSAGE_GROUP_MEMBERSHIP_PERMIT_OUTCOME,
  ReplicaOperationMessageGroupMembershipPermitOwner};
