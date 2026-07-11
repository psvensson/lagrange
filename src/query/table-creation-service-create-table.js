import {v4 as uuidv4} from 'uuid';
import {STATE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../control-plane/control-plane-system-table-gateway.js';
import {resolveControlPlaneSystemTableVisibilityState} from '../control-plane/control-plane-system-table-visibility-constants.js';
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
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_VISIBILITY_STATE,
  buildCreateTableSuccessResult,
  resolveTableCreationCompletion,
  resolveTableCreationMutationContractOutcome,
} from './table-creation-service-completion.js';

const EMPTY_SCHEMA_DEFINITION_JSON = '{}';

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function assertDurableMetadataIdentity(service, existingTable, ast, options) {
  if (!options.schemaJobId) return;
  const existingTableId = existingTable.table_id || existingTable.tableId;
  const expectedSchema = sortObject(
    service.buildSchemaDefinition(ast.columns),
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
  if (existingTableId === options.tableId &&
      JSON.stringify(existingSchema) === JSON.stringify(expectedSchema)) {
    return;
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

const tableCreationCreateTableMethods = {
  async executeCreateTableProvisioning(ast, options = {}) {
    const {tableName, columns, primaryKey, ifNotExists} = ast;
    this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
      tableName,
      columnCount: columns.length,
      primaryKey,
      ifNotExists,
    });

    // Validate PRIMARY KEY requirement (Requirement 20.2)
    if (!primaryKey || primaryKey.length === 0) {
      const error = new Error(
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX}. ` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL,
      );
      error.code = QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED;
      throw error;
    }

    // Check if table already exists
    const existingTable = await this.findExistingTableRecord(tableName);
    if (existingTable) {
      assertDurableMetadataIdentity(this, existingTable, ast, options);
      if (ifNotExists || options.schemaJobId) {
        const reconciliation = await this.reconcileExistingInitialPartition(
          tableName,
          existingTable,
          {
            timeoutBudget: options?.timeoutBudget,
            cancellationToken: options?.cancellationToken || null,
            schemaJobId: options.schemaJobId || null,
            schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
            assertProvisioningOwnership:
              options.assertProvisioningOwnership || null,
          },
        );
        const visibilityState = String(
          reconciliation?.visibilityState ||
          TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
        );
        const completion = resolveTableCreationCompletion({
          visibilityState,
          provisioningSummary: reconciliation?.provisioningSummary || null,
          metadataContractOutcome: reconciliation,
        });
        this.logger.debug(QUERY_LOG_MSG.TABLE_EXISTS_SKIP, {
          tableName,
        });
        return buildCreateTableSuccessResult({
          tableId:
            reconciliation?.tableId ||
            existingTable.table_id || existingTable.tableId || null,
          tableName,
          partitionKey:
            existingTable.partition_key || existingTable.partitionKey || null,
          partitionId: reconciliation?.partitionId || null,
          columns: columns.length,
          skipped: true,
          completionState: completion.completionState,
          completionReason: completion.completionReason,
          contractState: completion.contractState,
          nextAction: completion.nextAction,
          visibilityState,
          visibilityPending:
          visibilityState !== TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
          partitionMetadataCreated:
          reconciliation?.partitionMetadataCreated === true,
          provisioningSummary: reconciliation?.provisioningSummary || null,
          message:
          `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
          QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
        });
      }
      const error = new Error(
        `${QUERY_ERROR_MSG.TABLE_EXISTS_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.TABLE_EXISTS_SUFFIX,
      );
      error.code = QUERY_ERROR_CODE.TABLE_EXISTS;
      throw error;
    }

    // Derive partition key from PRIMARY KEY (Requirement 20.1)
    const partitionKey = this.derivePartitionKey(primaryKey);

    // Generate table ID
    const tableId = options.tableId || `tbl-${uuidv4()}`;

    // Build schema definition
    const schemaDefinition = this.buildSchemaDefinition(columns);

    // Create table metadata
    const tableMetadata = {
      table_id: tableId,
      table_name: tableName,
      schema_definition: JSON.stringify(schemaDefinition),
      partition_key: partitionKey,
      table_policies: JSON.stringify({}),
      partition_count: 1,
      active_partition_version: 1,
      pending_partition_version: null,
      partition_transition_state: null,
      partition_transition_metadata: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Create initial partition with full key range [NULL, NULL) (Requirement 20.3)
    const partitionId = options.partitionId || `${tableId}-p1`;
    const partitionMetadata = {
      partition_id: partitionId,
      table_id: tableId,
      table_name: tableName,
      partition_key_start: null,
      // NULL means unbounded lower
      partition_key_end: null,
      // NULL means unbounded upper
      partition_version: 1,
      replica_count: this.defaultReplicaCount,
      size_bytes: 0,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const durableMetadataGateway = requireDurableMetadataGateway(this, options);
    // Durable jobs use the canonical gateway even when CDC wiring is detached.
    if (this.cdcIntegrationService || durableMetadataGateway) {
      const metadataGateway = durableMetadataGateway ||
        this.getControlPlaneSystemTableGateway();
      await options.assertProvisioningOwnership?.();
      const tableMetadataMutation =
      await metadataGateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: TABLES.TABLES,
          row: tableMetadata,
        },
        {
          allowPendingVisibility: true,
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        },
      );
      await options.assertProvisioningOwnership?.();
      const partitionMetadataMutation =
      await metadataGateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: TABLES.PARTITIONS,
          row: partitionMetadata,
        },
        {
          allowPendingVisibility: true,
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        },
      );
      const metadataVisibilityState =
      resolveControlPlaneSystemTableVisibilityState(
        [
          tableMetadataMutation?.visibilityState,
          partitionMetadataMutation?.visibilityState,
        ],
        TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
      );
      const metadataContractOutcome =
      resolveTableCreationMutationContractOutcome(
        [tableMetadataMutation, partitionMetadataMutation],
        metadataVisibilityState,
      );
      await options.assertProvisioningOwnership?.();
      const provisioningSummary = await this.provisionInitialPartition({
        tableId,
        tableName,
        tableMetadata,
        partitionId,
        partitionMetadata,
        replicaCount: partitionMetadata.replica_count,
        timeoutBudget: options?.timeoutBudget,
        cancellationToken: options?.cancellationToken || null,
        schemaJobId: options.schemaJobId || null,
        schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
        assertProvisioningOwnership:
          options.assertProvisioningOwnership || null,
      });
      await this.evaluateSplitMergeLifecycle();
      this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, {
        tableId,
        tableName,
        partitionKey,
        partitionId,
      });
      const completion = resolveTableCreationCompletion({
        visibilityState: metadataVisibilityState,
        provisioningSummary,
        metadataContractOutcome,
      });
      return {
        success: true,
        operation: QUERY_OPERATION.CREATE_TABLE,
        tableId,
        tableName,
        partitionKey,
        partitionId,
        columns: columns.length,
        completionState: completion.completionState,
        completionReason: completion.completionReason,
        contractState: completion.contractState,
        nextAction: completion.nextAction,
        visibilityState: metadataVisibilityState,
        visibilityPending:
        metadataVisibilityState !== TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
        provisioningSummary,
      };
    }
    const provisioningSummary = await this.provisionInitialPartition({
      tableId,
      tableName,
      tableMetadata,
      partitionId,
      partitionMetadata,
      replicaCount: partitionMetadata.replica_count,
      timeoutBudget: options?.timeoutBudget,
      cancellationToken: options?.cancellationToken || null,
    });
    await this.evaluateSplitMergeLifecycle();
    this.logger.info(QUERY_LOG_MSG.TABLE_CREATED_SUCCESS, {
      tableId,
      tableName,
      partitionKey,
      partitionId,
    });
    const completion = resolveTableCreationCompletion({
      visibilityState: TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
      provisioningSummary,
    });
    return {
      success: true,
      operation: QUERY_OPERATION.CREATE_TABLE,
      tableId,
      tableName,
      partitionKey,
      partitionId,
      columns: columns.length,
      completionState: completion.completionState,
      completionReason: completion.completionReason,
      contractState: completion.contractState,
      nextAction: completion.nextAction,
      visibilityState: TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
      visibilityPending: false,
      provisioningSummary,
    };
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
