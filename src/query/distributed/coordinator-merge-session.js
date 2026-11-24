/**
 * CoordinatorMergeSession: per-statement in-memory SQLite merge owner
 * (design coordinator-sqlite-merge §2.1, §2.7, §2.8, §2.9).
 *
 * Owns one `:memory:` SQLite connection per distributed statement, verifies
 * engine identity parity against the vetted build and every contributing
 * partition answer, declares main tables with the shared column-only DDL
 * renderer, ingests typed rows at explicit canonical-layout rowids in bounded
 * chunks, and evaluates final merge SQL under normalized row, byte, page, and
 * wall-time budgets.
 *
 * @module query/distributed/coordinator-merge-session
 */

import Database from 'better-sqlite3';

import {NUM} from '../../constants/index.js';
import {
  TRANSACTION_CLASSIFIER_VETTED_ENGINE,
} from '../../partition/partition-transaction-determinism-constants.js';
import {
  executionEnvelopeOf,
} from '../../partition/partition-transaction-execution-envelope.js';
import {
  DEFAULT_QUERY_BUDGET,
  isNormalizedQueryBudget,
  normalizeQueryBudget,
} from '../../wasm-service/query-budget-constants.js';
import {assertCoordinatorStatementAdmitted} from '../coordinator-sql-admission.js';
import {QUERY_ERROR_CODE} from '../query-constants.js';
import {renderTableColumnsSql} from '../sql-table-definition.js';
import {
  assembleTypedRowSet,
  decodeTypedParams,
  decodeTypedRowSet,
  encodeAndMeasureTypedRow,
  encodeTypedParams,
} from '../sql-value-codec.js';
import {
  defineLazyRowObjectsGetter,
  materializeAndPresentRowObjects,
} from '../sql-value-presentation.js';
import {renderSqliteIdentifier} from '../sqlite-identifier.js';

const MEMORY_DATABASE = ':memory:';
const PRAGMA_PAGE_SIZE = 'page_size';
const PRAGMA_PAGE_POOL_KIB = 'cache_size = -16000';
const PRAGMA_MAX_PAGE_COUNT_PREFIX = 'max_page_count = ';
const PRAGMA_TEMP_MAX_PAGE_COUNT_PREFIX = 'temp.max_page_count = ';
const INGEST_CHUNK_MAX_ROWS = NUM.THOUSAND;
const MIN_PAGE_COUNT = 1;
const SQLITE_FULL_CODE = 'SQLITE_FULL';
const SQLITE_ERROR_CODE = 'SQLITE_ERROR';
const INTEGER_OVERFLOW_PATTERN = /integer overflow/iu;
const DISK_FULL_PATTERN = /database or disk is full/iu;
const ROWID_COLUMN = 'rowid';
const PLACEHOLDER = '?';
const COMMA_SPACE = ', ';
const EMPTY_PLACEHOLDER_COLUMN_NAME = '__empty_col';
const COLUMN_KEY_DELIMITER = '\u0000';

const GUARD_OUTCOME = Object.freeze({
  GUARD_HELD: 'GUARD_HELD',
  GUARD_FAILED: 'GUARD_FAILED',
});

const MERGE_ERROR_MSG = Object.freeze({
  ENGINE_MISMATCH:
    'SQLite engine identity mismatch between coordinator and partition or vetted build',
  MEMORY_EXHAUSTED:
    'Coordinator merge memory budget exhausted',
  INPUT_ROWS_EXCEEDED:
    'Coordinator merge input row count exceeds MERGE_INPUT_MAX_ROWS budget',
  PARTIAL_OVERFLOW:
    'Coordinator partial aggregate overflowed signed 64-bit integer range',
  RESULT_ROWS_EXCEEDED:
    'Query result row count exceeds RESULT_MAX_ROWS budget',
  RESULT_BYTES_EXCEEDED:
    'Query result byte size exceeds RESULT_MAX_BYTES budget',
  DEADLINE_EXCEEDED:
    'Query execution deadline exceeded during coordinator merge',
  CANCELLED:
    'Query execution cancelled during coordinator merge',
});

function createMergeError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details !== null) {
    error.details = Object.freeze({...details});
  }
  return error;
}

function isEnvelopeRecord(envelope) {
  return Boolean(envelope) && typeof envelope === 'object';
}

