/**
 * Provisioning, deferred join/retry completion, and crash-recovery lifecycle helpers
 * for Global Secondary Index creation.
 *
 * @module index-management/global-index-provisioning-lifecycle
 */

import {
  GLOBAL_INDEX_STATE,
  isSameGlobalIndexDefinition,
  normalizeGlobalIndexRecord,
  resolveGlobalCreateSchemaContext,
} from './global-index-catalog-contract.js';

const LOCAL_STR_ID = 'id';
const PARTICIPANT_UNAVAILABLE_PREFIX = 'Index participant database unavailable';
const ERROR_CODE_PARTICIPANT_UNAVAILABLE = 'INDEX_PARTICIPANT_UNAVAILABLE';
const ACTIVE_CREATION_STATES = new Set([
  GLOBAL_INDEX_STATE.CREATING,
  GLOBAL_INDEX_STATE.WRITE_ONLY,
  GLOBAL_INDEX_STATE.BACKFILLING,
]);

function resolvePartitionId(partition) {
  return partition.partition_id !== undefined ?
    partition.partition_id :
    partition.partitionId;
}

function isPartitionReadyForIndex(coordinator, partition) {
  const pId = resolvePartitionId(partition);
  if (partition._provisionedWithSchema || coordinator._getPartitionDb(pId)) {
    return true;
  }
  if (!coordinator.hasDistributedPartitionRoute?.(pId)) {
    return false;
  }
  if (coordinator.hasHostedPartitionReplica) {
    return Boolean(
      partition.leader_node_id ||
      coordinator.hasHostedPartitionReplica(pId),
    );
  }
  return true;
}

function createParticipantUnavailableError(partitionId) {
  const error = new Error(`${PARTICIPANT_UNAVAILABLE_PREFIX}: ${partitionId}`);
  error.code = ERROR_CODE_PARTICIPANT_UNAVAILABLE;
  return error;
}

function reconcileLocalDataset(coordinator, db, meta, reconcileExisting) {
  if (reconcileExisting === true) {
    coordinator.datasetManager.dropIndexDataset(db, meta.tableName, meta.indexName);
  }
  coordinator.datasetManager.createIndexDataset(db, meta);
}

function shouldReconcileRemoteDataset(coordinator, partitionId, options) {
  return Boolean(
    options.reconcileExisting === true &&
    !options.justProvisioned &&
    coordinator.onReconcileIndexDataset &&
    coordinator.hasDistributedPartitionRoute?.(partitionId),
  );
}

function assertPartitionAvailability(coordinator, partition, partitionId) {
  const remoteReady = partition._provisionedWithSchema ||
    Boolean(coordinator.hasDistributedPartitionRoute?.(partitionId));
  if (!remoteReady && coordinator.resolvePartitionDatabase) {
    throw createParticipantUnavailableError(partitionId);
  }
}

async function provisionSingleIndexDataset(coordinator, partition, meta, options = {}) {
  const pId = resolvePartitionId(partition);
  const db = coordinator._getPartitionDb(pId);
  if (db) {
    reconcileLocalDataset(coordinator, db, meta, options.reconcileExisting);
    return;
  }
  if (shouldReconcileRemoteDataset(coordinator, pId, options)) {
    await coordinator.onReconcileIndexDataset({...meta, partitionId: pId, partition});
    return;
  }
  assertPartitionAvailability(coordinator, partition, pId);
}

async function invokePartitionProvisioning(coordinator, context) {
  return coordinator.provisionIndexPartitions({
    tableName: context.tableName,
    indexName: context.indexName,
    columnNames: context.columnNames,
    basePrimaryKeyColumns: context.basePrimaryKeyColumns,
    columnTypes: context.options.columnTypes || {},
    options: context.options,
  });
}

async function resolveTargetPartitionsForCreation(coordinator, context) {
  const existing = coordinator.getIndexPartitions(context.indexName);
  const allReady = existing.length > 0 &&
    existing.every((p) => isPartitionReadyForIndex(coordinator, p));
  if (allReady || !coordinator.provisionIndexPartitions) {
    return {partitions: existing, reconcileExisting: allReady, justProvisioned: false};
  }
  const provResult = await invokePartitionProvisioning(coordinator, context);
  if (provResult && !Array.isArray(provResult) && provResult.deferred === true) {
    return {deferredResult: provResult};
  }
  return {
    partitions: Array.isArray(provResult) ? provResult : [],
    reconcileExisting: false,
    justProvisioned: true,
  };
}

