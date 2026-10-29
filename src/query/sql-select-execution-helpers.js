/**
 * Helper routines for select query execution and wait reporting.
 *
 * @module query/sql-select-execution-helpers
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from './query-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_WAIT_FOR_CONDITION = 'wait_for_condition';

/**
 * Read the caller's last-observed state at expiry.
 *
 * @param {Function|undefined} observe
 * @return {Object|null}
 */
function observeConditionWait(observe) {
  if (typeof observe !== LOCAL_STR_FUNCTION) {
    return null;
  }
  try {
    return observe();
  } catch (observeError) {
    return {observeError: observeError?.message || String(observeError)};
  }
}

/**
 * Report one spent waitForCondition bound.
 *
 * @param {Object} engine - SQL query engine.
 * @param {Object} spent - Spent context.
 */
export function reportConditionWaitSpent(engine, spent) {
  const options = spent.timeoutOptions;
  const observed = observeConditionWait(options.observe);
  reportWaitBoundSpent(engine.logger, {
    wait: options.nestedOperation || LOCAL_STR_WAIT_FOR_CONDITION,
    awaited: spent.timeoutError,
    boundMs: spent.budget?.configuredBudgetMs,
    elapsedMs: (engine.nowFn || Date.now)() - spent.budget?.startedAtMs,
    lastObserved: {
      predicateSatisfied: false,
      polls: spent.polls,
      classification: spent.error.timeoutClassification?.classification,
      ...observed,
    },
    scope: options.scope,
  });
  spent.error.waitBoundSpentReported = true;
}

/**
 * Preserve the same request identity and caller budget on every read branch.
 *
 * @param {Object} queryOptions
 * @param {string|null} sessionId
 * @param {Object|null} transactionRead
 * @return {Object}
 */
export function selectRequestOptions(queryOptions, sessionId, transactionRead) {
  return {
    sessionId: transactionRead ? sessionId : null,
    transactionIdentity: transactionRead?.identity,
    timeoutMs: queryOptions.timeoutMs,
    timeoutBudget: queryOptions.timeoutBudget || null,
    cancellationToken: queryOptions.cancellationToken || null,
    resultMaxBytes: queryOptions.budgets?.RESULT_MAX_BYTES,
    resultMaxRows: queryOptions.budgets?.RESULT_MAX_ROWS,
  };
}

/**
 * Format result for a FROM-less SELECT statement.
 *
 * @param {Object} first
 * @param {string} partitionId
 * @return {Object}
 */
export function fromlessSelectResult(first, partitionId) {
  if (!first || !first.success) {
    return {
      success: false,
      error: first?.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED,
      errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR,
    };
  }

  return {
    success: true,
    rows: first.rows || [],
    count: first.rows?.length || 0,
    partitions: [partitionId],
    tableName: null,
    distributedPlan: null,
    distributedDiagnostics: null,
    distributedMetrics: {
      planningDurationMs: 0,
      executionDurationMs: 0,
      fanout: null,
      mergeDurationMs: 0,
    },
  };
}
