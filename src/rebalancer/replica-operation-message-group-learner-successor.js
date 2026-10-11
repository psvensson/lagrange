/** Ordered successor of a message-group membership action, subordinate to
 * ReplicaOperationRepository (runbook 6.C, slice C1; the promotion attempt
 * since slice C2, through the same fence).
 *
 * Trigger: a holder's reconcile turn whose recorder read answered NONCOMMITTED.
 * Facts, every one read here: the authoritative operation row with the
 * in-flight attempt it owes, the learner action (no stamp) or the promotion
 * (the recorded learner stamp, no voter or removal stamp), on an open ordinary
 * operation with UNKNOWN obligation; the repository's own exact native read of that
 * attempt through the caller's read capability, classified by the recorder:
 * NOT_RECORDED in one queued observation of a replica that leads a strictly
 * newer term and has applied an entry of that term, so the attempt can never
 * commit; the live local holder claim; this node's and the destination's
 * canonical boot.
 * Action: one exact operation-row CAS changes only the permit column to the
 * next attempt of the SAME transition: permit sequence plus one, the fencing
 * observation's leader term, configuration stamp, lifecycle and runtime fences,
 * the current holder's fences and the observed leader's node as destination.
 * Phase stays in flight and the obligation UNKNOWN; ordinary history, claim,
 * stamps, lane and reservation are untouched. Never a refresh of the old permit.
 * Ordering: the native turn proposes the successor only at that leader's exact
 * term and configuration with no configuration change pending, so it cannot
 * commit beside the predecessor (raft-rs-membership-transition-runtime.js,
 * raft-rs-conf-change-admission.js). RECORDED means the successor attempt of
 * this predecessor is durably issued (ours or a concurrent issuer's); it is
 * not a proposal, a commit, CREATE or a lane release.
 */
import {readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, decodeMembershipOwnerClaim,
  membershipOwnerClaimFence, encodeMembershipPermit, membershipActionPhases,
  membershipActionMatches} from './replica-operation-message-group-membership-permit.js';
import {observeMembershipOperation, membershipRowIdentityMatches,
  membershipClaimIsLocalAndLive, membershipBootIsCurrent, membershipRowWhere,
  MEMBERSHIP_AUTHORIZATION_READ_OPTIONS as READ} from
  './replica-operation-message-group-membership-owner-claim.js';
import {observeLearnerActionAbsence, noteUncertainMembershipWrite,
  recordingSettlementAllowed} from
  './replica-operation-message-group-membership-authorization.js';

const NODE_BOOT_SQL = 'SELECT node_id, boot_incarnation FROM nodes WHERE node_id = ?';
const SUCCESSOR_PERMIT_SQL =
  'UPDATE replica_operations SET message_group_membership_permit = ? WHERE';
const result = (outcome, operation = null) => Object.freeze({outcome, operation});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

