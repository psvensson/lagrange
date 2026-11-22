/**
 * Authoritative partition-side write conflict & read-generation validation for
 * SELECT ... FOR UPDATE locking-read reservations.
 *
 * Enforces durable _lagrange_locking_read_reservations directly on the leader's
 * SQLite database across all incoming write paths (autocommit & transactional),
 * independently of any client coordinator's process-local bookkeeping.
 *
 * @module partition/partition-locking-read-write-check
 */

import {SQLParser} from '../query/sql-parser.js';
import {renderSelectWithParameters} from '../query/sql-statement-renderer.js';
import {EXPR_TYPE} from '../query/parser-constants.js';
import {QUERY_AST_NODE} from '../query/query-constants.js';
import {decodeTypedParams} from '../query/sql-value-codec.js';
import {
  LOCKING_READ_AST_TYPE,
  LOCKING_READ_ERROR_CODE,
  LOCKING_READ_SQL_STATE,
} from '../query/sql-locking-read-constants.js';
import {
  createLockConflictResult,
  createReservationUnavailableResult,
  deriveRowLockKey,
} from './partition-locking-read-reservation.js';
import {listDbTableReservationConflicts} from './partition-locking-read-store.js';
import {
  readPartitionWriteGeneration,
  readPartitionWriteGenerationHistoryRange,
  readPreparedParticipantRows,
  readTableFootprintMetadata,
} from './partition-participant-transaction-store.js';
import {operationsOf} from './partition-participant-transaction-bytes.js';
import {
  PARTICIPANT_TRANSACTION_SESSION_PHASE as PHASE,
} from './partition-participant-transaction-constants.js';
import {listActiveParticipantSessions} from './partition-participant-transaction-session.js';
import {sqliteConnectionState} from '../storage/sqlite-connection-state.js';
import {
  encodeCanonicalPkTupleKey,
  extractStatementWriteFootprint,
} from './partition-write-footprint-contract.js';
import {
  isDeterministicStatementFailure,
  statementEnvironmentFailure,
} from './partition-committed-statement-outcome.js';

const PG_PARAM_RE = /\$[1-9]\d*/u;
const PARTICIPANT_TRANSACTIONS_TABLE = '_participant_transactions';
const CHECK_PARTICIPANT_TABLE_SQL =
  'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' AND name = ?';
const SQL_DIALECT = Object.freeze({
  POSTGRESQL: 'postgresql',
  SQLITE: 'sqlite',
});
const SCAN_WRITE_AST_TYPES = Object.freeze(new Set(['UPDATE', 'DELETE']));
const UPDATE_AST_TYPE = 'UPDATE';

function decodePayloadParams(payload) {
  if (payload?.typedParams !== undefined && payload?.typedParams !== null) {
    return decodeTypedParams(payload.typedParams);
  }
  return Array.isArray(payload?.params) ? payload.params : [];
}

function parseErrorOutcome(error) {
  return {parseError: error.message};
}

function parseWriteAst(sql) {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return null;
  }
  try {
    const dialect = PG_PARAM_RE.test(sql) ? SQL_DIALECT.POSTGRESQL : SQL_DIALECT.SQLITE;
    const parser = new SQLParser(sql, {dialect});
    parser.logger = {debug() {}, info() {}, warn() {}, error() {}};
    return parser.parse();
  } catch (error) {
    return parseErrorOutcome(error);
  }
}

function createAstParamResolver(params, ast) {
  const mapping = ast?._paramMapping;
  return (paramNode) => {
    const rawIdx = paramNode?.index;
    const mappedIdx = Array.isArray(mapping) &&
      Number.isInteger(rawIdx) &&
      rawIdx >= 0 &&
      rawIdx < mapping.length ?
      Number(mapping[rawIdx]) - 1 :
      rawIdx;
    return params[mappedIdx];
  };
}

