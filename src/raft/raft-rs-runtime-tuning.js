// Derives the tick-based tuning a raft-rs core is given from a group's
// millisecond timing: the tick length, the election timeout in ticks, and the
// fixed heartbeat, pre-vote and check-quorum settings the group constants own;
// and, from the same derivation, how often a group whose host failed may be
// reconstructed.
//
// Pure: it reads only its argument and those constants, and holds no runtime
// state.

import {RAFT_RS_GROUP_TUNING} from './raft-rs-group-constants.js';

const MIN_TICK_MS = 1;

function tickMsOf(timing) {
  const heartbeatMs = Number(timing.heartbeatMs);
  const tickIntervalMs = Number(timing.tickIntervalMs);
  if (Number.isFinite(tickIntervalMs) && tickIntervalMs > 0) {
    return tickIntervalMs;
  }
  const fromHeartbeat = Math.floor(
    heartbeatMs / RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK);
  return Number.isFinite(fromHeartbeat) ?
    Math.max(MIN_TICK_MS, fromHeartbeat) : MIN_TICK_MS;
}

function tuningOf(timing = {}) {
  const electionMinMs = Number(timing.electionMinMs);
  const heartbeatTick = RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK;
  const derivedTickMs = tickMsOf(timing);
  return {
    electionTick: Number.isFinite(electionMinMs) ?
      Math.max(heartbeatTick + 1, Math.ceil(electionMinMs / derivedTickMs)) :
      RAFT_RS_GROUP_TUNING.ELECTION_TICK,
    heartbeatTick,
    preVote: RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
}

// The retry window of a group whose host failed: one election timeout as the
// core counts it (its election tick times its tick length) - the same span a
// follower waits before it stands for election. A failure persists while each
// failure arrives within one window of the last instant the previous one held
// the group, whatever its class and whether or not a reconstruction
// succeeded in between; while it persists the group is reconstructed at most
// once per window, so over any span a persistent failure costs at most
// ceil(span / window) + 1 reconstructions - never one per operation or per
// failing Ready. A failure more than one window after the last one starts
// afresh and is attempted at once.
function recoveryRetryWindowMsOf(timing = {}) {
  return tuningOf(timing).electionTick * tickMsOf(timing);
}

export {recoveryRetryWindowMsOf, tuningOf};
