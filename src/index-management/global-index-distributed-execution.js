/**
 * Distributed runtime execution, dynamic index-partition provisioning, and
 * SystemTableCache catalog propagation helpers for Global Secondary Indexes.
 */

import {TABLES} from '../constants/index.js';
import {buildProvisioningCompletionSummary} from '../query/provisioning-completion-summary.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {
  OWNER_CONTRACT_STATE,
} from '../control-plane/owner-contract-outcome.js';
import {
  SCHEMA_PROVISIONING_ERROR_CODE,
} from '../query/schema-provisioning-job-constants.js';
import {GLOBAL_INDEX_STATE} from './global-index-catalog-contract.js';
import {
  buildIndexDatasetSchema,
  doesDatasetSchemaMatch,
  generateCreateIndexDatasetSql,
  generateDropIndexDatasetSql,
  getGlobalIndexDatasetName,
  parseDatasetTableDdlSchema,
} from './global-index-dataset-manager.js';
import {
  awaitGatewayProjection,
  buildProvisionedIndexMetadata,
  ensureIndexDatasetTableInGateway,
  mergeColumnTypesWithBaseTable,
  reconcilePartitionDatasetKeyType,
  submitControlPlaneMutation,
  verifyGlobalIndexCatalogOwnership,
} from './global-index-dataset-reconciliation.js';
import {
  createParticipantUnavailableError,
  createUnavailableError,
} from './global-index-partition-discovery.js';
import {
  GLOBAL_INDEX_ERROR_CODE,
  GLOBAL_INDEX_STATEMENT_LABEL,
} from './index-constants.js';

const LOCAL_STR_TEXT = 'TEXT';
const SQLITE_OBJECT_TYPE_TABLE = 'table';
const SQL_SELECT_SQLITE_TABLE_DDL =
  'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?';
const GENERATION_ID_SUFFIX_RE = /-gen(\d+)$/u;
const PARTITION_EXECUTOR_REQUIRED_MESSAGE =
  'Canonical partitionExecutor implementing executeOnPartition is required for global ' +
  'index partition execution';
const GLOBAL_INDEX_STATE_ORDER = Object.freeze({
  [GLOBAL_INDEX_STATE.CREATING]: 0,
  [GLOBAL_INDEX_STATE.WRITE_ONLY]: 1,
  [GLOBAL_INDEX_STATE.BACKFILLING]: 2,
  [GLOBAL_INDEX_STATE.READ_WRITE]: 3,
  [GLOBAL_INDEX_STATE.DROPPING]: 4,
  [GLOBAL_INDEX_STATE.FAILED]: 4,
});

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

function createPartitionExecutionFailureError(partitionId, res) {
  const err = createParticipantUnavailableError(partitionId);
  if (res?.error) {
    err.message = `${err.message}: ${res.error}`;
  }
  if (res?.errorCode) err.errorCode = res.errorCode;
  if (res?.failureCode) err.failureCode = res.failureCode;
  if (res?.refusalLayer) err.refusalLayer = res.refusalLayer;
  return err;
}

function requirePartitionExecutor(indexService) {
  const executor = indexService?.partitionExecutor;
  const executeOnPartition = executor?.executeOnPartition;
  if (!executor || typeof executeOnPartition !== 'function') {
    throw createUnavailableError(
      GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
      PARTITION_EXECUTOR_REQUIRED_MESSAGE,
    );
  }
  return {executor, executeOnPartition};
}

async function executePartitionStatement(
  indexService,
  {partitionId, sql, params = [], forRead, deliveryOptions = {}},
) {
  const {executor, executeOnPartition} = requirePartitionExecutor(indexService);
  const normalizedParams = Array.isArray(params) ? params : [];
  const res = await executeOnPartition.call(
    executor,
    partitionId,
    sql,
    normalizedParams,
    Boolean(forRead),
    true,
    false,
    {
      ...deliveryOptions,
      requireLeader: true,
    },
  );
  if (!res || res.success !== true) {
    throw createPartitionExecutionFailureError(partitionId, res);
  }
  return res;
}

async function executePartitionReadSql(indexService, partitionId, sql, params = [], options = {}) {
  const deliveryOptions = {
    ...(options.tableName ? {tableName: options.tableName} : {}),
  };
  const res = await executePartitionStatement(indexService, {
    partitionId,
    sql,
    params,
    forRead: true,
    deliveryOptions,
  });
  return Array.isArray(res.rows) ? res.rows : [];
}

async function executePartitionWriteSql(
  indexService,
  partitionId,
  sql,
  params = [],
  tableName = null,
) {
  const resolvedTableName = typeof tableName === 'string' ?
    tableName :
    tableName?.tableName || null;
  const expectedPartitionVersion = resolveFenceVersion(indexService, resolvedTableName);
  const deliveryOptions = {
    ...(resolvedTableName ? {tableName: resolvedTableName} : {}),
    ...(expectedPartitionVersion !== null && expectedPartitionVersion !== undefined ?
      {expectedPartitionVersion} :
      {}),
  };
  return executePartitionStatement(indexService, {
    partitionId,
    sql,
    params,
    forRead: false,
    deliveryOptions,
  });
}

