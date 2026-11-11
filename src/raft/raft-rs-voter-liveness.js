// Which voters a leader has heard from in its current tenure, and which
// leadership transfers that leader stepped in that tenure: read by the
// leader's conf-change admission (REMOVES_LIVE_QUORUM) and by the leadership
// transferee rule (raft-removal-transferee-rule.js).
//
// The evidence that a voter is live is a message receipt: an append response
// or a heartbeat response of the leader's own term, from that voter, that the
// core took (recordVoterAnswer, called by the runtime owner for every inbound
// message its core stepped). Only this leader sends appends and heartbeats at
// its term, so such a response is the voter answering this tenure; the core
// refuses a response from a peer it holds no progress for (RawNode::step,
// StepPeerNotFound), so the answer came after the voter's progress existed.
// These are the two messages on which raft-rs itself sets a follower's
// recent_active (raft.rs handle_append_response, handle_heartbeat_response).
//
// recent_active itself is NOT read: raft-rs also sets it when a peer is
// added (tracker.rs apply_conf: "When a node is first added, we should mark
// it as recently active"), so a voter that has never answered reads active
// until the next check-quorum clears it - and a removal's live quorum, or a
// transferee, counted on it would count a silent new member. Its check-quorum
// also clears every flag once per election timeout, so a live voter reads
// false for up to a heartbeat after each clearing.
//
// The leader keeps, per voter, the tick at which it last took such an answer;
// a voter is live while that tick lies within LIVE_WINDOW_ELECTION_TIMEOUTS
// election timeouts of the group's own tick count. The leader itself is
// always live. Nothing here is a row, a cache or a projection: only the
// messages the core took and the group's own ticks.
//
// The record is one tenure's: what an earlier tenure heard says nothing
// about this one. A sample (after every drain of the group) that finds the
// replica not leading, or leading at another term than the record's, clears
// it; an answer at a term the record does not hold is not recorded; a read
// at a term the record does not hold counts only the leader live, so a
// leader re-elected within the window refuses a removal until it has heard
// its voters again. A peer the configuration no longer holds (no progress)
// is pruned at the next sample.
//
// Transfer attempts: raft-rs aborts a transfer it accepted one election
// timeout after it stepped it (tick_heartbeat: election_elapsed, reset at the
// step, reaching election_timeout), with no event and nothing in its status.
// So the leader records the tick at which it stepped each transfer; an attempt
// runs for electionTick ticks, and one older than that, with the replica still
// leading the same tenure, aborted.
//
// The live set's key is announced when it changes (VOTER_LIVENESS_CHANGED)
// while the replica leads: the wake of a proposer whose removal waited on
// a live quorum (a voter answering again, or one going silent).

import {RAFT_RS_MESSAGE_TYPE} from './raft-rs-ingress-constants.js';

const LIVE_WINDOW_ELECTION_TIMEOUTS = 2;

// The messages a follower answers its leader with (raft-rs sets recent_active
// on exactly these).
const VOTER_ANSWER_TYPES = Object.freeze(new Set([
  RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE,
  RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
]));

