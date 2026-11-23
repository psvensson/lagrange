/**
 * SQLQueryEngine Global Secondary Index integration helpers.
 * Bridges SQL DML (INSERT, UPDATE, DELETE) and SELECT execution to
 * IndexService / GlobalIndexLifecycleCoordinator when global secondary indexes
 * exist on the target table.
 */

import {EXPR_TYPE} from './parser-constants.js';
import {QUERY_AST_TYPE, QUERY_OPERATION} from './query-constants.js';
import {renderSqliteIdentifier} from './sqlite-identifier.js';
import {renderExpressionWithParameters} from './sql-statement-renderer.js';
import {
  GLOBAL_INDEX_ACCESS_PATH,
  GLOBAL_INDEX_ERROR_CODE,
  GLOBAL_INDEX_ERROR_MSG,
} from '../index-management/index-constants.js';
import {
  maintainsOnWrite,
} from '../index-management/global-index-catalog-contract.js';
import {
  planGlobalIndexWriteOperations,
} from '../index-management/global-index-lifecycle-coordinator.js';
import {
  applyGlobalIndexWriteViaTx,
} from './sql-query-engine-global-index-tx1.js';
import {
  applyAstLimit,
  applyAstOrderBy,
  extractSimpleSelectProjection,
  hasUnsupportedSelectClauses,
  isSupportedGsiWhereAst,
  isSupportedOrderByAst,
  projectOutputRows,
} from './sql-query-engine-global-index-select.js';

const LOCAL_STR_ID = 'id';
const LOCAL_STR_MIRROR = 'mirror';
const LOCAL_STR_MINUS = '-';
const LOCAL_STR_SQL_AND = ' AND ';
const LOCAL_STR_SQL_BEGIN = 'BEGIN IMMEDIATE';
const NS_PER_MS = 1e6;

function findTableGlobalIndexes(indexService, tableName) {
  if (!indexService || !tableName) {
    return [];
  }
  if (indexService.syncGlobalIndexesFromCache) {
    indexService.syncGlobalIndexesFromCache();
  }
  if (indexService.globalIndexCoordinator) {
    return indexService.globalIndexCoordinator.getIndexesForTable(tableName);
  }
  const cached = indexService.getIndicesForTable ?
    indexService.getIndicesForTable(tableName) :
    [];
  return cached.filter((idx) => Boolean(idx?.isGlobal || idx?.global));
}

function hasActiveGlobalIndexes(indexService, tableName) {
  const indexes = findTableGlobalIndexes(indexService, tableName);
  return indexes.some((idx) => maintainsOnWrite(idx.state));
}

function createUnavailableParticipantError(partitionId) {
  const error = new Error(`Index participant database unavailable: ${partitionId}`);
  error.code = GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE;
  return error;
}

function resolveBasePartitionIds(writePlan) {
  const ids = [];
  for (const [partitionId, entry] of writePlan.partitionStatements.entries()) {
    if (entry.role !== LOCAL_STR_MIRROR) {
      ids.push(partitionId);
    }
  }
  return ids;
}

function rollbackTransactionHandles(coordinator, handles) {
  const startedDbs = handles.filter((h) => h.started).map((h) => h.db);
  coordinator._rollbackTransactions(startedDbs);
}

function commitTransactionHandles(coordinator, handles) {
  const startedDbs = handles.filter((h) => h.started).map((h) => h.db);
  coordinator._commitTransactions(startedDbs);
}

function beginPartitionTransactions(coordinator, partitionIds, openDbSet) {
  const handles = [];
  try {
    for (const partitionId of partitionIds) {
      const db = coordinator._getPartitionDb(partitionId);
      if (!db || !db.exec || !db.prepare) {
        throw createUnavailableParticipantError(partitionId);
      }
      if (openDbSet.has(db)) continue;
      openDbSet.add(db);
      const started = !db.inTransaction;
      if (started) {
        db.exec(LOCAL_STR_SQL_BEGIN);
      }
      handles.push({db, started});
    }
    return handles;
  } catch (err) {
    rollbackTransactionHandles(coordinator, handles);
    throw err;
  }
}

function renderWhereWithBoundParams(whereAst, params) {
  if (!whereAst) {
    return {whereSql: '', whereParams: []};
  }
  const rendered = renderExpressionWithParameters(
    whereAst,
    (paramNode) => params?.[paramNode.index],
  );
  return {
    whereSql: ` WHERE ${rendered.sql}`,
    whereParams: rendered.params,
  };
}

