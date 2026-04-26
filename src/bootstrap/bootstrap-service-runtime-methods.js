import {NodeService} from '../node/node-service.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_READY_MESSAGE,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
} from './bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
} from './system-table-schemas-constants.js';
import {
  shouldAttachPartitionCdcPropagation,
} from './shared/cdc-propagation-filter.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {
  buildPartitionCdcPropagationSubscriber,
} from './shared/partition-cdc-propagation-subscriber.js';
import {ReplicaState} from '../node/replica-state-machine.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {
  waitForLocalQueryTransportReadiness,
} from './shared/local-query-transport-readiness.js';
import {assertCritical} from '../utils/assert.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
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
  activateMessageGroupServiceRows,
} from './shared/message-group-service-activation.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../constants/index.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;
const BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL = NUM.TEN;
const BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA = NUM.FOUR;
const TYPEOF_OBJECT = 'object';
const TYPEOF_FUNCTION = 'function';
const DEFERRED_LATENCY_TOPOLOGY_START_KIND_IMMEDIATE = 'immediate';
const BOOTSTRAP_CONTROL_PLANE_OWNER_NAME = 'ControlPlaneSetup';
const LOCAL_QUERY_TRANSPORT_GATE = 'local_query_transport';
const BOOTSTRAP_RUNTIME_LOG_MSG = Object.freeze({
  DEFERRED_SEED_MESSAGE_GROUP_SERVICE_ACTIVATION:
    'Deferring seed message-group service row activation during startup',
  REPLICA_HANDLER_PARTITION_REGISTRATION_SUMMARY:
    'Bootstrap replica-handler partition registration summary',
  REPLICA_HANDLER_STATE_REGISTRATION_SUMMARY:
    'Bootstrap replica-handler state registration summary',
  STARTING_PARTITION_REGISTRATION:
    'Starting bootstrap partition registration with replica handler',
  PARTITION_SERVICE_MISSING_DURING_REPLICA_HANDLER_REGISTRATION:
    'Partition service missing during replica-handler registration',
  PARTITION_REGISTRATION_PROGRESS:
    'Bootstrap partition registration progress',
  COMPLETED_PARTITION_REGISTRATION:
    'Completed bootstrap partition registration with replica handler',
  RETRYING_SEED_CONTROL_PLANE_REGISTRATION:
    'Retrying seed control-plane registration until local query transport is ready',
  LOCAL_QUERY_TRANSPORT_NOT_READY:
    'Local query/data-plane transport is not ready',
  STARTING_STATE_MACHINE_REGISTRATION:
    'Starting bootstrap replica registration with state machine',
  PARTITION_SERVICE_MISSING_DURING_STATE_MACHINE_REGISTRATION:
    'Partition service missing during state-machine registration',
  STATE_MACHINE_REGISTRATION_PROGRESS:
    'Bootstrap state-machine registration progress',
  COMPLETED_STATE_MACHINE_REGISTRATION:
    'Completed bootstrap replica registration with state machine',
  STATE_MACHINE_REGISTRATION_PERSISTENCE_SETTLED:
    'Bootstrap state-machine registration persistence settled',
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
      return localEndpointRows.length > NUM.ZERO;
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

    /**
     * Emit best-effort bootstrap replica registration diagnostics.
     * @param {string} scope - Partition or state registration scope.
     * @param {string} event - Trace event name.
     * @param {Object} details - Structured trace details.
     * @private
     */
    writeBootstrapReplicaRegistrationTrace(scope, event, details = {}) {
      if (!this.config.replicaRegistrationTraceEnabled) {
        return;
      }

      this.logger.debug(
        `${BOOTSTRAP_REPLICA_REGISTRATION_TRACE.PREFIX} ` +
        `scope=${scope} event=${event}`,
        {
          nodeId: this.nodeId,
          ...details,
        },
      );
    },

    /**
     * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
     * @private
     */
    initializeReplicaHandler() {
      const messageGroupService =
        this.getLeaderMessageGroupService();

      let dataDir = STORAGE_DEFAULT.DATA_DIR;
      if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
        dataDir = this.dataDirectoryManager.getDataDir();
      }

      const systemTableCache = this.getSystemTableCache();
      const cdcIntegrationService = this.cdcIntegrationService;

      if (!cdcIntegrationService) {
        throw new Error(bootstrapError.CDC_REPLICA_HANDLER_MISSING);
      }

      // Caller-specific partition creation factory
      const createPartitionService = async (options) => {
        let dbPath = DEFAULT_BOOTSTRAP_CONFIG.partitionDbPath;
        if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
          dbPath = this.dataDirectoryManager.getPartitionDbPath(
            options.partitionId,
            options.replicaId,
          );
        }

        const partition = new PartitionService({
          ...options,
          dbPath,
          transport: this.transport,
          messageGroupService: messageGroupService,
          messageRouter: this.messageRouter,
          rebalanceCoordinator: this.rebalanceCoordinator,
          replicaStateMachine: this.replicaStateMachine,
          systemTableCache: systemTableCache,
          cdcIntegrationService: cdcIntegrationService,
          sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine || null,
          tablePolicyService: this.tablePolicyService,
          bootstrapReadinessState: this.bootstrapReadinessState,
        });

        await partition.initialize();

        this.partitionServices.set(options.replicaId, partition);
        this.servicesCreated++;

        const tableName = options.tableName;
        if (tableName &&
            shouldAttachPartitionCdcPropagation(tableName)) {
          const subscriptionSelection =
            await this.resolveOperationalMessageGroupSelectionAsync({
              requiredTables: [tableName],
            });
          const subscriptionMessageGroupService =
            subscriptionSelection.service;
          if (!subscriptionMessageGroupService) {
            throw this.buildMessageGroupOwnerNotReadyError(
              subscriptionSelection,
              {
                message:
                  'Operational message-group ingress not ready ' +
                  `for ${tableName} CDC subscription`,
              },
            );
          }

          await subscriptionMessageGroupService.subscribeToCDC(tableName);

          const subscriberId = [
            'bootstrap',
            this.nodeId,
            tableName,
            options.replicaId,
            subscriptionMessageGroupService?.groupId || 'message-group',
          ].join(':');
          const cdcSubscriber = buildPartitionCdcPropagationSubscriber({
            tableName,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            logger: this.logger,
            eventLogMessage: BootstrapLog.CDC_DYNAMIC_PARTITION_EVENT,
            preferredService: subscriptionMessageGroupService,
            resolveOperationalMessageGroupSelection: (selectionOptions = {}) =>
              this.resolveOperationalMessageGroupSelection(selectionOptions),
            resolveOperationalMessageGroupSelectionAsync: (selectionOptions = {}) =>
              this.resolveOperationalMessageGroupSelectionAsync(selectionOptions),
            buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
              this.buildMessageGroupOwnerNotReadyError(selection, errorOptions),
            propagatePartitionCDCEvent: (messageGroupService, cdcEvent) =>
              this.seedRuntimeBridgeOwner.propagatePartitionCDCEvent(
                messageGroupService,
                cdcEvent,
              ),
            afterPropagation: async () => {
              if (tableName === TABLES.CONFIG) {
                this.seedRuntimeBridgeOwner.applyCurrentEpochFromCache();
              }
            },
          });
          const handshake = await partition.subscribeToCDCWithHandshake(
            cdcSubscriber,
            {subscriberId},
          );

          this.logger.debug(BootstrapLog.CDC_DYNAMIC_SUBSCRIPTION, {
            tableName,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            subscriberId: handshake.subscriberId,
            subscriptionEpoch: handshake.subscriptionEpoch,
            catchupMode: handshake.catchup.mode,
            bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed,
          });
        }

        return partition;
      };

      // Use shared ReplicaHandlerSetup component
      const {replicaHandler, replicaStateMachine} = ReplicaHandlerSetup.create({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: cdcIntegrationService,
        systemTableCache: systemTableCache,
        createPartitionService: createPartitionService,
        dataDir: dataDir,
        rpcClient: this.rpcClient,
        executorOutcomeEmitter:
          this.rebalanceCoordinator?.executorOutcomeEmitter,
      });

      this.replicaHandler = replicaHandler;
      this.replicaStateMachine = replicaStateMachine;

      const partitionRegistrationStartedAt = Date.now();
      this.writeBootstrapReplicaRegistrationTrace(
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION,
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_BEGIN,
        {
          nodeId: this.nodeId,
          totalPartitions: this.partitionServices.size,
        },
      );
      const partitionRegistrationSummary =
        this.registerPartitionsWithReplicaHandler(
          this.replicaHandler,
          this.partitionServices,
        );
      this.writeBootstrapReplicaRegistrationTrace(
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION,
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_END,
        {
          nodeId: this.nodeId,
          durationMs: Date.now() - partitionRegistrationStartedAt,
          attemptedCount: partitionRegistrationSummary.attemptedCount,
          registeredCount: partitionRegistrationSummary.registeredCount,
          skippedCount: partitionRegistrationSummary.skippedCount,
          totalPartitions: partitionRegistrationSummary.totalPartitions,
        },
      );
      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG
          .REPLICA_HANDLER_PARTITION_REGISTRATION_SUMMARY,
        {
          nodeId: this.nodeId,
          durationMs: Date.now() - partitionRegistrationStartedAt,
          attemptedCount: partitionRegistrationSummary.attemptedCount,
          registeredCount: partitionRegistrationSummary.registeredCount,
          skippedCount: partitionRegistrationSummary.skippedCount,
          totalPartitions: partitionRegistrationSummary.totalPartitions,
        },
      );

      const stateRegistrationStartedAt = Date.now();
      this.writeBootstrapReplicaRegistrationTrace(
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE,
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_BEGIN,
        {
          nodeId: this.nodeId,
          totalPartitions: this.partitionServices.size,
        },
      );
      const stateRegistrationSummary =
        this.registerReplicasWithStateMachine(
          this.replicaStateMachine,
          this.partitionServices,
        );
      this.writeBootstrapReplicaRegistrationTrace(
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE,
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_CALL_END,
        {
          nodeId: this.nodeId,
          durationMs: Date.now() - stateRegistrationStartedAt,
          attemptedCount: stateRegistrationSummary.attemptedCount,
          registeredCount: stateRegistrationSummary.registeredCount,
          skippedCount: stateRegistrationSummary.skippedCount,
          pendingPersistCount: stateRegistrationSummary.pendingPersistCount,
          expectedPersistCount: stateRegistrationSummary.expectedPersistCount,
          persistErrorCount: stateRegistrationSummary.persistErrorCount,
        },
      );
      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG
          .REPLICA_HANDLER_STATE_REGISTRATION_SUMMARY,
        {
          nodeId: this.nodeId,
          durationMs: Date.now() - stateRegistrationStartedAt,
          attemptedCount: stateRegistrationSummary.attemptedCount,
          registeredCount: stateRegistrationSummary.registeredCount,
          skippedCount: stateRegistrationSummary.skippedCount,
          pendingPersistCount: stateRegistrationSummary.pendingPersistCount,
          expectedPersistCount: stateRegistrationSummary.expectedPersistCount,
          persistErrorCount: stateRegistrationSummary.persistErrorCount,
        },
      );

      this.logger.info(BootstrapLog.REPLICA_HANDLER_READY, {
        nodeId: this.nodeId,
        hasMessageGroupService: !!messageGroupService,
        registeredPartitions: this.partitionServices.size,
      });
    },

    /**
     * Register bootstrap-created partitions with ReplicaHandler.
     * @param {ReplicaHandler} replicaHandler - Handler instance.
     * @param {Map<string, PartitionService>} partitions - Created partitions.
     * @return {Object} Registration summary.
     */
    registerPartitionsWithReplicaHandler(replicaHandler, partitions) {
      if (!replicaHandler) {
        this.logger.warn(BootstrapLog.REPLICA_HANDLER_MISSING);
        return {
          attemptedCount: NUM.ZERO,
          registeredCount: NUM.ZERO,
          skippedCount: partitions?.size || NUM.ZERO,
          totalPartitions: partitions?.size || NUM.ZERO,
        };
      }

      const startedAt = Date.now();
      const totalPartitions = partitions.size;
      let registeredCount = NUM.ZERO;
      let attemptedCount = NUM.ZERO;
      let skippedCount = NUM.ZERO;
      const writeRegistrationTrace = (event, details = {}) => {
        this.writeBootstrapReplicaRegistrationTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION,
          event,
          details,
        );
      };
      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG.STARTING_PARTITION_REGISTRATION,
        {
          nodeId: this.nodeId,
          totalPartitions,
        },
      );
      writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_START, {
        nodeId: this.nodeId,
        totalPartitions,
      });

      for (const [replicaId, partition] of partitions) {
        attemptedCount++;
        if (!partition || typeof partition !== TYPEOF_OBJECT) {
          skippedCount++;
          writeRegistrationTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SKIP_MISSING_PARTITION,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
            },
          );
          this.logger.error(BootstrapLog.REPLICA_HANDLER_REGISTER_FAILED, {
            replicaId,
            partitionId: null,
            error:
              BOOTSTRAP_RUNTIME_LOG_MSG
                .PARTITION_SERVICE_MISSING_DURING_REPLICA_HANDLER_REGISTRATION,
          });
          continue;
        }

        try {
          writeRegistrationTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ATTEMPT,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
              partitionId: partition.partitionId || null,
            },
          );
          replicaHandler.registerExistingReplica({
            replicaId: replicaId,
            partitionId: partition.partitionId,
            tableName: partition.tableName,
            status: SERVICE_STATUS.ACTIVE,
            service: partition,
          });
          registeredCount++;
          writeRegistrationTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
            },
          );
        } catch (error) {
          writeRegistrationTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
              error: error.message,
            },
          );
          this.logger.error(BootstrapLog.REPLICA_HANDLER_REGISTER_FAILED, {
            replicaId,
            partitionId: partition?.partitionId || null,
            error: error.message,
          });
        }

        if (
          attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL ===
          NUM.ZERO
        ) {
          this.logger.info(BOOTSTRAP_RUNTIME_LOG_MSG
            .PARTITION_REGISTRATION_PROGRESS, {
            nodeId: this.nodeId,
            attemptedCount,
            registeredCount,
            skippedCount,
            totalPartitions,
            latestReplicaId: replicaId,
            elapsedMs: Date.now() - startedAt,
          });
        }
      }

      this.logger.debug(BootstrapLog.REPLICA_HANDLER_REGISTERED, {
        registeredCount,
        totalPartitions: partitions.size,
        nodeId: this.nodeId,
      });
      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG.COMPLETED_PARTITION_REGISTRATION,
        {
          nodeId: this.nodeId,
          attemptedCount,
          registeredCount,
          skippedCount,
          totalPartitions,
          durationMs: Date.now() - startedAt,
        },
      );
      writeRegistrationTrace(
        BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_COMPLETE,
        {
          nodeId: this.nodeId,
          attemptedCount,
          registeredCount,
          skippedCount,
          totalPartitions,
          durationMs: Date.now() - startedAt,
        },
      );
      return {
        attemptedCount,
        registeredCount,
        skippedCount,
        totalPartitions,
      };
    },

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
        serviceType: 'message_group',
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
            BOOTSTRAP_RUNTIME_LOG_MSG
              .RETRYING_SEED_CONTROL_PLANE_REGISTRATION,
            {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              nextDelayMs: delayMs,
              error:
                readiness?.reason ||
                BOOTSTRAP_RUNTIME_LOG_MSG.LOCAL_QUERY_TRANSPORT_NOT_READY,
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

    /**
     * Register bootstrap-created replicas with the ReplicaStateMachine.
     * This ensures the state machine tracks all existing replicas as 'active'.
     * Requirements: 1.4 - State machine is single source of truth
     *
     * @param {ReplicaStateMachine} stateMachine - State machine instance.
     * @param {Map<string, PartitionService>} partitions - Created partitions.
     * @return {Object} Registration summary.
     */
    registerReplicasWithStateMachine(stateMachine, partitions) {
      assertCritical(stateMachine, bootstrapError.STATE_MACHINE_MISSING);

      const startedAt = Date.now();
      const totalPartitions = partitions.size;
      const supportsSnapshotRegistration =
        typeof stateMachine.registerReplicaSnapshot === 'function';
      let registeredCount = NUM.ZERO;
      let attemptedCount = NUM.ZERO;
      let skippedCount = NUM.ZERO;
      let persistErrorCount = NUM.ZERO;
      const persistSettles = [];
      const writeStateTrace = (event, details = {}) => {
        this.writeBootstrapReplicaRegistrationTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE,
          event,
          details,
        );
      };

      const trackTransitionPersistence = (result, replicaId, targetState) => {
        if (!result || typeof result.then !== 'function') {
          return;
        }
        const tracked = result.catch((error) => {
          persistErrorCount++;
          this.logger.error(
            'Replica state persistence rejected during bootstrap registration',
            {
              nodeId: this.nodeId,
              replicaId,
              targetState,
              error: error.message,
            },
          );
          return false;
        });
        persistSettles.push(tracked);
      };
      const registerReplicaSnapshot = (
        replicaId,
        partitionId,
        currentAttempt,
      ) => {
        writeStateTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_BEGIN,
          {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState: ReplicaState.ACTIVE,
          },
        );
        const registrationResult = stateMachine.registerReplicaSnapshot(
          replicaId,
          {
            partitionId,
            nodeId: this.nodeId,
            state: ReplicaState.ACTIVE,
            reason:
              BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
            serviceId: replicaId,
          },
        );
        writeStateTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_END,
          {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState: ReplicaState.ACTIVE,
          },
        );
        if (registrationResult !== true) {
          throw new Error('Replica snapshot registration rejected');
        }
      };
      const transitionReplicaState = (
        replicaId,
        partitionId,
        targetState,
        currentAttempt,
      ) => {
        writeStateTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_BEGIN,
          {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState,
          },
        );
        const transitionResult = stateMachine.transition(
          replicaId,
          targetState,
          {
            partitionId,
            nodeId: this.nodeId,
            reason:
              BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
            serviceId: replicaId,
          },
        );
        writeStateTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_TRANSITION_END,
          {
            nodeId: this.nodeId,
            attemptedCount: currentAttempt,
            replicaId,
            partitionId,
            targetState,
          },
        );
        trackTransitionPersistence(transitionResult, replicaId, targetState);
      };

      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG.STARTING_STATE_MACHINE_REGISTRATION,
        {
          nodeId: this.nodeId,
          totalPartitions,
        },
      );
      writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_START, {
        nodeId: this.nodeId,
        totalPartitions,
      });

      for (const [replicaId, partition] of partitions) {
        attemptedCount++;
        writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ATTEMPT, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
          partitionId: partition?.partitionId || null,
        });
        if (!partition || typeof partition !== TYPEOF_OBJECT) {
          skippedCount++;
          writeStateTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SKIP_MISSING_PARTITION,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
            },
          );
          this.logger.error(BootstrapLog.STATE_MACHINE_REGISTER_FAILED, {
            replicaId,
            partitionId: null,
            error: BOOTSTRAP_RUNTIME_LOG_MSG
              .PARTITION_SERVICE_MISSING_DURING_STATE_MACHINE_REGISTRATION,
          });
          continue;
        }

        try {
          if (supportsSnapshotRegistration) {
            registerReplicaSnapshot(
              replicaId,
              partition.partitionId,
              attemptedCount,
            );
          } else {
            transitionReplicaState(
              replicaId,
              partition.partitionId,
              ReplicaState.PENDING,
              attemptedCount,
            );
            transitionReplicaState(
              replicaId,
              partition.partitionId,
              ReplicaState.CREATING,
              attemptedCount,
            );
            transitionReplicaState(
              replicaId,
              partition.partitionId,
              ReplicaState.SYNCING,
              attemptedCount,
            );
            transitionReplicaState(
              replicaId,
              partition.partitionId,
              ReplicaState.ACTIVE,
              attemptedCount,
            );
          }

          registeredCount++;
          writeStateTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
              partitionId: partition.partitionId,
            },
          );
        } catch (error) {
          writeStateTrace(
            BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR,
            {
              nodeId: this.nodeId,
              attemptedCount,
              replicaId,
              partitionId: partition?.partitionId || null,
              error: error.message,
            },
          );
          this.logger.error(BootstrapLog.STATE_MACHINE_REGISTER_FAILED, {
            replicaId,
            partitionId: partition?.partitionId || null,
            error: error.message,
          });
        }

        if (
          attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL ===
          NUM.ZERO
        ) {
          this.logger.info(BOOTSTRAP_RUNTIME_LOG_MSG
            .STATE_MACHINE_REGISTRATION_PROGRESS, {
            nodeId: this.nodeId,
            attemptedCount,
            registeredCount,
            skippedCount,
            persistErrorCount,
            pendingPersistCount: persistSettles.length,
            totalPartitions,
            latestReplicaId: replicaId,
            elapsedMs: Date.now() - startedAt,
          });
        }
      }

      const expectedPersistCount =
        supportsSnapshotRegistration ?
          NUM.ZERO :
          registeredCount * BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA;
      this.logger.debug(BootstrapLog.STATE_MACHINE_REGISTERED, {
        registeredCount,
        totalPartitions: partitions.size,
        nodeId: this.nodeId,
        stateCounts: stateMachine.getStateCounts(),
      });
      this.logger.info(
        BOOTSTRAP_RUNTIME_LOG_MSG.COMPLETED_STATE_MACHINE_REGISTRATION,
        {
          nodeId: this.nodeId,
          attemptedCount,
          registeredCount,
          skippedCount,
          persistErrorCount,
          pendingPersistCount: persistSettles.length,
          expectedPersistCount,
          totalPartitions,
          durationMs: Date.now() - startedAt,
        },
      );
      writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_COMPLETE, {
        nodeId: this.nodeId,
        attemptedCount,
        registeredCount,
        skippedCount,
        persistErrorCount,
        pendingPersistCount: persistSettles.length,
        expectedPersistCount,
        totalPartitions,
        durationMs: Date.now() - startedAt,
      });

      if (persistSettles.length > NUM.ZERO) {
        void Promise.all(persistSettles).then(() => {
          this.logger.info(
            BOOTSTRAP_RUNTIME_LOG_MSG
              .STATE_MACHINE_REGISTRATION_PERSISTENCE_SETTLED,
            {
              nodeId: this.nodeId,
              attemptedCount,
              registeredCount,
              skippedCount,
              persistErrorCount,
              expectedPersistCount,
              settledPersistCount: persistSettles.length,
              elapsedMs: Date.now() - startedAt,
            },
          );
        });
      }

      return {
        attemptedCount,
        registeredCount,
        skippedCount,
        pendingPersistCount: persistSettles.length,
        expectedPersistCount,
        persistErrorCount,
        totalPartitions,
      };
    },

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
     * Upsert/update a node's connection state into the nodes system table.
     * Used by bootstrap-ready handlers and some tests.
     * @param {Object} options
     * @param {string} options.nodeId
     * @param {string} options.nodeAddress
     * @param {string} options.connectionState
     * @param {Array<string>} [options.capabilities]
     * @return {Promise<void>}
     */
    async upsertNodeConnectionState(options) {
      const nodesPartition = this.getLeaderPartition(TABLES.NODES);
      if (!nodesPartition) {
        throw new Error(bootstrapError.NODES_LEADER_MISSING);
      }

      const cache = this.getSystemTableCache();
      const existing = cache.get(TABLES.NODES, options.nodeId) || null;

      const capabilities = Array.isArray(options.capabilities) ?
        options.capabilities :
        [];

      if (existing) {
        await nodesPartition.updateData(
          TABLES.NODES,
          {node_id: options.nodeId},
          {
            node_address: options.nodeAddress,
            connection_state: options.connectionState,
            capabilities: JSON.stringify(capabilities),
            // Preserve last heartbeat if present to avoid clobbering liveness tracking.
            last_heartbeat: existing.last_heartbeat,
          },
        );
      } else {
        await nodesPartition.upsertData(TABLES.NODES, {
          node_id: options.nodeId,
          node_address: options.nodeAddress,
          connection_state: options.connectionState,
          capabilities: JSON.stringify(capabilities),
        });
      }
    },

    /**
     * Register the bootstrap "ready" handler on the message router.
     * This is a compatibility hook for older joining flows.
     */
    registerBootstrapReadyHandler() {
      if (!this.messageRouter?.register) {
        return;
      }

      const address =
        `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.BOOTSTRAP}` +
        `${ADDRESS.SEPARATOR}${BOOTSTRAP_READY_MESSAGE.PATH}`;
      this.messageRouter.register(address, async (msg) => {
        const payload = msg?.payload || {};
        if (payload.type === BOOTSTRAP_READY_MESSAGE.TYPE) {
          await this.upsertNodeConnectionState({
            nodeId: payload.nodeId,
            nodeAddress: payload.nodeAddress,
            connectionState: STATE.READY,
            capabilities: payload.capabilities,
          });
        }
        return {acknowledged: true};
      });
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
          this.messageGroupsCreated > NUM.ZERO ?
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
        duration: this.startTime ? Date.now() - this.startTime : NUM.ZERO,
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
