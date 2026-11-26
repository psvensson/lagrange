/**
 * Production runtime wiring for Global Secondary Index lifecycle coordination.
 * Connects IndexService to durable TABLES.INDICES catalog persistence/hydration,
 * SQLite backfill operations, and Stage 1 / Stage 2 / scatter-gather read routing.
 */

import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  GLOBAL_INDEX_STATE,
  normalizeGlobalIndexRecord,
} from './global-index-catalog-contract.js';
import {
  generateDropIndexDatasetSql,
  getGlobalIndexDatasetName,
} from './global-index-dataset-manager.js';
import {
  ensureIndexDatasetTableInGateway,
  hasHostedPartitionReplica,
  readAuthoritativeGlobalIndexRow,
  verifyGlobalIndexCatalogOwnership,
} from './global-index-dataset-reconciliation.js';
import {
  executePartitionReadSql,
  executePartitionWriteSql,
  hasDistributedPartitionRoute,
  provisionIndexPartitionsWithRuntime,
  reconcileDistributedIndexDatasetSchema,
  syncGlobalIndexesFromSystemCache,
} from './global-index-distributed-execution.js';
import {
  createUnavailableError,
  discoverPartitionsForTargets,
  ensureRuntimeState,
  extractPartitionIdFromRow,
  extractTableNameFromRow,
  preloadProductionPartitionMetadata,
  quoteIdentifier,
  resolveTableSchemaMetadata,
} from './global-index-partition-discovery.js';
import {extractPredicateConditions} from './global-index-read-router.js';
import {buildIndexInsertSql} from './global-index-write-maintenance.js';
import {
  GLOBAL_INDEX_ERROR_CODE,
  GLOBAL_INDEX_STATEMENT_LABEL,
  INDEX_TYPE,
} from './index-constants.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_AND = ' AND ';
const LOCAL_STR_OR = ' OR ';
const LOCAL_STR_STAR = '*';
const LOCAL_STR_DESC = 'DESC';
const LOCAL_STR_ASC = 'ASC';
const LOCAL_STR_PARAM_PLACEHOLDER = '?';
const LOCAL_STR_BETWEEN = 'BETWEEN';
const LOCAL_STR_IS = 'IS';
const GENERATION_SUFFIX_REGEX = /-gen(\d+)$/u;
const NUMERIC_TYPE_REGEX = /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL)\b/iu;
const NUMERIC_VALUE_REGEX = /^-?\d+(?:\.\d+)?$/u;

const SQL_WHERE_PREFIX = 'WHERE ';

function coerceCursorScalar(value, colType) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' &&
      colType &&
      NUMERIC_TYPE_REGEX.test(colType) &&
      NUMERIC_VALUE_REGEX.test(value)) {
    return Number(value);
  }
  return value;
}

function buildCursorComparisonSql(pkColumns, cursorPk, columnTypes) {
  if (cursorPk === null || cursorPk === undefined) {
    return {whereSql: '', params: []};
  }
  if (pkColumns.length === 1) {
    const pkCol = pkColumns[0];
    const coerced = coerceCursorScalar(cursorPk, columnTypes[pkCol]);
    return {
      whereSql: `WHERE ${quoteIdentifier(pkCol)} > ?`,
      params: [coerced],
    };
  }
  const cursorValues = Array.isArray(cursorPk) ? cursorPk : [cursorPk];
  const branches = [];
  const params = [];
  for (let i = 0; i < pkColumns.length; i++) {
    const parts = [];
    for (let j = 0; j < i; j++) {
      parts.push(`${quoteIdentifier(pkColumns[j])} = ?`);
      params.push(coerceCursorScalar(cursorValues[j], columnTypes[pkColumns[j]]));
    }
    parts.push(`${quoteIdentifier(pkColumns[i])} > ?`);
    params.push(coerceCursorScalar(cursorValues[i], columnTypes[pkColumns[i]]));
    branches.push(`(${parts.join(LOCAL_STR_AND)})`);
  }
  return {
    whereSql: `WHERE ${branches.join(LOCAL_STR_OR)}`,
    params,
  };
}

