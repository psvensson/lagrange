import BaseLifeRaft from '@markwylde/liferaft';
import {
  guardCommittedEntryWrite,
  isRaftCommittedEntryConflict,
} from './committed-entry-guard.js';
import {RAFT_PACKET_TYPE} from './constants.js';
import {VirtualTick} from './virtual-tick.js';

const NUMERIC_ONE = 1;

const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMAND = 'command';
const LOCAL_STR_FUNCTION = 'function';

const RAFT_EVENT = Object.freeze({
  DATA: 'data',
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
// Benign election delay returned by timeout() when `this.election` is missing
// (i.e. the node is mid/post-end()). Mirrors base liferaft's default election
// ceiling so any in-flight scheduling stays in-range; the in-flight end() clears
// the Tick immediately after, so this value is never actually awaited to fire.
const DEFAULT_ELECTION_TIMEOUT_MS = 300;
// Candidacy reluctance (quest raft-candidacy-reluctance-drain-source): a
// replica deliberately stepped down for drain kept out-racing caught-up peers
// for the successor election and re-winning leadership the rebalancer was
// draining away — 68% of drained-node leadership gains were undirected timer
// wins (scripts/analyze-leadership-flap.js census). deferCandidacy() inflates
// this node's randomized election delay by a FINITE multiplier for a bounded
// window, so a live caught-up peer always draws a shorter delay and wins
// first. Liveness is unconditional (finite inflation: with no viable peer the
// reluctant node still campaigns), safety untouched (no vote/term/log logic),
// and the deliberate replacement-election path is unaffected —
// requestElectionNow passes an explicit 1ms duration that never consults
// timeout().
const CANDIDACY_RELUCTANCE_MULTIPLIER = 4;
const CANDIDACY_RELUCTANCE_WINDOW_MS = 10000;
const RAFT_STATE_CHANGE_EVENT = 'state change';

function resolveFollowerLastIndex(packet) {
  return hasFiniteNumber(packet?.last?.index) ?
    packet.last.index :
    null;
}

function applyIncomingAppendPreamble(raft, packet) {
  if (packet.term > raft.term) {
    raft.change({
      leader: packet.state === BaseLifeRaft.LEADER ?
        packet.address :
        packet.leader || raft.leader,
      state: BaseLifeRaft.FOLLOWER,
      term: packet.term,
    });
  }
  if (packet.state === BaseLifeRaft.LEADER) {
    if (raft.state !== BaseLifeRaft.FOLLOWER) {
      raft.change({state: BaseLifeRaft.FOLLOWER});
    }
    if (packet.address !== raft.leader) {
      raft.change({leader: packet.address});
    }
    raft.heartbeat(raft.timeout());
  }
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

async function validateCommittedPrevLogIdentity(raft, packet) {
  if (!raft.log || typeof raft.log.get !== LOCAL_STR_FUNCTION) {
    return;
  }
  const lastIndex = packet?.last?.index;
  const committedIndex = getCommittedIndex(raft);
  if (!hasFiniteNumber(lastIndex) || lastIndex <= NUMERIC_ZERO ||
      lastIndex > committedIndex) {
    return;
  }
  const existing = await raft.log.get(lastIndex);
  // Compacted-boundary awareness (raft-snapshot-atomic-install): below or at
  // the snapshot boundary the entry bytes are legitimately gone. Exactly AT
  // the boundary the term is still verifiable against the boundary keys —
  // a mismatch there is a genuine identity conflict, not compaction.
  const boundary = typeof raft.log.getSnapshotBoundary === LOCAL_STR_FUNCTION ?
    raft.log.getSnapshotBoundary() : null;
  const lastIncludedIndex = boundary ? boundary.lastIncludedIndex : 0;
  if (!existing && boundary &&
      lastIndex === boundary.lastIncludedIndex &&
      packet?.last?.term !== boundary.lastIncludedTerm) {
    guardCommittedEntryWrite(
      existing,
      {index: lastIndex, term: packet?.last?.term, command: null},
      committedIndex,
      NUMERIC_ZERO,
    );
  }
  guardCommittedEntryWrite(
    existing,
    {
      index: lastIndex,
      term: packet?.last?.term,
      command: existing?.command,
    },
    committedIndex,
    lastIncludedIndex,
  );
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

async function validateCommittedBatchEntries(log, entries, committedIndex) {
  if (typeof log.resolveEntryWrite !== LOCAL_STR_FUNCTION) {
    return;
  }
  for (const entry of entries) {
    if (isRecoverableAppendEntry(entry) && entry.index <= committedIndex) {
      await log.resolveEntryWrite(entry);
    }
  }
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

  const rejectCommittedEntryConflict = async (error, write) => {
    raft.message(
      BaseLifeRaft.LEADER,
      await raft.packet(RAFT_PACKET_TYPE.APPEND_FAIL, {
        term: error.incomingTerm,
        index: error.index,
        code: error.code,
      }),
    );
    write();
    return undefined;
  };

  const runAppendWithConflictRejection = async (
    operation,
    write,
    packet = null,
  ) => {
    try {
      return await operation();
    } catch (error) {
      if (!isRaftCommittedEntryConflict(error)) {
        throw error;
      }
      if (packet) {
        applyIncomingAppendPreamble(raft, packet);
      }
      return rejectCommittedEntryConflict(error, write);
    }
  };

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
    // Catch-up TTL must run on the same clock as the rest of the node: under
    // a DT virtual clock a raw Date.now() here measured REAL elapsed test
    // time, so the inflight dedupe window never expired virtually (the
    // wall-clock-leak class in the DT limits table). No timeSource -> real
    // clock, byte-identical.
    const nowMs = raft._catchupTimeSource ?
      raft._catchupTimeSource.now() :
      Date.now();
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
    const committedIndex = getCommittedIndex(raft);
    // Validate the complete committed portion before either ACKing the first
    // item or applying the stale-batch drop. saveCommand is non-mutating for
    // same-identity committed replays and throws the shared typed conflict for
    // every other replacement.
    await validateCommittedBatchEntries(
      raft.log,
      packet.data,
      committedIndex,
    );
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
    let lastAppliedEntry = null;
    for (const entry of packet.data.slice(1)) {
      if (!isRecoverableAppendEntry(entry)) {
        break;
      }
      // saveCommand rebuilds follower-local bookkeeping
      // ({committed:false, responses:[self]}) exactly like the base
      // handler; the adapter's bulk append() must NOT be used here (it
      // would persist the leader's committed flags and break commit
      // emission on the follower).
      await raft.log.saveCommand(entry.command, entry.term, entry.index);
      if (entry.index > committedIndex) {
        lastAppliedEntry = entry;
      }
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
    // Teardown-race guard. base liferaft's end() (index.js) sets state=STOPPED
    // and nulls raft.timers/election/Log/beat. A packet still in flight on the
    // transport can reach this listener afterwards; the base handler would then
    // call heartbeat()/change()/timeout() against that nulled state and throw
    // `Cannot read properties of null` (reading 'active'/'max'/...). Because the
    // listener runs detached on the transport, that TypeError surfaces as an
    // unhandledRejection — crashing the process and leaking any re-armed Tick
    // (the move-replica-handoff / node-joining-rebalance hangs). Drop the late
    // packet via the established write() ignore-path instead of dispatching it.
    if (raft.state === BaseLifeRaft.STOPPED || !raft.timers) {
      return write();
    }
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
      if (packet.term < raft.term) {
        return originalListener(packet, write);
      }
      // CL-040: repair a same-index/different-term conflict before the base handler's commit
      // catch-up can stale-commit our own entry; converts the conflict into the append-fail path.
      // Guarded SYNCHRONOUSLY on log presence so a logless node (no `Log` option) adds no microtask
      // hop here — keeping its append timing byte-identical (the truncation is a real-log concern).
      if (raft.log && typeof raft.log.get === LOCAL_STR_FUNCTION) {
        const preconditionAccepted = await runAppendWithConflictRejection(
          async () => {
            await validateCommittedPrevLogIdentity(raft, packet);
            await truncateConflictingSameIndexTail(raft, packet);
            return true;
          },
          write,
          packet,
        );
        if (preconditionAccepted !== true) {
          return undefined;
        }
      }
      const hasEntries = Array.isArray(packet?.data) &&
        packet.data.length > 0;
      const entry = hasEntries ? packet.data[0] : null;
      if (hasEntries && !isRecoverableAppendEntry(entry)) {
        return write();
      }
      if (hasEntries && packet.data.length > 1) {
        return runAppendWithConflictRejection(
          () => handleFollowerAppendBatch(packet, write),
          write,
          packet,
        );
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

    const result = packet?.type === RAFT_PACKET_TYPE.APPEND ?
      await runAppendWithConflictRejection(
        () => originalListener(packet, write),
        write,
      ) :
      await originalListener(packet, write);
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

class LifeRaft extends BaseLifeRaft {
  constructor(address, options = {}) {
    super(address, options);
    patchIncomingDataListener(this);
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
      // The catch-up batch handler (patched above, runs on data events) reads
      // this lazily so its inflight TTL shares the virtual clock.
      this._catchupTimeSource = options.timeSource;
    }
  }

  /**
   * Randomized election timeout. Mirrors base liferaft's formula but draws from
   * the injected DT5 RandomSource when present (deterministic), else defers to the
   * base Math.random implementation (production-unchanged).
   * @return {number} milliseconds in [election.min, election.max].
   */
  timeout() {
    // Teardown-race guard. Base liferaft arms an election Tick at construction
    // and clears it in end(). If that timer fires once more inside the end()
    // window, `this.election` has already been nulled — so both this override
    // and base timeout() would dereference `times.max` and throw. Because the
    // Tick invokes timeout() asynchronously, that TypeError surfaces as an
    // unhandledRejection (crashing the test process) while the still-armed Tick
    // leaks the event loop and hangs it. Return a benign in-range delay instead;
    // the in-flight end() clears the Tick right after, so it never fires.
    const times = this.election;
    if (!times) {
      return DEFAULT_ELECTION_TIMEOUT_MS;
    }
    const base = !this._electionRandomSource ?
      super.timeout() :
      Math.floor(
        this._electionRandomSource.random() *
          (times.max - times.min + NUMERIC_ONE) +
        times.min,
      );
    if (
      this._candidacyReluctantUntilMs != null &&
      this._nowMs() < this._candidacyReluctantUntilMs
    ) {
      // A draw armed just before the window lapses keeps its inflated
      // duration when it fires after expiry — bounded (one draw) and
      // deferential in the right direction.
      return base * CANDIDACY_RELUCTANCE_MULTIPLIER;
    }
    return base;
  }

  /**
   * Same clock as the rest of the node: the DT virtual clock when hosted on
   * the deterministic substrate, the real clock in production (see the
   * catch-up TTL note above — a raw Date.now() under a virtual clock measures
   * real test time and the window would never lapse virtually).
   * @return {number} current time in ms.
   */
  _nowMs() {
    return this._catchupTimeSource ?
      this._catchupTimeSource.now() :
      Date.now();
  }

  /**
   * Mark this replica candidacy-reluctant for a bounded window: election
   * delays drawn by timeout() are inflated CANDIDACY_RELUCTANCE_MULTIPLIER-x
   * so a live caught-up peer wins the succession first. Called by the drain
   * step-down path; explicit-duration elections (requestElectionNow) bypass
   * timeout() and are unaffected.
   * @param {number=} windowMs reluctance window; defaults to
   *   CANDIDACY_RELUCTANCE_WINDOW_MS.
   * @return {LifeRaft} this
   */
  deferCandidacy(windowMs = CANDIDACY_RELUCTANCE_WINDOW_MS) {
    this._candidacyReluctantUntilMs = this._nowMs() + windowMs;
    return this;
  }

  /**
   * (Re)arm the heartbeat/election Tick. Teardown-race guard: base liferaft's
   * heartbeat() dereferences `this.timers.active(...)`, but end() nulls
   * `this.timers`. A packet in flight when end() runs can re-enter the base
   * change()/append handler (index.js:202) AFTER timers are gone — even past
   * patchedListener's entry guard, since end() can land mid-`await`. Dereffing
   * null timers there throws `reading 'active'` as a detached unhandledRejection
   * (crash) and never clears the Tick (hang). No timers => the node has ended,
   * so there is nothing to schedule; no-op and return this (base's contract).
   * @param {number=} duration
   * @return {LifeRaft} this
   */
  heartbeat(duration) {
    if (!this.timers) {
      return this;
    }
    return super.heartbeat(duration);
  }
}

export default LifeRaft;
