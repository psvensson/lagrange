import {
  QUERY_RESULT_BUDGET_ERROR_CODE,
} from '../query/query-result-budget.js';
import {createSqlRequest} from '../query/sql-request.js';

const BYTE_ENCODING = 'utf8';
const QUERY_BUDGET_RESULT_MAX_BYTES = 'RESULT_MAX_BYTES';
const QUERY_BUDGET_RESULT_MAX_ROWS = 'RESULT_MAX_ROWS';
const CONTEXT_QUERY_ROW_LIMIT_OFFSET = 1;
const CONTEXT_ROW_BYTES_FIELD = '__request_cell_row_bytes';
const REQUEST_CELL_BUDGET_ERROR_CODE = 'request_cell_budget_exhausted';
const CONTEXT_ROW_BYTES_SQL =
  'COALESCE(length(CAST(key AS BLOB)), 0) + ' +
  'COALESCE(length(CAST(value AS BLOB)), 0)';
const CONTEXT_KEY_PROJECTION_SQL = 'THEN key ELSE NULL END AS key, ';
const CONTEXT_VALUE_PROJECTION_SQL = 'THEN value ELSE NULL END AS value, ';
const SQL_EXECUTOR_REQUIRED =
  'request Cell table effects require the current SQL executor';
const SQL_REQUEST_FAILED = 'request Cell table request failed';
const TABLE_WRITE_NOT_AUTHORIZED =
  'request Cell table write is outside the current runtime access policy';

function encodedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), BYTE_ENCODING);
}

function contextBudgetFailure(actual, limit) {
  const error = new Error(
    `Binding context_bytes budget exhausted (${actual} > ${limit})`,
  );
  error.code = REQUEST_CELL_BUDGET_ERROR_CODE;
  return error;
}

function isQueryResultBudgetErrorCode(code) {
  return code === QUERY_RESULT_BUDGET_ERROR_CODE.BYTES_EXHAUSTED ||
    code === QUERY_RESULT_BUDGET_ERROR_CODE.ROWS_EXHAUSTED;
}

function resolveSqlRequestFailure(result) {
  if (result && result.firstFailedParticipant) {
    return result.firstFailedParticipant;
  }
  if (result && Array.isArray(result.participantFailures) &&
      result.participantFailures.length > 0) {
    return result.participantFailures[0];
  }
  return result;
}

function assertSqlRequestSucceeded(result, contextByteLimit = null) {
  if (result && result.success === true) return;
  const failure = resolveSqlRequestFailure(result);
  if (contextByteLimit !== null &&
      isQueryResultBudgetErrorCode(failure && failure.errorCode)) {
    throw contextBudgetFailure(
      contextByteLimit + CONTEXT_QUERY_ROW_LIMIT_OFFSET,
      contextByteLimit,
    );
  }
  throw new Error(
    result && result.error ? result.error : SQL_REQUEST_FAILED,
  );
}

function assertSqlRequestExecutor(replicaContext) {
  if (typeof replicaContext.sqlRequestExecutor !== 'function') {
    throw new Error(SQL_EXECUTOR_REQUIRED);
  }
}

function buildContextReadRequest({
  cancellationToken,
  remainingBytes,
  serviceId,
  table,
  tenantId,
  wallBudget,
}) {
  const tableName = table.context.replace(/^table:/u, '');
  const quotedTable = '"' + tableName.replaceAll('"', '""') + '"';
  return createSqlRequest({
    budgets: {
      [QUERY_BUDGET_RESULT_MAX_BYTES]: remainingBytes,
      [QUERY_BUDGET_RESULT_MAX_ROWS]: remainingBytes,
    },
    parameters: [
      remainingBytes,
      remainingBytes,
    ],
    sessionId: serviceId,
    statement:
      `SELECT CASE WHEN (${CONTEXT_ROW_BYTES_SQL}) <= ? ` +
      CONTEXT_KEY_PROJECTION_SQL +
      `CASE WHEN (${CONTEXT_ROW_BYTES_SQL}) <= ? ` +
      CONTEXT_VALUE_PROJECTION_SQL +
      `(${CONTEXT_ROW_BYTES_SQL}) AS ` +
      `"${CONTEXT_ROW_BYTES_FIELD}" ` +
      `FROM ${quotedTable} LIMIT ` +
      `${remainingBytes + CONTEXT_QUERY_ROW_LIMIT_OFFSET}`,
    tenantId,
    timeoutBudget: wallBudget,
    cancellationToken,
  });
}

function projectContextSnapshot(result, table, remainingBytes) {
  const rows = result?.rows || [];
  const oversizedRow = rows.find(
    (row) => row[CONTEXT_ROW_BYTES_FIELD] > remainingBytes,
  );
  if (oversizedRow) {
    throw contextBudgetFailure(
      oversizedRow[CONTEXT_ROW_BYTES_FIELD],
      remainingBytes,
    );
  }
  return {
    context: table.context,
    rows: rows.map((row) => ({
      key: row.key,
      value: row.value,
    })),
  };
}

async function readRequestCellContexts({
  cancellationToken,
  cell,
  replicaContext,
  serviceId,
  tables,
  tenantId,
  wallBudget,
}) {
  const readableTables = tables.filter((table) => table.read);
  if (readableTables.length === 0) return [];
  assertSqlRequestExecutor(replicaContext);
  const snapshots = [];
  for (const table of readableTables) {
    const minimumBytes = encodedBytes([
      ...snapshots,
      {context: table.context, rows: []},
    ]);
    if (minimumBytes > cell.budgets.context_bytes) {
      throw contextBudgetFailure(
        minimumBytes,
        cell.budgets.context_bytes,
      );
    }
    const remainingBytes =
      cell.budgets.context_bytes - encodedBytes(snapshots);
    const result = await replicaContext.sqlRequestExecutor(
      buildContextReadRequest({
        cancellationToken,
        remainingBytes,
        serviceId,
        table,
        tenantId,
        wallBudget,
      }),
    );
    assertSqlRequestSucceeded(result, remainingBytes);
    snapshots.push(
      projectContextSnapshot(result, table, remainingBytes),
    );
    const actualBytes = encodedBytes(snapshots);
    if (actualBytes > cell.budgets.context_bytes) {
      throw contextBudgetFailure(
        actualBytes,
        cell.budgets.context_bytes,
      );
    }
  }
  return snapshots;
}

async function writeRequestCellEffects({
  cancellationToken,
  effects,
  replicaContext,
  serviceId,
  tables,
  tenantId,
  wallBudget,
}) {
  if (effects.length === 0) return;
  assertSqlRequestExecutor(replicaContext);
  const writableContexts = new Set(
    tables.filter((table) => table.write).map((table) => table.context),
  );
  for (const effect of effects) {
    if (!writableContexts.has(effect.context)) {
      throw new Error(TABLE_WRITE_NOT_AUTHORIZED);
    }
    const tableName = effect.context.replace(/^table:/u, '');
    const quotedTable = `"${tableName.replaceAll('"', '""')}"`;
    const result = await replicaContext.sqlRequestExecutor(createSqlRequest({
      parameters: [effect.key, effect.value],
      sessionId: serviceId,
      statement: `INSERT INTO ${quotedTable} (key, value) VALUES (?, ?)`,
      tenantId,
      timeoutBudget: wallBudget,
      cancellationToken,
    }));
    assertSqlRequestSucceeded(result);
  }
}

export {
  readRequestCellContexts,
  writeRequestCellEffects,
};
