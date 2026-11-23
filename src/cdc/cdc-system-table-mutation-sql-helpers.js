import {CDC_SQL} from './cdc-constants.js';
import {CDC_OPERATION, SQL} from '../constants/index.js';

const CDC_BATCH_UPSERT_ERROR_CODE = Object.freeze({
  EMPTY_ROWS: 'CDC_BATCH_UPSERT_EMPTY_ROWS',
  INVALID_ROW: 'CDC_BATCH_UPSERT_INVALID_ROW',
  EMPTY_COLUMNS: 'CDC_BATCH_UPSERT_EMPTY_COLUMNS',
  HETEROGENEOUS_ROW_SHAPE: 'CDC_BATCH_UPSERT_HETEROGENEOUS_ROW_SHAPE',
  UNDEFINED_VALUE: 'CDC_BATCH_UPSERT_UNDEFINED_VALUE',
});
const ZERO_INDEX = 0;

function createBatchUpsertError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPlainBatchRow(tableName, row, rowIndex) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw createBatchUpsertError(
      CDC_BATCH_UPSERT_ERROR_CODE.INVALID_ROW,
      `Batch UPSERT for ${tableName} requires a plain object at row index ${rowIndex}`,
    );
  }
}

function assertMatchingRowColumns(tableName, row, rowIndex, columns, canonicalColumnSet) {
  const rowKeys = Object.keys(row);
  const missingColumns = columns.filter((columnName) => !Object.hasOwn(row, columnName));
  const extraColumns = rowKeys.filter((key) => !canonicalColumnSet.has(key));
  if (missingColumns.length > ZERO_INDEX || extraColumns.length > ZERO_INDEX) {
    throw createBatchUpsertError(
      CDC_BATCH_UPSERT_ERROR_CODE.HETEROGENEOUS_ROW_SHAPE,
      `Batch UPSERT for ${tableName} row index ${rowIndex} has heterogeneous columns` +
        (missingColumns.length > ZERO_INDEX ?
          ` (missing: ${missingColumns.join(CDC_SQL.COMMA_SPACE)})` :
          '') +
        (extraColumns.length > ZERO_INDEX ?
          ` (extra: ${extraColumns.join(CDC_SQL.COMMA_SPACE)})` :
          ''),
    );
  }
}

export function buildSystemTableUpsert(tableName, data) {
  const {columns, placeholders, values} =
    buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, data);
  return {sql: `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) ` +
    `${SQL.VALUES} (${placeholders})`, params: values};
}

export function buildSystemTableBatchUpsert(tableName, rows) {
  if (!Array.isArray(rows) || rows.length === ZERO_INDEX) {
    throw createBatchUpsertError(
      CDC_BATCH_UPSERT_ERROR_CODE.EMPTY_ROWS,
      `Batch UPSERT for ${tableName} requires a non-empty rows array`,
    );
  }
  assertPlainBatchRow(tableName, rows[ZERO_INDEX], ZERO_INDEX);
  const columns = Object.keys(rows[ZERO_INDEX]);
  if (columns.length === ZERO_INDEX) {
    throw createBatchUpsertError(
      CDC_BATCH_UPSERT_ERROR_CODE.EMPTY_COLUMNS,
      `Batch UPSERT for ${tableName} requires at least one column in row index 0`,
    );
  }
  const canonicalColumnSet = new Set(columns);
  const rowPlaceholder =
    `(${columns.map(() => CDC_SQL.PARAM_PLACEHOLDER).join(CDC_SQL.COMMA_SPACE)})`;
  const valuesClause = rows.map(() => rowPlaceholder).join(CDC_SQL.COMMA_SPACE);
  const params = [];
  for (let rowIndex = ZERO_INDEX; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (rowIndex > ZERO_INDEX) {
      assertPlainBatchRow(tableName, row, rowIndex);
      assertMatchingRowColumns(tableName, row, rowIndex, columns, canonicalColumnSet);
    }
    for (const columnName of columns) {
      const value = row[columnName];
      if (value === undefined) {
        throw createBatchUpsertError(
          CDC_BATCH_UPSERT_ERROR_CODE.UNDEFINED_VALUE,
          `Batch UPSERT for ${tableName} row index ${rowIndex} has undefined value for column ${columnName}`,
        );
      }
      params.push(serializeMutationValue(value));
    }
  }
  return {
    sql: `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} ` +
      `(${columns.join(CDC_SQL.COMMA_SPACE)}) ${SQL.VALUES} ${valuesClause}`,
    params,
  };
}

function serializeMutationValue(value) {
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

export function buildSystemTableMutationSqlParts(mode, values) {
  const map = values || {};

  if (mode === CDC_OPERATION.INSERT) {
    const columns = Object.keys(map);
    const placeholders = columns
      .map(() => CDC_SQL.PARAM_PLACEHOLDER)
      .join(CDC_SQL.COMMA_SPACE);
    return {
      columns: columns.join(CDC_SQL.COMMA_SPACE),
      placeholders,
      values: columns.map((columnName) =>
        serializeMutationValue(map[columnName]),
      ),
    };
  }

  if (mode === CDC_OPERATION.UPDATE) {
    const columns = Object.keys(map);
    const setClause = columns
      .map((columnName) => `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.COMMA_SPACE);
    return {
      setClause,
      values: columns.map((columnName) =>
        serializeMutationValue(map[columnName]),
      ),
    };
  }

  return buildWhereParts(map);
}

// The null-sentinel where-value convention: a null whereClause value is an
// IS NULL predicate with NO bound parameter — `column = ?` binding null is
// never true in SQL, so rendering it as an equality silently matches zero
// rows (the replica-operation terminal CAS guards on `completed_at: null`
// and refused forever). Mirrors buildSqlMutationPlan in
// control-plane-system-table-gateway-query-execution.js verbatim so the two
// builders share one convention.
function buildWhereParts(map) {
  const conditions = Object.keys(map);
  const whereStr = conditions
    .map((columnName) => (map[columnName] === null ?
      `${columnName}${CDC_SQL.IS_NULL_PREDICATE}` :
      `${columnName}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))
    .join(CDC_SQL.WHERE_AND);
  return {
    whereStr,
    values: conditions
      .filter((columnName) => map[columnName] !== null)
      .map((columnName) => map[columnName]),
  };
}
