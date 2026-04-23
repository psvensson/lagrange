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
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_SUBSYSTEM,
  SEED_DELEGATE_BUNDLE,
} from './bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
} from './system-table-schemas-constants.js';
import {CacheHydrationService as _CacheHydrationService} from '../cache/cache-hydration-service.js';
import {
  StartupRuntimeSurfaceOwner,
} from './shared/startup-runtime-surface-owner.js';
import {HEARTBEAT_STATE} from '../control-plane/heartbeat-service-constants.js';
import {LEASE_STATE} from '../control-plane/lease-service-constants.js';
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
  activateSteadyStateRuntimeHandoff,
} from './shared/startup-sql-runtime-handoff.js';
import {
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';
import {
  BootstrapMessageGroupSelectionOwner,
} from './owners/bootstrap-message-group-selection-owner.js';
import {createSeedPhaseOwners} from './owners/seed-phase-owners.js';
import {
  BootstrapNodeReadyRebalanceOwner,
} from './owners/bootstrap-node-ready-rebalance-owner.js';
import {
  StartupRuntimeHandoffOwner,
} from './owners/startup-runtime-handoff-owner.js';
import {
  SeedRuntimeBridgeOwner,
} from './owners/seed-runtime-bridge-owner.js';
import {
  SeedRegistrationRuntimeOwner,
} from './owners/seed-registration-runtime-owner.js';
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
  SEED_STARTUP_CHECKPOINT,
  SeedStartupSessionStore,
} from './seed-startup-session-store.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {BOOTSTRAP_SUB_PHASE} from '../node/node-constants.js';
import {
  createBootstrapServiceRuntimeMethods,
} from './bootstrap-service-runtime-methods.js';
import {NUM} from '../constants/index.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;

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

const SEED_WORKFLOW_PLAN_VERSION = 'seed-startup-plan/v1';
const SEED_WORKFLOW_PHASE = Object.freeze({
  CONTROL_PLANE_READY: 'seed_workflow:control_plane_ready',
  RUNTIME_READY: 'seed_workflow:runtime_ready',
  FINALIZED: 'seed_workflow:finalized',
});

function resolveBootstrapWorkflowDataDir(options = {}) {
  if (typeof options.dataDir === 'string' && options.dataDir.length > 0) {
    return options.dataDir;
  }
  const dataDirectoryManager = options.dataDirectoryManager || null;
  if (typeof dataDirectoryManager?.isInitialized === 'function' &&
      dataDirectoryManager.isInitialized() === true &&
      typeof dataDirectoryManager.getDataDir === 'function') {
    return dataDirectoryManager.getDataDir();
  }
  return null;
}