function readMatchingBaseRows(db, tableName, whereAst, params) {
  const {whereSql, whereParams} = renderWhereWithBoundParams(whereAst, params);
  const sql = `SELECT * FROM ${renderSqliteIdentifier(tableName)}${whereSql}`;
  return db.prepare(sql).all(...whereParams);
}

function buildPkKey(row, pkCols) {
  return JSON.stringify(pkCols.map((col) => row[col]));
}

function readBaseRowByPk(db, tableName, pkCols, pkRow) {
  const whereClause = pkCols
    .map((col) => `${renderSqliteIdentifier(col)} = ?`)
    .join(LOCAL_STR_SQL_AND);
  const sql = `SELECT * FROM ${renderSqliteIdentifier(tableName)} WHERE ${whereClause}`;
  const vals = pkCols.map((col) => pkRow[col]);
  return db.prepare(sql).get(...vals) || null;
}

function readRowsByPks(db, tableName, pkCols, pkRows) {
  const rows = [];
  for (const pkRow of pkRows) {
    const found = readBaseRowByPk(db, tableName, pkCols, pkRow);
    if (found) rows.push(found);
  }
  return rows;
}

function resolveInsertColumnNames(partAst, db, tableName) {
  if (Array.isArray(partAst.columns) && partAst.columns.length > 0) {
    return partAst.columns;
  }
  const tableCols = db.prepare(`PRAGMA table_info(${renderSqliteIdentifier(tableName)})`).all();
  return tableCols.map((col) => col.name);
}

function evaluateInsertExpression(db, expr, params) {
  if (!expr) return null;
  if (expr.type === EXPR_TYPE.LITERAL) return expr.value;
  if (expr.type === EXPR_TYPE.PARAMETER) return params?.[expr.index];
  if (expr.type === EXPR_TYPE.UNARY && expr.operator === LOCAL_STR_MINUS) {
    const inner = evaluateInsertExpression(db, expr.operand, params);
    return typeof inner === 'number' ? -inner : inner;
  }
  const rendered = renderExpressionWithParameters(
    expr,
    (paramNode) => params?.[paramNode.index],
  );
  const row = db.prepare(`SELECT ${rendered.sql} AS val`).get(...rendered.params);
  return row ? row.val : null;
}

function extractInsertPkRecords(db, tableName, partAst, params, pkCols) {
  const colNames = resolveInsertColumnNames(partAst, db, tableName);
  const pkRecords = [];
  for (const rowExprs of partAst.values || []) {
    const pkRecord = {};
    for (const pkCol of pkCols) {
      const idx = colNames.findIndex((c) => c.toLowerCase() === pkCol.toLowerCase());
      pkRecord[pkCol] = idx >= 0 ? evaluateInsertExpression(db, rowExprs[idx], params) : null;
    }
    pkRecords.push(pkRecord);
  }
  return pkRecords;
}

function captureBeforeRowsByPartition(
  coordinator,
  {statementType, tableName, writePlan, basePartitionIds, basePrimaryKeyColumns, params},
) {
  const beforeRowsByPartition = new Map();
  const isUpdateOrDelete =
    statementType === QUERY_AST_TYPE.UPDATE || statementType === QUERY_AST_TYPE.DELETE;
  const isReplaceInsert =
    statementType === QUERY_AST_TYPE.INSERT && writePlan.ast?.orReplace === true;

  if (!isUpdateOrDelete && !isReplaceInsert) {
    return beforeRowsByPartition;
  }

  for (const basePartitionId of basePartitionIds) {
    const db = coordinator._getPartitionDb(basePartitionId);
    if (isUpdateOrDelete) {
      beforeRowsByPartition.set(
        basePartitionId,
        readMatchingBaseRows(db, tableName, writePlan.ast?.where, params),
      );
      continue;
    }
    const partStmt = writePlan.partitionStatements.get(basePartitionId);
    const pkRecords = extractInsertPkRecords(
      db,
      tableName,
      partStmt.ast,
      params,
      basePrimaryKeyColumns,
    );
    beforeRowsByPartition.set(
      basePartitionId,
      readRowsByPks(db, tableName, basePrimaryKeyColumns, pkRecords),
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

function planInsertMaintenanceForPartition({
  coordinator,
  db,
  tableName,
  basePartitionId,
  partStmt,
  beforeRows,
  basePrimaryKeyColumns,
  params,
  allOperations,
  enlistedSet,
}) {
  const pkRecords = extractInsertPkRecords(
    db,
    tableName,
    partStmt.ast,
    params,
    basePrimaryKeyColumns,
  );
  const afterRows = readRowsByPks(db, tableName, basePrimaryKeyColumns, pkRecords);
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
    const updatePlan = planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
      statementType: QUERY_AST_TYPE.UPDATE,
      tableName,
      basePartitionId,
      beforeRows: replacedBefore,
      afterRows: replacedAfter,
      basePrimaryKeyColumns,
    });
    appendPlanOutput(updatePlan, allOperations, enlistedSet);
  }
  if (freshInserts.length > 0) {
    const insertPlan = planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
      statementType: QUERY_AST_TYPE.INSERT,
      tableName,
      basePartitionId,
      afterRows: freshInserts,
      basePrimaryKeyColumns,
    });
    appendPlanOutput(insertPlan, allOperations, enlistedSet);
  }
}

