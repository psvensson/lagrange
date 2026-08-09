// Committed-prefix divergence surfacing (quest raft-committed-prefix-
// conflict-livelock): a same-index term conflict at or below the committed
// index is committed-state divergence, not a repairable suffix conflict —
// the truncation the base protocol would use is impossible by design (the
// log adapter refuses committed-entry loss). This module owns the two
// follower-side pieces of that discipline: reading DURABLE committed truth
// before the truncate-vs-diverge safety decision, and surfacing the poisoned
// prefix EXACTLY ONCE per conflict identity as a typed event. The per-packet
// repair route stays the existing typed append-fail sent by the liferaft
// rejection funnel, which feeds the leader's catch-up/install (S4 snapshot)
// machinery.

import {RAFT_EVENT} from './constants.js';

const TYPE_FUNCTION = 'function';
const EMPTY_COMMITTED_INDEX = 0;

// The truncate-vs-diverge decision is a raft-safety decision and must read
// DURABLE committed truth: the livelock window (quest
// raft-committed-prefix-conflict-livelock) is exactly a liferaft-visible
// committedIndex cache lagging the store while the adapter refuses the
// truncation by a FRESH read (sqlite-log-adapter
// safeExclusiveTruncationIndex). Mirror the adapter's own mutation-path
// discipline — refresh from durable state before a safety decision; an
// adapter without a durable store behind the cache (in-memory) answers from
// its live committedIndex property.
function resolveDurableCommittedIndex(raftLog) {
  if (typeof raftLog.refreshCommittedIndexCacheFromStore === TYPE_FUNCTION) {
    return raftLog.refreshCommittedIndexCacheFromStore();
  }
  return Number.isFinite(raftLog.committedIndex) ?
    raftLog.committedIndex :
    EMPTY_COMMITTED_INDEX;
}

// Surface a committed-prefix divergence EXACTLY ONCE per conflict identity
// (index, localTerm, leaderTerm). The identity set is per-instance and
// bounded: a genuinely diverged replica is repaired by snapshot install,
// which recreates the service and its raft node. The error is the shared
// RaftCommittedEntryConflictError raised by the committed-entry guard.
function surfaceCommittedPrefixDivergence(raft, error) {
  if (!(raft._committedPrefixDivergenceKeys instanceof Set)) {
    raft._committedPrefixDivergenceKeys = new Set();
  }
  const identityKey =
    `${error.index}:${error.existingTerm}:${error.incomingTerm}`;
  if (raft._committedPrefixDivergenceKeys.has(identityKey)) {
    return;
  }
  raft._committedPrefixDivergenceKeys.add(identityKey);
  const observation = Object.freeze({
    index: error.index,
    localTerm: error.existingTerm,
    leaderTerm: error.incomingTerm,
    committedIndex: error.committedIndex,
  });
  raft._lastCommittedPrefixDivergence = observation;
  try {
    raft.emit(RAFT_EVENT.COMMITTED_PREFIX_DIVERGENCE, observation);
  } catch (listenerError) {
    // Listener failures must never disturb the append-fail rejection path;
    // the recorded observation stays observable either way.
    raft._lastCommittedPrefixDivergenceError = listenerError;
  }
}

export {
  resolveDurableCommittedIndex,
  surfaceCommittedPrefixDivergence,
};
