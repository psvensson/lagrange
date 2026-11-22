/**
 * Distributed runtime execution, dynamic index-partition provisioning, and
 * SystemTableCache catalog propagation helpers for Global Secondary Indexes.
 */

import {STATE, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {
  LEADER_READ_REQUEST_FIELD,
  LEADER_REQUIRED_READ,
} from '../control-plane/control-plane-owner-fact-read-contract.js';
import {OWNER_CONTRACT_STATE} from '../control-plane/owner-contract-outcome.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  resolveDeclaredTableSchema,
} from '../partition/partition-boundary-representation.js';
import {
  decodePartitionResponseRows,
} from '../query/query-executor-partition-request-builders.js';
import {
  SCHEMA_PROVISIONING_ERROR_CODE,
} from '../query/schema-provisioning-job-constants.js';
import {normalizeGlobalIndexRecord} from './global-index-catalog-contract.js';
import {
  buildIndexDatasetSchema,
  getGlobalIndexDatasetName,
} from './global-index-dataset-manager.js';
import {
  createParticipantUnavailableError,
  extractPartitionIdFromRow,
  resolveHostedPartitionService,
  resolvePartitionDatabase,
} from './global-index-partition-discovery.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_TEXT = 'TEXT';

function resolveProvisionerCallback(indexService) {
  if (indexService?.partitionProvisioner) {
    return indexService.partitionProvisioner;
  }
  return indexService?.sqlQueryEngine?.tableCreationService?.partitionProvisioner || null;
}

