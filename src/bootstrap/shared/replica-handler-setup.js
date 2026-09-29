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
import {
  armSnapshotOfferRouting,
  wrapPartitionServiceFactoryWithSnapshotCatchup,
} from './snapshot-catchup-wiring.js';

/**
 * Subsystem identifier for logging.
 */
const REPLICA_HANDLER_SETUP_SUBSYSTEM = SUBSYSTEM.REPLICA_HANDLER_SETUP;
const REPLICA_HANDLER_SETUP_NAME = 'ReplicaHandlerSetup';

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
 * Typed refusal: a replica lifecycle owner stamped for one node boot
 * incarnation was offered to another. Never re-minted silently (R07/R11).
 */
const REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH =
  'REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH';

/**
 * Refuse an owner of another node incarnation.
 * @param {Object} owner - ReplicaStateMachine or ReplicaHandler.
 * @param {number} ownerIncarnation - The acquiring incarnation.
 * @return {Object} The owner, when it belongs to that incarnation.
 */
function assertReplicaLifecycleOwnerIncarnation(owner, ownerIncarnation) {
  const requestedIncarnation = normalizeOwnerIncarnation(ownerIncarnation);
  if (owner.ownerIncarnation === requestedIncarnation) {
    return owner;
  }
  const error = new Error(
    `replica lifecycle owner of node incarnation ${owner.ownerIncarnation} ` +
    `refused for incarnation ${requestedIncarnation}`,
  );
  error.code = REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH;
  error.ownerIncarnation = owner.ownerIncarnation;
  error.requestedIncarnation = requestedIncarnation;
  throw error;
}

function normalizeOwnerIncarnation(ownerIncarnation) {
  return Number.isSafeInteger(ownerIncarnation) && ownerIncarnation > 0 ?
    ownerIncarnation :
    0;
}

/**
 * Shared replica handler setup used by both bootstrap paths.
 * Provides a static factory method to create and configure ReplicaHandler
 * and ReplicaStateMachine.
 */
