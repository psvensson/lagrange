// One bounded continuation per retained record: the owner of reconsideration a
// failed authority read left owed. It paces timer-driven retries only (an event
// decides at once), dies with its record and is never shared across records.
// Delay bounds and the window are the repository's existing owner-read retry
// delays and rebalance operation budget (retainedRepairContinuationPolicy).
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {RETAINED_REPAIR_CONTINUATION as CONTINUATION, IDLE_CONTINUATION} from
  './replica-operation-retained-repair-record.js';
import {REPAIR_OBSERVATION as OBSERVATION} from './replica-operation-retained-repair-observation.js';

const BACKOFF_MULTIPLIER = 2;
const RETAINED_REPAIR_WAIT = Object.freeze({
  wait: 'TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS',
  awaited: 'a qualified retained placement repair authority read',
});

function freshWindow(now, policy) {
  return {openedAt: now, deadlineAt: now + policy.windowMs, attempts: 0, delayMs: 0};
}

function assignRetainedRepairReadRetryMethods(Repository) {
  Object.assign(Repository.prototype, {
    // A failed read leaves `owed` set; this arms (or keeps) the record's one
    // timer inside its bounded window. A spent window reports once and stops;
    // a later legitimate trigger opens a fresh window.
    armRetainedRepairContinuation(attempt, reason) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return;
      const current = attempt.continuation;
      if (current.state === CONTINUATION.ARMED) return;
      const policy = this.retainedRepairContinuationPolicy;
      const now = this.timeSource.now();
      const window = current.state === CONTINUATION.OPEN ? current.window :
        freshWindow(now, policy);
      if (now >= window.deadlineAt) {
        attempt.continuation = {state: CONTINUATION.SPENT, reason};
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

    // A qualified read satisfied what this decision was asked to revalidate.
    satisfyRetainedRepairRevalidation(attempt) {
      attempt.owed = OBSERVATION.NONE;
      this.cancelRetainedRepairContinuation(attempt);
    },

    cancelRetainedRepairContinuation(attempt) {
      const current = attempt.continuation;
      attempt.continuation = IDLE_CONTINUATION;
      if (current.state === CONTINUATION.ARMED) this.timeSource.clearTimeout(current.handle);
    },
  });
}

export {assignRetainedRepairReadRetryMethods};
