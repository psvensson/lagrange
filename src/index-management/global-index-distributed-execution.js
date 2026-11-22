/**
 * Distributed runtime execution, dynamic index-partition provisioning, and
 * SystemTableCache catalog propagation helpers for Global Secondary Indexes.
 */

import {TABLES} from '../constants/index.js';
import {CACHE_CDC_OPERATIONS} from '../cache/cache-constants.js';
import {normalizeGlobalIndexRecord} from './global-index-catalog-contract.js';
import {
  buildIndexDatasetSchema,
  getGlobalIndexDatasetName,
} from './global-index-dataset-manager.js';
import {
  createParticipantUnavailableError,
  extractPartitionIdFromRow,
} from './global-index-partition-discovery.js';

const LOCAL_STR_ID = 'id';
const LOCAL_STR_NORMAL = 'normal';
const LOCAL_STR_TEXT = 'TEXT';

function resolveProvisionerCallback(indexService) {
  if (indexService?.partitionProvisioner) {
    return indexService.partitionProvisioner;
  }
  return indexService?.sqlQueryEngine?.tableCreationService?.partitionProvisioner || null;
}

function resolveFenceVersion(indexService, tableName) {
  const engine = indexService?.sqlQueryEngine;
  if (!engine || !engine.resolveWriteFencePartitionVersion) {
    return null;
  }
  const info = engine.getTableInfo ? engine.getTableInfo(tableName) : null;
  return engine.resolveWriteFencePartitionVersion(info);
}

function createWriteExecutionUnavailableError(partitionId, res) {
  const err = createParticipantUnavailableError(partitionId);
  if (res?.error) {
    err.message = `${err.message}: ${res.error}`;
  }
  if (res?.errorCode) err.errorCode = res.errorCode;
  if (res?.failureCode) err.failureCode = res.failureCode;
  return err;
}

async function executeRemoteReadViaRouter(indexService, partitionId, sql, params) {
  const routed = await indexService.queryRouter.executeReadOnPartition(partitionId, sql, params);
  if (!routed || routed.success !== true) {
    throw createWriteExecutionUnavailableError(partitionId, routed);
  }
  return Array.isArray(routed.rows) ? routed.rows : [];
}

async function executeRemoteRead(indexService, partitionId, sql, params) {
  if (indexService?.queryRouter?.executeReadOnPartition) {
    return executeRemoteReadViaRouter(indexService, partitionId, sql, params);
  }
  const executor = indexService?.sqlQueryEngine?.queryExecutor;
  if (executor && executor.executeOnPartition) {
    const res = await executor.executeOnPartition(partitionId, sql, params, true, true, false, {});
    if (!res || res.success !== true) {
      throw createWriteExecutionUnavailableError(partitionId, res);
    }
    return Array.isArray(res.rows) ? res.rows : [];
  }
  throw createParticipantUnavailableError(partitionId);
}

async function executePartitionReadSql(indexService, resolveDb, partitionId, sql, params = []) {
  const db = resolveDb(partitionId);
  if (db) {
    return db.prepare(sql).all(...params);
  }
  return executeRemoteRead(indexService, partitionId, sql, params);
}

async function executeRemoteWriteViaRouter(indexService, partitionId, sql, params) {
  const routed = await indexService.queryRouter.executeWriteOnPartition(partitionId, sql, params);
  if (!routed || routed.success !== true) {
    throw createWriteExecutionUnavailableError(partitionId, routed);
  }
  return routed;
}

async function executePartitionWriteSql(
  indexService,
  partitionId,
  sql,
  params = [],
  tableName = null,
) {
  if (indexService?.queryRouter?.executeWriteOnPartition) {
    return executeRemoteWriteViaRouter(indexService, partitionId, sql, params);
  }
  const executor = indexService?.sqlQueryEngine?.queryExecutor;
  if (executor && executor.executeOnPartition) {
    const expectedPartitionVersion = resolveFenceVersion(indexService, tableName);
    const res = await executor.executeOnPartition(
      partitionId,
      sql,
      params,
      false,
      true,
      false,
      {tableName, expectedPartitionVersion},
    );
    if (!res || res.success !== true) {
      throw createWriteExecutionUnavailableError(partitionId, res);
    }
    return res;
  }
  throw createParticipantUnavailableError(partitionId);
}

