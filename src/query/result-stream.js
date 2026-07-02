/**
 * ResultStream — streams callback results with per-query
 * result budget enforcement.
 *
 * Collects rows from partition batch callbacks and enforces
 * row count and byte size limits. When a budget is exceeded,
 * the stream terminates with a descriptive error.
 *
 * Requirements: 4.4, 9.1
 */

import {
  DEFAULT_QUERY_BUDGET,
  QUERY_BUDGET_ERROR_MSG,
} from '../wasm-service/query-budget-constants.js';

/**
 * Stream state constants.
 * @enum {string}
 */
const STREAM_STATE = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  BUDGET_EXCEEDED: 'budget_exceeded',
});

/**
 * Error messages specific to result streaming.
 * @enum {string}
 */
const STREAM_ERROR_MSG = Object.freeze({
  STREAM_CLOSED: 'Cannot push to a closed result stream',
  ROWS_MUST_BE_ARRAY: 'Pushed rows must be an array',
  LISTENER_MUST_BE_FUNCTION: 'Stream listener must be a function',
});

/**
 * Estimate the byte size of a row using JSON serialization.
 *
 * @param {Object} row - Row object.
 * @return {number} Estimated byte size.
 */
function estimateRowBytes(row) {
  if (row === null || row === undefined) return 0;
  if (typeof row === 'string') return row.length;
  return JSON.stringify(row).length;
}

/**
 * ResultStream collects rows from partition callbacks and
 * enforces per-query result budgets (max rows, max bytes).
 */
class ResultStream {
  /**
   * @param {Object} [budgets] - Budget overrides. Falls back
   *   to DEFAULT_QUERY_BUDGET for missing fields.
   */
  constructor(budgets) {
    const merged = {...DEFAULT_QUERY_BUDGET, ...budgets};
    this.maxRows = merged.RESULT_MAX_ROWS;
    this.maxBytes = merged.RESULT_MAX_BYTES;
    this.totalRows = 0;
    this.totalBytes = 0;
    this.rows = [];
    this.state = STREAM_STATE.OPEN;
    this.budgetError = null;
    this._listeners = [];
  }

  /**
   * Register a listener called for each pushed batch.
   *
   * @param {Function} fn - Listener receiving (rows, meta).
   */
  onData(fn) {
    if (typeof fn !== 'function') {
      throw new Error(STREAM_ERROR_MSG.LISTENER_MUST_BE_FUNCTION);
    }
    this._listeners.push(fn);
  }

  /**
   * Push a batch of rows into the stream.
   *
   * Requirement 4.4: Stream results and enforce result budget
   * limits per query.
   * Requirement 9.1: Enforce limits; terminate on exceed.
   *
   * @param {Array<Object>} rows - Rows to push.
   * @return {{accepted: number, totalRows: number,
   *   totalBytes: number, exceeded: boolean}}
   *   Push result with budget status.
   * @throws {Error} If stream is closed or rows is not array.
   */
  push(rows) {
    if (this.state !== STREAM_STATE.OPEN) {
      throw new Error(STREAM_ERROR_MSG.STREAM_CLOSED);
    }
    if (!Array.isArray(rows)) {
      throw new Error(STREAM_ERROR_MSG.ROWS_MUST_BE_ARRAY);
    }

    let accepted = 0;

    for (const row of rows) {
      const rowBytes = estimateRowBytes(row);

      if (this.totalRows + 1 > this.maxRows) {
        this._exceed(
          QUERY_BUDGET_ERROR_MSG.RESULT_MAX_ROWS_EXCEEDED,
        );
        break;
      }
      if (this.totalBytes + rowBytes > this.maxBytes) {
        this._exceed(
          QUERY_BUDGET_ERROR_MSG.RESULT_MAX_BYTES_EXCEEDED,
        );
        break;
      }

      this.rows.push(row);
      this.totalRows += 1;
      this.totalBytes += rowBytes;
      accepted += 1;
    }

    const exceeded = this.state === STREAM_STATE.BUDGET_EXCEEDED;

    if (accepted > 0) {
      const batch = this.rows.slice(
        this.rows.length - accepted,
      );
      this._notify(batch);
    }

    return {
      accepted,
      totalRows: this.totalRows,
      totalBytes: this.totalBytes,
      exceeded,
    };
  }

  /**
   * Close the stream. No more rows can be pushed.
   *
   * @return {{totalRows: number, totalBytes: number,
   *   state: string}} Final stream summary.
   */
  close() {
    if (this.state === STREAM_STATE.OPEN) {
      this.state = STREAM_STATE.CLOSED;
    }
    return {
      totalRows: this.totalRows,
      totalBytes: this.totalBytes,
      state: this.state,
    };
  }

  /**
   * Get all collected rows.
   *
   * @return {Array<Object>} Collected rows.
   */
  getRows() {
    return this.rows;
  }

  /**
   * Mark the stream as budget-exceeded.
   *
   * @param {string} message - Budget error message.
   * @private
   */
  _exceed(message) {
    this.state = STREAM_STATE.BUDGET_EXCEEDED;
    this.budgetError = message;
  }

  /**
   * Notify listeners of a new batch.
   *
   * @param {Array<Object>} batch - Accepted rows.
   * @private
   */
  _notify(batch) {
    const meta = {
      totalRows: this.totalRows,
      totalBytes: this.totalBytes,
    };
    for (const fn of this._listeners) {
      fn(batch, meta);
    }
  }
}

export {
  ResultStream,
  estimateRowBytes,
  STREAM_STATE,
  STREAM_ERROR_MSG,
};
