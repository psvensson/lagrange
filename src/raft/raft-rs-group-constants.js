// How a raft-rs group is created and restored, and the tuning the core is
// given.
//
// pre_vote and check_quorum are not decided here. §11 of the owner's binding
// direction requires failure scenarios to settle them; those scenarios now
// exist, and the recommendation they derive lives with its evidence in
// raft-rs-election-safety.js (`recommendedElectionSettings`). The values
// below stay the core's own off state, which is what every scenario measured
// so far ran on: turning them on is a change to what those measurements
// mean, and it belongs to the phase that re-measures them, not to the
// constant.

const RAFT_RS_GROUP_TUNING = Object.freeze({
  ELECTION_TICK: 10,
  HEARTBEAT_TICK: 3,
  PRE_VOTE: false,
  CHECK_QUORUM: false,
});

// A fresh group's applied index. The durable record starts at the origin, so
// nothing has been applied yet.
const RAFT_RS_INITIAL_APPLIED = '0';

// How many Ready cycles a drain may run before it is a loop rather than
// progress. Nothing in phase 1 approaches it; it exists so an unbounded
// resource has a bound.
const RAFT_RS_READY_DRAIN_MAX_CYCLES = 64;

const RAFT_RS_GROUP_ERROR_MSG = Object.freeze({
  noDurableRecord: (groupId) =>
    `group ${JSON.stringify(groupId)} has no durable raft-rs record to ` +
    'restore from; a restart reads its own record and nothing else',
});

export {
  RAFT_RS_GROUP_ERROR_MSG,
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_INITIAL_APPLIED,
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
};
