/**
 * ControlPlaneSetup - Shared control plane service creation
 * and configuration.
 *
 * This component extracts the common control plane setup logic
 * used by both BootstrapService and NodeJoiningService. It
 * handles:
 * - Creating the RebalanceCoordinator instance
 * - Creating decomposed control plane services directly
 * - Initializing the services
 * - Attaching message group services
 * - Registering the node with the control plane
 * - Starting the local heartbeat
 *
 * Requirements: 3.3 - Shared Control_Plane_Setup component
 *
 * @module bootstrap/shared/control-plane-setup
 */

import {HeartbeatService} from '../../control-plane/heartbeat-service.js';
import {LeaseService} from '../../control-plane/lease-service.js';
import {EndpointService} from '../../control-plane/endpoint-service.js';
import {
  registerControlPlaneSystemTableGateway,
} from '../../control-plane/control-plane-gateway-registry.js';
import {
  createControlPlaneRuntimeBundle,
} from '../../control-plane/control-plane-runtime-bundle.js';
import {
  createSystemMetadataOwners,
  MembershipPublicationRuntimeOwner,
} from '../../control-plane/owners/index.js';
import {
  ReplicaDispatchService,
} from '../../control-plane/replica-dispatch-service.js';
import {
  ControlPlaneReadinessService,
} from '../../control-plane/control-plane-readiness-service.js';
import {
  MembershipPublicationCoordinator,
} from '../../control-plane/membership-publication-coordinator.js';
import {StartupRecoveryCoordinator} from '../startup-recovery-coordinator.js';
import {
  RebalanceCoordinator,
} from '../../rebalancer/rebalance-coordinator.js';
import {
  StorageAdmissionService,
} from '../../rebalancer/storage-admission-service.js';
import {
  StorageCapacityAccountingService,
} from '../../rebalancer/storage-capacity-accounting-service.js';
import {
  ExecutorOutcomeEmitter,
} from '../../rebalancer/executor-outcome-emitter.js';
import {NodeService} from '../../node/node-service.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {SUBSYSTEM} from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const CONTROL_PLANE_SETUP_SUBSYSTEM =
  SUBSYSTEM.CONTROL_PLANE_SETUP;

/**
 * Log messages for ControlPlaneSetup.
 */
const LOG_MSG = Object.freeze({
  CREATING: 'Creating control plane services',
  CREATED: 'Control plane services created successfully',
  COORDINATOR_CREATED: 'RebalanceCoordinator created',
  ATTACHING_MESSAGE_GROUPS: 'Attaching message group services',
  REGISTERING_NODE: 'Registering node with control plane',
  NODE_REGISTERED: 'Node registered with control plane',
  HEARTBEAT_STARTED: 'Local heartbeat started',
  REGISTRATION_FAILED:
    'Control plane node registration failed',
});

/**
 * Error messages for ControlPlaneSetup.
 */
const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  NODE_ADDRESS_REQUIRED: 'nodeAddress',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  TABLE_POLICY_SERVICE_REQUIRED: 'tablePolicyService',
  TRANSACTION_COORDINATOR_REQUIRED: 'transactionCoordinator',
});

/**
 * Shared control plane setup used by both bootstrap paths.
 * Creates decomposed control plane services directly.
 */
