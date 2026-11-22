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

const EMPTY_SCHEMA_DEFINITION_JSON = '{}';

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function projectComparableSchema(service, schema) {
  const cols = Array.isArray(schema?.columns) ? schema.columns : [];
  const derived = service.buildSchemaDefinition({
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
      defaultValue: col.defaultValue ?? cols[idx]?.defaultValue ?? null,
    })),
    primaryKey: (Array.isArray(derived.primaryKey) ? derived.primaryKey : [])
      .map((name) => String(name || '').toLowerCase()),
    tableConstraints: derived.tableConstraints || [],
  });
}

function assertDurableMetadataIdentity(service, existingTable, ast, options) {
  if (!options.schemaJobId) return;
  const existingTableId = existingTable.table_id || existingTable.tableId;
  const expectedSchema = sortObject(
    service.buildSchemaDefinition(ast.columns, ast),
  );
  let existingSchema = {};
  try {
    existingSchema = sortObject(JSON.parse(
      existingTable.schema_definition || existingTable.schemaDefinition ||
      EMPTY_SCHEMA_DEFINITION_JSON,
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
      JSON.stringify(projectComparableSchema(service, existingSchema)) ===
        JSON.stringify(projectComparableSchema(service, ast))
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
  if (typeof gateway?.submitMutation === 'function') return gateway;
  const error = new Error(
    `Schema job ${options.schemaJobId} metadata persistence is unavailable`,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
  throw error;
}

function firstTruthyValue(...values) {
  return values.find(Boolean) || null;
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
  return {
    timeoutBudget: options?.timeoutBudget,
    cancellationToken: options?.cancellationToken || null,
    partitionId: options?.partitionId || null,
    partitions: options?.partitions || null,
    globalIndex: options?.globalIndex || null,
    schemaJobId: options.schemaJobId || null,
    schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
    assertProvisioningOwnership:
      options.assertProvisioningOwnership || null,
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
    tableId: firstTruthyValue(
      reconciliation?.tableId,
      existingTable.table_id,
      existingTable.tableId,
    ),
    tableName: ast.tableName,
    partitionKey: firstTruthyValue(
      existingTable.partition_key,
      existingTable.partitionKey,
    ),
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
  assertDurableMetadataIdentity(service, existingTable, ast, options);
  if (!ast.ifNotExists && !options.schemaJobId) {
    throw createTableExistsError(ast.tableName);
  }
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

function buildCreateTableMetadataContext(service, ast, options) {
  const firstPartition = Array.isArray(options.partitions) &&
      options.partitions.length > 0 ?
    options.partitions[0] :
    null;
  const globalIndex = options.globalIndex || ast?.options?.globalIndex || null;
  const partitionKey = globalIndex?.columnNames?.[0] ||
    service.derivePartitionKey(ast.primaryKey);
  const tableId = options.tableId || `tbl-${uuidv4()}`;
  const partitionId = options.partitionId ||
    firstPartition?.partitionId ||
    `${tableId}-p1`;
  const baseSchemaDefinition = service.buildSchemaDefinition(ast.columns, ast);
  const schemaDefinition = globalIndex ?
    {
      ...baseSchemaDefinition,
      tableName: ast.tableName,
      baseTableName: globalIndex.tableName,
      indexName: globalIndex.indexName,
      columnNames: [...(globalIndex.columnNames || [])],
      basePrimaryKeyColumns: [...(globalIndex.basePrimaryKeyColumns || [])],
      partitionKey,
    } :
    baseSchemaDefinition;
  const tableMetadata = {
    table_id: tableId,
    table_name: ast.tableName,
    schema_definition: JSON.stringify(schemaDefinition),
    partition_key: partitionKey,
    table_policies: JSON.stringify(ast.options?.tablePolicy ?? {}),
    partition_count: Array.isArray(options.partitions) && options.partitions.length > 0 ?
      options.partitions.length :
      1,
    active_partition_version: 1,
    pending_partition_version: null,
    partition_transition_state: null,
    partition_transition_metadata: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  const partitionKeyType = firstPartition?.partitionKeyType ||
    resolveDeclaredPartitionKeyType(tableMetadata);
  const partitionMetadata = {
    partition_id: partitionId,
    table_id: tableId,
    table_name: ast.tableName,
    partition_key_start: firstPartition?.partitionKeyStart ?? null,
    partition_key_end: firstPartition?.partitionKeyEnd ?? null,
    partition_key_type: partitionKeyType,
    partition_version: 1,
    replica_count: firstPartition?.replicaCount || service.defaultReplicaCount,
    size_bytes: 0,
    leader_node_id: null,
    state: STATE.NORMAL,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
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
  await submitCreateTableMetadata(gateway, context, options);
  await options.assertProvisioningOwnership?.();
  const provisioningSummary = await service.provisionInitialPartition(
    buildDurableProvisioningInput(context, options),
  );
  return buildCreatedTableResult(service, context, provisioningSummary);
}

async function executeUnpersistedCreateTable(service, context, options) {
  const provisioningSummary = await service.provisionInitialPartition(
    buildBaseProvisioningInput(context, options),
  );
  return buildCreatedTableResult(service, context, provisioningSummary);
}

const tableCreationCreateTableMethods = {
  async executeCreateTableProvisioning(ast, options = {}) {
    validateUserTableCreateIntent(ast);
    this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
      tableName: ast.tableName,
      columnCount: ast.columns.length,
      primaryKey: ast.primaryKey,
      ifNotExists: ast.ifNotExists,
    });

    const existingTable = await this.findExistingTableRecord(ast.tableName);
    if (existingTable) {
      return reconcileExistingCreateTable(
        this,
        ast,
        options,
        existingTable,
      );
    }

    const context = buildCreateTableMetadataContext(this, ast, options);
    const durableMetadataGateway = requireDurableMetadataGateway(this, options);
    if (this.cdcIntegrationService || durableMetadataGateway) {
      const metadataGateway = durableMetadataGateway ||
        this.getControlPlaneSystemTableGateway();
      return executePersistedCreateTable(
        this,
        context,
        options,
        metadataGateway,
      );
    }
    return executeUnpersistedCreateTable(this, context, options);
  },
};

const EXECUTE_CREATE_TABLE_PROVISIONING_METHOD =
  'executeCreateTableProvisioning';

function defineTableCreationCreateTableMethod(serviceClass) {
  Object.defineProperty(
    serviceClass.prototype,
    EXECUTE_CREATE_TABLE_PROVISIONING_METHOD,
    {
      configurable: true,
      value: tableCreationCreateTableMethods.executeCreateTableProvisioning,
      writable: true,
    },
  );
}

export {defineTableCreationCreateTableMethod};
