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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF } from '../constants/index.js';
import { DEFAULT_QUERY_BUDGET, QUERY_BUDGET_ERROR_MSG } from '../wasm-service/query-budget-constants.js';

/**
 * Stream state constants.
 * @enum {string}
 */
const STREAM_STATE = Object.freeze(stryMutAct_9fa48("118507") ? {} : (stryCov_9fa48("118507"), {
  OPEN: stryMutAct_9fa48("118508") ? "" : (stryCov_9fa48("118508"), 'open'),
  CLOSED: stryMutAct_9fa48("118509") ? "" : (stryCov_9fa48("118509"), 'closed'),
  BUDGET_EXCEEDED: stryMutAct_9fa48("118510") ? "" : (stryCov_9fa48("118510"), 'budget_exceeded')
}));

/**
 * Error messages specific to result streaming.
 * @enum {string}
 */
const STREAM_ERROR_MSG = Object.freeze(stryMutAct_9fa48("118511") ? {} : (stryCov_9fa48("118511"), {
  STREAM_CLOSED: stryMutAct_9fa48("118512") ? "" : (stryCov_9fa48("118512"), 'Cannot push to a closed result stream'),
  ROWS_MUST_BE_ARRAY: stryMutAct_9fa48("118513") ? "" : (stryCov_9fa48("118513"), 'Pushed rows must be an array'),
  LISTENER_MUST_BE_FUNCTION: stryMutAct_9fa48("118514") ? "" : (stryCov_9fa48("118514"), 'Stream listener must be a function')
}));

/**
 * Estimate the byte size of a row using JSON serialization.
 *
 * @param {Object} row - Row object.
 * @return {number} Estimated byte size.
 */
