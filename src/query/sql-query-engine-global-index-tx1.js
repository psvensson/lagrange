/**
 * TX1 transactional execution helpers for SQLQueryEngine Global Secondary Index maintenance.
 * Ensures all row-image reads, participant enlistments, and index maintenance writes
 * travel through QueryExecutor / PartitionService under the active TX1 transaction identity.
 */

import {EXPR_TYPE} from './parser-constants.js';
import {QUERY_AST_TYPE} from './query-constants.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';
import {renderExpressionWithParameters} from './sql-statement-renderer.js';
import {GLOBAL_INDEX_ERROR_CODE} from '../index-management/index-constants.js';
import {
  planGlobalIndexWriteOperations,
} from '../index-management/global-index-lifecycle-coordinator.js';

const LOCAL_STR_COLON = ':';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_ENLIST_FAILED = 'Failed to enlist global index participants in TX1';
const LOCAL_STR_MINUS = '-';
const LOCAL_STR_SQL_AND = ' AND ';
const LOCAL_STR_SQL_OR = ' OR ';
const TX_ERROR_COPY_FIELDS = Object.freeze([
  'errorCode',
  'failureCode',
  'refusalLayer',
  'detail',
]);

function createUnavailableError(partitionId, message) {
  const err = new Error(message || `Index participant unavailable: ${partitionId}`);
  err.code = GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE;
  return err;
}

function throwTxPartitionFailure(partitionId, rawRes) {
  const res = rawRes || {};
  const detailParts = [res.failureCode, res.refusalLayer, res.detail].filter(
    (part) => part !== undefined && part !== null && part !== '',
  );
  const detailSuffix = detailParts.join(LOCAL_STR_COLON);
  const baseMsg = res.error || `TX1 partition execution failed on ${partitionId}`;
  const err = createUnavailableError(
    partitionId,
    detailSuffix ? `${baseMsg} (${detailSuffix})` : baseMsg,
  );
  for (const field of TX_ERROR_COPY_FIELDS) {
    if (res[field] !== undefined && res[field] !== null) {
      err[field] = res[field];
    }
  }
  throw err;
}

function buildTxPartitionExecOptions(engine, baseOptions, tableName, forRead) {
  const cleaned = {...baseOptions, tableName};
  delete cleaned.entryId;
  if (!forRead && engine.resolveWriteFencePartitionVersion) {
    const tableInfo = engine.getTableInfo ? engine.getTableInfo(tableName) : null;
    cleaned.expectedPartitionVersion = engine.resolveWriteFencePartitionVersion(tableInfo);
  }
  return cleaned;
}

async function executeTxPartitionSql(
  engine,
  partitionId,
  sql,
  params,
  forRead,
  writeExecutionOptions,
  tableName,
) {
  if (!engine?.queryExecutor || !engine.queryExecutor.executeOnPartition) {
    throw createUnavailableError(partitionId, `QueryExecutor unavailable for ${partitionId}`);
  }
  const execOptions = buildTxPartitionExecOptions(
    engine,
    writeExecutionOptions,
    tableName,
    forRead,
  );
  const res = await engine.queryExecutor.executeOnPartition(
    partitionId,
    sql,
    params,
    forRead,
    true,
    false,
    execOptions,
  );
  if (!res || res.success !== true) {
    throwTxPartitionFailure(partitionId, res);
  }
  return res;
}

function renderWhereClause(whereAst, params) {
  if (!whereAst) return {whereSql: '', whereParams: []};
  const rendered = renderExpressionWithParameters(
    whereAst,
    (paramNode) => params?.[paramNode.index],
  );
  return {whereSql: ` WHERE ${rendered.sql}`, whereParams: rendered.params};
}

async function readMatchingBaseRowsViaTx(
  engine,
  basePartitionId,
  tableName,
  whereAst,
  params,
  writeExecutionOptions,
) {
  const {whereSql, whereParams} = renderWhereClause(whereAst, params);
  const sql = `SELECT * FROM ${renderSqliteIdentifier(tableName)}${whereSql}`;
  const res = await executeTxPartitionSql(
    engine,
    basePartitionId,
    sql,
    whereParams,
    true,
    writeExecutionOptions,
    tableName,
  );
  return Array.isArray(res.rows) ? res.rows : [];
}