function buildWhereClauseFromConditions(conditions, allowedColumns = null) {
  if (!conditions || conditions.size === 0) {
    return {whereSql: '', params: []};
  }
  const clauses = [];
  const params = [];
  for (const cond of conditions.values()) {
    if (allowedColumns && !allowedColumns.has(cond.column.toLowerCase())) {
      continue;
    }
    const op = cond.operator;
    if (op === LOCAL_STR_BETWEEN && Array.isArray(cond.value)) {
      clauses.push(`${quoteIdentifier(cond.column)} BETWEEN ? AND ?`);
      params.push(cond.value[0], cond.value[1]);
    } else if (op === LOCAL_STR_IS && cond.value === null) {
      clauses.push(`${quoteIdentifier(cond.column)} IS NULL`);
    } else {
      clauses.push(`${quoteIdentifier(cond.column)} ${op} ${LOCAL_STR_PARAM_PLACEHOLDER}`);
      params.push(cond.value);
    }
  }
  if (clauses.length === 0) {
    return {whereSql: '', params: []};
  }
  return {
    whereSql: `WHERE ${clauses.join(LOCAL_STR_AND)}`,
    params,
  };
}

const DEFAULT_INDEX_TYPE = INDEX_TYPE.BTREE;
const DEFAULT_GLOBAL_STATE = GLOBAL_INDEX_STATE.CREATING;
const PERSIST_CATALOG_INSERT_WRITE_AUTHORITY_UNAVAILABLE_MSG =
  'System-table write authority is unavailable for persisting global index catalog metadata';
const PERSIST_CATALOG_UPDATE_WRITE_AUTHORITY_UNAVAILABLE_MSG =
  'System-table write authority is unavailable for updating global index catalog metadata';
const PERSIST_CATALOG_DELETE_WRITE_AUTHORITY_UNAVAILABLE_MSG =
  'System-table write authority is unavailable for deleting global index catalog metadata';
const CATALOG_UPDATE_INDEX_ID_REQUIRED_MSG =
  'Global index catalog update requires a non-empty indexId';
const CATALOG_DELETE_RECORD_REQUIRED_MSG =
  'Global index catalog delete requires a catalog record';

function serializeIndexColumnNames(record) {
  if (Array.isArray(record.column_names)) return JSON.stringify(record.column_names);
  if (typeof record.column_names === 'string') return record.column_names;
  return JSON.stringify(record.columnNames || []);
}

