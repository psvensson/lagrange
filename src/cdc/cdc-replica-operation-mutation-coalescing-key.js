import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';

const {
  CDC_INTEGRATION_SERVICE_LITERAL,
  NUM,
  SYSTEM_TABLE_NAME,
  TYPEOF,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_INSERT_COLUMN_LIST_PATTERN =
  /\binsert\s+(?:or\s+\w+\s+)?into\s+\S+\s*\(([^)]*)\)/i;
const CDC_WHERE_CLAUSE_PATTERN = /\bwhere\b\s+(.+)$/i;
const CDC_WHERE_EQUALITY_COLUMN_PATTERN =
  /(?:^|\band\b)\s*([`"']?\w+[`"']?)\s*=\s*\?/gi;
const CDC_SQL_COLUMN_SEPARATOR = ',';
const CDC_IDENTIFIER_QUOTE_PATTERN = /^[`"']|[`"']$/g;
const CDC_REPLICA_OPERATION_ID_COLUMN = 'operation_id';
const CDC_REPLICA_OPERATION_COALESCING_KEY_PREFIX = 'replica-operation';
const CDC_REPLICA_OPERATION_COALESCING_KEY_SEPARATOR = ':';

function normalizeMutationSelectionColumnName(columnName) {
  return String(columnName || CDC_INTEGRATION_SERVICE_LITERAL.EMPTY)
    .trim()
    .replace(CDC_IDENTIFIER_QUOTE_PATTERN, CDC_INTEGRATION_SERVICE_LITERAL.EMPTY);
}

function resolveInsertMutationColumnNames(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return [];
  }
  const match = sql.match(CDC_INSERT_COLUMN_LIST_PATTERN);
  if (!match || typeof match[NUM.ONE] !== TYPEOF.STRING) {
    return [];
  }
  return match[NUM.ONE]
    .split(CDC_SQL_COLUMN_SEPARATOR)
    .map((columnName) => normalizeMutationSelectionColumnName(columnName));
}

function resolveWhereMutationColumnNames(sql) {
  if (typeof sql !== TYPEOF.STRING) {
    return [];
  }
  const match = sql.match(CDC_WHERE_CLAUSE_PATTERN);
  if (!match || typeof match[NUM.ONE] !== TYPEOF.STRING) {
    return [];
  }
  const whereClause = match[NUM.ONE];
  const columnNames = [];
  let equalityMatch = CDC_WHERE_EQUALITY_COLUMN_PATTERN.exec(whereClause);
  while (equalityMatch) {
    if (typeof equalityMatch[NUM.ONE] === TYPEOF.STRING) {
      columnNames.push(
        normalizeMutationSelectionColumnName(equalityMatch[NUM.ONE]),
      );
    }
    equalityMatch = CDC_WHERE_EQUALITY_COLUMN_PATTERN.exec(whereClause);
  }
  CDC_WHERE_EQUALITY_COLUMN_PATTERN.lastIndex = NUM.ZERO;
  return columnNames;
}

function normalizeReplicaOperationMutationId(operationId) {
  return typeof operationId === TYPEOF.STRING && operationId.length > NUM.ZERO ?
    operationId :
    null;
}

function buildReplicaOperationMutationCoalescingKey(operationId) {
  const normalizedOperationId =
    normalizeReplicaOperationMutationId(operationId);
  if (!normalizedOperationId) {
    return null;
  }
  return CDC_REPLICA_OPERATION_COALESCING_KEY_PREFIX +
    CDC_REPLICA_OPERATION_COALESCING_KEY_SEPARATOR +
    normalizedOperationId;
}

function resolveReplicaOperationIdFromInsert(sql, params) {
  const columnNames = resolveInsertMutationColumnNames(sql);
  const operationIdColumnIndex =
    columnNames.indexOf(CDC_REPLICA_OPERATION_ID_COLUMN);
  if (operationIdColumnIndex < NUM.ZERO) {
    return null;
  }
  return normalizeReplicaOperationMutationId(params[operationIdColumnIndex]);
}

function resolveReplicaOperationIdFromWhere(sql, params) {
  const columnNames = resolveWhereMutationColumnNames(sql);
  const operationIdColumnIndex =
    columnNames.indexOf(CDC_REPLICA_OPERATION_ID_COLUMN);
  if (operationIdColumnIndex < NUM.ZERO) {
    return null;
  }
  const whereValueStartIndex = params.length - columnNames.length;
  if (whereValueStartIndex < NUM.ZERO) {
    return null;
  }
  return normalizeReplicaOperationMutationId(
    params[whereValueStartIndex + operationIdColumnIndex],
  );
}

function resolveReplicaOperationMutationCoalescingKey(tableName, sql, params) {
  if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
    return null;
  }
  if (!Array.isArray(params) || params.length === NUM.ZERO) {
    return null;
  }
  return buildReplicaOperationMutationCoalescingKey(
    resolveReplicaOperationIdFromInsert(sql, params) ||
      resolveReplicaOperationIdFromWhere(sql, params),
  );
}

export {
  resolveReplicaOperationMutationCoalescingKey,
  resolveInsertMutationColumnNames,
};
