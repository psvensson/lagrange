// The outcome classes of the checkpoint cadence (extracted from
// partition-snapshot-cadence.js, which records and logs by them): which tick
// outcomes are quiet, which leave a standing refusal, and the owner's own
// reason for an outcome.

import {
  PARTITION_SNAPSHOT_NO_OUTCOME_REASON as NO_REASON,
  RAFT_SNAPSHOT_CADENCE_OUTCOME as OUTCOME,
} from './partition-snapshot-progress-constants.js';

// An attempt that was not refused, as refusalAfter reads it.
const NOT_REFUSED = null;
// A cadence with nothing to do, or waiting: visible as the last outcome,
// never a log line (a held refusal was logged when it was refused).
const QUIET_OUTCOMES = Object.freeze([OUTCOME.BELOW_THRESHOLD,
  OUTCOME.NOT_LEADER, OUTCOME.ALREADY_IN_FLIGHT, OUTCOME.UNSUPPORTED_PARTITION,
  OUTCOME.HELD_AFTER_REFUSAL]);
// The attempt outcomes that leave a standing refusal.
const REFUSED_ATTEMPT_OUTCOMES = Object.freeze([
  OUTCOME.CREATION_REFUSED, OUTCOME.TICK_FAILED]);

function tickResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

function tickFailed(error) {
  return tickResult(OUTCOME.TICK_FAILED, {detail: error?.message});
}

// The owner's own reason for an outcome: the creation owner's refusal, the
// compaction owner's outcome, or none.
function outcomeReason(result) {
  if (result.outcome === OUTCOME.CREATION_REFUSED) {
    return result.creation.outcome;
  }
  return result.outcome === OUTCOME.CHECKPOINTED ?
    result.compaction.outcome : NO_REASON;
}

export {
  NOT_REFUSED,
  QUIET_OUTCOMES,
  REFUSED_ATTEMPT_OUTCOMES,
  outcomeReason,
  tickFailed,
  tickResult,
};
