// The semantic parts of an rs-raft status observation that need no core
// entry: the peers of a configuration and the leader's follower progress,
// each resolved to the Lagrange identities and addresses the group knows, and
// the frozen status those make up. The runtime owner reads the core; these
// only shape what it read.

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {projectPeerRole} from './raft-rs-committed-membership-read.js';
import {
  NO_LEADER,
  PEER_ADDRESS_STATUS,
  PEER_DELIVERY_OUTCOME,
  ROLE,
  ROLE_LEADER,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from './raft-rs-peer-identity-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from './raft-rs-ingress-constants.js';

const LEADER_PROGRESS_MESSAGE_TYPES = Object.freeze(new Set([
  RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.SNAPSHOT_STATUS,
  RAFT_RS_MESSAGE_TYPE.UNREACHABLE,
  RAFT_RS_MESSAGE_TYPE.TRANSFER_LEADER,
  RAFT_RS_MESSAGE_TYPE.READ_INDEX,
  RAFT_RS_MESSAGE_TYPE.READ_INDEX_RESPONSE,
]));

function readyChangesStatus(ready) {
  return ready.softState !== undefined ||
    ready.hardState !== undefined ||
    (ready.entries?.length ?? 0) > 0 ||
    (ready.committedEntries?.length ?? 0) > 0 ||
    ready.snapshot !== undefined;
}

function lightReadyChangesStatus(lightReady) {
  return lightReady.commitIndex !== undefined ||
    (lightReady.committedEntries?.length ?? 0) > 0;
}

function messageMayChangeLeaderProgress(message) {
  return LEADER_PROGRESS_MESSAGE_TYPES.has(message?.msgType);
}

function participationChanged(participation, observed) {
  return participation.appliedIndex !== observed.appliedIndex ||
    participation.gateOpen !== observed.gateOpen ||
    participation.bootstrapIndex !== observed.bootstrapIndex ||
    participation.admissionIndex !== observed.admissionIndex ||
    participation.identityRecorded !== observed.identityRecorded;
}

function groupObservationInputsChanged(group, observation) {
  const membershipGeneration = group.membershipGenerationKnown ?
    Number(group.membershipGenerationIndex) : null;
  return (group.pendingSnapshotGateOpen && group.gateOpen) ||
    (group.confChangeEntriesApplied ?? 0) > 0 ||
    group.persistedLastIndex !== observation.lastIndex ||
    group.appliedTerm !== observation.appliedTerm ||
    membershipGeneration !== observation.membershipGenerationIndex ||
    group.lifecycleIncarnation !== observation.lifecycleIncarnation ||
    group.peerDeliveryEpoch !== observation.peerDeliveryEpoch ||
    group.inboundRefusalEpoch !== observation.inboundRefusalEpoch;
}

function hostObservationInputsChanged(group, observation, context) {
  return group.announcedAppliedRuntimeGeneration !== context.expectedGeneration ||
    participationChanged(context.participation, observation.participation) ||
    context.runtimeHealth !== observation.runtimeHealth ||
    context.runtimeGeneration !== observation.runtimeGeneration ||
    groupObservationInputsChanged(group, observation);
}

function shouldAnnounceOnDrain(group, context) {
  const observation = group.statusObservation;
  if (!observation || group.lastStatus === null) return true;
  if (group.resumingRuntime) return true;
  if (context.readyChanged) return true;
  if (ROLE[group.lastStatus.raftState] === ROLE_LEADER &&
      (context.steppedLeaderProgress ||
        (group.tenure?.c0ByRequestKey?.size ?? 0) > 0)) {
    return true;
  }
  return hostObservationInputsChanged(group, observation, context);
}

const NO_DELIVERY_OBSERVED = Object.freeze({
  outcome: PEER_DELIVERY_OUTCOME.NONE_OBSERVED,
});
let nativeStatusObserver = null;

// Passive observation of the existing runtime's native status publication.
// This introduces no core read, scheduler wake, authority or cached decision.
function setNativeStatusObserver(observer) {
  nativeStatusObserver = typeof observer === 'function' ? observer : null;
}

// One configured peer's identity and address, each a named state. A peer
// whose identity this replica never reserved is reported, not thrown: its
// reservation lives on the replica that admitted it.
function resolvePeerObservation(group, id) {
  const identity = group.resolvePeerIdentity(id);
  if (identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED) {
    return {replicaIdentity: null, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNRESERVED};
  }
  try {
    return {replicaIdentity: identity.replicaIdentity,
      address: group.resolvePeerAddress(id),
      addressStatus: PEER_ADDRESS_STATUS.RESOLVED};
  } catch {
    // Status is an observation. A temporarily unavailable address is not
    // a Ready failure and must not invalidate the execution container.
    return {replicaIdentity: identity.replicaIdentity, address: null,
      addressStatus: PEER_ADDRESS_STATUS.UNAVAILABLE};
  }
}

function peerSnapshot(group, confState) {
  return [...confState.voters, ...confState.learners]
    .filter((id) => id !== group.peerId)
    .map((id) => ({
      peerId: id,
      ...resolvePeerObservation(group, id),
      learner: confState.learners.includes(id),
      delivery: group.peerDelivery.get(String(id)) || NO_DELIVERY_OBSERVED,
    }));
}

// The leader a status names: its identity, address and their state. An
// unreserved leader is the same observation as an unreserved peer.
function leaderObservation(group, lead) {
  if (lead === NO_LEADER) {
    return {leaderId: null, leaderAddress: null,
      leaderAddressStatus: PEER_ADDRESS_STATUS.NO_LEADER};
  }
  const observed = resolvePeerObservation(group, lead);
  return {leaderId: observed.replicaIdentity, leaderAddress: observed.address,
    leaderAddressStatus: observed.addressStatus};
}

// The leader's own matched index per configured peer, keyed by the peer's
// replica identity (raft-rs Progress[id].matched, the id resolved through
// this replica's identity record). Whether the peer can be addressed is the
// transport's concern, never a reason to drop its progress; an id this
// replica never reserved has no identity to key it by.
function followerProgressSnapshot(group, status) {
  const progress = Array.isArray(status?.progress) ? status.progress : [];
  const snapshot = {};
  for (const item of progress) {
    if (String(item?.id) === String(group.peerId)) {
      continue;
    }
    const matched = Number(item?.matched);
    const identity = group.resolvePeerIdentity(item?.id);
    if (Number.isFinite(matched) &&
        identity.status === RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED) {
      snapshot[identity.replicaIdentity] = matched;
    }
  }
  return snapshot;
}

// This replica leads and has applied an entry of its own term: the term of
// the last entry it applied (appliedTerm: the runtime owner's record, kept on
// every applied slice and installed snapshot and restored from the durable
// record when the group opens) is its current term. Monotone within a term;
// a configuration change the leader applied is such an entry. Once it holds,
// no entry of an earlier term that this replica has not applied can commit
// any more. A replica that does not lead answers false.
function currentTermApplied(status, appliedTerm) {
  return ROLE[status.raftState] === ROLE_LEADER &&
    BigInt(appliedTerm) === BigInt(status.term);
}

function validateProgressIdentities(group, progress) {
  if (!Array.isArray(progress)) return;
  for (const item of progress) {
    if (String(item?.id) !== String(group.peerId)) group.resolvePeerIdentity(item?.id);
  }
}

function validateObservationIdentities(group, status, confState, onError) {
  try {
    if (status.lead !== NO_LEADER) group.resolvePeerIdentity(status.lead);
    for (const id of [...confState.voters, ...confState.learners]) {
      if (id !== group.peerId) group.resolvePeerIdentity(id);
    }
    validateProgressIdentities(group, status?.progress);
    return null;
  } catch (error) {
    return onError(error);
  }
}

/**
 * The status one observation of the core describes.
 * @param {Object} group - The runtime group.
 * @param {Object} observation - {status, confState, appliedIndex, lastIndex,
 *   runtimeHealth, runtimeGeneration} as the runtime owner recorded them.
 * @param {Function} leaderIdentityUnresolved - The owner's outcome when the
 *   leader's identity cannot be resolved.
 * @return {Object} The frozen status, or the owner's outcome.
 */
function shapeGroupObservation(group, observation, leaderIdentityUnresolved) {
  const {status, confState} = observation;
  let leader;
  let peers;
  let followerProgress;
  try {
    leader = leaderObservation(group, status.lead);
    peers = peerSnapshot(group, confState);
    followerProgress = followerProgressSnapshot(group, status);
  } catch (error) {
    // The registry itself could not be read: a host failure, not a peer's
    // reservation state.
    return leaderIdentityUnresolved(error);
  }
  const result = deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    term: Number(status.term),
    commitIndex: Number(status.commit),
    // The core holds a proposed configuration change it has not applied
    // (the conf-change admission's own pending check).
    confChangePending:
      BigInt(status.pendingConfIndex ?? 0) > BigInt(status.applied ?? 0),
    currentTermApplied: currentTermApplied(status, observation.appliedTerm),
    // The runtime's applied index of this same observation (the one its
    // confState came from), and the persisted last index of the log it
    // applies from: equal when every entry this replica holds has applied.
    appliedIndex: observation.appliedIndex,
    lastIndex: Number(observation.lastIndex),
    configurationKey: observation.configurationKey,
    membershipGenerationIndex: observation.membershipGenerationIndex,
    lifecycleIncarnation: observation.lifecycleIncarnation,
    role: ROLE[status.raftState] || RUNTIME_REASON.UNKNOWN,
    memberRole: projectPeerRole(confState, group.peerId),
    ...leader,
    voters: confState.voters,
    voterCount: confState.voters.length,
    peerCount: Math.max(0,
      confState.voters.length + confState.learners.length - 1),
    peers,
    followerProgress,
    // Delivered envelopes the core refused to step, per sender (the runtime
    // owner's observation; each was dropped and answered nothing).
    inboundStepRefusals: [...group.inboundStepRefusals.values()],
    confState,
    // The participation gate recorded with this observation, and the applied
    // index the configuration above was applied at (O1 gate).
    ...observation.participation,
    runtimeHealth: observation.runtimeHealth,
    groupHealth: group.health,
    runtimeGeneration: observation.runtimeGeneration,
  });
  nativeStatusObserver?.(result);
  return result;
}

