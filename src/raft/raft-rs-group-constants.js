// How a raft-rs group is created and restored, and the tuning the core is
// given.
//
// pre_vote and check_quorum are ON for every group the port opens
// (partitions, system partitions, message groups; tuningOf in
// raft-rs-runtime-tuning.js is the one place a core's config is built). They
// are the disruptive-server requirement of the cutover (owner ruling
// 2026-10-05, a closing condition of the raft-rs-full-cutover epic): a
// replica that heard a leader within its election timeout ignores a
// higher-term vote or pre-vote request, a pre-vote never moves a term, and a
// leader that hears no quorum within an election timeout steps down, so a
// stale leader never pins a follower a new configuration needs. Their lease
// counts the core's own ticks: every opened replica is ticked (a gated joiner
// is a learner of its own configuration and is ticked too), so no lease
// freezes. A leadership transfer's election (MsgTimeoutNow, context
// CAMPAIGN_TRANSFER) bypasses both, as raft-rs defines it.

const RAFT_RS_GROUP_TUNING = Object.freeze({
  ELECTION_TICK: 10,
  HEARTBEAT_TICK: 3,
  PRE_VOTE: true,
  CHECK_QUORUM: true,
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
