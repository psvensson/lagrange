/**
 * Locking read (SELECT ... FOR UPDATE) and write reservation execution helpers.
 *
 * Implements Stage B3–B5 execution semantics:
 * - Matching row key derivation via resolveDeclaredPrimaryKeyColumns
 * - Fail-fast participant reservation acquisition
 * - Immediate conflict refusal (55P03) with whole-transaction rollback
 * - Re-entrant reservation for the same transaction
 * - Cross-operation mutual exclusion between SELECT ... FOR UPDATE and writes
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

/**
 * Determine whether a parsed AST is a locking read (SELECT ... FOR UPDATE).
 *
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
 * Extract primary key tuple from a row object.
 *
 * @param {Object} row - Result row.
 * @param {string[]} pkColumns - Declared primary key column names.
 * @return {Array<*>} Primary key values tuple.
 */
function extractRowPkValues(row, pkColumns) {
  return pkColumns.map((col) => {
    if (Object.hasOwn(row, col)) return row[col];
    const lower = col.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return row[key];
    }
    return row[col];
  });
}

/**
 * Resolve target partition ID for a primary key tuple.
 *
 * @param {Object} engine - SQL query engine.
 * @param {string} tableName - Target table.
 * @param {Array<*>} pkValues - Primary key tuple.
 * @param {string[]} candidatePartitions - Candidate partition IDs.
 * @return {string}
 */
function partitionIdOfCandidate(candidate) {
  if (typeof candidate === 'object' && candidate !== null) {
    return candidate.partition_id || candidate.id || LOCKING_READ_UNKNOWN_PARTITION;
  }
  return candidate || LOCKING_READ_UNKNOWN_PARTITION;
}

function resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions) {
  if (Array.isArray(candidatePartitions) && candidatePartitions.length === 1) {
    return partitionIdOfCandidate(candidatePartitions[0]);
  }
  const tablePartitions = engine.getTablePartitions?.(tableName);
  const keyValue = pkValues.length === 1 ? pkValues[0] : pkValues;
  const resolver = engine.partitionResolver;
  if (Array.isArray(tablePartitions) &&
      typeof resolver?.resolvePartitionForKey === 'function') {
    const resolved = resolver.resolvePartitionForKey(
      tableName,
      keyValue,
      tablePartitions,
    );
    if (resolved) return resolved;
  }
  return partitionIdOfCandidate(candidatePartitions?.[0]);
}

/**
 * Execute locking read reservation for a completed SELECT ... FOR UPDATE query.
 *
 * @param {Object} options - Execution context options.
 * @param {Object} options.engine - SQL query engine instance.
 * @param {Object} options.ast - Parsed SELECT AST.
 * @param {string} options.sessionId - Active session ID.
 * @param {Object} options.transactionRead - DTC transaction read handle.
 * @param {Object} options.selectResult - Raw SELECT execution result.
 * @return {Promise<Object>} Admitted result or 55P03 conflict refusal.
 */
export async function executeLockingReadReservations({
  engine,
  ast,
  sessionId,
  transactionRead,
  selectResult,
}) {
  if (!selectResult || selectResult.success !== true) {
    return selectResult;
  }

  const tableName = ast.from.name;
  const tableInfo = engine.getTableInfo(tableName);
  const pkColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);

  if (pkColumns.length === 0) {
    return {
      success: false,
      error: `Table '${tableName}' must have a PRIMARY KEY defined for FOR UPDATE`,
      errorCode: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
      sqlState: PG_ERROR_CODE.FEATURE_NOT_SUPPORTED,
    };
  }

  const rows = selectResult.rows || [];
  if (rows.length === 0) {
    return selectResult;
  }

  const candidatePartitions = selectResult.partitions ||
    (tableInfo ? engine.getTablePartitions(tableName).map((p) => p.partition_id) : []);
  const transactionId = transactionRead.identity.transactionId;

  for (const row of rows) {
    const pkValues = extractRowPkValues(row, pkColumns);
    const partitionId = resolveRowPartitionId(
      engine,
      tableName,
      pkValues,
      candidatePartitions,
    );

    const acq = acquireRowReservation({
      tableName,
      partitionId,
      pkValues,
      transactionId,
      sessionId,
      participantId: `${transactionId}:${partitionId}`,
      kind: LOCKING_READ_RESERVATION_KIND.FOR_UPDATE,
    });

    if (acq.conflict) {
      // Conflicting transaction holds reservation: fail fast (55P03),
      // roll back whole transaction on coordinator, and release prior reservations.
      if (typeof engine.transactionCoordinator.rollbackOwned === 'function') {
        await engine.transactionCoordinator.rollbackOwned(sessionId, transactionId);
      } else {
        await engine.transactionCoordinator.rollback(sessionId);
      }
      return createLockConflictResult({
        rowKey: acq.rowKey,
        transactionId,
        conflictingTransactionId: acq.conflictingTransactionId,
      });
    }
  }

  return selectResult;
}

