// Partition HLC warm-up (extracted from partition-service-raft-init-base.js
// for the raft-snapshot-atomic-install quest). Restart recovery reloads
// committed state without re-applying entries, so a fresh HLC clock would
// not witness already-committed HLCs and could regress below a value this
// node previously committed. Warm the clock from the max committed HLC over
// the log AND the snapshot boundary key — after an install the log is
// compacted-empty and the sealed maxCommittedHlc is the only witness.

import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  readInstalledMaxCommittedHlc,
} from '../raft/snapshot-boundary.js';

const FIRST_LOG_INDEX = 1;

function maxHlcOf(current, candidate) {
  if (!candidate) return current;
  if (current === null || candidate.compare(current) > 0) return candidate;
  return current;
}

/**
 * Warm a partition HLC clock from every durable committed-HLC witness:
 * the committed log prefix plus the installed snapshot's sealed
 * maxCommittedHlc. Best-effort and never fatal to init (the caller wraps).
 * @param {Object} options warm-up inputs
 * @param {Object} options.logAdapter SQLiteLogAdapter
 * @param {Object} options.hlcClock partition HLC clock
 * @return {void}
 */
function warmHlcFromDurableWitnesses({logAdapter, hlcClock}) {
  if (!logAdapter ||
    typeof logAdapter.getCommittedIndex !== 'function' ||
    typeof logAdapter.getRange !== 'function') {
    return;
  }
  let maxHlc = null;
  const committedIndex = logAdapter.getCommittedIndex();
  if (Number.isFinite(committedIndex) && committedIndex > 0) {
    const entries = logAdapter.getRange(FIRST_LOG_INDEX, committedIndex);
    for (const entry of entries) {
      maxHlc = maxHlcOf(
        maxHlc, HLCTimestamp.tryFromString(entry?.command?.timestamp));
    }
  }
  if (logAdapter.isOpen()) {
    maxHlc = maxHlcOf(maxHlc, HLCTimestamp.tryFromString(
      readInstalledMaxCommittedHlc(logAdapter.db)));
  }
  if (maxHlc) hlcClock.update(maxHlc);
}

export {warmHlcFromDurableWitnesses};
