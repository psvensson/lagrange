#!/usr/bin/env python3
"""Answer PR109 review 5459955866 within the existing admission owners."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(sys.argv[1]).resolve()


def checked_file(name, digest):
    p = root / name
    b = p.read_bytes()
    actual = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
    assert actual == digest, (name, actual, digest)
    return p, b.decode()


p, text = checked_file('src/rebalancer/replica-operation-message-group-learner-observation.js',
                       'b9335341361d0c9c48e9116fb6aa6bdd18c89e2e')
start = text.index('function snapshotRequest(request) {')
end = text.index('function snapshotReceiver(', start)
text = text[:start] + '''// Decode first, then compare the already-decoded identity and issued action.
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
''' + text[end:]
p.write_text(text)

p, text = checked_file('src/raft/raft-rs-group-membership-admission.js',
                       'c26fdf8353f7a3dd5d97804921b5cae721bc01b9')
start = text.index('// Host-composed recipient boundary.')
end = text.index('\nexport {', start)
text = text[:start] + '''// Host-composed bindings are read once before asking the repository. They
// are not filled in from a caller's request or from a later port observation.
function learnerReceiver(group) {
  return Object.freeze({groupId: group?.groupId, nodeId: group?.nodeId,
    bootIncarnation: group?.bootIncarnation, localReplicaIdentity: group?.localReplicaIdentity,
    senderNodeId: group?.senderNodeId, senderBootIncarnation: group?.senderBootIncarnation});
}

function learnerPortAvailable(port) {
  return typeof port?.readStatus === 'function' &&
    typeof port?.[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION] === 'function';
}

function refusedLearnerAuthorization(observed) {
  const missing = observed?.outcome === RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE;
  return deepFreeze({...membershipTransitionRefusal(missing ?
    RAFT_MEMBERSHIP_AUTHORIZATION_REASON.UNAVAILABLE :
    observed?.reason ?? RAFT_MEMBERSHIP_AUTHORIZATION_REASON.MISMATCH), retryable: missing});
}

function learnerRecipientMatches(status, receiver, transition) {
  return status?.groupId === receiver.groupId &&
    status.replicaIdentity === receiver.localReplicaIdentity &&
    transition?.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER;
}

function reserveAndProposeAuthorizedLearner(port, receiver, transition) {
  const reserved = reserveGroupPeerIdentity(receiver, transition.replicaIdentity);
  if (reserved.outcome !== RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  // Same-turn native fences remain authoritative. Do not refresh an issued
  // transition from status here: that would turn stale permission into a grant.
  return port[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](transition);
}

// Host-composed recipient boundary. The resolver is the existing operation
// repository's bound observation, never a boolean or caller-supplied permit
// validator. Transport authentication/registration and the workflow driver
// must supply the group/sender bindings; this helper does not invent them.
async function proposeAuthorizedGroupLearner(port, group, request, observeAuthorization) {
  if (typeof observeAuthorization !== 'function') {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.REQUIRED);
  }
  if (!learnerPortAvailable(port)) {
    return refusedLearnerAuthorization({
      outcome: RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE});
  }
  const receiver = learnerReceiver(group);
  let observed;
  try {
    observed = await observeAuthorization(request, receiver);
  } catch {
    observed = {outcome: RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.UNAVAILABLE};
  }
  if (observed?.outcome !== RAFT_MEMBERSHIP_AUTHORIZATION_OUTCOME.OBSERVED) {
    return refusedLearnerAuthorization(observed);
  }
  if (!learnerRecipientMatches(port.readStatus(), receiver, observed.transition)) {
    return membershipTransitionRefusal(RAFT_MEMBERSHIP_AUTHORIZATION_REASON.WRONG_RECIPIENT);
  }
  return reserveAndProposeAuthorizedLearner(port, receiver, observed.transition);
}
''' + text[end:]
p.write_text(text)
for p in [root / 'src/rebalancer/replica-operation-message-group-learner-observation.js',
          root / 'src/raft/raft-rs-group-membership-admission.js']:
    subprocess.run(['node', '--check', str(p)], check=True)
print(json.dumps({'scope': 'PR109 two reviewed complexity findings',
                  'newOwners': 0, 'newStateStores': 0, 'newExports': 0,
                  'runtimePermissionExpansion': False}))
