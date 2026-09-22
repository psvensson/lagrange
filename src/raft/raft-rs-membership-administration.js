import {RAFT_MEMBERSHIP_RESERVATION_OUTCOME} from
  './raft-operation-port-constants.js';

const RESERVATION_OWNERS = new Map();
const NO_MEMBERSHIP_OWNER_REASON = 'no-active-raft-rs-membership-owner';

function keyOf(groupId, localReplicaIdentity) {
  return `${groupId}\u0000${localReplicaIdentity}`;
}

function registerPeerIdentityReservationOwner({
  groupId, localReplicaIdentity, reserve,
}) {
  const key = keyOf(groupId, localReplicaIdentity);
  RESERVATION_OWNERS.set(key, reserve);
  return Object.freeze(() => RESERVATION_OWNERS.delete(key));
}

function reservePeerIdentity({
  groupId, localReplicaIdentity, joiningReplicaIdentity,
}) {
  const reserve = RESERVATION_OWNERS.get(
    keyOf(groupId, localReplicaIdentity));
  if (!reserve) {
    return Object.freeze({
      outcome: RAFT_MEMBERSHIP_RESERVATION_OUTCOME.NOT_MANAGED,
      reason: NO_MEMBERSHIP_OWNER_REASON,
    });
  }
  return Object.freeze({
    outcome: RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED,
    peerId: reserve(joiningReplicaIdentity),
  });
}

const raftRsMembershipAdministration = Object.freeze({
  reservePeerIdentity: Object.freeze(reservePeerIdentity),
});

export {
  raftRsMembershipAdministration,
  registerPeerIdentityReservationOwner,
};