class ControlPlaneSetup {
  /**
   * Create and configure decomposed control plane services.
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {string} options.nodeAddress - Node address (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.tablePolicyService - Table policy service.
   * @param {Map} options.messageGroupServices - MG services to attach.
   * @param {Object} options.rebalanceCoordinator - Optional existing
   *   rebalance coordinator.
   * @return {Promise<Object>} Object containing heartbeatService,
   *   leaseService, endpointService, dispatchService, and
   *   rebalanceCoordinator.
   * @throws {DependencyError} If required dependencies missing.
   */
  static async create(options) {
    const {
      nodeId,
      nodeAddress,
      advertisedNodeWsAddress,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      tablePolicyService,
      messageGroupServices,
      rebalanceCoordinator: existingCoordinator,
      cdcGroupPropagationService,
      bootstrapReadinessState,
    } = options;

    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError(
        'ControlPlaneSetup', ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!nodeAddress) {
      throw new DependencyError(
        'ControlPlaneSetup', ERROR_MSG.NODE_ADDRESS_REQUIRED,
      );
    }
    if (!messageRouter) {
      throw new DependencyError(
        'ControlPlaneSetup', ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        'ControlPlaneSetup',
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        'ControlPlaneSetup',
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    if (!tablePolicyService) {
      throw new DependencyError(
        'ControlPlaneSetup',
        ERROR_MSG.TABLE_POLICY_SERVICE_REQUIRED,
      );
    }

    const transactionCoordinator =
      existingCoordinator?.transactionCoordinator ||
      cdcIntegrationService.sqlQueryEngine?.transactionCoordinator ||
      null;
    if (!transactionCoordinator ||
        typeof transactionCoordinator.begin !== 'function') {
      throw new DependencyError(
        'ControlPlaneSetup',
        ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.forSubsystem(
      CONTROL_PLANE_SETUP_SUBSYSTEM,
    );

    logger.info(LOG_MSG.CREATING, {
      nodeId,
      nodeAddress,
      advertisedNodeWsAddress,
      hasMessageGroupServices: !!messageGroupServices,
      messageGroupCount: messageGroupServices ?
        messageGroupServices.size : 0,
    });

    const controlPlaneRuntimeBundle = createControlPlaneRuntimeBundle({
      nodeId,
      cdcIntegrationService,
      systemTableCache,
      messageRouter,
    });
    const controlPlaneSystemTableGateway =
      controlPlaneRuntimeBundle.controlPlaneSystemTableGateway;
    registerControlPlaneSystemTableGateway(controlPlaneSystemTableGateway);

    // Create or use existing RebalanceCoordinator
    let rebalanceCoordinator = existingCoordinator;
    let storageAccountingService =
      rebalanceCoordinator?.storageAccountingService || null;
    if (!storageAccountingService) {
      storageAccountingService =
        new StorageCapacityAccountingService({
          systemTableCache,
          sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
          controlPlaneSystemTableGateway,
        });
    }

    let controlPlaneReadinessService =
      rebalanceCoordinator?.controlPlaneReadinessService || null;
    if (!controlPlaneReadinessService) {
      controlPlaneReadinessService = new ControlPlaneReadinessService({
        nodeId,
        systemTableCache,
        cacheMutationTarget: systemTableCache,
        messageRouter,
        storageAccountingService,
        cdcIntegrationService,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
        controlPlaneSystemTableGateway,
        strictOwnerDependencies: true,
      });
    }

    let storageAdmissionService =
      rebalanceCoordinator?.storageAdmissionService || null;
    if (!storageAdmissionService) {
      storageAdmissionService = new StorageAdmissionService({
        nodeId,
        accountingService: storageAccountingService,
        systemTableCache,
        cacheMutationTarget: systemTableCache,
        messageRouter,
        cdcIntegrationService,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
        controlPlaneReadinessService,
      });
    }

    const startupRecoveryCoordinator =
      rebalanceCoordinator?.startupRecoveryCoordinator ||
      new StartupRecoveryCoordinator({
        readinessState: bootstrapReadinessState || null,
      });

    if (!rebalanceCoordinator) {
      const executorOutcomeEmitter = new ExecutorOutcomeEmitter({
        logger,
      });

      rebalanceCoordinator = new RebalanceCoordinator({
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        messageRouter,
        tablePolicyService,
        sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
        transactionCoordinator,
        storageAccountingService,
        storageAdmissionService,
        controlPlaneReadinessService,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
        bootstrapReadinessState: bootstrapReadinessState || null,
        startupRecoveryCoordinator,
        controlPlaneSystemTableGateway,
        executorOutcomeEmitter,
      });
      rebalanceCoordinator.initialize();

      logger.debug(LOG_MSG.COORDINATOR_CREATED, {nodeId});
    }

    if (!rebalanceCoordinator.storageAccountingService) {
      rebalanceCoordinator.storageAccountingService = storageAccountingService;
    }
    if (!rebalanceCoordinator.storageAdmissionService) {
      rebalanceCoordinator.storageAdmissionService = storageAdmissionService;
    }
    if (!rebalanceCoordinator.controlPlaneReadinessService) {
      rebalanceCoordinator.controlPlaneReadinessService =
        controlPlaneReadinessService;
    }
    if (!rebalanceCoordinator.controlPlaneSystemTableGateway) {
      rebalanceCoordinator.controlPlaneSystemTableGateway =
        controlPlaneSystemTableGateway;
    }
    if (!rebalanceCoordinator.bootstrapReadinessState &&
        bootstrapReadinessState) {
      rebalanceCoordinator.bootstrapReadinessState = bootstrapReadinessState;
    }
    if (!rebalanceCoordinator.startupRecoveryCoordinator) {
      rebalanceCoordinator.startupRecoveryCoordinator =
        startupRecoveryCoordinator;
    } else if (typeof rebalanceCoordinator.startupRecoveryCoordinator
      .syncOwnerDependencies === 'function') {
      rebalanceCoordinator.startupRecoveryCoordinator.syncOwnerDependencies({
        readinessState: bootstrapReadinessState || null,
      });
    }
    if (!rebalanceCoordinator.cdcGroupPropagationService &&
        cdcGroupPropagationService) {
      rebalanceCoordinator.cdcGroupPropagationService =
        cdcGroupPropagationService;
    }
    if (!rebalanceCoordinator.transactionCoordinator) {
      rebalanceCoordinator.transactionCoordinator = transactionCoordinator;
    }

    const systemMetadataOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway,
      systemTableCache,
    });
    const membershipPublicationRuntimeOwner =
      new MembershipPublicationRuntimeOwner({
        nodeId,
        cdcIntegrationService,
        systemTableCache,
        messageRouter,
        controlPlaneSystemTableGateway,
        systemMetadataOwners,
      });
    const membershipPublicationService =
      new MembershipPublicationCoordinator({
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        controlPlaneReadinessService,
        replicaOperationRepository:
          rebalanceCoordinator?.repository || null,
        membershipPublicationRuntimeOwner,
      });
    if (!controlPlaneReadinessService.nodesOwner) {
      controlPlaneReadinessService.nodesOwner = systemMetadataOwners.nodesOwner;
    }
    if (!controlPlaneReadinessService.servicesOwner) {
      controlPlaneReadinessService.servicesOwner =
        systemMetadataOwners.servicesOwner;
    }
    if (typeof controlPlaneReadinessService.syncOwnerDependencies === 'function') {
      controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache,
        cacheMutationTarget: systemTableCache,
        messageRouter,
        cdcIntegrationService,
        membershipPublicationService,
      });
    }

    // Create decomposed control plane services
    const heartbeatService = new HeartbeatService({
      nodeId,
      nodeAddress,
      advertisedNodeWsAddress,
      cdcIntegrationService,
      systemTableCache,
      controlPlaneSystemTableGateway,
      verifyReporterVisibilityOnSuccess: true,
    });
    heartbeatService.initialize();
    controlPlaneReadinessService.heartbeatService = heartbeatService;

    const leaseService = new LeaseService({
      nodeId,
      nodeLeaseOwner: heartbeatService,
      systemTableCache,
      sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
      messageRouter,
      controlPlaneSystemTableGateway,
    });
    leaseService.initialize();

    const endpointService = new EndpointService({
      nodeId,
      serviceEndpointsOwner: systemMetadataOwners.serviceEndpointsOwner,
      controlPlaneSystemTableGateway,
    });
    endpointService.initialize();

    const dispatchService = new ReplicaDispatchService({
      nodeId,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      rebalanceCoordinator,
      sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
      controlPlaneReadinessService,
      storageAccountingService,
      cdcGroupPropagationService: cdcGroupPropagationService || null,
      controlPlaneSystemTableGateway,
      nodesOwner: systemMetadataOwners.nodesOwner,
      servicesOwner: systemMetadataOwners.servicesOwner,
      replicaOperationsOwner: systemMetadataOwners.replicaOperationsOwner,
    });
    dispatchService.initialize();

    // Attach message group services if provided
    if (messageGroupServices && messageGroupServices.size > 0) {
      logger.debug(LOG_MSG.ATTACHING_MESSAGE_GROUPS, {
        nodeId,
        count: messageGroupServices.size,
      });

      for (const mgs of messageGroupServices.values()) {
        dispatchService.attachMessageGroupService(mgs);
        leaseService.messageGroupServices.add(mgs);
      }
    }

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      nodeAddress,
      messageGroupCount: messageGroupServices ?
        messageGroupServices.size : 0,
    });

    return {
      heartbeatService,
      leaseService,
      endpointService,
      dispatchService,
      rebalanceCoordinator,
      membershipPublicationService,
      membershipPublicationRuntimeOwner,
      systemMetadataOwners,
    };
  }

  /**
   * Register a node with the control plane and start heartbeat.
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.heartbeatService - Heartbeat service.
   * @param {string} options.nodeAddress - Node address.
   * @return {Promise<void>}
   * @throws {Error} If registration fails.
   */
  static async registerNode(options) {
    const {
      heartbeatService,
      nodeAddress,
    } = options;

    if (!heartbeatService) {
      return;
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.forSubsystem(
      CONTROL_PLANE_SETUP_SUBSYSTEM,
    );

    const nodeId = heartbeatService.nodeId;

    logger.info(LOG_MSG.REGISTERING_NODE, {
      nodeId,
      nodeAddress,
    });

    try {
      const stats =
        await NodeService.getInstance().getNodeStats();
      await heartbeatService.sendHeartbeat(
        {
          cpu: {
            count: stats.cpu?.count,
            usagePercent: stats.cpu?.usagePercent,
          },
          memory: {
            totalBytes: stats.memory?.totalBytes,
            usagePercent: stats.memory?.usagePercent,
          },
          diskGb: stats.diskGb,
          diskUsagePercent: stats.diskUsagePercent,
        },
      );

      logger.debug(LOG_MSG.NODE_REGISTERED, {
        nodeId,
        nodeAddress,
      });

      heartbeatService.start({
        nodeAddress,
        getStats: () =>
          NodeService.getInstance().getNodeStats(),
      });

      logger.debug(LOG_MSG.HEARTBEAT_STARTED, {nodeId});
    } catch (error) {
      logger.error(LOG_MSG.REGISTRATION_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
      });
      throw error;
    }
  }
}

export {ControlPlaneSetup};
