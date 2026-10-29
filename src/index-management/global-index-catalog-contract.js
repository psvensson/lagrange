/**
 * Global Secondary Index catalog contract and lifecycle state machine.
 * Owns GSI catalog schema representation, state transition invariants,
 * read/write visibility gates, and Release 0.3 non-unique boundary enforcement.
 *
 * Requirements: Stage C1 (RM-0.3-qs-non-unique-gsi).
 */

import {QUERY_ERROR_CODE} from '../query/query-constants.js';
import {
  GLOBAL_INDEX_ERROR_MSG,
  GLOBAL_INDEX_MAINTENANCE_MODE,
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
  INDEX_TYPE,
} from './index-constants.js';

const LOCAL_STR_COMMA = ',';

export {
  GLOBAL_INDEX_ERROR_MSG,
  GLOBAL_INDEX_MAINTENANCE_MODE,
  GLOBAL_INDEX_SQL_STATE,
  GLOBAL_INDEX_STATE,
};

// State transition graph for global index lifecycle
const VALID_TRANSITIONS = Object.freeze({
  [GLOBAL_INDEX_STATE.CREATING]: Object.freeze([
    GLOBAL_INDEX_STATE.WRITE_ONLY,
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ]),
  [GLOBAL_INDEX_STATE.WRITE_ONLY]: Object.freeze([
    GLOBAL_INDEX_STATE.BACKFILLING,
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ]),
  [GLOBAL_INDEX_STATE.BACKFILLING]: Object.freeze([
    GLOBAL_INDEX_STATE.READ_WRITE,
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ]),
  [GLOBAL_INDEX_STATE.READ_WRITE]: Object.freeze([
    GLOBAL_INDEX_STATE.DROPPING,
    GLOBAL_INDEX_STATE.FAILED,
  ]),
  [GLOBAL_INDEX_STATE.DROPPING]: Object.freeze([
    GLOBAL_INDEX_STATE.FAILED,
  ]),
  [GLOBAL_INDEX_STATE.FAILED]: Object.freeze([
    GLOBAL_INDEX_STATE.DROPPING,
  ]),
});

/**
 * Check whether a state transition is permitted by the GSI lifecycle machine.
 * @param {string} fromState - Current state.
 * @param {string} toState - Proposed next state.
 * @return {boolean} True if allowed.
 */
export function isValidGlobalIndexStateTransition(fromState, toState) {
  if (fromState === toState) {
    return true;
  }
  const allowed = VALID_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.includes(toState));
}

/**
 * Assert that a state transition is permitted, throwing a typed error if not.
 * @param {string} fromState - Current state.
 * @param {string} toState - Proposed next state.
 * @throws {Error} If transition is invalid.
 */
export function assertValidGlobalIndexStateTransition(fromState, toState) {
  if (!isValidGlobalIndexStateTransition(fromState, toState)) {
    throw new Error(
      `${GLOBAL_INDEX_ERROR_MSG.INVALID_STATE_TRANSITION}${fromState} -> ${toState}`,
    );
  }
}

/**
 * Check whether an index in the given state must be synchronously maintained on write.
 * True for WRITE_ONLY, BACKFILLING, and READ_WRITE.
 * @param {string} state - Index state.
 * @return {boolean} True if writes should maintain this index.
 */
export function maintainsOnWrite(state) {
  return (
    state === GLOBAL_INDEX_STATE.WRITE_ONLY ||
    state === GLOBAL_INDEX_STATE.BACKFILLING ||
    state === GLOBAL_INDEX_STATE.READ_WRITE
  );
}

/**
 * Check whether an index in the given state is readable by the query planner.
 * True ONLY for READ_WRITE.
 * @param {string} state - Index state.
 * @return {boolean} True if planner can select this index.
 */
export function isReadableByPlanner(state) {
  return state === GLOBAL_INDEX_STATE.READ_WRITE;
}

/**
 * Assert that a global index definition is supported under Release 0.3.
 * Specifically enforces RM-0.3-qs-non-unique-gsi: cross-partition unique
 * indexes fail closed with 0A000 / UNSUPPORTED_SQL_FEATURE.
 * @param {Object} definition
 * @param {boolean} [definition.isUnique=false]
 * @param {boolean} [definition.isGlobal=true]
 * @param {string[]} [definition.columnNames=[]]
 * @param {string|string[]} [definition.basePartitionKey]
 */
