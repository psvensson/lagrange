/**
 * The set of async protocol tasks a Raft node has ALREADY started.
 *
 * A deterministic scheduler owns when a timer fires; the node owns the async
 * continuation that firing produced, until it completes. Nothing used to own
 * that continuation: the virtual timer invoked its callback and discarded the
 * returned thenable, so "has the work this node already accepted finished?"
 * had no answer and callers guessed with fixed promise or host-turn flushes.
 *
 * This tracker is lifecycle bookkeeping. It counts no segments, charges no
 * time, and has no opinion about future timers: work that has not fired is
 * the scheduler's, not the node's.
 */

const ZERO = 0;
const ONE = 1;
// Diagnostic ceiling. Reaching it is an invariant failure, never an idle.
const MAX_DRAIN_ROUNDS = 10000;
const NOT_IDLE_ERROR = 'raft_protocol_tasks_not_idle';

class RaftProtocolTaskTracker {
  constructor() {
    this.active = new Set();
    // Identity, so the same task seen at two boundaries is one logical task.
    // A promotion fired by the virtual timer is visible both as the timer
    // callback's result and through the promote() override, and counting it
    // twice would keep the tracker busy after the work had finished.
    this.trackedByTask = new WeakMap();
    this.startedCount = ZERO;
  }

  /**
   * Record one async protocol task. It leaves in `finally`, so a rejected
   * task is still accounted for and never wedges the tracker.
   * @param {Promise} task
   * @returns {Promise} the same task
   */
  track(task) {
    if (!task || typeof task.then !== 'function') return task;
    if (this.trackedByTask.has(task)) return task;
    this.startedCount += ONE;
    const settled = task.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.active.delete(settled);
    });
    this.trackedByTask.set(task, settled);
    this.active.add(settled);
    // The caller gets its own promise back: this is bookkeeping, not a
    // different completion value.
    return task;
  }

  /**
   * How many started tasks have not completed.
   * @returns {number}
   */
  activeCount() {
    return this.active.size;
  }

  /**
   * Resolve when every task already started has completed, to a fixpoint:
   * settling one task may start another through its own continuation, and
   * that one is also already-started work by the time we look again. No
   * virtual time passes, no unfired timer is waited for, and no fixed number
   * of turns is involved.
   * @returns {Promise<void>}
   */
  async awaitIdle() {
    for (let round = ZERO; round < MAX_DRAIN_ROUNDS; round += ONE) {
      if (this.active.size === ZERO) return;
      await Promise.allSettled([...this.active]);
    }
    throw new Error(NOT_IDLE_ERROR);
  }
}

export {RaftProtocolTaskTracker};