function estimateRowBytes(row) {
  if (stryMutAct_9fa48("118515")) {
    {}
  } else {
    stryCov_9fa48("118515");
    if (stryMutAct_9fa48("118518") ? row === null && row === undefined : stryMutAct_9fa48("118517") ? false : stryMutAct_9fa48("118516") ? true : (stryCov_9fa48("118516", "118517", "118518"), (stryMutAct_9fa48("118520") ? row !== null : stryMutAct_9fa48("118519") ? false : (stryCov_9fa48("118519", "118520"), row === null)) || (stryMutAct_9fa48("118522") ? row !== undefined : stryMutAct_9fa48("118521") ? false : (stryCov_9fa48("118521", "118522"), row === undefined)))) return NUM.ZERO;
    if (stryMutAct_9fa48("118525") ? typeof row !== TYPEOF.STRING : stryMutAct_9fa48("118524") ? false : stryMutAct_9fa48("118523") ? true : (stryCov_9fa48("118523", "118524", "118525"), typeof row === TYPEOF.STRING)) return row.length;
    return JSON.stringify(row).length;
  }
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
    if (stryMutAct_9fa48("118526")) {
      {}
    } else {
      stryCov_9fa48("118526");
      const merged = stryMutAct_9fa48("118527") ? {} : (stryCov_9fa48("118527"), {
        ...DEFAULT_QUERY_BUDGET,
        ...budgets
      });
      this.maxRows = merged.RESULT_MAX_ROWS;
      this.maxBytes = merged.RESULT_MAX_BYTES;
      this.totalRows = NUM.ZERO;
      this.totalBytes = NUM.ZERO;
      this.rows = stryMutAct_9fa48("118528") ? ["Stryker was here"] : (stryCov_9fa48("118528"), []);
      this.state = STREAM_STATE.OPEN;
      this.budgetError = null;
      this._listeners = stryMutAct_9fa48("118529") ? ["Stryker was here"] : (stryCov_9fa48("118529"), []);
    }
  }

  /**
   * Register a listener called for each pushed batch.
   *
   * @param {Function} fn - Listener receiving (rows, meta).
   */
  onData(fn) {
    if (stryMutAct_9fa48("118530")) {
      {}
    } else {
      stryCov_9fa48("118530");
      if (stryMutAct_9fa48("118533") ? typeof fn === TYPEOF.FUNCTION : stryMutAct_9fa48("118532") ? false : stryMutAct_9fa48("118531") ? true : (stryCov_9fa48("118531", "118532", "118533"), typeof fn !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("118534")) {
          {}
        } else {
          stryCov_9fa48("118534");
          throw new Error(STREAM_ERROR_MSG.LISTENER_MUST_BE_FUNCTION);
        }
      }
      this._listeners.push(fn);
    }
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
    if (stryMutAct_9fa48("118535")) {
      {}
    } else {
      stryCov_9fa48("118535");
      if (stryMutAct_9fa48("118538") ? this.state === STREAM_STATE.OPEN : stryMutAct_9fa48("118537") ? false : stryMutAct_9fa48("118536") ? true : (stryCov_9fa48("118536", "118537", "118538"), this.state !== STREAM_STATE.OPEN)) {
        if (stryMutAct_9fa48("118539")) {
          {}
        } else {
          stryCov_9fa48("118539");
          throw new Error(STREAM_ERROR_MSG.STREAM_CLOSED);
        }
      }
      if (stryMutAct_9fa48("118542") ? false : stryMutAct_9fa48("118541") ? true : stryMutAct_9fa48("118540") ? Array.isArray(rows) : (stryCov_9fa48("118540", "118541", "118542"), !Array.isArray(rows))) {
        if (stryMutAct_9fa48("118543")) {
          {}
        } else {
          stryCov_9fa48("118543");
          throw new Error(STREAM_ERROR_MSG.ROWS_MUST_BE_ARRAY);
        }
      }
      let accepted = NUM.ZERO;
      for (const row of rows) {
        if (stryMutAct_9fa48("118544")) {
          {}
        } else {
          stryCov_9fa48("118544");
          const rowBytes = estimateRowBytes(row);
          if (stryMutAct_9fa48("118548") ? this.totalRows + NUM.ONE <= this.maxRows : stryMutAct_9fa48("118547") ? this.totalRows + NUM.ONE >= this.maxRows : stryMutAct_9fa48("118546") ? false : stryMutAct_9fa48("118545") ? true : (stryCov_9fa48("118545", "118546", "118547", "118548"), (stryMutAct_9fa48("118549") ? this.totalRows - NUM.ONE : (stryCov_9fa48("118549"), this.totalRows + NUM.ONE)) > this.maxRows)) {
            if (stryMutAct_9fa48("118550")) {
              {}
            } else {
              stryCov_9fa48("118550");
              this._exceed(QUERY_BUDGET_ERROR_MSG.RESULT_MAX_ROWS_EXCEEDED);
              break;
            }
          }
          if (stryMutAct_9fa48("118554") ? this.totalBytes + rowBytes <= this.maxBytes : stryMutAct_9fa48("118553") ? this.totalBytes + rowBytes >= this.maxBytes : stryMutAct_9fa48("118552") ? false : stryMutAct_9fa48("118551") ? true : (stryCov_9fa48("118551", "118552", "118553", "118554"), (stryMutAct_9fa48("118555") ? this.totalBytes - rowBytes : (stryCov_9fa48("118555"), this.totalBytes + rowBytes)) > this.maxBytes)) {
            if (stryMutAct_9fa48("118556")) {
              {}
            } else {
              stryCov_9fa48("118556");
              this._exceed(QUERY_BUDGET_ERROR_MSG.RESULT_MAX_BYTES_EXCEEDED);
              break;
            }
          }
          this.rows.push(row);
          stryMutAct_9fa48("118557") ? this.totalRows -= NUM.ONE : (stryCov_9fa48("118557"), this.totalRows += NUM.ONE);
          stryMutAct_9fa48("118558") ? this.totalBytes -= rowBytes : (stryCov_9fa48("118558"), this.totalBytes += rowBytes);
          stryMutAct_9fa48("118559") ? accepted -= NUM.ONE : (stryCov_9fa48("118559"), accepted += NUM.ONE);
        }
      }
      const exceeded = stryMutAct_9fa48("118562") ? this.state !== STREAM_STATE.BUDGET_EXCEEDED : stryMutAct_9fa48("118561") ? false : stryMutAct_9fa48("118560") ? true : (stryCov_9fa48("118560", "118561", "118562"), this.state === STREAM_STATE.BUDGET_EXCEEDED);
      if (stryMutAct_9fa48("118566") ? accepted <= NUM.ZERO : stryMutAct_9fa48("118565") ? accepted >= NUM.ZERO : stryMutAct_9fa48("118564") ? false : stryMutAct_9fa48("118563") ? true : (stryCov_9fa48("118563", "118564", "118565", "118566"), accepted > NUM.ZERO)) {
        if (stryMutAct_9fa48("118567")) {
          {}
        } else {
          stryCov_9fa48("118567");
          const batch = stryMutAct_9fa48("118568") ? this.rows : (stryCov_9fa48("118568"), this.rows.slice(stryMutAct_9fa48("118569") ? this.rows.length + accepted : (stryCov_9fa48("118569"), this.rows.length - accepted)));
          this._notify(batch);
        }
      }
      return stryMutAct_9fa48("118570") ? {} : (stryCov_9fa48("118570"), {
        accepted,
        totalRows: this.totalRows,
        totalBytes: this.totalBytes,
        exceeded
      });
    }
  }

  /**
   * Close the stream. No more rows can be pushed.
   *
   * @return {{totalRows: number, totalBytes: number,
   *   state: string}} Final stream summary.
   */
  close() {
    if (stryMutAct_9fa48("118571")) {
      {}
    } else {
      stryCov_9fa48("118571");
      if (stryMutAct_9fa48("118574") ? this.state !== STREAM_STATE.OPEN : stryMutAct_9fa48("118573") ? false : stryMutAct_9fa48("118572") ? true : (stryCov_9fa48("118572", "118573", "118574"), this.state === STREAM_STATE.OPEN)) {
        if (stryMutAct_9fa48("118575")) {
          {}
        } else {
          stryCov_9fa48("118575");
          this.state = STREAM_STATE.CLOSED;
        }
      }
      return stryMutAct_9fa48("118576") ? {} : (stryCov_9fa48("118576"), {
        totalRows: this.totalRows,
        totalBytes: this.totalBytes,
        state: this.state
      });
    }
  }

  /**
   * Get all collected rows.
   *
   * @return {Array<Object>} Collected rows.
   */
  getRows() {
    if (stryMutAct_9fa48("118577")) {
      {}
    } else {
      stryCov_9fa48("118577");
      return this.rows;
    }
  }

  /**
   * Mark the stream as budget-exceeded.
   *
   * @param {string} message - Budget error message.
   * @private
   */
  _exceed(message) {
    if (stryMutAct_9fa48("118578")) {
      {}
    } else {
      stryCov_9fa48("118578");
      this.state = STREAM_STATE.BUDGET_EXCEEDED;
      this.budgetError = message;
    }
  }

  /**
   * Notify listeners of a new batch.
   *
   * @param {Array<Object>} batch - Accepted rows.
   * @private
   */
  _notify(batch) {
    if (stryMutAct_9fa48("118579")) {
      {}
    } else {
      stryCov_9fa48("118579");
      const meta = stryMutAct_9fa48("118580") ? {} : (stryCov_9fa48("118580"), {
        totalRows: this.totalRows,
        totalBytes: this.totalBytes
      });
      for (const fn of this._listeners) {
        if (stryMutAct_9fa48("118581")) {
          {}
        } else {
          stryCov_9fa48("118581");
          fn(batch, meta);
        }
      }
    }
  }
}
export { ResultStream, estimateRowBytes, STREAM_STATE, STREAM_ERROR_MSG };