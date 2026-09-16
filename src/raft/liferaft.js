import BaseLifeRaft from '@markwylde/liferaft';
import {VirtualTick} from './virtual-tick.js';
import {RaftProtocolTaskTracker} from './raft-protocol-task-tracker.js';
import {
  commitEntriesCooperatively,
} from './liferaft-commit-scheduler.js';
import {
  deferRaftCandidacy,
  heartbeatWithEndGuard,
  indefinitelyWithProtocolAttribution,
  resolveElectionTimeout,
  resolveRaftNowMs,
} from './liferaft-timing-api.js';
import {
  createRemotePeerRepresentation,
} from './remote-peer-representation.js';
import {
  FOLLOWER_MATCH_INDEX_STATE,
  LOCAL_STR_FUNCTION,
  patchIncomingDataListener,
  readFollowerMatchIndex,
} from './liferaft-incoming-data.js';


class LifeRaft extends BaseLifeRaft {
  constructor(address, options = {}) {
    super(address, options);
    // Async protocol work this node has already started.
    this.protocolTasks = new RaftProtocolTaskTracker();
    // With an injected time source the base initialization was DEFERRED by
    // the _initialize override above, so nothing has been armed yet and the
    // data listener does not exist to patch. Timer ownership is established
    // first, then base initialization runs exactly once, then the handlers
    // are patched. Without an injected source nothing is deferred and this is
    // the unchanged production path.
    if (!this._deferredInitializeOptions) {
      patchIncomingDataListener(this);
    }
    // DT5 election-jitter seam (OPT-IN): base liferaft's timeout() draws the
    // randomized election delay from Math.random. When a randomSource is provided,
    // timeout() (overridden below) draws from it instead, so a seed fully
    // determines election timing. No randomSource -> Math.random, unchanged.
    if (options && options.randomSource &&
        typeof options.randomSource.random === 'function') {
      this._electionRandomSource = options.randomSource;
    }
    // S4 snapshot catch-up decision seam (OPT-IN): the partition RaftNode
    // construction site passes onSnapshotCatchupNeeded explicitly
    // (partition-service-raft-init-base.js); stashed here per the
    // _catchupTimeSource precedent. Absent callback, emitted decisions are
    // still recorded on the instance as an observable typed no-op.
    if (options &&
        typeof options.onSnapshotCatchupNeeded === LOCAL_STR_FUNCTION) {
      this._onSnapshotCatchupNeeded = options.onSnapshotCatchupNeeded;
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
    // DT4 Raft election seam (OPT-IN): base liferaft schedules its heartbeat +
    // randomized election timeout through `this.timers` (a tick-tock Tick on
    // native setTimeout). When a timeSource is provided, a VirtualTick backed
    // by it is installed BEFORE base initialization runs, so the invariant is
    // now the strong one: with an injected time source, no LifeRaft protocol
    // timer is ever armed on the host clock. The former sequence armed a real
    // election timer during super(), cleared it and re-armed virtually, and
    // one of those real timers still fired, letting wall time decide
    // deterministic scheduling. No timeSource -> nothing is deferred and the
    // real Tick stays untouched, so production behavior is unchanged.
    if (this._deferredInitializeOptions) {
      const deferred = this._deferredInitializeOptions;
      this._deferredInitializeOptions = null;
      // The still-unarmed real Tick is retired before the virtual one takes
      // over; the election random source must already be in place so the very
      // first election timeout initialization creates is seeded rather than
      // an ambient draw that is then discarded.
      this.timers.clear();
      this.timers = new VirtualTick(this, deferred.timeSource, this.protocolTasks);
      // The catch-up batch handler reads this lazily so its inflight TTL
      // shares the virtual clock.
      this._catchupTimeSource = deferred.timeSource;
      super._initialize(deferred);
      patchIncomingDataListener(this);
    }
  }

  /**
   * Base LifeRaft runs its whole initialization from the constructor through
   * this overridable dispatch, which is why it is the right boundary: with an
   * injected time source the call is deferred until the deterministic timer
   * owner is installed, and then invoked exactly once. Subclass dispatch is
   * untouched, because the deferred call is the base implementation itself.
   * @param {Object} options - construction options.
   * @return {*} the base result, or undefined while deferred.
   */
  _initialize(options) {
    if (options && options.timeSource) {
      this._deferredInitializeOptions = options;
      return undefined;
    }
    return super._initialize(options);
  }

  /**
   * Promotion is asynchronous and the base library starts it from several
   * paths, including inside its own constructor, so it reaches neither the
   * virtual timer boundary nor the patched inbound handler. Owning it here
   * means the Lagrange owner owns the operation from whichever path invoked
   * it. Nothing about promotion itself changes: no terms, votes, timers,
   * packets or attribution, and the caller receives the base library's own
   * promise.
   * @return {Promise<*>} the base promotion result
   */
  promote(...args) {
    const promotion = super.promote(...args);
    return this.protocolTasks ? this.protocolTasks.track(promotion) : promotion;
  }

  /**
   * Resolve when the async protocol work this node has ALREADY started has
   * completed. Future heartbeat and election timers are the scheduler's and
   * are deliberately not waited for.
   * @return {Promise<void>}
   */
  awaitCurrentProtocolIdle() {
    return this.protocolTasks.awaitIdle();
  }

  commitEntries(entries) {
    return commitEntriesCooperatively(
      this,
      entries,
      (pending) => super.commitEntries(pending),
    );
  }

  indefinitely(attempt, fn, timeout) {
    return indefinitelyWithProtocolAttribution(() =>
      super.indefinitely(attempt, fn, timeout));
  }

  /**
   * The one creation authority for remote-peer representations.
   *
   * Base liferaft models a peer by cloning this class, which hands a remote
   * participant a complete local Raft runtime. Production asks a peer for its
   * address and its write, and disposes of it at teardown; the rest of that
   * inherited runtime is capability belonging to a different semantic role,
   * and it acts on its own initiative - disposal alone made every cloned peer
   * compute an election timeout and arm a heartbeat.
   *
   * So the clone path returns a REPRESENTATION instead. The owner's own write
   * travels with it, so sends are unchanged and `this.address` is still the
   * destination; identity and owner-directed disposal are unchanged. What is
   * gone is the ability to be a local Raft participant at all.
   * @param {Object} options - liferaft's clone options.
   * @return {Object} the remote-peer representation.
   */
  clone(options = {}) {
    return createRemotePeerRepresentation({
      address: options.address,
      write: typeof options.write === LOCAL_STR_FUNCTION ?
        options.write :
        this.write,
    });
  }

  /**
   * Randomized election timeout. Mirrors base liferaft's formula but draws from
   * the injected DT5 RandomSource when present (deterministic), else defers to the
   * base Math.random implementation (production-unchanged).
   * @return {number} milliseconds in [election.min, election.max].
   */
  timeout() {
    return resolveElectionTimeout(this, () => super.timeout());
  }

  /**
   * Same clock as the rest of the node: the DT virtual clock when hosted on
   * the deterministic substrate, the real clock in production (see the
   * catch-up TTL note above — a raw Date.now() under a virtual clock measures
   * real test time and the window would never lapse virtually).
   * @return {number} current time in ms.
   */
  _nowMs() {
    return resolveRaftNowMs(this);
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
  deferCandidacy(windowMs) {
    return deferRaftCandidacy(this, windowMs);
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
    return heartbeatWithEndGuard(
      this,
      duration,
      (nextDuration) => super.heartbeat(nextDuration),
    );
  }
}

export default LifeRaft;
export {FOLLOWER_MATCH_INDEX_STATE, readFollowerMatchIndex};
