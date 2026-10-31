/**
 * Locking read (SELECT ... FOR UPDATE) and write reservation execution helpers.
 *
 * Implements Stage B3–B5 execution semantics:
 * - Matching row key derivation via resolveDeclaredPrimaryKeyColumns
 * - Fail-fast participant reservation acquisition
 * - Immediate conflict refusal (55P03) with whole-transaction rollback
 * - Re-entrant reservation for the same transaction
 * - Cross-operation mutual exclusion between SELECT ... FOR UPDATE and writes
 * - Projection-independent canonical row identity extraction
 * - Fail-closed candidate reads
 * - Durable participant SQLite mirroring
 *
 * @module query/sql-locking-read-execution
 */

import {resolveDeclaredPrimaryKeyColumns} from
  '../partition/partition-boundary-representation.js';
import {
  acquireRowReservation,
  checkRowReservationConflict,
  createLockConflictResult,
  getTransactionReservations,
  LOCKING_READ_RESERVATION_KIND,
} from '../partition/partition-locking-read-reservation.js';
import {
  LOCKING_READ_AST_TYPE,
  LOCKING_READ_CLAUSE,
  LOCKING_READ_STRENGTH,
  LOCKING_READ_TX_OWNERSHIP,
  LOCKING_READ_UNKNOWN_PARTITION,
} from './sql-locking-read-constants.js';
import {
  QUERY_AST_NODE,
  QUERY_ERROR_CODE,
  QUERY_OPERATOR,
} from './query-constants.js';
import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';

const LOCAL_LOG_QUERY_MATCHING_PK_ROWS_FAILED =
  'locking read query matching pk rows failed';

const LOGICAL_OPERATOR = Object.freeze({
  AND_UPPER: 'AND',
  AND_LOWER: 'and',
  EQUALS: '=',
});

/**
 * Determine whether a parsed AST is a locking read (SELECT ... FOR UPDATE).
 * @param {Object|null} ast - Parsed AST.
 * @return {boolean}
 */
export function isLockingReadAst(ast) {
  if (!ast || ast.type !== LOCKING_READ_AST_TYPE.SELECT) return false;
  return Boolean(
    ast.locking?.strength === LOCKING_READ_STRENGTH.UPDATE ||
    ast.locking_read === LOCKING_READ_CLAUSE.FOR_UPDATE ||
    ast.forUpdate === true ||
    ast.locking,
  );
}

/**
 * Resolve partition SQLite database instance if available.
 * @param {Object} engine - SQL query engine.
 * @param {string} partitionId - Partition ID.
 * @return {Object|null}
 */
function resolvePartitionDb(engine, partitionId) {
  if (!engine || !partitionId) return null;
  try {
    const services = typeof engine.partitionServicesProvider === 'function' ?
      engine.partitionServicesProvider() :
      (engine.queryExecutor?.partitionServices || engine.partitionServices);
    const service = services?.get ? services.get(partitionId) : null;
    return service?.db || null;
  } catch (_err) {
    return null;
  }
}

/**
 * Extract primary key tuple from a row object.
 * @param {Object} row - Result row.
 * @param {string[]} pkColumns - Declared primary key column names.
 * @return {Array<*>|null} Primary key values tuple or null.
 */
function extractRowPkValues(row, pkColumns) {
  if (!row || typeof row !== 'object') return null;
  const values = pkColumns.map((col) => {
    if (Object.hasOwn(row, col) && row[col] !== undefined) return row[col];
    const lower = col.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower && row[key] !== undefined) return row[key];
    }
    return undefined;
  });
  return values.some((v) => v === undefined || v === null) ? null : values;
}

/**
 * Resolve partition ID string from candidate entry.
 * @param {*} candidate - Candidate partition descriptor or ID.
 * @return {string} Partition ID string.
 */
function partitionIdOfCandidate(candidate) {
  if (typeof candidate === 'object' && candidate !== null) {
    return candidate.partition_id || candidate.id || LOCKING_READ_UNKNOWN_PARTITION;
  }
  return candidate || LOCKING_READ_UNKNOWN_PARTITION;
}

