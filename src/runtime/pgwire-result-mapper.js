/**
 * PgWire result-to-wire mapping helpers.
 *
 * @module runtime/pgwire-result-mapper
 */

import {
  readAffectedRowCount,
  readExecutedStatementType,
} from '../query/application-database-result.js';
import {AST_TYPE} from '../query/parser-constants.js';
import {QUERY_ERROR_CODE, QUERY_OPERATION} from '../query/query-constants.js';
import {SERVICE_LIFECYCLE_SQL_COMMAND} from
  '../query/service-lifecycle-sql-contract.js';
import {PG_ERROR_CODE} from './pgwire-protocol-constants.js';

const LOCAL_STR_INSERT = 'INSERT';
const LOCAL_STR_UPDATE = 'UPDATE';
const LOCAL_STR_DELETE = 'DELETE';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_COLUMN = 'column';

// A DML result that carries no affected-row count has no truthful
// PostgreSQL command tag (the protocol has no "unknown count" tag), so the
// mapper refuses it as an internal error instead of reporting zero rows.
// Likewise a result that names no statement kind the wire can tag: the tag
// is never guessed from the query text (a write may begin with a comment or
// a CTE), so an untaggable result is refused, never answered `OK`.
const PGWIRE_RESULT_MAPPER_ERROR = Object.freeze({
  MISSING_AFFECTED_ROW_COUNT: 'PGWIRE_MISSING_AFFECTED_ROW_COUNT',
  MISSING_AFFECTED_ROW_COUNT_MESSAGE:
    ' completed without an affected-row count in the engine result; ' +
    'no truthful command tag can be reported',
  UNKNOWN_STATEMENT_TYPE: 'PGWIRE_UNKNOWN_STATEMENT_TYPE',
  UNKNOWN_STATEMENT_TYPE_MESSAGE:
    'the engine result names no statement kind the PostgreSQL wire can ' +
    'tag; no truthful command tag can be reported (statement kind: ',
  UNKNOWN_STATEMENT_TYPE_MESSAGE_END: ')',
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

const fixedTag = (tag) => () => tag;

// Executed statement kind (the engine's parsed statement type, the service
// lifecycle command, or the EXPLAIN DISTRIBUTED operation) -> the
// CommandComplete tag. DML and SELECT carry their counts; every other kind
// is named by its own statement. Kinds the engine refuses to execute
// (DROP, CREATE INDEX) never reach the mapper.
const COMMAND_TAG_BY_STATEMENT_TYPE = new Map([
  [AST_TYPE.SELECT, (result) =>
    `SELECT ${Array.isArray(result?.rows) ? result.rows.length : 0}`],
  [AST_TYPE.INSERT, (result) =>
    `INSERT 0 ${requireAffectedRowCount(result, LOCAL_STR_INSERT)}`],
  [AST_TYPE.UPDATE, (result) =>
    `UPDATE ${requireAffectedRowCount(result, LOCAL_STR_UPDATE)}`],
  [AST_TYPE.DELETE, (result) =>
    `DELETE ${requireAffectedRowCount(result, LOCAL_STR_DELETE)}`],
  [AST_TYPE.CREATE_TABLE, fixedTag('CREATE TABLE')],
  [AST_TYPE.ALTER_TABLE, fixedTag('ALTER TABLE')],
  [AST_TYPE.BEGIN_TRANSACTION, fixedTag('BEGIN')],
  [AST_TYPE.COMMIT, fixedTag('COMMIT')],
  [AST_TYPE.ROLLBACK, fixedTag('ROLLBACK')],
  [QUERY_OPERATION.EXPLAIN_DISTRIBUTED, fixedTag('EXPLAIN')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.CALL_BINDING, fixedTag('CALL')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.CONFIGURE_ACCESS,
    fixedTag('CONFIGURE SERVICE ACCESS')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING, fixedTag('CREATE BINDING')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL, fixedTag('INSTALL SERVICE')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE, fixedTag('UPGRADE SERVICE')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE, fixedTag('REMOVE SERVICE')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL, fixedTag('SHOW')],
  [SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE, fixedTag('SHOW')],
]);

/**
 * Derive the CommandComplete tag from the statement kind the engine
 * executed (never from the query text).
 *
 * @param {Object} result - SqlCore result carrying its executed
 *   statement kind.
 * @return {string} PG command tag.
 * @throws {Error} code PGWIRE_UNKNOWN_STATEMENT_TYPE (sqlState XX000) when
 *   the result names no taggable statement kind; code
 *   PGWIRE_MISSING_AFFECTED_ROW_COUNT when a DML result carries no count.
 */
function deriveCommandTag(result) {
  const statementType = readExecutedStatementType(result);
  const tagFor = COMMAND_TAG_BY_STATEMENT_TYPE.get(statementType);
  if (tagFor) return tagFor(result);
  const error = new Error(
    PGWIRE_RESULT_MAPPER_ERROR.UNKNOWN_STATEMENT_TYPE_MESSAGE +
      String(statementType) +
      PGWIRE_RESULT_MAPPER_ERROR.UNKNOWN_STATEMENT_TYPE_MESSAGE_END,
  );
  error.code = PGWIRE_RESULT_MAPPER_ERROR.UNKNOWN_STATEMENT_TYPE;
  error.sqlState = PG_ERROR_CODE.INTERNAL_ERROR;
  throw error;
}

// Engine refusal codes that name a PostgreSQL condition of their own.
const SQLSTATE_BY_ENGINE_ERROR_CODE = new Map([
  [QUERY_ERROR_CODE.MULTIPLE_STATEMENTS_UNSUPPORTED,
    PG_ERROR_CODE.FEATURE_NOT_SUPPORTED],
]);

/**
 * The SQLSTATE an ErrorResponse carries for a failure: the failure's own
 * sqlState, else the PostgreSQL condition its engine error code names,
 * else XX000.
 *
 * @param {Object} failure - Thrown error or failed SqlCore result fields.
 * @return {string} SQLSTATE.
 */
function resolveFailureSqlState(failure) {
  if (typeof failure?.sqlState === LOCAL_STR_STRING) return failure.sqlState;
  return SQLSTATE_BY_ENGINE_ERROR_CODE.get(failure?.errorCode) ??
    PG_ERROR_CODE.INTERNAL_ERROR;
}

/**
 * Whether a failed SqlCore result is the engine's "the query text holds no
 * statement" answer (PostgreSQL answers it with EmptyQueryResponse).
 *
 * @param {Object} result - SqlCore result.
 * @return {boolean}
 */
function isEmptyStatementResult(result) {
  return result?.success === false &&
    result?.errorCode === QUERY_ERROR_CODE.EMPTY_STATEMENT;
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
  isEmptyStatementResult,
  resolveFailureSqlState,
};