function toIndicesTableRow(record) {
  const createdAt = record.created_at !== undefined ? record.created_at : Date.now();
  const updatedAt = record.updated_at !== undefined ? record.updated_at : createdAt;
  const indexType = record.index_type !== undefined ? record.index_type : DEFAULT_INDEX_TYPE;
  const state = record.state !== undefined ? record.state : DEFAULT_GLOBAL_STATE;
  const isGlobal = record.is_global !== undefined ? Number(Boolean(record.is_global)) : 1;
  return {
    index_id: record.index_id,
    table_id: record.table_id,
    table_name: record.table_name || null,
    index_name: record.index_name,
    column_names: serializeIndexColumnNames(record),
    index_type: indexType,
    is_global: isGlobal,
    is_unique: record.is_unique ? 1 : 0,
    state,
    backfill_cursor_partition_id: record.backfill_cursor_partition_id ?? null,
    backfill_cursor_pk: record.backfill_cursor_pk ?? null,
    backfill_total_rows: Number(record.backfill_total_rows || 0),
    error_message: record.error_message ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function toIndicesUpdateData(update) {
  const data = {};
  if (update.state !== undefined) data.state = update.state;
  if (update.backfill_cursor_partition_id !== undefined) {
    data.backfill_cursor_partition_id = update.backfill_cursor_partition_id;
  } else if (update.cursorPartitionId !== undefined) {
    data.backfill_cursor_partition_id = update.cursorPartitionId;
  }
  if (update.backfill_cursor_pk !== undefined) {
    data.backfill_cursor_pk = update.backfill_cursor_pk;
  } else if (update.cursorPk !== undefined) {
    data.backfill_cursor_pk = update.cursorPk;
  }
  if (update.backfill_total_rows !== undefined) {
    data.backfill_total_rows = Number(update.backfill_total_rows);
  } else if (update.totalRows !== undefined) {
    data.backfill_total_rows = Number(update.totalRows);
  }
  if (update.error_message !== undefined) {
    data.error_message = update.error_message;
  } else if (update.errorMessage !== undefined) {
    data.error_message = update.errorMessage;
  }
  if (update.updated_at !== undefined) {
    data.updated_at = update.updated_at;
  } else if (update.updatedAt !== undefined) {
    data.updated_at = update.updatedAt;
  } else {
    data.updated_at = Date.now();
  }
  return data;
}

function parseGenerationFromIndexId(indexId) {
  if (typeof indexId !== 'string') return 1;
  const match = indexId.match(GENERATION_SUFFIX_REGEX);
  return match ? Number(match[1]) : 1;
}

function requireCatalogWriteGateway(indexService, hasRowMethod, unavailableMessage) {
  const gateway = indexService?.getControlPlaneSystemTableGateway?.();
  if (!indexService?.canWriteSystemTable?.() ||
      !gateway ||
      (!gateway.submitMutation && !hasRowMethod(gateway))) {
    throw createUnavailableError(
      GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      unavailableMessage,
    );
  }
  return gateway;
}

function assertCatalogMutationResult(res, tableName) {
  if (res && res.success === false) {
    const err = new Error(res.error || `Catalog mutation failed on ${tableName}`);
    if (res.errorCode) err.code = res.errorCode;
    if (res.failureCode) err.failureCode = res.failureCode;
    throw err;
  }
}

async function submitCatalogMutation(gateway, mutation, rowOperationFn, unavailableMessage) {
  const options = {
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    deliveryPriority: LOCAL_STR_CRITICAL,
  };
  if (gateway?.submitMutation) {
    const res = await gateway.submitMutation(mutation, options);
    assertCatalogMutationResult(res, mutation.tableName);
    if (gateway.awaitProjectionAt && res?.position) {
      await gateway.awaitProjectionAt(
        res.position,
        {statement: GLOBAL_INDEX_STATEMENT_LABEL.CATALOG_MUTATION},
      );
    }
    return res;
  }
  if (rowOperationFn) {
    const res = await rowOperationFn(options);
    assertCatalogMutationResult(res, mutation.tableName);
    return res;
  }
  throw createUnavailableError(
    GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
    unavailableMessage,
  );
}

async function persistCatalogInsert(indexService, record) {
  const gateway = requireCatalogWriteGateway(
    indexService,
    (candidate) => Boolean(candidate.insertSystemTableRow),
    PERSIST_CATALOG_INSERT_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
  const row = toIndicesTableRow(record);
  await submitCatalogMutation(
    gateway,
    {operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT, tableName: TABLES.INDICES, row},
    gateway.insertSystemTableRow ?
      (opts) => gateway.insertSystemTableRow(TABLES.INDICES, row, opts) :
      null,
    PERSIST_CATALOG_INSERT_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
}

async function persistCatalogUpdate(indexService, indexId, update) {
  const gateway = requireCatalogWriteGateway(
    indexService,
    (candidate) => Boolean(candidate.updateSystemTableRow),
    PERSIST_CATALOG_UPDATE_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
  if (!indexId) {
    throw createUnavailableError(
      GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      CATALOG_UPDATE_INDEX_ID_REQUIRED_MSG,
    );
  }
  const data = toIndicesUpdateData(update);
  const whereClause = {index_id: indexId};
  await submitCatalogMutation(
    gateway,
    {
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.INDICES,
      whereClause,
      data,
    },
    gateway.updateSystemTableRow ?
      (opts) => gateway.updateSystemTableRow(TABLES.INDICES, whereClause, data, opts) :
      null,
    PERSIST_CATALOG_UPDATE_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
}

async function persistCatalogDelete(indexService, record) {
  const gateway = requireCatalogWriteGateway(
    indexService,
    (candidate) => Boolean(candidate.deleteSystemTableRow),
    PERSIST_CATALOG_DELETE_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
  if (!record) {
    throw createUnavailableError(
      GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      CATALOG_DELETE_RECORD_REQUIRED_MSG,
    );
  }
  const predicate = {
    index_id: record.index_id,
    table_id: record.table_id,
    index_name: record.index_name,
  };
  await submitCatalogMutation(
    gateway,
    {
      operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
      tableName: TABLES.INDICES,
      whereClause: predicate,
    },
    gateway.deleteSystemTableRow ?
      (opts) => gateway.deleteSystemTableRow(TABLES.INDICES, predicate, opts) :
      null,
    PERSIST_CATALOG_DELETE_WRITE_AUTHORITY_UNAVAILABLE_MSG,
  );
}

function resolveHydratedBasePrimaryKeyColumns(coordinator, indexName, schemaInfo) {
  if (schemaInfo.basePrimaryKeyColumns.length > 0) {
    return schemaInfo.basePrimaryKeyColumns;
  }
  return coordinator?.catalog?.get(indexName)?.basePrimaryKeyColumns;
}

function buildHydratedCatalogRecord(normalized, generation, basePrimaryKeyColumns) {
  const tableName = normalized.tableName || normalized.tableId;
  return {
    index_id: normalized.indexId,
    table_id: normalized.tableId,
    table_name: tableName,
    index_name: normalized.indexName,
    column_names: JSON.stringify(normalized.columnNames),
    index_type: normalized.indexType,
    is_global: 1,
    is_unique: normalized.isUnique ? 1 : 0,
    state: normalized.state,
    backfill_cursor_partition_id: normalized.backfillCursorPartitionId,
    backfill_cursor_pk: normalized.backfillCursorPk,
    backfill_total_rows: normalized.backfillTotalRows,
    error_message: normalized.errorMessage,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
    index_generation: generation,
    basePrimaryKeyColumns,
  };
}

function applyHydratedCatalogRecord(coordinator, indexName, catalogRecord, generation) {
  coordinator.catalog.set(indexName, catalogRecord);
  const prevGen = coordinator.generations.get(indexName) || 0;
  if (generation > prevGen) {
    coordinator.generations.set(indexName, generation);
  }
}

function hydrateGlobalIndexFromRow(indexService, coordinator, row) {
  const normalized = normalizeGlobalIndexRecord(row);
  if (!normalized?.indexName) return null;

  const runtimeState = ensureRuntimeState(indexService);
  const schemaInfo = resolveTableSchemaMetadata(
    indexService,
    coordinator,
    runtimeState,
    normalized.tableName || normalized.tableId,
  );
  const generation = parseGenerationFromIndexId(normalized.indexId);
  const basePrimaryKeyColumns = resolveHydratedBasePrimaryKeyColumns(
    coordinator,
    normalized.indexName,
    schemaInfo,
  );
  const catalogRecord = buildHydratedCatalogRecord(normalized, generation, basePrimaryKeyColumns);
  applyHydratedCatalogRecord(coordinator, normalized.indexName, catalogRecord, generation);
  return {
    indexId: normalized.indexId,
    tableId: normalized.tableId,
    tableName: catalogRecord.table_name,
    indexName: normalized.indexName,
    columnNames: normalized.columnNames,
    indexType: normalized.indexType,
    unique: normalized.isUnique,
    isGlobal: true,
    global: true,
    state: normalized.state,
    backfillCursorPartitionId: normalized.backfillCursorPartitionId,
    backfillCursorPk: normalized.backfillCursorPk,
    backfillTotalRows: normalized.backfillTotalRows,
    errorMessage: normalized.errorMessage,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    generation,
  };
}

function syncServiceIndexEntryFromRecord(indexService, record) {
  if (!record) return;
  const meta = indexService._catalogToMetadata(record);
  indexService._cacheIndexMetadata(meta);
}

function createBackfillCallbacks(indexService, resolveTableSchema) {
  return {
    fetchBasePartitionBatch: async ({
      tableName,
      partitionId,
      cursorPk,
      batchSize,
      basePrimaryKeyColumns,
    }) => {
      const schemaInfo = resolveTableSchema(tableName);
      const pkCols = basePrimaryKeyColumns && basePrimaryKeyColumns.length > 0 ?
        basePrimaryKeyColumns :
        schemaInfo.basePrimaryKeyColumns;
      if (!pkCols || pkCols.length === 0) {
        throw createUnavailableError(
          GLOBAL_INDEX_ERROR_CODE.PRIMARY_KEY_UNAVAILABLE,
          `Primary key columns unavailable for table '${tableName}'`,
        );
      }
      const {whereSql, params} = buildCursorComparisonSql(
        pkCols,
        cursorPk,
        schemaInfo.columnTypes,
      );
      const orderBy = pkCols
        .map((col) => `${quoteIdentifier(col)} ${LOCAL_STR_ASC}`)
        .join(LOCAL_STR_COMMA_SPACE);
      const sql = `SELECT * FROM ${quoteIdentifier(tableName)} ${whereSql} ORDER BY ${orderBy} LIMIT ?`;
      return executePartitionReadSql(
        indexService,
        partitionId,
        sql,
        [...params, batchSize],
        {tableName},
      );
    },
    verifyBaseRowImage: async ({
      tableName,
      partitionId,
      pkValues,
      basePrimaryKeyColumns,
    }) => {
      const pkCols = basePrimaryKeyColumns && basePrimaryKeyColumns.length > 0 ?
        basePrimaryKeyColumns :
        Object.keys(pkValues || {});
      const whereParts = pkCols.map((col) => `${quoteIdentifier(col)} = ?`);
      const params = pkCols.map((col) => pkValues[col]);
      const sql = `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${whereParts.join(LOCAL_STR_AND)}`;
      const rows = await executePartitionReadSql(
        indexService,
        partitionId,
        sql,
        params,
        {tableName},
      );
      return rows[0] || null;
    },
    writeIndexBatch: async ({datasetName, indexPartitionId, entries}) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      for (const entry of entries) {
        const {sql, params} = buildIndexInsertSql(datasetName, entry);
        await executePartitionWriteSql(indexService, indexPartitionId, sql, params, datasetName);
      }
    },
  };
}

function buildBaseFetchResidualClause(whereClause, params) {
  if (!whereClause) return {clause: '', params: []};
  const conditions = extractPredicateConditions(whereClause, params);
  const residual = buildWhereClauseFromConditions(conditions);
  if (!residual.whereSql) return {clause: '', params: []};
  return {
    clause: residual.whereSql.slice(SQL_WHERE_PREFIX.length),
    params: residual.params,
  };
}

function createReadRouterCallbacks(indexService, getBaseTablePartitions) {
  return {
    executeIndexScan: async ({
      datasetName,
      columnNames,
      indexPartitions,
      whereClause,
      params = [],
    }) => {
      const conditions = extractPredicateConditions(whereClause, params);
      const allowed = Array.isArray(columnNames) && columnNames.length > 0 ?
        new Set(columnNames.map((c) => c.toLowerCase())) :
        null;
      const {whereSql, params: whereParams} = buildWhereClauseFromConditions(
        conditions,
        allowed,
      );
      const rows = [];
      for (const p of indexPartitions) {
        const pId = typeof p === 'string' ? p : extractPartitionIdFromRow(p);
        const sql = `SELECT * FROM ${quoteIdentifier(datasetName)} ${whereSql}`;
        const partRows = await executePartitionReadSql(
          indexService,
          pId,
          sql,
          whereParams,
          {tableName: datasetName},
        );
        rows.push(...partRows);
      }
      return rows;
    },
    executeBaseFetch: async ({
      tableName,
      basePartitionId,
      pkList,
      whereClause = null,
      params = [],
    }) => {
      const residual = buildBaseFetchResidualClause(whereClause, params);
      const rows = [];
      for (const pk of pkList) {
        const entries = Object.entries(pk);
        const pkParts = entries.map(([col]) => `${quoteIdentifier(col)} = ?`);
        if (residual.clause) pkParts.push(residual.clause);
        const sql = `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${pkParts.join(LOCAL_STR_AND)}`;
        const queryParams = [
          ...entries.map(([, val]) => val),
          ...residual.params,
        ];
        const fetched = await executePartitionReadSql(
          indexService,
          basePartitionId,
          sql,
          queryParams,
          {tableName},
        );
        if (fetched[0]) rows.push(fetched[0]);
      }
      return rows;
    },
    executeScatterGather: async ({
      tableName,
      whereClause,
      where,
      projectedColumns = null,
      params = [],
    }) => {
      const basePartitions = getBaseTablePartitions(tableName);
      if (!Array.isArray(basePartitions) || basePartitions.length === 0) {
        throw createUnavailableError(
          GLOBAL_INDEX_ERROR_CODE.PARTITIONS_UNAVAILABLE,
          `No base partitions available for table '${tableName}'`,
        );
      }
      const effectiveWhere = whereClause !== undefined ? whereClause : where;
      const conditions = extractPredicateConditions(effectiveWhere, params);
      const {whereSql, params: whereParams} = buildWhereClauseFromConditions(conditions);
      const colsSql = Array.isArray(projectedColumns) &&
        projectedColumns.length > 0 &&
        !projectedColumns.includes(LOCAL_STR_STAR) ?
        projectedColumns.map(quoteIdentifier).join(LOCAL_STR_COMMA_SPACE) :
        LOCAL_STR_STAR;
      const rows = [];
      for (const p of basePartitions) {
        const pId = extractPartitionIdFromRow(p);
        const sql = `SELECT ${colsSql} FROM ${quoteIdentifier(tableName)} ${whereSql}`;
        const partRows = await executePartitionReadSql(
          indexService,
          pId,
          sql,
          whereParams,
          {tableName},
        );
        rows.push(...partRows);
      }
      return rows;
    },
  };
}

function syncGlobalIndexesForService(indexService, options = {}) {
  syncGlobalIndexesFromSystemCache(
    indexService,
    hydrateGlobalIndexFromRow,
    syncServiceIndexEntryFromRecord,
    options,
  );
}

function pruneIndexRowFromWiringState(indexService, indexName) {
  const indexRows = indexService?.globalIndexWiringState?.indexRows;
  if (Array.isArray(indexRows) && indexName) {
    indexService.globalIndexWiringState.indexRows = indexRows.filter(
      (row) => row?.index_name !== indexName,
    );
  }
}

async function removeIndexCatalogMetadata(indexService, record) {
  await persistCatalogDelete(indexService, record);
  pruneIndexRowFromWiringState(indexService, record?.index_name);
  indexService._removeIndexFromCache(
    record.index_name,
    record.table_id || record.table_name,
  );
}

async function dropIndexDatasetPartition(indexService, {tableName, indexName, partitionId}) {
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  await executePartitionWriteSql(
    indexService,
    partitionId,
    generateDropIndexDatasetSql(tableName, indexName),
    [],
    datasetName,
  );
}

function buildCatalogPersistenceHooks(indexService, getCoordinator = null) {
  const resolveCoordinator = () =>
    (getCoordinator ? getCoordinator() : indexService.globalIndexCoordinator);
  const syncRow = (row) => {
    if (!row) return;
    const coordinator = resolveCoordinator();
    if (!coordinator) return;
    hydrateGlobalIndexFromRow(indexService, coordinator, row);
    const updatedRecord = coordinator.catalog.get(row.index_name);
    if (updatedRecord) {
      syncServiceIndexEntryFromRecord(indexService, updatedRecord);
    }
  };
  return {
    refreshCatalogPartitions: async () => {
      await preloadProductionPartitionMetadata(indexService);
      syncGlobalIndexesForService(indexService, {includeGatewaySnapshot: true});
    },
    onCatalogInsert: async (record) => {
      requireCatalogWriteGateway(
        indexService,
        (candidate) => Boolean(candidate.insertSystemTableRow),
        PERSIST_CATALOG_INSERT_WRITE_AUTHORITY_UNAVAILABLE_MSG,
      );
      await ensureIndexDatasetTableInGateway(indexService, record);
      await persistCatalogInsert(indexService, record);
      syncServiceIndexEntryFromRecord(indexService, record);
    },
    onCatalogUpdate: async (indexId, update, updatedRecord) => {
      await persistCatalogUpdate(indexService, indexId, update, updatedRecord);
      syncServiceIndexEntryFromRecord(indexService, updatedRecord);
    },
    onCatalogDelete: (record) => removeIndexCatalogMetadata(indexService, record),
    onDropIndexDataset: (params) => dropIndexDatasetPartition(indexService, params),
    onReconcileIndexDataset: (params) =>
      reconcileDistributedIndexDatasetSchema(indexService, params, getCoordinator, syncRow),
    verifyCatalogOwnership: (params) =>
      verifyGlobalIndexCatalogOwnership(indexService, resolveCoordinator(), params),
    refreshCatalogRecord: async (indexName, expectedIndexId) => {
      const {available, row} = await readAuthoritativeGlobalIndexRow(indexService, indexName);
      const current = resolveCoordinator()?.catalog.get(indexName);
      if (expectedIndexId && (row?.index_id !== expectedIndexId ||
          current?.index_id !== expectedIndexId)) return {available, row: null};
      if (available && row) {
        syncRow(row);
      }
      // A filtered lifecycle read can miss a generation already observed via
      // CDC. Fence this attempt; delete and replacement catalog events retire
      // the retained generation.
      return {available, row};
    },
  };
}

function buildProductionCoordinatorOptions(indexService) {
  const runtimeState = ensureRuntimeState(indexService);
  let coordinatorRef = null;

  const getCoordinator = () => coordinatorRef;

  const getBaseTablePartitions = (tableName) => {
    const coord = getCoordinator();
    if (coord && coord.basePartitionsByTable.has(tableName)) {
      return coord.basePartitionsByTable.get(tableName);
    }
    return discoverPartitionsForTargets(indexService, runtimeState, [tableName]);
  };

  const getIndexPartitions = (indexName) => {
    const coord = getCoordinator();
    if (coord && coord.indexPartitionsByName.has(indexName)) {
      return coord.indexPartitionsByName.get(indexName);
    }
    const record = coord ? coord.catalog.get(indexName) : null;
    const tableName = record ? extractTableNameFromRow(record) : null;
    const targets = [indexName];
    if (tableName) {
      targets.unshift(getGlobalIndexDatasetName(tableName, indexName));
    }
    return discoverPartitionsForTargets(indexService, runtimeState, targets);
  };

  const resolveTableSchema = (tableName) => {
    return resolveTableSchemaMetadata(indexService, getCoordinator(), runtimeState, tableName);
  };

  return {
    logger: indexService.logger,
    bindCoordinator(coordinator) {
      coordinatorRef = coordinator;
    },
    getBaseTablePartitions,
    getIndexPartitions,
    resolveTableSchema,
    hasDistributedPartitionRoute: (partitionId) =>
      hasDistributedPartitionRoute(indexService, partitionId),
    hasHostedPartitionReplica: (partitionId) =>
      hasHostedPartitionReplica(indexService, partitionId),
    provisionIndexPartitions: (context) =>
      provisionIndexPartitionsWithRuntime(indexService, getCoordinator, runtimeState, context),
    ...buildCatalogPersistenceHooks(indexService, getCoordinator),
    ...createBackfillCallbacks(indexService, resolveTableSchema),
    ...createReadRouterCallbacks(indexService, getBaseTablePartitions),
  };
}

function sortRowsByOrderBy(rows, orderBy) {
  if (!orderBy || !Array.isArray(rows) || rows.length <= 1) {
    return rows;
  }
  const parts = String(orderBy).trim().split(/\s+/u);
  const col = parts[0]?.replace(/^[`"']|[`"']$/gu, '');
  if (!col) return rows;
  const dir = parts[1]?.toUpperCase() === LOCAL_STR_DESC ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = a[col];
    const vb = b[col];
    if (va === vb) return 0;
    if (va === null || va === undefined) return -1 * dir;
    if (vb === null || vb === undefined) return 1 * dir;
    if (va < vb) return -1 * dir;
    return 1 * dir;
  });
}

export {
  buildProductionCoordinatorOptions,
  hydrateGlobalIndexFromRow,
  preloadProductionPartitionMetadata,
  pruneIndexRowFromWiringState,
  sortRowsByOrderBy,
  syncGlobalIndexesForService,
};
