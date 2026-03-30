/**
 * Join Cleanup Handler — handles failure cleanup and resource teardown
 * for a joining node.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {NodeState} from '../node/node-lifecycle-state-machine.js';
import {LatencyTopologySetup} from './shared/latency-topology-setup.js';
import {
  BOOTSTRAP_EVENT,
  CLEANUP_RESULT,
  JOINING_PHASE,
} from './bootstrap-constants.js';
import {
  JOINING_CLEANUP_STEP,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';
import {
  ADDRESS,
  ENTITY_TYPE,
  NUM,
  STATE,
  TYPEOF,
} from '../constants/index.js';

/**
 * Maps each JOINING_PHASE to its index in the cleanup steps array.
 * Phases that completed before the failed phase need cleanup.
 * The failed phase itself also gets cleanup.
 * @type {Object<string, number>}
 */
const JOINING_PHASE_TO_CLEANUP_INDEX = Object.freeze({
  [JOINING_PHASE.QUERYING_STATE]: NUM.ZERO,
  [JOINING_PHASE.WAITING_LEADERSHIP]: NUM.ONE,
  [JOINING_PHASE.CREATING_MESSAGE_GROUP]: NUM.TWO,
  [JOINING_PHASE.JOINING_MESSAGE_GROUP]: NUM.TWO,
  [JOINING_PHASE.CONNECTING_WEBSOCKET]: NUM.THREE,
  [JOINING_PHASE.CONTACTING_SEED]: NUM.FOUR,
});

/**
 * Cleanup steps in reverse phase order.
 * Each step undoes the work of the corresponding join phase.
 * @type {string[]}
 */
const JOINING_CLEANUP_STEPS_REVERSE = Object.freeze([
  JOINING_CLEANUP_STEP.QUERYING_STATE,
  JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
  JOINING_CLEANUP_STEP.MESSAGE_GROUP,
  JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
]);

/**
 * Handles failure cleanup and resource teardown for a joining node.
 */
