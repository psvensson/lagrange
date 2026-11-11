// Which voters a leader has heard from recently, from the core's own
// check-quorum activity (raft-rs Progress.recent_active, the binding's
// recentActive), as the leader's conf-change admission reads it
// (REMOVES_LIVE_QUORUM).
//
// raft-rs sets a follower's recent_active when the leader receives any
// message from it, and its check-quorum clears every follower's flag once per
// election timeout (quorum_recently_active), so a live voter can read false
// for up to a heartbeat after each clearing. The flag alone would make a
// removal's admission flap. So the leader keeps, per voter, the tick at
// which it last saw the flag set (sampled after every drain of its group,
// while it leads), and a voter is live while that tick lies within
// LIVE_WINDOW_ELECTION_TIMEOUTS election timeouts of the group's own tick
// count. The leader itself is always live. Nothing here is a row, a cache or
// a projection: only the core's progress and the group's own ticks.
//
// The live set's key is announced when it changes (VOTER_LIVENESS_CHANGED)
// while the replica leads: the wake of a proposer whose removal waited on
// a live quorum (a voter answering again, or one going silent).

const LIVE_WINDOW_ELECTION_TIMEOUTS = 2;

/** @return {Object} A group's empty liveness record. */
function createVoterLiveness() {
  return {lastActiveTick: new Map(), liveKey: null, ticks: 0};
}

/**
 * Count one tick of the group's clock.
 * @param {Object} liveness - The group's record.
 */
function countVoterLivenessTick(liveness) {
  liveness.ticks += 1;
}

function isLeaderStatus(status, leaderRole) {
  return status?.raftState !== undefined && leaderRole(status);
}

/**
 * The voters of a status the leader counts live now.
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status (with progress).
 * @param {number} electionTick - The group's election timeout in ticks.
 * @return {Set<string>} Live raft peer ids (the leader's own included).
 */
function liveVotersOf(liveness, status, electionTick) {
  const windowTicks = LIVE_WINDOW_ELECTION_TIMEOUTS * electionTick;
  const live = new Set([String(status.id)]);
  for (const [peerId, tick] of liveness.lastActiveTick) {
    if (liveness.ticks - tick <= windowTicks) {
      live.add(peerId);
    }
  }
  return live;
}

/**
 * Sample the core's activity after a drain; answer whether the live set
 * changed while this replica leads.
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status.
 * @param {number} electionTick - The election timeout in ticks.
 * @param {Function} leads - (status) => whether the status is a leader's.
 * @return {boolean} Whether the live set's key changed.
 */
function sampleVoterLiveness(liveness, status, electionTick, leads) {
  if (!isLeaderStatus(status, leads)) {
    liveness.liveKey = null;
    return false;
  }
  for (const progress of status.progress || []) {
    if (progress?.recentActive === true) {
      liveness.lastActiveTick.set(String(progress.id), liveness.ticks);
    }
  }
  const key = [...liveVotersOf(liveness, status, electionTick)].sort()
    .join(',');
  // The first sample of a leadership is a change too: a removal deferred
  // before this leader heard its voters is re-driven by it.
  const changed = key !== liveness.liveKey;
  liveness.liveKey = key;
  return changed;
}

export {
  LIVE_WINDOW_ELECTION_TIMEOUTS,
  countVoterLivenessTick,
  createVoterLiveness,
  liveVotersOf,
  sampleVoterLiveness,
};