function assertPartitionsAvailableForIndex(coordinator, partitions, indexName) {
  const requiresNonEmpty = Boolean(
    coordinator.resolvePartitionDatabase || coordinator.hasDistributedPartitionRoute,
  );
  if (requiresNonEmpty && partitions.length === 0) {
    throw new Error(`No index partitions available for global index '${indexName}'`);
  }
}

async function provisionIndexDatasetsForCreation(
  coordinator,
  {tableName, indexName, columnNames, basePrimaryKeyColumns, options},
) {
  const resolved = await resolveTargetPartitionsForCreation(coordinator, {
    tableName, indexName, columnNames, basePrimaryKeyColumns, options,
  });
  if (resolved.deferredResult) {
    return resolved.deferredResult;
  }
  assertPartitionsAvailableForIndex(coordinator, resolved.partitions, indexName);
  const meta = {
    tableName,
    indexName,
    columnNames,
    basePrimaryKeyColumns,
    columnTypes: options.columnTypes || {},
  };
  for (const p of resolved.partitions) {
    await provisionSingleIndexDataset(coordinator, p, meta, {
      reconcileExisting: resolved.reconcileExisting,
      justProvisioned: resolved.justProvisioned,
    });
  }
  return {deferred: false};
}

function resolveCreateBasePkColumns(record, schemaCtx) {
  if (record.basePrimaryKeyColumns?.length > 0) {
    return record.basePrimaryKeyColumns;
  }
  if (schemaCtx.basePrimaryKeyColumns.length > 0) {
    return schemaCtx.basePrimaryKeyColumns;
  }
  return [LOCAL_STR_ID];
}

function resolveRecoveredBasePkColumns(record, schemaInfo) {
  if (record.basePrimaryKeyColumns?.length > 0) {
    return record.basePrimaryKeyColumns;
  }
  if (schemaInfo?.basePrimaryKeyColumns?.length > 0) {
    return schemaInfo.basePrimaryKeyColumns;
  }
  return [LOCAL_STR_ID];
}

async function advanceRecordThroughBackfillStages(coordinator, record, currentGen, options) {
  const indexId = record.index_id;
  const indexName = record.index_name;
  if (!coordinator._isGenerationCurrent(indexName, currentGen, indexId)) {
    return {indexId, indexName, generation: currentGen, fenced: true};
  }
  const currentRecord = coordinator.catalog.get(indexName) || record;
  if (currentRecord.state === GLOBAL_INDEX_STATE.READ_WRITE) {
    return coordinator.getCatalogRecord(indexName);
  }
  if (currentRecord.state === GLOBAL_INDEX_STATE.CREATING) {
    await coordinator._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.WRITE_ONLY});
  }
  const updatedState = (coordinator.catalog.get(indexName) || currentRecord).state;
  if (updatedState === GLOBAL_INDEX_STATE.CREATING ||
      updatedState === GLOBAL_INDEX_STATE.WRITE_ONLY) {
    await coordinator._updateCatalogRecord({indexId, state: GLOBAL_INDEX_STATE.BACKFILLING});
  }
  if (options.deferBackfill === true) {
    return {
      indexId,
      indexName,
      generation: currentGen,
      state: GLOBAL_INDEX_STATE.BACKFILLING,
      deferred: true,
    };
  }
  return coordinator._runBackfillToCompletion(
    coordinator.catalog.get(indexName) || record,
    currentGen,
    options,
  );
}

async function advanceProvisionedIndexToReady(coordinator, record, currentGen, options = {}) {
  const indexId = record.index_id;
  if (coordinator.inFlightCompletionsByIndexId.has(indexId)) {
    return coordinator.inFlightCompletionsByIndexId.get(indexId);
  }
  const runCompletion = advanceRecordThroughBackfillStages(
    coordinator, record, currentGen, options,
  );
  coordinator.inFlightCompletionsByIndexId.set(indexId, runCompletion);
  try {
    return await runCompletion;
  } finally {
    if (coordinator.inFlightCompletionsByIndexId.get(indexId) === runCompletion) {
      coordinator.inFlightCompletionsByIndexId.delete(indexId);
    }
  }
}

function buildDeferredCreationResult(def, indexId, currentGen, provOutcome) {
  return {
    indexId,
    indexName: def.indexName,
    tableName: def.tableName,
    generation: currentGen,
    state: GLOBAL_INDEX_STATE.CREATING,
    deferred: true,
    contractState: provOutcome.contractState,
    failureCode: provOutcome.failureCode ?? null,
    nextAction: provOutcome.nextAction,
    jobId: provOutcome.jobId ?? null,
    retryAfterMs: provOutcome.retryAfterMs ?? 0,
  };
}

