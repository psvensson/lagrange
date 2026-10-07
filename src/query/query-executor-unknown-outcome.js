import {randomUUID} from 'node:crypto';
import {ERRORS} from '../constants/errors.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
  isWriteOutcomeUnknown,
} from '../partition/partition-write-kernel.js';

// The executor's partition delivery is the one owner that re-delivers a
// write whose outcome is not known. A write is delivered under one entryId
// for its whole delivery: the caller's, or - when the caller supplied none -
// one minted once here, so no re-delivery of it is ever a fresh entry. An
// answer that names its outcome unknown (OUTCOME_UNKNOWN), or a delivery
// whose answer was lost after it was sent, leaves the write UNRESOLVED: it
// may commit whatever this delivery was told. The executor re-delivers it
// under the same entryId within its existing execution budget until a
// delivery is answered settled - applied (a settled replay answers the
// original result), or a committed statement's failure. A re-delivery that
// is refused before it was proposed (no leader, backpressure) does not settle
// it. When the budget is spent unresolved, the write's answer is the typed
// unknown outcome carrying its entryId and one report of the wait it spent:
// never a text alone, and never the last refusal's code. Re-deliveries of an
// unresolved write back off exponentially from the executor's retry delay up
// to UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS, so an outage costs a few
// deliveries per write, not one per retry delay; the budget is the caller's
// deadline when it passed one (timeoutMs / timeoutBudget), else the
// executor's queryTimeoutMs.
const UNKNOWN_OUTCOME_DECISION = Object.freeze({
  NONE: 'none',
  REDELIVER: 'redeliver-under-same-entry',
  UNRESOLVABLE: 'unknown-without-entry-identity',
});
const UNKNOWN_OUTCOME_LOST_ANSWER_STATE = 'answer_lost_after_delivery';
const UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS = 2000;
const UNKNOWN_OUTCOME_REDELIVERY_GROWTH = 2;
const UNKNOWN_OUTCOME_AWAITED = 'settled answer for the write\'s entry';
const LOG_UNKNOWN_OUTCOME_WAIT_SPENT =
  'Partition write outcome still unknown when its delivery budget was spent';
const EXECUTOR_ENTRY_ID_PREFIX = 'qexec-';
const STRING_TYPE = 'string';
const FUNCTION_TYPE = 'function';

function isNonEmptyString(value) {
  return typeof value === STRING_TYPE && value.length > 0;
}

/**
 * The execution options a write is delivered under: the caller's entryId,
 * or one minted once for the whole delivery when the caller supplied none
 * (a caller that builds its own requests owns their identity).
 * @param {Object} executionOptions - The delivery's execution options.
 * @param {boolean} forRead - Whether the delivery is a read.
 * @return {Object} The options, with the write's one entryId.
 */
function withWriteEntryIdentity(executionOptions, forRead) {
  if (forRead || isNonEmptyString(executionOptions?.entryId) ||
    typeof executionOptions?.buildRequest === FUNCTION_TYPE) {
    return executionOptions;
  }
  return {
    ...executionOptions,
    entryId: `${EXECUTOR_ENTRY_ID_PREFIX}${randomUUID()}`,
  };
}

// The one report of the wait a delivery spent on an unresolved write: what
// it awaited, under which entry, how many deliveries and answers, how long,
// and the state it last observed.
function buildSpentWait(state, {entryId, nowMs}) {
  return Object.freeze({
    awaited: UNKNOWN_OUTCOME_AWAITED,
    entryId,
    deliveries: state.deliveries,
    unknownAnswers: state.unknownAnswers,
    lostAnswers: state.lostAnswers,
    waitedMs: Math.max(0, nowMs - state.firstUnresolvedAtMs),
    lastObservedState: state.lastObservedState,
  });
}

function reportSpentWaitOnce(state, logger, failureResult, spentWait) {
  if (state.reported || typeof logger?.warn !== FUNCTION_TYPE) {
    return;
  }
  state.reported = true;
  logger.warn(LOG_UNKNOWN_OUTCOME_WAIT_SPENT, {
    partitionId: failureResult?.partitionId ?? null,
    ...spentWait,
  });
}

/**
 * The state of one write delivery's outcome across its re-deliveries.
 * @param {Object} options
 * @param {string|null} options.entryId - The entryId every delivery carries.
 * @param {boolean} options.forRead - Reads are never tracked.
 * @param {Function} options.now - The executor's clock.
 * @return {Object} The tracker.
 */
