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
import {extractStatementWriteFootprint} from
  '../partition/partition-write-footprint-contract.js';
import {
  LOCKING_READ_AST_TYPE, LOCKING_READ_CLAUSE, LOCKING_READ_STRENGTH,
  LOCKING_READ_TX_OWNERSHIP, LOCKING_READ_UNKNOWN_PARTITION,
} from './sql-locking-read-constants.js';
import {QUERY_AST_NODE, QUERY_ERROR_CODE} from './query-constants.js';
import {PG_ERROR_CODE} from '../runtime/pgwire-protocol-constants.js';

const LOCAL_LOG_QUERY_MATCHING_PK_ROWS_FAILED =
  'locking read query matching pk rows failed';

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

function extractWhereEqualitiesViaFootprint(ast, pkColumns, params) {
  const equalities = new Map();
  if (!ast?.where || !Array.isArray(pkColumns)) return equalities;
  for (const col of pkColumns) {
    const colFootprint = extractStatementWriteFootprint({
      ast,
      params,
      pkCols: [col],
    });
    if (colFootprint.scoped && colFootprint.pkTuples.length === 1) {
      equalities.set(col.toLowerCase(), colFootprint.pkTuples[0][0]);
    }
  }
  return equalities;
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
    rows, params, sessionId, transactionRead, queryOptions,
  } = ctx;
  const allInProjection = rows.every((row) => extractRowPkValues(row, pkColumns) !== null);
  if (allInProjection) return rows.map((row) => extractRowPkValues(row, pkColumns));

  const whereFootprint = extractStatementWriteFootprint({
    ast,
    params,
    pkCols: pkColumns,
  });
  if (whereFootprint.scoped && whereFootprint.pkTuples.length === 1 && rows.length === 1) {
    return [[...whereFootprint.pkTuples[0]]];
  }

  const whereEqualities = extractWhereEqualitiesViaFootprint(ast, pkColumns, params);
  if (whereEqualities.size > 0 && rows.length > 0) {
    const mergedTuples = rows.map((row) => extractMergedPkTuple(row, pkColumns, whereEqualities));
    if (mergedTuples.every((tuple) => tuple !== null)) {
      return mergedTuples;
    }
  }

  const statement = {
    ast, whereClause: ast.where, params, sessionId, transactionRead, queryOptions,
  };
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

async function acquireAllRowReservations(ctx) {
  const {
    engine, tableName, canonicalTuples, candidatePartitions,
    transactionId, sessionId, holdTimeoutMs,
  } = ctx;
  for (const pkValues of canonicalTuples) {
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    const acq = acquireRowReservation({
      tableName, partitionId, pkValues, transactionId, sessionId,
      participantId: `${transactionId}:${partitionId}`,
      kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
      db: resolvePartitionDb(engine, partitionId), holdTimeoutMs,
    });
    if (acq.conflict) {
      await rollbackConflictingSession(engine, sessionId, transactionId);
      return createLockConflictResult({
        rowKey: acq.rowKey, transactionId,
        conflictingTransactionId: acq.conflictingTransactionId,
      });
    }
  }
  return null;
}

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
    ast, tableName: target.tableName, pkColumns: target.pkColumns,
    candidatePartitions, rows: target.rows, params, sessionId,
    transactionRead, queryOptions: options.queryOptions || {},
  });
  if (resolution.failure) return resolution.failure;

  const conflict = await acquireAllRowReservations({
    engine, tableName: target.tableName, canonicalTuples: resolution.tuples,
    candidatePartitions, transactionId: transactionRead.identity.transactionId,
    sessionId, holdTimeoutMs: options.holdTimeoutMs,
  });
  return conflict || selectResult;
}

function extractLiteralOrParamValue(node, params) {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (node.type === QUERY_AST_NODE.PARAMETER) {
    const idx = typeof node.index === 'number' ? node.index : 0;
    return params?.[idx] ?? null;
  }
  return node.value !== undefined ? node.value : null;
}

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
      if (rec.tableName === tableName &&
          rec.kind === LOCKING_READ_RESERVATION_KIND.FOR_UPDATE) {
        conflicting.push(rec);
      }
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

