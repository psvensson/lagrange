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
  generateCreateIndexDatasetSql,
  generateDropIndexDatasetSql,
  getGlobalIndexDatasetName,
} from './global-index-dataset-manager.js';
import {
  createParticipantUnavailableError,
  extractPartitionIdFromRow,
  resolveHostedPartitionService,
  resolvePartitionDatabase,
} from './global-index-partition-discovery.js';
import {GLOBAL_INDEX_STATEMENT_LABEL} from './index-constants.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_TEXT = 'TEXT';
// The original TABLES producer persists SQL NULL when no transition exists.
const NO_PARTITION_TRANSITION = null;

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

async function executeExecutorRead(executor, partitionId, sql, params, options) {
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

async function executePartitionReadSql(indexService, partitionId, sql, params = [], options = {}) {
  if (indexService?.queryRouter?.executeReadOnPartition) {
    return executeRemoteReadViaRouter(indexService, partitionId, sql, params);
  }
  const executor = indexService?.sqlQueryEngine?.queryExecutor;
  if (executor?.executeOnPartition) {
    return executeExecutorRead(executor, partitionId, sql, params, options);
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

async function executeExecutorWrite(indexService, executor, partitionId, sql, params, tableName) {
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

async function executeHostedServiceWrite(
  indexService,
  hostedService,
  partitionId,
  sql,
  params,
  tableName,
) {
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
  if (executor?.executeOnPartition) {
    return executeExecutorWrite(indexService, executor, partitionId, sql, params, tableName);
  }
  const hostedService = resolveHostedPartitionService(indexService, partitionId);
  if (hostedService) {
    return executeHostedServiceWrite(
      indexService,
      hostedService,
      partitionId,
      sql,
      params,
      tableName,
    );
  }
  throw createParticipantUnavailableError(partitionId);
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
  return services.some((svc) =>
    svc &&
    (svc.partition_id === partitionId || svc.partitionId === partitionId) &&
    Boolean(svc.node_id || svc.nodeId),
  );
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

function buildDatasetAstForWorkflow(datasetName, datasetSchema, extraOptions = {}) {
  return {
    tableName: datasetName,
    columns: (datasetSchema.columns || []).map((col) => ({
      name: col.name,
      dataType: col.type || LOCAL_STR_TEXT,
      primaryKey: Boolean(col.primaryKey),
      notNull: col.nullable === false && col.notNull !== true ? true : Boolean(col.notNull),
      nullable: col.notNull === true ? false : col.nullable !== false,
    })),
    primaryKey: Array.isArray(datasetSchema.primaryKey) ? datasetSchema.primaryKey : [],
    tableConstraints: [],
    options: extraOptions,
  };
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

async function reconcilePartitionDatasetKeyType(indexService, partition, expectedKeyType) {
  if (!partition || !expectedKeyType) return;
  const currentType = partition.partition_key_type || partition.partitionKeyType || null;
  if (currentType === expectedKeyType) return;
  if (!indexService?.canWriteSystemTable?.()) return;
  const gateway = indexService.getControlPlaneSystemTableGateway?.();
  if (!gateway?.submitMutation) return;

  const pId = extractPartitionIdFromRow(partition);
  const updatedRow = {
    partition_id: pId,
    table_id: partition.table_id || partition.tableId || partition.table_name,
    table_name: partition.table_name || partition.tableName,
    partition_key_start: partition.partition_key_start ?? null,
    partition_key_end: partition.partition_key_end ?? null,
    partition_key_type: expectedKeyType,
    partition_version: partition.partition_version || 1,
    replica_count: partition.replica_count || 1,
    size_bytes: partition.size_bytes ?? 0,
    leader_node_id: partition.leader_node_id ?? null,
    state: partition.state || STATE.NORMAL,
    created_at: partition.created_at || Date.now(),
    updated_at: Date.now(),
  };
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

async function reconcileDistributedIndexDatasetSchema(
  indexService,
  {tableName, indexName, columnNames, basePrimaryKeyColumns, columnTypes, partitionId, partition},
) {
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(tableName) || null;
  const resolvedTypes = mergeColumnTypesWithBaseTable(baseTable, columnTypes);
  const datasetSchema = buildIndexDatasetSchema({
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
    columnTypes: resolvedTypes,
  });
  await ensureIndexDatasetTableInGateway(indexService, {
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
  });
  const expectedKeyType = resolvedTypes?.[columnNames[0]] || LOCAL_STR_TEXT;
  await reconcilePartitionDatasetKeyType(indexService, partition, expectedKeyType);
  if (!hasDistributedPartitionRoute(indexService, partitionId)) {
    return;
  }
  await executePartitionWriteSql(
    indexService,
    partitionId,
    generateDropIndexDatasetSql(tableName, indexName),
    [],
    datasetName,
  );
  await executePartitionWriteSql(
    indexService,
    partitionId,
    generateCreateIndexDatasetSql(datasetSchema),
    [],
    datasetName,
  );
}

function buildWorkflowFailureError(outcome, defaultMessage) {
  const err = new Error(outcome?.error || defaultMessage);
  if (outcome?.errorCode) {
    err.code = outcome.errorCode;
    err.errorCode = outcome.errorCode;
  }
  if (outcome?.failureCode) {
    err.failureCode = outcome.failureCode;
  }
  return err;
}

async function submitProvisioningMetadataMutations(gateway, job, built) {
  if (!gateway?.submitMutation) {
    const err = new Error(
      `Durable control-plane gateway unavailable for '${built.datasetName}'`,
    );
    err.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
    throw err;
  }
  const tableRes = await submitControlPlaneMutation(gateway, {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: TABLES.TABLES,
    row: built.tableMetadata,
  });
  await job.assertOwnership();
  const partitionRes = await submitControlPlaneMutation(gateway, {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
    tableName: TABLES.PARTITIONS,
    row: built.partitionMetadata,
  });
  return [tableRes?.position, partitionRes?.position].filter(Boolean);
}

function normalizeProvisioningContractOutcome(provResult, built) {
  const base = provResult && typeof provResult === 'object' ? provResult : {};
  return {
    ...base,
    tableId: built.datasetName,
    partitionId: built.partitionId,
    contractState: provResult?.contractState === OWNER_CONTRACT_STATE.UNDER_REPLICATED ?
      OWNER_CONTRACT_STATE.UNDER_REPLICATED :
      OWNER_CONTRACT_STATE.READY,
  };
}

async function runProvisioningJobBody({
  gateway,
  job,
  built,
  provisioner,
  timeoutBudget,
  cancellationToken,
  recordPositions,
}) {
  await job.assertOwnership();
  const positions = await submitProvisioningMetadataMutations(gateway, job, built);
  recordPositions(positions);
  await job.assertOwnership();
  const provResult = await provisioner({
    tableId: built.datasetName,
    tableName: built.datasetName,
    tableMetadata: built.tableMetadata,
    partitionId: built.partitionId,
    partitionMetadata: built.partitionMetadata,
    replicaCount: built.replicaCount,
    schema: built.datasetSchema,
    keyRange: {start: null, end: null},
    schemaJobId: job.jobId,
    schemaOwnerFenceToken: job.ownerFenceToken,
    assertProvisioningOwnership: job.assertOwnership,
    timeoutBudget,
    cancellationToken,
  });
  return normalizeProvisioningContractOutcome(provResult, built);
}

function buildProvisioningIntentMetadata(context, built) {
  const raw = context.raw;
  const partitions = [
    {
      partitionId: built.partitionId,
      partitionKeyStart: built.partitionMetadata.partition_key_start ?? null,
      partitionKeyEnd: built.partitionMetadata.partition_key_end ?? null,
      partitionKeyType: built.partitionMetadata.partition_key_type || LOCAL_STR_TEXT,
      replicaCount: built.replicaCount,
    },
  ];
  const globalIndex = {
    tableName: raw.tableName,
    indexName: raw.indexName,
    indexId: raw.options?.indexId || null,
    columnNames: [...(raw.columnNames || [])],
    basePrimaryKeyColumns: [...(raw.basePrimaryKeyColumns || [])],
    generation: Number.isSafeInteger(raw.options?.generation) ? raw.options.generation : 1,
  };
  return {
    tableId: built.datasetName,
    partitionId: built.partitionId,
    partitions,
    globalIndex,
  };
}

function buildSchemaJobExecuteOptions(rawOptions = {}, intentMeta = {}) {
  const timeoutBudget = rawOptions.timeoutBudget ?? null;
  const cancellationToken = rawOptions.cancellationToken ?? null;
  const generation = rawOptions.generation;
  const identityQualifier = Number.isSafeInteger(generation) && generation > 1 ?
    `gen-${generation}` :
    undefined;
  return {
    timeoutBudget,
    cancellationToken,
    executeOptions: {
      timeoutBudget,
      ...intentMeta,
      ...(identityQualifier ? {identityQualifier} : {}),
    },
  };
}

function isDeferredContractState(contractState) {
  return contractState === OWNER_CONTRACT_STATE.DEFERRED ||
    contractState === OWNER_CONTRACT_STATE.PENDING;
}

function resolveProvisioningOutcomeStatus(schemaJobOwner, outcome, capturedError, indexName) {
  if (
    outcome?.contractState === OWNER_CONTRACT_STATE.READY ||
    outcome?.contractState === OWNER_CONTRACT_STATE.UNDER_REPLICATED
  ) {
    return {deferred: false};
  }
  if (isDeferredContractState(outcome?.contractState)) {
    return {
      deferred: true,
      contractState: outcome.contractState,
      failureCode: outcome.failureCode || capturedError?.failureCode || null,
      nextAction: outcome.nextAction || 'retry',
      jobId: outcome.jobId || null,
      retryAfterMs: outcome.retryAfterMs || 0,
    };
  }
  schemaJobOwner.clearScheduledRetry?.(outcome?.jobId);
  throw capturedError || buildWorkflowFailureError(
    outcome,
    `Schema provisioning failed for global index '${indexName}'`,
  );
}

async function executeProvisioningThroughSchemaJob(
  indexService,
  schemaJobOwner,
  context,
  provisioner,
) {
  const gateway = indexService?.getControlPlaneSystemTableGateway?.();
  const intentMeta = buildProvisioningIntentMetadata(context, context.built);
  const {timeoutBudget, cancellationToken, executeOptions} = buildSchemaJobExecuteOptions(
    context.raw.options,
    intentMeta,
  );
  let capturedError = null;
  let metadataPositions = [];

  const outcome = await schemaJobOwner.execute(
    buildDatasetAstForWorkflow(context.built.datasetName, context.built.datasetSchema, intentMeta),
    {
      ...executeOptions,
      onBackgroundSucceeded: async () => {
        await awaitGatewayProjection(
          gateway,
          metadataPositions,
          GLOBAL_INDEX_STATEMENT_LABEL.CREATE_GLOBAL_INDEX,
        );
        await indexService?.completeRecoveredGlobalIndexProvisioning?.(intentMeta);
      },
    },
    async (job) => {
      try {
        capturedError = null;
        return await runProvisioningJobBody({
          gateway,
          job,
          built: context.built,
          provisioner,
          timeoutBudget,
          cancellationToken,
          recordPositions: (positions) => {
            metadataPositions = positions;
          },
        });
      } catch (err) {
        capturedError = err;
        throw err;
      }
    },
  );

  const status = resolveProvisioningOutcomeStatus(
    schemaJobOwner,
    outcome,
    capturedError,
    context.raw.indexName,
  );
  if (status.deferred) {
    return status;
  }
  await awaitGatewayProjection(
    gateway,
    metadataPositions,
    GLOBAL_INDEX_STATEMENT_LABEL.CREATE_GLOBAL_INDEX,
  );
  return {deferred: false};
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
      GLOBAL_INDEX_STATEMENT_LABEL.CREATE_GLOBAL_INDEX,
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
    const jobStatus = await executeProvisioningThroughSchemaJob(
      indexService,
      schemaJobOwner,
      {raw: context, built},
      provisioner,
    );
    if (jobStatus?.deferred) {
      return jobStatus;
    }
  } else {
    await provisionWithoutSchemaJobOwner(indexService, provisioner, built, context);
  }

  const descriptor = {
    ...built.partitionMetadata,
    _indexName: indexName,
  };
  recordPartitionDescriptorLocally(getCoordinator(), runtimeState, descriptor);
  return [{
    ...descriptor,
    _provisionedWithSchema: true,
  }];
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
  hasHostedPartitionReplica,
  provisionIndexPartitionsWithRuntime,
  reconcileDistributedIndexDatasetSchema,
  syncGlobalIndexesFromSystemCache,
};
