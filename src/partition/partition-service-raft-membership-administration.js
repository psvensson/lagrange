import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  REDRIVEN_ADMISSION_OUTCOMES,
  admissionOfPortAnswer,
  admitGroupPeer,
  reserveGroupPeerIdentity,
  takeGroupAdmissionsInFlight,
} from '../raft/raft-rs-group-membership-admission.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {recoveryRetryWindowMsOf} from '../raft/raft-rs-runtime-tuning.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  './partition-replica-membership-constants.js';
import {computeReplicaElectionTimeouts} from
  '../raft/replica-election-timeouts.js';

const {PARTITION_SERVICE_VALUE} = PARTITION_SERVICE_SHARED;

// The partition as a caller of the group-neutral admission owner (design R3
// section 1.6, decision D4): its identity, its logger and its own record
// fields.
function admissionGroupOf(service) {
  return {
    groupId: service.partitionId,
    localReplicaIdentity: service.replicaId,
    logger: service.logger,
    logContext: {partitionId: service.partitionId},
  };
}

function reservePartitionRaftPeerIdentity(
  service,
  joiningReplicaIdentity,
) {
  return reserveGroupPeerIdentity(admissionGroupOf(service),
    joiningReplicaIdentity);
}

/**
 * The partition's one path to admitting a peer into its raft configuration,
 * through the group-neutral admission owner: only the leader proposes, a
 * member or a replica that is not the leader is a typed no-op, and every
 * decision is recorded as what the port answered.
 * @param {Object} service - The partition service.
 * @param {Object} peer - {replicaIdentity, peerAddress}.
 * @return {Object} The frozen admission record.
 */
function admitPartitionRaftPeer(service, peer) {
  return admitGroupPeer(service.raft, admissionGroupOf(service), peer);
}

// The row-driven retirements (REMOVE_PEER) the port deferred, by the change
// proposed: re-proposed when a configuration change settles or this replica
// gains leadership, like a deferred admission (verification V2). Removing a
// peer that is no longer a member is a raft no-op, so a repeat is harmless.
const RETIREMENTS_DEFERRED = new WeakMap();

function retirementsDeferredOf(service) {
  if (!RETIREMENTS_DEFERRED.has(service)) {
    RETIREMENTS_DEFERRED.set(service, new Map());
  }
  return RETIREMENTS_DEFERRED.get(service);
}

function trackRetirement(service, change, answered) {
  const key = change.replicaIdentity ?? change.peerAddress;
  if (REDRIVEN_ADMISSION_OUTCOMES.has(
    admissionOfPortAnswer(answered).outcome)) {
    retirementsDeferredOf(service).set(key, change);
  } else {
    retirementsDeferredOf(service).delete(key);
  }
}

/**
 * Propose one row-driven REMOVE_PEER through the port, remembering it when
 * the port deferred it (the core held an unapplied change).
 * @param {Object} service - The partition service.
 * @param {Object} change - The REMOVE_PEER change.
 * @return {*} What the port answered.
 */
function proposePeerRetirement(service, change) {
  const answered = service.raft.proposeConfChange(change);
  if (answered && typeof answered.then === 'function') {
    answered.then((settled) => trackRetirement(service, change, settled),
      (error) => trackRetirement(service, change, {reason: error?.message}));
  } else {
    trackRetirement(service, change, answered);
  }
  return answered;
}

/**
 * The deferred row-driven retirements, handed over and forgotten.
 * @param {Object} service - The partition service.
 * @return {Array<Object>} The REMOVE_PEER changes.
 */
function takeDeferredRetirements(service) {
  const deferred = retirementsDeferredOf(service);
  const taken = [...deferred.values()];
  deferred.clear();
  return taken;
}

/**
 * The admissions this replica proposed or deferred since a configuration
 * change last settled, handed over and forgotten (committed-read amendment
 * 1, section 3.5; verification V2).
 * @param {Object} service - The partition service.
 * @return {Set<string>} The replica identities.
 */
function takeAdmissionsInFlight(service) {
  return takeGroupAdmissionsInFlight(service.raft);
}

/**
 * The leadership-transfer abort window of the group, maximised over its
 * replica indices: raft-rs aborts a transfer after the leader's
 * election_timeout, which each replica derives from its own jittered timing.
 * @param {Object} service - The partition service.
 * @return {number|null} Milliseconds, or null when the timing is unknown.
 */
