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
import {defineTableCreationCreateTableMethod} from './table-creation-service-create-table.js';
import {defineTableCreationDurableJobMethod} from './table-creation-service-durable-job.js';
import {SchemaProvisioningJobOwner} from './schema-provisioning-job-owner.js';
import {SchemaProvisioningJobRepository} from './schema-provisioning-job-repository.js';

import {TABLE_CREATION_SERVICE_LITERAL} from './table-creation-service-completion.js';
import {defineTableCreationSplitMergeCoordination} from './table-creation-service-split-merge-coordination.js';
import {defineTableCreationPartitionProvisioning} from './table-creation-service-partition-provisioning.js';
import {defineTableCreationSchemaDerivation} from './table-creation-service-schema-derivation.js';
import {defineTableCreationMetadataLookup} from './table-creation-service-metadata-lookup.js';
import {defineTableCreationExistingTableReconciliation} from './table-creation-service-existing-table-reconciliation.js';
import {defineTableCreationResultProjection} from './table-creation-service-result-projection.js';


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
    this.systemCache = null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache,
      }).controlPlaneSystemTableGateway;
    this.schemaProvisioningJobRepository =
      options.schemaProvisioningJobRepository ||
      new SchemaProvisioningJobRepository({
        gateway: this.controlPlaneSystemTableGateway,
        systemCache: options.systemCache || null,
      });
    this.schemaProvisioningJobOwner =
      options.schemaProvisioningJobOwner || new SchemaProvisioningJobOwner({
        repository: this.schemaProvisioningJobRepository,
        workflowCoordinator: options.schemaWorkflowCoordinator,
        ownerId: options.schemaProvisioningOwnerId,
        now: options.now,
        leaseMs: options.schemaProvisioningLeaseMs,
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
        retrySetTimeoutFn: options.schemaProvisioningRetrySetTimeoutFn,
        retryClearTimeoutFn: options.schemaProvisioningRetryClearTimeoutFn,
      });
    this.partitionSplitMergeManager = null;
    this.tablePolicyByTableId = new Map();
    this.partitionSizeByPartitionId = new Map();
    this.cachePolicyChangeListener = null;
    this.calculateQuorumReplicaCount =
      typeof options.calculateQuorumReplicaCount ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        options.calculateQuorumReplicaCount :
        null;
    this.partitionProvisioner =
      typeof options.partitionProvisioner ===
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        options.partitionProvisioner :
        null;

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
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
  }
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway =
      controlPlaneSystemTableGateway || null;
    this.schemaProvisioningJobRepository?.setGateway(
      this.controlPlaneSystemTableGateway,
    );
  }

  /**
   * Set initial table partition provisioning callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setPartitionProvisioner(provisioner) {
    this.partitionProvisioner =
      typeof provisioner === TABLE_CREATION_SERVICE_LITERAL.FUNCTION ?
        provisioner :
        null;
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
}

defineTableCreationSplitMergeCoordination(TableCreationService);
defineTableCreationPartitionProvisioning(TableCreationService);
defineTableCreationSchemaDerivation(TableCreationService);
defineTableCreationMetadataLookup(TableCreationService);
defineTableCreationExistingTableReconciliation(TableCreationService);
defineTableCreationResultProjection(TableCreationService);
defineTableCreationCreateTableMethod(TableCreationService);
defineTableCreationDurableJobMethod(TableCreationService);

export {TableCreationService};