function planUpdateMaintenanceForPartition({
  coordinator,
  db,
  tableName,
  basePartitionId,
  beforeRows,
  basePrimaryKeyColumns,
  allOperations,
  enlistedSet,
}) {
  if (beforeRows.length === 0) return;
  const afterRows = readRowsByPks(db, tableName, basePrimaryKeyColumns, beforeRows);
  const plan = planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
    statementType: QUERY_AST_TYPE.UPDATE,
    tableName,
    basePartitionId,
    beforeRows,
    afterRows,
    basePrimaryKeyColumns,
  });
  appendPlanOutput(plan, allOperations, enlistedSet);
}

function planDeleteMaintenanceForPartition({
  coordinator,
  tableName,
  basePartitionId,
  beforeRows,
  basePrimaryKeyColumns,
  allOperations,
  enlistedSet,
}) {
  if (beforeRows.length === 0) return;
  const plan = planGlobalIndexWriteOperations(coordinator.writeMaintenance, {
    statementType: QUERY_AST_TYPE.DELETE,
    tableName,
    basePartitionId,
    beforeRows,
    basePrimaryKeyColumns,
  });
  appendPlanOutput(plan, allOperations, enlistedSet);
}

function planAllIndexOperations(coordinator, context) {
  const allOperations = [];
  const enlistedSet = new Set();
  const {statementType, tableName, writePlan, basePartitionIds, basePrimaryKeyColumns, params} =
    context;

  for (const basePartitionId of basePartitionIds) {
    const db = coordinator._getPartitionDb(basePartitionId);
    const beforeRows = context.beforeRowsByPartition.get(basePartitionId) || [];
    if (statementType === QUERY_AST_TYPE.INSERT) {
      planInsertMaintenanceForPartition({
        coordinator,
        db,
        tableName,
        basePartitionId,
        partStmt: writePlan.partitionStatements.get(basePartitionId),
        beforeRows,
        basePrimaryKeyColumns,
        params,
        allOperations,
        enlistedSet,
      });
    } else if (statementType === QUERY_AST_TYPE.UPDATE) {
      planUpdateMaintenanceForPartition({
        coordinator,
        db,
        tableName,
        basePartitionId,
        beforeRows,
        basePrimaryKeyColumns,
        allOperations,
        enlistedSet,
      });
    } else if (statementType === QUERY_AST_TYPE.DELETE) {
      planDeleteMaintenanceForPartition({
        coordinator,
        tableName,
        basePartitionId,
        beforeRows,
        basePrimaryKeyColumns,
        allOperations,
        enlistedSet,
      });
    }
  }
  return {allOperations, enlistedIndexPartitions: Array.from(enlistedSet)};
}

async function executeDirectLocalGlobalIndexWrite({
  coordinator,
  statement,
  writePlan,
  params,
  basePartitionIds,
  basePrimaryKeyColumns,
  activeIndexCount,
  startTimeNs,
  baseExecuteFn,
}) {
  const tableName = statement.tableName;
  const openDbSet = new Set();
  const txHandles = beginPartitionTransactions(coordinator, basePartitionIds, openDbSet);
  try {
    const beforeRowsByPartition = captureBeforeRowsByPartition(coordinator, {
      statementType: statement.statementType,
      tableName,
      writePlan,
      basePartitionIds,
      basePrimaryKeyColumns,
      params,
    });

    const result = await baseExecuteFn();
    if (result?.success !== true) {
      rollbackTransactionHandles(coordinator, txHandles);
      return result;
    }

    const {allOperations, enlistedIndexPartitions} = planAllIndexOperations(coordinator, {
      statementType: statement.statementType,
      tableName,
      writePlan,
      basePartitionIds,
      beforeRowsByPartition,
      basePrimaryKeyColumns,
      params,
    });

    const indexHandles = beginPartitionTransactions(
      coordinator,
      enlistedIndexPartitions,
      openDbSet,
    );
    txHandles.push(...indexHandles);

    coordinator._executeOperations(allOperations);
    commitTransactionHandles(coordinator, txHandles);

    const allParticipants = new Set([...basePartitionIds, ...enlistedIndexPartitions]);
    const latencyMs = Number(process.hrtime.bigint() - startTimeNs) / NS_PER_MS;
    coordinator._recordWriteMetric(
      tableName,
      activeIndexCount,
      allParticipants.size,
      latencyMs,
    );
    return result;
  } catch (err) {
    rollbackTransactionHandles(coordinator, txHandles);
    throw err;
  }
}