function verifyVettedEngineBuild(envelope) {
  const hasDigest = isEnvelopeRecord(envelope) &&
    typeof envelope.compileOptionsDigest === 'string' &&
    envelope.compileOptionsDigest.length > 0;
  const matchesVetted = hasDigest &&
    envelope.sqliteVersion === TRANSACTION_CLASSIFIER_VETTED_ENGINE.SQLITE_VERSION &&
    envelope.sqliteSourceId === TRANSACTION_CLASSIFIER_VETTED_ENGINE.SQLITE_SOURCE_ID;
  if (!matchesVetted) {
    throw createMergeError(
      QUERY_ERROR_CODE.QUERY_ENGINE_MISMATCH,
      MERGE_ERROR_MSG.ENGINE_MISMATCH,
    );
  }
}

function snapshotEnvelopeIdentity(envelope) {
  if (!isEnvelopeRecord(envelope)) return null;
  return {
    sqliteVersion: envelope.sqliteVersion ?? null,
    sqliteSourceId: envelope.sqliteSourceId ?? null,
    compileOptionsDigest: envelope.compileOptionsDigest ?? null,
  };
}

function envelopesMatchIdentity(expectedEnvelope, actualEnvelope) {
  if (!isEnvelopeRecord(expectedEnvelope) || !isEnvelopeRecord(actualEnvelope)) {
    return false;
  }
  return (
    expectedEnvelope.sqliteVersion === actualEnvelope.sqliteVersion &&
    expectedEnvelope.sqliteSourceId === actualEnvelope.sqliteSourceId &&
    expectedEnvelope.compileOptionsDigest === actualEnvelope.compileOptionsDigest
  );
}

/**
 * Verify that two SQLite execution envelopes share identical engine identity
 * (`sqliteVersion`, `sqliteSourceId`, `compileOptionsDigest`;
 * `classifierListVersion` is excluded per §2.9).
 * @param {Object} expectedEnvelope - Reference envelope.
 * @param {Object} actualEnvelope - Candidate envelope.
 * @throws {Error} QUERY_ENGINE_MISMATCH on any difference or missing field.
 */
function verifyEngineIdentityParity(expectedEnvelope, actualEnvelope) {
  if (!envelopesMatchIdentity(expectedEnvelope, actualEnvelope)) {
    throw createMergeError(
      QUERY_ERROR_CODE.QUERY_ENGINE_MISMATCH,
      MERGE_ERROR_MSG.ENGINE_MISMATCH,
      {
        expected: snapshotEnvelopeIdentity(expectedEnvelope),
        actual: snapshotEnvelopeIdentity(actualEnvelope),
      },
    );
  }
}

/**
 * Materialize an array of raw row arrays into row objects keyed by `columns`.
 * @param {string[]} columns - Result column names in order.
 * @param {Array<Array<*>>} rawRows - Raw value arrays.
 * @return {Array<Object>}
 */
function materializeRowObjects(columns, rawRows) {
  return materializeAndPresentRowObjects(columns, rawRows, {
    safeIntegers: true,
    alreadyPresented: true,
  });
}

function buildLazyMergedRowResult(columns, rawRows, rowSet, byteLength) {
  return defineLazyRowObjectsGetter(
    {
      columns,
      rawRows,
      rowSet,
      byteLength,
    },
    {
      columns,
      rawRows,
      safeIntegers: true,
    },
  );
}

function mapSqliteMergeError(error, {partialAggregate = false} = {}) {
  if (
    error?.code === SQLITE_FULL_CODE ||
    DISK_FULL_PATTERN.test(String(error?.message))
  ) {
    return createMergeError(
      QUERY_ERROR_CODE.QUERY_MERGE_MEMORY_EXHAUSTED,
      MERGE_ERROR_MSG.MEMORY_EXHAUSTED,
    );
  }
  if (
    partialAggregate &&
    error?.code === SQLITE_ERROR_CODE &&
    INTEGER_OVERFLOW_PATTERN.test(String(error?.message))
  ) {
    return createMergeError(
      QUERY_ERROR_CODE.QUERY_MERGE_PARTIAL_OVERFLOW,
      MERGE_ERROR_MSG.PARTIAL_OVERFLOW,
    );
  }
  return error;
}

function normalizePositiveLimit(candidate, defaultLimit) {
  return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : defaultLimit;
}

function normalizeIngestCell(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  return value;
}

function resolveDeclaredOrFragmentColumns(fragment, declaredColumns) {
  if (Array.isArray(fragment?.columns)) return fragment.columns;
  if (Array.isArray(declaredColumns) && declaredColumns.length > 0) {
    return declaredColumns;
  }
  return [];
}