/**
 * Resolve target partition ID for a primary key tuple.
 * @param {Object} engine - SQL query engine.
 * @param {string} tableName - Target table.
 * @param {Array<*>} pkValues - Primary key tuple.
 * @param {string[]} candidatePartitions - Candidate partition IDs.
 * @return {string}
 */
function resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions) {
  if (Array.isArray(candidatePartitions) && candidatePartitions.length === 1) {
    return partitionIdOfCandidate(candidatePartitions[0]);
  }
  const tablePartitions = engine.getTablePartitions?.(tableName);
  const keyValue = pkValues.length === 1 ? pkValues[0] : pkValues;
  const resolver = engine.partitionResolver;
  if (Array.isArray(tablePartitions) &&
      typeof resolver?.resolvePartitionForKey === 'function') {
    const resolved = resolver.resolvePartitionForKey(tableName, keyValue, tablePartitions);
    if (resolved) return resolved;
  }
  return partitionIdOfCandidate(candidatePartitions?.[0]);
}

function extractMergedPkTuple(row, pkColumns, whereEqualities) {
  const rowObj = row && typeof row === 'object' ? row : {};
  const values = pkColumns.map((col) => {
    const fromRow = extractRowPkValues(rowObj, [col]);
    if (fromRow !== null) return fromRow[0];
    return whereEqualities.get(col.toLowerCase());
  });
  return values.some((v) => v === undefined || v === null) ? null : values;
}

/**
 * Resolve canonical primary key tuples for selected rows.
 * @param {Object} engine - SQL query engine.
 * @param {Object} ctx - Resolution context.
 * @return {Promise<Array<Array<*>>>} List of primary key tuples.
 */
async function resolveCanonicalPkTuples(engine, ctx) {
  const {
    ast, tableName, pkColumns, candidatePartitions,
    rows, params, sessionId, queryOptions,
  } = ctx;
  const allInProjection = rows.every((row) => extractRowPkValues(row, pkColumns) !== null);
  if (allInProjection) return rows.map((row) => extractRowPkValues(row, pkColumns));

  const wherePk = extractPkFromWhereClause(ast.where, pkColumns, params);
  if (wherePk && rows.length === 1) return [wherePk];

  const whereEqualities = collectAndEqualities(ast.where, params);
  if (whereEqualities.size > 0 && rows.length > 0) {
    const mergedTuples = rows.map((row) => extractMergedPkTuple(row, pkColumns, whereEqualities));
    if (mergedTuples.every((tuple) => tuple !== null)) {
      return mergedTuples;
    }
  }

  const statement = {ast, whereClause: ast.where, params, sessionId, queryOptions};
  const pkRows = await queryMatchingPkRows(
    engine,
    {tableName, pkColumns, candidatePartitions},
    statement,
  );
  return pkRows.map((r) => extractRowPkValues(r, pkColumns)).filter(Boolean);
}

/**
 * Validate target table and rows for locking read reservation.
 * @param {Object} engine - Query engine.
 * @param {Object} ast - Parsed AST.
 * @param {Object} selectResult - SELECT result.
 * @return {Object} Target descriptor.
 */
function validateLockingReadTarget(engine, ast, selectResult) {
  if (!selectResult || selectResult.success !== true) {
    return {proceed: false, result: selectResult};
  }
  const tableName = ast.from?.name;
  const tableInfo = engine.getTableInfo(tableName);
  const pkColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
  if (pkColumns.length === 0) {
    return {
      proceed: false,
      result: {
        success: false,
        error: `Table '${tableName}' must have a PRIMARY KEY defined for FOR UPDATE`,
        errorCode: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
        sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
      },
    };
  }
  const rows = selectResult.rows || [];
  return rows.length === 0 ? {proceed: false, result: selectResult} :
    {proceed: true, tableName, tableInfo, pkColumns, rows};
}

/**
 * Rollback session on coordinator if conflict occurs.
 * @param {Object} engine - Query engine.
 * @param {string} sessionId - Session ID.
 * @param {string} transactionId - Transaction ID.
 */
