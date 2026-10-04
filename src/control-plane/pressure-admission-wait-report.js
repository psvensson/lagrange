/**
 * A pressure-governor admission waiter is a bounded wait: when its deadline
 * passes while pressure still defers it, the spent wait is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const PRESSURE_ADMISSION_WAIT = Object.freeze({
  wait: 'PRESSURE_ADMISSION_MAX_WAIT_MS',
  awaited: 'pressure admission capacity for a deferred work-class waiter',
});

// A waiter whose admission deadline passed while pressure still deferred it:
// the caller receives the DEFER decision (unchanged); the spent wait is visible.
function reportAdmissionWaitSpent(governor, waiter, decision, {nowMs, boundMs}) {
  const lastDecision = decision || waiter.deferDecision;
  reportWaitBoundSpent(governor.logger, {
    ...PRESSURE_ADMISSION_WAIT,
    boundMs,
    elapsedMs: nowMs - waiter.enqueuedAtMs,
    lastObserved: {
      workClass: waiter.workClass,
      lastAction: lastDecision?.action ?? null,
      lastReason: lastDecision?.reason ?? null,
      sensorThrew: decision === null,
      backpressured: lastDecision?.summary?.backpressured === true,
    },
    scope: {
      workClass: waiter.workClass,
      queuedWaiters: governor.admissionWaiters.length,
    },
    subject: waiter.workClass,
  });
}

export {reportAdmissionWaitSpent};