function buildPkTuplePredicate(pkCols, pkRecord) {
  const parts = pkCols.map((col) => `${renderSqliteIdentifier(col)} = ?`);
  return {
    clause: pkCols.length > 1 ? `(${parts.join(LOCAL_STR_SQL_AND)})` : parts[0],
    values: pkCols.map((col) => pkRecord[col]),
  };
}

async function readRowsByPksViaTx(
  engine,
  basePartitionId,
  tableName,
  pkCols,
  pkRecords,
  writeExecutionOptions,
) {
  if (!Array.isArray(pkRecords) || pkRecords.length === 0) return [];
  const clauses = [];
  const params = [];
  for (const pkRecord of pkRecords) {
    const tuple = buildPkTuplePredicate(pkCols, pkRecord);
    clauses.push(tuple.clause);
    params.push(...tuple.values);
  }
  const sql = `SELECT * FROM ${renderSqliteIdentifier(tableName)} WHERE ${clauses.join(LOCAL_STR_SQL_OR)}`;
  const res = await executeTxPartitionSql(
    engine,
    basePartitionId,
    sql,
    params,
    true,
    writeExecutionOptions,
    tableName,
  );
  return Array.isArray(res.rows) ? res.rows : [];
}

function readColumnsFromMetadata(tableRecord) {
  const cols = tableRecord?.schema?.columns;
  return Array.isArray(cols) ? cols.map((col) => col.name) : null;
}

function resolveInsertColumnNames(partAst, engine, tableName) {
  if (Array.isArray(partAst.columns) && partAst.columns.length > 0) {
    return partAst.columns;
  }
  const fromEngine = readColumnsFromMetadata(engine.getTableInfo?.(tableName));
  if (fromEngine) return fromEngine;
  throw new Error(`Unable to resolve column list for INSERT into '${tableName}'`);
}

async function evaluateInsertExprForTx(
  engine,
  basePartitionId,
  tableName,
  expr,
  params,
  writeExecutionOptions,
) {
  if (!expr) return null;
  if (expr.type === EXPR_TYPE.LITERAL) return expr.value;
  if (expr.type === EXPR_TYPE.PARAMETER) return params?.[expr.index];
  if (expr.type === EXPR_TYPE.UNARY && expr.operator === LOCAL_STR_MINUS) {
    const inner = await evaluateInsertExprForTx(
      engine,
      basePartitionId,
      tableName,
      expr.operand,
      params,
      writeExecutionOptions,
    );
    return typeof inner === 'number' ? -inner : inner;
  }
  const rendered = renderExpressionWithParameters(
    expr,
    (paramNode) => params?.[paramNode.index],
  );
  const res = await executeTxPartitionSql(
    engine,
    basePartitionId,
    `SELECT ${rendered.sql} AS val`,
    rendered.params,
    true,
    writeExecutionOptions,
    tableName,
  );
  return res.rows?.[0]?.val ?? null;
}

async function extractInsertPkRecordsForTx({
  engine,
  tableName,
  basePartitionId,
  partAst,
  params,
  pkCols,
  writeExecutionOptions,
}) {
  const colNames = resolveInsertColumnNames(
    partAst,
    engine,
    tableName,
  );
  const pkRecords = [];
  for (const rowExprs of partAst.values || []) {
    const pkRecord = {};
    for (const pkCol of pkCols) {
      const idx = colNames.findIndex((c) => c.toLowerCase() === pkCol.toLowerCase());
      pkRecord[pkCol] = idx >= 0 ?
        await evaluateInsertExprForTx(
          engine,
          basePartitionId,
          tableName,
          rowExprs[idx],
          params,
          writeExecutionOptions,
        ) :
        null;
    }
    pkRecords.push(pkRecord);
  }
  return pkRecords;
}