function resolveGlobalIndexWriteSchemaPks(coordinator, tableName) {
  const schemaInfo = coordinator.resolveTableSchema?.(tableName) || null;
  if (schemaInfo?.basePrimaryKeyColumns?.length > 0) {
    return schemaInfo.basePrimaryKeyColumns;
  }
  return [LOCAL_STR_ID];
}

/**
 * Execute a distributed write statement with synchronous global index
 * maintenance when active global indexes exist on the target table.
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Object} context - Write execution context.
 * @return {Promise<Object>} Aggregated write result.
 */
async function executeEngineWriteWithGlobalIndexes(engine, context) {
  const {statement, writePlan, params, writeExecutionOptions, executionSessionId,
    transactionIdentity} = context;
  const baseExecuteFn = () => engine.distributedWriteCoordinator.executePlan(
    writePlan,
    params,
    {...writeExecutionOptions, sessionId: executionSessionId, transactionIdentity},
  );
  const tableName = statement.tableName;
  if (findTableGlobalIndexes(engine.indexService, tableName).length === 0) {
    return baseExecuteFn();
  }

  const coordinator = engine.indexService.getGlobalIndexCoordinator();
  if (coordinator.refreshCatalogPartitions) {
    await coordinator.refreshCatalogPartitions();
  }
  const activeIndexes = coordinator.writeMaintenance.getActiveIndexesForTable(tableName);
  if (activeIndexes.length === 0) {
    return baseExecuteFn();
  }

  const startTimeNs = process.hrtime.bigint();
  const basePartitionIds = resolveBasePartitionIds(writePlan);
  const basePrimaryKeyColumns = resolveGlobalIndexWriteSchemaPks(coordinator, tableName);

  if (!transactionIdentity) {
    if (engine.queryExecutor) {
      return {
        success: false,
        error: GLOBAL_INDEX_ERROR_MSG.DISTRIBUTED_TX_IDENTITY_UNAVAILABLE,
        errorCode: GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
      };
    }
    return executeDirectLocalGlobalIndexWrite({
      coordinator,
      statement,
      writePlan,
      params,
      basePartitionIds,
      basePrimaryKeyColumns,
      activeIndexCount: activeIndexes.length,
      startTimeNs,
      baseExecuteFn,
    });
  }

  const outcome = await applyGlobalIndexWriteViaTx(engine, coordinator, {
    statement,
    writePlan,
    params,
    writeExecutionOptions,
    executionSessionId,
    transactionIdentity,
    basePartitionIds,
    basePrimaryKeyColumns,
    baseExecuteFn,
  });
  if (outcome.result?.success === true) {
    const allParticipants = new Set([
      ...basePartitionIds,
      ...outcome.enlistedIndexPartitions,
    ]);
    const latencyMs = Number(process.hrtime.bigint() - startTimeNs) / NS_PER_MS;
    coordinator._recordWriteMetric(
      tableName,
      activeIndexes.length,
      allParticipants.size,
      latencyMs,
    );
  }
  return outcome.result;
}

function isSelectGsiCandidateAst(engine, ast, transactionRead) {
  if (!engine.indexService || !ast?.from?.name || engine.isSystemTable(ast.from.name)) {
    return false;
  }
  if (transactionRead || hasUnsupportedSelectClauses(ast)) {
    return false;
  }
  return !(engine.queryExecutor && engine.queryExecutor.hasAggregates(ast));
}

function resolveTablePartitionKey(tableInfo) {
  if (!tableInfo) return null;
  if (tableInfo.partition_key !== undefined) return tableInfo.partition_key;
  if (tableInfo.partitionKey !== undefined) return tableInfo.partitionKey;
  return null;
}

