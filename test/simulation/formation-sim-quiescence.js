// Scenario quiescence for the deterministic simulator: a FIXPOINT over two
// domains, not a fixed number of microtask flushes.
//
// The defect this replaces: the drive loop drained the deterministic queue and
// then flushed a fixed number of `Promise.resolve()` turns. Whether a
// production continuation had queued its next deterministic event by then
// depended on host promise timing, so the same seed produced different
// enqueue orders. The measured signature was exact - three same-process runs
// diverged first at ordinal 656, same virtual time, same node, same event
// kind, same due time, differing only in enqueue sequence 629 against 625 -
// and the event count moved when the MEASURING code changed. Host timing had
// leaked into the deterministic schedule.
//
// The model here has no magic number in it. Stability is the authority:
//
//   - the scheduler's enqueue epoch counts events the scheduler received;
//   - the host progress epoch counts scenario-rooted callbacks that actually
//     began executing;
//   - a checkpoint is one real host event-loop turn (setImmediate), not a
//     microtask, because an immediate scheduled from an executing immediate
//     is deferred to a later loop iteration;
//   - two CONSECUTIVE stable checkpoints are required, and any progress in
//     either domain resets stability to zero.
//
// Two is not a flush count. It closes the one boundary Node's semantics
// create: a callback may queue an immediate behind the checkpoint that is
// already queued. The stability condition decides when to stop; the loop may
// take 2 turns or 200.
//
// The checkpoint is harness plumbing: unattributed, node-less, excluded from
// the host progress epoch, invisible to the deterministic transcript, and it
// advances no virtual time.

import {createHook} from 'node:async_hooks';

const ZERO = 0;
const ONE = 1;
const DEFAULT_MAX_TURNS = 10000;
const NOT_REACHED_ERROR = 'formation_host_quiescence_not_reached';
// Host resources that mean real wall-clock waiting or host I/O. A production
// one still pending at quiescence is a scheduling seam that was never routed
// through the deterministic scheduler, and the settle loop must not sleep
// through it.
const WALL_CLOCK_TYPES = Object.freeze(['Timeout', 'TIMERWRAP', 'FSREQCALLBACK',
  'HTTPCLIENTREQUEST', 'TCPWRAP', 'TCPCONNECTWRAP', 'PIPEWRAP']);

/**
 * The spanning observer of scenario-rooted host async work. One instance
 * covers every scenario in the process: it is the single owner of "did
 * anything belonging to this scenario actually run", and the same records
 * answer "did work from a sealed scenario execute later".
 */
class ScenarioHostObserver {
  constructor() {
    this.generation = null;
    this.sealed = new Set();
    this.generationByAsyncId = new Map();
    this.typeByAsyncId = new Map();
    this.creationStackByAsyncId = new Map();
    this.hostProgressEpoch = ZERO;
    this.escapes = [];
    this.checkpointAsyncIds = new Set();
    this.creatingCheckpoint = false;
    this.captureStacks = false;
    this.hook = createHook({
      init: (asyncId, type, triggerAsyncId) => this.onInit(asyncId, type, triggerAsyncId),
      before: (asyncId) => this.onBefore(asyncId),
      destroy: (asyncId) => this.onDestroy(asyncId),
    });
  }

  enable() {
    this.hook.enable();
    return this;
  }

  disable() {
    this.hook.disable();
    return this;
  }

  /**
   * Begin a scenario generation. Resources created from now on, and their
   * descendants, belong to it.
   * @param {string} generation
   */
  begin(generation) {
    this.generation = generation;
  }

  /**
   * Seal the current generation. The caller seals only after the scenario's
   * owners have been stopped through their own lifecycle APIs, its scheduler
   * is quiescent and its meter has closed.
   */
  seal() {
    if (this.generation === null) return;
    this.sealed.add(this.generation);
    this.generation = null;
  }

  onInit(asyncId, type, triggerAsyncId) {
    // Checkpoint plumbing is hereditary: the immediate, the promise wrapping
    // it and the continuation that resumes the settle loop are all the
    // harness's own, and counting any of them as scenario progress would make
    // the fixpoint chase its own tail and never converge.
    if (this.creatingCheckpoint || this.checkpointAsyncIds.has(triggerAsyncId)) {
      this.checkpointAsyncIds.add(asyncId);
    }
    const inherited = this.generationByAsyncId.get(triggerAsyncId);
    const owning = this.generation === null ? inherited : this.generation;
    if (owning === undefined || owning === null) return;
    this.generationByAsyncId.set(asyncId, owning);
    this.typeByAsyncId.set(asyncId, type);
    if (this.captureStacks) {
      this.creationStackByAsyncId.set(asyncId, new Error('created here').stack);
    }
  }

  onBefore(asyncId) {
    const owning = this.generationByAsyncId.get(asyncId);
    if (owning === undefined) return;
    // The harness's own checkpoint is plumbing, and counting it as progress
    // would make the fixpoint chase its own tail forever.
    if (this.checkpointAsyncIds.has(asyncId)) return;
    if (this.sealed.has(owning)) {
      this.escapes.push({
        asyncId, type: this.typeByAsyncId.get(asyncId) || null,
        originatingGeneration: owning, currentGeneration: this.generation,
        creationStack: this.creationStackByAsyncId.get(asyncId) || null,
      });
      return;
    }
    if (owning === this.generation) this.hostProgressEpoch += ONE;
  }

