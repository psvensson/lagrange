/**
 * Partition discovery, SQLite database resolution, and base-table schema
 * metadata lookup for Global Secondary Index production wiring.
 */

import {TABLES} from '../constants/index.js';
import {
  resolveDeclaredPrimaryKeyColumns,
} from '../partition/partition-boundary-representation.js';
import {GLOBAL_INDEX_ERROR_CODE} from './index-constants.js';

const LOCAL_STR_ESCAPED_QUOTE = '""';
const LOCAL_STR_TEXT = 'TEXT';
const SQL_SELECT_ALL_PARTITIONS = 'SELECT * FROM partitions';
const SQL_SELECT_ALL_TABLES = 'SELECT * FROM tables';

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, LOCAL_STR_ESCAPED_QUOTE)}"`;
}

function createUnavailableError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createParticipantUnavailableError(partitionId) {
  return createUnavailableError(
    GLOBAL_INDEX_ERROR_CODE.PARTICIPANT_UNAVAILABLE,
    `Index participant database unavailable: ${partitionId}`,
  );
}

function extractPartitionIdFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.partition_id !== undefined) return row.partition_id;
  if (row.partitionId !== undefined) return row.partitionId;
  return null;
}

function extractTableNameFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.table_name !== undefined) return row.table_name;
  if (row.tableName !== undefined) return row.tableName;
  return null;
}

function extractTableIdFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.table_id !== undefined) return row.table_id;
  if (row.tableId !== undefined) return row.tableId;
  return null;
}

function extractSqliteDb(handle) {
  if (!handle || typeof handle !== 'object') return null;
  if (handle.prepare && handle.exec) {
    return handle.open === false ? null : handle;
  }
  if (handle.db && handle.db.prepare) {
    return handle.db.open === false ? null : handle.db;
  }
  if (handle.storage && handle.storage.getDatabase) {
    const db = handle.storage.getDatabase();
    return db && db.prepare && db.open !== false ? db : null;
  }
  if (handle.getDatabase) {
    const db = handle.getDatabase();
    return db && db.prepare && db.open !== false ? db : null;
  }
  return null;
}

function selectPreferredService(candidates) {
  let firstWithOpenDb = null;
  for (const svc of candidates) {
    const db = extractSqliteDb(svc);
    if (!db) continue;
    if (svc.isLeader) return svc;
    if (!firstWithOpenDb) firstWithOpenDb = svc;
  }
  return firstWithOpenDb || candidates[0] || null;
}

function findPartitionInContainer(container, partitionId) {
  if (!container) return null;
  if (container instanceof Map) {
    if (container.has(partitionId)) return container.get(partitionId);
    const matches = [];
    for (const svc of container.values()) {
      if (extractPartitionIdFromRow(svc) === partitionId) matches.push(svc);
    }
    return selectPreferredService(matches);
  }
  if (Array.isArray(container)) {
    return selectPreferredService(
      container.filter((svc) => extractPartitionIdFromRow(svc) === partitionId),
    );
  }
  if (container.getPartition) {
    const found = container.getPartition(partitionId);
    if (found) return found;
  }
  if (container.getPartitionService) {
    const found = container.getPartitionService(partitionId);
    if (found) return found;
  }
  if (container.getPartitionDatabase) {
    const found = container.getPartitionDatabase(partitionId);
    if (found) return found;
  }
  if (container.getDatabase) {
    const found = container.getDatabase(partitionId);
    if (found) return found;
  }
  if (extractPartitionIdFromRow(container) === partitionId) {
    return container;
  }
  return null;
}

function resolvePartitionDatabase(indexService, coordinator, partitionId) {
  if (!partitionId) return null;
  if (coordinator && coordinator.partitionDatabases.has(partitionId)) {
    return coordinator.partitionDatabases.get(partitionId);
  }
  const directSources = [
    indexService.partitionDatabases,
    indexService.storageManager,
    indexService.partitionManager,
    indexService.partitionDirectory,
    indexService.partitionServices,
    indexService.partitionService,
  ];
  for (const source of directSources) {
    const db = extractSqliteDb(findPartitionInContainer(source, partitionId));
    if (db) return db;
  }
  if (indexService.partitionServicesProvider) {
    const provided = indexService.partitionServicesProvider(partitionId);
    const db = extractSqliteDb(findPartitionInContainer(provided, partitionId));
    if (db) return db;
  }
  const engine = indexService.sqlQueryEngine;
  if (engine) {
    if (engine.partitionServicesProvider) {
      const provided = engine.partitionServicesProvider(partitionId);
      const db = extractSqliteDb(findPartitionInContainer(provided, partitionId));
      if (db) return db;
    }
    if (engine.getPartitionService) {
      const db = extractSqliteDb(engine.getPartitionService(partitionId));
      if (db) return db;
    }
  }
  return null;
}