async function driveGlobalIndexProvisioning(coordinator, record, def, options = {}) {
  const {indexName, tableName, columnNames} = def;
  const currentGen = record.index_generation ?? 1;
  const indexId = record.index_id;
  const schemaInfo = coordinator.resolveTableSchema ?
    coordinator.resolveTableSchema(tableName) :
    null;
  const schemaCtx = resolveGlobalCreateSchemaContext(def, options, schemaInfo);
  const basePrimaryKeyColumns = resolveCreateBasePkColumns(record, schemaCtx);
  record.basePrimaryKeyColumns = basePrimaryKeyColumns;

  let provOutcome;
  try {
    provOutcome = await provisionIndexDatasetsForCreation(coordinator, {
      tableName,
      indexName,
      columnNames,
      basePrimaryKeyColumns,
      options: {...options, columnTypes: schemaCtx.columnTypes, generation: currentGen, indexId},
    });
  } catch (err) {
    await coordinator._updateCatalogRecord({
      indexId,
      state: GLOBAL_INDEX_STATE.FAILED,
      errorMessage: err.message,
    });
    throw err;
  }

  if (provOutcome?.deferred === true) {
    return buildDeferredCreationResult(def, indexId, currentGen, provOutcome);
  }
  return advanceProvisionedIndexToReady(coordinator, record, currentGen, options);
}

function ensureLocalPartitionDatasets(coordinator, indexName, meta) {
  for (const p of coordinator.getIndexPartitions(indexName)) {
    const db = coordinator._getPartitionDb(resolvePartitionId(p));
    if (db) {
      coordinator.datasetManager.createIndexDataset(db, meta);
    }
  }
}

function findRecoverableCatalogRecord(coordinator, {indexName, indexId, generation}) {
  const record = coordinator.catalog.get(indexName);
  if (!record) return null;
  if (indexId && record.index_id !== indexId) return null;
  const targetGen = generation ?? record.index_generation ?? 1;
  if (!coordinator._isGenerationCurrent(indexName, targetGen, record.index_id)) {
    return null;
  }
  return {record, targetGen};
}

async function completeRecoveredProvisioning(
  coordinator,
  {indexName, indexId = null, generation = null} = {},
) {
  if (coordinator.refreshCatalogPartitions) {
    await coordinator.refreshCatalogPartitions();
  }
  const found = findRecoverableCatalogRecord(coordinator, {indexName, indexId, generation});
  if (!found) {
    return {indexName, indexId, fenced: true};
  }
  const {record, targetGen} = found;
  const norm = normalizeGlobalIndexRecord(record);
  const schemaInfo = coordinator.resolveTableSchema ?
    coordinator.resolveTableSchema(norm.tableName) :
    null;
  const basePrimaryKeyColumns = resolveRecoveredBasePkColumns(record, schemaInfo);
  record.basePrimaryKeyColumns = basePrimaryKeyColumns;
  ensureLocalPartitionDatasets(coordinator, indexName, {
    tableName: norm.tableName,
    indexName,
    columnNames: norm.columnNames,
    basePrimaryKeyColumns,
    columnTypes: schemaInfo?.columnTypes || {},
  });
  return advanceProvisionedIndexToReady(coordinator, record, targetGen, {});
}

function resolveExistingCreateAction(coordinator, def, options) {
  const existing = coordinator.catalog.get(def.indexName);
  if (!existing) return null;
  if (ACTIVE_CREATION_STATES.has(existing.state) && isSameGlobalIndexDefinition(existing, def)) {
    const existingIndexId = existing.index_id;
    if (coordinator.inFlightCompletionsByIndexId.has(existingIndexId)) {
      return {awaitCompletion: coordinator.inFlightCompletionsByIndexId.get(existingIndexId)};
    }
    if (existing.state === GLOBAL_INDEX_STATE.CREATING) {
      return {redrive: existing};
    }
    return {
      immediateResult: {
        indexId: existingIndexId,
        indexName: def.indexName,
        tableName: def.tableName,
        generation: existing.index_generation ?? 1,
        state: existing.state,
        deferred: true,
      },
    };
  }
  if (def.ifNotExists === true || options.ifNotExists === true) {
    return {immediateResult: coordinator.getCatalogRecord(def.indexName)};
  }
  throw new Error(`Index '${def.indexName}' already exists`);
}

export {
  completeRecoveredProvisioning,
  driveGlobalIndexProvisioning,
  provisionIndexDatasetsForCreation,
  provisionSingleIndexDataset,
  resolveExistingCreateAction,
};
