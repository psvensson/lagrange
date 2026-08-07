// Terminal-persistence reservation release policy (audit findings 3+11).
// executeAtomicTransition reports a typed outcome:
// {committed, disposition} where disposition is the quest-2
// REPLICA_OPERATION_UPDATE_DISPOSITION of the terminal persist. The
// reservation is released only when the operation durably reached A
// terminal state through this writer or a winning concurrent writer:
//   committed=true                                    -> this writer's
//     terminal write landed (UPDATED/RECOVERED) or the durable row already
//     holds the same terminal (IDEMPOTENT_REPLAY)
//   committed=false + TERMINAL_ADOPTED                -> lost the terminal
//     CAS to a DIFFERENT durable terminal; that terminal owns the release
//   committed=false + IDEMPOTENT_REPLAY               -> already the same
//     terminal durably
// Everything else (REFUSED, REINSERTED, a missing disposition from a
// boolean-shaped persist result) is the unresolved-divergence arm: the
// operation is still live and re-driveable, so releasing its reservation
// would strand an under-reserved operation — the reservation stays ACTIVE
// and the orphan sweep keeps it while the operation is non-terminal.
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';

const RELEASE_ON_DISPOSITIONS = Object.freeze(new Set([
  REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
  REPLICA_OPERATION_UPDATE_DISPOSITION.RECOVERED,
  REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
  REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
]));

/**
 * Decide whether the operation's storage reservation may be released after
 * one terminal persistence attempt.
 * @param {Object|null|boolean} transitionOutcome - Typed outcome returned by
 *   executeAtomicTransition ({committed, disposition}); a bare boolean is
 *   treated as no proven terminal, fail-closed.
 * @return {boolean}
 * @private
 */
function shouldReleaseReservationForTerminalOutcome(transitionOutcome) {
  if (
    !transitionOutcome ||
    typeof transitionOutcome !== 'object' ||
    typeof transitionOutcome.disposition !== 'string'
  ) {
    return false;
  }
  if (transitionOutcome.committed === true) {
    return true;
  }
  return RELEASE_ON_DISPOSITIONS.has(transitionOutcome.disposition);
}

export {shouldReleaseReservationForTerminalOutcome};