class ReplicaHandlerSetup {
  static createReplicaStateMachine(options = {}) {
    const {
      nodeId,
      cdcIntegrationService,
      systemTableCache,
      timeSource,
      ownerIncarnation,
    } = options;
    if (!nodeId) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    const replicaStateMachine = new ReplicaStateMachine({
      nodeId,
      cdcIntegrationService,
      systemTableCache,
      timeSource,
      ownerIncarnation,
    });
    replicaStateMachine.startTimeoutChecker();
    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REPLICA_HANDLER_SETUP_SUBSYSTEM) : console;
    logger.debug(LOG_MSG.STATE_MACHINE_STARTED, {nodeId});
    return replicaStateMachine;
  }

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
   * @param {Object} options.executorOutcomeEmitter - Optional executor
   *   outcome emitter shared with the rebalance coordinator.
   * @param {Object} [options.replicaStateMachine] - The acquired state
   *   machine; refused when stamped for another incarnation.
   * @param {number} [options.ownerIncarnation] - Owning node boot incarnation.
   * @param {Object} [options.timeSource] - The node's canonical time source.
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
      executorOutcomeEmitter,
      replicaStateMachine: existingReplicaStateMachine,
      timeSource,
      ownerIncarnation,
    } = options;

    // Validate required dependencies
    if (!nodeId) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.NODE_ID_REQUIRED,
      );
    }
    if (!messageRouter) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
      );
    }
    if (!cdcIntegrationService) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED,
      );
    }
    if (!systemTableCache) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
        ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
      );
    }
    if (!createPartitionService) {
      throw new DependencyError(
        REPLICA_HANDLER_SETUP_NAME,
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

    const replicaStateMachine = existingReplicaStateMachine ?
      assertReplicaLifecycleOwnerIncarnation(
        existingReplicaStateMachine,
        ownerIncarnation,
      ) :
      ReplicaHandlerSetup.createReplicaStateMachine({
        nodeId,
        cdcIntegrationService,
        systemTableCache,
        timeSource,
        ownerIncarnation,
      });

    // S6 snapshot catch-up wiring: BOTH production factories (bootstrap and
    // join/durable-rejoin) flow through this shared setup, so wrapping HERE
    // sets the onSnapshotCatchupNeeded dispatcher seam on every
    // factory-built service — including install replacements, which are
    // recreated through this same wrapped factory.
    const snapshotWiredCreatePartitionService =
      wrapPartitionServiceFactoryWithSnapshotCatchup({
        createPartitionService,
        systemTableCache,
        messageRouter,
      });

    // Create ReplicaHandler for CREATE_REPLICA/REMOVE_REPLICA execution
    const replicaHandler = new ReplicaHandler({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      replicaStateMachine,
      messageRouter,
      createPartitionService: snapshotWiredCreatePartitionService,
      dataDir,
      executorOutcomeEmitter,
      ownerIncarnation,
    });

    // Initialize the handler
    replicaHandler.initialize();

    // Register with message router for receiving replica operation messages
    replicaHandler.registerWithRouter(messageRouter, {
      rpcClient,
    });

    // S6 follower-side offer routing: every adopted inbound bulk connection
    // is armed with the peek-then-replay snapshot offer router driving the
    // full receive -> install -> recreate -> replace loop.
    if (messageRouter.bulkChannelRegistry) {
      armSnapshotOfferRouting({
        registry: messageRouter.bulkChannelRegistry,
        replicaHandler,
        systemTableCache,
      });
    }

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

/**
 * The one acquisition owner of a node's replica lifecycle authority (one
 * ReplicaHandler + one ReplicaStateMachine and its timeout checker) for one
 * live node boot incarnation. Retries and re-entry REACQUIRE the recorded
 * owner; they never mint a second state machine or a second timer
 * authority. The record is fenced by incarnation: an owner of G is refused
 * for G+1. Service fields (replicaHandler, replicaStateMachine) are
 * projections of this record, so a temporarily absent field never re-mints.
 */
class ReplicaLifecycleOwner {
  constructor() {
    this.record = null;
  }

  /**
   * Reacquire the recorded owner of this incarnation, re-arming its timeout
   * checker (idempotent), or return null when nothing is recorded.
   * @param {number} ownerIncarnation
   * @return {Object|null} {ownerIncarnation, replicaStateMachine,
   *   replicaHandler}.
   */
  reacquire(ownerIncarnation) {
    const record = this.record;
    if (record === null) {
      return null;
    }
    assertReplicaLifecycleOwnerIncarnation(record, ownerIncarnation);
    record.replicaStateMachine.startTimeoutChecker();
    return record;
  }

  /**
   * Acquire the incarnation's ReplicaStateMachine (seed registration needs it
   * before the handler exists).
   * @param {Object} options - createReplicaStateMachine options, including
   *   ownerIncarnation and the node's canonical timeSource.
   * @return {ReplicaStateMachine}
   */
  acquireStateMachine(options) {
    const record = this.reacquire(options.ownerIncarnation);
    if (record !== null) {
      return record.replicaStateMachine;
    }
    const replicaStateMachine =
      ReplicaHandlerSetup.createReplicaStateMachine(options);
    this.record = {
      ownerIncarnation: normalizeOwnerIncarnation(options.ownerIncarnation),
      replicaStateMachine,
      replicaHandler: null,
    };
    return replicaStateMachine;
  }

  /**
   * Acquire the incarnation's ReplicaHandler and ReplicaStateMachine.
   * @param {Object} options - ReplicaHandlerSetup.create options, including
   *   ownerIncarnation and the node's canonical timeSource.
   * @return {{replicaHandler: Object, replicaStateMachine: Object}}
   */
  acquire(options) {
    const record = this.reacquire(options.ownerIncarnation);
    if (record !== null && record.replicaHandler !== null) {
      return {
        replicaHandler: record.replicaHandler,
        replicaStateMachine: record.replicaStateMachine,
      };
    }
    const acquired = ReplicaHandlerSetup.create({
      ...options,
      replicaStateMachine: record === null ? null : record.replicaStateMachine,
    });
    this.record = {
      ownerIncarnation: normalizeOwnerIncarnation(options.ownerIncarnation),
      replicaStateMachine: acquired.replicaStateMachine,
      replicaHandler: acquired.replicaHandler,
    };
    return acquired;
  }

  /**
   * Whether this incarnation's owner is established: acquired for exactly
   * this incarnation, handler present and its timeout checker live.
   * @param {number} ownerIncarnation
   * @return {boolean}
   */
  isEstablished(ownerIncarnation) {
    const record = this.record;
    return record !== null &&
      record.ownerIncarnation === normalizeOwnerIncarnation(ownerIncarnation) &&
      record.replicaHandler !== null &&
      record.replicaStateMachine.isTimeoutCheckerArmed() === true;
  }

  /**
   * Release the recorded owner, stopping its timer authority, so teardown
   * can never orphan it. The next acquisition mints afresh.
   * @return {Object|null} The released record.
   */
  release() {
    const record = this.record;
    this.record = null;
    if (record !== null) {
      record.replicaStateMachine.stopTimeoutChecker();
    }
    return record;
  }
}

export {
  REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH,
  ReplicaHandlerSetup,
  ReplicaLifecycleOwner,
};
