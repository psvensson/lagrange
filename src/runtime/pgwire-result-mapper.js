/**
 * PgWire result-to-wire mapping helpers.
 *
 * @module runtime/pgwire-result-mapper
 */

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

/**
 * Derive a command tag from a SQL result.
 *
 * @param {Object} result - SqlCore result.
 * @param {string} query - Original SQL query.
 * @return {string} PG command tag.
 */
function deriveCommandTag(result, query) {
  const upper = query.trimStart().toUpperCase();
  if (upper.startsWith(LOCAL_STR_SELECT)) {
    const count = Array.isArray(result?.rows) ?
      result.rows.length : 0;
    return `SELECT ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_INSERT)) {
    const count = result?.changes ?? result?.rowCount ?? 0;
    return `INSERT 0 ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_UPDATE)) {
    const count = result?.changes ?? result?.rowCount ?? 0;
    return `UPDATE ${count}`;
  }
  if (upper.startsWith(LOCAL_STR_DELETE)) {
    const count = result?.changes ?? result?.rowCount ?? 0;
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