function buildScanSelectAst(tableName, pkCols, writeAst) {
  return {
    type: LOCKING_READ_AST_TYPE.SELECT,
    columns: pkCols.map((col) => ({
      type: EXPR_TYPE.COLUMN,
      alias: null,
      expression: {type: QUERY_AST_NODE.COLUMN_REF, table: null, column: col},
    })),
    from: {type: QUERY_AST_NODE.TABLE, name: tableName},
    where: writeAst?.where || null,
    ...(writeAst?.orderBy ? {orderBy: writeAst.orderBy} : {}),
    ...(writeAst?.limit !== undefined ? {limit: writeAst.limit} : {}),
    ...(writeAst?.offset !== undefined ? {offset: writeAst.offset} : {}),
  };
}

function extractMatchedRowPkTuple(row, pkCols) {
  const tuple = [];
  for (const col of pkCols) {
    if (Object.hasOwn(row, col) && row[col] !== undefined) {
      tuple.push(row[col]);
      continue;
    }
    const lower = col.toLowerCase();
    const matchedKey = Object.keys(row).find((k) => k.toLowerCase() === lower);
    const val = matchedKey ? row[matchedKey] : undefined;
    if (val === undefined || val === null) {
      return null;
    }
    tuple.push(val);
  }
  return tuple;
}

function checkScopedFootprintConflict(service, tableName, footprint, lockedByKey) {
  for (const rk of footprint.rowKeys) {
    const fullKey = `${tableName}:${service.partitionId}:${rk}`;
    const holder = lockedByKey.get(fullKey);
    if (holder) {
      return createLockConflictResult({
        rowKey: fullKey,
        partitionId: service.partitionId,
        conflictingTransactionId: holder,
      });
    }
  }
  return null;
}