function resolveObjectFragmentColumns(fragment, declaredColumns, objectRows) {
  const explicit = resolveDeclaredOrFragmentColumns(fragment, declaredColumns);
  if (explicit.length > 0) return explicit;
  return objectRows.length > 0 ? Object.keys(objectRows[0]) : [];
}

function extractFragmentColumnsAndRows(fragment, declaredColumns = null) {
  if (fragment?.rowSet) {
    const decoded = decodeTypedRowSet(fragment.rowSet);
    return {columns: decoded.columns, rawRows: decoded.rows};
  }
  if (Array.isArray(fragment?.rawRows)) {
    return {
      columns: resolveDeclaredOrFragmentColumns(fragment, declaredColumns),
      rawRows: fragment.rawRows,
    };
  }
  const objectRows = Array.isArray(fragment?.rows) ? fragment.rows : [];
  if (objectRows.length > 0 && Array.isArray(objectRows[0])) {
    return {
      columns: resolveDeclaredOrFragmentColumns(fragment, declaredColumns),
      rawRows: objectRows,
    };
  }
  const columns = resolveObjectFragmentColumns(fragment, declaredColumns, objectRows);
  const rawRows = objectRows.map((row) =>
    columns.map((col) => (row && col in row ? normalizeIngestCell(row[col]) : null)),
  );
  return {columns, rawRows};
}

function buildInsertWithRowidSql(tableName, columns) {
  const quotedTable = renderSqliteIdentifier(tableName);
  const allColumns = [ROWID_COLUMN, ...columns.map((col) => renderSqliteIdentifier(col))];
  const placeholders = allColumns.map(() => PLACEHOLDER).join(COMMA_SPACE);
  return `INSERT INTO ${quotedTable} (${allColumns.join(COMMA_SPACE)}) VALUES (${placeholders})`;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function resolveSessionBudgetObject(budgetOption) {
  if (isNormalizedQueryBudget(budgetOption)) {
    return budgetOption;
  }
  return normalizeQueryBudget(budgetOption || DEFAULT_QUERY_BUDGET);
}

function resolveSessionDeadlineMs(deadlineMs, timeoutMs) {
  if (Number.isSafeInteger(deadlineMs) && deadlineMs > 0) {
    return deadlineMs;
  }
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
    return Date.now() + timeoutMs;
  }
  return null;
}