async function rollbackConflictingSession(engine, sessionId, transactionId) {
  const coordinator = engine?.transactionCoordinator;
  if (typeof coordinator?.rollbackOwned === 'function') {
    await coordinator.rollbackOwned(sessionId, transactionId);
  } else if (typeof coordinator?.rollback === 'function') {
    await coordinator.rollback(sessionId);
  }
}

/**
 * Acquire reservations for all canonical tuples.
 * @param {Object} ctx - Context options.
 * @return {Promise<Object|null>} Conflict result or null.
 */
async function acquireAllRowReservations(ctx) {
  const {
    engine, tableName, canonicalTuples, candidatePartitions,
    transactionId, sessionId, holdTimeoutMs,
  } = ctx;
  for (const pkValues of canonicalTuples) {
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    const acq = acquireRowReservation({
      tableName,
      partitionId,
      pkValues,
      transactionId,
      sessionId,
      participantId: `${transactionId}:${partitionId}`,
      kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
      db: resolvePartitionDb(engine, partitionId),
      holdTimeoutMs,
    });
    if (acq.conflict) {
      await rollbackConflictingSession(engine, sessionId, transactionId);
      return createLockConflictResult({
        rowKey: acq.rowKey,
        transactionId,
        conflictingTransactionId: acq.conflictingTransactionId,
      });
    }
  }
  return null;
}

/**
 * Safely resolve canonical primary key tuples.
 * @param {Object} engine - Query engine.
 * @param {Object} ctx - Resolution context.
 * @return {Promise<{failure?: Object, tuples?: Array<Array<*>>}>}
 */
async function tryResolveCanonicalPkTuples(engine, ctx) {
  try {
    const tuples = await resolveCanonicalPkTuples(engine, ctx);
    return {tuples};
  } catch (err) {
    return {
      failure: {
        success: false,
        error: `Failed to resolve canonical row identity for locking read: ${err.message}`,
        errorCode: err.errorCode || QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
        sqlState: err.sqlState || PG_ERROR_CODE.INTERNAL_ERROR,
      },
    };
  }
}

/**
 * Execute locking read reservation for a completed SELECT ... FOR UPDATE query.
 * @param {Object} options - Execution context options.
 * @return {Promise<Object>} Admitted result or 55P03 conflict refusal.
 */
export async function executeLockingReadReservations(options) {
  const {engine, ast, sessionId, transactionRead, selectResult} = options;
  const target = validateLockingReadTarget(engine, ast, selectResult);
  if (!target.proceed) return target.result;

  const candidatePartitions = options.candidatePartitions || selectResult.partitions ||
    (target.tableInfo ?
      engine.getTablePartitions(target.tableName).map((p) => p.partition_id) :
      []);
  const params = options.params || selectResult._boundParams || selectResult.params || [];

  const resolution = await tryResolveCanonicalPkTuples(engine, {
    ast,
    tableName: target.tableName,
    pkColumns: target.pkColumns,
    candidatePartitions,
    rows: target.rows,
    params,
    sessionId,
    queryOptions: options.queryOptions || {},
  });
  if (resolution.failure) return resolution.failure;

  const conflict = await acquireAllRowReservations({
    engine,
    tableName: target.tableName,
    canonicalTuples: resolution.tuples,
    candidatePartitions,
    transactionId: transactionRead.identity.transactionId,
    sessionId,
    holdTimeoutMs: options.holdTimeoutMs,
  });
  return conflict || selectResult;
}

/**
 * Extract literal or parameter value from AST node.
 * @param {Object} node - AST node.
 * @param {Array<*>} params - Bound parameter values.
 * @return {*}
 */
function extractLiteralOrParamValue(node, params) {
  if (!node) return null;
  if (node.type === QUERY_AST_NODE.PARAMETER) {
    const idx = typeof node.index === 'number' ? node.index : 0;
    return params?.[idx] ?? null;
  }
  return node.value !== undefined ? node.value : node;
}

