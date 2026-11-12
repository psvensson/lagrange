/**
 * Diagnostics for a backpressured CDC obligation drive (log line only).
 *
 * The drive answers ACKNOWLEDGEMENT_BACKPRESSURE (its own acknowledgement
 * lane is full) or HELD_BY_SUBSCRIBER with a backpressure error (one
 * recipient deferred; the others keep shipping). Both were visible at debug
 * level only. This line names the step, the recipient it concerns with its
 * cursor (how far that recipient lags the owed tail), the lane's queue sizes
 * and the owed head and tail, at most once a second per step for the whole
 * node, on the console sink only: the obligations being held may be the logs
 * table's own.
 */

import {ThrottledDiagnosticsLine} from '../diagnostics/throttled-diagnostics-line.js';
import {PARTITION_CDC_OBLIGATION_LOG_MSG} from './partition-cdc-obligation-constants.js';
import {readOwedCdcHead, readOwedCdcTail} from './partition-cdc-obligation-ledger.js';

const BACKPRESSURE_LINE_WINDOW_MS = 1000;

const backpressureLine = new ThrottledDiagnosticsLine({
  message: PARTITION_CDC_OBLIGATION_LOG_MSG.DELIVERY_BACKPRESSURED,
  windowMs: BACKPRESSURE_LINE_WINDOW_MS,
  maxField: 'maxRetryDelayMs',
});

/**
 * @param {Object} owner - The partition service owning the obligation lane.
 * @param {Object} lane - The delivery lane.
 * @param {Object} obligation - The obligation the drive stopped at.
 * @param {Object} held - {step, retryDelayMs, error, recipient?,
 *   recipientCursor?}: the recipient the hold concerns (absent for the
 *   lane's own acknowledgement backpressure) and its cursor.
 * @return {void}
 */
function reportObligationBackpressure(owner, lane, obligation, held) {
  backpressureLine.report(held.step, held.retryDelayMs, () => {
    const head = readOwedCdcHead(owner.db);
    const tail = readOwedCdcTail(owner.db);
    return {
      partitionId: owner.partitionId,
      logIndex: obligation.logIndex,
      ordinal: obligation.ordinal,
      step: held.step,
      recipient: held.recipient ?? null,
      recipientCursorLogIndex: held.recipientCursor?.logIndex ?? null,
      error: held.error === null ? null : String(held.error),
      retryDelayMs: held.retryDelayMs,
      pendingAcknowledgements: lane.pending.size,
      outstandingAcknowledgementBatches: lane.commands.size,
      acknowledgementHeld: lane.held,
      owedHeadLogIndex: head === null ? null : head.logIndex,
      owedTailLogIndex: tail === null ? null : tail.logIndex,
    };
  });
}

export {reportObligationBackpressure};
