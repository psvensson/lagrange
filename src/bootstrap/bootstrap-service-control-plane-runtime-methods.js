import {NodeService} from '../node/node-service.js';
import {
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
} from './bootstrap-constants.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {
  waitForLocalQueryTransportReadiness,
} from './shared/local-query-transport-readiness.js';
import {
  PgWireStartupSafetyGate,
} from './pgwire-startup-safety-gate.js';
import {
  RuntimeServiceHandlerSetup,
} from './shared/runtime-service-handler-setup.js';
import {
  MessageGroupServiceHandlerSetup,
} from './shared/message-group-service-handler-setup.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  STATE,
} from '../constants/index.js';

const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const BOOTSTRAP_CONTROL_PLANE_OWNER_NAME = 'ControlPlaneSetup';
const LOCAL_QUERY_TRANSPORT_GATE = 'local_query_transport';
const MESSAGE_GROUP_REPLICA_SERVICE_TYPE = 'message_group';
const BOOTSTRAP_CONTROL_PLANE_RUNTIME_LOG_MSG = Object.freeze({
  RETRYING_SEED_CONTROL_PLANE_REGISTRATION:
    'Retrying seed control-plane registration until local query transport is ready',
  LOCAL_QUERY_TRANSPORT_NOT_READY:
    'Local query/data-plane transport is not ready',
});