function createUnknownOutcomeRedelivery({entryId, forRead, now}) {
  const state = {
    deliveries: 0,
    unknownAnswers: 0,
    lostAnswers: 0,
    firstUnresolvedAtMs: null,
    lastObservedState: null,
    settled: false,
    reported: false,
    redeliveryDelays: 0,
    answeredEntryId: null,
  };
  const markUnresolved = (observed) => {
    if (state.firstUnresolvedAtMs === null) {
      state.firstUnresolvedAtMs = now();
    }
    state.lastObservedState = observed;
  };
  const isUnresolved = () => !forRead && !state.settled &&
    state.unknownAnswers + state.lostAnswers > 0;
  return Object.freeze({
    recordDelivery() {
      state.deliveries += 1;
    },
    /**
     * Classify a failed answer: an unknown outcome is re-delivered only when
     * it names the entryId this delivery carries; a committed statement's
     * failure settles the write.
     * @param {Object} answer - A failed answer.
     * @return {string} An UNKNOWN_OUTCOME_DECISION.
     */
    observeAnswer(answer) {
      if (forRead) {
        return UNKNOWN_OUTCOME_DECISION.NONE;
      }
      if (answer?.committed === true) {
        state.settled = true;
        return UNKNOWN_OUTCOME_DECISION.NONE;
      }
      if (!isWriteOutcomeUnknown(answer)) {
        return UNKNOWN_OUTCOME_DECISION.NONE;
      }
      state.unknownAnswers += 1;
      state.answeredEntryId = answer.entryId ?? state.answeredEntryId;
      markUnresolved({
        state: answer.failureCode,
        reason: answer.consensus?.reason ?? null,
        logIndex: answer.logIndex ?? null,
      });
      return isNonEmptyString(entryId) && answer.entryId === entryId ?
        UNKNOWN_OUTCOME_DECISION.REDELIVER :
        UNKNOWN_OUTCOME_DECISION.UNRESOLVABLE;
    },
    /**
     * A delivery that was sent and whose answer never arrived.
     * @param {*} error - What the router threw.
     */
    observeLostAnswer(error) {
      if (forRead) {
        return;
      }
      state.lostAnswers += 1;
      markUnresolved({
        state: UNKNOWN_OUTCOME_LOST_ANSWER_STATE,
        reason: typeof error?.message === STRING_TYPE ? error.message : null,
        logIndex: null,
      });
    },
    isUnresolved,
    /**
     * The delay before the next delivery: the executor's own while the
     * write is not unresolved; once it is, doubled for each re-delivery up
     * to the cap (never below the executor's own).
     * @param {number} baseDelayMs - The executor's retry delay.
     * @return {number} The delay.
     */
    nextDeliveryDelayMs(baseDelayMs) {
      if (!isUnresolved()) {
        return baseDelayMs;
      }
      const backedOff = Math.min(UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS,
        Math.max(1, baseDelayMs) *
          UNKNOWN_OUTCOME_REDELIVERY_GROWTH ** state.redeliveryDelays);
      state.redeliveryDelays += 1;
      return Math.max(baseDelayMs, backedOff);
    },
    /**
     * The answer a delivery ends with: an unresolved write's failure becomes
     * the typed unknown outcome with its entryId and the spent wait.
     * @param {Object} failureResult - The failure the delivery ends with.
     * @param {Object} [logger] - Reports the spent wait once.
     * @return {Object} The failure answer.
     */
    finish(failureResult, logger = null) {
      if (!isUnresolved() || failureResult?.committed === true) {
        return failureResult;
      }
      const spentWait = buildSpentWait(state, {
        entryId: isNonEmptyString(entryId) ? entryId : state.answeredEntryId,
        nowMs: now(),
      });
      reportSpentWaitOnce(state, logger, failureResult, spentWait);
      return {
        ...failureResult,
        error: state.unknownAnswers > 0 ?
          ERRORS.WRITE_OUTCOME_UNKNOWN : failureResult?.error,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
        entryId: spentWait.entryId,
        spentWait,
      };
    },
  });
}

export {
  UNKNOWN_OUTCOME_DECISION,
  UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS,
  createUnknownOutcomeRedelivery,
  withWriteEntryIdentity,
};
