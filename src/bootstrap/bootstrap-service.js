/**
 * Bootstrap Service - System initialization and startup.
 *
 * Seed Node Bootstrap Process:
 * 1. Infrastructure - Create node service and message router
 * 2. Message Groups - Create initial message group replicas
 * 3. Partitions - Create system table partitions
 * 4. Registration - Write system metadata using bootstrap mode
 * 5. Cache Hydration - Populate system cache from partitions
 *
 * Bootstrap Mode Architecture:
 * - During registration phase, uses bootstrap mode for direct writes
 * - Bootstrap mode bypasses SQL routing (which requires cache)
 * - After registration, cache is hydrated from partition data
 * - After hydration, bootstrap mode is disabled
 * - All subsequent writes route through SQL engine and system cache
 *
 * System Cache as Single Source of Truth:
 * - After bootstrap, system cache contains complete cluster state
 * - All queries route through system cache to find partition leaders
 * - CDC events keep cache synchronized across all nodes
 * - No bootstrap directories or fallback mechanisms
 *
 * Requirements: 6.3, 6.4, 6.7, 6.8, 6.9, 6.12, 6.13, 6.14, 6.16, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import {v4 as _uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {DataDirectoryManager as _DataDirectoryManager} from '../storage/data-directory-manager.js';
import {NodeService} from '../node/node-service.js';
import {
  MessageGroupService as _MessageGroupService,
} from '../message-group/message-group-service.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  BOOTSTRAP_CLEANUP_STEP,
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_READY_MESSAGE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_REBALANCE_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
  BOOTSTRAP_SUBSYSTEM,
} from './bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
} from './system-table-schemas-constants.js';
import {CacheHydrationService as _CacheHydrationService} from '../cache/cache-hydration-service.js';
import {
  shouldAttachPartitionCdcPropagation,
} from './shared/cdc-propagation-filter.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {ReplicaState} from '../node/replica-state-machine.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {assertCritical} from '../utils/assert.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {createRuntimeStartupWiring} from '../runtime/runtime-startup-wiring.js';
import {
  WORK_CLASS,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
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
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';
import {createSeedPhaseOwners} from './owners/seed-phase-owners.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';
import {createSeedStartupPlan} from './pipeline/seed-startup-plan.js';
import {
  SeedInfrastructurePhase,
} from './phases/seed-infrastructure-phase.js';
import {
  SeedMessageGroupsPhase,
} from './phases/seed-message-groups-phase.js';
import {
  SeedPartitionsPhase,
} from './phases/seed-partitions-phase.js';
import {
  SeedRegistrationPhase,
} from './phases/seed-registration-phase.js';
import {
  SeedCacheHydrationPhase,
} from './phases/seed-cache-hydration-phase.js';
import {
  SeedCleanupHandler,
} from './phases/seed-cleanup-handler.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {
  isNodeHeartbeatWatermarkRegression,
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {BOOTSTRAP_SUB_PHASE} from '../node/node-constants.js';
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

/**
 * Maps BOOTSTRAP_PHASE values to BOOTSTRAP_SUB_PHASE values
 * for NodeLifecycleStateMachine sub-phase transitions.
 */
const PHASE_TO_SUB_PHASE = Object.freeze({
  [BootstrapPhase.INFRASTRUCTURE]:
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
  [BootstrapPhase.MESSAGE_GROUPS]:
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  [BootstrapPhase.PARTITIONS]:
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
  [BootstrapPhase.REGISTRATION]:
    BOOTSTRAP_SUB_PHASE.REGISTRATION,
  [BootstrapPhase.CACHE_HYDRATION]:
    BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
});

/**
 * All cleanup steps in reverse phase order.
 * When a phase fails, cleanup runs from that phase backward
 * through INFRASTRUCTURE.
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
 * A failure at phase X means cleanup steps from index X onward
 * (in CLEANUP_STEPS_REVERSE_ORDER) should execute.
 */
const PHASE_TO_CLEANUP_INDEX = Object.freeze({
  [BootstrapPhase.CACHE_HYDRATION]: 0,
  [BootstrapPhase.REGISTRATION]: 1,
  [BootstrapPhase.PARTITIONS]: 2,
  [BootstrapPhase.MESSAGE_GROUPS]: 3,
  [BootstrapPhase.INFRASTRUCTURE]: 4,
});

/**
 * BootstrapService handles system initialization for seed nodes.
 * Implements four-phase bootstrap: infrastructure, message groups, partitions, registration.
 */