async function captureBeforeRowsViaTx(engine, coordinator, context) {
  const {statementType, tableName, writePlan, basePartitionIds, basePrimaryKeyColumns,
    params, txOptions} = context;
  const beforeRowsByPartition = new Map();
  const isUpdateOrDelete =
    statementType === QUERY_AST_TYPE.UPDATE || statementType === QUERY_AST_TYPE.DELETE;
  const isReplaceInsert =
    statementType === QUERY_AST_TYPE.INSERT && writePlan.ast?.orReplace === true;

  if (!isUpdateOrDelete && !isReplaceInsert) {
    return beforeRowsByPartition;
  }

  for (const basePartitionId of basePartitionIds) {
    if (isUpdateOrDelete) {
      beforeRowsByPartition.set(
        basePartitionId,
        await readMatchingBaseRowsViaTx(
          engine,
          basePartitionId,
          tableName,
          writePlan.ast?.where,
          params,
          txOptions,
        ),
      );
      continue;
    }
    const partStmt = writePlan.partitionStatements.get(basePartitionId);
    const pkRecords = await extractInsertPkRecordsForTx({
      engine,
      coordinator,
      tableName,
      basePartitionId,
      partAst: partStmt.ast,
      params,
      pkCols: basePrimaryKeyColumns,
      writeExecutionOptions: txOptions,
    });
    beforeRowsByPartition.set(
      basePartitionId,
      await readRowsByPksViaTx(
        engine,
        basePartitionId,
        tableName,
        basePrimaryKeyColumns,
        pkRecords,
        txOptions,
      ),
    );
  }
  return beforeRowsByPartition;
}

function appendPlanOutput(sourcePlan, allOperations, enlistedSet) {
  for (const op of sourcePlan.operations) {
    allOperations.push(op);
  }
  for (const pId of sourcePlan.enlistedIndexPartitions) {
    enlistedSet.add(pId);
  }
}

function buildPkKey(row, pkCols) {
  return JSON.stringify(pkCols.map((col) => row[col]));
}

async function planInsertMaintenanceViaTx(engine, coordinator, ctx, allOps, enlistedSet) {
  const {tableName, basePartitionId, partStmt, beforeRows, basePrimaryKeyColumns, params,
    txOptions} = ctx;
  const pkRecords = await extractInsertPkRecordsForTx({
    engine,
    coordinator,
    tableName,
    basePartitionId,
    partAst: partStmt.ast,
    params,
    pkCols: basePrimaryKeyColumns,
    writeExecutionOptions: txOptions,
  });
  const afterRows = await readRowsByPksViaTx(
    engine,
    basePartitionId,
    tableName,
    basePrimaryKeyColumns,
    pkRecords,
    txOptions,
  );
  const beforeByPk = new Map(
    beforeRows.map((row) => [buildPkKey(row, basePrimaryKeyColumns), row]),
  );
  const replacedBefore = [];
  const replacedAfter = [];
  const freshInserts = [];
  for (const afterRow of afterRows) {
    const priorRow = beforeByPk.get(buildPkKey(afterRow, basePrimaryKeyColumns));
    if (priorRow) {
      replacedBefore.push(priorRow);
      replacedAfter.push(afterRow);
    } else {
      freshInserts.push(afterRow);
    }
  }
  if (replacedBefore.length > 0) {
    appendPlanOutput(planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
      statementType: QUERY_AST_TYPE.UPDATE,
      tableName,
      basePartitionId,
      beforeRows: replacedBefore,
      afterRows: replacedAfter,
      basePrimaryKeyColumns,
    }), allOps, enlistedSet);
  }
  if (freshInserts.length > 0) {
    appendPlanOutput(planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
      statementType: QUERY_AST_TYPE.INSERT,
      tableName,
      basePartitionId,
      afterRows: freshInserts,
      basePrimaryKeyColumns,
    }), allOps, enlistedSet);
  }
}

async function planUpdateMaintenanceViaTx(engine, coordinator, ctx, allOps, enlistedSet) {
  const {tableName, basePartitionId, beforeRows, basePrimaryKeyColumns, txOptions} = ctx;
  if (beforeRows.length === 0) return;
  const afterRows = await readRowsByPksViaTx(
    engine,
    basePartitionId,
    tableName,
    basePrimaryKeyColumns,
    beforeRows,
    txOptions,
  );
  appendPlanOutput(planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
    statementType: QUERY_AST_TYPE.UPDATE,
    tableName,
    basePartitionId,
    beforeRows,
    afterRows,
    basePrimaryKeyColumns,
  }), allOps, enlistedSet);
}

