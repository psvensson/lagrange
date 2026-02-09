/**
 * ReplicaHandlerSetup - Shared replica handler creation and configuration.
 *
 * This component extracts the common replica handler setup logic used by both
 * BootstrapService and NodeJoiningService. It handles:
 * - Creating the ReplicaStateMachine instance
 * - Creating the ReplicaHandler instance
 * - Starting the timeout checker for the state machine
 *
 * Requirements: 3.2 - Shared Replica_Handler_Setup component
 *
 * @module bootstrap/shared/replica-handler-setup
 */

import {ReplicaHandler} from '../../node/replica-handler.js';
import {ReplicaStateMachine} from '../../node/replica-state-machine.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {SUBSYSTEM} from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const REPLICA_HANDLER_SETUP_SUBSYSTEM = SUBSYSTEM.REPLICA_HANDLER_SETUP;

/**
 * Log messages for ReplicaHandlerSetup.
 */
const LOG_MSG = Object.freeze({
  CREATING: 'Creating ReplicaHandler and ReplicaStateMachine',
  CREATED: 'ReplicaHandler and ReplicaStateMachine created successfully',
  STATE_MACHINE_STARTED: 'ReplicaStateMachine timeout checker started',
});

/**
 * Error messages for ReplicaHandlerSetup.
 */
const ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'nodeId',
  MESSAGE_ROUTER_REQUIRED: 'messageRouter',
  CDC_INTEGRATION_SERVICE_REQUIRED: 'cdcIntegrationService',
  SYSTEM_TABLE_CACHE_REQUIRED: 'systemTableCache',
  CREATE_PARTITION_SERVICE_REQUIRED: 'createPartitionService',
});

/**
 * Shared replica handler setup used by both bootstrap paths.
 * Provides a static factory method to create and configure ReplicaHandler
 * and ReplicaStateMachine.
 */
class ReplicaHandlerSetup {
  /**
   * Create and configure replica handler and state machine.
   *
   * This method handles the complete setup of ReplicaHandler including:
   * - Creating the ReplicaStateMachine with CDC integration
   * - Starting the timeout checker for transitional state monitoring
   * - Creating the ReplicaHandler with all required dependencies
   * - Initializing the handler
   * - Registering the handler with the message router
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router for registration (required).
   * @param {Object} options.cdcIntegrationService - CDC integration service (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Function} options.createPartitionService - Factory for creating partitions (required).
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Object} options.rpcClient - Optional RPC client for responses.
   * @return {Object} Object containing replicaHandler and replicaStateMachine.
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static create(options) {
    const {
      nodeId,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      createPartitionService,
      dataDir,
      rpcClient,
    } = options;

    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError('ReplicaHandlerSetup', ERROR_MSG.NODE_ID_REQUIRED);
    }
    if (!messageRouter) {
      throw new DependencyError('ReplicaHandlerSetup', ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }
    if (!cdcIntegrationService) {
      throw new DependencyError('ReplicaHandlerSetup', ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED);
    }
    if (!systemTableCache) {
      throw new DependencyError('ReplicaHandlerSetup', ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
    }
    if (!createPartitionService) {
      throw new DependencyError(
        'ReplicaHandlerSetup',
        ERROR_MSG.CREATE_PARTITION_SERVICE_REQUIRED,
      );
    }

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_HANDLER_SETUP_SUBSYSTEM) : console;

    logger.info(LOG_MSG.CREATING, {
      nodeId,
      hasDataDir: !!dataDir,
      hasRpcClient: !!rpcClient,
    });

    // Create ReplicaStateMachine for tracking replica lifecycle states
    const replicaStateMachine = new ReplicaStateMachine({
      nodeId,
      cdcIntegrationService,
    });

    // Start the timeout checker for transitional state monitoring
    replicaStateMachine.startTimeoutChecker();

    logger.debug(LOG_MSG.STATE_MACHINE_STARTED, {
      nodeId,
    });

    // Create ReplicaHandler for CREATE_REPLICA/REMOVE_REPLICA execution
    const replicaHandler = new ReplicaHandler({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      replicaStateMachine,
      createPartitionService,
      dataDir,
    });

    // Initialize the handler
    replicaHandler.initialize();

    // Register with message router for receiving replica operation messages
    replicaHandler.registerWithRouter(messageRouter, {
      rpcClient,
    });

    logger.info(LOG_MSG.CREATED, {
      nodeId,
      hasDataDir: !!dataDir,
      hasRpcClient: !!rpcClient,
    });

    return {
      replicaHandler,
      replicaStateMachine,
    };
  }
}

export {ReplicaHandlerSetup};