function hasDistributedPartitionRoute(indexService, partitionId = null) {
  const executor = indexService?.partitionExecutor;
  const executeOnPartition = executor?.executeOnPartition;
  return Boolean(partitionId && executor && typeof executeOnPartition === 'function');
}

function recordPartitionDescriptorLocally(coordinator, runtimeState, partitionMetadata) {
  const pid = partitionMetadata.partition_id;
  const exists = runtimeState.partitionRows.some(
    (row) => row.partition_id === pid,
  );
  if (!exists) {
    runtimeState.partitionRows.push(partitionMetadata);
  }
  if (coordinator && coordinator.indexPartitionsByName) {
    const indexName = partitionMetadata._indexName;
    if (indexName) {
      const existingList = coordinator.indexPartitionsByName.get(indexName) || [];
      if (!existingList.some((p) => p.partition_id === pid)) {
        coordinator.indexPartitionsByName.set(indexName, [...existingList, partitionMetadata]);
      }
    }
  }
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

async function verifyAndSyncDatasetOwnership(indexService, coordinator, identity, onSyncRow) {
  const ownership = await verifyGlobalIndexCatalogOwnership(indexService, coordinator, identity);
  if (ownership.row && coordinator) {
    const existing = coordinator.catalog.get(identity.indexName);
    if (isIncomingCatalogRowNewer(existing, ownership.row)) {
      onSyncRow?.(ownership.row);
    }
  }
  return ownership;
}

function buildPreparedReconciliationContext(indexService, params) {
  const {tableName, indexName, columnNames, basePrimaryKeyColumns, columnTypes} = params;
  const datasetName = getGlobalIndexDatasetName(tableName, indexName);
  const baseTable = indexService?.sqlQueryEngine?.getTableInfo?.(tableName) || null;
  const resolvedTypes = mergeColumnTypesWithBaseTable(baseTable, columnTypes);
  const datasetSchema = buildIndexDatasetSchema({
    tableName, indexName, columnNames, basePrimaryKeyColumns, columnTypes: resolvedTypes,
  });
  return {
    datasetName,
    datasetSchema,
    expectedKeyType: resolvedTypes?.[columnNames[0]] || LOCAL_STR_TEXT,
  };
}

async function createDistributedIndexTable(indexService, partitionId, datasetName, datasetSchema) {
  await executePartitionWriteSql(
    indexService, partitionId, generateCreateIndexDatasetSql(datasetSchema), [], datasetName,
  );
}

async function replaceDistributedIndexTable(
  indexService, partitionId, {tableName, indexName, datasetName, datasetSchema},
) {
  await executePartitionWriteSql(
    indexService, partitionId, generateDropIndexDatasetSql(tableName, indexName), [], datasetName,
  );
  await createDistributedIndexTable(indexService, partitionId, datasetName, datasetSchema);
}

async function reconcileRemoteSqliteDataset(
  indexService, coordinator, params, datasetName, datasetSchema, onSyncRow,
) {
  const {tableName, indexName, indexId = null, generation = null, isRedrive = false, partitionId} =
    params;
  const schemaRows = await executePartitionReadSql(
    indexService, partitionId, SQL_SELECT_SQLITE_TABLE_DDL,
    [SQLITE_OBJECT_TYPE_TABLE, datasetName], {tableName: datasetName},
  );
  const rechecked = await verifyAndSyncDatasetOwnership(
    indexService, coordinator, {indexName, indexId, generation}, onSyncRow,
  );
  if (!rechecked.owned) {
    return {reconciled: false, skipped: true, reason: rechecked.reason};
  }
  if (!Array.isArray(schemaRows) || schemaRows.length === 0) {
    await createDistributedIndexTable(indexService, partitionId, datasetName, datasetSchema);
    return {reconciled: true, dropped: false};
  }
  const actualSchema = parseDatasetTableDdlSchema(schemaRows[0]?.sql);
  const schemaMatches = doesDatasetSchemaMatch(actualSchema, datasetSchema);
  const isOwnedGenReplacement = isRedrive !== true && Number(generation || 1) > 1;
  if (schemaMatches && !isOwnedGenReplacement) {
    return {reconciled: true, dropped: false};
  }
  await replaceDistributedIndexTable(
    indexService, partitionId, {tableName, indexName, datasetName, datasetSchema},
  );
  return {reconciled: true, dropped: true};
}

async function reconcileDistributedIndexDatasetSchema(
  indexService, params, getCoordinator = null, onSyncRow = null,
) {
  requirePartitionExecutor(indexService);
  const {
    tableName, indexName, columnNames, basePrimaryKeyColumns,
    indexId = null, generation = null, partition,
  } = params;
  const coordinator = getCoordinator ? getCoordinator() : resolveCoordinatorForSync(indexService);
  const initialOwnership = await verifyAndSyncDatasetOwnership(
    indexService, coordinator, {indexName, indexId, generation}, onSyncRow,
  );
  if (!initialOwnership.owned) {
    return {reconciled: false, skipped: true, reason: initialOwnership.reason};
  }
  const {datasetName, datasetSchema, expectedKeyType} = buildPreparedReconciliationContext(
    indexService, params,
  );
  await ensureIndexDatasetTableInGateway(indexService, {
    table_name: tableName,
    index_name: indexName,
    column_names: JSON.stringify(columnNames),
    basePrimaryKeyColumns,
  });
  await reconcilePartitionDatasetKeyType(indexService, partition, expectedKeyType);
  return reconcileRemoteSqliteDataset(
    indexService, coordinator, params, datasetName, datasetSchema, onSyncRow,
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
  return {
    ...provResult,
    ...buildProvisioningCompletionSummary(provResult, {replicaCount: built.replicaCount}),
    tableId: built.datasetName,
    partitionId: built.partitionId,
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
  const generation = Number.isSafeInteger(raw.options?.generation) ? raw.options.generation : 1;
  const globalIndex = {
    tableName: raw.tableName,
    indexName: raw.indexName,
    indexId: raw.options?.indexId || `${raw.indexName}-gen${generation}`,
    columnNames: [...(raw.columnNames || [])],
    basePrimaryKeyColumns: [...(raw.basePrimaryKeyColumns || [])],
    generation,
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

function buildDeferredOutcomeStatus(outcome) {
  return {
    deferred: true,
    contractState: outcome.contractState,
    failureCode: outcome.failureCode ?? null,
    nextAction: outcome.nextAction,
    jobId: outcome.jobId ?? null,
    retryAfterMs: outcome.retryAfterMs ?? 0,
  };
}

function resolveProvisioningOutcomeStatus(schemaJobOwner, outcome, capturedError, indexName) {
  const state = outcome?.contractState;
  if (state === OWNER_CONTRACT_STATE.READY ||
      state === OWNER_CONTRACT_STATE.UNDER_REPLICATED) {
    return {deferred: false};
  }
  if (isDeferredContractState(state)) {
    return buildDeferredOutcomeStatus(outcome);
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
    buildDatasetAstForWorkflow(context.built.datasetName, context.built.datasetSchema),
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
  requirePartitionExecutor(indexService);
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

function parseIndexGenerationNumber(row) {
  if (Number.isSafeInteger(row?.index_generation)) return row.index_generation;
  const match = typeof row?.index_id === 'string' ?
    row.index_id.match(GENERATION_ID_SUFFIX_RE) :
    null;
  return match ? Number(match[1]) : 1;
}

function isIncomingCatalogRowNewer(existing, incoming) {
  if (!incoming) return false;
  if (!existing) return true;
  if (existing.index_id !== incoming.index_id) {
    return parseIndexGenerationNumber(incoming) >= parseIndexGenerationNumber(existing);
  }
  const existingOrder = GLOBAL_INDEX_STATE_ORDER[existing.state] ?? -1;
  const incomingOrder = GLOBAL_INDEX_STATE_ORDER[incoming.state] ?? -1;
  if (incomingOrder > existingOrder) return true;
  if (incomingOrder < existingOrder) return false;
  if ((incoming.backfill_total_rows || 0) > (existing.backfill_total_rows || 0)) {
    return true;
  }
  return Boolean(incoming.updated_at && incoming.updated_at !== existing.updated_at);
}

function resolveCoordinatorForSync(indexService) {
  if (indexService.globalIndexCoordinator) {
    return indexService.globalIndexCoordinator;
  }
  return indexService.getGlobalIndexCoordinator ?
    indexService.getGlobalIndexCoordinator() :
    null;
}

function collectSyncSourceRows(indexService, options = {}) {
  const cacheRows = indexService?.systemTableCache?.getAll?.(TABLES.INDICES) || [];
  if (options.includeGatewaySnapshot !== true) {
    return cacheRows;
  }
  const gatewayRows = indexService?.globalIndexWiringState?.indexRows || [];
  return [...cacheRows, ...gatewayRows];
}

function syncCatalogRowIfNewer(indexService, coordinator, row, hydrateFn, syncEntryFn) {
  if (!isRowGlobal(row) || !row.index_name) {
    return;
  }
  const existing = coordinator.catalog.get(row.index_name);
  if (isIncomingCatalogRowNewer(existing, row)) {
    hydrateFn(indexService, coordinator, row);
    syncEntryFn(indexService, coordinator.catalog.get(row.index_name));
  }
}

function syncGlobalIndexesFromSystemCache(
  indexService,
  hydrateFn,
  syncEntryFn,
  options = {},
) {
  const rows = collectSyncSourceRows(indexService, options);
  if (rows.length === 0) {
    return;
  }
  const coordinator = resolveCoordinatorForSync(indexService);
  if (!coordinator) return;

  for (const row of rows) {
    syncCatalogRowIfNewer(indexService, coordinator, row, hydrateFn, syncEntryFn);
  }
}

export {
  executePartitionReadSql,
  executePartitionWriteSql,
  hasDistributedPartitionRoute,
  provisionIndexPartitionsWithRuntime,
  reconcileDistributedIndexDatasetSchema,
  resolveSchemaProvisioningJobOwner,
  syncGlobalIndexesFromSystemCache,
};
