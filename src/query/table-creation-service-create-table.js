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
import {
  TABLE_CREATION_SERVICE_LITERAL,
  TABLE_CREATION_VISIBILITY_STATE,
  buildCreateTableSuccessResult,
  resolveTableCreationCompletion,
  resolveTableCreationMutationContractOutcome,
} from './table-creation-service-completion.js';


const tableCreationCreateTableMethods = {
  async createTable(ast, options = {}) {
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
      if (ifNotExists) {
        const reconciliation = await this.reconcileExistingInitialPartition(
          tableName,
          existingTable,
          {
            timeoutBudget: options?.timeoutBudget,
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
          tableName,
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
    const tableId = `tbl-${uuidv4()}`;

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
    const partitionId = `${tableId}-p1`;
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

    // Write to system tables via CDC
    if (this.cdcIntegrationService) {
      const tableMetadataMutation =
      await this.getControlPlaneSystemTableGateway().submitMutation(
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
      const partitionMetadataMutation =
      await this.getControlPlaneSystemTableGateway().submitMutation(
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
      const provisioningSummary = await this.provisionInitialPartition({
        tableId,
        tableName,
        tableMetadata,
        partitionId,
        partitionMetadata,
        replicaCount: partitionMetadata.replica_count,
        timeoutBudget: options?.timeoutBudget,
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

function defineTableCreationCreateTableMethod(serviceClass) {
  Object.defineProperty(serviceClass.prototype, 'createTable', {
    configurable: true,
    value: tableCreationCreateTableMethods.createTable,
    writable: true,
  });
}

export {defineTableCreationCreateTableMethod};
