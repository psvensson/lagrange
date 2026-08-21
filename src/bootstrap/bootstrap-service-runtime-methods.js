import {
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
} from './bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
} from './system-table-schemas-constants.js';
import {
  activateMessageGroupServiceRows,
} from './shared/message-group-service-activation.js';
import {assertCritical} from '../utils/assert.js';
import {
  createBootstrapServiceControlPlaneRuntimeMethods,
} from './bootstrap-service-control-plane-runtime-methods.js';
import {
  createBootstrapServiceReplicaHandlerRuntimeMethods,
  createBootstrapServiceReplicaStateRuntimeMethods,
} from './bootstrap-service-replica-registration-methods.js';
import {
  COLUMN,
  TABLES,
} from '../constants/index.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const TYPEOF_FUNCTION = 'function';
const DEFERRED_LATENCY_TOPOLOGY_START_KIND_IMMEDIATE = 'immediate';
const BOOTSTRAP_RUNTIME_LOG_MSG = Object.freeze({
  DEFERRED_SEED_MESSAGE_GROUP_SERVICE_ACTIVATION:
    'Deferring seed message-group service row activation during startup',
});

function createBootstrapServiceRuntimeMethods() {
  return {
    hasPublishedLocalServiceEndpoints() {
      const systemTableCache = this.getSystemTableCache();
      const localEndpointRows = systemTableCache?.filter?.(
        TABLES.SERVICE_ENDPOINTS,
        (row) => row?.[COLUMN.NODE_ID] === this.nodeId,
      ) ||
        (systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || [])
          .filter((row) => row?.[COLUMN.NODE_ID] === this.nodeId);
      return localEndpointRows.length > 0;
    },

    async activateMessageGroupServiceRows() {
      return activateMessageGroupServiceRows({
        nodeId: this.nodeId,
        systemTableWriter: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
        deferTransientFailures: true,
        messageGroupServiceHandler: this.messageGroupServiceHandler,
        endpointsPublished: this.hasPublishedLocalServiceEndpoints(),
        messageGroupServices: this.messageGroupServices,
        onDeferredActivation: ({groupId, replicaId, error}) => {
          this.logger.warn(
            BOOTSTRAP_RUNTIME_LOG_MSG
              .DEFERRED_SEED_MESSAGE_GROUP_SERVICE_ACTIVATION,
            {
              nodeId: this.nodeId,
              groupId,
              replicaId,
              error: error?.message || String(error),
            },
          );
        },
      });
    },

    ...createBootstrapServiceReplicaHandlerRuntimeMethods(),
    ...createBootstrapServiceControlPlaneRuntimeMethods(),
    ...createBootstrapServiceReplicaStateRuntimeMethods(),

    /**
     * Get the system table cache (source of truth for cluster metadata).
     * Some unit tests inject it via a message group service stub.
     * @return {Object|null}
     * @private
     */
    getSystemTableCache() {
      return assertCritical(
        this.peekSystemTableCache(),
        bootstrapError.SYSTEM_CACHE_MISSING,
      );
    },

    /**
     * Read the current runtime cache reference without forcing a hard failure.
     * @return {Object|null}
     * @private
     */
    peekSystemTableCache() {
      if (this.systemTableCache) {
        return this.systemTableCache;
      }
      // Pick the first message group service that exposes a cache.
      for (const svc of this.messageGroupServices.values()) {
        if (svc?.systemTableCache) {
          return svc.systemTableCache;
        }
      }
      return null;
    },

    /**
     * Delegate leader-partition resolution to the canonical seed registration
     * owner while preserving the BootstrapService seam used by tests.
     * @param {string} tableName
     * @return {Object|null}
     */
    getLeaderPartition(tableName) {
      return this.seedRegistrationRuntimeOwner.getLeaderPartition(tableName);
    },

    resolveOperationalMessageGroupSelection(options = {}) {
      return this.messageGroupSelectionOwner
        .resolveOperationalMessageGroupSelection(options);
    },

    async resolveOperationalMessageGroupSelectionAsync(options = {}) {
      return this.messageGroupSelectionOwner
        .resolveOperationalMessageGroupSelectionAsync(options);
    },

    resolveQueryTransportMessageGroupSelection() {
      return this.messageGroupSelectionOwner
        .resolveQueryTransportMessageGroupSelection();
    },

    getLeaderMessageGroupService(options = {}) {
      return this.resolveOperationalMessageGroupSelection(options).service;
    },

    getBootstrapMessageGroupService() {
      return this.messageGroupSelectionOwner.getBootstrapMessageGroupService();
    },

    buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
      return this.messageGroupSelectionOwner
        .buildMessageGroupOwnerNotReadyError(selection, options);
    },

    /**
     * Handle bootstrap failure.
     * Clean up partially initialized services and exit.
     * @param {Error} error - The error that caused failure.
     * @return {Object} Failure result.
     * @private
     */
    async handleBootstrapFailure(error) {
      const failedPhase = this.phase;
      this.phase = BootstrapPhase.FAILED;
      this.lastError = error;
      const duration = Date.now() - this.startTime;

      this.logger.error(BootstrapLog.BOOTSTRAP_FAILED, {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message,
        stack: error.stack,
        servicesCreated: this.servicesCreated,
      });

      const cleanupContext = {
        failedPhase,
        createdPartitions: [...this.partitionServices.keys()],
        createdServices: [
          ...this.messageGroupServices.keys(),
          ...this.partitionServices.keys(),
        ],
        createdMessageGroups:
          this.messageGroupsCreated > 0 ?
            [INITIAL_MESSAGE_GROUP_ID] :
            [],
        registeredNodeId: this.nodeId,
      };

      await this.cleanupFailedBootstrap(
        failedPhase,
        cleanupContext,
      );

      this.emit(BootstrapEvent.FAILED, {
        nodeId: this.nodeId,
        phase: failedPhase,
        duration,
        error: error.message,
        servicesCreated: this.servicesCreated,
      });

      return {
        success: false,
        nodeId: this.nodeId,
        duration,
        error: error.message,
        phase: failedPhase,
        servicesCreated: this.servicesCreated,
      };
    },

    /**
     * Clean up a failed bootstrap by delegating to the canonical
     * cleanup owner (SeedCleanupHandler — D3.1).
     * @param {string} failedPhase - The phase that failed.
     * @param {Object} cleanupContext - Context about what was created.
     * @return {Promise<void>}
     */
    async cleanupFailedBootstrap(failedPhase, cleanupContext) {
      await this.seedCleanupHandler.cleanupFailedBootstrap(
        failedPhase,
        cleanupContext,
      );
    },

    /**
     * Execute a single cleanup step via the canonical cleanup
     * owner (SeedCleanupHandler — D3.1).
     * @param {string} step - The cleanup step to execute.
     * @param {Object} cleanupContext - Cleanup context.
     * @return {Promise<string>} 'success', 'error', or 'skipped'.
     * @private
     */
    async _executeCleanupStep(step, cleanupContext) {
      return this.seedCleanupHandler._executeCleanupStep(
        step,
        cleanupContext,
      );
    },

    /**
     * Safely get the system table cache without throwing.
     * Used during cleanup when the cache may not be available.
     * @return {Object|null} System table cache or null.
     * @private
     */
    _getSystemTableCacheSafe() {
      try {
        for (const svc of this.messageGroupServices.values()) {
          if (svc?.systemTableCache) {
            return svc.systemTableCache;
          }
        }
      } catch (_err) {
        // Ignore — cache may not be available during cleanup
      }
      return null;
    },

    /**
     * Start WebSocket server for cross-node communication.
     * Call this after bootstrap is complete to enable remote node connections.
     * Note: If wsPort was provided during bootstrap, the server is already started.
     * @return {Promise<void>}
     */
    async startWebSocketServer() {
      if (!this.messageRouter) {
        throw new Error(bootstrapError.ROUTER_NOT_READY);
      }

      const wsPort = this.wsPort || this.config.wsPort;
      if (!wsPort) {
        this.logger.warn(BootstrapLog.WS_PORT_MISSING);
        return;
      }

      // Update the port if not already set
      if (!this.messageRouter.wsPort) {
        this.messageRouter.wsPort = wsPort;
      }

      const serverAlreadyRunning = Boolean(this.messageRouter.server);
      await this.messageRouter.initialize({startServer: true});
      this.openExternalTransportAdmission();

      if (serverAlreadyRunning) {
        this.logger.debug(BootstrapLog.WS_ALREADY_RUNNING, {
          nodeId: this.nodeId,
          wsPort: wsPort,
        });
        return;
      }

      this.logger.info(BootstrapLog.WS_SERVER_STARTED, {
        nodeId: this.nodeId,
        wsPort: wsPort,
      });
    },

    /**
     * Open remote transport admission after seed-owned runtime handlers exist.
     * Self-routing remains available earlier during bootstrap initialization.
     * @return {void}
     */
    openExternalTransportAdmission() {
      if (typeof this.messageRouter?.setExternalAdmissionEnabled ===
        TYPEOF_FUNCTION) {
        this.messageRouter.setExternalAdmissionEnabled(true);
      }
    },

    /**
     * Get the MessageRouter for cross-node communication.
     * @return {MessageRouter|null} The message router or null if not initialized.
     */
    getMessageRouter() {
      return this.messageRouter;
    },

    /**
     * Get the current bootstrap phase.
     * @return {string} Current phase.
     */
    getPhase() {
      return this.phase;
    },

    /**
     * Get the node lifecycle state machine.
     * @return {NodeLifecycleStateMachine} The lifecycle state machine.
     */
    getLifecycleStateMachine() {
      return this.lifecycleStateMachine;
    },

    /**
     * Get bootstrap status.
     * @return {Object} Bootstrap status.
     */
    getStatus() {
      return {
        nodeId: this.nodeId,
        phase: this.phase,
        startTime: this.startTime,
        duration: this.startTime ? Date.now() - this.startTime : 0,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        lastError: this.lastError?.message || null,
      };
    },

    /**
     * Sleep for a specified duration.
     * @param {number} ms - Milliseconds to sleep.
     * @return {Promise<void>}
     * @private
     */
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    /**
     * Shutdown the bootstrap service and all managed services.
     * @return {Promise<void>}
     */
    async shutdown() {
      if (this.shutdownPromise) {
        return this.shutdownPromise;
      }

      this.shutdownPromise = (async () => {
        this.isShuttingDown = true;

        if (this.deferredLatencyTopologyStartHandle) {
          if (this.deferredLatencyTopologyStartKind ===
              DEFERRED_LATENCY_TOPOLOGY_START_KIND_IMMEDIATE &&
              typeof clearImmediate === TYPEOF_FUNCTION) {
            clearImmediate(this.deferredLatencyTopologyStartHandle);
          } else {
            clearTimeout(this.deferredLatencyTopologyStartHandle);
          }
          this.deferredLatencyTopologyStartHandle = null;
          this.deferredLatencyTopologyStartKind = null;
        }

        if (typeof setImmediate === TYPEOF_FUNCTION) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        this.logger.info(BootstrapLog.SHUTDOWN, {
          nodeId: this.nodeId,
          messageGroupServices: this.messageGroupServices.size,
          partitionServices: this.partitionServices.size,
        });

        await this.seedCleanupHandler.cleanup();

        this.emit(BootstrapEvent.SHUTDOWN, {nodeId: this.nodeId});
      })();

      return this.shutdownPromise;
    },
  };
}

export {createBootstrapServiceRuntimeMethods};
