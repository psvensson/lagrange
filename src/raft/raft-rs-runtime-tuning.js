// Derives the tick-based tuning a raft-rs core is given from a group's
// millisecond timing: the tick length, the election timeout in ticks, and the
// fixed heartbeat, pre-vote and check-quorum settings the group constants own.
//
// Pure: it reads only its argument and those constants, and holds no runtime
// state.

import {RAFT_RS_GROUP_TUNING} from './raft-rs-group-constants.js';

function tuningOf(timing = {}) {
  const heartbeatMs = Number(timing.heartbeatMs);
  const electionMinMs = Number(timing.electionMinMs);
  const tickIntervalMs = Number(timing.tickIntervalMs);
  const heartbeatTick = RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK;
  const derivedTickMs = Number.isFinite(tickIntervalMs) && tickIntervalMs > 0 ?
    tickIntervalMs : Math.max(1, Math.floor(heartbeatMs / heartbeatTick));
  return {
    electionTick: Number.isFinite(electionMinMs) ?
      Math.max(heartbeatTick + 1, Math.ceil(electionMinMs / derivedTickMs)) :
      RAFT_RS_GROUP_TUNING.ELECTION_TICK,
    heartbeatTick,
    preVote: RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
}

export {tuningOf};
