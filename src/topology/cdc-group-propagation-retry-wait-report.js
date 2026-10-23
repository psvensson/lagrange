/**
 * CDC group propagation retries are bounded by attempt counts and, for durable
 * work, the live source invocation duration. Their actual stop is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {CDC_GROUP_FOREGROUND_CONTINUATION, CDC_GROUP_FOREGROUND_RETRY_STATE} from
  './cdc-group-propagation-constants.js';

const DURABLE_FOREGROUND_AWAITED =
  'complete canonical native/provisional coverage for the durable CDC propagation wave ' +
  '(foreground; unresolved debt returns to the source owner)';
const FOREGROUND_DURATION_WAIT = 'CDC delivery invocation remaining duration for the next retry';
const FOREGROUND_FAILURE_UNIT = Object.freeze({
  TARGETS: 'target_failures',
  DURABLE_WAVE: 'aggregate_durable_wave',
});

const CDC_PROPAGATION_RETRY_WAIT = Object.freeze({
  FOREGROUND: Object.freeze({
    wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS',
    awaited: 'every target group acknowledged the CDC propagation wave ' +
      '(foreground; failures hand over to background retry)',
  }),
  DURABLE_FOREGROUND: Object.freeze({
    wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS',
    awaited: DURABLE_FOREGROUND_AWAITED,
  }),
  BACKGROUND: Object.freeze({
    wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + BACKGROUND_MAX_ATTEMPTS',
    awaited: 'every target group acknowledged the CDC propagation wave ' +
      '(background; the wave is dropped)',
  }),
});

function foregroundObservation(spent) {
  const continuation = spent.continuation ?? CDC_GROUP_FOREGROUND_CONTINUATION.BACKGROUND_RETRY;
  return {
    stopReason: spent.stopReason ?? CDC_GROUP_FOREGROUND_RETRY_STATE.ATTEMPTS_EXHAUSTED,
    continuation,
    failureCountUnit: continuation === CDC_GROUP_FOREGROUND_CONTINUATION.SOURCE_OWNER ?
      FOREGROUND_FAILURE_UNIT.DURABLE_WAVE : FOREGROUND_FAILURE_UNIT.TARGETS,
    ...(spent.remainingMs === undefined ? {} : {remainingMs: spent.remainingMs}),
    ...(spent.retryDelayMs === undefined ? {} : {retryDelayMs: spent.retryDelayMs}),
  };
}

/**
 * A CDC propagation retry budget ran out: one wait_bound_spent ERROR with
 * the wave's table, operation, attempts, remaining failures, event count
 * (foreground) and whether the background retry spent it.
 * @param {Object} service - The CDC group propagation service.
 * @param {Object} waitName - A CDC_PROPAGATION_RETRY_WAIT entry.
 * @param {Object} spent - {tableName, operation, attempt, maxAttempts,
 *   failureCount, eventCount?, stopReason?, continuation?, remainingMs?, retryDelayMs?}.
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
      ...(background ? {} : foregroundObservation(spent)),
    },
    scope: {nodeId: service.nodeId ?? null},
  });
}

function reportCdcPropagationForegroundRetrySpent(service, spent) {
  const waitName = spent.continuation === CDC_GROUP_FOREGROUND_CONTINUATION.SOURCE_OWNER ?
    CDC_PROPAGATION_RETRY_WAIT.DURABLE_FOREGROUND : CDC_PROPAGATION_RETRY_WAIT.FOREGROUND;
  reportCdcPropagationRetrySpent(
    service, spent.stopReason === CDC_GROUP_FOREGROUND_RETRY_STATE.INSUFFICIENT_DURATION ?
      {...waitName, wait: FOREGROUND_DURATION_WAIT} : waitName, spent);
}

function reportCdcPropagationBackgroundRetrySpent(service, spent) {
  reportCdcPropagationRetrySpent(
    service, CDC_PROPAGATION_RETRY_WAIT.BACKGROUND, spent);
}

export {
  reportCdcPropagationBackgroundRetrySpent,
  reportCdcPropagationForegroundRetrySpent,
};