class JoinCleanupHandler {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * Handle a joining failure: log, cleanup, emit event, return result.
   * @param {Error} error - The error that caused the failure.
   * @return {Promise<Object>} Joining failure result.
   */
  async handleJoiningFailure(error) {
    const failedPhase = this.delegates.getPhase();
    this.delegates.setPhase(JOINING_PHASE.FAILED);
    this.delegates.setLastError(error);
    const duration = this.delegates.getNow()() -
      this.delegates.getStartTime();
    const logger = this.delegates.getLogger();

    logger.error(JOINING_LOG_MSG.JOIN_FAILED, {
      nodeId: this.nodeId,
      phase: failedPhase,
      duration,
      error: error.message,
      stack: error.stack,
    });

    // Execute structured reverse-order cleanup before generic cleanup
    const bootstrapResponse =
      this.delegates.getBootstrapResponse();
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const cleanupContext = {
      registeredNodeId:
        this.delegates.getRegisteredJoinNodeId?.() || null,
      createdServiceIds: Array.from(messageGroupServices.keys()),
      createdMessageGroupIds: bootstrapResponse
        ?.messageGroupAssignment?.groupId ?
        [bootstrapResponse.messageGroupAssignment.groupId] :
        [],
    };
    await this.cleanupFailedJoin(failedPhase, cleanupContext);

    // Clean up partially initialized services
    await this.cleanup();

    this.delegates.emit(BOOTSTRAP_EVENT.FAILED, {
      nodeId: this.nodeId,
      phase: failedPhase,
      duration,
      error: error.message,
    });

    return {
      success: false,
      nodeId: this.nodeId,
      duration,
      error: error.message,
      phase: failedPhase,
      retryable: error?.retryable === true,
      retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(error.retryAfterMs)) :
        NUM.ZERO,
    };
  }

  /**
   * Clean up a failed join in reverse phase order.
   * Each cleanup step undoes the work of the corresponding join phase.
   * Errors are logged but never thrown — cleanup is best-effort.
   * @param {string} failedPhase - The JOINING_PHASE that failed.
   * @param {Object} cleanupContext - Tracking info for cleanup.
   * @param {string} cleanupContext.registeredNodeId - Node ID if
   *   registered before failure.
   * @param {string[]} cleanupContext.createdServiceIds - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroupIds - Message
   *   group IDs created before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    const logger = this.delegates.getLogger();
    logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_START, {
      nodeId: this.nodeId,
      failedPhase,
      createdServiceIds: cleanupContext.createdServiceIds.length,
      createdMessageGroupIds:
        cleanupContext.createdMessageGroupIds.length,
    });

    const startIndex =
      JOINING_PHASE_TO_CLEANUP_INDEX[failedPhase];
    const effectiveStart = startIndex !== undefined ?
      startIndex :
      NUM.ZERO;

    const stepsToRun =
      JOINING_CLEANUP_STEPS_REVERSE.slice(effectiveStart);

    const stepResults = {};

    for (const step of stepsToRun) {
      stepResults[step] =
        await this._executeJoinCleanupStep(step, cleanupContext);
    }

    // Transition lifecycle state machine to STOPPED
    const lifecycleStateMachine =
      this.delegates.getLifecycleStateMachine();
    const currentState = lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      try {
        lifecycleStateMachine.transition(NodeState.STOPPED);
      } catch (err) {
        logger.warn(
          JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_COMPLETE, {
            nodeId: this.nodeId,
            transitionError: err.message,
          });
      }
    }

    logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_SUMMARY, {
      nodeId: this.nodeId,
      failedPhase,
      stepResults,
    });
  }

  /**
   * Execute a single join cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _executeJoinCleanupStep(step, cleanupContext) {
    switch (step) {
    case JOINING_CLEANUP_STEP.QUERYING_STATE:
      return this._cleanupQueryingState(cleanupContext);
    case JOINING_CLEANUP_STEP.WAITING_LEADERSHIP:
      return this._cleanupWaitingLeadership();
    case JOINING_CLEANUP_STEP.MESSAGE_GROUP:
      return this._cleanupMessageGroup(cleanupContext);
    case JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET:
      return this._cleanupConnectingWebSocket();
    default:
      return CLEANUP_RESULT.SKIPPED;
    }
  }

  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    const logger = this.delegates.getLogger();
    try {
      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE, {
          nodeId: this.nodeId,
          registeredNodeId: cleanupContext.registeredNodeId,
          serviceCount: cleanupContext.createdServiceIds.length,
        });

      // Withdraw the node through the canonical control-plane owner path
      // instead of deleting rows directly from a half-joined node.
      if (
        cleanupContext.registeredNodeId &&
        typeof this.delegates.sendControlPlaneNodeStateUpdate ===
          TYPEOF.FUNCTION
      ) {
        try {
          await this.delegates.sendControlPlaneNodeStateUpdate({
            state: STATE.DISCONNECTED,
            heartbeatAt: this.delegates.getNow()(),
          });
        } catch (nodeErr) {
          logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR,
            {
              nodeId: this.nodeId,
              detail: 'node withdrawal',
              error: nodeErr.message,
            });
        }
      }

      logger.info(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_QUERYING_STATE_DONE, {
          nodeId: this.nodeId,
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    const logger = this.delegates.getLogger();
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    try {
      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP, {
          nodeId: this.nodeId,
          messageGroupCount: messageGroupServices.size,
        });

      for (const [replicaId, messageGroup] of
        messageGroupServices) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (mgErr) {
          logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, {
              nodeId: this.nodeId,
              replicaId,
              error: mgErr.message,
            });
        }
      }

      logger.info(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_DONE, {
          nodeId: this.nodeId,
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    const logger = this.delegates.getLogger();
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const messageRouter = this.delegates.getMessageRouter();
    try {
      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP, {
          nodeId: this.nodeId,
          messageGroupCount: messageGroupServices.size,
          serviceCount: cleanupContext.createdServiceIds.length,
        });

      // Stop message group replicas
      for (const [replicaId, messageGroup] of
        messageGroupServices) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (mgErr) {
          logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, {
              nodeId: this.nodeId,
              replicaId,
              error: mgErr.message,
            });
        }
      }

      // Unregister from message router
      if (messageRouter) {
        for (const [replicaId] of messageGroupServices) {
          const address =
            `${this.nodeId}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.MESSAGE_GROUP}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          messageRouter.unregister(address);
        }
      }

      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_DONE, {
          nodeId: this.nodeId,
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    const logger = this.delegates.getLogger();
    const messageRouter = this.delegates.getMessageRouter();
    const transport = this.delegates.getTransport();
    try {
      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET, {
          nodeId: this.nodeId,
          hasRouter: !!messageRouter,
        });

      this.delegates.stopJoiningLifecycleOwners();

      if (messageRouter && messageRouter.shutdown) {
        await messageRouter.shutdown();
      }

      if (
        transport &&
        transport.shutdown &&
        transport !== messageRouter
      ) {
        await transport.shutdown();
      }

      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_DONE, {
          nodeId: this.nodeId,
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   */
  async cleanup() {
    const logger = this.delegates.getLogger();
    const messageGroupServices =
      this.delegates.getMessageGroupServices();
    const partitionServices =
      this.delegates.getPartitionServices();

    logger.info(JOINING_LOG_MSG.CLEANUP_START, {
      nodeId: this.nodeId,
      messageGroupServices: messageGroupServices.size,
      partitionServices: partitionServices.size,
    });
    this.delegates.stopJoiningLifecycleOwners();

    const rebalanceCoordinator =
      this.delegates.getRebalanceCoordinator();
    if (rebalanceCoordinator) {
      try {
        await rebalanceCoordinator.shutdown();
      } catch (error) {
        logger.warn(JOINING_LOG_MSG.CLEANUP_STEP_FAILED, {
          nodeId: this.nodeId,
          step: 'rebalanceCoordinator.shutdown',
          error: error.message,
        });
      }
      this.delegates.setRebalanceCoordinator(null);
    }

    const latencyTopology = this.delegates.getLatencyTopology();
    await LatencyTopologySetup.stop(latencyTopology);
    this.delegates.setLatencyTopology(null);

    // Shutdown replica state machine
    const replicaStateMachine =
      this.delegates.getReplicaStateMachine();
    if (replicaStateMachine) {
      replicaStateMachine.stopTimeoutChecker();
      replicaStateMachine.clear();
      this.delegates.setReplicaStateMachine(null);
    }

    // Shutdown RPC client to cancel pending requests
    const rpcClient = this.delegates.getRpcClient();
    if (rpcClient) {
      await rpcClient.shutdown();
      this.delegates.setRpcClient(null);
    }

    // Shutdown control plane services
    const heartbeatService = this.delegates.getHeartbeatService();
    if (heartbeatService) {
      heartbeatService.stop();
      this.delegates.setHeartbeatService(null);
    }
    const leaseService = this.delegates.getLeaseService();
    if (leaseService) {
      leaseService.stop();
      this.delegates.setLeaseService(null);
    }
    const endpointService = this.delegates.getEndpointService();
    if (endpointService) {
      endpointService.stop();
      this.delegates.setEndpointService(null);
    }
    const dispatchService = this.delegates.getDispatchService();
    if (dispatchService) {
      dispatchService.stop();
      this.delegates.setDispatchService(null);
    }

    // Shutdown replica handler
    const replicaHandler = this.delegates.getReplicaHandler();
    const messageRouter = this.delegates.getMessageRouter();
    if (replicaHandler) {
      replicaHandler.unregisterFromRouter(messageRouter);
      await replicaHandler.shutdown();
      this.delegates.setReplicaHandler(null);
    }

    // Shutdown partition services
    for (const [replicaId, partition] of partitionServices) {
      try {
        if (partition.shutdown) {
          await partition.shutdown();
        }
        logger.debug(JOINING_LOG_MSG.PARTITION_CLEANED,
          {replicaId});
      } catch (err) {
        logger.warn(JOINING_LOG_MSG.PARTITION_CLEAN_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving services
        // running.
      }
    }
    partitionServices.clear();

    // Shutdown message group services
    for (const [replicaId, messageGroup] of
      messageGroupServices) {
      try {
        if (messageGroup.shutdown) {
          await messageGroup.shutdown();
        }
        logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_CLEANED,
          {replicaId});
      } catch (err) {
        logger.warn(JOINING_LOG_MSG.MESSAGE_GROUP_CLEAN_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving services
        // running.
      }
    }
    messageGroupServices.clear();

    // Clear transport
    const transport = this.delegates.getTransport();
    if (
      transport && transport.shutdown &&
      transport !== messageRouter
    ) {
      await transport.shutdown();
    }
    this.delegates.setTransport(null);

    // Clear messageRouter
    if (messageRouter) {
      if (messageRouter.shutdown) {
        await messageRouter.shutdown();
      }
      this.delegates.setMessageRouter(null);
    }

    this.delegates.setCdcIntegrationService(null);

    logger.info(JOINING_LOG_MSG.CLEANUP_COMPLETE,
      {nodeId: this.nodeId});
  }
}

export {JoinCleanupHandler};
