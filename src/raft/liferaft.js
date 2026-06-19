import BaseLifeRaft from '@markwylde/liferaft';
import {VirtualTick} from './virtual-tick.js';

const NUMERIC_ONE = 1;
// Census run2 rank2: a FOLLOWER tolerates leader silence for this many max-election-windows
// before challenging a still-known leader (the heartbeat-recency promotion grace).
const PROMOTION_GRACE_ELECTION_WINDOW_MULTIPLIER = 2;

const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMAND = 'command';
const LOCAL_STR_FUNCTION = 'function';

const RAFT_EVENT = Object.freeze({
  DATA: 'data',
});

const RAFT_PACKET_TYPE = Object.freeze({
  APPEND: 'append',
  APPEND_ACK: 'append ack',
  APPEND_FAIL: 'append fail',
  VOTE: 'vote',
});

function hasFiniteNumber(value) {
  return typeof value === LOCAL_STR_NUMBER && Number.isFinite(value);
}

function isRecoverableAppendEntry(entry) {
  return !!entry &&
    typeof entry === LOCAL_STR_OBJECT &&
    hasFiniteNumber(entry.index) &&
    hasFiniteNumber(entry.term) &&
    Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_COMMAND);
}

function getCommittedIndex(raft) {
  return hasFiniteNumber(raft?.log?.committedIndex) ?
    raft.log.committedIndex :
    NUMERIC_ZERO;
}

const NUMERIC_ZERO = 0;

// Catch-up batching (closure record: voter-ready residual). Base liferaft's
// catch-up is one entry per round trip AND a backward fail-walk: the
// follower's append-fail echoes the LEADER'S prevLog info, so the leader
// re-sends from one index earlier each round, delivering nothing until the
// walk reaches the follower's actual position. A REPLACE learner catching up
// a formation-sized log therefore can never meet its voter-ready budget
// (witnessed: 10k-18k per-source-rejected sends per learner per minute, all
// such learners timing out). Every packet already carries the SENDER'S last
// log info as packet.last, so the leader can fast-forward to the follower's
// position and reply with a BATCH; the wire format natively carries data as
// an array (old followers read data[0] and still progress — slow, not
// broken).
const CATCHUP_BATCH_SIZE = 64;
const CATCHUP_BATCH_INFLIGHT_TTL_MS = 400;
const RAFT_STATE_CHANGE_EVENT = 'state change';

function resolveFollowerLastIndex(packet) {
  return hasFiniteNumber(packet?.last?.index) ?
    packet.last.index :
    null;
}

// Raft §5.3 (Log Matching / State-Machine Safety): an inbound append references the leader's log
// at `packet.last` (the leader's last entry on a heartbeat, or prevLog on an entry-append). If we
// hold our OWN, UNCOMMITTED entry at that index with a DIFFERENT term, that is a conflicting entry
// — delete it and everything after, so the base append-fail / catch-up path rebuilds the suffix
// from the leader. Base liferaft only truncates on an index MISMATCH (`packet.last.index !==
// localLastIndex`), so a same-index/different-term conflict otherwise survives and the base
// commit-index catch-up then commits our STALE same-index entry — two nodes committing different
// commands at one index (CL-040). This is INERT on the normal path: it fires only when a local
// uncommitted entry actually conflicts in term; a matching term, a missing entry, or an
// already-committed prefix entry are all left untouched.
async function truncateConflictingSameIndexTail(raft, packet) {
  if (!raft.log ||
      typeof raft.log.get !== LOCAL_STR_FUNCTION ||
      typeof raft.log.removeEntriesAfter !== LOCAL_STR_FUNCTION) {
    return;
  }
  const lastIndex = packet?.last?.index;
  const lastTerm = packet?.last?.term;
  if (!hasFiniteNumber(lastIndex) || lastIndex <= NUMERIC_ZERO ||
      !hasFiniteNumber(lastTerm)) {
    return;
  }
  const localEntry = await raft.log.get(lastIndex);
  if (localEntry &&
      localEntry.committed !== true &&
      hasFiniteNumber(localEntry.term) &&
      localEntry.term !== lastTerm) {
    await raft.log.removeEntriesAfter(lastIndex - NUMERIC_ONE);
  }
}

async function readCatchupEntries(raft, startIndex, endIndex) {
  if (typeof raft.log.getRange === LOCAL_STR_FUNCTION) {
    const entries = await raft.log.getRange(startIndex, endIndex);
    return Array.isArray(entries) ? entries : [];
  }
  // In-memory adapter (message-group raft) has no range read; walk
  // individually and stop at the first gap (compaction).
  const entries = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const entry = await raft.log.get(index);
    if (!isRecoverableAppendEntry(entry)) {
      break;
    }
    entries.push(entry);
  }
  return entries;
}

