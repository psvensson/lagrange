import {PartitionService} from '../partition/partition-service.js';
import {ReplicaState} from '../node/replica-state-machine.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
} from './bootstrap-constants.js';
import {
  shouldAttachPartitionCdcPropagation,
} from './shared/cdc-propagation-filter.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {
  buildPartitionCdcPropagationSubscriber,
} from './shared/partition-cdc-propagation-subscriber.js';
import {assertCritical} from '../utils/assert.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {
  NUM,
  SERVICE_STATUS,
  TABLES,
} from '../constants/index.js';

const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;
const BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL = NUM.TEN;
const BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA = NUM.FOUR;
const TYPEOF_OBJECT = 'object';
const TYPEOF_FUNCTION = 'function';
const BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG = Object.freeze({
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
  STATE_MACHINE_REGISTRATION_PERSISTENCE_REJECTED:
    'Replica state persistence rejected during bootstrap registration',
  DEFERRED_CDC_DYNAMIC_SUBSCRIPTION_FAILED:
    'Deferred CDC subscription failed for dynamically created partition',
});
const OPERATIONAL_CDC_SUBSCRIPTION_NOT_READY_PREFIX =
  'Operational message-group ingress not ready for ';
const OPERATIONAL_CDC_SUBSCRIPTION_NOT_READY_SUFFIX = ' CDC subscription';
const BOOTSTRAP_CDC_SUBSCRIBER_PART_PREFIX = 'bootstrap';
const MESSAGE_GROUP_CDC_SUBSCRIBER_FALLBACK = 'message-group';
function createBootstrapServiceReplicaHandlerRuntimeMethods() {
  return {
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
          const attachCdcPropagation = async () => {
            const subscriptionSelection =
              await this.resolveOperationalMessageGroupSelectionAsync({
                requiredTables: [tableName],
                preferredService: messageGroupService,
                reuseCapturedIngress: true,
              });
            const subscriptionMessageGroupService =
              subscriptionSelection.service;
            if (!subscriptionMessageGroupService) {
              throw this.buildMessageGroupOwnerNotReadyError(
                subscriptionSelection,
                {
                  message:
                    OPERATIONAL_CDC_SUBSCRIPTION_NOT_READY_PREFIX +
                    `${tableName}${OPERATIONAL_CDC_SUBSCRIPTION_NOT_READY_SUFFIX}`,
                },
              );
            }

            await subscriptionMessageGroupService.subscribeToCDC(tableName);

            const subscriberId = [
              BOOTSTRAP_CDC_SUBSCRIBER_PART_PREFIX,
              this.nodeId,
              tableName,
              options.replicaId,
              subscriptionMessageGroupService?.groupId ||
                MESSAGE_GROUP_CDC_SUBSCRIBER_FALLBACK,
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
              resolveOperationalMessageGroupSelectionAsync:
                (selectionOptions = {}) =>
                  this.resolveOperationalMessageGroupSelectionAsync(
                    selectionOptions,
                  ),
              buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
                this.buildMessageGroupOwnerNotReadyError(
                  selection,
                  errorOptions,
                ),
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
          };
          if (options.deferCdcPropagationHandshake === true) {
            attachCdcPropagation().catch((error) => {
              this.logger.warn(
                BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
                  .DEFERRED_CDC_DYNAMIC_SUBSCRIPTION_FAILED,
                {
                  tableName,
                  partitionId: options.partitionId,
                  replicaId: options.replicaId,
                  error: error?.message || String(error),
                },
              );
            });
          } else {
            await attachCdcPropagation();
          }
        }

        return partition;
      };

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
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
          attemptedCount: 0,
          registeredCount: 0,
          skippedCount: partitions?.size || 0,
          totalPartitions: partitions?.size || 0,
        };
      }

      const startedAt = Date.now();
      const totalPartitions = partitions.size;
      let registeredCount = 0;
      let attemptedCount = 0;
      let skippedCount = 0;
      const writeRegistrationTrace = (event, details = {}) => {
        this.writeBootstrapReplicaRegistrationTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_PARTITION,
          event,
          details,
        );
      };
      this.logger.info(
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
          .STARTING_PARTITION_REGISTRATION,
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
              BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
          0
        ) {
          this.logger.info(BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
          .COMPLETED_PARTITION_REGISTRATION,
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
  };
}

function createBootstrapServiceReplicaStateRuntimeMethods() {
  return {
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
        typeof stateMachine.registerReplicaSnapshot === TYPEOF_FUNCTION;
      let registeredCount = 0;
      let attemptedCount = 0;
      let skippedCount = 0;
      let persistErrorCount = 0;
      const persistSettles = [];
      const writeStateTrace = (event, details = {}) => {
        this.writeBootstrapReplicaRegistrationTrace(
          BOOTSTRAP_REPLICA_REGISTRATION_TRACE.SCOPE_STATE,
          event,
          details,
        );
      };

      const trackTransitionPersistence = (result, replicaId, targetState) => {
        if (!result || typeof result.then !== TYPEOF_FUNCTION) {
          return;
        }
        const tracked = result.catch((error) => {
          persistErrorCount++;
          this.logger.error(
            BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
              .STATE_MACHINE_REGISTRATION_PERSISTENCE_REJECTED,
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
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
          .STARTING_STATE_MACHINE_REGISTRATION,
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
            error: BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
          0
        ) {
          this.logger.info(BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
          0 :
          registeredCount * BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA;
      this.logger.debug(BootstrapLog.STATE_MACHINE_REGISTERED, {
        registeredCount,
        totalPartitions: partitions.size,
        nodeId: this.nodeId,
        stateCounts: stateMachine.getStateCounts(),
      });
      this.logger.info(
        BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
          .COMPLETED_STATE_MACHINE_REGISTRATION,
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

      if (persistSettles.length > 0) {
        void Promise.all(persistSettles).then(() => {
          this.logger.info(
            BOOTSTRAP_REPLICA_REGISTRATION_LOG_MSG
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
  };
}

export {createBootstrapServiceReplicaHandlerRuntimeMethods};
export {createBootstrapServiceReplicaStateRuntimeMethods};
