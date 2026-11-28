import {validateUserTableCreateIntent} from './user-table-create-intent.js';
import {v4 as uuidv4} from 'uuid';
import {resolveDeclaredPartitionKeyType} from '../partition/partition-boundary-representation.js';
import {STATE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
} from './query-constants.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  './schema-provisioning-job-constants.js';
import {
  buildCreateTableSuccessResult,
  resolveTableCreationCompletion,
} from './table-creation-service-completion.js';
import {
  buildSchemaDefinition,
  derivePartitionKey,
} from './table-creation-service-schema-derivation.js';

const EMPTY_SCHEMA_DEFINITION_JSON = '{}';

const CREATE_TABLE_ACTION = Object.freeze({
  RECONCILE_EXISTING: 'reconcile_existing',
  THROW_TABLE_EXISTS: 'throw_table_exists',
  CREATE_PERSISTED: 'create_persisted',
});

/**
 * Pure CREATE TABLE action decision from normalized facts.
 * @param {Object} input
 * @param {Object} input.ast - Parsed CREATE TABLE AST.
 * @param {Object} [input.options] - Provisioning options.
 * @param {Object|null} [input.existingTable] - Canonical existing table row.
 * @return {{action: string}}
 */
function decideCreateTableAction({
  ast,
  options = {},
  existingTable = null,
} = {}) {
  if (existingTable) {
    if (ast?.ifNotExists) {
      return {action: CREATE_TABLE_ACTION.RECONCILE_EXISTING};
    }
    if (options?.schemaJobId) {
      return {action: CREATE_TABLE_ACTION.RECONCILE_EXISTING};
    }
    return {action: CREATE_TABLE_ACTION.THROW_TABLE_EXISTS};
  }
  return {action: CREATE_TABLE_ACTION.CREATE_PERSISTED};
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function resolveComparableDefaultValue(derivedCol, rawCol) {
  if (derivedCol.defaultValue !== undefined) return derivedCol.defaultValue;
  if (rawCol?.defaultValue !== undefined) return rawCol.defaultValue;
  return null;
}

function projectComparableSchema(schema) {
  const cols = Array.isArray(schema?.columns) ? schema.columns : [];
  const derived = buildSchemaDefinition({
    columns: cols,
    primaryKey: schema?.primaryKey,
    tableConstraints: schema?.tableConstraints,
  });
  return sortObject({
    columns: derived.columns.map((col, idx) => ({
      name: col.name,
      type: col.type,
      notNull: col.notNull,
      collation: col.collation,
      unique: col.unique,
      checkSql: col.checkSql,
      defaultValue: resolveComparableDefaultValue(col, cols[idx]),
    })),
    primaryKey: (Array.isArray(derived.primaryKey) ? derived.primaryKey : [])
      .map((name) => String(name || '').toLowerCase()),
    tableConstraints: derived.tableConstraints || [],
  });
}

function assertDurableMetadataIdentity(existingTable, ast, options) {
  if (!options.schemaJobId) return;
  const existingTableId = existingTable.table_id;
  const expectedSchema = sortObject(
    buildSchemaDefinition(ast.columns, ast),
  );
  let existingSchema = {};
  try {
    existingSchema = sortObject(JSON.parse(
      existingTable.schema_definition || EMPTY_SCHEMA_DEFINITION_JSON,
    ));
  } catch {
    existingSchema = {};
  }
  if (existingTableId === options.tableId) {
    if (JSON.stringify(existingSchema) === JSON.stringify(expectedSchema)) {
      return;
    }
    if (
      options.globalIndex &&
      JSON.stringify(projectComparableSchema(existingSchema)) ===
        JSON.stringify(projectComparableSchema(ast))
    ) {
      return;
    }
  }
  const error = new Error(
    `Existing table metadata conflicts with schema job ${options.schemaJobId}`,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT;
  throw error;
}

function requireDurableMetadataGateway(service, options) {
  if (!options.schemaJobId) return null;
  const gateway = service.getControlPlaneSystemTableGateway();
  if (gateway) return gateway;
  const error = new Error(
    `Schema job ${options.schemaJobId} metadata persistence is unavailable`,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
  throw error;
}

function createTableExistsError(tableName) {
  const error = new Error(
    `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
    QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
  );
  error.code = QUERY_ERROR_CODE.TABLE_EXISTS;
  return error;
}

function buildExistingReconciliationOptions(options) {
  const src = options || {};
  return {
    timeoutBudget: src.timeoutBudget,
    cancellationToken: src.cancellationToken ?? null,
    partitionId: src.partitionId ?? null,
    partitions: src.partitions ?? null,
    globalIndex: src.globalIndex ?? null,
    schemaJobId: src.schemaJobId ?? null,
    schemaOwnerFenceToken: src.schemaOwnerFenceToken ?? null,
    assertProvisioningOwnership: src.assertProvisioningOwnership ?? null,
  };
}

function extractProvisioningResultFields(summary) {
  if (!summary) {
    return {
      epoch: null,
      requestedReplicaCount: null,
      committedReplicaCount: null,
      missingReplicaCount: 0,
    };
  }
  return {
    epoch: summary.epoch || null,
    requestedReplicaCount:
      summary.requestedReplicaCount !== undefined ?
        summary.requestedReplicaCount :
        null,
    committedReplicaCount:
      summary.committedReplicaCount !== undefined ?
        summary.committedReplicaCount :
        null,
    missingReplicaCount:
      Number.isInteger(summary.missingReplicaCount) ?
        summary.missingReplicaCount :
        0,
  };
}

function buildExistingTableResult(ast, existingTable, reconciliation) {
  const provisioningSummary = reconciliation?.provisioningSummary || null;
  const completion = resolveTableCreationCompletion({provisioningSummary});
  return buildCreateTableSuccessResult({
    tableId: existingTable.table_id,
    tableName: ast.tableName,
    partitionKey: existingTable.partition_key,
    partitionId: reconciliation?.partitionId || null,
    columns: ast.columns.length,
    skipped: true,
    completionState: completion.completionState,
    completionReason: completion.completionReason,
    contractState: completion.contractState,
    nextAction: completion.nextAction,
    ...extractProvisioningResultFields(provisioningSummary),
    partitionMetadataCreated:
      reconciliation?.partitionMetadataCreated === true,
    provisioningSummary,
    message:
      `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${ast.tableName}` +
      QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
  });
}

async function reconcileExistingCreateTable(
  service,
  ast,
  options,
  existingTable,
) {
  assertDurableMetadataIdentity(existingTable, ast, options);
  const reconciliation = await service.reconcileExistingInitialPartition(
    ast.tableName,
    existingTable,
    buildExistingReconciliationOptions(options),
  );
  service.logger.debug(QUERY_LOG_MSG.TABLE_EXISTS_SKIP, {
    tableName: ast.tableName,
  });
  return buildExistingTableResult(ast, existingTable, reconciliation);
}

function buildContextSchemaDefinition(ast, globalIndex, partitionKey) {
  const baseSchema = buildSchemaDefinition(ast.columns, ast);
  if (!globalIndex) {
    return baseSchema;
  }
  return {
    ...baseSchema,
    tableName: ast.tableName,
    baseTableName: globalIndex.tableName,
    indexName: globalIndex.indexName,
    columnNames: [...(globalIndex.columnNames || [])],
    basePrimaryKeyColumns: [...(globalIndex.basePrimaryKeyColumns || [])],
    partitionKey,
  };
}

function resolveFirstPartitionSpec(options) {
  const parts = options.partitions;
  return Array.isArray(parts) && parts.length > 0 ? parts[0] : null;
}

function resolvePartitionKeyTypeForContext(firstPartition, tableMetadata) {
  if (firstPartition?.partitionKeyType) {
    return firstPartition.partitionKeyType;
  }
  return resolveDeclaredPartitionKeyType(tableMetadata);
}

function resolveReplicaCountForContext(service, firstPartition) {
  if (firstPartition?.replicaCount) {
    return firstPartition.replicaCount;
  }
  return service.defaultReplicaCount;
}

function buildContextPartitionMetadata(
  service,
  {tableId, tableName, partitionId, firstPartition, tableMetadata},
) {
  const now = Date.now();
  return {
    partition_id: partitionId,
    table_id: tableId,
    table_name: tableName,
    partition_key_start: firstPartition?.partitionKeyStart ?? null,
    partition_key_end: firstPartition?.partitionKeyEnd ?? null,
    partition_key_type: resolvePartitionKeyTypeForContext(firstPartition, tableMetadata),
    partition_version: 1,
    replica_count: resolveReplicaCountForContext(service, firstPartition),
    size_bytes: 0,
    leader_node_id: null,
    state: STATE.NORMAL,
    created_at: now,
    updated_at: now,
  };
}

function resolveContextPartitionKey(ast, globalIndex) {
  if (globalIndex?.columnNames?.[0]) {
    return globalIndex.columnNames[0];
  }
  return derivePartitionKey(ast.primaryKey);
}

function resolveContextPartitionId(tableId, options, firstPartition) {
  if (options.partitionId) return options.partitionId;
  if (firstPartition?.partitionId) return firstPartition.partitionId;
  return `${tableId}-p1`;
}

function resolveContextPartitionCount(options) {
  return Array.isArray(options.partitions) && options.partitions.length > 0 ?
    options.partitions.length :
    1;
}

function buildCreateTableMetadataContext(service, ast, options) {
  const firstPartition = resolveFirstPartitionSpec(options);
  const globalIndex = options.globalIndex ?? null;
  const partitionKey = resolveContextPartitionKey(ast, globalIndex);
  const tableId = options.tableId || `tbl-${uuidv4()}`;
  const partitionId = resolveContextPartitionId(tableId, options, firstPartition);
  const schemaDefinition = buildContextSchemaDefinition(
    ast, globalIndex, partitionKey,
  );
  const now = Date.now();
  const tableMetadata = {
    table_id: tableId,
    table_name: ast.tableName,
    schema_definition: JSON.stringify(schemaDefinition),
    partition_key: partitionKey,
    table_policies: JSON.stringify(ast.options?.tablePolicy ?? {}),
    partition_count: resolveContextPartitionCount(options),
    active_partition_version: 1,
    pending_partition_version: null,
    partition_transition_state: null,
    partition_transition_metadata: null,
    created_at: now,
    updated_at: now,
  };
  const partitionMetadata = buildContextPartitionMetadata(service, {
    tableId, tableName: ast.tableName, partitionId, firstPartition, tableMetadata,
  });
  return {
    columns: ast.columns,
    partitionId,
    partitionKey,
    partitionMetadata,
    schemaDefinition,
    tableId,
    tableMetadata,
    tableName: ast.tableName,
  };
}

function buildBaseProvisioningInput(context, options) {
  return {
    tableId: context.tableId,
    tableName: context.tableName,
    tableMetadata: context.tableMetadata,
    partitionId: context.partitionId,
    partitionMetadata: context.partitionMetadata,
    replicaCount: context.partitionMetadata.replica_count,
    ...(options?.globalIndex || options?.partitions ? {
      schema: context.schemaDefinition,
      keyRange: {
        start: context.partitionMetadata.partition_key_start ?? null,
        end: context.partitionMetadata.partition_key_end ?? null,
      },
    } : {}),
    timeoutBudget: options?.timeoutBudget,
    cancellationToken: options?.cancellationToken || null,
  };
}

function buildDurableProvisioningInput(context, options) {
  return {
    ...buildBaseProvisioningInput(context, options),
    schemaJobId: options.schemaJobId || null,
    schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
    assertProvisioningOwnership:
      options.assertProvisioningOwnership || null,
  };
}

async function submitCreateTableMetadata(metadataGateway, context, options) {
  await options.assertProvisioningOwnership?.();
  const tableMutation = await metadataGateway.submitMutation(
    {
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.TABLES,
      row: context.tableMetadata,
    },
    {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    },
  );
  await options.assertProvisioningOwnership?.();
  const partitionMutation = await metadataGateway.submitMutation(
    {
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.PARTITIONS,
      row: context.partitionMetadata,
    },
    {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    },
  );
  // Both metadata rows answered at their commit (a failed commit throws):
  // the metadata half of CREATE TABLE is done; no answer content reads a
  // projection. The statement that asked keeps same-node read-your-writes
  // at these positions (table-creation-service-durable-job.js).
  options.onMetadataCommitted?.(metadataGateway,
    [tableMutation?.position, partitionMutation?.position]);
  return {tableMutation, partitionMutation};
}

async function buildCreatedTableResult(
  service,
  context,
  provisioningSummary,
) {
  await service.evaluateSplitMergeLifecycle();
  service.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, {
    tableId: context.tableId,
    tableName: context.tableName,
    partitionKey: context.partitionKey,
    partitionId: context.partitionId,
  });
  const completion = resolveTableCreationCompletion({provisioningSummary});
  return {
    success: true,
    operation: QUERY_OPERATION.CREATE_TABLE,
    tableId: context.tableId,
    tableName: context.tableName,
    partitionKey: context.partitionKey,
    partitionId: context.partitionId,
    columns: context.columns.length,
    completionState: completion.completionState,
    completionReason: completion.completionReason,
    contractState: completion.contractState,
    nextAction: completion.nextAction,
    ...extractProvisioningResultFields(provisioningSummary),
    provisioningSummary,
  };
}

async function executePersistedCreateTable(service, context, options, gateway) {
  if (!gateway) {
    const error = new Error(
      `CREATE TABLE ${context.tableName} metadata persistence is unavailable`,
    );
    error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
    throw error;
  }
  await submitCreateTableMetadata(gateway, context, options);
  await options.assertProvisioningOwnership?.();
  const provisioningSummary = await service.provisionInitialPartition(
    buildDurableProvisioningInput(context, options),
  );
  return buildCreatedTableResult(service, context, provisioningSummary);
}

async function executeCreateTableProvisioning(service, ast, options = {}) {
  validateUserTableCreateIntent(ast);
  service.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
    tableName: ast.tableName,
    columnCount: ast.columns.length,
    primaryKey: ast.primaryKey,
    ifNotExists: ast.ifNotExists,
  });

  const existingTable = await service.findExistingTableRecord(ast.tableName);
  const durableMetadataGateway = existingTable ?
    null :
    requireDurableMetadataGateway(service, options);
  const decision = decideCreateTableAction({
    ast,
    options,
    existingTable,
  });

  switch (decision.action) {
  case CREATE_TABLE_ACTION.THROW_TABLE_EXISTS:
    assertDurableMetadataIdentity(existingTable, ast, options);
    throw createTableExistsError(ast.tableName);
  case CREATE_TABLE_ACTION.RECONCILE_EXISTING:
    return reconcileExistingCreateTable(service, ast, options, existingTable);
  case CREATE_TABLE_ACTION.CREATE_PERSISTED: {
    const context = buildCreateTableMetadataContext(service, ast, options);
    const metadataGateway = durableMetadataGateway ||
      service.getControlPlaneSystemTableGateway();
    return executePersistedCreateTable(
      service,
      context,
      options,
      metadataGateway,
    );
  }
  default:
    throw new Error(`Unsupported CREATE TABLE action: ${decision.action}`);
  }
}

export {
  CREATE_TABLE_ACTION,
  decideCreateTableAction,
  executeCreateTableProvisioning,
};