function findUnscopedInsertConflict(engine, tableName, transactionId, candidatePartitions) {
  const conflicting = getConflictingReservations(engine, tableName, transactionId);
  if (Array.isArray(candidatePartitions) && candidatePartitions.length > 0) {
    return conflicting.find((rec) => candidatePartitions.includes(rec.partitionId)) || null;
  }
  return conflicting[0] || null;
}

/**
 * Check row reservations for an INSERT statement.
 * @param {Object} ctx - Write statement context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
async function checkInsertReservations(ctx) {
  const {
    engine, tableName, pkColumns, candidatePartitions,
    statement, writeTransaction, transactionId,
  } = ctx;
  const ast = statement.writePlan?.ast || statement.ast;
  const footprint = extractStatementWriteFootprint({
    sql: statement.sql || '',
    ast,
    params: statement.params || [],
    pkCols: pkColumns,
  });
  const tuples = footprint.pkTuples.length > 0 ?
    footprint.pkTuples :
    extractInsertPkValues(ast, pkColumns, statement.params);
  for (const pkValues of tuples) {
    const conflict = await checkSinglePkConflict(ctx, [...pkValues]);
    if (conflict) return conflict;
  }
  if (!footprint.scoped) {
    const match = findUnscopedInsertConflict(
      engine,
      tableName,
      transactionId,
      candidatePartitions,
    );
    if (match) {
      return failConflict(engine, statement, writeTransaction, transactionId, {
        conflict: true,
        rowKey: match.rowKey,
        conflictingTransactionId: match.transactionId,
      });
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
    onlyForUpdate: true,
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
      onlyForUpdate: true,
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
  const footprint = extractStatementWriteFootprint({
    sql: ctx.statement.sql || '',
    ast,
    params: ctx.statement.params || [],
    pkCols: ctx.pkColumns,
  });
  if (!footprint.scoped || footprint.pkTuples.length === 0) {
    return checkQueriedCandidatesConflict(ctx);
  }
  for (const pkTuple of footprint.pkTuples) {
    const conflict = await checkSinglePkConflict(ctx, [...pkTuple]);
    if (conflict) return conflict;
  }
  return null;
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
  const ctx = {
    engine, tableName, pkColumns, candidatePartitions,
    statement, writeTransaction, transactionId,
  };
  return statement.statementType === LOCKING_READ_AST_TYPE.INSERT ?
    checkInsertReservations(ctx) :
    checkUpdateOrDeleteReservations(ctx);
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
 * Stage WHERE primary key reservations for UPDATE or DELETE.
 * @param {Object} args - Stage arguments.
 */
function stageWherePkReservations(args) {
  const {engine, tableName, ast, pkColumns, params, candidatePartitions, meta} = args;
  const footprint = extractStatementWriteFootprint({
    ast,
    params: params || [],
    pkCols: pkColumns,
  });
  if (!footprint.scoped || footprint.pkTuples.length === 0) {
    return 0;
  }
  for (const pkTuple of footprint.pkTuples) {
    const pkValues = [...pkTuple];
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    acquireRowReservation({
      tableName,
      partitionId,
      pkValues,
      db: resolvePartitionDb(engine, partitionId),
      ...meta,
    });
  }
  return footprint.pkTuples.length;
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
  const transactionIdentity = statement.transactionRead?.identity;
  const readResult = await queryExecutor.executeSelect(
    selectAst,
    target.candidatePartitions,
    statement.params || [],
    {
      sessionId: statement.sessionId,
      timeoutMs: statement.queryOptions?.timeoutMs,
      preferLeader: true,
      ...(transactionIdentity ? {transactionIdentity} : {}),
    },
  );

  if (readResult && readResult.success === true && Array.isArray(readResult.rows)) {
    return readResult.rows;
  }
  throw createCandidateReadError(readResult);
}