/** @return {Object} A group's empty liveness record. */
function createVoterLiveness() {
  return {lastActiveTick: new Map(), transferAttemptTick: new Map(),
    latestTransferTick: null, liveKey: null, ticks: 0, term: null};
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

function clearTenure(liveness, term) {
  liveness.lastActiveTick.clear();
  liveness.transferAttemptTick.clear();
  liveness.latestTransferTick = null;
  liveness.liveKey = null;
  liveness.term = term;
}

function holdsTenureOf(liveness, status) {
  return liveness.term !== null && String(status.term) === liveness.term;
}

/**
 * The voters of a status the leader counts live now: heard in this tenure
 * within the window.
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status (with progress).
 * @param {number} electionTick - The group's election timeout in ticks.
 * @return {Set<string>} Live raft peer ids (the leader's own included).
 */
function liveVotersOf(liveness, status, electionTick) {
  const live = new Set([String(status.id)]);
  if (!holdsTenureOf(liveness, status)) {
    return live;
  }
  const windowTicks = LIVE_WINDOW_ELECTION_TIMEOUTS * electionTick;
  for (const [peerId, tick] of liveness.lastActiveTick) {
    if (liveness.ticks - tick <= windowTicks) {
      live.add(peerId);
    }
  }
  return live;
}

/**
 * Record a voter's answer: an inbound message the core took. Counted only
 * when it is an append or heartbeat response at the term of the tenure the
 * record holds (this leader's own).
 * @param {Object} liveness - The group's record.
 * @param {Object} message - The stepped message ({msgType, from, term}).
 */
function recordVoterAnswer(liveness, message) {
  if (liveness.term !== null && VOTER_ANSWER_TYPES.has(message?.msgType) &&
      String(message.term) === liveness.term) {
    liveness.lastActiveTick.set(String(message.from), liveness.ticks);
  }
}

/**
 * Sample the group after a drain: keep the record to the tenure and the
 * configuration the core holds; answer whether the live set changed while
 * this replica leads.
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status.
 * @param {number} electionTick - The election timeout in ticks.
 * @param {Function} leads - (status) => whether the status is a leader's.
 * @return {boolean} Whether the live set's key changed.
 */
function sampleVoterLiveness(liveness, status, electionTick, leads) {
  if (!isLeaderStatus(status, leads)) {
    clearTenure(liveness, null);
    return false;
  }
  if (!holdsTenureOf(liveness, status)) {
    clearTenure(liveness, String(status.term));
  }
  const configured = new Set();
  for (const progress of status.progress || []) {
    configured.add(String(progress?.id));
  }
  for (const peerId of [...liveness.lastActiveTick.keys(),
    ...liveness.transferAttemptTick.keys()]) {
    if (!configured.has(peerId)) {
      liveness.lastActiveTick.delete(peerId);
      liveness.transferAttemptTick.delete(peerId);
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

/**
 * Record a transfer the leader stepped in its current tenure.
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status the transfer was decided on.
 * @param {string} transferee - The raft peer id stepped as the transferee.
 */
function recordTransferAttempt(liveness, status, transferee) {
  if (!holdsTenureOf(liveness, status)) {
    clearTenure(liveness, String(status.term));
  }
  liveness.transferAttemptTick.set(String(transferee), liveness.ticks);
  liveness.latestTransferTick = liveness.ticks;
}

/**
 * The leader's facts about its voters in this tenure, as the transferee rule
 * reads them: who is live, which transferees' attempts aborted and have not
 * been heard since the abort, which aborted at all, and whether the latest
 * attempt still runs (raft-rs would ignore a repeat to it and abort it for
 * another).
 * @param {Object} liveness - The group's record.
 * @param {Object} status - The core's status (with progress).
 * @param {number} electionTick - The election timeout in ticks.
 * @return {Object} {liveVoters, abortedUnheard, aborted, transferRunning};
 *   the id lists sorted.
 */
function voterLivenessFactsOf(liveness, status, electionTick) {
  const liveVoters = [...liveVotersOf(liveness, status, electionTick)].sort();
  if (!holdsTenureOf(liveness, status)) {
    return {liveVoters, abortedUnheard: [], aborted: [],
      transferRunning: false};
  }
  const aborted = [];
  const abortedUnheard = [];
  for (const [peerId, tick] of liveness.transferAttemptTick) {
    const abortTick = tick + electionTick;
    if (liveness.ticks < abortTick) {
      continue;
    }
    aborted.push(peerId);
    if (!((liveness.lastActiveTick.get(peerId) ?? -1) > abortTick)) {
      abortedUnheard.push(peerId);
    }
  }
  return {liveVoters, abortedUnheard: abortedUnheard.sort(),
    aborted: aborted.sort(),
    transferRunning: liveness.latestTransferTick !== null &&
      liveness.ticks - liveness.latestTransferTick < electionTick};
}

export {
  countVoterLivenessTick,
  createVoterLiveness,
  liveVotersOf,
  recordTransferAttempt,
  recordVoterAnswer,
  sampleVoterLiveness,
  voterLivenessFactsOf,
};
