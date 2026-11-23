/**
 * Metadata reconciliation and control-plane gateway persistence helpers for Global Secondary Index datasets.
 *
 * @module index-management/global-index-dataset-reconciliation
 */

import {STATE, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_PROFILE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  resolveDeclaredTableSchema,
} from '../partition/partition-boundary-representation.js';
import {
  GLOBAL_INDEX_STATE,
  normalizeGlobalIndexRecord,
} from './global-index-catalog-contract.js';
import {
  buildIndexDatasetSchema,
  getGlobalIndexDatasetName,
} from './global-index-dataset-manager.js';
import {resolveHostedPartitionService} from './global-index-partition-discovery.js';
import {GLOBAL_INDEX_STATEMENT_LABEL} from './index-constants.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_TEXT = 'TEXT';
const NO_PARTITION_TRANSITION = null;
const SQL_SELECT_INDEX_BY_NAME = 'SELECT * FROM indices WHERE index_name = ?';
const OWNERSHIP_REASON = Object.freeze({
  MISSING_CATALOG: 'missing_catalog',
  STALE_GENERATION: 'stale_generation',
  CATALOG_NOT_CREATING: 'catalog_not_creating',
});

function isMatchingHostedServiceRow(svc, partitionId) {
  return Boolean(
    svc &&
    svc.partition_id === partitionId &&
    svc.node_id,
  );
}

function hasHostedPartitionReplica(indexService, partitionId) {
  if (!partitionId) return false;
  if (resolveHostedPartitionService(indexService, partitionId)) {
    return true;
  }
  const cache = indexService?.systemTableCache;
  if (!cache) return false;
  const services = cache.getAll ?
    (cache.getAll(TABLES.SERVICES) || []) :
    (cache.filter?.(TABLES.SERVICES, () => true) || []);
  return services.some((svc) => isMatchingHostedServiceRow(svc, partitionId));
}

function resolveBaseTableColumns(baseTable) {
  if (Array.isArray(baseTable?.columns)) {
    return baseTable.columns;
  }
  return resolveDeclaredTableSchema(baseTable)?.columns;
}

function mergeColumnTypesWithBaseTable(baseTable, columnTypes = {}) {
  const merged = {...(columnTypes || {})};
  const baseCols = resolveBaseTableColumns(baseTable);
  if (Array.isArray(baseCols)) {
    for (const col of baseCols) {
      if (col?.name && col?.type && !merged[col.name]) {
        merged[col.name] = col.type;
      }
    }
  }
  return merged;
}

function buildCanonicalTableRow(
  datasetName,
  columnNames,
  datasetSchema,
  activeVersion,
  now,
) {
  return {
    table_id: datasetName,
    table_name: datasetName,
    schema_definition: JSON.stringify(datasetSchema),
    partition_key: columnNames[0],
    table_policies: JSON.stringify({}),
    partition_count: 1,
    active_partition_version: activeVersion,
    pending_partition_version: null,
    partition_transition_state: NO_PARTITION_TRANSITION,
    partition_transition_metadata: null,
    created_at: now,
    updated_at: now,
  };
}

function buildCanonicalPartitionRow(
  partitionId,
  datasetName,
  partitionKeyType,
  replicaCount,
  now,
) {
  return {
    partition_id: partitionId,
    table_id: datasetName,
    table_name: datasetName,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: partitionKeyType,
    partition_version: 1,
    replica_count: replicaCount,
    size_bytes: 0,
    leader_node_id: null,
    state: STATE.NORMAL,
    created_at: now,
    updated_at: now,
  };
}

function resolveIndexActivePartitionVersion(indexService, tableName) {
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(tableName) || null;
  const ver = baseTable?.active_partition_version;
  return Number.isSafeInteger(ver) ? ver : 1;
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
  const replicaCount = Number.isInteger(context.replicaCount) && context.replicaCount > 0 ?
    context.replicaCount :
    1;
  const now = Date.now();
  const activeVersion = resolveIndexActivePartitionVersion(indexService, tableName);
  const partitionMetadata = buildCanonicalPartitionRow(
    partitionId,
    datasetName,
    partitionKeyType,
    replicaCount,
    now,
  );
  const tableMetadata = buildCanonicalTableRow(
    datasetName,
    columnNames,
    datasetSchema,
    activeVersion,
    now,
  );
  return {datasetName, datasetSchema, partitionId, partitionMetadata, tableMetadata, replicaCount};
}

