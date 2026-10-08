#!/usr/bin/env python3
"""Apply the bounded recipient observation and existing admission-owner consumer."""
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
def replace(path, old, new):
    p=root/path
    s=p.read_text()
    assert s.count(old)==1, (path, old)
    p.write_text(s.replace(old,new,1))
replace('src/raft/raft-operation-port-constants.js','const RAFT_OPERATION_OUTCOME = Object.freeze({', '''// Host operation authority is observed before entering the native runtime turn.
// An observation is not a committed-membership receipt or a CREATE grant.
const RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME = Object.freeze({
  OBSERVED: 'observed', REFUSED: 'refused', UNAVAILABLE: 'unavailable',
});
const RAFT_MEMBERSHIP_AUTHORIZATION_REASON = Object.freeze({
  REQUIRED: 'membership-authorization-required',
  INVALID: 'membership-authorization-invalid',
  UNAVAILABLE: 'membership-authorization-unavailable',
  MISMATCH: 'membership-authorization-mismatch',
  STALE_OWNER: 'membership-authorization-stale-owner',
  WRONG_RECIPIENT: 'membership-authorization-wrong-recipient',
});

const RAFT_OPERATION_OUTCOME = Object.freeze({''')
replace('src/raft/raft-operation-port-constants.js','export {\n','export {\n  RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME,\n  RAFT_MEMBERSHIP_AUTHORIZATION_REASON,\n')
p=root/'src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
p.write_text(p.read_text()+'\n// Reused by the recipient-side observation, never replaced by cache policy.\nexport {READ as MEMBERSHIP_AUTHORIZATION_READ_OPTIONS};\n')
p=root/'src/rebalancer/replica-operation-repository.js'
p.write_text("import {observeMessageGroupLearnerAuthorization} from\n  './replica-operation-message-group-learner-observation.js';\n"+p.read_text())
replace('src/rebalancer/replica-operation-repository.js','  /** Record initial learner intent; runtime and CREATE admission remain separate. */','''  /** Observe exact issued learner intent for a bound runtime recipient. */
  observeMessageGroupLearnerAuthorization(request, receiver) {
    return observeMessageGroupLearnerAuthorization(this, request, receiver);
  }
  /** Record initial learner intent; runtime and CREATE admission remain separate. */''')
p=root/'src/rebalancer/replica-operation-message-group-learner-observation.js'
assert not p.exists()
p.write_text('''/** Recipient-side operation observation, subordinate to ReplicaOperationRepository.
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

function snapshotRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const {operationId, identity, permit, executionClaim} = request;
  if (![operationId, identity, permit, executionClaim].every(nonempty)) return null;
  const decodedIdentity = decodeMembershipIdentity(identity);
  const decodedPermit = decodeMembershipPermit(permit);
  const claim = decodeMembershipOwnerClaim(executionClaim);
  if (!decodedIdentity || !decodedPermit || !claim ||
    decodedIdentity.operationId !== operationId ||
    decodedPermit.transitionIdentity !== decodedIdentity.transitionIdentity ||
    decodedPermit.permitStage !== STAGE.ADD_LEARNER ||
    decodedPermit.permitState !== STATE.IN_FLIGHT || decodedPermit.permitSequence !== 1 ||
    decodedPermit.replicaIdentity !== decodedIdentity.targetReplicaId ||
    decodedPermit.peerId !== decodedIdentity.targetPeerId) return null;
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
  if (!boots || !claimedSenderIsLive(repository, input.claim,
    input.decodedIdentity, receiver)) return refuse(REASON.STALE_OWNER);
  return answer(OUTCOME.OBSERVED, null, {transition: nativeTransition(input)});
}
export {observeMessageGroupLearnerAuthorization};
''')
replace('src/raft/raft-rs-group-membership-admission.js',"import {raftRsMembershipAdministration} from", "import {membershipTransitionRefusal} from './raft-rs-membership-transition.js';\nimport {deepFreeze} from './raft-operation-port.js';\nimport {raftRsMembershipAdministration} from")
replace('src/raft/raft-rs-group-membership-admission.js','  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,','  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,\n  RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME,\n  RAFT_MEMBERSHIP_AUTHORIZATION_REASON,\n  RAFT_MEMBERSHIP_TRANSITION_STAGE,\n  RAFT_OPERATION,')
replace('src/raft/raft-rs-group-membership-admission.js','export {\n','''// Host-composed recipient boundary. The resolver is the existing operation
// repository's bound observation, never a boolean or caller-supplied permit
// validator. Transport authentication/registration and the workflow driver
// must supply the group/sender bindings; this helper does not invent them.
async function proposeAuthorizedGroupLearner(port, group, request, observeAuthorization) {
  if (typeof observeAuthorization !== 'function') {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
  }
  const receiver = Object.freeze({groupId: group?.groupId, nodeId: group?.nodeId,
    bootIncarnation: group?.bootIncarnation, localReplicaIdentity: group?.localReplicaIdentity,
    senderNodeId: group?.senderNodeId, senderBootIncarnation: group?.senderBootIncarnation});
  let observed;
  try {
    observed = await observeAuthorization(request, receiver);
  } catch {
    observed = {outcome: RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE};
  }
  if (observed?.outcome !== RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.OBSERVED) {
    const missing = observed?.outcome === RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE;
    return deepFreeze({...membershipTransitionRefusal(missing ?
      RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE :
      observed?.reason ?? RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH), retryable: missing});
  }
  const status = port.readStatus();
  if (status?.groupId !== receiver.groupId ||
    status.replicaIdentity !== receiver.localReplicaIdentity ||
    observed.transition?.stage !== RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  const reserved = reserveGroupPeerIdentity(receiver, observed.transition.replicaIdentity);
  if (reserved.outcome !== RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  // The existing native turn rechecks term, ConfState generation, address,
  // lifecycle, runtime generation and in-flight configuration before proposing.
  // A queued or delayed read never supplies these checks on the runtime's behalf.
  return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](observed.transition);
}

export {
  proposeAuthorizedGroupLearner,
''')