const UNSHAPED_STATUS = Object.freeze({observation: null});

function cachedShapedGroupStatus(group, observation, leaderIdentityUnresolved) {
  const deliveryEpoch = group.peerDeliveryEpoch;
  const refusalEpoch = group.inboundRefusalEpoch;
  const cached = group.shapedStatus;
  if (cached.observation === observation &&
      cached.deliveryEpoch === deliveryEpoch &&
      cached.refusalEpoch === refusalEpoch) {
    return cached.shaped;
  }
  const shaped = shapeGroupObservation(
    group, observation, leaderIdentityUnresolved);
  if (shaped.outcome === RAFT_OPERATION_OUTCOME.CORE_OK) {
    group.shapedStatus = Object.freeze({
      observation, shaped, deliveryEpoch, refusalEpoch,
    });
  }
  return shaped;
}

function reseedHoldStatus(group, runtimeHealth, runtimeGeneration) {
  return deepFreeze({
    ...group.reseedHold,
    groupHealth: group.health,
    runtimeHealth,
    runtimeGeneration,
    lifecycleIncarnation: group.lifecycleIncarnation,
  });
}

export {
  UNSHAPED_STATUS,
  cachedShapedGroupStatus,
  currentTermApplied,
  lightReadyChangesStatus,
  messageMayChangeLeaderProgress,
  readyChangesStatus,
  reseedHoldStatus,
  setNativeStatusObserver,
  shapeGroupObservation,
  shouldAnnounceOnDrain,
  validateObservationIdentities,
};
