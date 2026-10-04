/**
 * CDC group propagation retries are bounded by attempt counts; an exhausted
 * budget (foreground hand-over or background drop) is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const CDC_PROPAGATION_RETRY_WAIT = Object.freeze({
  FOREGROUND: Object.freeze({
    wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS',
    awaited: 'every target group acknowledged the CDC propagation wave ' +
      '(foreground; failures hand over to background retry)',
  }),
  BACKGROUND: Object.freeze({
    wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + BACKGROUND_MAX_ATTEMPTS',
    awaited: 'every target group acknowledged the CDC propagation wave ' +
      '(background; the wave is dropped)',
  }),
});

/**
 * A CDC propagation retry budget ran out: one wait_bound_spent ERROR with
 * the wave's table, operation, attempts, remaining failures, event count
 * (foreground) and whether the background retry spent it.
 * @param {Object} service - The CDC group propagation service.
 * @param {Object} waitName - A CDC_PROPAGATION_RETRY_WAIT entry.
 * @param {Object} spent - {tableName, operation, attempt, maxAttempts,
 *   failureCount, eventCount?}.
 * @return {void}
 */
function reportCdcPropagationRetrySpent(service, waitName, spent) {
  const background = waitName === CDC_PROPAGATION_RETRY_WAIT.BACKGROUND;
  reportWaitBoundSpent(service.logger, {
    ...waitName,
    boundMs: null,
    elapsedMs: null,
    lastObserved: {
      tableName: spent.tableName ?? null,
      operation: spent.operation ?? null,
      attempt: spent.attempt,
      maxAttempts: spent.maxAttempts,
      failureCount: spent.failureCount,
      eventCount: spent.eventCount ?? null,
      background,
    },
    scope: {nodeId: service.nodeId ?? null},
  });
}

function reportCdcPropagationForegroundRetrySpent(service, spent) {
  reportCdcPropagationRetrySpent(
    service, CDC_PROPAGATION_RETRY_WAIT.FOREGROUND, spent);
}

function reportCdcPropagationBackgroundRetrySpent(service, spent) {
  reportCdcPropagationRetrySpent(
    service, CDC_PROPAGATION_RETRY_WAIT.BACKGROUND, spent);
}

export {
  reportCdcPropagationBackgroundRetrySpent,
  reportCdcPropagationForegroundRetrySpent,
};