/**
 * Get column identifier string from AST node.
 * @param {Object} node - AST node.
 * @return {string|null}
 */
function getColumnIdentifier(node) {
  return node ? (node.column || node.name || null) : null;
}

/**
 * Match binary equality on a target column name.
 * @param {Object} where - Binary comparison AST node.
 * @param {string} targetCol - Target column in lower-case.
 * @param {Array<*>} params - Bound parameter values.
 * @return {Array<*>|null}
 */
function matchBinaryEqualityPk(where, targetCol, params) {
  const leftCol = getColumnIdentifier(where.left);
  if (typeof leftCol === 'string' && leftCol.toLowerCase() === targetCol) {
    return [extractLiteralOrParamValue(where.right, params)];
  }
  const rightCol = getColumnIdentifier(where.right);
  if (typeof rightCol === 'string' && rightCol.toLowerCase() === targetCol) {
    return [extractLiteralOrParamValue(where.left, params)];
  }
  return null;
}

/**
 * Collect equality conditions from an AND expression tree.
 * @param {Object} node - AST expression node.
 * @param {Array<*>} params - Bound parameter values.
 * @param {Map<string, *>} result - Collected column-to-value map.
 * @return {Map<string, *>}
 */
function collectAndEqualities(node, params, result = new Map()) {
  if (!node) return result;
  const op = node.operator;
  if (node.type === QUERY_AST_NODE.BINARY &&
      (op === LOGICAL_OPERATOR.AND_UPPER || op === LOGICAL_OPERATOR.AND_LOWER)) {
    collectAndEqualities(node.left, params, result);
    collectAndEqualities(node.right, params, result);
    return result;
  }
  if (node.type === QUERY_AST_NODE.BINARY &&
      (op === QUERY_OPERATOR.EQUALS || op === LOGICAL_OPERATOR.EQUALS)) {
    const leftCol = getColumnIdentifier(node.left);
    const rightCol = getColumnIdentifier(node.right);
    if (typeof leftCol === 'string') {
      result.set(leftCol.toLowerCase(), extractLiteralOrParamValue(node.right, params));
    } else if (typeof rightCol === 'string') {
      result.set(rightCol.toLowerCase(), extractLiteralOrParamValue(node.left, params));
    }
  }
  return result;
}

/**
 * Extract primary key tuple from WHERE clause expressions.
 * @param {Object} where - WHERE clause AST node.
 * @param {string[]} pkColumns - Declared primary key column names.
 * @param {Array<*>} params - Parameter values.
 * @return {Array<*>|null}
 */
function extractPkFromWhereClause(where, pkColumns, params) {
  if (!where || !Array.isArray(pkColumns) || pkColumns.length === 0) return null;
  if (pkColumns.length === 1 &&
      where.type === QUERY_AST_NODE.BINARY &&
      where.operator === QUERY_OPERATOR.EQUALS) {
    return matchBinaryEqualityPk(where, pkColumns[0].toLowerCase(), params);
  }
  const equalities = collectAndEqualities(where, params);
  const tuple = [];
  for (const col of pkColumns) {
    const val = equalities.get(col.toLowerCase());
    if (val === undefined || val === null) return null;
    tuple.push(val);
  }
  return tuple;
}

/**
 * Extract primary key tuples from an INSERT statement AST.
 * @param {Object} ast - INSERT statement AST.
 * @param {string[]} pkColumns - Declared primary key column names.
 * @param {Array<*>} params - Parameter values.
 * @return {Array<Array<*>>}
 */
function extractInsertPkValues(ast, pkColumns, params) {
  if (!ast) return [];
  const columns = ast.columns || [];
  const pkIndices = pkColumns.map((pkCol) => {
    const lower = pkCol.toLowerCase();
    return columns.findIndex((c) => (c?.name || c || '').toLowerCase() === lower);
  });
  if (pkIndices.some((idx) => idx === -1)) return [];
  return (ast.values || []).map((row) =>
    pkIndices.map((idx) => extractLiteralOrParamValue(row[idx], params)),
  );
}