function createBootstrapServiceControlPlaneRuntimeMethods() {
  return {
    /**
     * Initialize the control plane service for ordered registration and dispatch.
     * @private
     */
    async initializeControlPlaneService() {
      if (!this.cdcIntegrationService) {
        throw new Error(bootstrapError.CDC_CONTROL_PLANE_MISSING);
      }

      const controlPlane = await ControlPlaneSetup.create({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService:
          this.latencyTopology?.cdcGroupPropagationService || null,
        systemTableCache: this.systemTableCache,
        tablePolicyService: this.tablePolicyService,
        messageGroupServices: this.messageGroupServices,
        getLocalClusterIncarnationFence: () => this.clusterIncarnationFence,
        rebalanceCoordinator: this.rebalanceCoordinator,
        bootstrapReadinessState: this.bootstrapReadinessState,
        executorOutcomeEmitter: this.replicaHandler?.executorOutcomeEmitter,
        controlPlaneWriteRetryTimeoutMs: this.config.controlPlaneWriteRetryTimeoutMs,
        controlPlaneWriteRetryBaseDelayMs: this.config.controlPlaneWriteRetryBaseDelayMs,
        controlPlaneWriteRetryMaxDelayMs: this.config.controlPlaneWriteRetryMaxDelayMs,
      });

      this.heartbeatService = controlPlane.heartbeatService;
      this.leaseService = controlPlane.leaseService;
      this.endpointService = controlPlane.endpointService;
      this.dispatchService = controlPlane.dispatchService;
      this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;
      const resolvedExecutorOutcomeEmitter =
        this.rebalanceCoordinator?.executorOutcomeEmitter;
      if (
        this.replicaHandler &&
        resolvedExecutorOutcomeEmitter
      ) {
        this.replicaHandler.executorOutcomeEmitter =
          resolvedExecutorOutcomeEmitter;
      }
      if (
        this.messageGroupServiceHandler &&
        resolvedExecutorOutcomeEmitter
      ) {
        this.messageGroupServiceHandler.executorOutcomeEmitter =
          resolvedExecutorOutcomeEmitter;
      }
      this.runtimeSurfaceOwner.bindControlPlaneServices();

      this.logger.info(BootstrapLog.CONTROL_PLANE_READY, {
        nodeId: this.nodeId,
        messageGroupCount: this.messageGroupServices.size,
        owner: BOOTSTRAP_CONTROL_PLANE_OWNER_NAME,
      });
    },

    /**
     * Notify one startup-owned hook that cache-backed local admin surfaces can
     * come online before full cluster self-publication completes.
     * @return {Promise<void>}
     * @private
     */
    async notifyLocalAdminRuntimeReady() {
      await this.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady();
    },

    /**
     * Initialize the RuntimeServiceHandler behind the PG wire safety
     * gate. The gate ensures control-plane readiness before allowing
     * runtime-service replica operations. Startup failure is isolated
     * so bootstrap completes even if PG wire fails.
     *
     * Requirements: 11.1, 11.2, 11.4
     * @private
     */
    initializeRuntimeServiceHandler() {
      const systemTableCache = this.getSystemTableCache();
      const gate = new PgWireStartupSafetyGate({
        nodeId: this.nodeId,
        serviceLifecycleManager: this.serviceLifecycleManager,
        systemTableCache,
        heartbeatService: this.heartbeatService,
      });

      const result = gate.guardedSetup(() => {
        return RuntimeServiceHandlerSetup.create({
          nodeId: this.nodeId,
          messageRouter: this.messageRouter,
          cdcIntegrationService: this.cdcIntegrationService,
          systemTableCache,
          serviceLifecycleManager: this.serviceLifecycleManager,
          rpcClient: this.rpcClient,
          executorOutcomeEmitter:
            this.rebalanceCoordinator?.executorOutcomeEmitter,
        });
      });

      if (result) {
        this.runtimeServiceHandler = result.runtimeServiceHandler;
      }
    },

    /**
     * Initialize the MessageGroupServiceHandler for control-plane
     * message-group replica operations.
     * @private
     */
    initializeMessageGroupServiceHandler() {
      const systemTableCache = this.getSystemTableCache();
      const descriptorForReplica = (replicaId) => ({
        serviceId: replicaId,
        serviceType: MESSAGE_GROUP_REPLICA_SERVICE_TYPE,
        replicaId,
      });

      const result = MessageGroupServiceHandlerSetup.create({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache,
        createMessageGroupReplica: async (options) => {
          return this.seedMessageGroupsPhase
            .createBootstrapMessageGroupReplica({
              definition: descriptorForReplica(options.replicaId),
              replicaOptions: options,
            });
        },
        startMessageGroupReplica: async (options) => {
          return this.seedMessageGroupsPhase
            .startBootstrapMessageGroupReplica(
              descriptorForReplica(options.replicaId),
              {replicaOptions: options},
            );
        },
        stopMessageGroupReplica: async (options) => {
          return this.seedMessageGroupsPhase
            .stopBootstrapMessageGroupReplica(
              descriptorForReplica(options.replicaId),
              {replicaOptions: options},
            );
        },
        resolveLocalMessageGroupReplica: (replicaId) =>
          this.messageGroupServices.get(replicaId) || null,
        rpcClient: this.rpcClient,
        executorOutcomeEmitter:
          this.rebalanceCoordinator?.executorOutcomeEmitter,
      });

      if (result) {
        this.messageGroupServiceHandler = result.messageGroupServiceHandler;
      }
    },

    /**
     * Wait for local query/data-plane transport readiness before the
     * seed advertises READY through the control plane.
     * @return {Promise<void>}
     * @private
     */
    async awaitLocalQueryTransportReadinessForReadySignal() {
      await waitForLocalQueryTransportReadiness({
        messageRouter: this.messageRouter,
        sleep: (delayMs) => this.sleep(delayMs),
        onRetry: ({attempt, maxAttempts, delayMs, readiness}) => {
          this.logger.warn(
            BOOTSTRAP_CONTROL_PLANE_RUNTIME_LOG_MSG
              .RETRYING_SEED_CONTROL_PLANE_REGISTRATION,
            {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              nextDelayMs: delayMs,
              error:
                readiness?.reason ||
                BOOTSTRAP_CONTROL_PLANE_RUNTIME_LOG_MSG
                  .LOCAL_QUERY_TRANSPORT_NOT_READY,
              gate: LOCAL_QUERY_TRANSPORT_GATE,
              localQueryTransport: readiness,
            },
          );
        },
      });
    },

    /**
     * Register the seed node using the control plane path.
     * @return {Promise<void>}
     * @private
     */
    async registerSeedNodeWithControlPlane() {
      if (!this.heartbeatService) {
        return;
      }

      try {
        await this.seedCacheHydrationPhase
          .waitForSystemServiceLeadersInCache();
        await this.awaitLocalQueryTransportReadinessForReadySignal();
        const stats = await NodeService.getInstance().getNodeStats();
        const cpuCores = Number.isFinite(stats?.cpu?.count) ?
          stats.cpu.count : NUM.ZERO;
        const totalMemoryMb = Number.isFinite(stats?.memory?.totalBytes) ?
          Math.round(stats.memory.totalBytes / NUM.BYTES_PER_MIB) :
          NUM.ZERO;
        const diskGb = Number.isFinite(stats?.diskGb) ?
          stats.diskGb : NUM.HUNDRED;
        const now = Date.now();

        const nodeRow = {
          [COLUMN.NODE_ID]: this.nodeId,
          [COLUMN.NODE_ADDRESS]: this.nodeAddress,
          [COLUMN.CPU_CORES]: cpuCores,
          [COLUMN.MEMORY_MB]: totalMemoryMb,
          [COLUMN.DISK_GB]: diskGb,
          [COLUMN.CPU_USAGE_PERCENT]:
            Number.isFinite(stats?.cpu?.usagePercent) ?
              stats.cpu.usagePercent : NUM.ZERO,
          [COLUMN.MEMORY_USAGE_PERCENT]:
            Number.isFinite(stats?.memory?.usagePercent) ?
              stats.memory.usagePercent : NUM.ZERO,
          [COLUMN.DISK_USAGE_PERCENT]:
            Number.isFinite(stats?.diskUsagePercent) ?
              stats.diskUsagePercent : NUM.ZERO,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.CAPABILITIES]: JSON.stringify([]),
          [COLUMN.LAST_HEARTBEAT]: now,
          [COLUMN.CREATED_AT]: now,
        };

        const budgetService = NodeStorageBudgetSetup.create({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
        });
        await NodeStorageBudgetSetup.resolveAndPersist({
          budgetService,
          nodeRow,
          nodeId: this.nodeId,
        });

        await this.heartbeatService.sendHeartbeat(
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
      } catch (error) {
        this.logger.error(BootstrapLog.CONTROL_PLANE_REGISTER_FAILED, {
          nodeId: this.nodeId,
          error: error.message,
        });
        throw error;
      }
    },

    /**
     * Activate non-critical periodic control-plane writers after bootstrap
     * reaches the active startup barrier.
     * @return {Promise<void>}
     * @private
     */
    async activateControlPlaneBackgroundWriters() {
      return this.runtimeHandoffOwner.activateControlPlaneBackgroundWriters();
    },

    /**
     * Activate steady-state distributed transaction recovery once the
     * runtime-owned SQL engine has been attached and lifecycle publication
     * is ready. Seed restarts must defer replay until after cache hydration.
     * @return {void}
     * @private
     */
    activateDistributedTransactionRecovery() {
      return this.runtimeHandoffOwner.activateDistributedTransactionRecovery();
    },

    hasActiveControlPlaneBackgroundWriters() {
      return this.runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters();
    },
  };
}

export {createBootstrapServiceControlPlaneRuntimeMethods};
