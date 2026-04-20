/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import { v4 as uuidv4 } from "uuid";
import { LoggingService } from "../logging/logging-service.js";
import { ConfigurationManager } from "../config/configuration-manager.js";
import { CONFIG_KEY } from "../config/config-constants.js";
import { NUM, STATE, TABLES } from "../constants/index.js";
import { CONTROL_PLANE_MUTATION_OPERATION } from "../control-plane/control-plane-system-table-gateway.js";
import { createControlPlaneRuntimeBundle } from "../control-plane/control-plane-runtime-bundle.js";
import { resolveControlPlaneSystemTableVisibilityState } from "../control-plane/control-plane-system-table-visibility-constants.js";
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from "../control-plane/owner-contract-outcome.js";
import { PRESSURE_WORK_CLASS } from "../control-plane/pressure-governor.js";
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SUBSYSTEM,
} from "./query-constants.js";
import { TableCreationServicePart1 } from "./table-creation-service-class-part-1.js";
const TABLE_CREATION_SERVICE_LITERAL = Object.freeze({
  BOOLEAN: "boolean",
  FUNCTION: "function",
  OBJECT: "object",
  STRING: "string",
  UPDATE: "UPDATE",
  INSERT: "INSERT",
  TABLE_POLICY_CHANGED: "table_policy_changed",
  PARTITION_SIZE_CHANGED: "partition_size_changed",
  VISIBLE: "visible",
  EMPTY: ",",
  UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE:
    "Unable to restore missing initial partition metadata for table ",
  TABLE_CONSTRAINT: "table_constraint",
  COLUMN_CONSTRAINT: "column_constraint",
});
const TABLE_CREATION_SQL = Object.freeze({
  SELECT_TABLE_BY_NAME: `SELECT * FROM ${TABLES.TABLES} WHERE table_name = ? LIMIT 1`,
  SELECT_PARTITION_BY_ID: `SELECT * FROM ${TABLES.PARTITIONS} WHERE partition_id = ? LIMIT 1`,
});
const TABLE_CREATION_COMPLETION_STATE = Object.freeze({
  ACTIVE: "active",
  PENDING_CREATION: "pending_creation",
});
const TABLE_CREATION_COMPLETION_REASON = Object.freeze({
  METADATA_VISIBILITY_PENDING: "metadata_visibility_pending",
  REPLICA_CONVERGENCE_PENDING: "replica_convergence_pending",
});
const TABLE_CREATION_VISIBILITY_STATE = Object.freeze({
  VISIBLE: "visible",
  DEFERRED_BY_PRESSURE: "deferred_by_pressure",
});
const TABLE_CREATION_CONTRACT_PRIORITY = Object.freeze({
  [OWNER_CONTRACT_STATE.READY]: NUM.ZERO,
  [OWNER_CONTRACT_STATE.PENDING]: NUM.ONE,
  [OWNER_CONTRACT_STATE.DEFERRED]: NUM.TWO,
  [OWNER_CONTRACT_STATE.BLOCKED]: NUM.THREE,
  [OWNER_CONTRACT_STATE.FAILED]: NUM.FOUR,
});
function normalizeProvisioningSummary(provisioningResult = null, context = {}) {
  const requestedReplicaCount =
    Number.isInteger(context?.replicaCount) && context.replicaCount > 0
      ? context.replicaCount
      : null;
  const minimumRoutableReplicaCount =
    Number.isInteger(context?.minimumRoutableReplicaCount) &&
    context.minimumRoutableReplicaCount > 0
      ? context.minimumRoutableReplicaCount
      : null;
  const normalized =
    provisioningResult && typeof provisioningResult === "object"
      ? provisioningResult
      : {};
  const resolvedReplicaCount =
    Number.isInteger(normalized?.resolvedReplicaCount) &&
    normalized.resolvedReplicaCount > 0
      ? normalized.resolvedReplicaCount
      : requestedReplicaCount;
  const fallbackRoutableReplicaCount =
    Number.isInteger(minimumRoutableReplicaCount) &&
    minimumRoutableReplicaCount > 0
      ? minimumRoutableReplicaCount
      : NUM.ZERO;
  const routableReplicaCount =
    Number.isInteger(normalized?.routableReplicaCount) &&
    normalized.routableReplicaCount >= 0
      ? normalized.routableReplicaCount
      : fallbackRoutableReplicaCount;
  const fullReplicaCountConverged =
    typeof normalized?.fullReplicaCountConverged ===
    TABLE_CREATION_SERVICE_LITERAL.BOOLEAN
      ? normalized.fullReplicaCountConverged
      : !Number.isInteger(requestedReplicaCount) ||
        requestedReplicaCount <= NUM.ZERO ||
        routableReplicaCount >= requestedReplicaCount;
  const defaultProvisioningContractOutcome = buildOwnerContractOutcome({
    contractState: fullReplicaCountConverged
      ? OWNER_CONTRACT_STATE.READY
      : OWNER_CONTRACT_STATE.PENDING,
    nextAction: fullReplicaCountConverged
      ? OWNER_CONTRACT_NEXT_ACTION.PROCEED
      : OWNER_CONTRACT_NEXT_ACTION.WAIT,
  });
  const requestedProvisioningContractOutcome = buildOwnerContractOutcome({
    contractState:
      normalized?.contractState ||
      defaultProvisioningContractOutcome.contractState,
    nextAction:
      normalized?.nextAction || defaultProvisioningContractOutcome.nextAction,
  });
  const provisioningContractOutcome =
    fullReplicaCountConverged === false &&
    requestedProvisioningContractOutcome.contractState ===
      OWNER_CONTRACT_STATE.READY &&
    requestedProvisioningContractOutcome.nextAction ===
      OWNER_CONTRACT_NEXT_ACTION.PROCEED
      ? defaultProvisioningContractOutcome
      : requestedProvisioningContractOutcome;
  return {
    requestedReplicaCount,
    resolvedReplicaCount,
    minimumRoutableReplicaCount:
      Number.isInteger(normalized?.minimumRoutableReplicaCount) &&
      normalized.minimumRoutableReplicaCount > NUM.ZERO
        ? normalized.minimumRoutableReplicaCount
        : minimumRoutableReplicaCount,
    routableReplicaCount,
    fullReplicaCountConverged,
    contractState: provisioningContractOutcome.contractState,
    nextAction: provisioningContractOutcome.nextAction,
    reasonCodes: Array.isArray(normalized?.reasonCodes)
      ? [...normalized.reasonCodes]
      : [],
    retryAfterMs:
      Number.isFinite(normalized?.retryAfterMs) &&
      normalized.retryAfterMs > NUM.ZERO
        ? Math.floor(normalized.retryAfterMs)
        : NUM.ZERO,
  };
}
function resolveTableCreationVisibilityContractOutcome(visibilityState) {
  if (
    visibilityState === TABLE_CREATION_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
  ) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    });
  }
  if (visibilityState !== TABLE_CREATION_VISIBILITY_STATE.VISIBLE) {
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    });
  }
  return buildOwnerContractOutcome({
    contractState: OWNER_CONTRACT_STATE.READY,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
  });
}
function pickStrongerTableCreationContractOutcome(currentOutcome, nextOutcome) {
  if (!currentOutcome) {
    return nextOutcome;
  }
  if (!nextOutcome) {
    return currentOutcome;
  }
  const currentPriority =
    TABLE_CREATION_CONTRACT_PRIORITY[currentOutcome.contractState] ??
    Number.NEGATIVE_INFINITY;
  const nextPriority =
    TABLE_CREATION_CONTRACT_PRIORITY[nextOutcome.contractState] ??
    Number.NEGATIVE_INFINITY;
  return nextPriority > currentPriority ? nextOutcome : currentOutcome;
}
function resolveTableCreationMutationContractOutcome(
  mutationResults = [],
  fallbackVisibilityState = TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
) {
  let strongestOutcome = resolveTableCreationVisibilityContractOutcome(
    fallbackVisibilityState,
  );
  for (const mutationResult of Array.isArray(mutationResults)
    ? mutationResults
    : []) {
    if (!mutationResult || typeof mutationResult !== "object") {
      continue;
    }
    const mutationOutcome =
      typeof mutationResult.contractState ===
        TABLE_CREATION_SERVICE_LITERAL.STRING &&
      mutationResult.contractState.length > NUM.ZERO
        ? buildOwnerContractOutcome({
            contractState: mutationResult.contractState,
            nextAction: mutationResult.nextAction,
          })
        : resolveTableCreationVisibilityContractOutcome(
            String(
              mutationResult.visibilityState ||
                TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
            ),
          );
    strongestOutcome = pickStrongerTableCreationContractOutcome(
      strongestOutcome,
      mutationOutcome,
    );
  }
  return strongestOutcome;
}
function resolveTableCreationCompletion(options = {}) {
  const visibilityState = String(
    options?.visibilityState || TABLE_CREATION_VISIBILITY_STATE.VISIBLE,
  );
  const provisioningSummary = options?.provisioningSummary || null;
  const provisioningContractOutcome =
    provisioningSummary &&
    typeof provisioningSummary === TABLE_CREATION_SERVICE_LITERAL.OBJECT
      ? buildOwnerContractOutcome({
          contractState: provisioningSummary.contractState,
          nextAction: provisioningSummary.nextAction,
        })
      : null;
  let contractOutcome =
    options?.metadataContractOutcome &&
    typeof options.metadataContractOutcome === "object"
      ? buildOwnerContractOutcome({
          contractState: options.metadataContractOutcome.contractState,
          nextAction: options.metadataContractOutcome.nextAction,
        })
      : resolveTableCreationVisibilityContractOutcome(visibilityState);
  let completionState = TABLE_CREATION_COMPLETION_STATE.ACTIVE;
  let completionReason = null;
  if (visibilityState !== TABLE_CREATION_VISIBILITY_STATE.VISIBLE) {
    completionState = TABLE_CREATION_COMPLETION_STATE.PENDING_CREATION;
    completionReason =
      TABLE_CREATION_COMPLETION_REASON.METADATA_VISIBILITY_PENDING;
  } else if (
    provisioningSummary &&
    provisioningSummary.fullReplicaCountConverged === false
  ) {
    completionState = TABLE_CREATION_COMPLETION_STATE.PENDING_CREATION;
    completionReason =
      TABLE_CREATION_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING;
    if (provisioningContractOutcome) {
      contractOutcome = pickStrongerTableCreationContractOutcome(
        contractOutcome,
        provisioningContractOutcome,
      );
    }
    if (contractOutcome.contractState === OWNER_CONTRACT_STATE.READY) {
      contractOutcome = buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      });
    }
  }
  return {
    completionState,
    completionReason,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
  };
}
function buildCreateTableSuccessResult(options = {}) {
  return {
    success: true,
    operation: QUERY_OPERATION.CREATE_TABLE,
    ...options,
  };
}