/**
 * Retrieve conflicting reservations held by other active transactions on a table.
 * @param {Object} engine - SQL query engine.
 * @param {string} tableName - Target table.
 * @param {string|null} currentTransactionId - Current transaction ID.
 * @return {Array<Object>} List of reservation records.
 */
function getConflictingReservations(engine, tableName, currentTransactionId) {
  const coordinator = engine?.transactionCoordinator;
  if (!coordinator?.transactionsBySession) return [];
  const conflicting = [];
  for (const tx of coordinator.transactionsBySession.values()) {
    if (tx.transactionId === currentTransactionId) continue;
    for (const rec of getTransactionReservations(tx.transactionId)) {
      if (rec.tableName === tableName) conflicting.push(rec);
    }
  }
  return conflicting;
}

/**
 * Handle a detected reservation conflict for a write statement.
 * @param {Object} engine - SQL query engine.
 * @param {Object} statement - Write statement.
 * @param {Object} writeTransaction - Write transaction context.
 * @param {string} transactionId - Current transaction ID.
 * @param {Object} check - Conflict check outcome.
 * @return {Promise<Object>}
 */
async function failConflict(engine, statement, writeTransaction, transactionId, check) {
  if (writeTransaction.ownership === LOCKING_READ_TX_OWNERSHIP.EXPLICIT) {
    await rollbackConflictingSession(engine, statement.sessionId, transactionId);
  }
  return createLockConflictResult({
    rowKey: check.rowKey,
    transactionId,
    conflictingTransactionId: check.conflictingTransactionId,
  });
}

/**
 * Check row reservations for an INSERT statement.
 * @param {Object} context - Write statement context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
async function checkInsertReservations(ctx) {
  const {
    engine, tableName, pkColumns, candidatePartitions,
    statement, writeTransaction, transactionId,
  } = ctx;
  const ast = statement.writePlan?.ast || statement.ast;
  for (const pkValues of extractInsertPkValues(ast, pkColumns, statement.params)) {
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    const check = checkRowReservationConflict({
      tableName,
      partitionId,
      pkValues,
      transactionId,
      db: resolvePartitionDb(engine, partitionId),
    });
    if (check.conflict) {
      return failConflict(engine, statement, writeTransaction, transactionId, check);
    }
  }
  return null;
}

/**
 * Check single primary key conflict for UPDATE/DELETE with equality WHERE clause.
 * @param {Object} ctx - Check context.
 * @param {Array<*>} wherePk - Extracted primary key tuple.
 * @return {Promise<Object|null>} Conflict refusal or null.
 */
async function checkSinglePkConflict(ctx, wherePk) {
  const {engine, tableName, candidatePartitions, statement, writeTransaction, transactionId} = ctx;
  const partitionId = resolveRowPartitionId(engine, tableName, wherePk, candidatePartitions);
  const check = checkRowReservationConflict({
    tableName,
    partitionId,
    pkValues: wherePk,
    transactionId,
    db: resolvePartitionDb(engine, partitionId),
  });
  return check.conflict ?
    failConflict(engine, statement, writeTransaction, transactionId, check) :
    null;
}

/**
 * Check queried candidate rows conflict for UPDATE/DELETE with complex WHERE.
 * @param {Object} ctx - Check context.
 * @return {Promise<Object|null>} Conflict refusal or null.
 */
async function checkQueriedCandidatesConflict(ctx) {
  const {
    engine, tableName, pkColumns, candidatePartitions,
    statement, writeTransaction, transactionId,
  } = ctx;
  let rows;
  try {
    rows = await queryMatchingPkRows(
      engine,
      {tableName, pkColumns, candidatePartitions},
      statement,
    );
  } catch (err) {
    if (engine.logger?.debug) {
      engine.logger.debug(LOCAL_LOG_QUERY_MATCHING_PK_ROWS_FAILED, {error: err.message});
    }
    return {
      success: false,
      error: `Failed to evaluate candidate rows for locking read reservation check: ${err.message}`,
      errorCode: err.errorCode || QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
      sqlState: err.sqlState || PG_ERROR_CODE.INTERNAL_ERROR,
    };
  }

  if (!rows || rows.length === 0) return null;

  for (const row of rows) {
    const pkValues = extractRowPkValues(row, pkColumns);
    if (!pkValues) continue;
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    const check = checkRowReservationConflict({
      tableName,
      partitionId,
      pkValues,
      transactionId,
      db: resolvePartitionDb(engine, partitionId),
    });
    if (check.conflict) {
      return failConflict(engine, statement, writeTransaction, transactionId, check);
    }
  }
  return null;
}

