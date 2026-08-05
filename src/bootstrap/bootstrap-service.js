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
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_SUBSYSTEM,
} from './bootstrap-constants.js';
import {CacheHydrationService as _CacheHydrationService} from '../cache/cache-hydration-service.js';
import {
  StartupRuntimeSurfaceOwner,
} from './shared/startup-runtime-surface-owner.js';
import {
  buildStartupRuntimeHandoffSnapshot,
} from './shared/startup-sql-runtime-handoff.js';
import {HEARTBEAT_STATE} from '../control-plane/heartbeat-service-constants.js';
import {DEFAULT_NODE_CAPABILITIES} from '../control-plane/control-plane-constants.js';
import {LEASE_STATE} from '../control-plane/lease-service-constants.js';
import {createRuntimeStartupWiring} from '../runtime/runtime-startup-wiring.js';
import {
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
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
  SeedStartupSessionStore,
} from './seed-startup-session-store.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {
  createBootstrapServiceSeedDelegateMethods,
} from './bootstrap-service-seed-delegates.js';
import {
  createBootstrapServiceSeedWorkflowMethods,
} from './bootstrap-service-seed-workflow.js';
import {
  createBootstrapServiceRuntimeMethods,
} from './bootstrap-service-runtime-methods.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_BOOTSTRAPSERVICE = 'BootstrapService';
const LOCAL_STR_STARTUP_BRANCH_SEED = 'seed';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_CREATERUNTIMESTARTUPWIRING = 'createRuntimeStartupWiring';
const LOCAL_STR_TRIGGERREBALANCINGONALLPARTITIONS = 'triggerRebalancingOnAllPartitions';
const LOCAL_STR_RETRYING_SEED_STEADY_STATE_CONTROL_PLANE = 'Retrying seed steady-state control-plane writers until ';
const LOCAL_STR_LIFECYCLE_METADATA_PUBLICATION_READINESS = 'lifecycle metadata publication readiness is satisfied';
const LOCAL_STR_DEFERRING_SEED_STEADY_STATE_CONTROL_PLAN = 'Deferring seed steady-state control-plane writers until ';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;