function collectServicesFromContainer(container, result) {
  if (!container) return;
  if (container instanceof Map) {
    for (const svc of container.values()) result.push(svc);
    return;
  }
  if (Array.isArray(container)) {
    result.push(...container);
    return;
  }
  if (container.partitionId) result.push(container);
}

function toPartitionDescriptor(svc) {
  const partitionId = extractPartitionIdFromRow(svc);
  const tableName = extractTableNameFromRow(svc);
  const tableId = extractTableIdFromRow(svc);
  const keyRange = svc.keyRange;
  let start = svc.partition_key_start;
  let end = svc.partition_key_end;
  if (start === undefined && svc.partitionKeyStart !== undefined) start = svc.partitionKeyStart;
  if (end === undefined && svc.partitionKeyEnd !== undefined) end = svc.partitionKeyEnd;
  if (start === undefined && keyRange) start = keyRange.start;
  if (end === undefined && keyRange) end = keyRange.end;
  return {
    ...svc,
    partition_id: partitionId,
    partitionId,
    table_id: tableId,
    table_name: tableName,
    partition_key_start: start === undefined ? null : start,
    partition_key_end: end === undefined ? null : end,
  };
}

function matchesAnyTarget(partition, targetSet) {
  const tName = extractTableNameFromRow(partition);
  const tId = extractTableIdFromRow(partition);
  return (tName && targetSet.has(tName)) || (tId && targetSet.has(tId));
}

function mergePartitionsById(lists) {
  const byId = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const desc = toPartitionDescriptor(raw);
      if (!desc.partition_id) continue;
      const existing = byId.get(desc.partition_id);
      if (!existing) {
        byId.set(desc.partition_id, desc);
      } else {
        byId.set(desc.partition_id, {
          ...desc,
          ...existing,
          partition_key_start: existing.partition_key_start !== null ?
            existing.partition_key_start :
            desc.partition_key_start,
          partition_key_end: existing.partition_key_end !== null ?
            existing.partition_key_end :
            desc.partition_key_end,
        });
      }
    }
  }
  return Array.from(byId.values());
}

function readAllSystemPartitionsFromCache(cache) {
  if (!cache) return [];
  if (cache.getAll) return cache.getAll(TABLES.PARTITIONS) || [];
  if (cache.filter) return cache.filter(TABLES.PARTITIONS, () => true) || [];
  return [];
}

function collectEnginePartitions(indexService, targetSet) {
  const results = [];
  if (!indexService.sqlQueryEngine || !indexService.sqlQueryEngine.getTablePartitions) {
    return results;
  }
  for (const target of targetSet) {
    const found = indexService.sqlQueryEngine.getTablePartitions(target);
    if (Array.isArray(found) && found.length > 0) results.push(found);
  }
  return results;
}

function collectCachePartitions(indexService, targetSet) {
  const fromCache = readAllSystemPartitionsFromCache(indexService.systemTableCache)
    .filter((p) => matchesAnyTarget(p, targetSet));
  return fromCache.length > 0 ? [fromCache] : [];
}

function collectServiceDirectoryPartitions(indexService, targetSet) {
  const services = [];
  collectServicesFromContainer(indexService.partitionService, services);
  collectServicesFromContainer(indexService.partitionServices, services);
  if (indexService.partitionServicesProvider) {
    collectServicesFromContainer(indexService.partitionServicesProvider(), services);
  }
  if (indexService.sqlQueryEngine && indexService.sqlQueryEngine.partitionServicesProvider) {
    collectServicesFromContainer(
      indexService.sqlQueryEngine.partitionServicesProvider(),
      services,
    );
  }
  if (indexService.partitionManager && indexService.partitionManager.getPartitions) {
    for (const target of targetSet) {
      const mgrParts = indexService.partitionManager.getPartitions(target);
      if (Array.isArray(mgrParts)) services.push(...mgrParts);
    }
  }
  const matching = services.filter((svc) => matchesAnyTarget(svc, targetSet));
  return matching.length > 0 ? [matching] : [];
}

function discoverPartitionsForTargets(indexService, runtimeState, targetNames) {
  const targetSet = new Set(targetNames.filter(Boolean));
  if (targetSet.size === 0) return [];
  const collected = [
    ...collectEnginePartitions(indexService, targetSet),
    ...collectCachePartitions(indexService, targetSet),
    ...collectServiceDirectoryPartitions(indexService, targetSet),
  ];
  const fromGateway = runtimeState.partitionRows.filter((p) => matchesAnyTarget(p, targetSet));
  if (fromGateway.length > 0) collected.push(fromGateway);
  return mergePartitionsById(collected);
}

function ensureRuntimeState(indexService) {
  if (!indexService.globalIndexWiringState) {
    indexService.globalIndexWiringState = {
      partitionRows: [],
      tableRows: new Map(),
    };
  }
  return indexService.globalIndexWiringState;
}