/**
 * Attempt to plan and execute a SELECT query via an active Global Secondary Index.
 * Returns null if the query is ineligible, `{handled: false, globalIndexPlan}` if
 * scatter-gather fallback should execute, or `{handled: true, result}` if GSI executed.
 * @param {Object} engine - SQLQueryEngine instance.
 * @param {Object} ast - Parsed SELECT AST.
 * @param {Array} params - Bound parameters.
 * @param {Object} [context={}] - Read context ({transactionRead}).
 * @return {Promise<Object|null>}
 */
async function tryExecuteGlobalIndexSelect(engine, ast, params, context = {}) {
  if (!isSelectGsiCandidateAst(engine, ast, context.transactionRead)) {
    return null;
  }
  const tableName = ast.from.name;
  if (findTableGlobalIndexes(engine.indexService, tableName).length === 0) {
    return null;
  }
  const projection = extractSimpleSelectProjection(ast);
  if (!projection || !isSupportedGsiWhereAst(ast.where, ast.from) ||
      !isSupportedOrderByAst(ast.orderBy, ast.from)) {
    return null;
  }

  const planStartMs = Date.now();
  const coordinator = engine.indexService.getGlobalIndexCoordinator();
  if (coordinator.refreshCatalogPartitions) {
    await coordinator.refreshCatalogPartitions();
  }
  const schemaInfo = coordinator.resolveTableSchema ?
    coordinator.resolveTableSchema(tableName) :
    null;
  const tableInfo = engine.getTableInfo ? engine.getTableInfo(tableName) : null;
  const basePartitionKey = resolveTablePartitionKey(tableInfo);

  const plan = coordinator.readRouter.planAccessPath({
    tableName,
    whereClause: ast.where,
    projectedColumns: projection.fetchColumns,
    basePartitionKey,
    params,
    basePrimaryKeyColumns: schemaInfo?.basePrimaryKeyColumns,
  });
  const planningDurationMs = Date.now() - planStartMs;

  if (plan.accessPath !== GLOBAL_INDEX_ACCESS_PATH.GLOBAL_SECONDARY_INDEX) {
    return {handled: false, globalIndexPlan: plan};
  }

  const execStartMs = Date.now();
  const rawRows = await coordinator.readRouter.executeTwoStageIndexQuery(
    {
      tableName,
      whereClause: ast.where,
      projectedColumns: projection.fetchColumns,
      params,
    },
    plan,
  );
  const sortedRows = applyAstOrderBy(rawRows, ast.orderBy);
  const limitedRows = applyAstLimit(sortedRows, ast.limit, params);
  const rows = projectOutputRows(limitedRows, projection);
  const executionDurationMs = Date.now() - execStartMs;

  const partitions = Array.from(new Set([...plan.indexPartitions, ...plan.basePartitions]));
  return {
    handled: true,
    result: {
      success: true,
      operation: QUERY_OPERATION.SELECT,
      rows,
      rowCount: rows.length,
      count: rows.length,
      partitions,
      tableName,
      dualWriteMode: false,
      distributedPlan: null,
      distributedDiagnostics: {globalIndexAccess: plan},
      globalIndexPlan: plan,
      distributedMetrics: {
        planningDurationMs,
        executionDurationMs,
        fanout: plan.indexPartitions.length,
        mergeDurationMs: 0,
      },
    },
  };
}

async function executeSelectWithGlobalIndexSupport(
  engine,
  {ast, params, sessionId, queryOptions, transactionRead},
  executeStandardSelect,
) {
  const outcome = await tryExecuteGlobalIndexSelect(engine, ast, params, {transactionRead});
  if (outcome?.handled) {
    const gsiResult = outcome.result;
    await engine.finalizeSelectSuccess(
      ast,
      sessionId,
      queryOptions,
      transactionRead,
      gsiResult,
      gsiResult.partitions,
      params,
    );
    return gsiResult;
  }
  const envelope = await executeStandardSelect();
  const plan = outcome?.globalIndexPlan;
  if (!plan || !envelope || envelope.settled || !envelope.distributedDiagnostics) {
    return envelope;
  }
  return {
    ...envelope,
    globalIndexPlan: plan,
    distributedDiagnostics: {
      ...envelope.distributedDiagnostics,
      globalIndexAccess: plan,
    },
  };
}

export {
  executeEngineWriteWithGlobalIndexes,
  executeSelectWithGlobalIndexSupport,
  hasActiveGlobalIndexes,
};