function hasDistributedPartitionRoute(indexService) {
  if (indexService?.queryRouter?.executeWriteOnPartition) {
    return true;
  }
  return Boolean(indexService?.sqlQueryEngine?.queryExecutor?.executeOnPartition);
}

function propagateSystemTableCacheChange(indexService, tableName, operation, row) {
  const cache = indexService?.systemTableCache;
  if (!cache || !cache.applySystemTableChange || !row) {
    return;
  }
  cache.applySystemTableChange(tableName, operation, row);
}

function recordPartitionDescriptorLocally(coordinator, runtimeState, partitionMetadata) {
  const pid = extractPartitionIdFromRow(partitionMetadata);
  const exists = runtimeState.partitionRows.some(
    (row) => extractPartitionIdFromRow(row) === pid,
  );
  if (!exists) {
    runtimeState.partitionRows.push(partitionMetadata);
  }
  if (coordinator && coordinator.indexPartitionsByName) {
    const indexName = partitionMetadata._indexName;
    if (indexName) {
      const existingList = coordinator.indexPartitionsByName.get(indexName) || [];
      if (!existingList.some((p) => extractPartitionIdFromRow(p) === pid)) {
        coordinator.indexPartitionsByName.set(indexName, [...existingList, partitionMetadata]);
      }
    }
  }
}

function mergeColumnTypesWithBaseTable(baseTable, columnTypes = {}) {
  const merged = {...(columnTypes || {})};
  const baseCols = baseTable?.schema?.columns;
  if (Array.isArray(baseCols)) {
    for (const col of baseCols) {
      if (col?.name && col?.type && !merged[col.name]) {
        merged[col.name] = col.type;
      }
    }
  }
  return merged;
}

function buildProvisionedIndexMetadata(indexService, context) {
  const {tableName, indexName, columnNames, basePrimaryKeyColumns, columnTypes} = context;
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(tableName) || null;
  const resolvedColumnTypes = mergeColumnTypesWithBaseTable(baseTable, columnTypes);
  const datasetSchema = buildIndexDatasetSchema({
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
    columnTypes: resolvedColumnTypes,
  });
  const partitionId = `__gsi_${tableName}_${indexName}_p0`;
  const partitionKeyType = resolvedColumnTypes?.[columnNames[0]] || LOCAL_STR_TEXT;
  const now = Date.now();
  const partitionMetadata = {
    partition_id: partitionId,
    table_id: datasetName,
    table_name: datasetName,
    partition_key: columnNames[0],
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: partitionKeyType,
    partition_version: 1,
    replica_count: 1,
    size_bytes: 0,
    leader_node_id: null,
    state: LOCAL_STR_NORMAL,
    created_at: now,
    updated_at: now,
  };
  const activeVersion = Number.isSafeInteger(baseTable?.active_partition_version) ?
    baseTable.active_partition_version :
    1;
  const tableMetadata = {
    table_id: datasetName,
    table_name: datasetName,
    partition_key: columnNames[0],
    primary_key: JSON.stringify(datasetSchema.primaryKey),
    primaryKey: datasetSchema.primaryKey,
    partition_key_type: partitionKeyType,
    schema: datasetSchema,
    active_partition_version: activeVersion,
  };
  return {datasetName, datasetSchema, partitionId, partitionMetadata, tableMetadata};
}

function resolveIndexActivePartitionVersion(indexService, tableName) {
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(tableName) || null;
  const ver = baseTable?.active_partition_version;
  return Number.isSafeInteger(ver) ? ver : 1;
}

