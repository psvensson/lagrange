import {PARTICIPATION_GATE} from './raft-committed-membership-constants.js';

const RAFT_EVENT = Object.freeze({
  DATA: 'data',
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
  LEADER_CHANGE: 'leader change',
  COMMIT: 'commit',
  TERM_CHANGE: 'term change',
  COMMITTED_PREFIX_DIVERGENCE: 'committed prefix divergence',
  // The group's applied ConfState differs from the one last announced, or
  // this is the first announcement since the group was (re)constructed or
  // restored. Carries {confState, commitIndex} as data: a wake-up, never an
  // authority - a listener re-reads status (quest replace-source-removal-
  // owner, design S5.2 / amendment-1 step 1).
  MEMBERSHIP_CHANGED: 'membership changed',
  // The replica's applied index crossed its participation gate
  // (max(bootstrapIndex, admissionIndex)) in this drain. Carries
  // {bootstrapIndex, admissionIndex, appliedIndex} as data; the port re-arms
  // the scheduling it was asked for while the gate was closed (committed-
  // read amendment 1, section 3.3).
  GATE_OPENED: PARTICIPATION_GATE.GATE_OPENED,
  // A configuration change settled in this drain: a conf-change entry
  // applied (effective or not - a RemoveNode of a non-member and an AddNode
  // of a member apply without changing the configuration key), or the
  // core's pending configuration index (every proposed conf entry, and a new
  // leader's last index) was reached without one. Carries {appliedIndex,
  // confChangeEntries, admissible} (admissible: the core would now take a
  // conf-change proposal). The admission re-drive's wake-up (verification
  // V2); MEMBERSHIP_CHANGED keeps its configuration-key meaning.
  CONF_CHANGE_APPLIED: 'conf change applied',
});

// The operations of the port beyond the scheduling and proposal surface,
// named once: the one read of the committed configuration, answered as frozen
// data from the runtime owner's recorded observation (committed-read
// amendment 1, section 3.1).
const RAFT_OPERATION = Object.freeze({
  READ_COMMITTED_MEMBERSHIP: 'readCommittedMembership',
});

const RAFT_OPERATION_OUTCOME = Object.freeze({
  CORE_OK: 'CORE_OK',
  CORE_REFUSED: 'CORE_REFUSED',
  CORE_FATAL: 'CORE_FATAL',
  HOST_FAILURE: 'HOST_FAILURE',
});

const RAFT_MEMBERSHIP_OPERATION = Object.freeze({
  ADD_PEER: 'add-peer',
  REMOVE_PEER: 'remove-peer',
  ADD_LEARNER: 'add-learner',
});

const RAFT_MEMBERSHIP_RESERVATION_OUTCOME = Object.freeze({
  RESERVED: 'RESERVED',
  NOT_MANAGED: 'NOT_MANAGED',
});

// The one canonical membership-change request is {type, replicaIdentity}
// (a RAFT_MEMBERSHIP_OPERATION and the Lagrange replica it names; a
// peerAddress may ride along and is never the identity). Each way a request
// can miss that shape is refused by name.
const RAFT_MEMBERSHIP_CHANGE_REFUSAL = Object.freeze({
  UNKNOWN_OPERATION: 'unknown-membership-change',
  WITHOUT_REPLICA_IDENTITY: 'membership-change-without-replica-identity',
  PEER_UNRESERVED: 'membership-change-peer-unreserved',
});

// What probePeerProgress(peerAddress) answers: the peer's matched index
// already reaches the commit index (CORE_OK); one heartbeat round was driven
// through the core because it did not (CORE_OK); the address names no peer of
// the configuration (CORE_REFUSED); the replica is not the leader, which
// never ticks for a probe (CORE_REFUSED).
const RAFT_PEER_PROGRESS_PROBE_REASON = Object.freeze({
  PROGRESS_OBSERVED: 'progress-observed',
  PROGRESS_PROBE_SENT: 'progress-probe-sent',
  NOT_A_PEER: 'not-a-peer',
  NOT_LEADER: 'not-leader',
});

// What transferLeadership(request) is asked for: leadership moved to one
// named Lagrange replica ({successor: NAMED, replicaIdentity}), or - raft-rs
// has no "step down to nobody" - to the voter other than the leader whose log
// its leader's own progress reports most caught up ({successor:
// MOST_CAUGHT_UP}; ties go to the lowest raft id).
const RAFT_LEADERSHIP_TRANSFER_SUCCESSOR = Object.freeze({
  NAMED: 'named',
  MOST_CAUGHT_UP: 'most-caught-up',
});

// What transferLeadership answers, decided from the core's own status and
// configuration in the same queued turn as the step, because the core
// answers Ok even when it ignores the request. CORE_OK: the leader stepped
// the transfer (TRANSFER_REQUESTED), a follower that knows its leader
// forwarded it (TRANSFER_FORWARDED), or the named target already leads
// (ALREADY_LEADER); none of them implies completion, which the port's role
// and leader events report. CORE_REFUSED, nothing stepped: no known leader
// (retryable), a target that is not a voter or whose identity has no
// reserved raft id, no other voter to succeed, a most-caught-up transfer
// asked of a replica that does not lead, or a request that misses the
// canonical shape. TRANSFER_IN_PROGRESS is the retryable answer of a
// proposal the leader drops while a transfer it accepted is running; the
// backend that cannot transfer refuses with UNSUPPORTED_BACKEND.
const RAFT_LEADERSHIP_TRANSFER_REASON = Object.freeze({
  TRANSFER_REQUESTED: 'transfer-requested',
  TRANSFER_FORWARDED: 'transfer-forwarded',
  ALREADY_LEADER: 'already-leader',
  NO_KNOWN_LEADER: 'no-known-leader',
  TARGET_NOT_VOTER: 'target-not-voter',
  TARGET_UNRESERVED: 'target-unreserved',
  NO_ELIGIBLE_SUCCESSOR: 'no-eligible-successor',
  NOT_LEADER: 'not-leader',
  UNKNOWN_SUCCESSOR: 'transfer-unknown-successor',
  WITHOUT_REPLICA_IDENTITY: 'transfer-without-replica-identity',
  TRANSFER_IN_PROGRESS: 'leadership-transfer-in-progress',
  UNSUPPORTED_BACKEND: 'leadership-transfer-unsupported-backend',
});

// A partition's admission of one peer: only the leader proposes it; any
// other replica that observes the same peer records a typed no-op instead of
// forwarding a redundant proposal, and a peer the committed configuration
// already names is not proposed again. A proposal records what the port
// actually answered: PROPOSED (CORE_OK), REFUSED (the port refused it, with
// its reason), DEFERRED (a retryable host failure that left the group usable,
// such as an open user transaction, with its reason), or QUEUED (the port
// queued it behind the group's in-flight work; its settled outcome is
// recorded when the port answers).
const RAFT_MEMBERSHIP_ADMISSION_OUTCOME = Object.freeze({
  PROPOSED: 'PROPOSED',
  REFUSED: 'REFUSED',
  DEFERRED: 'DEFERRED',
  QUEUED: 'QUEUED',
  NOT_LEADER: 'NOT_LEADER',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  // A proposal for this peer already left this leader: it is not proposed
  // again until a configuration change settles (CONF_CHANGE_APPLIED) or this
  // replica gains leadership again, which re-drive it (committed-read
  // amendment 1, section 3.5; verification V2).
  IN_FLIGHT: 'IN_FLIGHT',
});

export {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_MEMBERSHIP_RESERVATION_OUTCOME,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
  RAFT_PEER_PROGRESS_PROBE_REASON,
};