function findDatasetTableInCache(indexService, datasetName) {
  const cache = indexService?.systemTableCache;
  if (!cache) return null;
  const direct = cache.get?.(TABLES.TABLES, datasetName);
  if (direct) return direct;
  const matchesDataset = (row) =>
    Boolean(row && (row.table_name === datasetName || row.table_id === datasetName));
  if (cache.find) return cache.find(TABLES.TABLES, matchesDataset) || null;
  if (cache.getAll) return (cache.getAll(TABLES.TABLES) || []).find(matchesDataset) || null;
  return null;
}

function doesCachedDatasetTableMatch(cachedRow, tableRow) {
  if (!cachedRow) return false;
  if ((cachedRow.partition_key || null) !== (tableRow.partition_key || null)) {
    return false;
  }
  return (cachedRow.schema_definition || '') === (tableRow.schema_definition || '');
}

async function submitControlPlaneMutation(gateway, mutation) {
  const res = await gateway.submitMutation(mutation, {
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    deliveryPriority: LOCAL_STR_CRITICAL,
  });
  if (res && res.success === false) {
    const err = new Error(res.error || `Failed control-plane mutation for ${mutation.tableName}`);
    if (res.errorCode) err.code = res.errorCode;
    if (res.failureCode) err.failureCode = res.failureCode;
    throw err;
  }
  return res;
}

async function awaitGatewayProjection(gateway, positions, statementLabel) {
  if (!gateway?.awaitProjectionAt || !Array.isArray(positions) || positions.length === 0) {
    return;
  }
  await Promise.all(
    positions.map((pos) => gateway.awaitProjectionAt(pos, {statement: statementLabel})),
  );
}

function buildDatasetTableMetadataRow(indexService, norm, record, datasetName) {
  const pks = record.basePrimaryKeyColumns;
  const pkCols = Array.isArray(pks) && pks.length > 0 ? pks : [LOCAL_STR_ID];
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(norm.tableName) || null;
  const resolvedTypes = mergeColumnTypesWithBaseTable(baseTable, {});
  const datasetSchema = buildIndexDatasetSchema({
    tableName: norm.tableName,
    indexName: norm.indexName,
    columnNames: norm.columnNames,
    basePrimaryKeyColumns: pkCols,
    columnTypes: resolvedTypes,
  });
  return buildCanonicalTableRow(
    datasetName,
    norm.columnNames,
    datasetSchema,
    resolveIndexActivePartitionVersion(indexService, norm.tableName),
    Date.now(),
  );
}

async function ensureIndexDatasetTableInGateway(indexService, record) {
  const norm = normalizeGlobalIndexRecord(record);
  if (!norm.tableName || !norm.indexName) return;
  const datasetName = getGlobalIndexDatasetName(norm.tableName, norm.indexName);
  const tableRow = buildDatasetTableMetadataRow(indexService, norm, record, datasetName);
  const cached = findDatasetTableInCache(indexService, datasetName);
  if (doesCachedDatasetTableMatch(cached, tableRow)) {
    return;
  }
  if (!indexService?.canWriteSystemTable?.()) return;
  const gateway = indexService.getControlPlaneSystemTableGateway?.();
  if (!gateway?.submitMutation) return;

  const res = await submitControlPlaneMutation(gateway, {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: TABLES.TABLES,
    row: tableRow,
  });
  await awaitGatewayProjection(
    gateway,
    [res?.position].filter(Boolean),
    GLOBAL_INDEX_STATEMENT_LABEL.CREATE_GLOBAL_INDEX,
  );
}

function buildUpdatedPartitionKeyTypeRow(partition, expectedKeyType) {
  const now = Date.now();
  return {
    partition_id: partition.partition_id,
    table_id: partition.table_id,
    table_name: partition.table_name,
    partition_key_start: partition.partition_key_start ?? null,
    partition_key_end: partition.partition_key_end ?? null,
    partition_key_type: expectedKeyType,
    partition_version: partition.partition_version,
    replica_count: partition.replica_count,
    size_bytes: partition.size_bytes ?? 0,
    leader_node_id: partition.leader_node_id ?? null,
    state: partition.state,
    created_at: partition.created_at,
    updated_at: now,
  };
}