async function preloadProductionPartitionMetadata(indexService) {
  const runtimeState = ensureRuntimeState(indexService);
  if (!indexService.canReadMetadata()) return runtimeState;
  const gateway = indexService.getControlPlaneSystemTableGateway();
  if (!gateway) return runtimeState;

  const partResult = await gateway.readRows(
    TABLES.PARTITIONS,
    SQL_SELECT_ALL_PARTITIONS,
    [],
  );
  if (Array.isArray(partResult?.rows)) {
    runtimeState.partitionRows = partResult.rows;
  }

  const tableResult = await gateway.readRows(
    TABLES.TABLES,
    SQL_SELECT_ALL_TABLES,
    [],
  );
  if (Array.isArray(tableResult?.rows)) {
    runtimeState.tableRows.clear();
    for (const row of tableResult.rows) {
      const tName = extractTableNameFromRow(row);
      const tId = extractTableIdFromRow(row);
      if (tName) runtimeState.tableRows.set(tName, row);
      if (tId) runtimeState.tableRows.set(tId, row);
    }
  }
  return runtimeState;
}

function extractColumnsListFromTableInfo(tableInfo) {
  if (!tableInfo) return [];
  if (Array.isArray(tableInfo.columns)) return tableInfo.columns;
  if (tableInfo.schema && Array.isArray(tableInfo.schema.columns)) {
    return tableInfo.schema.columns;
  }
  return [];
}

function resolveEngineTableInfo(indexService, tableName) {
  if (indexService.sqlQueryEngine && indexService.sqlQueryEngine.getTableInfo) {
    return indexService.sqlQueryEngine.getTableInfo(tableName) || null;
  }
  return null;
}

function resolveCacheTableInfo(indexService, tableName) {
  if (indexService.systemTableCache && indexService.systemTableCache.get) {
    return indexService.systemTableCache.get(TABLES.TABLES, tableName) || null;
  }
  return null;
}

function resolveTableInfo(indexService, runtimeState, tableName) {
  return resolveEngineTableInfo(indexService, tableName) ||
    resolveCacheTableInfo(indexService, tableName) ||
    runtimeState.tableRows.get(tableName) ||
    null;
}

function inspectSqliteTableSchema(db, tableName) {
  const cols = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
  if (!Array.isArray(cols) || cols.length === 0) {
    return {primaryKeyColumns: [], columnTypes: {}};
  }
  const columnTypes = {};
  const pkEntries = [];
  for (const col of cols) {
    columnTypes[col.name] = col.type || LOCAL_STR_TEXT;
    if (Number(col.pk) > 0) {
      pkEntries.push({name: col.name, pkOrder: Number(col.pk)});
    }
  }
  pkEntries.sort((a, b) => a.pkOrder - b.pkOrder);
  return {
    primaryKeyColumns: pkEntries.map((entry) => entry.name),
    columnTypes,
  };
}

function inspectPartitionGroupSchema(indexService, coordinator, basePartitions, tableName) {
  const columnTypes = {};
  let discoveredPks = [];
  for (const part of basePartitions) {
    const pId = extractPartitionIdFromRow(part);
    const db = resolvePartitionDatabase(indexService, coordinator, pId);
    if (!db) continue;
    const inspected = inspectSqliteTableSchema(db, tableName);
    for (const [colName, colType] of Object.entries(inspected.columnTypes)) {
      if (!columnTypes[colName]) columnTypes[colName] = colType;
    }
    if (inspected.primaryKeyColumns.length > 0) {
      discoveredPks = inspected.primaryKeyColumns;
      break;
    }
  }
  return {discoveredPks, columnTypes};
}

function resolveTableSchemaMetadata(indexService, coordinator, runtimeState, tableName) {
  const tableInfo = resolveTableInfo(indexService, runtimeState, tableName);
  const declaredPks = resolveDeclaredPrimaryKeyColumns(tableInfo);
  const columnTypes = {};
  for (const col of extractColumnsListFromTableInfo(tableInfo)) {
    if (col && col.name) columnTypes[col.name] = col.type || LOCAL_STR_TEXT;
  }

  const basePartitions = coordinator.getBaseTablePartitions(tableName);
  const inspected = inspectPartitionGroupSchema(
    indexService,
    coordinator,
    basePartitions,
    tableName,
  );
  for (const [colName, colType] of Object.entries(inspected.columnTypes)) {
    if (!columnTypes[colName]) columnTypes[colName] = colType;
  }

  const basePrimaryKeyColumns = inspected.discoveredPks.length > 0 ?
    inspected.discoveredPks :
    declaredPks;
  return {basePrimaryKeyColumns, columnTypes};
}

export {
  createParticipantUnavailableError,
  createUnavailableError,
  discoverPartitionsForTargets,
  ensureRuntimeState,
  extractPartitionIdFromRow,
  extractTableNameFromRow,
  preloadProductionPartitionMetadata,
  quoteIdentifier,
  resolvePartitionDatabase,
  resolveTableSchemaMetadata,
};