function patchIncomingDataListener(raft) {
  const listeners = raft.listeners(RAFT_EVENT.DATA);
  const originalListener = Array.isArray(listeners) ? listeners[0] : null;

  if (typeof originalListener !== LOCAL_STR_FUNCTION ||
      originalListener.__lagrangePatched === true) {
    return;
  }

  raft.removeListener(RAFT_EVENT.DATA, originalListener);

  // Per-follower in-flight batch dedupe: every head append/heartbeat that
  // reaches a lagging follower spawns another append-fail; without dedupe
  // each would trigger a redundant overlapping batch into the exact
  // per-source lane that is already capping. Fails are self-regenerating,
  // so suppression can never wedge — worst case is base-speed catch-up.
  const inflightBatchByAddress = new Map();

  // CL-041: base liferaft's `vote` handler has a check-then-act race — the
  // `await raft.log.getLastInfo()` (present only when a log adapter is configured) sits BETWEEN
  // the "have I already voted this term?" check (`if (raft.votes.for && ...)`) and the assignment
  // (`raft.votes.for = packet.address`). Two concurrent same-term vote requests both pass the
  // check before either records the vote, so the follower grants BOTH — a double-vote that lets
  // two candidates reach quorum (two leaders in one term -> split-brain / committed divergence).
  // We serialize vote processing through this per-node chain so the second request runs only after
  // the first has fully recorded its vote, and therefore correctly denies.
  let voteSerializationChain = Promise.resolve();

  const handleLeaderAppendFailBatch = async (packet, write) => {
    // Only intercept when the base preamble would be a no-op (we are the
    // leader in the same term); otherwise the original handler's step-down
    // and stale-term logic must run.
    if (
      raft.state !== BaseLifeRaft.LEADER ||
      packet?.term !== raft.term ||
      !raft.log
    ) {
      return null;
    }
    const failedIndex = packet?.data?.index;
    if (!hasFiniteNumber(failedIndex)) {
      return null;
    }
    const recoveredEntry = await raft.log.get(failedIndex);
    if (!isRecoverableAppendEntry(recoveredEntry)) {
      // Existing unrecoverable guard (compacted/absent index).
      write();
      return true;
    }
    // Fast-forward to the FOLLOWER'S position: packet.last is the sender's
    // own last log info. Without this the backward fail-walk persists and
    // batching is cosmetic.
    const followerLastIndex = resolveFollowerLastIndex(packet);
    const startIndex = followerLastIndex === null ?
      failedIndex :
      Math.min(failedIndex, followerLastIndex + 1);
    const lastInfo = await raft.log.getLastInfo();
    const endIndex = Math.min(
      startIndex + CATCHUP_BATCH_SIZE - 1,
      lastInfo.index,
    );
    if (endIndex < startIndex) {
      write();
      return true;
    }
    const inflight = inflightBatchByAddress.get(packet.address);
    const nowMs = Date.now();
    if (
      inflight &&
      inflight.tailIndex >= startIndex &&
      nowMs - inflight.sentAtMs < CATCHUP_BATCH_INFLIGHT_TTL_MS
    ) {
      write();
      return true;
    }
    const entries = await readCatchupEntries(raft, startIndex, endIndex);
    if (entries.length === 0) {
      write();
      return true;
    }
    // appendPacket(firstEntry) supplies fresh state/term/leader and
    // last = leader's info for (firstEntry.index - 1) — exactly the
    // consistency precondition the follower checks for the whole batch.
    const batchPacket = await raft.appendPacket(entries[0]);
    batchPacket.data = entries;
    inflightBatchByAddress.set(packet.address, {
      tailIndex: entries[entries.length - 1].index,
      sentAtMs: nowMs,
    });
    write(batchPacket);
    return true;
  };

  const handleFollowerAppendBatch = async (packet, write) => {
    // Stale-batch guard: a delayed batch whose precondition precedes our
    // committed prefix must never truncate committed entries (the base
    // single-entry path has a narrower pre-existing exposure; a 64-wide
    // version of it is not acceptable).
    if (packet.last.index < getCommittedIndex(raft)) {
      write();
      return undefined;
    }
    // Pre-compute whether the base handler will accept this packet. Sound
    // because both log adapters complete synchronously under the hood, so
    // no other packet interleaves between this check and the apply below;
    // revisit if a log adapter ever becomes truly asynchronous.
    const localLastInfo = await raft.log.getLastInfo();
    const willAccept =
      packet.last.index === localLastInfo.index ||
      packet.last.index === 0 ||
      (await raft.log.has(packet.last.index));
    // The original handler performs the canonical preamble, consistency
    // check, truncation, first-entry save + ack, and commit catch-up.
    const result = await originalListener(packet, write);
    if (!willAccept) {
      return result;
    }
    const committedIndex = getCommittedIndex(raft);
    let lastAppliedEntry = null;
    for (const entry of packet.data.slice(1)) {
      if (!isRecoverableAppendEntry(entry)) {
        break;
      }
      if (entry.index <= committedIndex) {
        continue;
      }
      // saveCommand rebuilds follower-local bookkeeping
      // ({committed:false, responses:[self]}) exactly like the base
      // handler; the adapter's bulk append() must NOT be used here (it
      // would persist the leader's committed flags and break commit
      // emission on the follower).
      await raft.log.saveCommand(entry.command, entry.term, entry.index);
      lastAppliedEntry = entry;
    }
    if (lastAppliedEntry) {
      raft.message(
        BaseLifeRaft.LEADER,
        await raft.packet(RAFT_PACKET_TYPE.APPEND_ACK, {
          term: lastAppliedEntry.term,
          index: lastAppliedEntry.index,
        }),
      );
      if (getCommittedIndex(raft) < packet.last.committedIndex) {
        const uncommitted = await raft.log.getUncommittedEntriesUpToIndex(
          packet.last.committedIndex,
          packet.last.term,
        );
        raft.commitEntries(uncommitted);
      }
    }
    return result;
  };

  const patchedListener = async (packet, write = () => {}) => {
    const committedIndexBefore = getCommittedIndex(raft);

    // CL-041: serialize vote processing so concurrent same-term votes cannot both pass the
    // votes.for check across the handler's `await getLastInfo()`. Guarded on raft.log because the
    // racy await only exists when a log is configured; a logless node (no `Log` option) has no
    // race and must keep its synchronous append/vote timing byte-identical (cf. CL-040), so it
    // falls through to the normal path. `.then(run, run)` keeps the chain alive past a rejection.
    if (packet?.type === RAFT_PACKET_TYPE.VOTE && raft.log) {
      const processVote = () => originalListener(packet, write);
      voteSerializationChain = voteSerializationChain.then(processVote, processVote);
      return voteSerializationChain;
    }

    if (packet?.type === RAFT_PACKET_TYPE.APPEND_FAIL) {
      const handled = await handleLeaderAppendFailBatch(packet, write);
      if (handled === true) {
        return undefined;
      }
      const recoveredEntry = await raft.log?.get?.(packet?.data?.index);
      if (!isRecoverableAppendEntry(recoveredEntry)) {
        return write();
      }
    }

    if (packet?.type === RAFT_PACKET_TYPE.APPEND) {
      // CL-040: repair a same-index/different-term conflict before the base handler's commit
      // catch-up can stale-commit our own entry; converts the conflict into the append-fail path.
      // Guarded SYNCHRONOUSLY on log presence so a logless node (no `Log` option) adds no microtask
      // hop here — keeping its append timing byte-identical (the truncation is a real-log concern).
      if (raft.log && typeof raft.log.get === LOCAL_STR_FUNCTION) {
        await truncateConflictingSameIndexTail(raft, packet);
      }
      const hasEntries = Array.isArray(packet?.data) &&
        packet.data.length > 0;
      const entry = hasEntries ? packet.data[0] : null;
      if (hasEntries && !isRecoverableAppendEntry(entry)) {
        return write();
      }
      if (hasEntries && packet.data.length > 1) {
        return handleFollowerAppendBatch(packet, write);
      }
    }

    if (packet?.type === RAFT_PACKET_TYPE.APPEND_ACK) {
      const inflight = inflightBatchByAddress.get(packet?.address);
      if (
        inflight &&
        hasFiniteNumber(packet?.data?.index) &&
        packet.data.index >= inflight.tailIndex
      ) {
        inflightBatchByAddress.delete(packet.address);
      }
    }

    // Census run2 rank2 (heartbeat-recency / CheckQuorum-lite): record the wall/virtual
    // time of valid LEADER contact (any packet whose SENDER is a leader — the same signal
    // the base uses to re-arm the election timer). promote() consults this to avoid a
    // doomed term-inflating election while a CONNECTED-but-slow leader is still reachable.
    if (packet?.state === BaseLifeRaft.LEADER) {
      raft._lastLeaderContactAtMs = resolveLifeRaftNowMs(raft);
    }
    const result = await originalListener(packet, write);
    const committedIndexAfter = getCommittedIndex(raft);

    if (packet?.type === RAFT_PACKET_TYPE.APPEND_ACK &&
        raft.state === BaseLifeRaft.LEADER &&
        committedIndexAfter > committedIndexBefore) {
      const heartbeatPacket = await raft.packet(RAFT_PACKET_TYPE.APPEND);
      raft.message(BaseLifeRaft.FOLLOWER, heartbeatPacket);
    }

    return result;
  };

  raft.on(RAFT_STATE_CHANGE_EVENT, () => {
    inflightBatchByAddress.clear();
  });

  patchedListener.__lagrangePatched = true;
  raft.on(RAFT_EVENT.DATA, patchedListener);
}