/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationService extends TableCreationServicePart1 {

  /**
   * Resolve one partition metadata row, preferring cache and falling back to
   * an authoritative control-plane read when cache visibility lags.
   * @param {string} partitionId
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingPartitionRecord(partitionId) {
    const cachedPartition = this.getPartitionRecord(partitionId);
    if (cachedPartition) {
      return cachedPartition;
    }
    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (
      !controlPlaneGateway ||
      typeof controlPlaneGateway.readRows !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return null;
    }
    try {
      const result = await controlPlaneGateway.readRows(
        TABLES.PARTITIONS,
        TABLE_CREATION_SQL.SELECT_PARTITION_BY_ID,
        [partitionId],
        {
          readProfile: "table_lifecycle",
        },
      );
      return Array.isArray(result?.rows) && result.rows.length > NUM.ZERO
        ? result.rows[NUM.ZERO]
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT EXISTS
   * retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @return {Promise<void>}
   * @private
   */
  async reconcileExistingInitialPartition(
    tableName,
    existingTable = null,
    options = {},
  ) {
    const existingTableRecord =
      existingTable || (await this.findExistingTableRecord(tableName));
    if (!existingTableRecord) {
      return {
        partitionMetadataCreated: false,
      };
    }
    const tableId =
      existingTableRecord.table_id || existingTableRecord.tableId || null;
    if (!tableId) {
      return {
        partitionMetadataCreated: false,
      };
    }
    const partitionId = `${tableId}-p1`;
    let existingPartition = await this.findExistingPartitionRecord(partitionId);
    let partitionMetadataCreated = false;
    let visibilityState = TABLE_CREATION_SERVICE_LITERAL.VISIBLE;
    let metadataContractOutcome =
      resolveTableCreationVisibilityContractOutcome(visibilityState);
    if (!existingPartition) {
      const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
      if (
        !controlPlaneGateway ||
        typeof controlPlaneGateway.submitMutation !==
          TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        throw new Error(
          TABLE_CREATION_SERVICE_LITERAL.UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE +
            String(tableName || tableId),
        );
      }
      existingPartition = this.buildInitialPartitionMetadataFromTableRecord(
        tableId,
        tableName,
        existingTableRecord,
      );
      const partitionMutation = await controlPlaneGateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: TABLES.PARTITIONS,
          row: existingPartition,
        },
        {
          allowPendingVisibility: true,
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: "critical",
        },
      );
      partitionMetadataCreated = true;
      visibilityState = String(
        partitionMutation?.visibilityState ||
          TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
      );
      metadataContractOutcome = resolveTableCreationMutationContractOutcome(
        [partitionMutation],
        visibilityState,
      );
    }
    const replicaCount = Number(
      existingPartition.replica_count ?? existingPartition.replicaCount,
    );
    const provisioningSummary = await this.provisionInitialPartition({
      tableId,
      tableName,
      tableMetadata: existingTableRecord,
      partitionId,
      partitionMetadata: existingPartition,
      replicaCount:
        Number.isInteger(replicaCount) && replicaCount > 0
          ? replicaCount
          : this.defaultReplicaCount,
      timeoutBudget: options?.timeoutBudget,
    });
    const completion = resolveTableCreationCompletion({
      visibilityState,
      provisioningSummary,
      metadataContractOutcome,
    });
    return {
      partitionMetadataCreated,
      visibilityState,
      completionState: completion.completionState,
      completionReason: completion.completionReason,
      contractState: completion.contractState,
      nextAction: completion.nextAction,
      provisioningSummary,
    };
  }

  /**
   * Resolve one table metadata row from cache.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  getTableRecord(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        return (
          this.systemCache.find(
            TABLES.TABLES,
            (table) =>
              table?.table_name === tableName || table?.tableName === tableName,
          ) || null
        );
      }
      if (
        typeof this.systemCache.getAll ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const tables = this.systemCache.getAll(TABLES.TABLES) || [];
        return (
          tables.find(
            (table) =>
              table?.table_name === tableName || table?.tableName === tableName,
          ) || null
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Resolve one partition metadata row from cache.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (!this.systemCache || !partitionId) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        return (
          this.systemCache.find(
            TABLES.PARTITIONS,
            (partition) =>
              partition?.partition_id === partitionId ||
              partition?.partitionId === partitionId,
          ) || null
        );
      }
      if (
        typeof this.systemCache.getAll ===
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
        return (
          partitions.find(
            (partition) =>
              partition?.partition_id === partitionId ||
              partition?.partitionId === partitionId,
          ) || null
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Validate that a table has a PRIMARY KEY.
   * Requirement 20.2: Require PRIMARY KEY for user tables.
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Object} Validation result.
   */
  validatePrimaryKey(ast) {
    const { tableName, columns, primaryKey } = ast;

    // Check for table-level PRIMARY KEY constraint
    if (primaryKey && primaryKey.length > NUM.ZERO) {
      return {
        valid: true,
        primaryKey,
        source: TABLE_CREATION_SERVICE_LITERAL.TABLE_CONSTRAINT,
      };
    }

    // Check for column-level PRIMARY KEY
    const pkColumns = columns.filter((col) => col.primaryKey);
    if (pkColumns.length > NUM.ZERO) {
      return {
        valid: true,
        primaryKey: pkColumns.map((col) => col.name),
        source: TABLE_CREATION_SERVICE_LITERAL.COLUMN_CONSTRAINT,
      };
    }
    return {
      valid: false,
      error:
        `${QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_PREFIX}${tableName}` +
        QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_SUFFIX,
      code: QUERY_ERROR_CODE.PRIMARY_KEY_REQUIRED,
    };
  }

  /**
   * Get partition key for a table.
   * @param {string} tableName - Table name.
   * @return {string|null} Partition key or null.
   */
  getPartitionKey(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        return table?.partition_key || table?.partitionKey || null;
      }
    } catch {
      // Cache not available
    }
    return null;
  }

  /**
   * Get table schema.
   * @param {string} tableName - Table name.
   * @return {Object|null} Schema definition or null.
   */
  getTableSchema(tableName) {
    if (!this.systemCache) {
      return null;
    }
    try {
      if (
        typeof this.systemCache.find === TABLE_CREATION_SERVICE_LITERAL.FUNCTION
      ) {
        const table = this.systemCache.find(
          TABLES.TABLES,
          (t) => t.table_name === tableName || t.tableName === tableName,
        );
        if (table?.schema_definition) {
          return JSON.parse(table.schema_definition);
        }
        if (table?.schemaDefinition) {
          return JSON.parse(table.schemaDefinition);
        }
      }
    } catch {
      // Cache not available or parse error
    }
    return null;
  }

  /**
   * Strip partition details from query results.
   * Requirement 20.10: Never expose partition details in query results.
   * Note: We keep high-level partition metadata (like which partitions were queried)
   * but strip internal partition details from individual rows.
   * @param {Object} result - Query result.
   * @return {Object} Result with internal partition details stripped.
   */
  stripPartitionDetails(result) {
    if (!result) {
      return result;
    }

    // Create a copy to avoid mutating the original
    const stripped = {
      ...result,
    };

    // Remove internal partition-related fields from top-level result
    // Keep 'partitions' array as it's useful metadata about which partitions were queried
    delete stripped.sourcePartition;
    delete stripped.partition_key_start;
    delete stripped.partition_key_end;

    // Strip internal partition details from rows if present
    if (Array.isArray(stripped.rows)) {
      stripped.rows = stripped.rows.map((row) => {
        const cleanRow = {
          ...row,
        };
        // Remove internal partition tracking fields
        delete cleanRow._partition_id;
        delete cleanRow._partitionId;
        delete cleanRow._sourcePartition;
        return cleanRow;
      });
    }
    return stripped;
  }

  /**
   * Check if a field name is a partition-related field.
   * @param {string} fieldName - Field name to check.
   * @return {boolean} True if partition-related.
   */
  isPartitionField(fieldName) {
    const partitionFields = new Set([
      "partition_id",
      "partitionId",
      "_partition_id",
      "_partitionId",
      "partition_key_start",
      "partition_key_end",
      "partitionKeyStart",
      "partitionKeyEnd",
      "sourcePartition",
    ]);
    return partitionFields.has(fieldName);
  }
}
export { TableCreationService };