function ensureIndexDatasetTableInCache(indexService, record) {
  const norm = normalizeGlobalIndexRecord(record);
  if (!norm.tableName || !norm.indexName) return;
  const datasetName = getGlobalIndexDatasetName(norm.tableName, norm.indexName);
  if (indexService?.systemTableCache?.get?.(TABLES.TABLES, datasetName)) {
    return;
  }
  const pks = record.basePrimaryKeyColumns;
  const pkCols = Array.isArray(pks) && pks.length > 0 ? pks : [LOCAL_STR_ID];
  const datasetSchema = buildIndexDatasetSchema({
    tableName: norm.tableName,
    indexName: norm.indexName,
    columnNames: norm.columnNames,
    basePrimaryKeyColumns: pkCols,
  });
  propagateSystemTableCacheChange(indexService, TABLES.TABLES, CACHE_CDC_OPERATIONS.UPSERT, {
    table_id: datasetName,
    table_name: datasetName,
    partition_key: norm.columnNames[0],
    primary_key: JSON.stringify(datasetSchema.primaryKey),
    primaryKey: datasetSchema.primaryKey,
    partition_key_type: LOCAL_STR_TEXT,
    schema: datasetSchema,
    active_partition_version: resolveIndexActivePartitionVersion(indexService, norm.tableName),
  });
}

async function provisionIndexPartitionsWithRuntime(
  indexService,
  getCoordinator,
  runtimeState,
  context,
) {
  const {indexName} = context;
  const provisioner = resolveProvisionerCallback(indexService);
  if (!provisioner) {
    throw new Error(`No index partitions available for global index '${indexName}'`);
  }

  const {
    datasetName,
    datasetSchema,
    partitionId,
    partitionMetadata,
    tableMetadata,
  } = buildProvisionedIndexMetadata(indexService, context);

  await provisioner({
    tableId: datasetName,
    tableName: datasetName,
    tableMetadata,
    partitionId,
    partitionMetadata,
    replicaCount: 1,
    schema: datasetSchema,
    keyRange: {start: null, end: null},
  });

  propagateSystemTableCacheChange(
    indexService,
    TABLES.TABLES,
    CACHE_CDC_OPERATIONS.UPSERT,
    tableMetadata,
  );
  propagateSystemTableCacheChange(
    indexService,
    TABLES.PARTITIONS,
    CACHE_CDC_OPERATIONS.UPSERT,
    partitionMetadata,
  );
  const gateway = indexService?.canWriteSystemTable?.() ?
    indexService.getControlPlaneSystemTableGateway() :
    null;
  if (gateway?.insertSystemTableRow) {
    await gateway.insertSystemTableRow(TABLES.PARTITIONS, partitionMetadata);
  }

  const descriptor = {...partitionMetadata, _provisionedWithSchema: true, _indexName: indexName};
  recordPartitionDescriptorLocally(getCoordinator(), runtimeState, descriptor);
  return [descriptor];
}

function isRowGlobal(row) {
  return Boolean(row && (row.is_global === 1 || row.is_global === true || row.isGlobal === true));
}

function isCatalogRecordStaleOrDifferent(existing, incoming) {
  if (!existing) return true;
  if (existing.index_id !== incoming.index_id) return true;
  if (existing.state !== incoming.state) return true;
  return Boolean(incoming.updated_at && existing.updated_at !== incoming.updated_at);
}

function resolveCoordinatorForSync(indexService) {
  if (indexService.globalIndexCoordinator) {
    return indexService.globalIndexCoordinator;
  }
  return indexService.getGlobalIndexCoordinator ?
    indexService.getGlobalIndexCoordinator() :
    null;
}

function syncGlobalIndexesFromSystemCache(indexService, hydrateFn, syncEntryFn) {
  const rows = indexService?.systemTableCache?.getAll?.(TABLES.INDICES);
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  const coordinator = resolveCoordinatorForSync(indexService);
  if (!coordinator) return;

  for (const row of rows) {
    if (!isRowGlobal(row) || !row.index_name) continue;
    const existing = coordinator.catalog.get(row.index_name);
    if (isCatalogRecordStaleOrDifferent(existing, row)) {
      hydrateFn(indexService, coordinator, row);
      syncEntryFn(indexService, coordinator.catalog.get(row.index_name));
    }
  }
}

export {
  ensureIndexDatasetTableInCache,
  executePartitionReadSql,
  executePartitionWriteSql,
  hasDistributedPartitionRoute,
  propagateSystemTableCacheChange,
  provisionIndexPartitionsWithRuntime,
  syncGlobalIndexesFromSystemCache,
};
