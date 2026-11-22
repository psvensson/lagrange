/**
 * Partition discovery, SQLite database resolution, and base-table schema
 * metadata lookup for Global Secondary Index production wiring.
 */

import {TABLES} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  resolveDeclaredPrimaryKeyColumns,
  resolveDeclaredTableSchema,
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

function isOpenDb(db) {
  return Boolean(db && db.prepare && db.open !== false);
}

function readDatabaseViaGetter(handle) {
  if (handle.storage && handle.storage.getDatabase) {
    return handle.storage.getDatabase();
  }
  if (handle.getDatabase) {
    return handle.getDatabase();
  }
  return null;
}

function isHostedPartitionService(handle) {
  if (!handle || typeof handle !== 'object') return false;
  return Boolean(
    handle.handleRemoteQuery ||
    handle.handleApplicationMessage ||
    handle.raftGroup ||
    handle.raft ||
    typeof handle.isLeader === 'boolean' ||
    typeof handle.role === 'string',
  );
}

function extractSqliteDb(handle) {
  if (!handle || typeof handle !== 'object' || isHostedPartitionService(handle)) {
    return null;
  }
  if (handle.prepare && handle.exec) {
    return handle.open === false ? null : handle;
  }
  if (isOpenDb(handle.db)) {
    return handle.db;
  }
  const resolved = readDatabaseViaGetter(handle);
  return isOpenDb(resolved) ? resolved : null;
}

function isLeaderCandidate(svc) {
  return Boolean(svc && (svc.isLeader === true || svc.role === RAFT_ROLE.LEADER));
}

function selectPreferredService(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const leader = candidates.find((svc) => isLeaderCandidate(svc));
  if (leader) return leader;
  const usable = candidates.find(
    (svc) => isHostedPartitionService(svc) || Boolean(extractSqliteDb(svc)),
  );
  return usable || candidates[0] || null;
}

function findPartitionInCollection(container, partitionId) {
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
  return null;
}

function findPartitionViaAccessors(container, partitionId) {
  const accessorNames = [
    'getPartition',
    'getPartitionService',
    'getPartitionDatabase',
    'getDatabase',
  ];
  for (const name of accessorNames) {
    if (container[name]) {
      const found = container[name](partitionId);
      if (found) return found;
    }
  }
  return extractPartitionIdFromRow(container) === partitionId ? container : null;
}

function findPartitionInContainer(container, partitionId) {
  if (!container) return null;
  const fromCollection = findPartitionInCollection(container, partitionId);
  if (fromCollection) return fromCollection;
  return findPartitionViaAccessors(container, partitionId);
}

function resolveFromEngine(engine, partitionId) {
  if (!engine) return null;
  if (engine.partitionServicesProvider) {
    const provided = engine.partitionServicesProvider(partitionId);
    const db = extractSqliteDb(findPartitionInContainer(provided, partitionId));
    if (db) return db;
  }
  if (engine.getPartitionService) {
    return extractSqliteDb(engine.getPartitionService(partitionId));
  }
  return null;
}

function findHostedCandidateInContainers(containers, partitionId) {
  for (const container of containers) {
    const candidate = findPartitionInContainer(container, partitionId);
    if (isHostedPartitionService(candidate)) return candidate;
  }
  return null;
}

function resolveHostedPartitionService(indexService, partitionId) {
  if (!indexService || !partitionId) return null;
  const engine = indexService.sqlQueryEngine;
  return findHostedCandidateInContainers(
    [
      indexService.partitionServices,
      indexService.partitionService,
      indexService.partitionServicesProvider?.(partitionId),
      engine?.partitionServicesProvider?.(partitionId),
      engine?.getPartitionService?.(partitionId),
    ],
    partitionId,
  );
}

function resolvePartitionDatabase(indexService, coordinator, partitionId) {
  if (!partitionId) return null;
  if (coordinator && coordinator.partitionDatabases.has(partitionId)) {
    return extractSqliteDb(coordinator.partitionDatabases.get(partitionId));
  }
  if (resolveHostedPartitionService(indexService, partitionId)) {
    return null;
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
  return resolveFromEngine(indexService.sqlQueryEngine, partitionId);
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
  const schema = resolveDeclaredTableSchema(tableInfo);
  if (schema && Array.isArray(schema.columns)) {
    return schema.columns;
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
  const cache = indexService?.systemTableCache;
  if (!cache) return null;
  if (cache.get) {
    const direct = cache.get(TABLES.TABLES, tableName);
    if (direct) return direct;
  }
  const matchesTable = (row) =>
    Boolean(row && (row.table_name === tableName || row.table_id === tableName));
  if (cache.find) {
    const found = cache.find(TABLES.TABLES, matchesTable);
    if (found) return found;
  }
  if (cache.getAll) {
    const all = cache.getAll(TABLES.TABLES) || [];
    return all.find(matchesTable) || null;
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
  resolveHostedPartitionService,
  resolvePartitionDatabase,
  resolveTableSchemaMetadata,
};
