/**
 * Seed Cleanup Handler — handles bootstrap failure cleanup and
 * graceful shutdown for the seed bootstrap service.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {LatencyTopologySetup} from '../shared/latency-topology-setup.js';
import {
  BOOTSTRAP_CLEANUP_STEP,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
  CLEANUP_RESULT,
} from '../bootstrap-constants.js';
import {
  NodeState,
} from '../../node/node-lifecycle-state-machine.js';
import {
  ADDRESS,
  ENTITY_TYPE,
} from '../../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * All cleanup steps in reverse phase order.
 */
const CLEANUP_STEPS_REVERSE_ORDER = Object.freeze([
  BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
  BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
  BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
  BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
  BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
]);

/**
 * Maps each bootstrap phase to its index in the cleanup order.
 */
const PHASE_TO_CLEANUP_INDEX = Object.freeze({
  [BOOTSTRAP_PHASE.CACHE_HYDRATION]: 0,
  [BOOTSTRAP_PHASE.REGISTRATION]: 1,
  [BOOTSTRAP_PHASE.PARTITIONS]: 2,
  [BOOTSTRAP_PHASE.MESSAGE_GROUPS]: 3,
  [BOOTSTRAP_PHASE.INFRASTRUCTURE]: 4,
});

/**
 * Handles bootstrap failure cleanup and graceful shutdown.
 */
class SeedCleanupHandler {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  /**
   * Handle bootstrap failure.
   * @param {Error} error
   * @return {Object}
   */
  async handleBootstrapFailure(error) {
    const d = this.delegates;
    const logger = d.getLogger();
    const failedPhase = d.getPhase();
    d.setPhase(BOOTSTRAP_PHASE.FAILED);
    d.setLastError(error);
    const duration = Date.now() - d.getStartTime();

    logger.error(BOOTSTRAP_LOG_MSG.BOOTSTRAP_FAILED, {
      nodeId: d.getNodeId(),
      phase: failedPhase,
      duration,
      error: error.message,
      stack: error.stack,
      servicesCreated: d.getServicesCreated(),
    });

    const cleanupContext = {
      failedPhase,
      createdPartitions:
        [...d.getPartitionServices().keys()],
      createdServices: [
        ...d.getMessageGroupServices().keys(),
        ...d.getPartitionServices().keys(),
      ],
      createdMessageGroups:
        d.getMessageGroupsCreated() > 0 ?
          [d.getInitialMessageGroupId()] : [],
      registeredNodeId: d.getNodeId(),
    };

    await this.cleanupFailedBootstrap(
      failedPhase, cleanupContext,
    );

    d.emit(BOOTSTRAP_EVENT.FAILED, {
      nodeId: d.getNodeId(),
      phase: failedPhase,
      duration,
      error: error.message,
      servicesCreated: d.getServicesCreated(),
    });

    return {
      success: false,
      nodeId: d.getNodeId(),
      duration,
      error: error.message,
      phase: failedPhase,
      servicesCreated: d.getServicesCreated(),
    };
  }

  /**
   * Clean up a failed bootstrap in reverse phase order.
   * @param {string} failedPhase
   * @param {Object} cleanupContext
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    const d = this.delegates;
    const logger = d.getLogger();

    logger.info(
      BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_START, {
        nodeId: d.getNodeId(),
        failedPhase,
        createdPartitions:
          cleanupContext.createdPartitions.length,
        createdServices:
          cleanupContext.createdServices.length,
        createdMessageGroups:
          cleanupContext.createdMessageGroups.length,
      });

    const startIndex = PHASE_TO_CLEANUP_INDEX[failedPhase];
    const effectiveStart = startIndex !== undefined ?
      startIndex : 0;

    const stepsToRun =
      CLEANUP_STEPS_REVERSE_ORDER.slice(effectiveStart);

    const stepResults = {};

    for (const step of stepsToRun) {
      stepResults[step] = await this._executeCleanupStep(
        step, cleanupContext,
      );
    }

    const lifecycleStateMachine =
      d.getLifecycleStateMachine();
    const currentState = lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      try {
        lifecycleStateMachine.transition(NodeState.STOPPED);
      } catch (err) {
        logger.warn(
          BOOTSTRAP_LOG_MSG
            .FAILED_BOOTSTRAP_CLEANUP_COMPLETE, {
            nodeId: d.getNodeId(),
            transitionError: err.message,
          });
      }
    }

    logger.info(
      BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_SUMMARY, {
        nodeId: d.getNodeId(),
        failedPhase,
        stepResults,
      });
  }

  /**
   * Execute a single cleanup step.
   * @param {string} step
   * @param {Object} cleanupContext
   * @return {Promise<string>}
   */
  async _executeCleanupStep(step, cleanupContext) {
    switch (step) {
    case BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION:
      return this._cleanupCacheHydration();
    case BOOTSTRAP_CLEANUP_STEP.REGISTRATION:
      return this._cleanupRegistration(cleanupContext);
    case BOOTSTRAP_CLEANUP_STEP.PARTITIONS:
      return this._cleanupPartitions();
    case BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS:
      return this._cleanupMessageGroups();
    case BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE:
      return this._cleanupInfrastructure();
    default:
      return CLEANUP_RESULT.SKIPPED;
    }
  }

