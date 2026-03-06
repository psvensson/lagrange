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
  ReplicaDispatchService,
} from '../../control-plane/replica-dispatch-service.js';
import {
  ControlPlaneReadinessService,
} from '../../control-plane/control-plane-readiness-service.js';
import {
  RebalanceCoordinator,
} from '../../rebalancer/rebalance-coordinator.js';
import {
  StorageAdmissionService,
} from '../../rebalancer/storage-admission-service.js';
import {
  StorageCapacityAccountingService,
} from '../../rebalancer/storage-capacity-accounting-service.js';
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
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      tablePolicyService,
      messageGroupServices,
      rebalanceCoordinator: existingCoordinator,
      cdcGroupPropagationService,
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

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.forSubsystem(
      CONTROL_PLANE_SETUP_SUBSYSTEM,
    );

    logger.info(LOG_MSG.CREATING, {
      nodeId,
      nodeAddress,
      hasMessageGroupServices: !!messageGroupServices,
      messageGroupCount: messageGroupServices ?
        messageGroupServices.size : 0,
    });

    // Create or use existing RebalanceCoordinator
    let rebalanceCoordinator = existingCoordinator;
    let storageAccountingService =
      rebalanceCoordinator?.storageAccountingService || null;
    if (!storageAccountingService) {
      storageAccountingService =
        new StorageCapacityAccountingService({
          systemTableCache,
          sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
        });
    }

    let controlPlaneReadinessService =
      rebalanceCoordinator?.controlPlaneReadinessService || null;
    if (!controlPlaneReadinessService) {
      controlPlaneReadinessService = new ControlPlaneReadinessService({
        nodeId,
        systemTableCache,
        storageAccountingService,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
      });
    }

    let storageAdmissionService =
      rebalanceCoordinator?.storageAdmissionService || null;
    if (!storageAdmissionService) {
      storageAdmissionService = new StorageAdmissionService({
        nodeId,
        accountingService: storageAccountingService,
        systemTableCache,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
        controlPlaneReadinessService,
      });
    }

    if (!rebalanceCoordinator) {
      rebalanceCoordinator = new RebalanceCoordinator({
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        messageRouter,
        tablePolicyService,
        sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
        storageAccountingService,
        storageAdmissionService,
        controlPlaneReadinessService,
        cdcGroupPropagationService: cdcGroupPropagationService || null,
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
    if (!rebalanceCoordinator.cdcGroupPropagationService &&
        cdcGroupPropagationService) {
      rebalanceCoordinator.cdcGroupPropagationService =
        cdcGroupPropagationService;
    }

    // Create decomposed control plane services
    const heartbeatService = new HeartbeatService({
      nodeId,
      nodeAddress,
      cdcIntegrationService,
      systemTableCache,
    });
    heartbeatService.initialize();

    const leaseService = new LeaseService({
      nodeId,
      nodeLeaseOwner: heartbeatService,
      systemTableCache,
      sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
    });
    leaseService.initialize();

    const endpointService = new EndpointService({
      nodeId,
      cdcIntegrationService,
      systemTableCache,
      sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
    });
    endpointService.initialize();

    const dispatchService = new ReplicaDispatchService({
      nodeId,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      rebalanceCoordinator,
      sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
      controlPlaneReadinessService,
      storageAccountingService,
      cdcGroupPropagationService: cdcGroupPropagationService || null,
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