class BootstrapService extends EventEmitter {
  /**
   * Create a new BootstrapService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.dataDirectoryManager - DataDirectoryManager instance.
   */
  constructor(options = {}) {
    super();

    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: 'BootstrapService',
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_SERVICE,
    });
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.wsPort = options.wsPort || null;
    this.config = {...BOOTSTRAP_DEFAULT, ...options.config};
    this.config.replicaStaggerDelayMs = Number.isFinite(this.config.replicaStaggerDelayMs) ?
      Math.max(NUM.ZERO, this.config.replicaStaggerDelayMs) :
      BOOTSTRAP_DEFAULT.replicaStaggerDelayMs;
    this.config.maxConcurrentServiceActions = Number.isFinite(
      this.config.maxConcurrentServiceActions,
    ) ?
      Math.max(NUM.ONE, Math.floor(this.config.maxConcurrentServiceActions)) :
      BOOTSTRAP_DEFAULT.maxConcurrentServiceActions;
    this.config.replicaRegistrationTraceEnabled = Boolean(
      this.config.replicaRegistrationTraceEnabled,
    );
    this.nodeReadyRebalanceDelayMs = Number.isFinite(
      this.config.nodeReadyRebalanceDelayMs,
    ) ?
      Math.max(NUM.ZERO, this.config.nodeReadyRebalanceDelayMs) :
      BOOTSTRAP_REBALANCE_DELAY_MS;
    this.dataDirectoryManager = options.dataDirectoryManager || null;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler({
        maxConcurrent: this.config.maxConcurrentServiceActions,
        reservedClassASlots: NUM.ONE,
      });

    // Services created during bootstrap
    this.messageGroupServices = new Map();
    this.partitionServices = new Map();
    this.transport = null;
    // MessageRouter for unified local/remote message routing
    this.messageRouter = null;
    // Track message group replicas for deferred election start
    this.messageGroupReplicas = [];
    // Track partition replicas for deferred election start
    this.partitionReplicas = [];
    // Unified lifecycle desired-state descriptors for bootstrap-created services.
    this.bootstrapDesiredServiceDefinitions = new Map();
    // Replica creation options keyed by canonical serviceId.
    this.bootstrapReplicaOptionsByServiceId = new Map();
    // Unified lifecycle owners for hard-cutover startup orchestration.
    this.serviceLifecycleManager = null;
    this.serviceReconciler = null;
    // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
    this.replicaHandler = null;

    // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null;

    // Decomposed control plane services
    this.heartbeatService = null;
    this.leaseService = null;
    this.endpointService = null;
    this.dispatchService = null;
    this.rebalanceCoordinator = null;
    this.controlPlaneBackgroundWritersActivated = false;
    this.messageGroupServiceHandlerRegistered = false;
    this.messageGroupServiceEndpointsPublished = false;

    // Unified runtime ownership wiring.
    const runtimeWiring = createRuntimeStartupWiring({
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.runtimeDriverRegistry = runtimeWiring.runtimeDriverRegistry;
    this.serviceRuntimeLifecycle = runtimeWiring.serviceRuntimeLifecycle;
    this.runtimeDrivers = runtimeWiring.drivers;

    // CDC integration service for system table writes
    this.cdcIntegrationService = null;
    this.systemTableWriter = null;

    // RPC client for control plane dispatch
    this.rpcClient = null;

    // System table cache reference
    this.systemTableCache = null;
    // Table policy service for partition placement decisions
    this.tablePolicyService = null;
    // Latency topology owner bundle
    this.latencyTopology = null;

    // Assignment epoch manager for epoch-based partition assignments
    // Requirements: 3.4, 4.1 - Epoch-based initialization
    this.epochManager = null;

    // Bootstrap state
    this.phase = BootstrapPhase.NOT_STARTED;
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    });
    this.startTime = null;
    this.phaseStartTime = null;
    this.servicesCreated = NUM.ZERO;
    this.partitionsCreated = NUM.ZERO;
    this.messageGroupsCreated = NUM.ZERO;

    // Node-ready rebalance dedupe state.
    this.rebalanceTriggeredNodeIds = new Set();
    this.pendingNodeReadyRebalanceTimers = new Map();
    this.nodeReadyRebalanceRetryEligibleNodeIds = new Set();

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);
    this.logger.debug(BootstrapLog.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: 'createRuntimeStartupWiring',
      runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.seedPhaseOwners = createSeedPhaseOwners(this);
    this.partitionReplicaProgressReporter = new ReplicaCreationProgressReporter({
      logger: this.logger,
      formatLine: (progress, status, error) =>
        this.formatPartitionReplicaProgressLine(progress, status, error),
      buildContext: (progress, status, error) =>
        this.buildPartitionReplicaProgressContext(progress, status, error),
    });

    // Error tracking
    this.lastError = null;
    this.cleanupRequired = false;
    this.isShuttingDown = false;
    this.shutdownPromise = null;

    // Build delegates for extracted phase modules
    const seedDelegates = this._buildSeedDelegates();
    this.seedInfrastructurePhase = new SeedInfrastructurePhase({
      delegates: seedDelegates,
    });
    this.seedMessageGroupsPhase = new SeedMessageGroupsPhase({
      delegates: seedDelegates,
    });
    this.seedPartitionsPhase = new SeedPartitionsPhase({
      delegates: seedDelegates,
    });
    this.seedRegistrationPhase = new SeedRegistrationPhase({
      delegates: seedDelegates,
    });
    this.seedCacheHydrationPhase = new SeedCacheHydrationPhase({
      delegates: seedDelegates,
    });
    this.seedCleanupHandler = new SeedCleanupHandler({
      delegates: seedDelegates,
    });
  }

  /**
   * Build the delegates object shared by all extracted seed phase
   * modules. Each delegate is a thin accessor/mutator into
   * BootstrapService instance state.
   * @return {Object}
   * @private
   */
  _buildSeedDelegates() {
    const self = this;
    return {
      // -- Accessors --
      getNodeId: () => self.nodeId,
      getNodeAddress: () => self.nodeAddress,
      getWsPort: () => self.wsPort,
      getConfig: () => self.config,
      getLogger: () => self.logger,
      getPhase: () => self.phase,
      getStartTime: () => self.startTime,
      getServicesCreated: () => self.servicesCreated,
      getPartitionsCreated: () => self.partitionsCreated,
      getMessageGroupsCreated: () => self.messageGroupsCreated,
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getMessageGroupServices: () => self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getMessageGroupReplicas: () => self.messageGroupReplicas,
      getPartitionReplicas: () => self.partitionReplicas,
      getServiceLifecycleManager: () =>
        self.serviceLifecycleManager,
      getServiceReconciler: () => self.serviceReconciler,
      getServiceRuntimeLifecycle: () =>
        self.serviceRuntimeLifecycle,
      getBootstrapDesiredServiceDefinitions: () =>
        self.bootstrapDesiredServiceDefinitions,
      getBootstrapReplicaOptionsByServiceId: () =>
        self.bootstrapReplicaOptionsByServiceId,
      getLeaderMessageGroupService: () =>
        self.getLeaderMessageGroupService(),
      getSystemTableCache: () => self.getSystemTableCache(),
      getSystemTableCacheRef: () => self.systemTableCache,
      getSystemTableCacheSafe: () =>
        self._getSystemTableCacheSafe(),
      getCdcIntegrationService: () =>
        self.cdcIntegrationService,
      getEpochManager: () => self.epochManager,
      getRebalanceCoordinator: () => self.rebalanceCoordinator,
      getLatencyTopology: () => self.latencyTopology,
      getSystemTableWriter: () => self.systemTableWriter,
      getTablePolicyService: () => self.tablePolicyService,
      getLifecycleStateMachine: () =>
        self.lifecycleStateMachine,
      getPartitionReplicaProgressReporter: () =>
        self.partitionReplicaProgressReporter,
      getInitialMessageGroupId: () => INITIAL_MESSAGE_GROUP_ID,

      // -- Mutators --
      setNodeId: (v) => {
        self.nodeId = v;
      },
      setNodeAddress: (v) => {
        self.nodeAddress = v;
      },
      setMessageRouter: (v) => {
        self.messageRouter = v;
      },
      setTransport: (v) => {
        self.transport = v;
      },
      setServiceLifecycleManager: (v) => {
        self.serviceLifecycleManager = v;
      },
      setServiceReconciler: (v) => {
        self.serviceReconciler = v;
      },
      setPhase: (v) => {
        self.phase = v;
      },
      setLastError: (v) => {
        self.lastError = v;
      },
      setPartitionsCreated: (v) => {
        self.partitionsCreated = v;
      },
      setEpochManager: (v) => {
        self.epochManager = v;
      },
      setSystemTableCacheRef: (v) => {
        self.systemTableCache = v;
      },
      setSystemTableWriter: (v) => {
        self.systemTableWriter = v;
      },
      setCdcIntegrationService: (v) => {
        self.cdcIntegrationService = v;
      },
      setRpcClient: (v) => {
        self.rpcClient = v;
      },
      setTablePolicyService: (v) => {
        self.tablePolicyService = v;
      },
      setLatencyTopology: (v) => {
        self.latencyTopology = v;
      },
      setIsShuttingDown: (v) => {
        self.isShuttingDown = v;
      },
      incrementServicesCreated: () => {
        self.servicesCreated++;
      },
      incrementMessageGroupsCreated: () => {
        self.messageGroupsCreated++;
      },

      // -- Collection mutators --
      resetMessageGroupReplicas: () => {
        self.messageGroupReplicas = [];
      },
      pushMessageGroupReplica: (v) => {
        self.messageGroupReplicas.push(v);
      },
      filterMessageGroupReplicas: (exclude) => {
        self.messageGroupReplicas =
          self.messageGroupReplicas.filter(
            (s) => s !== exclude,
          );
      },
      resetPartitionReplicas: () => {
        self.partitionReplicas = [];
      },
      pushPartitionReplica: (v) => {
        self.partitionReplicas.push(v);
      },
      filterPartitionReplicas: (exclude) => {
        self.partitionReplicas =
          self.partitionReplicas.filter(
            (s) => s !== exclude,
          );
      },

      // -- Delegation to phase helpers --
      createBootstrapServiceDescriptor: (serviceType, serviceId) =>
        self.createBootstrapServiceDescriptor(
          serviceType, serviceId,
        ),
      queueBootstrapServiceReplica: (descriptor, options) =>
        self.queueBootstrapServiceReplica(
          descriptor, options,
        ),
      resolveBootstrapReplicaOptions: (serviceId, serviceType) =>
        self.seedInfrastructurePhase
          .resolveBootstrapReplicaOptions(
            serviceId, serviceType,
          ),
      triggerBootstrapReconciler: (reason) =>
        self.triggerBootstrapReconciler(reason),
      createBootstrapMessageGroupReplica: (context) =>
        self.createBootstrapMessageGroupReplica(context),
      startBootstrapMessageGroupReplica: (handle, context) =>
        self.startBootstrapMessageGroupReplica(
          handle, context,
        ),
      stopBootstrapMessageGroupReplica: (handle, context) =>
        self.stopBootstrapMessageGroupReplica(
          handle, context,
        ),
      createBootstrapPartitionReplica: (context) =>
        self.createBootstrapPartitionReplica(context),
      startBootstrapPartitionReplica: (handle, context) =>
        self.startBootstrapPartitionReplica(
          handle, context,
        ),
      stopBootstrapPartitionReplica: (handle, context) =>
        self.stopBootstrapPartitionReplica(
          handle, context,
        ),
      waitForMessageGroupLeadership: (groupId, replicaIds) =>
        self.seedMessageGroupsPhase
          .waitForMessageGroupLeadership(groupId, replicaIds),
      waitForPartitionLeadership: () =>
        self.seedPartitionsPhase.waitForPartitionLeadership(),
      stopUnifiedLifecycleOwners: () =>
        self.stopUnifiedLifecycleOwners(),
      swapSystemTableWriter: () =>
        self.seedRegistrationPhase.swapSystemTableWriter(),
      ensureBootstrapCdcIntegrationService: () =>
        self.seedCacheHydrationPhase
          .ensureBootstrapCdcIntegrationService(),
      handleNodeReadyRebalanceTrigger: (cdcEvent, prevRow) =>
        self.handleNodeReadyRebalanceTrigger(cdcEvent, prevRow),
      propagatePartitionCDCEvent: (mgs, cdcEvent) =>
        self.propagatePartitionCDCEvent(mgs, cdcEvent),
      resolveCdcPropagationMessageGroup: (preferred) =>
        self.resolveCdcPropagationMessageGroup(preferred),
      applyCurrentEpochFromCache: () =>
        self.seedCacheHydrationPhase
          .applyCurrentEpochFromCache(),
      hydrateFromLocalPartitions: (stc, mg) =>
        self.hydrateFromLocalPartitions(stc, mg),
      createCdcPipelineReadinessGate: (stc) =>
        self.createCdcPipelineReadinessGate(stc),
      emit: (event, data) => self.emit(event, data),
      sleep: (ms) => self.sleep(ms),

      // -- Partition DB path resolution --
      resolvePartitionDbPath: (partitionId, replicaId) => {
        if (self.dataDirectoryManager &&
            self.dataDirectoryManager.isInitialized()) {
          return self.dataDirectoryManager.getPartitionDbPath(
            partitionId, replicaId,
          );
        } else if (self.config.partitionDbPath) {
          return self.config.partitionDbPath;
        }
        return BOOTSTRAP_DEFAULT.partitionDbPath;
      },

      // -- Cleanup helpers --
      clearCdcIntegrationService: () => {
        self.cdcIntegrationService = null;
      },
      stopAndClearControlPlaneServices: () => {
        if (self.heartbeatService) {
          self.heartbeatService.stop();
          self.heartbeatService = null;
        }
        if (self.leaseService) {
          self.leaseService.stop();
          self.leaseService = null;
        }
        if (self.endpointService) {
          self.endpointService.stop();
          self.endpointService = null;
        }
        if (self.dispatchService) {
          self.dispatchService.stop();
          self.dispatchService = null;
        }
      },
      clearRpcClient: async () => {
        if (self.rpcClient) {
          await self.rpcClient.shutdown();
          self.rpcClient = null;
        }
      },
      clearReplicaStateMachine: () => {
        if (self.replicaStateMachine) {
          self.replicaStateMachine.stopTimeoutChecker();
          self.replicaStateMachine.clear();
          self.replicaStateMachine = null;
        }
      },
      clearEpochManager: () => {
        self.epochManager = null;
      },
      clearReplicaHandler: async () => {
        if (self.replicaHandler) {
          self.replicaHandler.unregisterFromRouter(
            self.messageRouter,
          );
          await self.replicaHandler.shutdown();
          self.replicaHandler = null;
        }
      },
      clearTablePolicyService: () => {
        self.tablePolicyService = null;
      },
      clearRebalanceCoordinator: () => {
        self.rebalanceCoordinator = null;
      },
      clearNodeReadyRebalanceState: () => {
        self.clearNodeReadyRebalanceState();
      },
    };
  }

  /**
   * Execute the full bootstrap process.
   * @return {Promise<Object>} Bootstrap result.
   */
  async bootstrap() {
    this.startTime = Date.now();

    this.logger.info(BootstrapLog.STARTING, {
      nodeId: this.nodeId,
      phase: BootstrapPhase.NOT_STARTED,
    });

    try {
      const startupPipelineRunner = new StartupPipelineRunner({
        logger: this.logger,
        eventSink: this,
      });
      const seedPlan = createSeedStartupPlan(this);
      await startupPipelineRunner.run({
        phases: seedPlan.phases,
      });

      this.logger.info('metrics.bootstrap.post_pipeline.start', {
        nodeId: this.nodeId,
      });

      // Initialize replica handler after all services are ready
      const replicaHandlerStartMs = Date.now();
      this.initializeReplicaHandler();
      this.logger.info('metrics.bootstrap.post_pipeline.replica_handler', {
        nodeId: this.nodeId,
        durationMs: Date.now() - replicaHandlerStartMs,
      });

      const messageGroupHandlerStartMs = Date.now();
      this.initializeMessageGroupServiceHandler();
      this.messageGroupServiceHandlerRegistered = true;
      this.logger.info('metrics.bootstrap.post_pipeline.message_group_handler', {
        nodeId: this.nodeId,
        durationMs: Date.now() - messageGroupHandlerStartMs,
      });

      // Initialize control plane service after cache and handlers are ready
      const controlPlaneStartMs = Date.now();
      await this.initializeControlPlaneService();
      this.logger.info('metrics.bootstrap.post_pipeline.control_plane', {
        nodeId: this.nodeId,
        durationMs: Date.now() - controlPlaneStartMs,
      });

      const registerSeedStartMs = Date.now();
      await this.registerSeedNodeWithControlPlane();
      this.logger.info('metrics.bootstrap.post_pipeline.seed_registration', {
        nodeId: this.nodeId,
        durationMs: Date.now() - registerSeedStartMs,
      });
      await this.activateMessageGroupServiceRows();

      // Start latency topology lifecycle asynchronously so REST bootstrap API
      // can come up without being blocked by topology/rebalancer warm-up.
      const topologyStartMs = Date.now();
      const startTopologyAsync = () => {
        try {
          this.startLatencyTopologyLifecycle();
          this.logger.info('metrics.bootstrap.post_pipeline.latency_topology', {
            nodeId: this.nodeId,
            durationMs: Date.now() - topologyStartMs,
            deferred: true,
          });
        } catch (error) {
          this.logger.warn('Deferred latency topology lifecycle start failed', {
            nodeId: this.nodeId,
            error: error.message,
          });
        }
      };
      if (typeof setImmediate === 'function') {
        setImmediate(startTopologyAsync);
      } else {
        setTimeout(startTopologyAsync, 0);
      }

      // Initialize runtime service handler AFTER control-plane readiness.
      // PG wire startup failure is isolated and does not abort bootstrap.
      const runtimeHandlerStartMs = Date.now();
      this.initializeRuntimeServiceHandler();
      this.logger.info('metrics.bootstrap.post_pipeline.runtime_handler', {
        nodeId: this.nodeId,
        durationMs: Date.now() - runtimeHandlerStartMs,
      });

      // Bootstrap complete
      const currentState = this.lifecycleStateMachine.getState();
      if (currentState !== NodeState.CONNECTING) {
        // Terminal sub-phase auto-advances to CONNECTING,
        // but if it hasn't happened yet, force it
        this.lifecycleStateMachine.transition(NodeState.CONNECTING);
      }
      this.phase = BootstrapPhase.COMPLETE;
      this.activateControlPlaneBackgroundWriters();
      const duration = Date.now() - this.startTime;

      this.logger.info(BootstrapLog.COMPLETED, {
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
      });

      this.emit(BootstrapEvent.COMPLETE, {
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
      });

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        messageGroupServices: this.messageGroupServices,
        partitionServices: this.partitionServices,
        replicaHandler: this.replicaHandler,
        replicaStateMachine: this.replicaStateMachine,
        epochManager: this.epochManager,
        transport: this.transport,
        messageRouter: this.messageRouter,
      };
    } catch (error) {
      return this.handleBootstrapFailure(error);
    }
  }

  /**
   * Execute a bootstrap phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    const subPhase = PHASE_TO_SUB_PHASE[phaseName];
    if (subPhase) {
      const currentSubPhase =
        this.lifecycleStateMachine.getSubPhase();
      if (currentSubPhase !== subPhase) {
        this.lifecycleStateMachine.transitionSubPhase(subPhase);
      }
    }
    this.phase = phaseName;
    this.phaseStartTime = Date.now();

    this.logger.info(BootstrapLog.PHASE_STARTING, {
      nodeId: this.nodeId,
      phase: phaseName,
      servicesCreated: this.servicesCreated,
    });

    this.emit(BootstrapEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
    });
    this.emit('phase:start', {
      phase: phaseName,
      nodeId: this.nodeId,
    });

    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });

      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.info(BootstrapLog.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        servicesCreated: this.servicesCreated,
      });

      this.emit(BootstrapEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
      });
      this.emit('phase:complete', {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.error(BootstrapLog.PHASE_FAILED, {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit(BootstrapEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
        error: error.message,
      });
      this.emit('phase:failed', {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Build a canonical unified descriptor for bootstrap-managed replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  createBootstrapServiceDescriptor(serviceType, serviceId) {
    return this.seedInfrastructurePhase
      .createBootstrapServiceDescriptor(serviceType, serviceId);
  }

  /**
   * Queue a bootstrap replica in desired state and option catalogs.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   * @private
   */
  queueBootstrapServiceReplica(descriptor, options) {
    return this.seedInfrastructurePhase
      .queueBootstrapServiceReplica(descriptor, options);
  }

  /**
   * Resolve bootstrap replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   * @private
   */
  resolveBootstrapReplicaOptions(serviceId, serviceType) {
    return this.seedInfrastructurePhase
      .resolveBootstrapReplicaOptions(serviceId, serviceType);
  }

  /**
   * Build local actual-state rows for bootstrap service reconciliation.
   * @return {Object[]}
   * @private
   */
  buildBootstrapActualStateRows() {
    return this.seedInfrastructurePhase
      .buildBootstrapActualStateRows();
  }

  /**
   * Initialize unified lifecycle owners for bootstrap orchestration.
   * @return {Promise<void>}
   * @private
   */
  async initializeUnifiedLifecycleOwners() {
    return this.seedInfrastructurePhase
      .initializeUnifiedLifecycleOwners();
  }

  /**
   * Trigger one bootstrap reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async triggerBootstrapReconciler(reason) {
    return this.seedInfrastructurePhase
      .triggerBootstrapReconciler(reason);
  }

  /**
   * Stop unified lifecycle owners and clear bootstrap desired-state catalogs.
   * @return {void}
   * @private
   */
  stopUnifiedLifecycleOwners() {
    return this.seedInfrastructurePhase
      .stopUnifiedLifecycleOwners();
  }

  /**
   * Unified lifecycle create hook for message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createBootstrapMessageGroupReplica(context) {
    return this.seedMessageGroupsPhase
      .createBootstrapMessageGroupReplica(context);
  }

  /**
   * Unified lifecycle start hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startBootstrapMessageGroupReplica(replicaHandle, _context) {
    return this.seedMessageGroupsPhase
      .startBootstrapMessageGroupReplica(replicaHandle, _context);
  }

  /**
   * Unified lifecycle stop hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopBootstrapMessageGroupReplica(replicaHandle, _context) {
    return this.seedMessageGroupsPhase
      .stopBootstrapMessageGroupReplica(replicaHandle, _context);
  }

  /**
   * Unified lifecycle create hook for partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createBootstrapPartitionReplica(context) {
    return this.seedPartitionsPhase
      .createBootstrapPartitionReplica(context);
  }

  /**
   * Unified lifecycle start hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startBootstrapPartitionReplica(replicaHandle, _context) {
    return this.seedPartitionsPhase
      .startBootstrapPartitionReplica(replicaHandle, _context);
  }

  /**
   * Unified lifecycle stop hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopBootstrapPartitionReplica(replicaHandle, _context) {
    return this.seedPartitionsPhase
      .stopBootstrapPartitionReplica(replicaHandle, _context);
  }

  /**
   * Compatibility shim for deferred election activation during bootstrap.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @return {Promise<void>}
   * @private
   */
  async startDeferredBootstrapReplicaElections() {
    return this.seedPartitionsPhase
      .startDeferredBootstrapReplicaElections();
  }

  /**
   * Phase 1: Infrastructure setup.
   * @return {Promise<void>}
   * @private
   */
  async phaseInfrastructure() {
    return this.seedInfrastructurePhase.phaseInfrastructure();
  }


  /**
   * Phase 2: Message group creation.
   * @return {Promise<void>}
   * @private
   */
  async phaseMessageGroups() {
    return this.seedMessageGroupsPhase.phaseMessageGroups();
  }

  /**
   * Wait for message group leadership to be established.
   * Implements exponential backoff up to 30 seconds.
   * @param {string} groupId - Message group ID.
   * @param {Array<string>} replicaIds - Replica IDs.
   * @return {Promise<void>}
   * @private
   */
  async waitForMessageGroupLeadership(groupId, replicaIds) {
    return this.seedMessageGroupsPhase
      .waitForMessageGroupLeadership(groupId, replicaIds);
  }

  /**
   * Wait for all system table partitions to establish leadership.
   * This ensures writes can succeed during the registration phase.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeadership() {
    return this.seedPartitionsPhase.waitForPartitionLeadership();
  }

  /**
   * Wait for system leadership info to appear in the system cache.
   * Ensures leaders and leader_node_id values are present before seeding.
   * @return {Promise<void>}
   * @private
   */
  async waitForSystemServiceLeadersInCache() {
    return this.seedCacheHydrationPhase
      .waitForSystemServiceLeadersInCache();
  }

  /**
   * Wait for a node to appear as ready in the system table cache.
   * Ensures ready node list is usable by joining nodes.
   * @param {string} nodeId - Node ID to verify.
   * @return {Promise<void>}
   * @private
   */
  async waitForReadyNodeInCache(nodeId) {
    return this.seedCacheHydrationPhase
      .waitForReadyNodeInCache(nodeId);
  }

  /**
   * Repair propagated cache tables from authoritative local partition reads.
   * This closes CDC visibility holes that can otherwise leave the seed node
   * with a stale cache long after durable control-plane writes committed.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async repairPropagatedCacheTablesFromLocalPartitions(options = {}) {
    return this.seedCacheHydrationPhase
      .repairPropagatedCacheTablesFromLocalPartitions(options);
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds - Partition IDs to check.
   * @return {Set<string>} Partition IDs that have leaders.
   * @private
   */
  checkPartitionLeaders(partitionIds) {
    return this.seedPartitionsPhase
      .checkPartitionLeaders(partitionIds);
  }

  /**
   * Ensure CDC integration service is initialized for bootstrap writes.
   * @return {CDCIntegrationService} CDC integration service.
   * @private
   */
  ensureBootstrapCdcIntegrationService() {
    return this.seedCacheHydrationPhase
      .ensureBootstrapCdcIntegrationService();
  }

  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   * @private
   */
  ensureLatencyTopologyOwners() {
    return this.seedCacheHydrationPhase
      .ensureLatencyTopologyOwners();
  }

  /**
   * Start latency topology lifecycle owners.
   * Runs assignment lifecycle without blocking bootstrap readiness.
   * @private
   */
  startLatencyTopologyLifecycle() {
    return this.seedCacheHydrationPhase
      .startLatencyTopologyLifecycle();
  }

  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   * @private
   */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    return this.seedCacheHydrationPhase
      .propagatePartitionCDCEvent(messageGroupService, cdcEvent);
  }

  /**
   * Ensure system table writer is initialized for bootstrap writes.
   * @return {BootstrapSystemTableWriter|RoutedSqlSystemTableWriter}
   * @private
   */
  ensureSystemTableWriter() {
    return this.seedRegistrationPhase.ensureSystemTableWriter();
  }

  /**
   * Swap writer to routed SQL implementation once cache is hydrated.
   * @private
   */
  swapSystemTableWriter() {
    return this.seedRegistrationPhase.swapSystemTableWriter();
  }

  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first message group service that is a leader, or any available service.
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService() {
    return this.seedMessageGroupsPhase
      .getLeaderMessageGroupService();
  }

  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current local leader when available and falls back to
   * the captured message-group service.
   * @param {Object|null} preferredMessageGroupService
   * @return {Object|null}
   */
  resolveCdcPropagationMessageGroup(preferredMessageGroupService) {
    return this.seedCacheHydrationPhase
      .resolveCdcPropagationMessageGroup(
        preferredMessageGroupService,
      );
  }

  /**
   * Start progress reporting for one partition replica creation.
   * @param {Object} details - Replica progress details.
   * @return {Object} Reporter progress context.
   * @private
   */
  startPartitionReplicaProgress(details) {
    return this.seedPartitionsPhase
      .startPartitionReplicaProgress(details);
  }

  /**
   * Update partition creation progress based on stage callbacks.
   * @param {Object|null} progress - Reporter progress context.
   * @param {Object} stageEvent - Stage event from PartitionService.
   * @private
   */
  updatePartitionReplicaProgress(progress, stageEvent) {
    return this.seedPartitionsPhase
      .updatePartitionReplicaProgress(progress, stageEvent);
  }

  /**
   * Complete partition creation progress reporting.
   * @param {Object|null} progress - Reporter progress context.
   * @private
   */
  finishPartitionReplicaProgress(progress) {
    return this.seedPartitionsPhase
      .finishPartitionReplicaProgress(progress);
  }

  /**
   * Fail partition creation progress reporting.
   * @param {Object|null} progress - Reporter progress context.
   * @param {Error|string|null} error - Failure reason.
   * @private
   */
  failPartitionReplicaProgress(progress, error) {
    return this.seedPartitionsPhase
      .failPartitionReplicaProgress(progress, error);
  }

  /**
   * Format one partition creation progress line.
   * @param {Object} progress - Reporter progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {string} Formatted progress line.
   * @private
   */
  formatPartitionReplicaProgressLine(progress, status, error) {
    return this.seedPartitionsPhase
      .formatPartitionReplicaProgressLine(
        progress, status, error,
      );
  }

  /**
   * Build structured context for non-interactive partition progress logs.
   * @param {Object} progress - Reporter progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @return {Object} Structured context object.
   * @private
   */
  buildPartitionReplicaProgressContext(progress, status = null, error = null) {
    return this.seedPartitionsPhase
      .buildPartitionReplicaProgressContext(
        progress, status, error,
      );
  }

  /**
   * Normalize replica creation errors for display.
   * @param {Error|string|null} error - Error value.
   * @return {string} Error message.
   * @private
   */
  formatReplicaCreationError(error) {
    return this.seedPartitionsPhase
      .formatReplicaCreationError(error);
  }

  /**
   * Get the AssignmentEpochManager instance.
   * Returns the epoch manager created during bootstrap for epoch-based
   * partition assignment coordination.
   * Requirements: 3.4, 4.1 - Epoch-based initialization
   * @return {AssignmentEpochManager|null} The epoch manager or null if not initialized.
   */
  getEpochManager() {
    return this.epochManager;
  }

  /**
   * Phase 3: Partition creation for system tables.
   * @return {Promise<void>}
   * @private
   */
  async phasePartitions() {
    return this.seedPartitionsPhase.phasePartitions();
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch.
   * Creates epoch 0 with all partition assignments from the seed node.
   * Requirements: 3.4, 4.1 - Epoch-based initialization
   * @private
   */
  async initializeEpochManager() {
    return this.seedPartitionsPhase.initializeEpochManager();
  }

  /**
   * Load persisted assignment epoch from the local config partition if present.
   * @return {Promise<AssignmentEpoch|null>} Persisted epoch or null when absent.
   * @private
   */
  async loadPersistedEpochFromLocalConfigPartition() {
    return this.seedPartitionsPhase
      .loadPersistedEpochFromLocalConfigPartition();
  }

  /**
   * Apply authoritative epoch from the current cache snapshot.
   * @private
   */
  applyCurrentEpochFromCache() {
    return this.seedCacheHydrationPhase
      .applyCurrentEpochFromCache();
  }

  /**
   * Subscribe message groups to CDC events from a partition.
   * @param {string} tableName - Table name.
   * @param {string} partitionId - Partition ID.
   * @param {Array<string>} replicaIds - Partition replica IDs.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToCDC(tableName, partitionId, replicaIds) {
    return this.seedCacheHydrationPhase
      .subscribeToCDC(tableName, partitionId, replicaIds);
  }

  /**
   * Subscribe to CDC for all initial system tables after cache hydration.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToInitialSystemTableCDC() {
    return this.seedCacheHydrationPhase
      .subscribeToInitialSystemTableCDC();
  }

  /**
   * Handle node state CDC and schedule one rebalance trigger per node-ready join.
   * @param {Object} cdcEvent - CDC event from nodes table.
   * @param {Object|null} previousNodeRow - Previous nodes table row from cache.
   * @return {boolean} True when a new rebalance trigger was scheduled.
   */
  handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow) {
    const rawNodeRow = cdcEvent?.data || null;
    const previousRow = previousNodeRow &&
      typeof previousNodeRow === 'object' ?
      previousNodeRow :
      {};
    const incomingRow = rawNodeRow &&
      typeof rawNodeRow === 'object' ?
      rawNodeRow :
      {};
    const nodeRow = {
      ...previousRow,
      ...incomingRow,
      node_id:
        incomingRow.node_id ??
        incomingRow.nodeId ??
        previousRow.node_id ??
        previousRow.nodeId ??
        null,
      status:
        incomingRow.status ??
        incomingRow.nodeStatus ??
        incomingRow.state ??
        incomingRow.lifecycle_state ??
        incomingRow.lifecycleState ??
        previousRow.status ??
        previousRow.nodeStatus ??
        previousRow.state ??
        previousRow.lifecycle_state ??
        previousRow.lifecycleState ??
        null,
      ready_lease_expires_at:
        incomingRow.ready_lease_expires_at ??
        incomingRow.readyLeaseExpiresAt ??
        incomingRow.readyLeaseExpiresAtMs ??
        incomingRow.readyLeaseExpires ??
        previousRow.ready_lease_expires_at ??
        previousRow.readyLeaseExpiresAt ??
        previousRow.readyLeaseExpiresAtMs ??
        previousRow.readyLeaseExpires ??
        null,
    };
    const nodeId = nodeRow?.node_id;
    if (!nodeId) {
      this.logger.info('Skipping node-ready rebalance trigger: missing node_id', {
        operation: cdcEvent?.operation || null,
      });
      return false;
    }

    const now = Date.now();
    if (isNodeHeartbeatWatermarkRegression(previousRow, incomingRow)) {
      this.logger.debug(
        'Skipping node-ready rebalance trigger: stale node liveness regression',
        {
          nodeId,
          operation: cdcEvent?.operation || null,
          previousReadyLeaseExpiresAt:
            previousRow.ready_lease_expires_at ??
            previousRow.readyLeaseExpiresAt ??
            null,
          incomingReadyLeaseExpiresAt:
            incomingRow.ready_lease_expires_at ??
            incomingRow.readyLeaseExpiresAt ??
            null,
          previousLastHeartbeat:
            previousRow.last_heartbeat ??
            previousRow.lastHeartbeat ??
            null,
          incomingLastHeartbeat:
            incomingRow.last_heartbeat ??
            incomingRow.lastHeartbeat ??
            null,
        },
      );
      return false;
    }
    const isReadyByWallClock = isNodeRecordReady(nodeRow, {now});
    const isReadyWhenWritten = wasNodeRecordReadyWhenWritten(nodeRow, {now});
    const isReady = isReadyByWallClock || isReadyWhenWritten;
    const wasReady = wasNodeRecordReadyWhenWritten(previousRow, {now});

    if (!isReady) {
      this.logger.info('Skipping node-ready rebalance trigger: node not ready', {
        nodeId,
        status: nodeRow.status || null,
        readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
        readyByWallClock: isReadyByWallClock,
        readyWhenWritten: isReadyWhenWritten,
        operation: cdcEvent?.operation || null,
      });
      const existingTimer = this.pendingNodeReadyRebalanceTimers.get(nodeId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.pendingNodeReadyRebalanceTimers.delete(nodeId);
        // The scheduled trigger did not fire; allow a future true transition
        // to schedule once the node becomes ready again.
        this.rebalanceTriggeredNodeIds.delete(nodeId);
      }
      this.nodeReadyRebalanceRetryEligibleNodeIds.delete(nodeId);
      return false;
    }

    const hasExistingTrigger = this.rebalanceTriggeredNodeIds.has(nodeId);
    const hasPendingTimer = this.pendingNodeReadyRebalanceTimers.has(nodeId);
    const retryEligible = this.nodeReadyRebalanceRetryEligibleNodeIds.has(nodeId);

    if (wasReady) {
      if (!retryEligible || hasExistingTrigger || hasPendingTimer) {
        this.logger.debug(
          'Skipping node-ready rebalance trigger: no not-ready to ready transition',
          {
            nodeId,
            status: nodeRow.status || null,
            readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
            operation: cdcEvent?.operation || null,
          },
        );
        return false;
      }

      this.logger.info(
        'Retrying node-ready rebalance trigger after previous cache-gated miss',
        {
          nodeId,
          reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          status: nodeRow.status || null,
          readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
          operation: cdcEvent?.operation || null,
        },
      );
    }

    if (this.rebalanceTriggeredNodeIds.has(nodeId)) {
      this.logger.info('Skipping node-ready rebalance trigger: already scheduled', {
        nodeId,
      });
      return false;
    }
    this.rebalanceTriggeredNodeIds.add(nodeId);

    if (this.pendingNodeReadyRebalanceTimers.has(nodeId)) {
      return false;
    }

    this.logger.info('Scheduling node-ready rebalance trigger', {
      nodeId,
      reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
      delayMs: this.nodeReadyRebalanceDelayMs,
      status: nodeRow.status || null,
      readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
    });

    const timer = setTimeout(() => {
      void this.executeNodeReadyRebalanceTrigger(nodeId);
    }, this.nodeReadyRebalanceDelayMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    this.pendingNodeReadyRebalanceTimers.set(nodeId, timer);
    return true;
  }

  /**
   * Execute one cache-gated node-ready rebalance trigger.
   * @param {string} nodeId - Node that transitioned to ready.
   * @return {Promise<void>}
   * @private
   */
  async executeNodeReadyRebalanceTrigger(nodeId) {
    this.pendingNodeReadyRebalanceTimers.delete(nodeId);

    try {
      await this.waitForReadyNodeInCache(nodeId);
    } catch (error) {
      this.nodeReadyRebalanceRetryEligibleNodeIds.add(nodeId);
      this.rebalanceTriggeredNodeIds.delete(nodeId);
      this.logger.warn(
        'Skipping node-ready rebalance trigger: node not ready in cache before timeout',
        {
          nodeId,
          reason: BOOTSTRAP_REBALANCE_REASON.NODE_READY,
          error: error.message,
        },
      );
      return;
    }

    this.nodeReadyRebalanceRetryEligibleNodeIds.delete(nodeId);
    this.triggerRebalancingOnAllPartitions(BOOTSTRAP_REBALANCE_REASON.NODE_READY);
  }

  /**
   * Clear all pending node-ready rebalance timers and dedupe state.
   */
  clearNodeReadyRebalanceState() {
    for (const timer of this.pendingNodeReadyRebalanceTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingNodeReadyRebalanceTimers.clear();
    this.rebalanceTriggeredNodeIds.clear();
    this.nodeReadyRebalanceRetryEligibleNodeIds.clear();
  }

  /**
   * Trigger rebalancing check on all partition leaders.
   * Called when a significant cluster event occurs.
   * @param {string} reason - Reason for triggering rebalancing.
   * @private
   */
  triggerRebalancingOnAllPartitions(reason) {
    this.logger.info(BootstrapLog.REBALANCE_TRIGGER, {
      reason,
      partitionCount: this.partitionServices.size,
    });

    for (const partition of this.partitionServices.values()) {
      if (partition.isLeader) {
        partition.triggerRebalanceCheck(reason);
      }
    }
  }

  /**
   * Phase 4: Service registration.
   * Register all services in system tables.
   * Uses bootstrap mode to write directly to local partitions, bypassing SQL routing.
   * Requirements: 8.6 - Enable bootstrap mode before writes, disable after completion.
   * @return {Promise<void>}
   * @private
   */
  async phaseRegistration() {
    return this.seedRegistrationPhase.phaseRegistration();
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroup(now) {
    return this.seedRegistrationPhase.registerMessageGroup(now);
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerServices(now) {
    return this.seedRegistrationPhase.registerServices(now);
  }

  async activateMessageGroupServiceRows() {
    return activateMessageGroupServiceRows({
      nodeId: this.nodeId,
      systemTableWriter: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      handlerRegistered: this.messageGroupServiceHandlerRegistered,
      endpointsPublished: this.messageGroupServiceEndpointsPublished,
      messageGroupServices: this.messageGroupServices,
    });
  }

  /**
   * Register built-in runtime service definitions.
   * @return {Promise<void>}
   * @private
   */
  async registerMetaServiceDefinitions() {
    return this.seedRegistrationPhase
      .registerMetaServiceDefinitions();
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerSystemTables(now) {
    return this.seedRegistrationPhase
      .registerSystemTables(now);
  }

  /**
   * Update partition sizes in the partitions table.
   * @return {Promise<void>}
   * @private
   */
  async updatePartitionSizes() {
    return this.seedRegistrationPhase.updatePartitionSizes();
  }

  /**
   * Seed dynamic configuration into the config system table.
   * @return {Promise<void>}
   * @private
   */
  async seedDynamicConfiguration() {
    return this.seedRegistrationPhase
      .seedDynamicConfiguration();
  }

  /**
   * Persist the authoritative assignment epoch.
   * @return {Promise<void>}
   * @private
   */
  async persistCurrentEpochIfMissing() {
    return this.seedRegistrationPhase
      .persistCurrentEpochIfMissing();
  }

  /**
   * Phase 5: Cache hydration.
   * @return {Promise<void>}
   * @private
   */
  async phaseCacheHydration() {
    return this.seedCacheHydrationPhase
      .phaseCacheHydration();
  }

  /**
   * Hydrate cache by reading directly from local partition services.
   * This bypasses SQL routing since cache is empty during hydration.
   * Requirements: 7.3, 7.4
   * @param {Object} systemTableCache - System table cache.
   * @param {Object} leaderMessageGroup - Leader message group for CDC events.
   * @return {Promise<Object>} Hydration result.
   * @private
   */
  async hydrateFromLocalPartitions(
    systemTableCache, leaderMessageGroup,
  ) {
    return this.seedCacheHydrationPhase
      .hydrateFromLocalPartitions(
        systemTableCache, leaderMessageGroup,
      );
  }

  /**
   * Verify cache hydration completed successfully.
   * Checks that all expected system tables are populated.
   * Requirements: 7.5
   * @param {Object} systemTableCache - System table cache.
   * @param {Object} result - Hydration result.
   * @private
   */
  verifyCacheHydration(systemTableCache, result) {
    return this.seedCacheHydrationPhase
      .verifyCacheHydration(systemTableCache, result);
  }

  /**
   * Count total rows hydrated across all tables.
   * @param {Object} result - Hydration result.
   * @return {number} Total row count.
   * @private
   */
  countTotalRows(result) {
    return this.seedCacheHydrationPhase
      .countTotalRows(result);
  }

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
  }

  /**
   * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
   * @private
   */
  initializeReplicaHandler() {
    const messageGroupService = this.getLeaderMessageGroupService();

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
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);
      this.servicesCreated++;

      const tableName = options.tableName;
      if (
        tableName &&
        messageGroupService &&
        shouldAttachPartitionCdcPropagation(tableName)
      ) {
        await messageGroupService.subscribeToCDC(tableName);

        const subscriberId = [
          'bootstrap',
          this.nodeId,
          tableName,
          options.replicaId,
          messageGroupService?.groupId || 'message-group',
        ].join(':');
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(BootstrapLog.CDC_DYNAMIC_PARTITION_EVENT, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              partitionId: options.partitionId,
              replicaId: options.replicaId,
            });
            const propagationMessageGroupService =
              this.resolveCdcPropagationMessageGroup(messageGroupService);
            if (!propagationMessageGroupService) {
              this.logger.warn(
                CDC_LIFECYCLE_LOG_MSG.MESSAGE_GROUP_RESOLUTION_NULL, {
                  tableName: cdcEvent.tableName,
                  operation: cdcEvent.operation,
                  reason: 'no_leader_message_group',
                },
              );
              return;
            }

            await this.propagatePartitionCDCEvent(
              propagationMessageGroupService,
              cdcEvent,
            );

            if (tableName === TABLES.CONFIG) {
              this.applyCurrentEpochFromCache();
            }
          }
        };
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
    this.logger.info('Bootstrap replica-handler partition registration summary', {
      nodeId: this.nodeId,
      durationMs: Date.now() - partitionRegistrationStartedAt,
      attemptedCount: partitionRegistrationSummary.attemptedCount,
      registeredCount: partitionRegistrationSummary.registeredCount,
      skippedCount: partitionRegistrationSummary.skippedCount,
      totalPartitions: partitionRegistrationSummary.totalPartitions,
    });

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
    this.logger.info('Bootstrap replica-handler state registration summary', {
      nodeId: this.nodeId,
      durationMs: Date.now() - stateRegistrationStartedAt,
      attemptedCount: stateRegistrationSummary.attemptedCount,
      registeredCount: stateRegistrationSummary.registeredCount,
      skippedCount: stateRegistrationSummary.skippedCount,
      pendingPersistCount: stateRegistrationSummary.pendingPersistCount,
      expectedPersistCount: stateRegistrationSummary.expectedPersistCount,
      persistErrorCount: stateRegistrationSummary.persistErrorCount,
    });

    this.logger.info(BootstrapLog.REPLICA_HANDLER_READY, {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
      registeredPartitions: this.partitionServices.size,
    });
  }

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
    this.logger.info('Starting bootstrap partition registration with replica handler', {
      nodeId: this.nodeId,
      totalPartitions,
    });
    writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_START, {
      nodeId: this.nodeId,
      totalPartitions,
    });

    for (const [replicaId, partition] of partitions) {
      attemptedCount++;
      if (!partition || typeof partition !== 'object') {
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
          error: 'Partition service missing during replica-handler registration',
        });
        continue;
      }

      try {
        writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ATTEMPT, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
          partitionId: partition.partitionId || null,
        });
        replicaHandler.registerExistingReplica({
          replicaId: replicaId,
          partitionId: partition.partitionId,
          tableName: partition.tableName,
          status: SERVICE_STATUS.ACTIVE,
          service: partition,
        });
        registeredCount++;
        writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
        });
      } catch (error) {
        writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
          error: error.message,
        });
        this.logger.error(BootstrapLog.REPLICA_HANDLER_REGISTER_FAILED, {
          replicaId,
          partitionId: partition?.partitionId || null,
          error: error.message,
        });
      }

      if (attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL ===
        NUM.ZERO) {
        this.logger.info('Bootstrap partition registration progress', {
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
    this.logger.info('Completed bootstrap partition registration with replica handler', {
      nodeId: this.nodeId,
      attemptedCount,
      registeredCount,
      skippedCount,
      totalPartitions,
      durationMs: Date.now() - startedAt,
    });
    writeRegistrationTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_COMPLETE, {
      nodeId: this.nodeId,
      attemptedCount,
      registeredCount,
      skippedCount,
      totalPartitions,
      durationMs: Date.now() - startedAt,
    });
    return {
      attemptedCount,
      registeredCount,
      skippedCount,
      totalPartitions,
    };
  }

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
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache: this.systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    this.heartbeatService = controlPlane.heartbeatService;
    this.leaseService = controlPlane.leaseService;
    this.endpointService = controlPlane.endpointService;
    this.dispatchService = controlPlane.dispatchService;
    this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;

    for (const mgs of this.messageGroupServices.values()) {
      if (mgs.setTablePolicyService) {
        mgs.setTablePolicyService(this.tablePolicyService);
      }
      if (mgs.setRebalanceCoordinator) {
        mgs.setRebalanceCoordinator(this.rebalanceCoordinator);
      }
    }

    for (const partition of this.partitionServices.values()) {
      if (partition.setTablePolicyService) {
        partition.setTablePolicyService(this.tablePolicyService);
      }
      if (partition.setRebalanceCoordinator) {
        partition.setRebalanceCoordinator(this.rebalanceCoordinator);
      }
    }

    this.logger.info(BootstrapLog.CONTROL_PLANE_READY, {
      nodeId: this.nodeId,
      messageGroupCount: this.messageGroupServices.size,
      owner: 'ControlPlaneSetup',
    });
  }

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
      });
    });

    if (result) {
      this.runtimeServiceHandler = result.runtimeServiceHandler;
    }
  }

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
        return this.createBootstrapMessageGroupReplica({
          definition: descriptorForReplica(options.replicaId),
          replicaOptions: options,
        });
      },
      startMessageGroupReplica: async (options) => {
        return this.startBootstrapMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      stopMessageGroupReplica: async (options) => {
        return this.stopBootstrapMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      resolveLocalMessageGroupReplica: (replicaId) =>
        this.messageGroupServices.get(replicaId) || null,
      rpcClient: this.rpcClient,
    });

    if (result) {
      this.messageGroupServiceHandler = result.messageGroupServiceHandler;
      this.messageGroupServiceHandlerRegistered = true;
    }
  }

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
      await this.waitForSystemServiceLeadersInCache();
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
      await this.waitForReadyNodeInCache(this.nodeId);
      this.messageGroupServiceEndpointsPublished = true;
    } catch (error) {
      this.logger.error(BootstrapLog.CONTROL_PLANE_REGISTER_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Activate non-critical periodic control-plane writers after bootstrap
   * reaches the active startup barrier.
   * @return {void}
   * @private
   */
  activateControlPlaneBackgroundWriters() {
    if (this.controlPlaneBackgroundWritersActivated) {
      return;
    }

    if (this.leaseService) {
      this.leaseService.start();
    }
    if (this.heartbeatService) {
      this.heartbeatService.start({
        nodeAddress: this.nodeAddress,
        getStats: () => NodeService.getInstance().getNodeStats(),
      });
    }

    this.controlPlaneBackgroundWritersActivated = true;
    this.logger.info(BootstrapLog.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE, {
      nodeId: this.nodeId,
    });
  }

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
        this.logger.error('Replica state persistence rejected during bootstrap registration', {
          nodeId: this.nodeId,
          replicaId,
          targetState,
          error: error.message,
        });
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
          reason: BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
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
          reason: BOOTSTRAP_REPLICA_REGISTRATION_REASON.BOOTSTRAP_REGISTRATION,
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

    this.logger.info('Starting bootstrap replica registration with state machine', {
      nodeId: this.nodeId,
      totalPartitions,
    });
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
      if (!partition || typeof partition !== 'object') {
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
          error: 'Partition service missing during state-machine registration',
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
        writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_SUCCESS, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
          partitionId: partition.partitionId,
        });
      } catch (error) {
        writeStateTrace(BOOTSTRAP_REPLICA_REGISTRATION_TRACE.EVENT_ERROR, {
          nodeId: this.nodeId,
          attemptedCount,
          replicaId,
          partitionId: partition?.partitionId || null,
          error: error.message,
        });
        this.logger.error(BootstrapLog.STATE_MACHINE_REGISTER_FAILED, {
          replicaId,
          partitionId: partition?.partitionId || null,
          error: error.message,
        });
      }

      if (attemptedCount % BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL ===
        NUM.ZERO) {
        this.logger.info('Bootstrap state-machine registration progress', {
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
    this.logger.info('Completed bootstrap replica registration with state machine', {
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
        this.logger.info('Bootstrap state-machine registration persistence settled', {
          nodeId: this.nodeId,
          attemptedCount,
          registeredCount,
          skippedCount,
          persistErrorCount,
          expectedPersistCount,
          settledPersistCount: persistSettles.length,
          elapsedMs: Date.now() - startedAt,
        });
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
  }

  /**
   * Get the leader partition for a system table.
   * @param {string} tableName - Table name.
   * @return {PartitionService|null} Leader partition or null.
   * @private
   */
  getLeaderPartition(tableName) {
    return this.seedRegistrationPhase
      .getLeaderPartition(tableName);
  }

  /**
   * Get the system table cache (source of truth for cluster metadata).
   * Some unit tests inject it via a message group service stub.
   * @return {Object|null}
   * @private
   */
  getSystemTableCache() {
    if (this.systemTableCache) {
      return this.systemTableCache;
    }
    // Pick the first message group service that exposes a cache.
    for (const svc of this.messageGroupServices.values()) {
      if (svc?.systemTableCache) {
        return svc.systemTableCache;
      }
    }
    return assertCritical(null, bootstrapError.SYSTEM_CACHE_MISSING);
  }

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

    const capabilities = Array.isArray(options.capabilities) ? options.capabilities : [];

    if (existing) {
      await nodesPartition.updateData(TABLES.NODES, {node_id: options.nodeId}, {
        node_address: options.nodeAddress,
        connection_state: options.connectionState,
        capabilities: JSON.stringify(capabilities),
        // Preserve last heartbeat if present to avoid clobbering liveness tracking.
        last_heartbeat: existing.last_heartbeat,
      });
    } else {
      await nodesPartition.upsertData(TABLES.NODES, {
        node_id: options.nodeId,
        node_address: options.nodeAddress,
        connection_state: options.connectionState,
        capabilities: JSON.stringify(capabilities),
      });
    }
  }

  /**
   * Register the bootstrap \"ready\" handler on the message router.
   * This is a compatibility hook for older joining flows.
   */
  registerBootstrapReadyHandler() {
    if (!this.messageRouter?.register) {
      return;
    }

    const address = `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.BOOTSTRAP}` +
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
  }

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
          [INITIAL_MESSAGE_GROUP_ID] : [],
      registeredNodeId: this.nodeId,
    };

    await this.cleanupFailedBootstrap(
      failedPhase, cleanupContext,
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
  }

  /**
   * Clean up a failed bootstrap in reverse phase order.
   * Each cleanup step is wrapped in try/catch — errors are logged
   * but never thrown. After cleanup, the lifecycle state machine
   * transitions to STOPPED.
   * @param {string} failedPhase - The phase that failed.
   * @param {Object} cleanupContext - Context about what was created.
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    this.logger.info(BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_START, {
      nodeId: this.nodeId,
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
      startIndex : NUM.ZERO;

    const stepsToRun =
      CLEANUP_STEPS_REVERSE_ORDER.slice(effectiveStart);

    const stepResults = {};

    for (const step of stepsToRun) {
      stepResults[step] = await this._executeCleanupStep(
        step, cleanupContext,
      );
    }

    const currentState =
      this.lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      try {
        this.lifecycleStateMachine.transition(
          NodeState.STOPPED,
        );
      } catch (err) {
        this.logger.warn(
          BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_COMPLETE, {
            nodeId: this.nodeId,
            transitionError: err.message,
          });
      }
    }

    this.logger.info(
      BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_SUMMARY, {
        nodeId: this.nodeId,
        failedPhase,
        stepResults,
      });
  }

  /**
   * Execute a single cleanup step.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
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
      return 'skipped';
    }
  }

  /**
   * Cleanup step: clear the system table cache.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupCacheHydration() {
    return this.seedCleanupHandler._cleanupCacheHydration();
  }

  /**
   * Cleanup step: remove partial registration entries.
   * Delegates to SeedCleanupHandler.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupRegistration(cleanupContext) {
    return this.seedCleanupHandler._cleanupRegistration(
      cleanupContext,
    );
  }

  /**
   * Cleanup step: stop and destroy partition services.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupPartitions() {
    return this.seedCleanupHandler._cleanupPartitions();
  }

  /**
   * Cleanup step: stop and destroy message group services.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupMessageGroups() {
    return this.seedCleanupHandler._cleanupMessageGroups();
  }

  /**
   * Cleanup step: stop the message router and transport.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupInfrastructure() {
    return this.seedCleanupHandler._cleanupInfrastructure();
  }

  /**
   * Stop all rebalancer and coordinator activity.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<void>}
   * @private
   */
  async quiesceRebalancers() {
    return this.seedCleanupHandler.quiesceRebalancers();
  }

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
  }

  /**
   * Clean up partially initialized services.
   * Delegates to SeedCleanupHandler.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    return this.seedCleanupHandler.cleanup();
  }

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

    // Check if server is already running (started during bootstrap)
    if (this.messageRouter.server) {
      this.logger.debug(BootstrapLog.WS_ALREADY_RUNNING, {
        nodeId: this.nodeId,
        wsPort: wsPort,
      });
      return;
    }

    // Update the port if not already set
    if (!this.messageRouter.wsPort) {
      this.messageRouter.wsPort = wsPort;
    }

    // Start server and establish self-connection
    await this.messageRouter.initialize({startServer: true});

    this.logger.info(BootstrapLog.WS_SERVER_STARTED, {
      nodeId: this.nodeId,
      wsPort: wsPort,
    });
  }

  /**
   * Get the MessageRouter for cross-node communication.
   * @return {MessageRouter|null} The message router or null if not initialized.
   */
  getMessageRouter() {
    return this.messageRouter;
  }

  /**
   * Get the current bootstrap phase.
   * @return {string} Current phase.
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Get the node lifecycle state machine.
   * @return {NodeLifecycleStateMachine} The lifecycle state machine.
   */
  getLifecycleStateMachine() {
    return this.lifecycleStateMachine;
  }

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
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create the shared CDC pipeline readiness gate.
   * Tests override this to inject manual time instead of wall-clock waits.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    return this.seedCacheHydrationPhase
      .createCdcPipelineReadinessGate(systemTableCache);
  }

  /**
   * Shutdown the bootstrap service and all managed services.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      this.logger.info(BootstrapLog.SHUTDOWN, {
        nodeId: this.nodeId,
        messageGroupServices: this.messageGroupServices.size,
        partitionServices: this.partitionServices.size,
      });

      await this.cleanup();

      this.emit(BootstrapEvent.SHUTDOWN, {nodeId: this.nodeId});
    })();

    return this.shutdownPromise;
  }

  /**
   * Bootstrap and exit on failure.
   * This is the main entry point for seed node startup.
   * @param {Object} options - Bootstrap options.
   * @return {Promise<Object>} Bootstrap result.
   */
  static async bootstrapOrExit(options = {}) {
    const bootstrap = new BootstrapService(options);
    const result = await bootstrap.bootstrap();

    if (!result.success) {
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);

      logger.error(BootstrapLog.BOOTSTRAP_EXIT_FAILED, {
        nodeId: result.nodeId,
        error: result.error,
        phase: result.phase,
      });

      // Exit with non-zero code (Requirement 6.16)
      process.exit(NUM.ONE);
    }

    return result;
  }
}

export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};