  /**
   * Cleanup step: clear the system table cache.
   * @return {Promise<string>}
   */
  async _cleanupCacheHydration() {
    const d = this.delegates;
    const logger = d.getLogger();
    try {
      logger.info(
        BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_CACHE, {
          nodeId: d.getNodeId(),
        });
      const cache = d.getSystemTableCacheRef() ||
        d.getSystemTableCacheSafe();
      if (cache && cache.clear) {
        cache.clear();
      }
      d.setSystemTableCacheRef(null);
      logger.info(
        BOOTSTRAP_LOG_MSG.FAILED_BOOTSTRAP_CLEANUP_CACHE_DONE, {
          nodeId: d.getNodeId(),
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_CACHE_ERROR, {
          nodeId: d.getNodeId(),
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: remove partial registration entries.
   * @param {Object} cleanupContext
   * @return {Promise<string>}
   */
  async _cleanupRegistration(cleanupContext) {
    const d = this.delegates;
    const logger = d.getLogger();
    try {
      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_REGISTRATION, {
          nodeId: d.getNodeId(),
          registeredNodeId: cleanupContext.registeredNodeId,
          serviceCount:
            cleanupContext.createdServices.length,
          partitionCount:
            cleanupContext.createdPartitions.length,
          messageGroupCount:
            cleanupContext.createdMessageGroups.length,
        });

      await this.quiesceRebalancers();
      d.stopUnifiedLifecycleOwners();

      const systemTableWriter = d.getSystemTableWriter();
      if (systemTableWriter && systemTableWriter.disable) {
        systemTableWriter.disable();
      }
      d.setSystemTableWriter(null);
      await LatencyTopologySetup.stop(d.getLatencyTopology());
      d.setLatencyTopology(null);

      d.clearCdcIntegrationService();
      await d.clearRuntimeServiceHandler();
      d.stopAndClearControlPlaneServices();
      await d.clearRpcClient();
      d.clearReplicaStateMachine();
      d.clearEpochManager();
      await d.clearReplicaHandler();
      d.clearTablePolicyService();
      d.clearRebalanceCoordinator();
      d.clearNodeReadyRebalanceState();

      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_DONE, {
          nodeId: d.getNodeId(),
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, {
          nodeId: d.getNodeId(),
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop and destroy partition services.
   * @return {Promise<string>}
   */
  async _cleanupPartitions() {
    const d = this.delegates;
    const logger = d.getLogger();
    try {
      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_PARTITIONS, {
          nodeId: d.getNodeId(),
          partitionCount: d.getPartitionServices().size,
        });

      for (const [replicaId, partition] of
        d.getPartitionServices()) {
        try {
          if (partition.shutdown) {
            await partition.shutdown();
          }
        } catch (err) {
          logger.warn(
            BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED, {
              replicaId,
              error: err.message,
            });
        }
      }

      const messageRouter = d.getMessageRouter();
      if (messageRouter) {
        for (const [replicaId, partition] of
          d.getPartitionServices()) {
          const address = partition?.getUnifiedAddress ?
            partition.getUnifiedAddress() :
            `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.PARTITION}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          messageRouter.unregister(address);
        }
      }
      d.getPartitionServices().clear();
      d.resetPartitionReplicas();

      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_DONE, {
          nodeId: d.getNodeId(),
        });
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_ERROR, {
          nodeId: d.getNodeId(),
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop and destroy message group services.
   * @return {Promise<string>}
   */
  async _cleanupMessageGroups() {
    const d = this.delegates;
    const logger = d.getLogger();
    try {
      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS, {
          nodeId: d.getNodeId(),
          messageGroupCount:
            d.getMessageGroupServices().size,
        });

      for (const [replicaId, messageGroup] of
        d.getMessageGroupServices()) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (err) {
          logger.warn(
            BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED, {
              replicaId,
              error: err.message,
            });
        }
      }

      const messageRouter = d.getMessageRouter();
      if (messageRouter) {
        for (const [replicaId] of
          d.getMessageGroupServices()) {
          const address =
            `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.MESSAGE_GROUP}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          messageRouter.unregister(address);
        }
      }
      d.getMessageGroupServices().clear();
      d.resetMessageGroupReplicas();

      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_DONE,
        {nodeId: d.getNodeId()},
      );
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_ERROR,
        {
          nodeId: d.getNodeId(),
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop the message router and transport.
   * @return {Promise<string>}
   */
  async _cleanupInfrastructure() {
    const d = this.delegates;
    const logger = d.getLogger();
    try {
      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE, {
          nodeId: d.getNodeId(),
        });

      d.stopUnifiedLifecycleOwners();

      const messageRouter = d.getMessageRouter();
      if (messageRouter && messageRouter.shutdown) {
        await messageRouter.shutdown();
        d.setMessageRouter(null);
      }

      const transport = d.getTransport();
      if (transport && transport.shutdown &&
          transport !== messageRouter) {
        await transport.shutdown();
      }
      d.setTransport(null);

      logger.info(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_DONE,
        {nodeId: d.getNodeId()},
      );
      return CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      logger.warn(
        BOOTSTRAP_LOG_MSG
          .FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_ERROR,
        {
          nodeId: d.getNodeId(),
          error: err.message,
          stack: err.stack,
        });
      return CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Stop all rebalancer and coordinator activity.
   * @return {Promise<void>}
   */
  async quiesceRebalancers() {
    const d = this.delegates;
    const logger = d.getLogger();

    const partitionTasks =
      [...d.getPartitionServices().entries()].map(
        async ([replicaId, partition]) => {
          if (!partition ||
              typeof partition.quiesceRebalancing !==
                'function') {
            return;
          }
          try {
            await partition.quiesceRebalancing();
          } catch (error) {
            logger.warn(
              BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED, {
                replicaId,
                error: error.message,
              });
          }
        },
      );

    const messageGroupTasks =
      [...d.getMessageGroupServices().entries()]
        .map(async ([replicaId, messageGroup]) => {
          if (!messageGroup ||
              typeof messageGroup.quiesceRebalancing !==
                'function') {
            return;
          }
          try {
            await messageGroup.quiesceRebalancing();
          } catch (error) {
            logger.warn(
              BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED, {
                replicaId,
                error: error.message,
              });
          }
        });

    await Promise.all(
      [...partitionTasks, ...messageGroupTasks],
    );

    const rebalanceCoordinator = d.getRebalanceCoordinator();
    if (rebalanceCoordinator) {
      try {
        await rebalanceCoordinator.shutdown();
      } catch (error) {
        logger.warn(
          BOOTSTRAP_LOG_MSG
            .FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, {
            nodeId: d.getNodeId(),
            error: error.message,
          });
      }
      d.clearRebalanceCoordinator();
    }
  }

  /**
   * Clean up partially initialized services (graceful shutdown).
   * @return {Promise<void>}
   */
  async cleanup() {
    const d = this.delegates;
    const logger = d.getLogger();

    d.setIsShuttingDown(true);
    logger.info(BOOTSTRAP_LOG_MSG.CLEANUP_START, {
      nodeId: d.getNodeId(),
      messageGroupServices:
        d.getMessageGroupServices().size,
      partitionServices: d.getPartitionServices().size,
    });

    d.clearNodeReadyRebalanceState();
    d.stopUnifiedLifecycleOwners();
    await this.quiesceRebalancers();
    await LatencyTopologySetup.stop(d.getLatencyTopology());
    d.setLatencyTopology(null);
    await this.shutdownSharedRuntimeDependencies(d);
    d.clearReplicaStateMachine();
    this.disableSystemTableWriter(d);
    d.clearEpochManager();
    await d.clearReplicaHandler();

    await this.shutdownServiceMap({
      logger,
      services: d.getPartitionServices(),
      successLogMessage: BOOTSTRAP_LOG_MSG.PARTITION_CLEANED,
      failureLogMessage: BOOTSTRAP_LOG_MSG.PARTITION_CLEANUP_FAILED,
    });
    const messageRouter = d.getMessageRouter();
    if (messageRouter) {
      for (const [replicaId, partition] of
        d.getPartitionServices()) {
        const address = partition?.getUnifiedAddress ?
          partition.getUnifiedAddress() :
          `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
          `${replicaId}`;
        messageRouter.unregister(address);
      }
    }
    d.getPartitionServices().clear();
    d.resetPartitionReplicas();

    await this.shutdownServiceMap({
      logger,
      services: d.getMessageGroupServices(),
      successLogMessage: BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANED,
      failureLogMessage: BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_CLEANUP_FAILED,
    });
    if (messageRouter) {
      for (const [replicaId] of
        d.getMessageGroupServices()) {
        const address =
          `${d.getNodeId()}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}` +
          `${replicaId}`;
        messageRouter.unregister(address);
      }
    }
    d.getMessageGroupServices().clear();
    d.resetMessageGroupReplicas();

    const transport = d.getTransport();
    await this.shutdownTransportAndRouter(d, transport, messageRouter);
    logger.info(BOOTSTRAP_LOG_MSG.CLEANUP_COMPLETE, {
      nodeId: d.getNodeId(),
    });
  }

  async shutdownSharedRuntimeDependencies(d) {
    await d.clearRuntimeServiceHandler();
    d.stopAndClearControlPlaneServices();
    await d.clearRpcClient();
    await this.shutdownSqlQueryEngine(d);
  }

  async shutdownSqlQueryEngine(d) {
    const cdcIntegrationService = d.getCdcIntegrationService?.() || null;
    // Mark the CDC service shutting down before nulling the engine so its
    // routed-mutation retry-budget loop stops re-arming instead of retrying the
    // engine-less write forever and holding the event loop open after teardown.
    if (typeof cdcIntegrationService?.markShuttingDown === LOCAL_STR_FUNCTION) {
      cdcIntegrationService.markShuttingDown();
    }
    const sqlQueryEngine =
      d.getSqlQueryEngine?.() ||
      d.getCdcIntegrationService?.()?.sqlQueryEngine ||
      null;
    if (sqlQueryEngine && typeof sqlQueryEngine.shutdown === LOCAL_STR_FUNCTION) {
      await sqlQueryEngine.shutdown();
    }
    if (cdcIntegrationService?.sqlQueryEngine === sqlQueryEngine) {
      cdcIntegrationService.sqlQueryEngine = null;
    }
    d.setSqlQueryEngine?.(null);
  }

  disableSystemTableWriter(d) {
    const systemTableWriter = d.getSystemTableWriter();
    if (systemTableWriter?.disable) {
      systemTableWriter.disable();
    }
    d.setSystemTableWriter(null);
  }

  async shutdownServiceMap(options) {
    for (const [replicaId, service] of options.services) {
      try {
        if (service.shutdown) {
          await service.shutdown();
        }
        options.logger.debug(options.successLogMessage, {
          replicaId,
        });
      } catch (error) {
        options.logger.warn(options.failureLogMessage, {
          replicaId,
          error: error.message,
        });
      }
    }
  }

  async shutdownTransportAndRouter(d, transport, messageRouter) {
    if (transport && transport.shutdown &&
        transport !== messageRouter) {
      await transport.shutdown();
    }
    d.setTransport(null);
    if (messageRouter?.shutdown) {
      await messageRouter.shutdown();
    }
    d.setMessageRouter(null);
  }
}

export {SeedCleanupHandler};