function isExternalAdmissionOpen(messageRouter) {
  return typeof messageRouter?.isExternalAdmissionEnabled === 'function' &&
    messageRouter.isExternalAdmissionEnabled() === true;
}


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
    const startupWorkflowDataDir = resolveBootstrapWorkflowDataDir(options);

    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: 'BootstrapService',
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_SERVICE,
    });
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
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
    this.bootstrapReadinessState = options.readinessState || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.onLocalAdminRuntimeReady =
      typeof options.onLocalAdminRuntimeReady === 'function' ?
        options.onLocalAdminRuntimeReady :
        null;
    this.localAdminRuntimeReadyNotified = false;
    this.nodeReadyRebalanceDelayMs = Number.isFinite(
      this.config.nodeReadyRebalanceDelayMs,
    ) ?
      Math.max(NUM.ZERO, this.config.nodeReadyRebalanceDelayMs) :
      BOOTSTRAP_REBALANCE_DELAY_MS;
    this.clusterIncarnationFence =
      options.clusterIncarnationFence &&
        typeof options.clusterIncarnationFence === 'object' ?
        options.clusterIncarnationFence :
        null;
    this.dataDirectoryManager = options.dataDirectoryManager || null;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler({
        maxConcurrent: this.config.maxConcurrentServiceActions,
        reservedClassASlots: NUM.ONE,
      });

    // Services created during bootstrap
    this.messageGroupServices = new Map();
    this.messageGroupSelectionOwner =
      new BootstrapMessageGroupSelectionOwner({
        delegates: {
          getMessageGroupServices: () => this.messageGroupServices,
        },
      });
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
    this.controlPlaneBackgroundWriterActivationPromise = null;
    this.messageGroupServiceHandler = null;

    // Unified runtime ownership wiring.
    const runtimeWiring = createRuntimeStartupWiring({
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    const self = this;
    this.runtimeDependencyOwner = {
      runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
      serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
      get logger() {
        return self.logger;
      },
      get transport() {
        return self.transport;
      },
      get messageRouter() {
        return self.messageRouter;
      },
      get cdcIntegrationService() {
        return self.cdcIntegrationService;
      },
      get systemTableCache() {
        return self.peekSystemTableCache();
      },
      get replicaHandler() {
        return self.replicaHandler;
      },
      get replicaStateMachine() {
        return self.replicaStateMachine;
      },
      get heartbeatService() {
        return self.heartbeatService;
      },
      get leaseService() {
        return self.leaseService;
      },
      get endpointService() {
        return self.endpointService;
      },
      get dispatchService() {
        return self.dispatchService;
      },
      get tablePolicyService() {
        return self.tablePolicyService;
      },
      get latencyTopology() {
        return self.latencyTopology;
      },
      get runtimeServiceHandler() {
        return self.runtimeServiceHandler;
      },
      get rebalanceCoordinator() {
        return self.rebalanceCoordinator;
      },
      get controlPlaneReadinessService() {
        return self.rebalanceCoordinator?.controlPlaneReadinessService || null;
      },
      get bootstrapReadinessState() {
        return self.bootstrapReadinessState;
      },
      get serviceLifecycleManager() {
        return self.serviceLifecycleManager;
      },
      get serviceReconciler() {
        return self.serviceReconciler;
      },
    };
    Object.defineProperties(this, {
      runtimeDriverRegistry: {
        configurable: true,
        enumerable: true,
        get: () => this.runtimeDependencyOwner.runtimeDriverRegistry,
      },
      serviceRuntimeLifecycle: {
        configurable: true,
        enumerable: true,
        get: () => this.runtimeDependencyOwner.serviceRuntimeLifecycle,
      },
    });
    this.bootstrapApiOwner = {
      get phase() {
        return self.phase;
      },
      get config() {
        return self.config;
      },
      get messageRouter() {
        return self.messageRouter;
      },
      waitForPartitionLeadership: () => self.waitForPartitionLeadership(),
      getEpochManager: () => self.getEpochManager(),
    };
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

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);
    this.logger.debug(BootstrapLog.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: 'createRuntimeStartupWiring',
      runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.nodeReadyRebalanceOwner = new BootstrapNodeReadyRebalanceOwner({
      delegates: {
        getLogger: () => this.logger,
        getLocalNodeId: () => this.nodeId,
        isBootstrapNodeReadyRebalanceActive: () =>
          this.isShuttingDown !== true &&
          this.phase !== BootstrapPhase.COMPLETE &&
          this.phase !== BootstrapPhase.FAILED,
        getNodeReadyRebalanceDelayMs: () => this.nodeReadyRebalanceDelayMs,
        getPartitionServices: () => this.partitionServices,
        executeNodeReadyRebalance: (reason) => {
          if (Object.prototype.hasOwnProperty.call(
            this,
            'triggerRebalancingOnAllPartitions',
          )) {
            this.triggerRebalancingOnAllPartitions(reason);
            return;
          }
          this.nodeReadyRebalanceOwner.triggerRebalancingOnAllPartitions(reason);
        },
      },
    });
    this.runtimeHandoffOwner = new StartupRuntimeHandoffOwner({
      delegates: {
        getCompatibilityService: () => this,
        isShuttingDown: () => this.isShuttingDown === true,
        getMetadataPublicationReadinessOptions: () => ({
          readinessState: this.bootstrapReadinessState,
          sleep: (delayMs) => this.sleep(delayMs),
          onRetry: ({attempt, maxAttempts, delayMs, snapshot}) => {
            this.logger.warn(
              'Retrying seed steady-state control-plane writers until ' +
              'lifecycle metadata publication readiness is satisfied',
              {
                nodeId: this.nodeId,
                attempt,
                maxAttempts,
                nextDelayMs: delayMs,
                lifecycleReadiness: snapshot || null,
              },
            );
          },
        }),
        onMetadataPublicationReadinessDeferred: (error) => {
          this.logger.warn(
            'Deferring seed steady-state control-plane writers until ' +
            'lifecycle metadata publication readiness is satisfied',
            {
              nodeId: this.nodeId,
              error: error?.message || String(error),
              lifecycleReadiness: error?.lifecycleReadiness || null,
            },
          );
        },
        getLeaseService: () => this.leaseService,
        getLeaseRunningState: () => LEASE_STATE.RUNNING,
        getHeartbeatService: () => this.heartbeatService,
        buildHeartbeatStartOptions: () => ({
          nodeAddress: this.nodeAddress,
          getStats: () => NodeService.getInstance().getNodeStats(),
        }),
        getHeartbeatRunningState: () => HEARTBEAT_STATE.RUNNING,
        activateDistributedTransactionRecovery: () => {
          const sqlQueryEngine = this.sqlQueryEngine;
          if (typeof sqlQueryEngine?.activateDistributedTransactionRecovery !==
            'function') {
            return;
          }
          void sqlQueryEngine.activateDistributedTransactionRecovery();
        },
        startLatencyTopologyLifecycle: () =>
          this.seedRuntimeBridgeOwner?.startLatencyTopologyLifecycle?.(),
        onControlPlaneBackgroundWritersActivated: () => {
          this.logger.info(BootstrapLog.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE, {
            nodeId: this.nodeId,
          });
        },
      },
    });
    this.runtimeSurfaceOwner = new StartupRuntimeSurfaceOwner({
      delegates: {
        getNodeId: () => this.nodeId,
        getOwner: () => this,
        getOnLocalAdminRuntimeReady: () => this.onLocalAdminRuntimeReady,
        getLocalAdminRuntimeReadyNotified: () =>
          this.localAdminRuntimeReadyNotified,
        setLocalAdminRuntimeReadyNotified: (value) => {
          this.localAdminRuntimeReadyNotified = value === true;
        },
        getSystemTableCache: () => this.getSystemTableCache(),
        getCacheMutationTarget: () => this.getSystemTableCache(),
        getMessageRouter: () => this.messageRouter,
        getPartitionServices: () => this.partitionServices,
        getMessageGroupServices: () => this.messageGroupServices,
        getTablePolicyService: () => this.tablePolicyService,
        getRebalanceCoordinator: () => this.rebalanceCoordinator,
      },
    });
    this.seedStartupSessionStore =
      options.seedStartupSessionStore instanceof SeedStartupSessionStore ?
        options.seedStartupSessionStore :
        new SeedStartupSessionStore({
          dataDir: startupWorkflowDataDir,
        });
    this.seedPhaseOwners = createSeedPhaseOwners(this);
    this.partitionReplicaProgressReporter = new ReplicaCreationProgressReporter({
      logger: this.logger,
      formatLine: (progress, status, error) =>
        this.seedPartitionsPhase
          .formatPartitionReplicaProgressLine(
            progress, status, error,
          ),
      buildContext: (progress, status, error) =>
        this.seedPartitionsPhase
          .buildPartitionReplicaProgressContext(
            progress, status, error,
          ),
    });

    // Error tracking
    this.lastError = null;
    this.cleanupRequired = false;
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this.deferredLatencyTopologyStartHandle = null;
    this.deferredLatencyTopologyStartKind = null;

    // Build concern-scoped delegate bundles for extracted phase modules.
    // Each bundle groups delegates by concern (D2.2) so owners receive
    // only the dependencies they need.
    const delegateBundles = this._buildSeedDelegateBundles();
    const seedDelegates = this._composeSeedDelegates(
      delegateBundles,
    );
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
    this.seedRegistrationRuntimeOwner =
      new SeedRegistrationRuntimeOwner({
        delegates: seedDelegates,
      });
    this.seedRuntimeBridgeOwner = new SeedRuntimeBridgeOwner({
      delegates: seedDelegates,
    });
    this.seedCacheHydrationPhase = new SeedCacheHydrationPhase({
      delegates: seedDelegates,
      runtimeBridgeOwner: this.seedRuntimeBridgeOwner,
    });
    this.seedRuntimeBridgeOwner.compatibilityPhase =
      this.seedCacheHydrationPhase;
    this.seedCleanupHandler = new SeedCleanupHandler({
      delegates: this._composeSeedDelegates(delegateBundles, {
        cleanupOnly: true,
      }),
    });
  }

  /**
   * Build concern-scoped delegate bundles for extracted seed phase
   * modules (D2.2). Each bundle groups delegates by concern so
   * phase/readiness/cleanup owners receive only the dependencies
   * they need.
   * @return {Object} Keyed by SEED_DELEGATE_BUNDLE values.
   * @private
   */
  _buildSeedDelegateBundles() {
    return {
      [SEED_DELEGATE_BUNDLE.PHASE_EXECUTION]:
        this._buildPhaseExecutionDelegates(),
      [SEED_DELEGATE_BUNDLE.READINESS]:
        this._buildReadinessDelegates(),
      [SEED_DELEGATE_BUNDLE.CLEANUP]:
        this._buildCleanupDelegates(),
      [SEED_DELEGATE_BUNDLE.RUNTIME_WIRING]:
        this._buildRuntimeWiringDelegates(),
    };
  }

  /**
   * Compose a flat delegates object from concern-scoped bundles.
   * Phase owners consume the flat shape; the bundles provide
   * structural visibility into which concern owns each delegate.
   * @param {Object} bundles - Keyed by SEED_DELEGATE_BUNDLE.
   * @param {Object} [options] - Composition options.
   * @param {boolean} [options.cleanupOnly] - When true, compose
   *   only cleanup + readiness bundles (for SeedCleanupHandler).
   * @return {Object} Flat delegates object.
   * @private
   */
  _composeSeedDelegates(bundles, options = {}) {
    if (options.cleanupOnly) {
      return {
        ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
        ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
      };
    }
    return {
      ...bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION],
      ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
      ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
      ...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING],
    };
  }

  /**
   * Phase execution delegates — accessors, mutators, collection
   * helpers, and phase-helper callbacks consumed by seed phase
   * owner modules (infrastructure, message groups, partitions,
   * registration, cache hydration).
   * @return {Object}
   * @private
   */
  _buildPhaseExecutionDelegates() {
    const self = this;
    return {
      // -- Core accessors --
      getNodeId: () => self.nodeId,
      getNodeAddress: () => self.nodeAddress,
      getAdvertisedNodeWsAddress: () =>
        self.advertisedNodeWsAddress,
      getWsPort: () => self.wsPort,
      getConfig: () => self.config,
      getLogger: () => self.logger,
      getPhase: () => self.phase,
      getStartTime: () => self.startTime,
      getServicesCreated: () => self.servicesCreated,
      getPartitionsCreated: () => self.partitionsCreated,
      getMessageGroupsCreated: () => self.messageGroupsCreated,

      // -- Service collections --
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getMessageGroupServices: () => self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getMessageGroupReplicas: () => self.messageGroupReplicas,
      getPartitionReplicas: () => self.partitionReplicas,

      // -- Lifecycle owners --
      getServiceLifecycleManager: () =>
        self.serviceLifecycleManager,
      getServiceReconciler: () => self.serviceReconciler,
      getServiceRuntimeLifecycle: () =>
        self.serviceRuntimeLifecycle,
      getBootstrapDesiredServiceDefinitions: () =>
        self.bootstrapDesiredServiceDefinitions,
      getBootstrapReplicaOptionsByServiceId: () =>
        self.bootstrapReplicaOptionsByServiceId,

      // -- Service resolution --
      getLeaderMessageGroupService: (options) =>
        self.getLeaderMessageGroupService(options),
      getBootstrapMessageGroupService: () =>
        self.getBootstrapMessageGroupService(),
      resolveQueryTransportMessageGroupSelection: () =>
        self.resolveQueryTransportMessageGroupSelection(),
      resolveOperationalMessageGroupSelection: (options) =>
        self.resolveOperationalMessageGroupSelection(options),
      resolveOperationalMessageGroupSelectionAsync: (options) =>
        self.resolveOperationalMessageGroupSelectionAsync(options),
      buildMessageGroupOwnerNotReadyError: (selection, options) =>
        self.buildMessageGroupOwnerNotReadyError(selection, options),

      // -- Runtime references --
      getSystemTableCache: () => self.getSystemTableCache(),
      getSystemTableCacheRef: () => self.systemTableCache,
      getCdcIntegrationService: () =>
        self.cdcIntegrationService,
      getEpochManager: () => self.epochManager,
      getRebalanceCoordinator: () =>
        self.rebalanceCoordinator,
      getLatencyTopology: () => self.latencyTopology,
      getSystemTableWriter: () => self.systemTableWriter,
      getTablePolicyService: () => self.tablePolicyService,
      getSqlQueryEngine: () =>
        self.sqlQueryEngine ||
        self.cdcIntegrationService?.sqlQueryEngine ||
        null,
      getBootstrapReadinessState: () =>
        self.bootstrapReadinessState,
      getPartitionReplicaProgressReporter: () =>
        self.partitionReplicaProgressReporter,
      getInitialMessageGroupId: () =>
        INITIAL_MESSAGE_GROUP_ID,

      // -- Mutators --
      setNodeId: (v) => {
        self.nodeId = v;
      },
      setNodeAddress: (v) => {
        self.nodeAddress = v;
      },
      setAdvertisedNodeWsAddress: (v) => {
        self.advertisedNodeWsAddress = v;
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
      setSqlQueryEngine: (v) => {
        self.sqlQueryEngine = v;
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

      // -- Phase helper callbacks (D2.3: direct owner invocation) --
      createBootstrapServiceDescriptor:
        (serviceType, serviceId) =>
          self.seedInfrastructurePhase
            .createBootstrapServiceDescriptor(
              serviceType, serviceId,
            ),
      queueBootstrapServiceReplica: (descriptor, options) =>
        self.seedInfrastructurePhase
          .queueBootstrapServiceReplica(
            descriptor, options,
          ),
      resolveBootstrapReplicaOptions:
        (serviceId, serviceType) =>
          self.seedInfrastructurePhase
            .resolveBootstrapReplicaOptions(
              serviceId, serviceType,
            ),
      triggerBootstrapReconciler: (reason) =>
        self.seedInfrastructurePhase
          .triggerBootstrapReconciler(reason),
      createBootstrapMessageGroupReplica: (context) =>
        self.seedMessageGroupsPhase
          .createBootstrapMessageGroupReplica(context),
      startBootstrapMessageGroupReplica: (handle, context) =>
        self.seedMessageGroupsPhase
          .startBootstrapMessageGroupReplica(
            handle, context,
          ),
      stopBootstrapMessageGroupReplica: (handle, context) =>
        self.seedMessageGroupsPhase
          .stopBootstrapMessageGroupReplica(
            handle, context,
          ),
      createBootstrapPartitionReplica: (context) =>
        self.seedPartitionsPhase
          .createBootstrapPartitionReplica(context),
      startBootstrapPartitionReplica: (handle, context) =>
        self.seedPartitionsPhase
          .startBootstrapPartitionReplica(
            handle, context,
          ),
      stopBootstrapPartitionReplica: (handle, context) =>
        self.seedPartitionsPhase
          .stopBootstrapPartitionReplica(
            handle, context,
          ),
      waitForMessageGroupLeadership: (groupId, replicaIds) =>
        self.seedMessageGroupsPhase
          .waitForMessageGroupLeadership(
            groupId, replicaIds,
          ),
      waitForPartitionLeadership: (options) =>
        self.seedPartitionsPhase
          .waitForPartitionLeadership(options),
      stopUnifiedLifecycleOwners: () =>
        self.seedInfrastructurePhase
          .stopUnifiedLifecycleOwners(),
      swapSystemTableWriter: () =>
        self.seedRegistrationPhase.swapSystemTableWriter(),
      ensureBootstrapCdcIntegrationService: () =>
        self.seedRuntimeBridgeOwner
          .ensureBootstrapCdcIntegrationService(),
      handleNodeReadyRebalanceTrigger: (cdcEvent, prevRow) =>
        self.nodeReadyRebalanceOwner.handleNodeReadyRebalanceTrigger(
          cdcEvent, prevRow,
        ),
      propagatePartitionCDCEvent: (mgs, cdcEvent) =>
        self.seedRuntimeBridgeOwner
          .propagatePartitionCDCEvent(mgs, cdcEvent),
      resolveCdcPropagationMessageGroup: (preferred) =>
        self.seedCacheHydrationPhase
          .resolveCdcPropagationMessageGroup(preferred),
      applyCurrentEpochFromCache: () =>
        self.seedRuntimeBridgeOwner
          .applyCurrentEpochFromCache(),
      hydrateFromLocalPartitions: (stc, mg) =>
        self.seedCacheHydrationPhase
          .hydrateFromLocalPartitions(stc, mg),
      createCdcPipelineReadinessGate: (stc) =>
        self.seedRuntimeBridgeOwner
          .createCdcPipelineReadinessGate(stc),
      emit: (event, data) => self.emit(event, data),
      sleep: (ms) => self.sleep(ms),

      // -- Partition DB path resolution --
      resolvePartitionDbPath: (partitionId, replicaId) => {
        if (self.dataDirectoryManager &&
            self.dataDirectoryManager.isInitialized()) {
          return self.dataDirectoryManager
            .getPartitionDbPath(partitionId, replicaId);
        } else if (self.config.partitionDbPath) {
          return self.config.partitionDbPath;
        }
        return BOOTSTRAP_DEFAULT.partitionDbPath;
      },
    };
  }

  /**
   * Readiness delegates — lifecycle and readiness state accessors
   * consumed by readiness evaluation and cleanup owners.
   * @return {Object}
   * @private
   */
  _buildReadinessDelegates() {
    const self = this;
    return {
      getLifecycleStateMachine: () =>
        self.lifecycleStateMachine,
      getBootstrapReadinessState: () =>
        self.bootstrapReadinessState,
    };
  }

  /**
   * Cleanup delegates — teardown helpers, state clearers, and
   * diagnostic accessors consumed by SeedCleanupHandler.
   * @return {Object}
   * @private
   */
  _buildCleanupDelegates() {
    const self = this;
    return {
      // -- Core accessors needed for cleanup diagnostics --
      getNodeId: () => self.nodeId,
      getLogger: () => self.logger,
      getPhase: () => self.phase,
      getStartTime: () => self.startTime,
      getServicesCreated: () => self.servicesCreated,
      getMessageGroupsCreated: () => self.messageGroupsCreated,
      getInitialMessageGroupId: () =>
        INITIAL_MESSAGE_GROUP_ID,

      // -- Service collections --
      getMessageGroupServices: () => self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,

      // -- Runtime references --
      getSystemTableCacheRef: () => self.systemTableCache,
      getSystemTableCacheSafe: () =>
        self._getSystemTableCacheSafe(),
      getSystemTableWriter: () => self.systemTableWriter,
      getRebalanceCoordinator: () =>
        self.rebalanceCoordinator,
      getLatencyTopology: () => self.latencyTopology,

      // -- State mutators --
      setPhase: (v) => {
        self.phase = v;
      },
      setLastError: (v) => {
        self.lastError = v;
      },
      setIsShuttingDown: (v) => {
        self.isShuttingDown = v;
      },
      setMessageRouter: (v) => {
        self.messageRouter = v;
      },
      setTransport: (v) => {
        self.transport = v;
      },
      setSystemTableCacheRef: (v) => {
        self.systemTableCache = v;
      },
      setSystemTableWriter: (v) => {
        self.systemTableWriter = v;
      },
      setLatencyTopology: (v) => {
        self.latencyTopology = v;
      },

      // -- Collection mutators --
      resetMessageGroupReplicas: () => {
        self.messageGroupReplicas = [];
      },
      resetPartitionReplicas: () => {
        self.partitionReplicas = [];
      },

      // -- Phase helper callbacks (D2.3: direct owner invocation) --
      stopUnifiedLifecycleOwners: () =>
        self.seedInfrastructurePhase
          .stopUnifiedLifecycleOwners(),
      emit: (event, data) => self.emit(event, data),

      // -- Resource teardown helpers --
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
      clearRuntimeServiceHandler: async () => {
        if (self.runtimeServiceHandler) {
          self.runtimeServiceHandler.unregisterFromRouter(
            self.messageRouter,
          );
          await self.runtimeServiceHandler.shutdown();
          self.runtimeServiceHandler = null;
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
        self.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
      },
    };
  }

  /**
   * Runtime wiring delegates — post-phase wiring accessors
   * consumed by runtime hydration and control-plane setup.
   * @return {Object}
   * @private
   */
  _buildRuntimeWiringDelegates() {
    const self = this;
    return {
      getSystemTableCache: () => self.getSystemTableCache(),
      getMessageRouter: () => self.messageRouter,
      getRebalanceCoordinator: () =>
        self.rebalanceCoordinator,
      getCdcIntegrationService: () =>
        self.cdcIntegrationService,
      getEpochManager: () => self.epochManager,
    };
  }

  /**
   * Determine whether post-pipeline control-plane startup wiring exists.
   * @return {boolean}
   * @private
   */
  hasSeedControlPlaneReady() {
    return Boolean(
      this.replicaHandler &&
      this.messageGroupServiceHandler &&
      this.heartbeatService &&
      this.localAdminRuntimeReadyNotified === true &&
      this.hasPublishedLocalServiceEndpoints() === true,
    );
  }

  /**
   * Determine whether runtime handoff prerequisites are wired locally.
   * @return {boolean}
   * @private
   */
  hasSeedRuntimeReady() {
    return Boolean(
      this.runtimeServiceHandler &&
      isExternalAdmissionOpen(this.messageRouter),
    );
  }

  /**
   * Schedule latency-topology activation through the startup handoff owner
   * without blocking bootstrap completion on topology warm-up.
   * @return {void}
   * @private
   */
  startLatencyTopologyLifecycle() {
    if (this.deferredLatencyTopologyStartHandle) {
      return;
    }
    const topologyStartMs = Date.now();
    const startTopologyAsync = () => {
      this.deferredLatencyTopologyStartHandle = null;
      this.deferredLatencyTopologyStartKind = null;
      if (this.isShuttingDown === true) {
        return;
      }
      try {
        this.seedRuntimeBridgeOwner.startLatencyTopologyLifecycle();
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
      this.deferredLatencyTopologyStartKind = 'immediate';
      this.deferredLatencyTopologyStartHandle = setImmediate(startTopologyAsync);
      return;
    }
    this.deferredLatencyTopologyStartKind = 'timeout';
    this.deferredLatencyTopologyStartHandle = setTimeout(startTopologyAsync, 0);
  }

  /**
   * Complete successful seed bootstrap finalization through one owner path.
   * @return {Object}
   * @private
   */
  completeSuccessfulBootstrap() {
    const duration = Date.now() - this.startTime;
    const alreadyComplete = this.phase === BootstrapPhase.COMPLETE;

    if (!alreadyComplete) {
      const currentState = this.lifecycleStateMachine.getState();
      if (currentState !== NodeState.CONNECTING) {
        this.lifecycleStateMachine.transition(NodeState.CONNECTING);
      }
      this.phase = BootstrapPhase.COMPLETE;
      this.clearNodeReadyRebalanceState();
      activateSteadyStateRuntimeHandoff({
        owner: this.runtimeHandoffOwner,
        activateControlPlaneBackgroundWriters: true,
        startLatencyTopologyLifecycle: true,
      });

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
    }

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
  }

  /**
   * Build checkpointed seed bootstrap steps for the shared workflow runner.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} seedPlan
   * @return {Array<Object>}
   * @private
   */
  buildSeedCheckpointSteps(startupPipelineRunner, seedPlan) {
    const phases = Array.isArray(seedPlan?.phases) ? seedPlan.phases : [];
    return [
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.INFRASTRUCTURE_READY,
        phase: BootstrapPhase.INFRASTRUCTURE,
        shouldRerun: () => !this.messageRouter,
        run: async () => {
          await startupPipelineRunner.run({
            phases: phases.slice(NUM.ZERO, NUM.ONE),
          });
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.MESSAGE_GROUPS_READY,
        phase: BootstrapPhase.MESSAGE_GROUPS,
        shouldRerun: () => this.messageGroupServices.size === NUM.ZERO,
        run: async () => {
          await startupPipelineRunner.run({
            phases: phases.slice(NUM.ONE, NUM.TWO),
          });
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.PARTITIONS_READY,
        phase: BootstrapPhase.PARTITIONS,
        shouldRerun: () => this.partitionServices.size === NUM.ZERO,
        run: async () => {
          await startupPipelineRunner.run({
            phases: phases.slice(NUM.TWO, NUM.THREE),
          });
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.REGISTRATION_READY,
        phase: BootstrapPhase.REGISTRATION,
        shouldRerun: () => this.cdcIntegrationService === null,
        run: async () => {
          await startupPipelineRunner.run({
            phases: phases.slice(NUM.THREE, NUM.FOUR),
          });
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.CACHE_HYDRATED,
        phase: BootstrapPhase.CACHE_HYDRATION,
        shouldRerun: () => this.getSystemTableCache() === null,
        run: async () => {
          await startupPipelineRunner.run({
            phases: phases.slice(NUM.FOUR),
          });
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.CONTROL_PLANE_READY,
        phase: SEED_WORKFLOW_PHASE.CONTROL_PLANE_READY,
        shouldRerun: () => !this.hasSeedControlPlaneReady(),
        run: async () => {
          this.logger.info('metrics.bootstrap.post_pipeline.start', {
            nodeId: this.nodeId,
          });

          const replicaHandlerStartMs = Date.now();
          this.initializeReplicaHandler();
          this.logger.info('metrics.bootstrap.post_pipeline.replica_handler', {
            nodeId: this.nodeId,
            durationMs: Date.now() - replicaHandlerStartMs,
          });

          const messageGroupHandlerStartMs = Date.now();
          this.initializeMessageGroupServiceHandler();
          this.logger.info(
            'metrics.bootstrap.post_pipeline.message_group_handler',
            {
              nodeId: this.nodeId,
              durationMs: Date.now() - messageGroupHandlerStartMs,
            },
          );

          const controlPlaneStartMs = Date.now();
          await this.initializeControlPlaneService();
          this.logger.info('metrics.bootstrap.post_pipeline.control_plane', {
            nodeId: this.nodeId,
            durationMs: Date.now() - controlPlaneStartMs,
          });
          await this.notifyLocalAdminRuntimeReady();

          const registerSeedStartMs = Date.now();
          await this.registerSeedNodeWithControlPlane();
          this.logger.info('metrics.bootstrap.post_pipeline.seed_registration', {
            nodeId: this.nodeId,
            durationMs: Date.now() - registerSeedStartMs,
          });
          await this.activateMessageGroupServiceRows();
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.RUNTIME_READY,
        phase: SEED_WORKFLOW_PHASE.RUNTIME_READY,
        shouldRerun: () => !this.hasSeedRuntimeReady(),
        run: async () => {
          const runtimeHandlerStartMs = Date.now();
          this.initializeRuntimeServiceHandler();
          this.logger.info('metrics.bootstrap.post_pipeline.runtime_handler', {
            nodeId: this.nodeId,
            durationMs: Date.now() - runtimeHandlerStartMs,
          });
          this.openExternalTransportAdmission();
        },
      },
      {
        checkpoint: SEED_STARTUP_CHECKPOINT.FINALIZED,
        phase: SEED_WORKFLOW_PHASE.FINALIZED,
        terminal: true,
        shouldRerun: () => {
          return (
            this.phase !== BootstrapPhase.COMPLETE ||
            this.hasActiveControlPlaneBackgroundWriters() !== true
          );
        },
        run: async () => {
          this.completeSuccessfulBootstrap();
        },
      },
    ];
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
      const seedSessionId = await this.seedStartupSessionStore.resolveSessionId({
        nodeId: this.nodeId,
        allowResumeLatest: true,
      });
      await startupPipelineRunner.runWorkflow({
        nodeId: this.nodeId,
        sessionId: seedSessionId,
        allowResumeLatest: true,
        planVersion: SEED_WORKFLOW_PLAN_VERSION,
        sessionStore: this.seedStartupSessionStore,
        steps: this.buildSeedCheckpointSteps(
          startupPipelineRunner,
          seedPlan,
        ),
        isRetryableFailure: () => false,
      });
      return this.completeSuccessfulBootstrap();
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

    const state = this.lifecycleStateMachine.getState();
    const activeSubPhase =
      this.lifecycleStateMachine.getSubPhase() || null;

    this.logger.info(BootstrapLog.PHASE_STARTING, {
      nodeId: this.nodeId,
      state,
      phase: phaseName,
      subPhase: activeSubPhase,
      servicesCreated: this.servicesCreated,
    });

    this.emit(BootstrapEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
      state,
      subPhase: activeSubPhase,
    });
    this.emit('phase:start', {
      phase: phaseName,
      nodeId: this.nodeId,
      state,
      subPhase: activeSubPhase,
    });

    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });

      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.info(BootstrapLog.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        servicesCreated: this.servicesCreated,
      });

      this.emit(BootstrapEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
      this.emit('phase:complete', {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.error(BootstrapLog.PHASE_FAILED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit(BootstrapEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
      });
      this.emit('phase:failed', {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
      });

      throw error;
    }
  }

  // ---------------------------------------------------------------
  // Phase-owner forwarding surface removed (D2.3 wrapper collapse).
  // Callers now invoke phase owners directly:
  //   seedInfrastructurePhase, seedMessageGroupsPhase,
  //   seedPartitionsPhase, seedRegistrationPhase,
  //   seedCacheHydrationPhase, seedCleanupHandler.
  // ---------------------------------------------------------------

  /**
   * Handle node state CDC and schedule one rebalance trigger per node-ready join.
   * @param {Object} cdcEvent - CDC event from nodes table.
   * @param {Object|null} previousNodeRow - Previous nodes table row from cache.
   * @return {boolean} True when a new rebalance trigger was scheduled.
   */
  handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow) {
    return this.nodeReadyRebalanceOwner.handleNodeReadyRebalanceTrigger(
      cdcEvent,
      previousNodeRow,
    );
  }

  /**
  * Execute one node-ready rebalance trigger.
   * @param {string} nodeId - Node that transitioned to ready.
   * @return {Promise<void>}
   * @private
   */
  async executeNodeReadyRebalanceTrigger(nodeId) {
    return this.nodeReadyRebalanceOwner.executeNodeReadyRebalanceTrigger(nodeId);
  }

  /**
   * Clear all pending node-ready rebalance timers and dedupe state.
   */
  clearNodeReadyRebalanceState() {
    this.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
  }

  /**
   * Trigger rebalancing check on all partition leaders.
   * Called when a significant cluster event occurs.
   * @param {string} reason - Reason for triggering rebalancing.
   * @private
   */
  triggerRebalancingOnAllPartitions(reason) {
    this.nodeReadyRebalanceOwner.triggerRebalancingOnAllPartitions(reason);
  }

  /**
   * Limit node-ready fanout to the control-plane partitions that gate
   * convergence. Periodic rebalancing covers the broader data plane.
   * @param {Object} partition
   * @return {boolean}
   * @private
   */
  shouldTriggerNodeReadyRebalanceForPartition(partition) {
    return this.nodeReadyRebalanceOwner
      .shouldTriggerNodeReadyRebalanceForPartition(partition);
  }

  get pendingNodeReadyRebalanceTimers() {
    return this.nodeReadyRebalanceOwner.pendingNodeReadyRebalanceTimers;
  }

  get rebalanceTriggeredNodeIds() {
    return this.nodeReadyRebalanceOwner.rebalanceTriggeredNodeIds;
  }


  /**
   * Get the AssignmentEpochManager instance.
   * @return {AssignmentEpochManager|null}
   */
  getEpochManager() {
    return this.epochManager;
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

Object.assign(
  BootstrapService.prototype,
  createBootstrapServiceRuntimeMethods(),
);

export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};