function assignmentsMutatePk(ast, pkCols) {
  if (ast?.type !== UPDATE_AST_TYPE || !Array.isArray(pkCols) || pkCols.length === 0) {
    return false;
  }
  const assignments = ast.assignments ?? ast.set;
  if (!Array.isArray(assignments)) {
    return false;
  }
  const pkSet = new Set(pkCols.map((col) => String(col).toLowerCase()));
  return assignments.some((assignment) => {
    const rawCol = assignment ? (assignment.column ?? assignment.name) : '';
    const col = String(rawCol ?? '').trim().replace(/^["'`]|["'`]$/gu, '').toLowerCase();
    return pkSet.has(col);
  });
}

function firstLockedEntryConflict(service, lockedByKey) {
  const firstEntry = lockedByKey.entries().next().value;
  return createLockConflictResult({
    rowKey: firstEntry[0],
    partitionId: service.partitionId,
    conflictingTransactionId: firstEntry[1],
  });
}

function handleScanConflictError(service, error, lockedByKey, deterministic) {
  if (deterministic) {
    if (!isDeterministicStatementFailure(error, service.db)) {
      throw statementEnvironmentFailure(error);
    }
    return firstLockedEntryConflict(service, lockedByKey);
  }
  return createReservationUnavailableResult({
    partitionId: service.partitionId,
    message: `Failed to evaluate locking-read write conflict: ${error.message}`,
  });
}

function checkUnscopedWriteConflict(
  service, tableName, pkCols, ast, params, lockedByKey, deterministic,
) {
  if (!SCAN_WRITE_AST_TYPES.has(ast?.type) ||
      pkCols.length === 0 ||
      assignmentsMutatePk(ast, pkCols)) {
    return firstLockedEntryConflict(service, lockedByKey);
  }
  try {
    const selectAst = buildScanSelectAst(tableName, pkCols, ast);
    const {sql: checkSql, params: checkParams} = renderSelectWithParameters(
      selectAst,
      createAstParamResolver(params, ast),
    );
    const rows = service.db.prepare(checkSql).all(checkParams);
    for (const row of rows) {
      const tuple = extractMatchedRowPkTuple(row, pkCols);
      if (!tuple) {
        continue;
      }
      const fullKey = deriveRowLockKey(tableName, service.partitionId, tuple);
      const holder = lockedByKey.get(fullKey);
      if (holder) {
        return createLockConflictResult({
          rowKey: fullKey,
          partitionId: service.partitionId,
          conflictingTransactionId: holder,
        });
      }
    }
    return null;
  } catch (error) {
    return handleScanConflictError(service, error, lockedByKey, deterministic);
  }
}

function evaluateSingleOperationAgainstLocks(
  service, tableName, operation, ast, footprintMeta, lockedByKey, deterministic,
) {
  if (!ast || ast.parseError) {
    return firstLockedEntryConflict(service, lockedByKey);
  }
  const params = decodePayloadParams(operation);
  const {pkCols, allCols} = footprintMeta;
  const footprint = extractStatementWriteFootprint({ast, params, pkCols, allCols});
  if (footprint.scoped && footprint.rowKeys.length > 0) {
    return checkScopedFootprintConflict(service, tableName, footprint, lockedByKey);
  }
  return checkUnscopedWriteConflict(
    service, tableName, pkCols, ast, params, lockedByKey, deterministic,
  );
}

function isWritablePartitionDb(service) {
  return Boolean(service?.db) && service.db.open !== false;
}

function resolveConflictTableName(service, firstAst) {
  const hasServiceTable = typeof service.tableName === 'string' && service.tableName.length > 0;
  return hasServiceTable ? service.tableName : firstAst?.table ?? null;
}

function listDurableConflictsForWrite(service, tableName, transactionId, deterministic) {
  if (!deterministic) {
    return listDbTableReservationConflicts(service.db, {
      partitionId: service.partitionId,
      tableName,
      transactionId,
      throwOnError: false,
    });
  }
  try {
    return listDbTableReservationConflicts(service.db, {
      partitionId: service.partitionId,
      tableName,
      transactionId,
      throwOnError: true,
    });
  } catch (error) {
    throw statementEnvironmentFailure(error);
  }
}

/**
 * Deterministically check whether one or more SQL write operations conflict
 * with any active durable FOR_UPDATE reservation in service.db held by another
 * transaction. Reads solely from replicated SQLite state (zero process-local
 * memory, zero wall-clock expiry) so Raft apply decisions are identical across
 * every replica.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} options - {operations, transactionId, deterministic}.
 * @return {Object|null} Conflict/unavailable answer, or null if clear.
 */
export function checkOperationsLockingReadConflict(
  service,
  {operations, transactionId = null, deterministic = false} = {},
) {
  if (!Array.isArray(operations) || operations.length === 0 || !isWritablePartitionDb(service)) {
    return null;
  }
  const parsedAsts = operations.map((op) => parseWriteAst(op?.sql));
  const tableName = resolveConflictTableName(service, parsedAsts[0]);
  if (!tableName) {
    return null;
  }
  const listed = listDurableConflictsForWrite(service, tableName, transactionId, deterministic);
  if (!listed.ok) {
    return createReservationUnavailableResult({
      partitionId: service.partitionId,
      message: listed.error,
    });
  }
  if (listed.rows.length === 0) {
    return null;
  }
  const lockedByKey = new Map(listed.rows.map((r) => [r.rowKey, r.transactionId]));
  const footprintMeta = readTableFootprintMetadata(service.db, tableName);
  for (let i = 0; i < operations.length; i += 1) {
    const conflict = evaluateSingleOperationAgainstLocks(
      service, tableName, operations[i], parsedAsts[i], footprintMeta, lockedByKey, deterministic,
    );
    if (conflict !== null) {
      return conflict;
    }
  }
  return null;
}

/**
 * Canonical lock-conflict response fields shared by participant PREPARE/COMMIT
 * refusal answers (R08).
 *
 * @param {Object|null|undefined} lockConflict - Conflict result from checkOperationsLockingReadConflict.
 * @return {Object} Public typed conflict fields.
 */
export function buildLockConflictAnswerFields(lockConflict) {
  if (!lockConflict) {
    return {};
  }
  return {
    errorCode: lockConflict.errorCode,
    code: lockConflict.code,
    sqlState: lockConflict.sqlState,
    conflict: lockConflict.conflict === true,
    retryable: lockConflict.retryable === true,
    ...(lockConflict.rowKey ? {rowKey: lockConflict.rowKey} : {}),
    ...(lockConflict.conflictingTransactionId ?
      {conflictingTransactionId: lockConflict.conflictingTransactionId} : {}),
  };
}

/**
 * Check whether an incoming partition write conflicts with any durable
 * FOR_UPDATE locking-read reservation on this partition leader's SQLite store.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} payload - Remote query/statement payload.
 * @return {Object|null} Conflict/unavailable error answer, or null if clear.
 */
export function checkPartitionWriteLockingReadConflict(service, payload) {
  return checkOperationsLockingReadConflict(service, {
    operations: [payload],
    transactionId: payload?.transactionId || null,
    deterministic: false,
  });
}

function generationRowTouchesKey(row, expectedGen, canonicalPkKey) {
  if (Number(row.generation) !== expectedGen || Number(row.scoped) !== 1) {
    return true;
  }
  let keys = null;
  try {
    keys = JSON.parse(row.row_keys_text);
  } catch (_err) {
    keys = null;
  }
  return !Array.isArray(keys) || keys.includes(canonicalPkKey);
}

/**
 * Determine whether a candidate row was committed-modified after the readGeneration
 * observed when SELECT ... FOR UPDATE selected its candidate rows.
 *
 * @param {Object} db - Partition SQLite database instance.
 * @param {number|null|undefined} readGeneration - Observed generation at select time.
 * @param {Array<*>|*} pkValues - Row primary key tuple.
 * @return {boolean}
 */
export function hasRowModificationSinceGeneration(db, readGeneration, pkValues) {
  if (!Number.isSafeInteger(readGeneration) || readGeneration < 0 || !db || db.open === false) {
    return false;
  }
  let currentGen = null;
  try {
    currentGen = readPartitionWriteGeneration(db);
  } catch (_err) {
    currentGen = null;
  }
  if (!Number.isSafeInteger(currentGen) || currentGen <= readGeneration) {
    return false;
  }
  const historyRows = readPartitionWriteGenerationHistoryRange(db, readGeneration, currentGen);
  if (historyRows.length !== currentGen - readGeneration) {
    return true;
  }
  const canonicalPkKey = encodeCanonicalPkTupleKey(pkValues);
  for (let i = 0; i < historyRows.length; i += 1) {
    if (generationRowTouchesKey(historyRows[i], readGeneration + i + 1, canonicalPkKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Record staged write row claims directly on a PartitionService staging session
 * after provisional validation succeeds, so leader ACQUIRE precheck enforces mutual
 * exclusion across processes independently of any client coordinator memory.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} session - Participant staging session.
 * @param {string} sql - Staged write SQL.
 * @param {Array} params - Normalized statement parameters.
 */
export function recordSessionStagedWriteClaims(service, session, sql, params) {
  if (!session?.stagedLockClaims || !isWritablePartitionDb(service)) {
    return;
  }
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    readTableFootprintMetadata(service.db, service.tableName);
  const footprint = extractStatementWriteFootprint({
    sql,
    params: Array.isArray(params) ? params : [],
    pkCols,
    allCols,
    uniqueConstraintCols,
    hasUnscopedSchemaConstraints,
  });
  if (!footprint.scoped || footprint.rowKeys.length === 0) {
    session.stagedLockClaims.hasUnscopedWrite = true;
    return;
  }
  for (let i = 0; i < footprint.rowKeys.length; i += 1) {
    session.stagedLockClaims.rowKeys.add(footprint.rowKeys[i]);
  }
}

function hasParticipantTransactionsTable(db) {
  if (!db || db.open === false) {
    return false;
  }
  return sqliteConnectionState(db)
    .statement(CHECK_PARTICIPANT_TABLE_SQL)
    .get(PARTICIPANT_TRANSACTIONS_TABLE) !== undefined;
}

function operationsConflictWithPkKey(db, tableName, operations, canonicalPkKey) {
  if (!Array.isArray(operations)) {
    return true;
  }
  if (operations.length === 0) {
    return false;
  }
  const {pkCols, allCols, uniqueConstraintCols, hasUnscopedSchemaConstraints} =
    readTableFootprintMetadata(db, tableName);
  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    const fp = extractStatementWriteFootprint({
      sql: op?.sql,
      params: Array.isArray(op?.params) ? op.params : [],
      pkCols,
      allCols,
      uniqueConstraintCols,
      hasUnscopedSchemaConstraints,
    });
    if (!fp.scoped || fp.rowKeys.length === 0 || fp.rowKeys.includes(canonicalPkKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Find any conflicting durable PREPARED participant transaction in service.db.
 * Reads solely from replicated SQLite state so Raft apply stays deterministic.
 *
 * @param {Object} db - Partition SQLite database instance.
 * @param {string|null} tableName - Partition table name.
 * @param {Array<*>|*} pkValues - Row primary key tuple.
 * @param {string|null} transactionId - Requesting transaction identifier.
 * @return {string|null} Conflicting transactionId or null.
 */
export function findConflictingPreparedWrite(db, tableName, pkValues, transactionId) {
  if (!hasParticipantTransactionsTable(db)) {
    return null;
  }
  const canonicalPkKey = encodeCanonicalPkTupleKey(pkValues);
  const preparedRows = readPreparedParticipantRows(db);
  for (let i = 0; i < preparedRows.length; i += 1) {
    const row = preparedRows[i];
    if (row.transactionId === transactionId) {
      continue;
    }
    const ops = operationsOf(row.operationsText);
    if (operationsConflictWithPkKey(db, tableName, ops, canonicalPkKey)) {
      return row.transactionId;
    }
  }
  return null;
}

function sessionConflictsWithPkKey(session, transactionId, canonicalPkKey) {
  const otherTxId = session.identity?.transactionId;
  if (!otherTxId || otherTxId === transactionId || session.phase === PHASE.DOOMED) {
    return null;
  }
  const claims = session.stagedLockClaims;
  if (claims?.hasUnscopedWrite === true || claims?.rowKeys?.has(canonicalPkKey)) {
    return otherTxId;
  }
  return null;
}

/**
 * Find any conflicting provisionally staged write on the leader's active sessions
 * or durable PREPARED participant rows.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} query - {tableName, pkValues, transactionId}.
 * @return {string|null} Conflicting transactionId or null.
 */
export function findConflictingStagedOrPreparedWrite(
  service,
  {tableName, pkValues, transactionId},
) {
  const canonicalPkKey = encodeCanonicalPkTupleKey(pkValues);
  for (const session of listActiveParticipantSessions(service)) {
    const conflictTxId = sessionConflictsWithPkKey(session, transactionId, canonicalPkKey);
    if (conflictTxId !== null) {
      return conflictTxId;
    }
  }
  const resolvedTable = typeof service?.tableName === 'string' && service.tableName.length > 0 ?
    service.tableName :
    tableName;
  return findConflictingPreparedWrite(
    service?.db,
    resolvedTable,
    pkValues,
    transactionId,
  );
}

/**
 * Build a typed stale-generation conflict answer for SELECT ... FOR UPDATE.
 *
 * @param {string} partitionId - Partition identifier.
 * @param {string} rowKey - Canonical row lock key.
 * @param {string} transactionId - Requesting transaction ID.
 * @return {Object} Conflict answer.
 */
export function buildStaleReadLockConflict(partitionId, rowKey, transactionId) {
  return {
    ...createLockConflictResult({
      rowKey,
      transactionId,
      partitionId,
      message: `Locking read refused for row "${rowKey}": candidate row modified before reservation`,
      errorCode: LOCKING_READ_ERROR_CODE.LOCK_NOT_AVAILABLE,
      sqlState: LOCKING_READ_SQL_STATE.LOCK_NOT_AVAILABLE,
    }),
    staleReadGeneration: true,
    authoritativeReservationAnswer: true,
  };
}
