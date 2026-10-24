/**
 * CDC group propagation retries are bounded by attempt counts and the live
 * source invocation duration. Their actual stop is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {LogThrottle} from '../logging/log-throttle.js';
import {LoggingService} from '../logging/logging-service.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE, CDC_GROUP_PROPAGATION_LOG_MSG} from
  './cdc-group-propagation-constants.js';

const RETRY_SCHEDULE_LEVEL = 'warn';
// One bucket per service. Neither changing targets nor repeated retries grow this state.
const scheduledRetryThrottles = new WeakMap();

function reportCdcPropagationRetryScheduled(service, scheduled) {
  let throttle = scheduledRetryThrottles.get(service);
  if (!throttle) {
    throttle = new LogThrottle({now: () => service.now()});
    scheduledRetryThrottles.set(service, throttle);
  }
  const suppressed = throttle.admit(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES);
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
 * count, event count and why it stopped. The source owner keeps the debt.
 * @param {Object} service - The CDC group propagation service.
 * @param {Object} spent - {tableName, operation, attempt, maxAttempts,
 *   failureCount, eventCount, stopReason, remainingMs?, retryDelayMs?}.
 * @return {void}
 */
function reportCdcPropagationForegroundRetrySpent(service, spent) {
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
    },
    scope: {nodeId: service.nodeId ?? null},
  });
}

export {
  reportCdcPropagationForegroundRetrySpent,
  reportCdcPropagationRetryScheduled,
};