// Census run2 rank2: resolve "now" from the injected deterministic timeSource when present
// (so the heartbeat-recency guard advances on the virtual clock in DT4/DT6), else wall time.
// Production (no timeSource) is unchanged.
function resolveLifeRaftNowMs(raft) {
  const timeSource = raft && raft._timeSource;
  if (timeSource && typeof timeSource.now === 'function') {
    const now = Number(timeSource.now());
    if (Number.isFinite(now)) {
      return now;
    }
  }
  return Date.now();
}

class LifeRaft extends BaseLifeRaft {
  constructor(address, options = {}) {
    super(address, options);
    patchIncomingDataListener(this);
    // Census run2 rank2 (heartbeat-recency promotion guard) state. _timeSource mirrors the
    // DT4 timeSource (set below) so the guard is deterministic under VirtualTick.
    this._timeSource = (options && options.timeSource) || null;
    this._lastLeaderContactAtMs = null;
    // DT5 election-jitter seam (OPT-IN): base liferaft's timeout() draws the
    // randomized election delay from Math.random. When a randomSource is provided,
    // timeout() (overridden below) draws from it instead, so a seed fully
    // determines election timing. No randomSource -> Math.random, unchanged.
    if (options && options.randomSource &&
        typeof options.randomSource.random === 'function') {
      this._electionRandomSource = options.randomSource;
    }
    // DT4 Raft election seam (OPT-IN): base liferaft schedules its heartbeat +
    // randomized election timeout through `this.timers` (a tick-tock Tick on
    // native setTimeout). When a timeSource is provided, swap in a VirtualTick
    // backed by it so the harness can advance election timing deterministically.
    // The base constructor ALREADY armed the election timer on the real Tick
    // (_initialize -> initialize() -> heartbeat(timeout())), so we must clear that
    // native timer first (else it leaks and fires on wall time), swap, then re-arm
    // on the virtual clock. No timeSource -> the real Tick stays untouched, so
    // production behavior is unchanged.
    if (options && options.timeSource) {
      this.timers.clear();
      this.timers = new VirtualTick(this, options.timeSource);
      this.heartbeat(this.timeout());
    }
  }