function successorRequest(request) {
  const data = copyStrictOwnDataRecord(request);
  if (!data || !nonempty(data.operationId) || !nonempty(data.destinationNodeId) ||
    !nonempty(data.destinationReplicaId)) return null;
  return Object.freeze({operationId: data.operationId,
    destinationNodeId: data.destinationNodeId, destinationReplicaId: data.destinationReplicaId});
}
// An attempt of a recorded action of this transition (the learner action or
// the promotion, membershipActionPhases), for its exact target.
function actionAttemptMatches(permit, identity) {
  return membershipActionPhases(permit.permitStage) !== null &&
    membershipActionMatches(permit, identity, permit.permitStage);
}
// The row still owes this attempt in its in-flight phase (a promotion row keeps
// the recorded learner stamp, a learner row has none), on an open ordinary
// operation: an ordinarily settled operation never gets a successor (its
// obligation keeps its own settlement owner).
function owesAttempt(repository, row, action, permit) {
  const settlementAllowsSuccessor = !repository.isOperationTerminal(row) ?
    row.completedAt === null :
    permit.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE &&
      recordingSettlementAllowed(repository, row);
  return row.messageGroupMembershipPhase === action.inFlight &&
    row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    (row.messageGroupLearnerStamp !== null) === action.followsLearnerFact &&
    row.messageGroupVoterStamp === null && row.messageGroupRemovalStamp === null &&
    settlementAllowsSuccessor;
}
// The in-flight attempt the authoritative row owes, decoded, or null.
function inFlightAttempt(repository, row, operationId) {
  if (!row) return null;
  const identity = decodeMembershipIdentity(row.messageGroupMembershipIdentity);
  const permit = decodeMembershipPermit(row.messageGroupMembershipPermit);
  const action = membershipActionPhases(permit?.permitStage);
  if (!identity || identity.operationId !== operationId || !action ||
    !membershipRowIdentityMatches(row, identity, row.messageGroupMembershipIdentity) ||
    !actionAttemptMatches(permit, identity) || permit.permitState !== STATE.IN_FLIGHT ||
    !owesAttempt(repository, row, action, permit)) return null;
  return Object.freeze({operationId, identity, permit,
    encodedIdentity: row.messageGroupMembershipIdentity,
    encodedPermit: row.messageGroupMembershipPermit});
}
// The row already carries the successor of this attempt (in flight or since
// recorded): one permit per sequence, whoever issued it.
function successorIssued(row, attempt) {
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  return permit !== null &&
    membershipRowIdentityMatches(row, attempt.identity, attempt.encodedIdentity) &&
    actionAttemptMatches(permit, attempt.identity) &&
    permit.permitStage === attempt.permit.permitStage &&
    permit.permitSequence === attempt.permit.permitSequence + 1;
}
// Never a refresh: the next sequence of the same transition and target, a
// strictly newer leader term, an unanchored in-flight proposal.
function successorFollows(prior, next) {
  return next !== null && next.permitSequence === prior.permitSequence + 1 &&
    next.leaderTerm > prior.leaderTerm && next.permitStage === prior.permitStage &&
    next.transitionIdentity === prior.transitionIdentity &&
    next.replicaIdentity === prior.replicaIdentity && next.peerId === prior.peerId &&
    next.permitState === STATE.IN_FLIGHT && next.proposalIndex === null;
}
function successorPermit(repository, attempt, claim, observation, destination) {
  const prior = attempt.permit;
  const encoded = encodeMembershipPermit({version: prior.version,
    transitionIdentity: prior.transitionIdentity, permitSequence: prior.permitSequence + 1,
    permitStage: prior.permitStage, permitState: STATE.IN_FLIGHT,
    workflowOwnerNodeId: claim.ownerNodeId, workflowOwnerFence: membershipOwnerClaimFence(claim),
    membershipLeaseExpiresAt: claim.expiresAt, proposerNodeId: repository.nodeId,
    proposerBootIncarnation: repository.membershipOwnerBootIncarnation,
    destinationNodeId: destination.nodeId, destinationBootIncarnation: destination.bootIncarnation,
    replicaLifecycleIncarnation: observation.lifecycleIncarnation,
    runtimeGeneration: observation.runtimeGeneration, leaderTerm: observation.term,
    leaderConfigurationStamp: {configurationKey: observation.configurationKey,
      membershipGenerationIndex: observation.membershipGenerationIndex},
    proposalIndex: null, replicaIdentity: prior.replicaIdentity, peerId: prior.peerId});
  return encoded !== null && successorFollows(prior, decodeMembershipPermit(encoded)) ?
    encoded : null;
}
// The destination's canonical boot, read through the authoritative owner; an
// unreadable or absent row is unavailability, never a guessed binding.
async function canonicalBootIncarnation(repository, nodeId) {
  try {
    const answer = await readAuthoritativeControlPlaneRows(
      repository.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.NODES, NODE_BOOT_SQL,
      [nodeId], READ);
    const row = answer?.success === true && answer.rows?.length === 1 ? answer.rows[0] : null;
    return row?.node_id === nodeId && Number.isSafeInteger(row.boot_incarnation) &&
      row.boot_incarnation > 0 ? row.boot_incarnation : null;
  } catch {
    // The authoritative read failed: no binding is guessed from elsewhere.
    return null;
  }
}
function invocationIsCurrent(repository, isInvocationCurrent) {
  return () => {
    try {
      return !repository.isShuttingDownRequested() && isInvocationCurrent() === true;
    } catch {
      // Unavailable lifetime evidence is never permission to submit.
      return false;
    }
  };
}
async function submitSuccessor(repository, row, attempt, next, isCurrent) {
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  const basis = membershipRowWhere(row);
  const submissionIsCurrent = () => isCurrent() &&
    membershipClaimIsLocalAndLive(repository, claim, attempt.identity);
  // Every submission, a retry included, is new work: admit it on the live
  // holder and the canonical boot; the gateway then rechecks the synchronous part.
  const beforeAttempt = async () => submissionIsCurrent() &&
    await membershipBootIsCurrent(repository);
  try {
    await repository.executeOperationMutationWithRetry(
      `${SUCCESSOR_PERMIT_SQL} ${basis.where}`, [next, ...basis.params],
      {beforeAttempt, submissionIsCurrent});
  } catch (error) {
    // The write may still have committed; the exact readback below decides.
    noteUncertainMembershipWrite(repository, attempt.operationId, error);
  }
  if (!isCurrent()) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(repository, attempt.operationId);
  if (!after.available) return result(OUTCOME.UNKNOWN);
  return result(successorIssued(after.row, attempt) ? OUTCOME.RECORDED : OUTCOME.UNKNOWN,
    after.row);
}
async function issueOver(repository, input, attempt, observation, isCurrent) {
  const bootIncarnation = await canonicalBootIncarnation(repository, input.destinationNodeId);
  if (bootIncarnation === null || !await membershipBootIsCurrent(repository)) {
    return result(OUTCOME.UNAVAILABLE);
  }
  // Neither the native nor the boot read can carry the earlier row across its
  // await: the final authoritative row is the exact conditional basis.
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available) return result(OUTCOME.UNAVAILABLE);
  const row = current.row;
  if (row?.messageGroupMembershipPermit !== attempt.encodedPermit ||
    !inFlightAttempt(repository, row, input.operationId)) {
    return result(successorIssued(row, attempt) ? OUTCOME.RECORDED : OUTCOME.CONFLICT, row);
  }
  const claim = decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim);
  if (!membershipClaimIsLocalAndLive(repository, claim, attempt.identity)) {
    return result(OUTCOME.STALE_OWNER, row);
  }
  const next = successorPermit(repository, attempt, claim, observation,
    {nodeId: input.destinationNodeId, bootIncarnation});
  if (next === null) return result(OUTCOME.INVALID, row);
  return submitSuccessor(repository, row, attempt, next, isCurrent);
}
/** Issue the ordered successor of the row's in-flight attempt (the learner
 * action, or since C2 the promotion) when, and only when, the repository's own
 * exact read proves that attempt can never commit. The caller supplies the operation, the routed destination (node and
 * replica) and the read capability, never evidence or a permit. */
async function issueMessageGroupLearnerSuccessor(repository, request, readCommittedLearner,
  isInvocationCurrent) {
  const input = successorRequest(request);
  if (!input || typeof readCommittedLearner !== 'function' ||
    typeof isInvocationCurrent !== 'function') return result(OUTCOME.INVALID);
  const isCurrent = invocationIsCurrent(repository, isInvocationCurrent);
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available) return result(OUTCOME.UNAVAILABLE);
  const attempt = inFlightAttempt(repository, before.row, input.operationId);
  if (!attempt) return result(OUTCOME.CONFLICT, before.row);
  const absence = await observeLearnerActionAbsence(readCommittedLearner, attempt);
  if (absence.outcome !== OUTCOME.NONCOMMITTED) return result(absence.outcome, before.row);
  // The fencing observation must come from the routed destination's replica.
  if (absence.observation.replicaIdentity !== input.destinationReplicaId) {
    return result(OUTCOME.CONFLICT, before.row);
  }
  return issueOver(repository, input, attempt, absence.observation, isCurrent);
}
export {issueMessageGroupLearnerSuccessor};
// The destination's canonical boot read, shared with the promotion selection
// (replica-operation-message-group-promotion.js, 6.C slice C2).
export {canonicalBootIncarnation};
