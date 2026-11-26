/**
 * Table Creation Service - Handles CREATE TABLE with automatic partition key.
 * Implements automatic partition key from PRIMARY KEY and partition transparency.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM} from '../constants/index.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {QUERY_SUBSYSTEM} from './query-constants.js';
import {CancellationToken} from './cancellation-token.js';
import {executeCreateTableProvisioning} from './table-creation-service-create-table.js';
import {
  createTable,
  executeDurableSchemaProvisioningJob,
  resumeDurableProvisioningJobs,
} from './table-creation-service-durable-job.js';
import {SchemaProvisioningJobOwner} from './schema-provisioning-job-owner.js';
import {SchemaProvisioningJobRepository} from './schema-provisioning-job-repository.js';
import {
  assertCallableCollaboratorMethod,
  defineTableCreationSplitMergeCoordination,
} from './table-creation-service-split-merge-coordination.js';
import {
  buildInitialPartitionMetadataFromTableRecord,
  provisionInitialPartition,
  resolveDefaultMinimumRoutableReplicaCount,
} from './table-creation-service-partition-provisioning.js';
import {
  buildSchemaDefinition,
  derivePartitionKey,
  normalizeDataType,
} from './table-creation-service-schema-derivation.js';
import {
  findExistingPartitionRecord,
  findExistingTableRecord,
  getPartitionKey,
  getPartitionRecord,
  getTableRecord,
  getTableSchema,
  tableExists,
} from './table-creation-service-metadata-lookup.js';
import {
  EXISTING_TABLE_RECONCILIATION_METHODS,
} from './table-creation-service-existing-table-reconciliation.js';
import {
  isPartitionField,
  stripPartitionDetails,
  validatePrimaryKey,
} from './table-creation-service-result-projection.js';

const SCHEMA_PROVISIONING_SHUTDOWN_REASON =
  'Schema provisioning cancelled during shutdown';
const GATEWAY_COLLABORATOR_LABEL =
  'TableCreationService controlPlaneSystemTableGateway';
const QUORUM_CALLBACK_LABEL =
  'TableCreationService calculateQuorumReplicaCount';
const PROVISIONER_CALLBACK_LABEL =
  'TableCreationService partitionProvisioner';
const READ_ROWS_METHOD_NAME = 'readRows';
const SUBMIT_MUTATION_METHOD_NAME = 'submitMutation';

function validateControlPlaneGatewayCollaborator(gateway) {
  if (gateway === null || gateway === undefined) {
    return null;
  }
  assertCallableCollaboratorMethod(
    gateway,
    READ_ROWS_METHOD_NAME,
    GATEWAY_COLLABORATOR_LABEL,
  );
  assertCallableCollaboratorMethod(
    gateway,
    SUBMIT_MUTATION_METHOD_NAME,
    GATEWAY_COLLABORATOR_LABEL,
  );
  return gateway;
}

function resolveOptionalCallback(callback, label) {
  if (callback === null || callback === undefined) {
    return null;
  }
  if (typeof callback !== 'function') {
    throw new TypeError(`${label} must be a function when provided`);
  }
  return callback;
}

/**
 * TableCreationService handles table creation with automatic partition key
 * derivation from PRIMARY KEY and ensures partition transparency.
 */
class TableCreationService {
  /**
   * Create a new TableCreationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Function} options.partitionProvisioner - Initial partition
   *   provisioning callback.
   */
  constructor(options = {}) {
    this.logger = this.initLogger();
    this.systemCache = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway = null;
    this.schemaProvisioningJobRepository = null;
    const defaultGateway =
      options.controlPlaneSystemTableGateway !== undefined ?
        options.controlPlaneSystemTableGateway :
        createControlPlaneRuntimeBundle({
          getCdcIntegrationService: () => this.cdcIntegrationService,
          getSystemTableCache: () => this.systemCache,
        }).controlPlaneSystemTableGateway;
    this.setControlPlaneSystemTableGateway(defaultGateway);
    this.schemaProvisioningJobRepository =
      options.schemaProvisioningJobRepository ||
      new SchemaProvisioningJobRepository({
        gateway: this.controlPlaneSystemTableGateway,
      });
    this.schemaProvisioningJobOwner =
      options.schemaProvisioningJobOwner || new SchemaProvisioningJobOwner({
        repository: this.schemaProvisioningJobRepository,
        logger: this.logger,
        workflowCoordinator: options.schemaWorkflowCoordinator,
        ownerId: options.schemaProvisioningOwnerId,
        now: options.now,
        leaseMs: options.schemaProvisioningLeaseMs,
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
        retrySetTimeoutFn: options.schemaProvisioningRetrySetTimeoutFn,
        retryClearTimeoutFn: options.schemaProvisioningRetryClearTimeoutFn,
      });
    this.schemaProvisioningCancellationToken = new CancellationToken();
    this.partitionSplitMergeManager = null;
    this.tablePolicyByTableId = new Map();
    this.partitionSizeByPartitionId = new Map();
    this.cachePolicyChangeListener = null;
    this.calculateQuorumReplicaCount = resolveOptionalCallback(
      options.calculateQuorumReplicaCount,
      QUORUM_CALLBACK_LABEL,
    );
    this.partitionProvisioner = resolveOptionalCallback(
      options.partitionProvisioner,
      PROVISIONER_CALLBACK_LABEL,
    );

    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || NUM.THREE;
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
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }

  /**
   * Set and validate the control-plane system-table gateway collaborator.
   * @param {Object|null} controlPlaneSystemTableGateway
   */
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    const validatedGateway = validateControlPlaneGatewayCollaborator(
      controlPlaneSystemTableGateway,
    );
    this.controlPlaneSystemTableGateway = validatedGateway;
    this.schemaProvisioningJobRepository?.setGateway(
      this.controlPlaneSystemTableGateway,
    );
  }

  /**
   * Set initial table partition provisioning callback.
   * @param {Function|null} provisioner - Provisioning callback.
   */
  setPartitionProvisioner(provisioner) {
    this.partitionProvisioner = resolveOptionalCallback(
      provisioner,
      PROVISIONER_CALLBACK_LABEL,
    );
  }

  /**
   * Shutdown lifecycle-owned resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.schemaProvisioningJobOwner?.shutdown?.();
    this.schemaProvisioningCancellationToken.cancel(
      SCHEMA_PROVISIONING_SHUTDOWN_REASON,
    );
    this.detachCachePolicyListener();
    this.stopPeriodicSplitMergeEvaluation();
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  derivePartitionKey(primaryKey) {
    return derivePartitionKey(primaryKey);
  }

  buildSchemaDefinition(columnsOrAst, tableConstraints = [], primaryKey = null) {
    return buildSchemaDefinition(columnsOrAst, tableConstraints, primaryKey);
  }

  normalizeDataType(dataType) {
    return normalizeDataType(dataType);
  }

  validatePrimaryKey(ast) {
    return validatePrimaryKey(ast);
  }

  stripPartitionDetails(result) {
    return stripPartitionDetails(result);
  }

  isPartitionField(fieldName) {
    return isPartitionField(fieldName);
  }

  tableExists(tableName) {
    return tableExists(this, tableName);
  }

  findExistingTableRecord(tableName) {
    return findExistingTableRecord(this, tableName);
  }

  findExistingPartitionRecord(partitionId) {
    return findExistingPartitionRecord(this, partitionId);
  }

  getTableRecord(tableName) {
    return getTableRecord(this, tableName);
  }

  getPartitionRecord(partitionId) {
    return getPartitionRecord(this, partitionId);
  }

  getPartitionKey(tableName) {
    return getPartitionKey(this, tableName);
  }

  getTableSchema(tableName) {
    return getTableSchema(this, tableName);
  }

  provisionInitialPartition(context) {
    return provisionInitialPartition(this, context);
  }

  resolveDefaultMinimumRoutableReplicaCount(replicaCount) {
    return resolveDefaultMinimumRoutableReplicaCount(this, replicaCount);
  }

  buildInitialPartitionMetadataFromTableRecord(
    tableId,
    tableName,
    existingTableRecord = null,
  ) {
    return buildInitialPartitionMetadataFromTableRecord(
      this,
      tableId,
      tableName,
      existingTableRecord,
    );
  }

  executeCreateTableProvisioning(ast, options = {}) {
    return executeCreateTableProvisioning(this, ast, options);
  }

  executeDurableSchemaProvisioningJob(ast, job, onMetadataCommitted = null) {
    return executeDurableSchemaProvisioningJob(
      this,
      ast,
      job,
      onMetadataCommitted,
    );
  }

  createTable(ast, options = {}) {
    return createTable(this, ast, options);
  }

  resumeDurableProvisioningJobs() {
    return resumeDurableProvisioningJobs(this);
  }
}

Object.assign(
  TableCreationService.prototype,
  EXISTING_TABLE_RECONCILIATION_METHODS,
);

defineTableCreationSplitMergeCoordination(TableCreationService);

export {
  TableCreationService,
};
