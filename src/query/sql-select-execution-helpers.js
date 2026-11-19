/**
 * Helper routines for select query execution, FROM-less SELECT evaluation in
 * CoordinatorMergeSession, and wait reporting.
 *
 * @module query/sql-select-execution-helpers
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {CoordinatorMergeSession} from './distributed/coordinator-merge-session.js';
import {
  assertQueryParametersBound,
  createParameterResolver,
  resolveExpectedOutputColumns,
} from './distributed/distributed-select-fanout-plan.js';
import {renderSelectWithParameters} from './sql-statement-renderer.js';
import {
  presentRawSqlRows,
  presentSqlRowObjects,
} from './sql-value-presentation.js';

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
    safeIntegers: queryOptions.safeIntegers === true,
  };
}

/**
 * Evaluate a FROM-less SELECT statement directly in CoordinatorMergeSession
 * (design coordinator-sqlite-merge §2.2, Sub-package 3d, decision D11).
 *
 * @param {Object} ast - Parsed SELECT AST.
 * @param {Array<*>} [params=[]] - Positional parameters.
 * @param {Object} [queryOptions={}] - Query options.
 * @return {Object} Query execution result.
 */
export function executeFromlessSelectInSession(ast, params = [], queryOptions = {}) {
  assertQueryParametersBound(ast, params);
  const rendered = renderSelectWithParameters(ast, createParameterResolver(params));
  const session = new CoordinatorMergeSession({
    budget: queryOptions?.budgets,
    resultMaxBytes: queryOptions?.budgets?.RESULT_MAX_BYTES,
    resultMaxRows: queryOptions?.budgets?.RESULT_MAX_ROWS,
    cancellationToken: queryOptions?.cancellationToken || null,
  });
  try {
    const merged = session.executeMergeSql(rendered.sql, rendered.params, {
      expectedColumns: resolveExpectedOutputColumns(ast),
    });
    const safeIntegers = queryOptions?.safeIntegers === true;
    const presentedRows = presentSqlRowObjects(merged.rows, {safeIntegers});
    const presentedRawRows = presentRawSqlRows(merged.rawRows, {safeIntegers});
    return {
      success: true,
      rows: presentedRows,
      rawRows: presentedRawRows,
      columns: merged.columns,
      rowSet: merged.rowSet,
      count: presentedRows.length,
      partitions: [],
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
  } finally {
    session.close();
  }
}
