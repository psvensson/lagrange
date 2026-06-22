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
  buildFailedJoinMembershipPublicationContext,
  resolveJoinCleanupRegisteredNodeId,
} from './join-cleanup-publication-context.js';
import {
  JOIN_CLEANUP_LIFECYCLE_TRANSITION_ERROR,
  JOINING_CLEANUP_STEP,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';
import {
  ADDRESS,
  ENTITY_TYPE,
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';

const LOCAL_STR_NODE_WITHDRAWAL = 'node withdrawal';
const LOCAL_STR_WITHDRAWAL_NODE_ID_REQUIRED =
  'failed join admission withdrawal requires registered node id';
const LOCAL_STR_WITHDRAWAL_OWNER_REQUIRED =
  'failed join admission withdrawal owner is unavailable';
const LOCAL_STR_WITHDRAWAL_NOT_APPLIED =
  'failed join admission withdrawal was not applied';
const LOCAL_STR_1CO3M = 'rebalanceCoordinator.shutdown';
const LOCAL_STR_FUNCTION = 'function';

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

const JOIN_CLEANUP_DEFAULT_LIFECYCLE_STOP_PATH = Object.freeze([
  NodeState.STOPPED,
]);
const JOIN_CLEANUP_LIFECYCLE_STOP_PATH_BY_STATE = Object.freeze({
  [NodeState.READY]: Object.freeze([
    NodeState.DRAINING,
    NodeState.STOPPED,
  ]),
  [NodeState.DRAINING]: Object.freeze([
    NodeState.STOPPED,
  ]),
  [NodeState.STOPPED]: Object.freeze([]),
});

function resolveJoinFailureRetryable(error) {
  return error?.retryable === true || isRetryableControlPlaneError(error);
}

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
   *
   * When `options.preserveForResume` is true the caller has already decided
   * to re-enter the checkpointed join (retryable failure within the resume
   * budget): the destructive cleanup is SKIPPED so the durable join progress
   * survives — registered membership rows stay in place, the router keeps
   * accepting connections, and `hasJoinInfrastructureReady()` lets the
   * resume skip straight to the failed segment. Only the lifecycle machine
   * is driven to STOPPED, which the resume loop's reset path expects.
   * Destructive cleanup (entry withdrawal, message-group teardown, router
   * stop, service cleanup) and the FAILED event remain reserved for
   * terminal failures. Closure record CL-006.
   * @param {Error} error - The error that caused the failure.
   * @param {Object} [options]
   * @param {boolean} [options.preserveForResume]
   * @return {Promise<Object>} Joining failure result.
   */
  async handleJoiningFailure(error, options = {}) {
    const preserveForResume = options.preserveForResume === true;
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
      preserveForResume,
      error: error.message,
      stack: error.stack,
    });

    if (preserveForResume) {
      this.transitionJoinCleanupLifecycleToStopped(
        this.delegates.getLifecycleStateMachine(),
        logger,
      );
      return {
        success: false,
        nodeId: this.nodeId,
        duration,
        error: error.message,
        phase: failedPhase,
        retryable: resolveJoinFailureRetryable(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.max(NUM.ZERO, Math.floor(error.retryAfterMs)) :
          NUM.ZERO,
      };
    }

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
      retryable: resolveJoinFailureRetryable(error),
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

    const lifecycleStateMachine =
      this.delegates.getLifecycleStateMachine();
    this.transitionJoinCleanupLifecycleToStopped(
      lifecycleStateMachine,
      logger,
    );

    logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_SUMMARY, {
      nodeId: this.nodeId,
      failedPhase,
      stepResults,
    });
  }

  resolveJoinCleanupLifecycleStopPath(currentState) {
    return JOIN_CLEANUP_LIFECYCLE_STOP_PATH_BY_STATE[currentState] ||
      JOIN_CLEANUP_DEFAULT_LIFECYCLE_STOP_PATH;
  }

  transitionJoinCleanupLifecycleToStopped(lifecycleStateMachine, logger) {
    const stopPath = this.resolveJoinCleanupLifecycleStopPath(
      lifecycleStateMachine.getState(),
    );
    for (const targetState of stopPath) {
      if (lifecycleStateMachine.getState() === targetState) {
        continue;
      }
      const transitioned = lifecycleStateMachine.transition(targetState);
      if (transitioned === true) {
        continue;
      }
      logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_COMPLETE,
        {
          nodeId: this.nodeId,
          transitionError:
            JOIN_CLEANUP_LIFECYCLE_TRANSITION_ERROR.TARGET_FAILED_PREFIX +
              targetState,
        },
      );
      return;
    }
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
      const registeredNodeId = resolveJoinCleanupRegisteredNodeId(
        cleanupContext,
        this.nodeId,
      );
      logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE, {
          nodeId: this.nodeId,
          registeredNodeId,
          serviceCount: cleanupContext.createdServiceIds.length,
        });

      await this.withdrawFailedJoinAdmission(registeredNodeId, logger);

      this.enqueueMembershipPublicationReconcile({
        ...cleanupContext,
        registeredNodeId,
      });

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

  async withdrawFailedJoinAdmission(registeredNodeId, logger) {
    if (
      typeof registeredNodeId !== TYPEOF.STRING ||
      registeredNodeId.length === NUM.ZERO
    ) {
      throw new Error(LOCAL_STR_WITHDRAWAL_NODE_ID_REQUIRED);
    }
    if (typeof this.delegates.withdrawFailedJoinAdmission !== TYPEOF.FUNCTION) {
      throw new Error(LOCAL_STR_WITHDRAWAL_OWNER_REQUIRED);
    }
    try {
      const result =
        await this.delegates.withdrawFailedJoinAdmission({registeredNodeId});
      if (result?.accepted !== true && result?.success !== true) {
        throw new Error(LOCAL_STR_WITHDRAWAL_NOT_APPLIED);
      }
      return result;
    } catch (withdrawalErr) {
      logger.warn(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR,
        {
          nodeId: this.nodeId,
          detail: LOCAL_STR_NODE_WITHDRAWAL,
          error: withdrawalErr.message,
        });
      throw withdrawalErr;
    }
  }

  resolveMembershipPublicationService() {
    if (typeof this.delegates.getRebalanceCoordinator !== TYPEOF.FUNCTION) {
      return null;
    }
    const rebalanceCoordinator =
      this.delegates.getRebalanceCoordinator();
    const readinessService =
      rebalanceCoordinator?.controlPlaneReadinessService;
    const membershipPublicationService =
      readinessService?.membershipPublicationService;
    return membershipPublicationService &&
      typeof membershipPublicationService.enqueueClusterMembershipReconcile ===
        TYPEOF.FUNCTION ?
      membershipPublicationService :
      null;
  }

  enqueueMembershipPublicationReconcile(cleanupContext) {
    if (typeof cleanupContext?.registeredNodeId !== TYPEOF.STRING ||
        cleanupContext.registeredNodeId.length === NUM.ZERO) {
      return false;
    }
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (!membershipPublicationService) {
      return false;
    }
    membershipPublicationService.enqueueClusterMembershipReconcile(
      RECONCILE_REASON.NODE_FAILED,
      buildFailedJoinMembershipPublicationContext({
        membershipPublicationService,
        nodeId: this.nodeId,
        registeredNodeId: cleanupContext.registeredNodeId,
      }),
    );
    return true;
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
    // Stop the always-on owner-driven membership reconcile interval before the
    // rebalance coordinator (which owns the shared readiness service that holds
    // the coordinator) is nulled below. Otherwise its 5s tick keeps arming a
    // ref'd 15s reconcile-timeout timer that hangs the event loop after teardown.
    const membershipPublicationService =
      this.delegates.getRebalanceCoordinator()?.controlPlaneReadinessService
        ?.membershipPublicationService || null;
    if (membershipPublicationService &&
      typeof membershipPublicationService.stopOwnerMembershipDriver ===
        LOCAL_STR_FUNCTION) {
      membershipPublicationService.stopOwnerMembershipDriver();
    }
    await this.shutdownRebalanceCoordinator(logger);
    const latencyTopology = this.delegates.getLatencyTopology();
    await LatencyTopologySetup.stop(latencyTopology);
    this.delegates.setLatencyTopology(null);

    const replicaHandler = this.delegates.getReplicaHandler();
    const messageRouter = this.delegates.getMessageRouter();
    if (replicaHandler) {
      replicaHandler.unregisterFromRouter(messageRouter);
      await replicaHandler.shutdown();
      this.delegates.setReplicaHandler(null);
    }

    this.clearReplicaStateMachine();
    await this.shutdownRpcClient();
    await this.shutdownCdcSqlQueryEngine();
    this.stopControlPlaneServices();

    await this.shutdownServiceMap({
      logger,
      services: partitionServices,
      successLogMessage: JOINING_LOG_MSG.PARTITION_CLEANED,
      failureLogMessage: JOINING_LOG_MSG.PARTITION_CLEAN_FAILED,
    });
    partitionServices.clear();

    await this.shutdownServiceMap({
      logger,
      services: messageGroupServices,
      successLogMessage: JOINING_LOG_MSG.MESSAGE_GROUP_CLEANED,
      failureLogMessage: JOINING_LOG_MSG.MESSAGE_GROUP_CLEAN_FAILED,
    });
    messageGroupServices.clear();

    const transport = this.delegates.getTransport();
    await this.shutdownTransportAndRouter(transport, messageRouter);
    this.delegates.setCdcIntegrationService(null);

    logger.info(JOINING_LOG_MSG.CLEANUP_COMPLETE,
      {nodeId: this.nodeId});
  }

  async shutdownRebalanceCoordinator(logger) {
    const rebalanceCoordinator = this.delegates.getRebalanceCoordinator();
    if (!rebalanceCoordinator) {
      return;
    }
    try {
      await rebalanceCoordinator.shutdown();
    } catch (error) {
      logger.warn(JOINING_LOG_MSG.CLEANUP_STEP_FAILED, {
        nodeId: this.nodeId,
        step: LOCAL_STR_1CO3M,
        error: error.message,
      });
    }
    this.delegates.setRebalanceCoordinator(null);
  }

  clearReplicaStateMachine() {
    const replicaStateMachine = this.delegates.getReplicaStateMachine();
    if (!replicaStateMachine) {
      return;
    }
    replicaStateMachine.stopTimeoutChecker();
    replicaStateMachine.clear();
    this.delegates.setReplicaStateMachine(null);
  }

  async shutdownRpcClient() {
    const rpcClient = this.delegates.getRpcClient();
    if (!rpcClient) {
      return;
    }
    await rpcClient.shutdown();
    this.delegates.setRpcClient(null);
  }

  async shutdownCdcSqlQueryEngine() {
    const cdcIntegrationService = this.delegates.getCdcIntegrationService();
    // Mark the CDC service shutting down before the engine is nulled so its
    // routed-mutation retry-budget loop stops re-arming instead of retrying the
    // (now engine-less) write forever and holding the event loop open.
    if (typeof cdcIntegrationService?.markShuttingDown === LOCAL_STR_FUNCTION) {
      cdcIntegrationService.markShuttingDown();
    }
    // Resolve via the robust getSqlQueryEngine delegate first: on the joining
    // node cdcIntegrationService.sqlQueryEngine is often null, so the narrow
    // lookup skipped shutdown and left the engine's query retry loops (and other
    // background loops) re-arming forever after teardown.
    const sqlQueryEngine =
      (typeof this.delegates.getSqlQueryEngine === LOCAL_STR_FUNCTION ?
        this.delegates.getSqlQueryEngine() : null) ||
      cdcIntegrationService?.sqlQueryEngine ||
      null;
    if (sqlQueryEngine && typeof sqlQueryEngine.shutdown === LOCAL_STR_FUNCTION) {
      await sqlQueryEngine.shutdown();
    }
    if (cdcIntegrationService?.sqlQueryEngine === sqlQueryEngine) {
      cdcIntegrationService.sqlQueryEngine = null;
    }
  }

  stopControlPlaneServices() {
    this.stopControlPlaneService(
      this.delegates.getHeartbeatService(),
      this.delegates.setHeartbeatService,
    );
    this.stopControlPlaneService(
      this.delegates.getLeaseService(),
      this.delegates.setLeaseService,
    );
    this.stopControlPlaneService(
      this.delegates.getEndpointService(),
      this.delegates.setEndpointService,
    );
    this.stopControlPlaneService(
      this.delegates.getDispatchService(),
      this.delegates.setDispatchService,
    );
  }

  stopControlPlaneService(service, setter) {
    if (!service) {
      return;
    }
    service.stop();
    if (typeof setter === TYPEOF.FUNCTION) {
      setter.call(this.delegates, null);
    }
  }

  async shutdownServiceMap(options) {
    for (const [replicaId, service] of options.services) {
      try {
        if (service.shutdown) {
          await service.shutdown();
        }
        options.logger.debug(options.successLogMessage, {replicaId});
      } catch (error) {
        options.logger.warn(options.failureLogMessage, {
          replicaId,
          error: error.message,
        });
      }
    }
  }

  async shutdownTransportAndRouter(transport, messageRouter) {
    if (
      transport &&
      transport.shutdown &&
      transport !== messageRouter
    ) {
      await transport.shutdown();
    }
    this.delegates.setTransport(null);
    if (messageRouter?.shutdown) {
      await messageRouter.shutdown();
    }
    this.delegates.setMessageRouter(null);
  }
}

export {JoinCleanupHandler};