function resolveBootstrapWorkflowDataDir(options = {}) {
  if (typeof options.dataDir === LOCAL_STR_STRING && options.dataDir.length > 0) {
    return options.dataDir;
  }
  const dataDirectoryManager = options.dataDirectoryManager || null;
  if (typeof dataDirectoryManager?.isInitialized === LOCAL_STR_FUNCTION &&
      dataDirectoryManager.isInitialized() === true &&
      typeof dataDirectoryManager.getDataDir === LOCAL_STR_FUNCTION) {
    return dataDirectoryManager.getDataDir();
  }
  return null;
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
      owner: LOCAL_STR_BOOTSTRAPSERVICE,
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_SERVICE,
    });
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.wsPort = options.wsPort || null;
    this.config = {...BOOTSTRAP_DEFAULT, ...options.config};
    this.config.replicaStaggerDelayMs = Number.isFinite(this.config.replicaStaggerDelayMs) ?
      Math.max(0, this.config.replicaStaggerDelayMs) :
      BOOTSTRAP_DEFAULT.replicaStaggerDelayMs;
    this.config.maxConcurrentServiceActions = Number.isFinite(
      this.config.maxConcurrentServiceActions,
    ) ?
      Math.max(1, Math.floor(this.config.maxConcurrentServiceActions)) :
      BOOTSTRAP_DEFAULT.maxConcurrentServiceActions;
    this.config.replicaRegistrationTraceEnabled = Boolean(
      this.config.replicaRegistrationTraceEnabled,
    );
    this.bootstrapReadinessState = options.readinessState || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.onLocalAdminRuntimeReady =
      typeof options.onLocalAdminRuntimeReady === LOCAL_STR_FUNCTION ?
        options.onLocalAdminRuntimeReady :
        null;
    this.localAdminRuntimeReadyNotified = false;
    this.nodeReadyRebalanceDelayMs = Number.isFinite(
      this.config.nodeReadyRebalanceDelayMs,
    ) ?
      Math.max(0, this.config.nodeReadyRebalanceDelayMs) :
      BOOTSTRAP_REBALANCE_DELAY_MS;
    this.clusterIncarnationFence =
      options.clusterIncarnationFence &&
        typeof options.clusterIncarnationFence === LOCAL_STR_OBJECT ?
        options.clusterIncarnationFence :
        null;
    // This boot's locally minted incarnation (rejoin-hints counter), threaded
    // into the IDENTIFY frame and node-state publications so receivers fence
    // stale-incarnation (zombie) writers; 0 means pre-incarnation.
    this.bootIncarnation = Number.isSafeInteger(options.bootIncarnation) &&
      options.bootIncarnation > 0 ?
      Math.floor(options.bootIncarnation) :
      0;
    this.dataDirectoryManager = options.dataDirectoryManager || null;
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler({
        maxConcurrent: this.config.maxConcurrentServiceActions,
        reservedClassASlots: 1,
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
    this.serviceLifecycleCommandOwner = null;
    this.serviceInstallationReconcilerOwnerHandle = null;
    this.systemMetadataOwners = null;
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
      getStartupRuntimeHandoffSnapshot: () =>
        self.getStartupRuntimeHandoffSnapshot(),
    };
    this.runtimeDrivers = runtimeWiring.drivers;

    // CDC integration service for system table writes
    this.cdcIntegrationService = null;
    this.systemTableWriter = null;

    // RPC client for control plane dispatch
    this.rpcClient = null;

    // System table cache reference
    this.systemTableCache = null;
    // A cache handle exists as soon as bootstrap infrastructure is composed.
    // This witness becomes true only after SeedCacheHydrationPhase has filled
    // and wired that cache successfully.
    this.systemCacheHydrated = false;
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
    this.servicesCreated = 0;
    this.partitionsCreated = 0;
    this.messageGroupsCreated = 0;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE);
    this.logger.debug(BootstrapLog.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: LOCAL_STR_CREATERUNTIMESTARTUPWIRING,
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
            LOCAL_STR_TRIGGERREBALANCINGONALLPARTITIONS,
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
              LOCAL_STR_RETRYING_SEED_STEADY_STATE_CONTROL_PLANE +
              LOCAL_STR_LIFECYCLE_METADATA_PUBLICATION_READINESS,
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
            LOCAL_STR_DEFERRING_SEED_STEADY_STATE_CONTROL_PLAN +
            LOCAL_STR_LIFECYCLE_METADATA_PUBLICATION_READINESS,
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
          capabilities: [...DEFAULT_NODE_CAPABILITIES],
        }),
        getHeartbeatRunningState: () => HEARTBEAT_STATE.RUNNING,
        getRouteSource: () => this.nodeAddress,
        isDistributedTransactionRecoveryAvailable: () =>
          typeof this.sqlQueryEngine?.activateDistributedTransactionRecovery ===
            LOCAL_STR_FUNCTION,
        activateDistributedTransactionRecovery: () => {
          const sqlQueryEngine = this.sqlQueryEngine;
          if (typeof sqlQueryEngine?.activateDistributedTransactionRecovery !==
            LOCAL_STR_FUNCTION) {
            return;
          }
          return sqlQueryEngine.activateDistributedTransactionRecovery();
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
   * Return the seed-path startup runtime handoff witness: bootstrap
   * completion and distributed transaction replay are measured as separate
   * prerequisites of full readiness.
   * @return {Object|null}
   */
  getStartupRuntimeHandoffSnapshot() {
    const recovery =
      this.runtimeHandoffOwner?.getDistributedTransactionRecoverySnapshot?.() ||
      null;
    return buildStartupRuntimeHandoffSnapshot({
      startupBranch: LOCAL_STR_STARTUP_BRANCH_SEED,
      infrastructureJoinComplete: this.phase === BootstrapPhase.COMPLETE,
      recovery,
    });
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
      process.exit(1);
    }

    return result;
  }
}

Object.assign(
  BootstrapService.prototype,
  createBootstrapServiceSeedDelegateMethods(),
  createBootstrapServiceSeedWorkflowMethods(),
  createBootstrapServiceRuntimeMethods(),
);

export {BootstrapService, BootstrapPhase, DEFAULT_BOOTSTRAP_CONFIG};