/**
 * Check row reservations for an UPDATE or DELETE statement.
 * @param {Object} ctx - Write statement context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
async function checkUpdateOrDeleteReservations(ctx) {
  const conflicting = getConflictingReservations(ctx.engine, ctx.tableName, ctx.transactionId);
  if (conflicting.length === 0) return null;

  const ast = ctx.statement.writePlan?.ast || ctx.statement.ast;
  const wherePk = extractPkFromWhereClause(ast?.where, ctx.pkColumns, ctx.statement.params);
  return wherePk ? checkSinglePkConflict(ctx, wherePk) : checkQueriedCandidatesConflict(ctx);
}

/**
 * Evaluate conflict checks across all write statement types.
 * @param {Object} context - Write context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
async function evaluateWriteReservations(context) {
  const {engine, statement, writeTransaction} = context;
  const tableName = statement.tableName;
  const tableInfo = statement.tableInfo || engine.getTableInfo(tableName);
  const pkColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
  if (pkColumns.length === 0) return null;

  const transactionId = writeTransaction.transactionState?.transactionId || null;
  const candidatePartitions = Array.from(statement.writePlan.partitionStatements.keys());

  if (statement.statementType === LOCKING_READ_AST_TYPE.INSERT) {
    return checkInsertReservations({
      engine,
      tableName,
      pkColumns,
      candidatePartitions,
      statement,
      writeTransaction,
      transactionId,
    });
  }

  return checkUpdateOrDeleteReservations({
    engine,
    tableName,
    pkColumns,
    candidatePartitions,
    statement,
    writeTransaction,
    transactionId,
  });
}

/**
 * Perform conflict check for write statements (INSERT, UPDATE, DELETE).
 * @param {Object} context - Write statement context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
export async function checkWriteStatementReservations(context) {
  return evaluateWriteReservations(context);
}

/**
 * Whether a write result is eligible for staged reservation.
 * @param {Object} result - Statement execution result.
 * @param {Object} writeTransaction - Write transaction context.
 * @return {boolean}
 */
function isEligibleForWriteStaging(result, writeTransaction) {
  return Boolean(
    result?.success === true &&
    writeTransaction?.ownership === LOCKING_READ_TX_OWNERSHIP.EXPLICIT,
  );
}

/**
 * Extract candidate partitions from a write plan statement.
 * @param {Object} statement - Write statement.
 * @return {string[]} Partition IDs.
 */
function extractWriteCandidatePartitions(statement) {
  const partMap = statement.writePlan?.partitionStatements;
  return partMap ? Array.from(partMap.keys()) : [];
}

/**
 * Stage INSERT primary key reservations.
 * @param {Object} args - Stage arguments.
 */
function stageInsertPkReservations(args) {
  const {engine, tableName, ast, pkColumns, params, candidatePartitions, meta} = args;
  for (const pkValues of extractInsertPkValues(ast, pkColumns, params)) {
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    acquireRowReservation({
      tableName,
      partitionId,
      pkValues,
      db: resolvePartitionDb(engine, partitionId),
      ...meta,
    });
  }
}

/**
 * Stage WHERE equality primary key reservations for UPDATE or DELETE.
 * @param {Object} args - Stage arguments.
 */
function stageWherePkReservations(args) {
  const {engine, tableName, ast, pkColumns, params, candidatePartitions, meta} = args;
  const wherePk = extractPkFromWhereClause(ast?.where, pkColumns, params);
  if (!wherePk) return;
  const partitionId = resolveRowPartitionId(engine, tableName, wherePk, candidatePartitions);
  acquireRowReservation({
    tableName,
    partitionId,
    pkValues: wherePk,
    db: resolvePartitionDb(engine, partitionId),
    ...meta,
  });
}