function leadershipTransferWindowMaxMsOf(service) {
  const timing = service.raftTimingConfig;
  const replicaIds = Array.isArray(service.replicaIds) ?
    service.replicaIds : [];
  if (!timing || replicaIds.length === 0) {
    return null;
  }
  let windowMs = 0;
  for (const replicaId of replicaIds) {
    const {electionMinMs} = computeReplicaElectionTimeouts({
      replicaId,
      replicaIds,
      baseElectionMinMs: timing.baseElectionMinMs,
      baseElectionMaxMs: timing.baseElectionMaxMs,
      electionJitterPerReplicaMs:
        PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
    });
    windowMs = Math.max(windowMs, recoveryRetryWindowMsOf({
      ...timing,
      electionMinMs,
    }));
  }
  return windowMs > 0 ? windowMs : null;
}

// The named voter's state in one committed-membership answer: a voter of
// the incoming or outgoing configuration, absent, or unresolved when an id of
// the configuration has no identity this replica reserved.
function voterMembershipStateOf(answer, sourceReplicaIdentity) {
  let unresolved = false;
  for (const peerId of [...answer.voters, ...answer.votersOutgoing]) {
    const identity = answer.identities[peerId];
    if (identity === sourceReplicaIdentity) {
      return PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER;
    }
    if (typeof identity !== 'string' || identity.length === 0) {
      unresolved = true;
    }
  }
  return unresolved ?
    PARTITION_REPLICA_MEMBERSHIP_STATE.UNRESOLVED :
    PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT;
}

/**
 * This replica's own committed configuration and leadership, read through
 * its port's one committed-membership read (a witness read: this replica's
 * own applied configuration, whether it leads or not), with the named
 * voter's state in it. Never a row. The observation carries the applied
 * index of the answered configuration and the participation gate, so its
 * reader can tell a replica still below its gate (owner decision O1, B12).
 * @param {Object} service - The partition service (the witness replica).
 * @param {string} sourceReplicaIdentity - The voter asked about.
 * @return {Promise<Object>} Frozen observation.
 */
async function readPartitionReplicaMembership(service, sourceReplicaIdentity) {
  const read = service?.raft?.[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP];
  const answer = typeof read === 'function' ? await read({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS}) : null;
  if (answer?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return Object.freeze({
      state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
      replicaId: service?.replicaId || null,
      reason: answer?.reason || null,
    });
  }
  return Object.freeze({
    state: voterMembershipStateOf(answer, sourceReplicaIdentity),
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    term: answer.term,
    commitIndex: answer.commitIndex,
    appliedIndex: answer.appliedIndex,
    gateOpen: answer.gateOpen,
    leaderReplicaId: answer.leaderId ?? null,
    // The answered configuration's voters by replica identity (null for an
    // id this replica has not reserved), so a reader can ask each voter to
    // corroborate the answer's term and leader (fix-f7, V1).
    voterReplicaIds: replicaIdentitiesOf(answer, answer.voters),
    votersOutgoingReplicaIds: replicaIdentitiesOf(answer, answer.votersOutgoing),
    transferWindowMaxMs: leadershipTransferWindowMaxMsOf(service),
  });
}

function replicaIdentitiesOf(answer, peerIds) {
  return Object.freeze(peerIds.map((peerId) => {
    const identity = answer.identities[peerId];
    return typeof identity === 'string' && identity.length > 0 ?
      identity : null;
  }));
}

/**
 * Propose the removal of one voter through this replica's port: reserve its
 * identity (so the proposal names a raft peer this replica can address),
 * then REMOVE_PEER in the port's canonical shape. Only the leader's port
 * takes it: a follower answers NOT_LEADER naming the leader (round 2 F-1),
 * so the caller addresses the leader. Removing a non-member is a no-op, so
 * a repeat is harmless. The answer is what the port said.
 * @param {Object} service - The partition service.
 * @param {string} replicaIdentity - The voter to remove.
 * @return {Promise<Object>} {outcome, portOutcome, reason,
 *   leaderReplicaId?}.
 */
async function retirePartitionRaftPeer(service, replicaIdentity) {
  const reservation = reservePartitionRaftPeerIdentity(
    service, replicaIdentity);
  if (reservation.outcome !== RAFT_MEMBERSHIP_RESERVATION_OUTCOME.RESERVED) {
    return Object.freeze({
      outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED,
      portOutcome: null,
      reason: reservation.reason || reservation.outcome,
    });
  }
  let answered;
  try {
    answered = await service.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity,
    });
  } catch (error) {
    answered = {reason: error?.message || String(error)};
  }
  return Object.freeze(admissionOfPortAnswer(answered));
}

export {
  admitPartitionRaftPeer,
  readPartitionReplicaMembership,
  proposePeerRetirement,
  reservePartitionRaftPeerIdentity,
  retirePartitionRaftPeer,
  takeAdmissionsInFlight,
  takeDeferredRetirements,
};
