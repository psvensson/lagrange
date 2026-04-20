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
class TableCreationServicePart1 {
  /**
   * Create a new TableCreationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Function} options.partitionProvisioner - Initial partition
   *   provisioning callback.
   */
  constructor(options = {}) {
    this.systemCache = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache,
      }).controlPlaneSystemTableGateway;
    this.partitionSplitMergeManager = null;
    this.tablePolicyByTableId = new Map();
    this.partitionSizeByPartitionId = new Map();
    this.cachePolicyChangeListener = null;
    this.calculateQuorumReplicaCount =
      typeof options.calculateQuorumReplicaCount ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
        ? options.calculateQuorumReplicaCount
        : null;
    this.partitionProvisioner =
      typeof options.partitionProvisioner ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
        ? options.partitionProvisioner
        : null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE;
    this.logger = this.initLogger();
    this.setSystemCache(options.systemCache || null);
    this.setPartitionSplitMergeManager(
      options.partitionSplitMergeManager || null,
    );
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(
          QUERY_SUBSYSTEM.TABLE_CREATION_SERVICE,
        );
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (this.systemCache === cache) {
      return;
    }
    this.detachCachePolicyListener();
    this.systemCache = cache || null;
    this.attachCachePolicyListener();
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway =
      controlPlaneSystemTableGateway || null;
  }

  /**
   * Set partition split/merge manager integration hook.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (this.partitionSplitMergeManager === manager) {
      return;
    }
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
    this.partitionSplitMergeManager = manager || null;
    this.startPeriodicSplitMergeEvaluation();
    this.attachCachePolicyListener();
  }

  /**
   * Attach cache listener that triggers split/merge evaluation when table
   * policy values change.
   * @private
   */
  attachCachePolicyListener() {
    const cache = this.systemCache;
    const manager = this.partitionSplitMergeManager;
    if (
      !cache ||
      typeof cache.onCacheChange !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      typeof cache.getAll !== TABLE_CREATION_SERVICE_LITERAL.FUNCTION ||
      !manager ||
      (typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
        typeof manager.requestEvaluation !==
          TABLE_CREATION_SERVICE_LITERAL.FUNCTION)
    ) {
      this.tablePolicyByTableId.clear();
      this.partitionSizeByPartitionId.clear();
      return;
    }
    this.seedTablePolicyCache(cache);
    this.seedPartitionMetricsCache(cache);
    this.cachePolicyChangeListener = (tableName, operation, record) => {
      this.onSystemTableCacheChange(tableName, operation, record);
    };
    cache.onCacheChange(this.cachePolicyChangeListener);
  }

  /**
   * Detach previously registered cache policy listener.
   * @private
   */
  detachCachePolicyListener() {
    const cache = this.systemCache;
    if (
      cache &&
      typeof cache.offCacheChange === TABLE_CREATION_SERVICE_LITERAL.FUNCTION &&
      this.cachePolicyChangeListener
    ) {
      cache.offCacheChange(this.cachePolicyChangeListener);
    }
    this.cachePolicyChangeListener = null;
    this.tablePolicyByTableId.clear();
    this.partitionSizeByPartitionId.clear();
  }

  /**
   * Seed known table policy values from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedTablePolicyCache(cache) {
    this.tablePolicyByTableId.clear();
    const tableRows = cache.getAll(TABLES.TABLES);
    if (!Array.isArray(tableRows)) {
      return;
    }
    for (const row of tableRows) {
      const tableId = this.resolveTableId(row);
      const policyValue = this.resolveTablePolicyValue(row);
      if (!tableId || policyValue === null) {
        continue;
      }
      this.tablePolicyByTableId.set(tableId, policyValue);
    }
  }

  /**
   * Seed known partition sizes from current cache rows.
   * @param {Object} cache
   * @private
   */
  seedPartitionMetricsCache(cache) {
    this.partitionSizeByPartitionId.clear();
    const partitionRows = cache.getAll(TABLES.PARTITIONS);
    if (!Array.isArray(partitionRows)) {
      return;
    }
    for (const row of partitionRows) {
      const partitionId = this.resolvePartitionId(row);
      const partitionSize = this.resolvePartitionSizeValue(row);
      if (!partitionId || partitionSize === null) {
        continue;
      }
      this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    }
  }

  /**
   * Resolve canonical table ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTableId(row) {
    const tableId = row?.table_id ?? row?.tableId ?? null;
    return typeof tableId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
      tableId.length > NUM.ZERO
      ? tableId
      : null;
  }

  /**
   * Resolve normalized table policy value from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolveTablePolicyValue(row) {
    const value = row?.table_policies ?? row?.tablePolicies ?? null;
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === TABLE_CREATION_SERVICE_LITERAL.STRING) {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  /**
   * Resolve canonical partition ID from a row.
   * @param {Object} row
   * @return {string|null}
   * @private
   */
  resolvePartitionId(row) {
    const partitionId = row?.partition_id ?? row?.partitionId ?? null;
    return typeof partitionId === TABLE_CREATION_SERVICE_LITERAL.STRING &&
      partitionId.length > NUM.ZERO
      ? partitionId
      : null;
  }

  /**
   * Resolve normalized partition size from a row.
   * @param {Object} row
   * @return {number|null}
   * @private
   */
  resolvePartitionSizeValue(row) {
    const sizeBytes = Number(row?.size_bytes ?? row?.sizeBytes);
    return Number.isFinite(sizeBytes) && sizeBytes >= NUM.ZERO
      ? sizeBytes
      : null;
  }

  /**
   * Handle system cache change notifications.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  onSystemTableCacheChange(tableName, operation, record) {
    if (
      operation !== TABLE_CREATION_SERVICE_LITERAL.UPDATE &&
      operation !== TABLE_CREATION_SERVICE_LITERAL.INSERT
    ) {
      return;
    }
    if (tableName === TABLES.TABLES) {
      this.handleTablePolicyCacheChange(operation, record);
      return;
    }
    if (tableName === TABLES.PARTITIONS) {
      this.handlePartitionMetricsCacheChange(operation, record);
    }
  }

  /**
   * Handle split/merge trigger decisions for table policy cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handleTablePolicyCacheChange(operation, record) {
    const tableId = this.resolveTableId(record);
    const policyValue = this.resolveTablePolicyValue(record);
    if (!tableId || policyValue === null) {
      return;
    }
    const previousPolicyValue = this.tablePolicyByTableId.get(tableId);
    this.tablePolicyByTableId.set(tableId, policyValue);
    if (previousPolicyValue === policyValue) {
      return;
    }
    this.logger.debug(QUERY_LOG_MSG.TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL, {
      tableId,
      operation,
    });
    this.requestSplitMergeEvaluation({
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.TABLE_POLICY_CHANGED,
    });
  }

  /**
   * Handle split/merge trigger decisions for partition size cache changes.
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  handlePartitionMetricsCacheChange(operation, record) {
    const partitionId = this.resolvePartitionId(record);
    const partitionSize = this.resolvePartitionSizeValue(record);
    if (!partitionId || partitionSize === null) {
      return;
    }
    const previousPartitionSize =
      this.partitionSizeByPartitionId.get(partitionId);
    this.partitionSizeByPartitionId.set(partitionId, partitionSize);
    if (previousPartitionSize === partitionSize) {
      return;
    }
    this.logger.debug(
      QUERY_LOG_MSG.TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL,
      {
        partitionId,
        operation,
        previousPartitionSize,
        partitionSize,
      },
    );
    this.requestSplitMergeEvaluation({
      reasonCode: TABLE_CREATION_SERVICE_LITERAL.PARTITION_SIZE_CHANGED,
      partitionId,
    });
  }

  /**
   * Request split/merge evaluation through the manager's canonical trigger path.
   * Falls back to direct evaluation when the manager does not expose the
   * coalesced request API yet.
   * @param {Object} [context]
   * @private
   */
  requestSplitMergeEvaluation(context = {}) {
    const manager = this.partitionSplitMergeManager;
    if (!manager) {
      return;
    }
    if (
      typeof manager.requestEvaluation ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      manager.requestEvaluation(context);
      return;
    }
    void this.evaluateSplitMergeLifecycle();
  }

  /**
   * Set initial table partition provisioning callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setPartitionProvisioner(provisioner) {
    this.partitionProvisioner =
      typeof provisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION
        ? provisioner
        : null;
  }

  /**
   * Create a table from a parsed CREATE TABLE AST.
   * Automatically uses PRIMARY KEY as partition key.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @return {Promise<Object>} Creation result.
   */
  async createTable(ast, options = {}) {
    const { tableName, columns, primaryKey, ifNotExists } = ast;
    this.logger.info(QUERY_LOG_MSG.TABLE_CREATE_START, {
      tableName,
      columnCount: columns.length,
      primaryKey,
      ifNotExists,
    });

    // Validate PRIMARY KEY requirement (Requirement 20.2)
    if (!primaryKey || primaryKey.length === NUM.ZERO) {
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
            deliveryPriority: "critical",
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
            deliveryPriority: "critical",
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
  }

  /**
   * Provision initial partition replica(s) for a newly-created table.
   * @param {Object} context - Provisioning context.
   * @param {string} context.tableId - Table ID.
   * @param {string} context.tableName - Table name.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Initial partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} context.replicaCount - Desired replica count.
   * @return {Promise<Object|null>}
   * @private
   */
  async provisionInitialPartition(context) {
    const minimumRoutableReplicaCount =
      Number.isInteger(context?.minimumRoutableReplicaCount) &&
      context.minimumRoutableReplicaCount > 0
        ? context.minimumRoutableReplicaCount
        : this.resolveDefaultMinimumRoutableReplicaCount(context?.replicaCount);
    if (
      typeof this.partitionProvisioner !==
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return normalizeProvisioningSummary(null, {
        ...context,
        minimumRoutableReplicaCount,
      });
    }
    const { tableId, tableName, partitionId, replicaCount } = context;
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      tableId,
      tableName,
      partitionId,
      replicaCount,
    });
    try {
      const provisioningResult = await this.partitionProvisioner({
        ...context,
        minimumRoutableReplicaCount,
      });
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
      });
      return normalizeProvisioningSummary(provisioningResult, {
        ...context,
        minimumRoutableReplicaCount,
      });
    } catch (error) {
      this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_FAILED, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
        error: error.message,
      });
      if (!error.code) {
        error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      }
      throw error;
    }
  }

  /**
   * Resolve the default minimum routable cohort for CREATE TABLE partition
   * provisioning. CREATE TABLE only needs a writable quorum before the
   * statement can return; remaining replicas may continue converging.
   * @param {number} replicaCount
   * @return {number|null}
   * @private
   */
  resolveDefaultMinimumRoutableReplicaCount(replicaCount) {
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : null;
    if (!normalizedReplicaCount) {
      return null;
    }
    const minimumRoutableReplicaCount =
      typeof this.calculateQuorumReplicaCount === "function"
        ? this.calculateQuorumReplicaCount(normalizedReplicaCount)
        : Math.floor(normalizedReplicaCount / 2) + 1;
    return Number.isInteger(minimumRoutableReplicaCount) &&
      minimumRoutableReplicaCount > NUM.ZERO
      ? minimumRoutableReplicaCount
      : null;
  }

  /**
   * Trigger policy-driven split/merge evaluation after table lifecycle changes.
   * @return {Promise<void>}
   * @private
   */
  async evaluateSplitMergeLifecycle() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.evaluateAllPartitions !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    try {
      await manager.evaluateAllPartitions();
    } catch (error) {
      this.logger.warn(QUERY_LOG_MSG.TABLE_SPLIT_MERGE_EVAL_FAILED, {
        splitMergeEvaluationError: error.message,
      });
    }
  }

  /**
   * Start periodic split/merge evaluation when supported by the manager.
   * @private
   */
  startPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.startPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    manager.startPeriodicEvaluation();
  }

  /**
   * Stop periodic split/merge evaluation when supported by the manager.
   * @private
   */
  stopPeriodicSplitMergeEvaluation() {
    const manager = this.partitionSplitMergeManager;
    if (
      !manager ||
      typeof manager.stopPeriodicEvaluation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return;
    }
    manager.stopPeriodicEvaluation();
  }

  /**
   * Shutdown lifecycle-owned resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
  }
  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }
  buildInitialPartitionMetadataFromTableRecord(
    tableId,
    tableName,
    existingTableRecord = null,
  ) {
    const partitionVersion = Number(
      existingTableRecord?.active_partition_version ??
        existingTableRecord?.activePartitionVersion ??
        1,
    );
    return {
      partition_id: `${tableId}-p1`,
      table_id: tableId,
      table_name:
        existingTableRecord?.table_name ||
        existingTableRecord?.tableName ||
        tableName,
      partition_key_start: null,
      partition_key_end: null,
      partition_version:
        Number.isInteger(partitionVersion) && partitionVersion > NUM.ZERO
          ? partitionVersion
          : NUM.ONE,
      replica_count: this.defaultReplicaCount,
      size_bytes: NUM.ZERO,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  /**
   * Derive partition key from PRIMARY KEY columns.
   * Requirement 20.1: Automatically use PRIMARY KEY as partition key.
   * @param {Array<string>} primaryKey - PRIMARY KEY column names.
   * @return {string} Partition key (comma-separated for composite keys).
   * @private
   */
  derivePartitionKey(primaryKey) {
    if (!primaryKey || primaryKey.length === NUM.ZERO) {
      throw new Error(QUERY_ERROR_MSG.PRIMARY_KEY_REQUIRED_DETAIL);
    }

    // For composite PRIMARY KEY, use all columns as partition key
    return primaryKey.join(TABLE_CREATION_SERVICE_LITERAL.EMPTY);
  }

  /**
   * Build schema definition from column AST.
   * @param {Array<Object>} columns - Column definitions from AST.
   * @return {Object} Schema definition.
   * @private
   */
  buildSchemaDefinition(columns) {
    return {
      columns: columns.map((col) => ({
        name: col.name,
        type: this.normalizeDataType(col.dataType),
        primaryKey: col.primaryKey || false,
        notNull: col.notNull || false,
        unique: col.unique || false,
        defaultValue: col.defaultValue?.value,
      })),
    };
  }

  /**
   * Normalize data type to SQLite-compatible type.
   * @param {Object} dataType - Data type AST.
   * @return {string} Normalized type name.
   * @private
   */
  normalizeDataType(dataType) {
    const typeName = dataType.name.toUpperCase();

    // Map common SQL types to SQLite types
    const typeMap = {
      INT: "INTEGER",
      BIGINT: "INTEGER",
      SMALLINT: "INTEGER",
      TINYINT: "INTEGER",
      VARCHAR: "TEXT",
      CHAR: "TEXT",
      NVARCHAR: "TEXT",
      NCHAR: "TEXT",
      CLOB: "TEXT",
      FLOAT: "REAL",
      DOUBLE: "REAL",
      DECIMAL: "REAL",
      NUMERIC: "REAL",
      BOOLEAN: "INTEGER",
      BOOL: "INTEGER",
      DATETIME: "TEXT",
      TIMESTAMP: "TEXT",
      DATE: "TEXT",
      TIME: "TEXT",
    };
    return typeMap[typeName] || typeName;
  }

  /**
   * Check if a table exists.
   * @param {string} tableName - Table name.
   * @return {boolean} True if table exists.
   * @private
   */
  tableExists(tableName) {
    return this.getTableRecord(tableName) !== null;
  }

  /**
   * Resolve one table metadata row, preferring cache and falling back to an
   * authoritative control-plane read when cache visibility lags.
   * @param {string} tableName
   * @return {Promise<Object|null>}
   * @private
   */
  async findExistingTableRecord(tableName) {
    const cachedTable = this.getTableRecord(tableName);
    if (cachedTable) {
      return cachedTable;
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
        TABLES.TABLES,
        TABLE_CREATION_SQL.SELECT_TABLE_BY_NAME,
        [tableName],
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
}
export { TableCreationServicePart1 };