function extractLiteralOrParamValue(node, params) {
  if (!node) return null;
  if (node.type === QUERY_AST_NODE.PARAMETER) {
    const idx = typeof node.index === 'number' ? node.index : 0;
    return params?.[idx] ?? null;
  }
  if (node.value !== undefined) return node.value;
  return node;
}

function getColumnIdentifier(node) {
  if (!node) return null;
  return node.column || node.name || null;
}

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

function extractPkFromWhereClause(where, pkColumns, params) {
  if (!where || pkColumns.length !== 1) return null;
  if (where.type !== QUERY_AST_NODE.BINARY || where.operator !== QUERY_OPERATOR.EQUALS) {
    return null;
  }
  return matchBinaryEqualityPk(where, pkColumns[0].toLowerCase(), params);
}

function extractInsertPkValues(ast, pkColumns, params) {
  if (!ast) return [];
  const columns = ast.columns || [];
  const pkIndices = pkColumns.map((pkCol) => {
    const lower = pkCol.toLowerCase();
    return columns.findIndex((c) => (c?.name || c || '').toLowerCase() === lower);
  });
  if (pkIndices.some((idx) => idx === -1)) return [];
  const rows = ast.values || [];
  const result = [];
  for (const row of rows) {
    const tuple = pkIndices.map((idx) => {
      const val = row[idx];
      return extractLiteralOrParamValue(val, params);
    });
    result.push(tuple);
  }
  return result;
}

function getConflictingReservations(engine, tableName, currentTransactionId) {
  const coordinator = engine?.transactionCoordinator;
  if (!coordinator?.transactionsBySession) return [];
  const conflicting = [];
  for (const tx of coordinator.transactionsBySession.values()) {
    if (tx.transactionId === currentTransactionId) continue;
    const records = getTransactionReservations(tx.transactionId);
    for (const rec of records) {
      if (rec.tableName === tableName) {
        conflicting.push(rec);
      }
    }
  }
  return conflicting;
}

async function failConflict(engine, statement, writeTransaction, transactionId, check) {
  if (writeTransaction.ownership === LOCKING_READ_TX_OWNERSHIP.EXPLICIT) {
    if (typeof engine.transactionCoordinator?.rollbackOwned === 'function') {
      await engine.transactionCoordinator.rollbackOwned(statement.sessionId, transactionId);
    } else if (typeof engine.transactionCoordinator?.rollback === 'function') {
      await engine.transactionCoordinator.rollback(statement.sessionId);
    }
  }
  return createLockConflictResult({
    rowKey: check.rowKey,
    transactionId,
    conflictingTransactionId: check.conflictingTransactionId,
  });
}

/**
 * Check row reservations for an incoming write statement (INSERT/UPDATE/DELETE).
 * Fails fast with 55P03 if another transaction holds a reservation on target rows.
 *
 * @param {Object} context - Write statement context.
 * @param {Object} context.engine - Query engine.
 * @param {Object} context.statement - Write statement metadata.
 * @param {Object} context.writeTransaction - Write transaction context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
async function checkInsertReservations({
  engine,
  tableName,
  pkColumns,
  candidatePartitions,
  statement,
  writeTransaction,
  transactionId,
}) {
  const ast = statement.writePlan?.ast || statement.ast;
  const rows = extractInsertPkValues(ast, pkColumns, statement.params);
  for (const pkValues of rows) {
    const partitionId = resolveRowPartitionId(
      engine,
      tableName,
      pkValues,
      candidatePartitions,
    );
    const check = checkRowReservationConflict({
      tableName,
      partitionId,
      pkValues,
      transactionId,
    });
    if (check.conflict) {
      return failConflict(engine, statement, writeTransaction, transactionId, check);
    }
  }
  return null;
}

async function checkUpdateOrDeleteReservations({
  engine,
  tableName,
  pkColumns,
  candidatePartitions,
  statement,
  writeTransaction,
  transactionId,
}) {
  const conflicting = getConflictingReservations(engine, tableName, transactionId);
  if (conflicting.length === 0) {
    return null;
  }

  const ast = statement.writePlan?.ast || statement.ast;
  const wherePk = extractPkFromWhereClause(ast?.where, pkColumns, statement.params);
  if (wherePk) {
    const partitionId = resolveRowPartitionId(
      engine,
      tableName,
      wherePk,
      candidatePartitions,
    );
    const check = checkRowReservationConflict({
      tableName,
      partitionId,
      pkValues: wherePk,
      transactionId,
    });
    if (check.conflict) {
      return failConflict(engine, statement, writeTransaction, transactionId, check);
    }
    return null;
  }

  const rows = await queryMatchingPkRows(
    engine,
    tableName,
    pkColumns,
    candidatePartitions,
    statement,
  );
  if (!rows || rows.length === 0) return null;

  for (const row of rows) {
    const pkValues = extractRowPkValues(row, pkColumns);
    const partitionId = resolveRowPartitionId(
      engine,
      tableName,
      pkValues,
      candidatePartitions,
    );
    const check = checkRowReservationConflict({
      tableName,
      partitionId,
      pkValues,
      transactionId,
    });
    if (check.conflict) {
      return failConflict(engine, statement, writeTransaction, transactionId, check);
    }
  }

  return null;
}

async function evaluateWriteReservations({
  engine,
  statement,
  writeTransaction,
}) {
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
 *
 * @param {Object} context - Write statement context.
 * @param {Object} context.engine - Query engine.
 * @param {Object} context.statement - Write statement metadata.
 * @param {Object} context.writeTransaction - Write transaction context.
 * @return {Promise<Object|null>} Conflict refusal result, or null if permitted.
 */