export function assertSupportedGlobalIndexDefinition(definition = {}) {
  const isGlobal = definition.isGlobal !== false;
  const isUnique = Boolean(definition.isUnique);

  if (isGlobal && isUnique) {
    const error = new Error(
      GLOBAL_INDEX_ERROR_MSG.CROSS_PARTITION_UNIQUE_DEFERRED,
    );
    error.code = QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE;
    error.sqlState = GLOBAL_INDEX_SQL_STATE.FEATURE_NOT_SUPPORTED;
    throw error;
  }
}

function validateGlobalIndexRecordOptions(options) {
  if (!options?.tableName) {
    throw new Error(GLOBAL_INDEX_ERROR_MSG.TABLE_NAME_REQUIRED);
  }
  if (!options?.indexName) {
    throw new Error(GLOBAL_INDEX_ERROR_MSG.INDEX_NAME_REQUIRED);
  }
  if (!Array.isArray(options.columnNames) || options.columnNames.length === 0) {
    throw new Error(GLOBAL_INDEX_ERROR_MSG.COLUMN_NAMES_REQUIRED);
  }
}

/**
 * Create a new normalized GSI catalog record.
 * @param {Object} options
 * @return {Object} Catalog row object.
 */
export function createGlobalIndexRecord(options = {}) {
  validateGlobalIndexRecordOptions(options);

  const isGlobal = options.isGlobal !== undefined ? options.isGlobal : 1;
  const isUnique = options.isUnique !== undefined ? options.isUnique : 0;
  const createdAt = options.createdAt || Date.now();
  const updatedAt = options.updatedAt || createdAt;

  assertSupportedGlobalIndexDefinition({
    isGlobal: Boolean(isGlobal),
    isUnique: Boolean(isUnique),
    columnNames: options.columnNames,
  });

  return {
    index_id: options.indexId,
    table_id: options.tableId || options.tableName,
    table_name: options.tableName,
    index_name: options.indexName,
    column_names: JSON.stringify(options.columnNames),
    index_type: options.indexType || INDEX_TYPE.BTREE,
    is_global: isGlobal ? 1 : 0,
    is_unique: isUnique ? 1 : 0,
    state: options.state || GLOBAL_INDEX_STATE.CREATING,
    backfill_cursor_partition_id: null,
    backfill_cursor_pk: null,
    backfill_total_rows: 0,
    error_message: null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function parseColumnNames(rawColumnNames) {
  if (Array.isArray(rawColumnNames)) {
    return rawColumnNames;
  }
  if (typeof rawColumnNames === 'string') {
    try {
      return JSON.parse(rawColumnNames);
    } catch (_err) {
      return rawColumnNames.split(LOCAL_STR_COMMA).map((c) => c.trim());
    }
  }
  return [];
}

function resolveBackfillTotalRows(row) {
  if (row.backfill_total_rows !== undefined) {
    return Number(row.backfill_total_rows);
  }
  if (row.backfillTotalRows !== undefined) {
    return Number(row.backfillTotalRows);
  }
  return 0;
}

function extractIdentifiers(row) {
  return {
    indexId: row.index_id || row.indexId,
    tableId: row.table_id || row.tableId,
    tableName: row.table_name || row.tableName,
    indexName: row.index_name || row.indexName,
  };
}

function extractTimestampsAndErrors(row) {
  return {
    errorMessage: row.error_message || row.errorMessage || null,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

function extractBackfillCursors(row) {
  return {
    backfillCursorPartitionId:
      row.backfill_cursor_partition_id || row.backfillCursorPartitionId || null,
    backfillCursorPk:
      row.backfill_cursor_pk || row.backfillCursorPk || null,
    backfillTotalRows: resolveBackfillTotalRows(row),
  };
}

/**
 * Normalize an index catalog row into a structured object.
 * @param {Object} row - Raw row from indices table.
 * @return {Object} Normalized metadata object.
 */
export function normalizeGlobalIndexRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...extractIdentifiers(row),
    columnNames: parseColumnNames(row.column_names),
    indexType: row.index_type || row.indexType || INDEX_TYPE.BTREE,
    isGlobal: row.is_global !== undefined ? Boolean(row.is_global) : true,
    isUnique: Boolean(row.is_unique),
    state: row.state || GLOBAL_INDEX_STATE.CREATING,
    ...extractBackfillCursors(row),
    ...extractTimestampsAndErrors(row),
  };
}
