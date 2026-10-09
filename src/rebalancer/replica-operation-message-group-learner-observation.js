/** Recipient-side operation observation, subordinate to ReplicaOperationRepository.
 * The host supplies sender/recipient bindings; none is taken from a payload.
 * This does not authenticate a transport or authorize physical CREATE.
 */
import {readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {ReplicaStatus} from './replica-status.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME,
  RAFT_MEMBERSHIP_AUTHORIZATION_REASON as REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../raft/raft-operation-port-constants.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_OBLIGATION, decodeMembershipIdentity, decodeMembershipPermit,
  decodeMembershipOwnerClaim} from './replica-operation-message-group-membership-permit.js';
import {observeMembershipOperation, membershipRowIdentityMatches,
  MEMBERSHIP_AUTHORIZATION_READ_OPTIONS as READ} from
  './replica-operation-message-group-membership-owner-claim.js';

const answer = (outcome, reason, fields = {}) => deepFreeze({outcome, reason, ...fields});
const refuse = (reason) => answer(OUTCOME.REFUSED, reason);
const unavailable = () => answer(OUTCOME.UNAVAILABLE, REASON.UNAVAILABLE);
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const nonempty = (value) => typeof value === 'string' && value.length > 0;

// Decode first, then compare the already-decoded identity and issued action.
// These are subordinate predicates, not additional authorization owners.
function matchesInitialLearnerRequest(operationId, identity, permit) {
  return identity.operationId === operationId &&
    permit.transitionIdentity === identity.transitionIdentity &&
    permit.permitStage === STAGE.ADD_LEARNER &&
    permit.permitState === STATE.IN_FLIGHT && permit.permitSequence === 1 &&
    permit.replicaIdentity === identity.targetReplicaId &&
    permit.peerId === identity.targetPeerId;
}
function snapshotRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const {operationId, identity, permit, executionClaim} = request;
  if (![operationId, identity, permit, executionClaim].every(nonempty)) return null;
  const decodedIdentity = decodeMembershipIdentity(identity);
  const decodedPermit = decodeMembershipPermit(permit);
  const claim = decodeMembershipOwnerClaim(executionClaim);
  if (!decodedIdentity || !decodedPermit || !claim) return null;
  if (!matchesInitialLearnerRequest(operationId, decodedIdentity, decodedPermit)) return null;
  return {operationId, identity, permit, executionClaim, decodedIdentity, decodedPermit, claim};
}
function snapshotReceiver(repository, receiver, input) {
  if (!receiver || typeof receiver !== 'object') return null;
  const {groupId, nodeId, bootIncarnation, localReplicaIdentity,
    senderNodeId, senderBootIncarnation} = receiver;
  if (![groupId, nodeId, localReplicaIdentity, senderNodeId].every(nonempty) ||
    !positiveInteger(bootIncarnation) || !positiveInteger(senderBootIncarnation) ||
    groupId !== input.decodedIdentity.groupId || nodeId !== repository.nodeId ||
    bootIncarnation !== repository.membershipOwnerBootIncarnation ||
    input.decodedPermit.destinationNodeId !== nodeId ||
    input.decodedPermit.destinationBootIncarnation !== bootIncarnation) return null;
  return Object.freeze({groupId, nodeId, bootIncarnation, localReplicaIdentity,
    senderNodeId, senderBootIncarnation});
}
function claimedSenderIsLive(repository, claim, identity, receiver) {
  const now = repository.timeSource.now();
  return Number.isSafeInteger(now) && now >= 0 && !Object.is(now, -0) &&
    claim.operationId === identity.operationId &&
    claim.transitionIdentity === identity.transitionIdentity && claim.expiresAt > now &&
    claim.ownerNodeId === receiver.senderNodeId &&
    claim.ownerBootIncarnation === receiver.senderBootIncarnation;
}
async function boundBootsAreCurrent(repository, receiver) {
  try {
    const result = await readAuthoritativeControlPlaneRows(
      repository.controlPlaneSystemTableGateway, 'nodes',
      'SELECT node_id, boot_incarnation FROM nodes WHERE node_id IN (?, ?)',
      [receiver.nodeId, receiver.senderNodeId], READ);
    if (result?.success !== true || !Array.isArray(result.rows)) return null;
    const matches = (nodeId, boot) => result.rows.filter((row) =>
      row.node_id === nodeId && row.boot_incarnation === boot).length === 1;
    return matches(receiver.nodeId, receiver.bootIncarnation) &&
      matches(receiver.senderNodeId, receiver.senderBootIncarnation);
  } catch {
    return null;
  }
}
function exactIssuedIntent(repository, row, input) {
  if (!membershipRowIdentityMatches(row, input.decodedIdentity, input.identity) ||
    row.messageGroupMembershipOwnerClaim !== input.executionClaim ||
    row.messageGroupMembershipPermit !== input.permit ||
    row.messageGroupMembershipPhase !== PHASE.LEARNER_IN_FLIGHT ||
    row.messageGroupMembershipObligationState !== MEMBERSHIP_OBLIGATION.UNKNOWN ||
    row.messageGroupLearnerStamp !== null || row.messageGroupVoterStamp !== null ||
    row.messageGroupRemovalStamp !== null) return false;
  // Failure after issue retains this exact obligation; success or inconsistent
  // terminal projections are not permission to introduce another learner.
  return repository.isOperationTerminal(row) ?
    row.status === ReplicaStatus.FAILED && row.workflowStep === WORKFLOW_STEP.FAILED &&
      positiveInteger(row.completedAt) : row.completedAt === null;
}
function nativeTransition(input) {
  const {decodedPermit: permit, decodedIdentity: identity} = input;
  return {operationId: input.operationId, transitionIdentity: permit.transitionIdentity,
    permitSequence: permit.permitSequence, stage: permit.permitStage,
    replicaIdentity: permit.replicaIdentity, peerAddress: identity.targetAddress,
    replicaLifecycleIncarnation: permit.replicaLifecycleIncarnation,
    runtimeGeneration: permit.runtimeGeneration, leaderTerm: permit.leaderTerm,
    leaderConfigurationStamp: permit.leaderConfigurationStamp};
}
async function observeMessageGroupLearnerAuthorization(repository, request, recipient) {
  const input = snapshotRequest(request);
  if (!input) return refuse(REASON.INVALID);
  const receiver = snapshotReceiver(repository, recipient, input);
  if (!receiver) return refuse(REASON.WRONG_RECIPIENT);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available) return unavailable();
  if (!exactIssuedIntent(repository, before.row, input)) return refuse(REASON.MISMATCH);
  const boots = await boundBootsAreCurrent(repository, receiver);
  if (boots === null) return unavailable();
  if (!boots) return refuse(REASON.STALE_OWNER);
  // The boot read may suspend after the initial operation observation. Re-read
  // through the same durable owner before deciding; the earlier row cannot
  // authorize a holder or operation state that changed across that await.
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available) return unavailable();
  if (!exactIssuedIntent(repository, current.row, input)) return refuse(REASON.MISMATCH);
  if (!claimedSenderIsLive(repository, input.claim,
    input.decodedIdentity, receiver)) return refuse(REASON.STALE_OWNER);
  return answer(OUTCOME.OBSERVED, null, {transition: nativeTransition(input)});
}
export {observeMessageGroupLearnerAuthorization};