  onDestroy(asyncId) {
    this.generationByAsyncId.delete(asyncId);
    this.typeByAsyncId.delete(asyncId);
    this.creationStackByAsyncId.delete(asyncId);
    this.checkpointAsyncIds.delete(asyncId);
  }

  /**
   * Host resources still alive for the current generation, by type. Promise
   * lifetime is not a contract, so promises are reported but never fatal.
   * @returns {Object} counts keyed by resource type
   */
  pendingByType() {
    const counts = {};
    for (const [asyncId, owning] of this.generationByAsyncId) {
      if (owning !== this.generation) continue;
      if (this.checkpointAsyncIds.has(asyncId)) continue;
      const type = this.typeByAsyncId.get(asyncId) || 'unknown';
      counts[type] = (counts[type] || ZERO) + ONE;
    }
    return counts;
  }

  /**
   * Scenario-rooted host resources that mean real wall-clock waiting. One of
   * these alive at quiescence is a deterministic escape, not something to
   * settle through.
   * @returns {Array<Object>}
   */
  pendingWallClockResources() {
    const pending = [];
    for (const [asyncId, owning] of this.generationByAsyncId) {
      if (owning !== this.generation) continue;
      const type = this.typeByAsyncId.get(asyncId) || 'unknown';
      if (!WALL_CLOCK_TYPES.includes(type)) continue;
      pending.push({asyncId, type,
        creationStack: this.creationStackByAsyncId.get(asyncId) || null});
    }
    return pending;
  }

  /**
   * One real host event-loop turn. Not a microtask: an immediate scheduled
   * from an executing immediate lands on a later iteration, which is the
   * boundary the two-stable-turn rule closes.
   * @returns {Promise<void>}
   */
  checkpoint() {
    this.creatingCheckpoint = true;
    try {
      return new Promise((resolve) => {
        const immediate = setImmediate(() => resolve());
        const asyncId = immediate[Symbol.for('nodejs.asyncId')];
        if (typeof asyncId === 'number') this.checkpointAsyncIds.add(asyncId);
      });
    } finally {
      this.creatingCheckpoint = false;
    }
  }
}

/**
 * Close the current causal instant: everything runnable at the scheduler's
 * present virtual time, plus every owner continuation that work causes, plus
 * anything those continuations enqueue at the same instant, until nothing at
 * this instant remains.
 *
 * Virtual time does not advance here. That is the whole point: the previous
 * driver ran the scheduler up to a bound and then settled hosts, so how much
 * production continuation work had enqueued its virtual events before the
 * bound cut the scheduler off depended on host execution speed. Host speed
 * now has no authority over virtual-time advancement; it may take one turn or
 * five hundred.
 * @param {object} options
 * The ScenarioHostObserver is deliberately NOT consulted here. It is the
 * independent escape detector for the scenario as a whole - callers pass it
 * through and seal it at the end - and making host progress part of the
 * closure rule would never converge, since awaiting an owner is itself
 * scenario-rooted host activity.
 * @param {object} options
 * @param {object} options.network the deterministic scheduler
 * @param {Array<Function>} [options.owners] explicit owner-idle contracts
 * @param {number} [options.maxRounds] non-convergence ceiling
 * @returns {Promise<{rounds: number}>}
 */
async function closeCurrentInstant({network, owners = [],
  maxRounds = DEFAULT_MAX_TURNS}) {
  const instantMs = network.now();
  for (let round = ZERO; round < maxRounds; round += ONE) {
    // Everything already runnable at this instant, one authoritative
    // selection at a time, so a same-instant event created by a callback
    // joins the co-due set and is selected by the scheduler's normal rule
    // rather than appended behind a frozen batch.
    let delivered = true;
    while (delivered) {
      const next = network.peekNextEventInstant();
      delivered = next !== null && next <= instantMs &&
        network.runStep({untilMs: instantMs}).delivered;
    }
    const epochBefore = network.enqueueEpoch();
    // Owner contracts decide closure.
    for (const owner of owners) await owner();
    const nextInstant = network.peekNextEventInstant();
    const moreAtThisInstant = nextInstant !== null && nextInstant <= instantMs;
    if (!moreAtThisInstant && network.enqueueEpoch() === epochBefore) {
      return {rounds: round + ONE};
    }
  }
  throw new Error(`${NOT_REACHED_ERROR} closing instant ${instantMs}`);
}

/**
 * Advance to the next causal instant, closing the current one first. The
 * horizon is a stopping predicate, never a batching boundary: an instant that
 * has begun is always closed, and nothing ever runs "up to" a time.
 * @param {object} options
 * @param {object} options.network
 * @param {object} options.observer
 * @param {Array<Function>} [options.owners]
 * @param {number} options.horizonMs
 * @returns {Promise<number|null>} the instant now standing at, or null
 */
async function advanceToNextInstant({network, owners = [], horizonMs}) {
  await closeCurrentInstant({network, owners});
  const next = network.peekNextEventInstant();
  if (next === null || next > horizonMs) return null;
  network.runStep({untilMs: next});
  await closeCurrentInstant({network, owners});
  return network.now();
}

export {
  NOT_REACHED_ERROR,
  advanceToNextInstant,
  closeCurrentInstant,
  ScenarioHostObserver,
};