class CoordinatorMergeSession {
  /**
   * @param {Object} [options]
   * @param {Object} [options.budget] - Normalized query budget or overrides.
   * @param {number} [options.memoryLimitBytes]
   * @param {number} [options.mergeInputMaxRows]
   * @param {number} [options.resultMaxRows]
   * @param {number} [options.resultMaxBytes]
   * @param {number|null} [options.deadlineMs]
   * @param {number|null} [options.timeoutMs]
   * @param {Object|null} [options.cancellationToken]
   * @param {AbortSignal|null} [options.signal]
   * @param {Function|null} [options.isCancelled]
   * @param {Object|null} [options.expectedEngineEnvelope]
   */
  constructor(options = {}) {
    const budget = resolveSessionBudgetObject(options.budget);
    this.budget = budget;
    this.memoryLimitBytes = normalizePositiveLimit(
      options.memoryLimitBytes,
      budget.MEMORY_LIMIT_BYTES,
    );
    this.mergeInputMaxRows = normalizePositiveLimit(
      options.mergeInputMaxRows,
      budget.MERGE_INPUT_MAX_ROWS,
    );
    this.resultMaxRows = normalizePositiveLimit(
      options.resultMaxRows,
      budget.RESULT_MAX_ROWS,
    );
    this.resultMaxBytes = normalizePositiveLimit(
      options.resultMaxBytes,
      budget.RESULT_MAX_BYTES,
    );
    this.deadlineMs = resolveSessionDeadlineMs(options.deadlineMs, options.timeoutMs);
    this.cancellationToken = options.cancellationToken ?? null;
    this.signal = options.signal ?? null;
    this.isCancelled = options.isCancelled ?? null;
    this.ingestedRows = 0;
    this.ingestedBytes = 0;
    this.nextCanonicalRowId = 1n;
    this.closed = false;
    this.db = new Database(MEMORY_DATABASE);
    try {
      this.executionEnvelope = executionEnvelopeOf(this.db);
      verifyVettedEngineBuild(this.executionEnvelope);
      if (options.expectedEngineEnvelope) {
        verifyEngineIdentityParity(
          options.expectedEngineEnvelope,
          this.executionEnvelope,
        );
      }
      this.configureDatabasePragmas();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  configureDatabasePragmas() {
    this.db.defaultSafeIntegers(true);
    const pageSize = Number(this.db.pragma(PRAGMA_PAGE_SIZE, {simple: true}));
    const maxPages = Math.max(
      MIN_PAGE_COUNT,
      Math.floor(this.memoryLimitBytes / pageSize),
    );
    this.db.pragma(`${PRAGMA_MAX_PAGE_COUNT_PREFIX}${maxPages}`);
    this.db.pragma(`${PRAGMA_TEMP_MAX_PAGE_COUNT_PREFIX}${maxPages}`);
    this.db.pragma(PRAGMA_PAGE_POOL_KIB);
  }

  isSessionCancelled() {
    if (this.signal?.aborted === true) return true;
    if (this.cancellationToken?.isCancelled?.() === true) return true;
    return Boolean(this.isCancelled && this.isCancelled() === true);
  }

  assertActiveAndWithinDeadline() {
    this.cancellationToken?.throwIfCancelled?.();
    if (this.isSessionCancelled()) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
        MERGE_ERROR_MSG.CANCELLED,
      );
    }
    if (this.deadlineMs !== null && Date.now() >= this.deadlineMs) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
        MERGE_ERROR_MSG.DEADLINE_EXCEEDED,
        {actual: Date.now(), limit: this.deadlineMs},
      );
    }
  }

  /**
   * Verify a partition response's engine envelope against the session's own.
   * @param {Object|null|undefined} partitionEnvelope
   */
  verifyPartitionEnvelope(partitionEnvelope) {
    if (partitionEnvelope !== undefined && partitionEnvelope !== null) {
      verifyEngineIdentityParity(this.executionEnvelope, partitionEnvelope);
    }
  }

  /**
   * Declare a main table using the shared column-only DDL renderer.
   * @param {string} tableName - Coordinator table name.
   * @param {Object|null} [schema] - Catalog table schema.
   * @param {Array<string|Object>|null} [declaredColumns] - Column list when no
   *   catalog schema is used (e.g., synthetic `__partial` table).
   */
  createTable(tableName, schema = null, declaredColumns = null) {
    this.assertActiveAndWithinDeadline();
    const hasSchemaColumns = Array.isArray(schema?.columns) && schema.columns.length > 0;
    const normalizedDeclaredColumns = Array.isArray(declaredColumns) && declaredColumns.length > 0 ?
      declaredColumns.map((col) => (typeof col === 'string' ? {name: col} : col)) :
      [{name: EMPTY_PLACEHOLDER_COLUMN_NAME}];
    let columns = normalizedDeclaredColumns;
    if (hasSchemaColumns) {
      const seen = new Set(schema.columns.map((c) => String(c.name).toLowerCase()));
      const extras = normalizedDeclaredColumns.filter(
        (c) =>
          Boolean(c?.name) &&
          c.name !== EMPTY_PLACEHOLDER_COLUMN_NAME &&
          !seen.has(String(c.name).toLowerCase()),
      );
      columns = extras.length > 0 ? [...schema.columns, ...extras] : schema.columns;
    }
    const ddl = renderTableColumnsSql(tableName, {columns});
    try {
      this.db.exec(ddl);
    } catch (error) {
      throw mapSqliteMergeError(error);
    }
  }

  /**
   * Read the result column names SQLite assigns to an admitted SELECT statement
   * prepared against the session's declared tables.
   * @param {string} sql - Admitted SELECT statement.
   * @return {string[]}
   */
  resolveExpectedColumnNames(sql) {
    const stmt = this.db.prepare(sql);
    return stmt.columns().map((column) => column.name);
  }

  /**
   * Ingest an ordered list of partition fragments into `tableName` at explicit
   * canonical-layout rowids in chunks of at most 1,000 rows.
   * @param {string} tableName - Destination main table.
   * @param {Array<Object>} fragments - Fragments in partition key-range ordinal
   *   order.
   * @param {Object} [options]
   * @param {string[]} [options.columns] - Declared column names.
   */
  async ingestTableFragments(tableName, fragments = [], options = {}) {
    let insertStmt = null;
    let insertColumnsKey = null;
    for (let partIndex = 0; partIndex < fragments.length; partIndex += 1) {
      const fragment = fragments[partIndex];
      if (!fragment) continue;
      this.verifyPartitionEnvelope(fragment.executionEnvelope);
      const {columns, rawRows} = extractFragmentColumnsAndRows(
        fragment,
        options.columns || null,
      );
      this.recordFragmentInputBudget(rawRows.length, fragment.byteLength);
      if (rawRows.length === 0) continue;
      const columnsKey = columns.join(COLUMN_KEY_DELIMITER);
      if (insertStmt === null || insertColumnsKey !== columnsKey) {
        insertStmt = this.db.prepare(buildInsertWithRowidSql(tableName, columns));
        insertColumnsKey = columnsKey;
      }
      await this.ingestRowsInChunks(insertStmt, rawRows);
    }
  }

  recordFragmentInputBudget(rowCount, byteLength) {
    const nextRows = this.ingestedRows + rowCount;
    if (nextRows > this.mergeInputMaxRows) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_MERGE_INPUT_ROWS_EXCEEDED,
        MERGE_ERROR_MSG.INPUT_ROWS_EXCEEDED,
        {actual: nextRows, limit: this.mergeInputMaxRows},
      );
    }
    const addedBytes = Number.isSafeInteger(byteLength) && byteLength > 0 ? byteLength : 0;
    const nextBytes = this.ingestedBytes + addedBytes;
    if (nextBytes > this.memoryLimitBytes) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_MERGE_MEMORY_EXHAUSTED,
        MERGE_ERROR_MSG.MEMORY_EXHAUSTED,
        {actual: nextBytes, limit: this.memoryLimitBytes},
      );
    }
    this.ingestedRows = nextRows;
    this.ingestedBytes = nextBytes;
  }

  async ingestRowsInChunks(insertStmt, rawRows) {
    const runChunk = this.db.transaction((rows, startIndex, endIndex) => {
      for (let index = startIndex; index < endIndex; index += 1) {
        const rowId = this.nextCanonicalRowId;
        this.nextCanonicalRowId += 1n;
        insertStmt.run(rowId, ...rows[index]);
      }
    });
    for (let offset = 0; offset < rawRows.length; offset += INGEST_CHUNK_MAX_ROWS) {
      this.assertActiveAndWithinDeadline();
      const end = Math.min(offset + INGEST_CHUNK_MAX_ROWS, rawRows.length);
      try {
        runChunk(rawRows, offset, end);
      } catch (error) {
        throw mapSqliteMergeError(error);
      }
      if (end < rawRows.length) {
        await yieldToEventLoop();
      }
    }
  }

  /**
   * Evaluate the GUARDED_PARTIAL coordinator guard query in SQLite and return
   * the named plan outcome (`GUARD_HELD` or `GUARD_FAILED`).
   * @param {string} guardSql - Coordinator guard SQL returning 1 when held.
   * @param {Array<*>} [params] - Bound parameters for the guard query.
   * @return {string} GUARD_OUTCOME.GUARD_HELD or GUARD_OUTCOME.GUARD_FAILED.
   */
  evaluateGuardSql(guardSql, params = []) {
    this.assertActiveAndWithinDeadline();
    assertCoordinatorStatementAdmitted(guardSql, this.db);
    const typedParams = decodeTypedParams(encodeTypedParams(params));
    let value;
    try {
      value = this.db.prepare(guardSql).pluck(true).safeIntegers(true).get(...typedParams);
    } catch (error) {
      throw mapSqliteMergeError(error, {partialAggregate: true});
    }
    if (value === 2n || value === 2) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_MERGE_PARTIAL_OVERFLOW,
        MERGE_ERROR_MSG.PARTIAL_OVERFLOW,
      );
    }
    return value === 1n || value === 1 ?
      GUARD_OUTCOME.GUARD_HELD :
      GUARD_OUTCOME.GUARD_FAILED;
  }

  /**
   * Execute the final merge SELECT in SQLite and return both typed raw rows,
   * encoded TypedRowSet, and row objects keyed by result column names.
   * @param {string} sql - Coordinator merge SELECT statement.
   * @param {Array<*>} [params] - Bound parameters.
   * @param {Object} [options]
   * @param {string[]} [options.expectedColumns] - Column names from the
   *   admitted statement text when overrides apply.
   * @param {boolean} [options.partialAggregate=false] - Whether this is a
   *   partial-aggregate combine query.
   * @return {{
   *   columns: string[],
   *   rawRows: Array<Array<*>>,
   *   rows: Array<Object>,
   *   rowSet: Object,
   *   byteLength: number
   * }}
   */
  prepareMergeStatement(sql, params, options) {
    this.assertActiveAndWithinDeadline();
    assertCoordinatorStatementAdmitted(sql, this.db);
    const typedParams = decodeTypedParams(encodeTypedParams(params));
    const stmt = this.db.prepare(sql).raw(true).safeIntegers(true);
    const sqliteColumns = stmt.columns().map((column) => column.name);
    const columns = Array.isArray(options.expectedColumns) &&
      options.expectedColumns.length === sqliteColumns.length ?
      options.expectedColumns :
      sqliteColumns;
    return {stmt, typedParams, columns};
  }

  executeMergeSql(sql, params = [], options = {}) {
    const partialAggregate = options.partialAggregate === true;
    try {
      const {stmt, typedParams, columns} = this.prepareMergeStatement(
        sql,
        params,
        options,
      );
      return this.collectMergeRows(stmt, typedParams, columns);
    } catch (error) {
      throw mapSqliteMergeError(error, {partialAggregate});
    }
  }

  async executeMergeSqlWithObservation(sql, params = [], options = {}) {
    const partialAggregate = options.partialAggregate === true;
    try {
      const {stmt, typedParams, columns} = this.prepareMergeStatement(
        sql,
        params,
        options,
      );
      const iterator = stmt.iterate(...typedParams);
      try {
        const firstStep = iterator.next();
        await options.onSqliteExecutionEntered?.({
          sqliteBusy: Boolean(stmt.busy),
          firstRowStepped: !firstStep.done,
        });
        const rawRows = [];
        const encodedRows = [];
        let totalBytes = 0;
        if (!firstStep.done) {
          totalBytes = this.appendCollectedMergeRow(
            firstStep.value,
            columns,
            rawRows,
            encodedRows,
            totalBytes,
          );
          for (
            let step = iterator.next();
            !step.done;
            step = iterator.next()
          ) {
            totalBytes = this.appendCollectedMergeRow(
              step.value,
              columns,
              rawRows,
              encodedRows,
              totalBytes,
            );
          }
        }
        this.assertActiveAndWithinDeadline();
        return buildLazyMergedRowResult(
          columns,
          rawRows,
          assembleTypedRowSet(columns, encodedRows),
          totalBytes,
        );
      } finally {
        iterator.return?.();
      }
    } catch (error) {
      throw mapSqliteMergeError(error, {partialAggregate});
    }
  }

  appendCollectedMergeRow(rawRow, columns, rawRows, encodedRows, totalBytes) {
    this.assertActiveAndWithinDeadline();
    const nextRowCount = rawRows.length + 1;
    if (nextRowCount > this.resultMaxRows) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_RESULT_ROWS_EXCEEDED,
        MERGE_ERROR_MSG.RESULT_ROWS_EXCEEDED,
        {actual: nextRowCount, limit: this.resultMaxRows},
      );
    }
    const {encoded, byteLength} = encodeAndMeasureTypedRow(
      rawRow,
      columns.length,
      rawRows.length,
    );
    const nextBytes = totalBytes + byteLength;
    if (nextBytes > this.resultMaxBytes) {
      throw createMergeError(
        QUERY_ERROR_CODE.QUERY_RESULT_SIZE_EXCEEDED,
        MERGE_ERROR_MSG.RESULT_BYTES_EXCEEDED,
        {actual: nextBytes, limit: this.resultMaxBytes},
      );
    }
    rawRows.push(rawRow);
    encodedRows.push(encoded);
    return nextBytes;
  }

  collectMergeRows(stmt, params, columns) {
    const rawRows = [];
    const encodedRows = [];
    let totalBytes = 0;
    for (const rawRow of stmt.iterate(...params)) {
      totalBytes = this.appendCollectedMergeRow(
        rawRow,
        columns,
        rawRows,
        encodedRows,
        totalBytes,
      );
    }
    this.assertActiveAndWithinDeadline();
    return buildLazyMergedRowResult(
      columns,
      rawRows,
      assembleTypedRowSet(columns, encodedRows),
      totalBytes,
    );
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.db.open) {
      this.db.close();
    }
  }
}

export {
  CoordinatorMergeSession,
  GUARD_OUTCOME,
  buildLazyMergedRowResult,
  createMergeError,
  materializeRowObjects,
};
