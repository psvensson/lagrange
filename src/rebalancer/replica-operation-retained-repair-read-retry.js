// One bounded continuation per retained record: the owner of reconsideration a
// failed authority read (or an unknown or refused presentation) left owed. It
// paces timer-driven retries only (an event decides at once), dies with its
// record and is never shared across records. Delay bounds and the window are
// the repository's existing owner-read retry delays and rebalance operation
// budget (retainedRepairContinuationPolicy).
//
// The window measures ONE episode: the consecutive continuation-owned failures
// of this record's obligation since its last progress. It opens at the first
// such failure, is kept by every later one (a qualified read that is followed
// by another failure is not progress), and closes at the end of any decision
// that leaves the obligation to another owner: progress (a durable outcome, a
// judged contention, a settlement), a custodian, a named clearing trigger, the
// route publication, or a row change. A failure at or after its deadline
// spends it: one report, no timer, obligation kept; any later legitimate
// trigger decides afresh and a new failure opens a new window.
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {RETAINED_REPAIR_CONTINUATION as CONTINUATION, RETAINED_REPAIR_CUSTODY as CUSTODY,
  RETAINED_REPAIR_WAITING as WAITING, IDLE_CONTINUATION, NOT_WAITING} from
  './replica-operation-retained-repair-record.js';
import {REPAIR_OBSERVATION as OBSERVATION} from './replica-operation-retained-repair-observation.js';

const BACKOFF_MULTIPLIER = 2;
const RETAINED_REPAIR_WAIT = Object.freeze({
  wait: 'TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS',
  awaited: 'a qualified retained placement repair authority read',
});
const WAIT_LOG = Object.freeze({WAITING: 'Retained placement repair waiting',
  REFUSED: 'Retained placement repair authority refused'});
const CONTINUATION_WAITS = new Set([WAITING.CONTINUATION, WAITING.BOUND_SPENT]);

function freshWindow(now, policy) {
  return {openedAt: now, deadlineAt: now + policy.windowMs, attempts: 0, delayMs: 0};
}

function sameWaiting(left, right) {
  return left.state === right.state && left.reason === right.reason;
}

function assignRetainedRepairReadRetryMethods(Repository) {
  Object.assign(Repository.prototype, {
    // Arms (or keeps) the record's one timer inside its episode's window. A
    // spent window reports once and stops.
    armRetainedRepairContinuation(attempt, reason) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return;
      attempt.waiting = {state: WAITING.CONTINUATION, reason};
      const current = attempt.continuation;
      if (current.state === CONTINUATION.ARMED) return;
      const policy = this.retainedRepairContinuationPolicy;
      const now = this.timeSource.now();
      const window = current.state === CONTINUATION.OPEN ? current.window :
        freshWindow(now, policy);
      if (now >= window.deadlineAt) {
        attempt.continuation = {state: CONTINUATION.SPENT, reason, window};
        attempt.waiting = {state: WAITING.BOUND_SPENT, reason};
        reportWaitBoundSpent(this.logger, {...RETAINED_REPAIR_WAIT, boundMs: policy.windowMs,
          elapsedMs: now - window.openedAt,
          lastObserved: {reason, attempts: window.attempts},
          scope: {operationId: attempt.operation.operationId}});
        return;
      }
      const delayMs = Math.min(policy.maxDelayMs,
        Math.max(policy.minDelayMs, window.delayMs * BACKOFF_MULTIPLIER));
      const armed = {state: CONTINUATION.ARMED, handle: null, reason,
        window: {...window, delayMs}};
      armed.handle = this.timeSource.setTimeout(() => {
        if (attempt.continuation !== armed || !this.retainedRepairAttemptIsCurrent(attempt)) return;
        attempt.continuation = {state: CONTINUATION.OPEN,
          window: {...armed.window, attempts: armed.window.attempts + 1}};
        this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt, attempt.owed);
      }, delayMs);
      attempt.continuation = armed;
    },

    // A qualified read satisfied the revalidation owed so far. It is not
    // progress by itself: the end of the decision settles the window.
    satisfyRetainedRepairRevalidation(attempt) {
      attempt.owed = OBSERVATION.NONE;
    },

    cancelRetainedRepairContinuation(attempt) {
      const current = attempt.continuation;
      attempt.continuation = IDLE_CONTINUATION;
      if (current.state === CONTINUATION.ARMED) this.timeSource.clearTimeout(current.handle);
    },

    // A decision starts owning no wait; its exits name the one it ends with.
    beginRetainedRepairDecision(attempt) {
      const before = attempt.waiting;
      attempt.waiting = NOT_WAITING;
      return before;
    },

    // The end of every decision settles who owns the next reconsideration.
    // A decision that left the owed revalidation untouched (no qualified read,
    // no new reason) keeps the previous wait. A delegated record owns no
    // continuation: its custodian does. A continuation-owned failure keeps or
    // arms the window; any other end closes it.
    endRetainedRepairDecision(attempt, before) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return;
      let waiting = attempt.waiting;
      if (waiting.state === WAITING.NONE && attempt.owed !== OBSERVATION.NONE) waiting = before;
      if (attempt.custody.state === CUSTODY.DELEGATED && CONTINUATION_WAITS.has(waiting.state)) {
        waiting = NOT_WAITING;
      }
      attempt.waiting = waiting;
      if (waiting.state === WAITING.CONTINUATION) {
        this.armRetainedRepairContinuation(attempt, waiting.reason);
      } else if (waiting.state !== WAITING.BOUND_SPENT) {
        this.cancelRetainedRepairContinuation(attempt);
      }
      if (!sameWaiting(attempt.waiting, before)) this.logRetainedRepairWaiting(attempt);
    },

    // One line per transition into a wait, never per evaluation. A typed
    // refusal is an error; a spent bound is its own single report.
    logRetainedRepairWaiting(attempt) {
      const {state, reason} = attempt.waiting;
      const fields = {operationId: attempt.operation.operationId, waiting: state, reason};
      if (state === WAITING.ROW_CHANGE) {
        this.logger.error(WAIT_LOG.REFUSED, fields);
      } else if (state === WAITING.CONTINUATION || state === WAITING.ROUTE_PUBLICATION) {
        this.logger.warn(WAIT_LOG.WAITING, fields);
      }
    },
  });
}

export {assignRetainedRepairReadRetryMethods};
