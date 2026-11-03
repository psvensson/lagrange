// The one address of a configured raft peer: its unified address on the node
// its admission committed (an admission or managed membership context, a
// founding or joining stamp, a snapshot image; raft-rs-peer-identity.js
// records it at apply). The raft-rs port hands each peer's committed node to
// the host's resolver; the host binds this with its own entity type. Nothing
// here reads a row, a hint list or a cache. A peer without a committed node
// refuses typed (peer_not_in_configuration), recorded as that peer's own
// delivery outcome by the port.

import {AddressManager} from '../address/address-manager.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from
  './raft-committed-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from './raft-rs-peer-identity-constants.js';
import {PEER_ADDRESS_STATUS} from './raft-rs-runtime-owner-constants.js';

// Why a replica that is not yet admitted has no leader to ask for its
// admission: the committed-membership stamp it was created from names no
// leader, or names one this stamp places on no committed node.
const ADMISSION_LEADER_REFUSAL = Object.freeze({
  STAMP_NAMES_NO_LEADER: 'admission_stamp_names_no_leader',
  LEADER_UNPLACED: 'admission_leader_unplaced',
});

/**
 * @param {string} entityType - The host's unified-address entity type.
 * @param {string} replicaIdentity - The peer replica.
 * @param {string|null} committedNodeId - Its committed node, or null.
 * @return {string} The peer's unified address.
 * @throws {Error} PEER_NOT_IN_CONFIGURATION without a committed node.
 */
function committedPeerAddress(entityType, replicaIdentity, committedNodeId) {
  if (typeof committedNodeId !== 'string' || committedNodeId.length === 0) {
    throw Object.assign(
      new Error(RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION),
      {replicaIdentity});
  }
  return AddressManager.getInstance().format(
    committedNodeId, entityType, replicaIdentity);
}

/**
 * The node each founder is placed on, read from the founding placement's
 * unified addresses: the GENESIS stamp commits it.
 * @param {Array<string>} replicaIds - The founding replica identities.
 * @param {Array<string>} addresses - The founding placement's addresses.
 * @return {Object} {replicaIdentity: nodeId} for every placed founder.
 */
function founderNodeIdsOfPlacement(replicaIds, addresses) {
  const addressManager = AddressManager.getInstance();
  const founderNodeIds = {};
  for (const address of addresses) {
    if (!addressManager.validate(address).valid) {
      continue;
    }
    const parsed = addressManager.parse(address);
    if (replicaIds.includes(parsed.serviceId)) {
      founderNodeIds[parsed.serviceId] = parsed.nodeId;
    }
  }
  return founderNodeIds;
}

// A member of the stamp's committed configuration at its committed node, or
// null: the stamp's voters and learners, resolved by the stamp's identities
// and placed by the stamp's nodeIds.
function stampMemberTarget(entityType, stamp, replicaIdentity) {
  if (stamp?.kind !== COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED ||
      typeof replicaIdentity !== 'string' || replicaIdentity.length === 0) {
    return null;
  }
  const peerId = deriveRaftRsPeerId(replicaIdentity);
  const member = [...stamp.voters, ...stamp.learners].includes(peerId) &&
    stamp.identities[peerId] === replicaIdentity;
  if (!member) return null;
  try {
    return Object.freeze({replicaIdentity, address: committedPeerAddress(
      entityType, replicaIdentity, stamp.nodeIds[peerId] ?? null)});
  } catch {
    // A member the stamp places on no node is not addressable.
    return null;
  }
}

/**
 * The leader a replica asks for its own admission. Its own live raft status
 * decides when it names a leader at a committed address (an admitted
 * replica hears its leader); before that, the leader the committed-membership
 * stamp it was created from names (the committed read the group leader
 * served at creation), at that stamp's committed node. Never a row, a cached
 * leader id or a hint list.
 * @param {string} entityType - The host's unified-address entity type.
 * @param {Object|null} stamp - The validated stamp the replica holds.
 * @param {Object|null} status - Its own usable CORE_OK raft status, or null.
 * @return {Object} Frozen {replicaIdentity, address} or {refusal}.
 */
function admissionLeaderTarget(entityType, stamp, status) {
  if (status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
      typeof status.leaderId === 'string' && status.leaderId.length > 0 &&
      status.leaderAddressStatus === PEER_ADDRESS_STATUS.RESOLVED) {
    return Object.freeze({replicaIdentity: status.leaderId,
      address: status.leaderAddress});
  }
  const leaderId = stamp?.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED ?
    stamp.leaderId : null;
  if (typeof leaderId !== 'string' || leaderId.length === 0) {
    return Object.freeze({refusal: ADMISSION_LEADER_REFUSAL.STAMP_NAMES_NO_LEADER});
  }
  return stampMemberTarget(entityType, stamp, leaderId) ??
    Object.freeze({refusal: ADMISSION_LEADER_REFUSAL.LEADER_UNPLACED});
}

/**
 * A NOT_LEADER answer's leader hint, accepted only when it names a member of
 * the committed configuration the replica holds (its stamp), addressed at
 * that member's committed node; anything else is ignored (null).
 * @param {string} entityType - The host's unified-address entity type.
 * @param {Object|null} stamp - The validated stamp the replica holds.
 * @param {string|null} hintedLeaderId - The answer's leader replica id.
 * @return {Object|null} Frozen {replicaIdentity, address}, or null.
 */
function admissionLeaderHint(entityType, stamp, hintedLeaderId) {
  return stampMemberTarget(entityType, stamp, hintedLeaderId);
}

// The read's own routing when the held stamp places no member.
const STAMP_READ_SELF_ROUTED = Object.freeze({});

/**
 * The committed-membership reads a replica makes, in order, to read the
 * membership it was created from again: one per committed node, the stamp
 * leader's first, then the stamp's other members in stamp order (voters,
 * then learners), so a stamp leader that never returns does not strand the
 * replica while the group has a live leader. A stamp that places no one
 * leaves the read its own routing. Nothing here reads a row or a hint list.
 * @param {Object|null} stamp - The validated stamp the replica holds.
 * @return {Array<Object>} Frozen read options: {firstNodeId}, or none.
 */
function admissionStampReads(stamp) {
  if (stamp?.kind !== COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED) {
    return [STAMP_READ_SELF_ROUTED];
  }
  const leaderNodeId = typeof stamp.leaderId === 'string' &&
    stamp.leaderId.length > 0 ?
    stamp.nodeIds[deriveRaftRsPeerId(stamp.leaderId)] : undefined;
  const nodeIds = [leaderNodeId,
    ...[...stamp.voters, ...stamp.learners].map((peerId) => stamp.nodeIds[peerId])]
    .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0);
  const reads = [...new Set(nodeIds)].map((firstNodeId) =>
    Object.freeze({firstNodeId}));
  return reads.length > 0 ? reads : [STAMP_READ_SELF_ROUTED];
}

export {
  ADMISSION_LEADER_REFUSAL,
  admissionStampReads,
  admissionLeaderHint,
  admissionLeaderTarget,
  committedPeerAddress,
  founderNodeIdsOfPlacement,
};