export async function checkWriteStatementReservations(context) {
  return evaluateWriteReservations(context);
}

function isEligibleForWriteStaging(result, writeTransaction) {
  if (!result || result.success !== true) return false;
  return writeTransaction?.ownership === LOCKING_READ_TX_OWNERSHIP.EXPLICIT;
}

function extractWriteCandidatePartitions(statement) {
  const partMap = statement.writePlan?.partitionStatements;
  if (!partMap) return [];
  return Array.from(partMap.keys());
}

function stageInsertPkReservations({
  engine,
  tableName,
  ast,
  pkColumns,
  params,
  candidatePartitions,
  meta,
}) {
  const pkTuples = extractInsertPkValues(ast, pkColumns, params);
  for (const pkValues of pkTuples) {
    const partitionId = resolveRowPartitionId(engine, tableName, pkValues, candidatePartitions);
    acquireRowReservation({
      tableName,
      partitionId,
      pkValues,
      ...meta,
    });
  }
}

function stageWherePkReservations({
  engine,
  tableName,
  ast,
  pkColumns,
  params,
  candidatePartitions,
  meta,
}) {
  const wherePk = extractPkFromWhereClause(ast?.where, pkColumns, params);
  if (!wherePk) return;
  const partitionId = resolveRowPartitionId(engine, tableName, wherePk, candidatePartitions);
  acquireRowReservation({
    tableName,
    partitionId,
    pkValues: wherePk,
    ...meta,
  });
}

/**
 * Stage write reservations for explicit transactions after write succeeds.
 *
 * @param {Object} context - Context object.
 */
export function stageWriteReservationsAfterExecution({
  engine,
  statement,
  writeTransaction,
  result,
}) {
  if (!isEligibleForWriteStaging(result, writeTransaction)) return;
  const transactionId = writeTransaction.transactionState?.transactionId;
  if (!transactionId) return;

  const tableName = statement.tableName;
  const tableInfo = statement.tableInfo || engine.getTableInfo(tableName);
  const pkColumns = resolveDeclaredPrimaryKeyColumns(tableInfo);
  if (pkColumns.length === 0) return;

  const candidatePartitions = extractWriteCandidatePartitions(statement);
  const ast = statement.writePlan?.ast || statement.ast;
  const meta = {
    transactionId,
    sessionId: statement.sessionId,
    kind: LOCKING_READ_RESERVATION_KIND.WRITE_STAGED,
  };

  const stageArgs = {
    engine,
    tableName,
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

function extractWriteWhereClause(statement) {
  if (statement.writePlan?.ast?.where) {
    return statement.writePlan.ast.where;
  }
  return statement.ast?.where || null;
}

/**
 * Query matching primary key rows for an UPDATE or DELETE statement.
 */
async function queryMatchingPkRows(
  engine,
  tableName,
  pkColumns,
  candidatePartitions,
  statement,
) {
  const queryExecutor = engine.queryExecutor;
  if (!queryExecutor || typeof queryExecutor.executeSelect !== 'function') {
    return [];
  }

  const selectAst = {
    type: 'SELECT',
    columns: pkColumns.map((col) => ({type: 'column_ref', column: col})),
    from: {type: 'table', name: tableName},
    where: extractWriteWhereClause(statement),
  };

  try {
    const timeoutMs = statement.queryOptions ? statement.queryOptions.timeoutMs : undefined;
    const readResult = await queryExecutor.executeSelect(
      selectAst,
      candidatePartitions,
      statement.params,
      {
        sessionId: statement.sessionId,
        timeoutMs,
        preferLeader: true,
      },
    );
    return readResult?.rows || [];
  } catch (err) {
    if (engine.logger && typeof engine.logger.debug === 'function') {
      engine.logger.debug(LOCAL_LOG_QUERY_MATCHING_PK_ROWS_FAILED, {error: err.message});
    }
    return [];
  }
}
