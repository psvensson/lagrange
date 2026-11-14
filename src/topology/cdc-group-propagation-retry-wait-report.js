/**
 * CDC group propagation retries are bounded by attempt counts and the live
 * source invocation duration. Their actual stop is reported here.
 */

import {WAIT_BOUND_SPENT_SINK, reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {LogThrottle} from '../logging/log-throttle.js';
import {LoggingService} from '../logging/logging-service.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE, CDC_GROUP_PROPAGATION_LOG_MSG} from
  './cdc-group-propagation-constants.js';

const RETRY_SCHEDULE_LEVEL = 'warn';
const FOREGROUND_RETRY_SPENT_THROTTLE_KEY = 'cdc_propagation_foreground_retry_spent';
// One throttle per service, one bucket per report. Neither changing targets,
// repeated retries nor overlapping waves grow this state.
const retryReportThrottles = new WeakMap();

function admitRetryReport(service, key) {
  let throttle = retryReportThrottles.get(service);
  if (!throttle) {
    throttle = new LogThrottle({now: () => service.now()});
    retryReportThrottles.set(service, throttle);
  }
  return throttle.admit(key);
}

function reportCdcPropagationRetryScheduled(service, scheduled) {
  const suppressed = admitRetryReport(service,
    CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES);
  if (suppressed === null) return;
  const logger = typeof service.logger?.logConsoleOnly === 'function' ?
    service.logger : LoggingService.getInstance();
  // Retrying CDC may itself be carrying a logs-table write. Never feed this
  // recurring scheduling notice back through the CDC pipeline it observes.
  logger.logConsoleOnly(RETRY_SCHEDULE_LEVEL,
    CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES,
    {nodeId: service.nodeId, ...scheduled, suppressed});
}

const FOREGROUND_DURATION_WAIT = 'CDC delivery invocation remaining duration for the next retry';
const CDC_PROPAGATION_RETRY_WAIT = Object.freeze({
  wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS',
  awaited: 'complete canonical native/provisional coverage for the durable CDC propagation ' +
    'wave (foreground; unresolved debt returns to the source owner)',
});

/**
 * A durable wave's foreground retry budget ran out: one wait_bound_spent
 * ERROR with the wave's table, operation, attempts, its aggregate failure
 * count, event count, why it stopped and how many reports the throttle
 * suppressed before it. The source owner keeps the debt. Like the scheduling
 * notice it is console-only and throttled per service: many waves fail
 * together, and a wave may itself be carrying a logs-table write, so this
 * report is never fed back through the CDC pipeline it observes.
 * @param {Object} service - The CDC group propagation service.
 * @param {Object} spent - {tableName, operation, attempt, maxAttempts,
 *   failureCount, eventCount, stopReason, remainingMs?, retryDelayMs?}.
 * @return {void}
 */
function reportCdcPropagationForegroundRetrySpent(service, spent) {
  const suppressed = admitRetryReport(service, FOREGROUND_RETRY_SPENT_THROTTLE_KEY);
  if (suppressed === null) return;
  reportWaitBoundSpent(service.logger, {
    ...CDC_PROPAGATION_RETRY_WAIT,
    ...(spent.stopReason === CDC_GROUP_FOREGROUND_RETRY_STATE.INSUFFICIENT_DURATION ?
      {wait: FOREGROUND_DURATION_WAIT} : {}),
    boundMs: null,
    elapsedMs: null,
    lastObserved: {
      tableName: spent.tableName ?? null,
      operation: spent.operation ?? null,
      attempt: spent.attempt,
      maxAttempts: spent.maxAttempts,
      failureCount: spent.failureCount,
      eventCount: spent.eventCount ?? null,
      stopReason: spent.stopReason,
      ...(spent.remainingMs === undefined ? {} : {remainingMs: spent.remainingMs}),
      ...(spent.retryDelayMs === undefined ? {} : {retryDelayMs: spent.retryDelayMs}),
      suppressed,
    },
    scope: {nodeId: service.nodeId ?? null},
    sink: WAIT_BOUND_SPENT_SINK.CONSOLE_ONLY,
  });
}

export {
  reportCdcPropagationForegroundRetrySpent,
  reportCdcPropagationRetryScheduled,
};
