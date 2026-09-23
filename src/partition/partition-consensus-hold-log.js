// The partition's log of its consensus group's hold on a contained
// programming error. The port contains a throw its runtime did not type (a
// listener's bug, a runtime defect) as the group's typed host failure of
// phase unexpected-throw and answers every operation typed, but neither the
// port nor the runtime owner logs. The partition observes its group's
// leadership (each role and leader announcement, the no-role announcement of
// a hold among them) and names such a hold once, at error level, with the
// error's message; when the group serves again it names that once, at info.
// A reconstruction whose resumption throws again is the same hold: the group
// has healed only when its status is still usable on the partition's next
// turn, after the announcement that showed it usable has run to its end.

import {RUNTIME_PHASE} from '../raft/raft-rs-runtime-owner-constants.js';
import {isHeldByHostFailure} from './partition-write-kernel.js';

const CONSENSUS_HOLD_LOG_MSG = Object.freeze({
  UNEXPECTED_THROW_HELD:
    'Consensus group held by a contained unexpected throw; its writes are ' +
    'refused until it is reconstructed',
  HEALED: 'Consensus group serves again after its hold',
});

// What the log has said about the group's current hold.
const CONSENSUS_HOLD_LOG_STATE = Object.freeze({
  // No hold is named.
  CLEAR: 'clear',
  // A hold is named and the group has not been seen usable since.
  NAMED: 'named',
  // A named hold whose group was seen usable; the partition's next turn
  // confirms it.
  CONFIRMING: 'confirming',
});

// The partition's next turn: on the clock it owns, when it owns one;
// otherwise the event loop's next turn (as its peer reconciliation hop).
function onNextTurn(service, work) {
  if (service.providedTimeSource) {
    service.providedTimeSource.setTimeout(work, 0);
    return;
  }
  setImmediate(work);
}

/**
 * The partition's observer of its group's hold: called on each leadership
 * announcement, it reads the port's status and logs a hold on an unexpected
 * throw once, and its end once.
 * @param {Object} service - The partition service.
 * @return {Function} The observer.
 */
function createConsensusHoldLog(service) {
  let state = CONSENSUS_HOLD_LOG_STATE.CLEAR;
  const confirmHealed = () => {
    if (state !== CONSENSUS_HOLD_LOG_STATE.CONFIRMING || service.isShutdown ||
        !service.raft) {
      return;
    }
    const status = service.raft.readStatus();
    if (isHeldByHostFailure(status)) {
      state = CONSENSUS_HOLD_LOG_STATE.NAMED;
      return;
    }
    state = CONSENSUS_HOLD_LOG_STATE.CLEAR;
    service.logger.info(CONSENSUS_HOLD_LOG_MSG.HEALED, {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
      // The hold that ended: only a hold on an unexpected throw is named.
      phase: RUNTIME_PHASE.UNEXPECTED_THROW,
      role: status?.role ?? null,
      term: status?.term ?? null,
    });
  };
  return () => {
    const status = service.raft.readStatus();
    if (!isHeldByHostFailure(status)) {
      if (state === CONSENSUS_HOLD_LOG_STATE.NAMED) {
        state = CONSENSUS_HOLD_LOG_STATE.CONFIRMING;
        onNextTurn(service, confirmHealed);
      }
      return;
    }
    if (state === CONSENSUS_HOLD_LOG_STATE.CONFIRMING) {
      state = CONSENSUS_HOLD_LOG_STATE.NAMED;
    }
    if (state === CONSENSUS_HOLD_LOG_STATE.CLEAR &&
        status.phase === RUNTIME_PHASE.UNEXPECTED_THROW) {
      state = CONSENSUS_HOLD_LOG_STATE.NAMED;
      service.logger.error(CONSENSUS_HOLD_LOG_MSG.UNEXPECTED_THROW_HELD, {
        partitionId: service.partitionId,
        groupId: status.groupId,
        replicaIdentity: status.replicaIdentity,
        phase: status.phase,
        reason: status.failure?.reason ?? status.reason,
        attempts: status.attempts,
      });
    }
  };
}

export {createConsensusHoldLog};
