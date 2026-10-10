import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const BYTE_ENCODING = 'utf8';
const RESULT_DEADLINE_WAIT = Object.freeze({
  wait: 'resultDeadlineMs',
  awaited: 'partition result rows collected before the request deadline',
});

const QUERY_RESULT_BUDGET_ERROR_CODE = Object.freeze({
  BYTES_EXHAUSTED: 'query_result_bytes_exhausted',
  ROWS_EXHAUSTED: 'query_result_rows_exhausted',
  WALL_TIME_EXHAUSTED: 'query_result_wall_time_exhausted',
});
const QUERY_RESULT_BUDGET_ERROR_MESSAGE = Object.freeze({
  BYTES_EXHAUSTED: 'Query result byte budget exhausted',
  ROWS_EXHAUSTED: 'Query result row budget exhausted',
  WALL_TIME_EXHAUSTED: 'Query result wall-time budget exhausted',
});
const QUERY_RESULT_BUDGET_ERROR_NAME = 'QueryResultBudgetError';

class QueryResultBudgetError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = QUERY_RESULT_BUDGET_ERROR_NAME;
    this.code = code;
    this.actual = options.actual;
    this.limit = options.limit;
  }
}

function positiveSafeLimit(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function assertQueryResultDeadline(options, progress) {
  options.cancellationToken?.throwIfCancelled?.();
  const deadlineMs = positiveSafeLimit(options.deadlineMs);
  if (deadlineMs !== null && Date.now() >= deadlineMs) {
    reportWaitBoundSpent(null, {
      ...RESULT_DEADLINE_WAIT,
      boundMs: null,
      lastObserved: {
        ...progress,
        deadlineMs,
        overshootMs: Date.now() - deadlineMs,
      },
    });
    throw new QueryResultBudgetError(
      QUERY_RESULT_BUDGET_ERROR_CODE.WALL_TIME_EXHAUSTED,
      QUERY_RESULT_BUDGET_ERROR_MESSAGE.WALL_TIME_EXHAUSTED,
      {actual: Date.now(), limit: deadlineMs},
    );
  }
}

function collectBoundedSqliteRows(statement, params = [], options = {}) {
  const maxBytes = positiveSafeLimit(options.maxBytes);
  const maxRows = positiveSafeLimit(options.maxRows);
  const deadlineMs = positiveSafeLimit(options.deadlineMs);
  if (maxBytes === null && maxRows === null && deadlineMs === null &&
      !options.cancellationToken) {
    return statement.all(...params);
  }
  const rows = [];
  let totalBytes = 0;
  assertQueryResultDeadline(options, {rowsCollected: 0, bytesCollected: 0});
  for (const row of statement.iterate(...params)) {
    assertQueryResultDeadline(options, {
      rowsCollected: rows.length,
      bytesCollected: totalBytes,
    });
    const nextRowCount = rows.length + 1;
    if (maxRows !== null && nextRowCount > maxRows) {
      throw new QueryResultBudgetError(
        QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED,
        QUERY_RESULT_BUDGET_ERROR_MESSAGE.ROWS_EXHAUSTED,
        {actual: nextRowCount, limit: maxRows},
      );
    }
    const rowBytes = Buffer.byteLength(
      JSON.stringify(row),
      BYTE_ENCODING,
    );
    const nextBytes = totalBytes + rowBytes;
    if (maxBytes !== null && nextBytes > maxBytes) {
      throw new QueryResultBudgetError(
        QUERY_RESULT_BUDGET_ERROR_CODE.BYTES_EXHAUSTED,
        QUERY_RESULT_BUDGET_ERROR_MESSAGE.BYTES_EXHAUSTED,
        {actual: nextBytes, limit: maxBytes},
      );
    }
    rows.push(row);
    totalBytes = nextBytes;
  }
  assertQueryResultDeadline(options, {
    rowsCollected: rows.length,
    bytesCollected: totalBytes,
    iterationComplete: true,
  });
  return rows;
}

export {
  collectBoundedSqliteRows,
  QUERY_RESULT_BUDGET_ERROR_CODE,
};
