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
  listDbTableReservationConflicts,
} from './partition-locking-read-reservation.js';
import {
  readPartitionWriteGeneration,
  readPartitionWriteGenerationHistoryRange,
  readTableFootprintMetadata,
} from './partition-participant-transaction-store.js';
import {
  encodeCanonicalPkTupleKey,
  extractStatementWriteFootprint,
} from './partition-write-footprint-contract.js';

const PG_PARAM_RE = /\$[1-9]\d*/u;
const SQL_DIALECT = Object.freeze({
  POSTGRESQL: 'postgresql',
  SQLITE: 'sqlite',
});

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

function checkUnscopedWriteConflict(service, tableName, pkCols, ast, params, lockedByKey) {
  if (ast?.type === LOCKING_READ_AST_TYPE.INSERT || pkCols.length === 0) {
    const firstEntry = lockedByKey.entries().next().value;
    return createLockConflictResult({
      rowKey: firstEntry[0],
      partitionId: service.partitionId,
      conflictingTransactionId: firstEntry[1],
    });
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
    return createReservationUnavailableResult({
      partitionId: service.partitionId,
      message: `Failed to evaluate locking-read write conflict: ${error.message}`,
    });
  }
}

function evaluateMatchedLockRows(service, tableName, payload, ast, listedRows) {
  const lockedByKey = new Map(listedRows.map((r) => [r.rowKey, r.transactionId]));
  if (!ast || ast.parseError) {
    const first = listedRows[0];
    return createLockConflictResult({
      rowKey: first.rowKey,
      partitionId: service.partitionId,
      conflictingTransactionId: first.transactionId,
    });
  }
  const params = decodePayloadParams(payload);
  const {pkCols, allCols} = readTableFootprintMetadata(service.db, tableName);
  const footprint = extractStatementWriteFootprint({ast, params, pkCols, allCols});
  if (footprint.scoped && footprint.rowKeys.length > 0) {
    return checkScopedFootprintConflict(service, tableName, footprint, lockedByKey);
  }
  return checkUnscopedWriteConflict(service, tableName, pkCols, ast, params, lockedByKey);
}

function isWritablePartitionDb(service) {
  return Boolean(service?.db) && service.db.open !== false;
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
  if (!isWritablePartitionDb(service)) {
    return null;
  }
  const ast = parseWriteAst(payload?.sql);
  const hasServiceTable = typeof service.tableName === 'string' && service.tableName.length > 0;
  const tableName = hasServiceTable ? service.tableName : ast?.table ?? null;
  if (!tableName) {
    return null;
  }
  const listed = listDbTableReservationConflicts(service.db, {
    partitionId: service.partitionId,
    tableName,
    transactionId: payload?.transactionId || null,
  });
  if (!listed.ok) {
    return createReservationUnavailableResult({
      partitionId: service.partitionId,
      message: listed.error,
    });
  }
  if (listed.rows.length === 0) {
    return null;
  }
  return evaluateMatchedLockRows(service, tableName, payload, ast, listed.rows);
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
