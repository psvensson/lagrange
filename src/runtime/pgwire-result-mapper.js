/**
 * PgWire result-to-wire mapping helpers.
 *
 * @module runtime/pgwire-result-mapper
 */

import {readAffectedRowCount} from '../query/application-database-result.js';
import {PG_ERROR_CODE} from './pgwire-protocol-constants.js';

const LOCAL_STR_SELECT = 'SELECT';
const LOCAL_STR_INSERT = 'INSERT';
const LOCAL_STR_UPDATE = 'UPDATE';
const LOCAL_STR_DELETE = 'DELETE';
const LOCAL_STR_CREATE = 'CREATE';
const LOCAL_STR_CREATE_TABLE = 'CREATE TABLE';
const LOCAL_STR_DROP = 'DROP';
const LOCAL_STR_DROP_TABLE = 'DROP TABLE';
const LOCAL_STR_BEGIN = 'BEGIN';
const LOCAL_STR_COMMIT = 'COMMIT';
const LOCAL_STR_ROLLBACK = 'ROLLBACK';
const LOCAL_STR_OK = 'OK';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_COLUMN = 'column';

// A DML result that carries no affected-row count has no truthful
// PostgreSQL command tag (the protocol has no "unknown count" tag), so the
// mapper refuses it as an internal error instead of reporting zero rows.
const PGWIRE_RESULT_MAPPER_ERROR = Object.freeze({
  MISSING_AFFECTED_ROW_COUNT: 'PGWIRE_MISSING_AFFECTED_ROW_COUNT',
  MISSING_AFFECTED_ROW_COUNT_MESSAGE:
    ' completed without an affected-row count in the engine result; ' +
    'no truthful command tag can be reported',
});

/**
 * The affected-row count of a DML result, read by the one result-count owner.
 *
 * @param {Object} result - SqlCore result.
 * @param {string} command - INSERT, UPDATE or DELETE.
 * @return {number} The engine-reported count.
 * @throws {Error} code PGWIRE_MISSING_AFFECTED_ROW_COUNT, sqlState XX000,
 *   when the result carries no count (never read as zero rows).
 */
function requireAffectedRowCount(result, command) {
  const count = readAffectedRowCount(result);
  if (count !== null) return count;
  const error = new Error(
    command + PGWIRE_RESULT_MAPPER_ERROR.MISSING_AFFECTED_ROW_COUNT_MESSAGE,
  );
  error.code = PGWIRE_RESULT_MAPPER_ERROR.MISSING_AFFECTED_ROW_COUNT;
  error.sqlState = PG_ERROR_CODE.INTERNAL_ERROR;
  throw error;
}

/**
 * Derive a command tag from a SQL result.
 *
 * @param {Object} result - SqlCore result.
 * @param {string} query - Original SQL query.
 * @return {string} PG command tag.
 * @throws {Error} When a DML result carries no affected-row count.
 */
function deriveCommandTag(result, query) {
  const upper = query.trimStart().toUpperCase();
  if (upper.startsWith(LOCAL_STR_SELECT)) {
    const count = Array.isArray(result?.rows) ?
      result.rows.length : 0;
    return `SELECT ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_INSERT)) {
    const count = requireAffectedRowCount(result, LOCAL_STR_INSERT);
    return `INSERT 0 ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_UPDATE)) {
    const count = requireAffectedRowCount(result, LOCAL_STR_UPDATE);
    return `UPDATE ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_DELETE)) {
    const count = requireAffectedRowCount(result, LOCAL_STR_DELETE);
    return `DELETE ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_CREATE)) return LOCAL_STR_CREATE_TABLE;
  if (upper.startsWith(LOCAL_STR_DROP)) return LOCAL_STR_DROP_TABLE;
  if (upper.startsWith(LOCAL_STR_BEGIN)) return LOCAL_STR_BEGIN;
  if (upper.startsWith(LOCAL_STR_COMMIT)) return LOCAL_STR_COMMIT;
  if (upper.startsWith(LOCAL_STR_ROLLBACK)) return LOCAL_STR_ROLLBACK;
  return LOCAL_STR_OK;
}

/**
 * Extract column descriptors from a SqlCore result.
 *
 * @param {Object} result - SqlCore result.
 * @return {Array<{name: string}>}
 */
function extractColumns(result) {
  if (result?.columns && Array.isArray(result.columns)) {
    return result.columns.map((c) =>
      typeof c === LOCAL_STR_STRING ? {name: c} : {name: c.name || LOCAL_STR_COLUMN},
    );
  }
  if (Array.isArray(result?.rows) && result.rows.length > 0) {
    return Object.keys(result.rows[0]).map((k) => ({name: k}));
  }
  return [];
}

/**
 * Extract row values from a SqlCore result row.
 *
 * @param {Object} row - Single result row.
 * @param {Array<{name: string}>} columns - Column descriptors.
 * @return {Array<string|null>}
 */
function extractRowValues(row, columns) {
  if (Array.isArray(row)) return row.map((v) => v ?? null);
  return columns.map((c) => {
    const v = row[c.name];
    return v === undefined ? null : v;
  });
}

export {
  deriveCommandTag,
  extractColumns,
  extractRowValues,
};