function resolvePartitionMutationGateway(indexService) {
  if (!indexService?.canWriteSystemTable?.()) return null;
  const gateway = indexService.getControlPlaneSystemTableGateway?.();
  return gateway?.submitMutation ? gateway : null;
}

async function reconcilePartitionDatasetKeyType(indexService, partition, expectedKeyType) {
  if (!partition || !expectedKeyType) return;
  if (partition.partition_key_type === expectedKeyType) return;
  const gateway = resolvePartitionMutationGateway(indexService);
  if (!gateway) return;

  const updatedRow = buildUpdatedPartitionKeyTypeRow(partition, expectedKeyType);
  const res = await submitControlPlaneMutation(gateway, {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: TABLES.PARTITIONS,
    row: updatedRow,
  });
  await awaitGatewayProjection(
    gateway,
    [res?.position].filter(Boolean),
    GLOBAL_INDEX_STATEMENT_LABEL.CREATE_GLOBAL_INDEX,
  );
}

async function readAuthoritativeGlobalIndexRow(indexService, indexName) {
  if (!indexService?.canReadMetadata?.() || !indexName) {
    return {available: false, row: null};
  }
  const gateway = indexService.getControlPlaneSystemTableGateway?.();
  if (!gateway?.readRows) {
    return {available: false, row: null};
  }
  const result = await gateway.readRows(
    TABLES.INDICES,
    SQL_SELECT_INDEX_BY_NAME,
    [indexName],
    {readProfile: CONTROL_PLANE_READ_PROFILE.TABLE_LIFECYCLE},
  );
  if (result?.success === false) {
    return {available: false, row: null};
  }
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return {available: true, row: rows[0] || null};
}

function resolveCatalogRowForOwnership(indexService, coordinator, indexName, authoritative) {
  if (!authoritative.available) {
    return coordinator?.catalog?.get(indexName) || null;
  }
  if (authoritative.row) {
    return authoritative.row;
  }
  if (!indexService?.canWriteSystemTable?.()) {
    return coordinator?.catalog?.get(indexName) || null;
  }
  return null;
}

const OWNERSHIP_CHECK_RULES = Object.freeze([
  {
    reason: OWNERSHIP_REASON.MISSING_CATALOG,
    matches: (row) => !row,
  },
  {
    reason: OWNERSHIP_REASON.STALE_GENERATION,
    matches: (row, coordinator, {indexName, indexId, generation}) =>
      Boolean(
        (indexId && row.index_id !== indexId) ||
        (coordinator &&
         generation !== null &&
         !coordinator._isGenerationCurrent(indexName, generation, row.index_id)),
      ),
  },
  {
    reason: OWNERSHIP_REASON.CATALOG_NOT_CREATING,
    matches: (row) => row.state !== GLOBAL_INDEX_STATE.CREATING,
  },
]);

async function verifyGlobalIndexCatalogOwnership(
  indexService,
  coordinator,
  {indexName, indexId = null, generation = null},
) {
  const authoritative = await readAuthoritativeGlobalIndexRow(indexService, indexName);
  const row = resolveCatalogRowForOwnership(indexService, coordinator, indexName, authoritative);
  const matchedRule = OWNERSHIP_CHECK_RULES.find(
    (rule) => rule.matches(row, coordinator, {indexName, indexId, generation}),
  );
  if (matchedRule) {
    return {
      owned: false,
      reason: matchedRule.reason,
      ...(row?.state !== undefined ? {state: row.state} : {}),
      row,
    };
  }
  return {owned: true, row};
}

export {
  awaitGatewayProjection,
  buildProvisionedIndexMetadata,
  ensureIndexDatasetTableInGateway,
  hasHostedPartitionReplica,
  mergeColumnTypesWithBaseTable,
  readAuthoritativeGlobalIndexRow,
  reconcilePartitionDatasetKeyType,
  submitControlPlaneMutation,
  verifyGlobalIndexCatalogOwnership,
};