  /**
   * Randomized election timeout. Mirrors base liferaft's formula but draws from
   * the injected DT5 RandomSource when present (deterministic), else defers to the
   * base Math.random implementation (production-unchanged).
   * @return {number} milliseconds in [election.min, election.max].
   */
  timeout() {
    if (!this._electionRandomSource) {
      return super.timeout();
    }
    const times = this.election;
    return Math.floor(
      this._electionRandomSource.random() *
        (times.max - times.min + NUMERIC_ONE) +
      times.min,
    );
  }

  // Census run2 rank2: bound on how long a FOLLOWER tolerates leader silence before it
  // challenges a still-known leader. ~2x the max election window: a transient slow/late
  // heartbeat from a CPU-starved-but-CONNECTED leader (the post-restart load case) no longer
  // triggers a doomed term-inflating election, while a genuinely dead leader (silent past the
  // lease) is still replaced with bounded extra latency.
  _promotionGraceLeaseMs() {
    const max = Number(this.election && this.election.max);
    return Number.isFinite(max) && max > NUMERIC_ZERO ?
      max * PROMOTION_GRACE_ELECTION_WINDOW_MULTIPLIER :
      NUMERIC_ZERO;
  }

  // True when the election timer fired but we still have RECENT contact from a known leader.
  // Only a FOLLOWER with a current (non-self) leader defers; a candidate retry, a leaderless
  // node, or a node whose leader contact has aged past the lease proceeds to promote — so
  // liveness is preserved and the guard is strictly MORE conservative about electing (it can
  // never cause two leaders). Self-limiting: _lastLeaderContactAtMs is fixed until the next
  // real leader packet, so as time advances the lease is guaranteed to expire.
  _shouldDeferPromotionForRecentLeaderContact() {
    if (this.state !== BaseLifeRaft.FOLLOWER) {
      return false;
    }
    if (!this.leader || this.leader === this.address) {
      return false;
    }
    if (!Number.isFinite(this._lastLeaderContactAtMs)) {
      return false;
    }
    const graceMs = this._promotionGraceLeaseMs();
    if (graceMs <= NUMERIC_ZERO) {
      return false;
    }
    return resolveLifeRaftNowMs(this) - this._lastLeaderContactAtMs < graceMs;
  }

  async promote(...args) {
    if (this._shouldDeferPromotionForRecentLeaderContact()) {
      // Re-arm the election timer instead of inflating the term. The next firing
      // re-checks the lease; once leader contact ages past it, promotion proceeds.
      this.emit('promotion deferred');
      this.heartbeat(this.timeout());
      return this;
    }
    return super.promote(...args);
  }
}

export default LifeRaft;