/**
 * Stage write reservations for explicit transactions after write succeeds.
 * @param {Object} context - Context object.
 */
export function stageWriteReservationsAfterExecution(context) {
  const {engine, statement, writeTransaction, result} = context;
  if (!isEligibleForWriteStaging(result, writeTransaction)) return;
  const transactionId = writeTransaction.transactionState?.transactionId;
  const tableInfo = statement.tableInfo || engine.getTableInfo(statement.tableName);
  const pkColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
  if (!transactionId || pkColumns.length === 0) return;

  const candidatePartitions = extractWriteCandidatePartitions(statement);
  const ast = statement.writePlan?.ast || statement.ast;
  const meta = {
    transactionId,
    sessionId: statement.sessionId,
    kind: LOCKING_READ_RESERVATION_KIND.WRITE_STAGED,
  };
  const stageArgs = {
    engine,
    tableName: statement.tableName,
    ast,
    pkColumns,
    params: statement.params,
    candidatePartitions,
    meta,
  };

  if (statement.statementType === LOCKING_READ_AST_TYPE.INSERT) {
    stageInsertPkReservations(stageArgs);
  } else {
    stageWherePkReservations(stageArgs);
  }
}

/**
 * Extract WHERE clause AST node from statement metadata.
 * @param {Object} statement - Statement metadata.
 * @return {Object|null} WHERE clause AST node.
 */
function extractWriteWhereClause(statement) {
  return statement.writePlan?.ast?.where || statement.ast?.where || statement.whereClause || null;
}

/**
 * Create a candidate read failure error object.
 * @param {Object|null} readResult - Read result.
 * @return {Error}
 */
function createCandidateReadError(readResult) {
  const errorMsg = readResult?.error || 'candidate read failed during reservation check';
  const err = new Error(errorMsg);
  err.errorCode = readResult?.errorCode || QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE;
  err.sqlState = readResult?.sqlState || PG_ERROR_CODE.INTERNAL_ERROR;
  return err;
}

function buildMatchingPkSelectAst(target, statement) {
  const {tableName, pkColumns} = target;
  const ast = statement.ast;
  return {
    type: LOCKING_READ_AST_TYPE.SELECT,
    columns: pkColumns.map((col) => ({type: QUERY_AST_NODE.COLUMN_REF, column: col})),
    from: {type: QUERY_AST_NODE.TABLE, name: tableName},
    where: extractWriteWhereClause(statement),
    ...(ast?.orderBy ? {orderBy: ast.orderBy} : {}),
    ...(ast?.limit !== undefined ? {limit: ast.limit} : {}),
    ...(ast?.offset !== undefined ? {offset: ast.offset} : {}),
  };
}

/**
 * Query matching primary key rows for an UPDATE, DELETE, or non-projected SELECT.
 * Fails closed if the query execution fails or throws.
 * @param {Object} engine - SQL query engine.
 * @param {Object} target - Query target descriptor.
 * @param {Object} statement - Statement metadata.
 * @return {Promise<Array<Object>>} Matching canonical PK rows.
 */
async function queryMatchingPkRows(engine, target, statement) {
  const queryExecutor = engine ? engine.queryExecutor : null;
  if (!queryExecutor || typeof queryExecutor.executeSelect !== 'function') {
    return [];
  }

  const selectAst = buildMatchingPkSelectAst(target, statement);
  const readResult = await queryExecutor.executeSelect(
    selectAst,
    target.candidatePartitions,
    statement.params || [],
    {
      sessionId: statement.sessionId,
      timeoutMs: statement.queryOptions?.timeoutMs,
      preferLeader: true,
    },
  );

  if (readResult && readResult.success === true && Array.isArray(readResult.rows)) {
    return readResult.rows;
  }
  throw createCandidateReadError(readResult);
}