function resolveSchemaProvisioningJobOwner(indexService) {
  return indexService?.sqlQueryEngine?.tableCreationService?.schemaProvisioningJobOwner || null;
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

async function executeHostedServiceRead(service, partitionId, sql, params) {
  const res = await service.handleRemoteQuery({
    sql,
    params,
    [LEADER_READ_REQUEST_FIELD]: LEADER_REQUIRED_READ,
  });
  if (!res || res.success !== true) {
    throw createWriteExecutionUnavailableError(partitionId, res);
  }
  return decodePartitionResponseRows(res).rows;
}

async function executePartitionReadSql(indexService, partitionId, sql, params = [], options = {}) {
  if (indexService?.queryRouter?.executeReadOnPartition) {
    return executeRemoteReadViaRouter(indexService, partitionId, sql, params);
  }
  const executor = indexService?.sqlQueryEngine?.queryExecutor;
  if (executor && executor.executeOnPartition) {
    const readOptions = {
      requireLeader: true,
      ...(options.tableName ? {tableName: options.tableName} : {}),
    };
    const res = await executor.executeOnPartition(
      partitionId,
      sql,
      params,
      true,
      true,
      false,
      readOptions,
    );
    if (!res || res.success !== true) {
      throw createWriteExecutionUnavailableError(partitionId, res);
    }
    return Array.isArray(res.rows) ? res.rows : [];
  }
  const hostedService = resolveHostedPartitionService(indexService, partitionId);
  if (hostedService) {
    return executeHostedServiceRead(hostedService, partitionId, sql, params);
  }
  const unitTestDb = resolvePartitionDatabase(indexService, null, partitionId);
  if (unitTestDb) {
    return unitTestDb.prepare(sql).all(...params);
  }
  throw createParticipantUnavailableError(partitionId);
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
  const hostedService = resolveHostedPartitionService(indexService, partitionId);
  if (hostedService) {
    const expectedPartitionVersion = resolveFenceVersion(indexService, tableName);
    const res = await hostedService.handleRemoteQuery({
      sql,
      params,
      ...(expectedPartitionVersion !== null ? {expectedPartitionVersion} : {}),
    });
    if (!res || res.success !== true) {
      throw createWriteExecutionUnavailableError(partitionId, res);
    }
    return res;
  }
  throw createParticipantUnavailableError(partitionId);
}

function hasDistributedPartitionRoute(indexService, partitionId = null) {
  if (indexService?.queryRouter?.executeWriteOnPartition) {
    return true;
  }
  if (indexService?.sqlQueryEngine?.queryExecutor?.executeOnPartition) {
    return true;
  }
  return Boolean(partitionId && resolveHostedPartitionService(indexService, partitionId));
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
  const baseSchema = resolveDeclaredTableSchema(baseTable);
  const baseCols = baseTable?.columns || baseSchema?.columns;
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
    partition_transition_state: null,
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

function buildDatasetAstForWorkflow(datasetName, datasetSchema) {
  return {
    tableName: datasetName,
    columns: (datasetSchema.columns || []).map((col) => ({
      name: col.name,
      dataType: col.type || LOCAL_STR_TEXT,
      primaryKey: Boolean(col.primaryKey),
      notNull: col.nullable === false,
      nullable: col.nullable !== false,
    })),
    primaryKey: Array.isArray(datasetSchema.primaryKey) ? datasetSchema.primaryKey : [],
    tableConstraints: [],
    options: {},
  };
}

function hasDatasetTableInCache(indexService, datasetName) {
  const cache = indexService?.systemTableCache;
  if (!cache) return false;
  if (cache.get?.(TABLES.TABLES, datasetName)) return true;
  const matchesDataset = (row) =>
    Boolean(row && (row.table_name === datasetName || row.table_id === datasetName));
  if (cache.find) return Boolean(cache.find(TABLES.TABLES, matchesDataset));
  if (cache.getAll) return (cache.getAll(TABLES.TABLES) || []).some(matchesDataset);
  return false;
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

async function ensureIndexDatasetTableInGateway(indexService, record) {
  const norm = normalizeGlobalIndexRecord(record);
  if (!norm.tableName || !norm.indexName) return;
  const datasetName = getGlobalIndexDatasetName(norm.tableName, norm.indexName);
  if (hasDatasetTableInCache(indexService, datasetName)) {
    return;
  }
  if (!indexService?.canWriteSystemTable?.()) return;
  const gateway = indexService.getControlPlaneSystemTableGateway?.();
  if (!gateway?.submitMutation) return;

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
  const tableRow = buildCanonicalTableRow(
    datasetName,
    norm.columnNames,
    datasetSchema,
    resolveIndexActivePartitionVersion(indexService, norm.tableName),
    Date.now(),
  );
  const res = await submitControlPlaneMutation(gateway, {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: TABLES.TABLES,
    row: tableRow,
  });
  await awaitGatewayProjection(gateway, [res?.position].filter(Boolean), 'CREATE GLOBAL INDEX');
}

function buildWorkflowFailureError(outcome, fallbackMessage) {
  const err = new Error(outcome?.error || fallbackMessage);
  if (outcome?.errorCode) {
    err.code = outcome.errorCode;
    err.errorCode = outcome.errorCode;
  }
  if (outcome?.failureCode) {
    err.failureCode = outcome.failureCode;
  }
  return err;
}

async function executeProvisioningThroughSchemaJob(
  indexService,
  schemaJobOwner,
  context,
  provisioner,
) {
  const {
    datasetName,
    datasetSchema,
    partitionId,
    partitionMetadata,
    tableMetadata,
    replicaCount,
  } = context.built;
  const gateway = indexService?.getControlPlaneSystemTableGateway?.();
  const generation = context.raw.options?.generation;
  const identityQualifier = Number.isSafeInteger(generation) && generation > 1 ?
    `gen-${generation}` :
    undefined;
  let capturedError = null;
  let metadataPositions = [];

  const outcome = await schemaJobOwner.execute(
    buildDatasetAstForWorkflow(datasetName, datasetSchema),
    {
      timeoutBudget: context.raw.options?.timeoutBudget ?? context.raw.timeoutBudget,
      ...(identityQualifier ? {identityQualifier} : {}),
    },
    async (job) => {
      try {
        await job.assertOwnership();
        if (!gateway?.submitMutation) {
          const err = new Error(
            `Durable control-plane gateway unavailable for '${datasetName}'`,
          );
          err.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
          throw err;
        }
        const tableRes = await submitControlPlaneMutation(gateway, {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
          tableName: TABLES.TABLES,
          row: tableMetadata,
        });
        await job.assertOwnership();
        const partitionRes = await submitControlPlaneMutation(gateway, {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
          tableName: TABLES.PARTITIONS,
          row: partitionMetadata,
        });
        metadataPositions = [tableRes?.position, partitionRes?.position].filter(Boolean);
        await job.assertOwnership();
        const provResult = await provisioner({
          tableId: datasetName,
          tableName: datasetName,
          tableMetadata,
          partitionId,
          partitionMetadata,
          replicaCount,
          schema: datasetSchema,
          keyRange: {start: null, end: null},
          schemaJobId: job.jobId,
          schemaOwnerFenceToken: job.ownerFenceToken,
          assertProvisioningOwnership: job.assertOwnership,
          timeoutBudget: context.raw.options?.timeoutBudget ?? context.raw.timeoutBudget,
          cancellationToken: context.raw.options?.cancellationToken ?? null,
        });
        return {
          ...(provResult && typeof provResult === 'object' ? provResult : {}),
          contractState: provResult?.contractState === OWNER_CONTRACT_STATE.UNDER_REPLICATED ?
            OWNER_CONTRACT_STATE.UNDER_REPLICATED :
            OWNER_CONTRACT_STATE.READY,
        };
      } catch (err) {
        capturedError = err;
        throw err;
      }
    },
  );

  if (
    outcome?.contractState !== OWNER_CONTRACT_STATE.READY &&
    outcome?.contractState !== OWNER_CONTRACT_STATE.UNDER_REPLICATED
  ) {
    schemaJobOwner.clearScheduledRetry?.(outcome?.jobId);
    throw capturedError || buildWorkflowFailureError(
      outcome,
      `Schema provisioning failed for global index '${context.raw.indexName}'`,
    );
  }
  await awaitGatewayProjection(gateway, metadataPositions, 'CREATE GLOBAL INDEX');
}

async function provisionWithoutSchemaJobOwner(indexService, provisioner, built, context) {
  await provisioner({
    tableId: built.datasetName,
    tableName: built.datasetName,
    tableMetadata: built.tableMetadata,
    partitionId: built.partitionId,
    partitionMetadata: built.partitionMetadata,
    replicaCount: built.replicaCount,
    schema: built.datasetSchema,
    keyRange: {start: null, end: null},
    ...(context.schemaJobId !== undefined ? {schemaJobId: context.schemaJobId} : {}),
    ...(context.partitionWorkflowId !== undefined ?
      {partitionWorkflowId: context.partitionWorkflowId} : {}),
  });
  const gateway = indexService?.canWriteSystemTable?.() ?
    indexService.getControlPlaneSystemTableGateway?.() :
    null;
  if (gateway?.submitMutation) {
    const tableRes = await submitControlPlaneMutation(gateway, {
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.TABLES,
      row: built.tableMetadata,
    });
    const partRes = await submitControlPlaneMutation(gateway, {
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.PARTITIONS,
      row: built.partitionMetadata,
    });
    await awaitGatewayProjection(
      gateway,
      [tableRes?.position, partRes?.position].filter(Boolean),
      'CREATE GLOBAL INDEX',
    );
  }
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

  const built = buildProvisionedIndexMetadata(indexService, context);
  const explicitIdentity = context.schemaJobId !== undefined ||
    context.partitionWorkflowId !== undefined;
  const schemaJobOwner = explicitIdentity ?
    null :
    resolveSchemaProvisioningJobOwner(indexService);

  if (schemaJobOwner) {
    await executeProvisioningThroughSchemaJob(
      indexService,
      schemaJobOwner,
      {raw: context, built},
      provisioner,
    );
  } else {
    await provisionWithoutSchemaJobOwner(indexService, provisioner, built, context);
  }

  const descriptor = {
    ...built.partitionMetadata,
    _provisionedWithSchema: true,
    _indexName: indexName,
  };
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
  ensureIndexDatasetTableInGateway,
  executePartitionReadSql,
  executePartitionWriteSql,
  hasDistributedPartitionRoute,
  provisionIndexPartitionsWithRuntime,
  syncGlobalIndexesFromSystemCache,
};
