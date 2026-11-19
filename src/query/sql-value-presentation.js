/**
 * Canonical client presentation owner for SQL values decoded from TypedRowSet
 * or produced by CoordinatorMergeSession (design coordinator-sqlite-merge §2.6,
 * decisions D3 and C3).
 *
 * Every exit of typed rows applies this module so that:
 * - INTEGER (`BigInt` in memory) becomes a JS `number` when within the IEEE-754
 *   safe integer range `[-9007199254740991, 9007199254740991]`, or raises the
 *   typed refusal `INTEGER_PRECISION_UNREPRESENTABLE` outside that range unless
 *   `{safeIntegers: true}` was requested by the caller;
 * - REAL (`number`), TEXT (`string`), BLOB (`Buffer`), and NULL (`null`) pass
 *   through unchanged.
 *
 * @module query/sql-value-presentation
 */

import {QUERY_ERROR_CODE} from './query-constants.js';

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Build the typed refusal for an INTEGER outside the JS safe integer range.
 * @param {bigint} value - Unrepresentable 64-bit integer value.
 * @return {Error}
 */
function createIntegerPrecisionError(value) {
  const error = new Error(
    `SQLite INTEGER ${value.toString()} exceeds JavaScript safe integer range`,
  );
  error.code = QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE;
  error.errorCode = QUERY_ERROR_CODE.INTEGER_PRECISION_UNREPRESENTABLE;
  return error;
}

/**
 * Present one typed SQL value for a JS consumer.
 * @param {*} value - Decoded SQL value (`bigint`, `number`, `string`, `Buffer`, `null`).
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false] - Keep `BigInt` values intact.
 * @return {*}
 */
function presentSqlValue(value, options = {}) {
  if (options?.safeIntegers === true) {
    return value;
  }
  if (typeof value === 'bigint') {
    if (value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT) {
      throw createIntegerPrecisionError(value);
    }
    return Number(value);
  }
  return value;
}

/**
 * Present one row object's values in order.
 * @param {Object} row - Materialized row object.
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Object}
 */
function presentSqlRowObject(row, options = {}) {
  if (!row || typeof row !== 'object' || options?.safeIntegers === true) {
    return row;
  }
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = presentSqlValue(value, options);
  }
  return out;
}

/**
 * Present an array of materialized row objects.
 * @param {Array<Object>} rows
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Array<Object>}
 */
function presentSqlRowObjects(rows, options = {}) {
  if (!Array.isArray(rows) || options?.safeIntegers === true) {
    return rows;
  }
  return rows.map((row) => presentSqlRowObject(row, options));
}

/**
 * Present an array of positional raw row arrays.
 * @param {Array<Array<*>>} rawRows
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Array<Array<*>>}
 */
function presentRawSqlRows(rawRows, options = {}) {
  if (!Array.isArray(rawRows) || options?.safeIntegers === true) {
    return rawRows;
  }
  return rawRows.map((row) =>
    Array.isArray(row) ? row.map((cell) => presentSqlValue(cell, options)) : row,
  );
}

/**
 * Materialize object rows from `(columns, rawRows)` and apply client
 * presentation to every cell.
 * @param {string[]} columns - Result column names in order.
 * @param {Array<Array<*>>} rawRows - Positional row arrays.
 * @param {Object} [options={}]
 * @param {boolean} [options.safeIntegers=false]
 * @return {Array<Object>}
 */
function materializeAndPresentRowObjects(columns, rawRows, options = {}) {
  if (!Array.isArray(rawRows)) {
    return [];
  }
  const safeIntegers = options?.safeIntegers === true;
  return rawRows.map((rawRow) => {
    const obj = {};
    for (let i = 0; i < columns.length; i += 1) {
      const value = rawRow[i] === undefined ? null : rawRow[i];
      obj[columns[i]] = safeIntegers ? value : presentSqlValue(value, options);
    }
    return obj;
  });
}

export {
  materializeAndPresentRowObjects,
  presentRawSqlRows,
  presentSqlRowObjects,
  presentSqlValue,
};