function planDeleteMaintenanceViaTx(coordinator, ctx, allOps, enlistedSet) {
  const {tableName, basePartitionId, beforeRows, basePrimaryKeyColumns} = ctx;
  if (beforeRows.length === 0) return;
  appendPlanOutput(planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
    statementType: QUERY_AST_TYPE.DELETE,
    tableName,
    basePartitionId,
    beforeRows,
    basePrimaryKeyColumns,
  }), allOps, enlistedSet);
}

async function planAllIndexOperationsViaTx(engine, coordinator, context) {
  const allOperations = [];
  const enlistedSet = new Set();
  const {statementType, tableName, writePlan, basePartitionIds, basePrimaryKeyColumns,
    params, txOptions, beforeRowsByPartition} = context;

  for (const basePartitionId of basePartitionIds) {
    const beforeRows = beforeRowsByPartition.get(basePartitionId) || [];
    const partCtx = {
      tableName,
      basePartitionId,
      partStmt: writePlan.partitionStatements.get(basePartitionId),
      beforeRows,
      basePrimaryKeyColumns,
      params,
      txOptions,
    };
    if (statementType === QUERY_AST_TYPE.INSERT) {
      await planInsertMaintenanceViaTx(engine, coordinator, partCtx, allOperations, enlistedSet);
    } else if (statementType === QUERY_AST_TYPE.UPDATE) {
      await planUpdateMaintenanceViaTx(engine, coordinator, partCtx, allOperations, enlistedSet);
    } else if (statementType === QUERY_AST_TYPE.DELETE) {
      planDeleteMaintenanceViaTx(coordinator, partCtx, allOperations, enlistedSet);
    }
  }
  return {allOperations, enlistedIndexPartitions: Array.from(enlistedSet)};
}

async function enlistAndStageIndexOperationsViaTx(
  engine,
  enlistedIndexPartitions,
  allOperations,
  executionSessionId,
  txOptions,
) {
  if (enlistedIndexPartitions.length > 0) {
    const enlistResult = await engine.transactionCoordinator.enlistParticipantsOwned(
      executionSessionId,
      enlistedIndexPartitions,
    );
    if (!enlistResult || enlistResult.success !== true) {
      throw createUnavailableError(
        enlistedIndexPartitions.join(LOCAL_STR_COMMA),
        enlistResult?.error || LOCAL_STR_ENLIST_FAILED,
      );
    }
  }
  for (const op of allOperations) {
    await executeTxPartitionSql(
      engine,
      op.indexPartitionId,
      op.sql,
      op.params,
      false,
      txOptions,
      op.datasetName,
    );
  }
}

export {
  applyGlobalIndexWriteViaTx,
};

async function applyGlobalIndexWriteViaTx(engine, coordinator, context) {
  const {statement, writePlan, params, writeExecutionOptions, executionSessionId,
    transactionIdentity, basePartitionIds, basePrimaryKeyColumns, baseExecuteFn} = context;
  const txOptions = {
    ...writeExecutionOptions,
    sessionId: executionSessionId,
    transactionIdentity,
  };
  const beforeRowsByPartition = await captureBeforeRowsViaTx(engine, coordinator, {
    statementType: statement.statementType,
    tableName: statement.tableName,
    writePlan,
    basePartitionIds,
    basePrimaryKeyColumns,
    params,
    txOptions,
  });

  const result = await baseExecuteFn();
  if (result?.success !== true) {
    return {result, enlistedIndexPartitions: []};
  }

  const {allOperations, enlistedIndexPartitions} = await planAllIndexOperationsViaTx(
    engine,
    coordinator,
    {
      statementType: statement.statementType,
      tableName: statement.tableName,
      writePlan,
      basePartitionIds,
      beforeRowsByPartition,
      basePrimaryKeyColumns,
      params,
      txOptions,
    },
  );
  await enlistAndStageIndexOperationsViaTx(
    engine,
    enlistedIndexPartitions,
    allOperations,
    executionSessionId,
    txOptions,
  );
  return {result, enlistedIndexPartitions};
}
