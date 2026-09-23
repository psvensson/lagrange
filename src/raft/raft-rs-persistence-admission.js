// The runtime's side of the rs-raft store's persistence admission.
//
// The store refuses every durable write while its connection is inside a
// transaction it did not open: a user session holds `BEGIN` on the replica's
// shared connection across round trips, and a write made then would become
// part of the session and be erased by its ROLLBACK. The runtime owner asks
// before it enters the core and before every take_ready, so a refusal is a
// deferral the core absorbs (the Ready stays in the core, has_ready stays
// true, inbound envelopes stay queued) rather than a failure in the middle of
// a Ready. A Ready already taken holds the core's pending Ready and cannot be
// abandoned: across an asynchronous send, its remaining writes wait, bounded,
// until the store admits them again, and the wait keeps the process alive.

import {
  RAFT_RS_PERSISTENCE_ADMISSION,
} from './raft-rs-durable-store-constants.js';
import {
  PERSISTENCE_ADMISSION_WAIT,
} from './raft-rs-runtime-owner-constants.js';

/**
 * Whether the group's store admits durable writes now.
 * @param {Object} group - A runtime group.
 * @return {boolean} Whether the store is admitted.
 */
function persistenceAdmitted(group) {
  return group.store.persistenceAdmission() ===
    RAFT_RS_PERSISTENCE_ADMISSION.ADMITTED;
}

/**
 * Continue a taken Ready once the store admits its writes: at once when it
 * does, otherwise on the group's own timers until it does, the group closes,
 * or the bound passes.
 * @param {Object} group - A runtime group (its store, timers, closed flag).
 * @param {Function} continuation - The rest of the Ready.
 * @param {Object} outcomes - {closed(), exceeded()}: the owner's outcomes for
 *   a group closed while waiting and for a wait past its bound.
 * @return {*} The continuation's result, or a Promise of it.
 */
function whenPersistenceAdmitted(group, continuation, outcomes) {
  if (persistenceAdmitted(group)) {
    return continuation();
  }
  const deadline = group.timers.now() + PERSISTENCE_ADMISSION_WAIT.BOUND_MS;
  return new Promise((resolve, reject) => {
    const poll = () => {
      try {
        if (group.closed) {
          resolve(outcomes.closed());
        } else if (persistenceAdmitted(group)) {
          resolve(continuation());
        } else if (group.timers.now() >= deadline) {
          resolve(outcomes.exceeded());
        } else {
          // A held Ready is pending work: its poll timer stays referenced so
          // the process cannot end with the Ready never admitted. One timer
          // at a time, none once admission returns, the group closes or the
          // bound trips.
          group.timers.setTimeout(poll,
            PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS);
        }
      } catch (error) {
        reject(error);
      }
    };
    poll();
  });
}

export {persistenceAdmitted, whenPersistenceAdmitted};
