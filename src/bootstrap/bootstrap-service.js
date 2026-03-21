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
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_NODE_READY_REBALANCE_TABLES,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_READY_MESSAGE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_REBALANCE_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
  BOOTSTRAP_SUBSYSTEM,
  SEED_DELEGATE_BUNDLE,
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
import {
  buildMessageGroupOwnerNotReadyError,
} from './shared/message-group-selection.js';
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
const NODE_READY_REBALANCE_TABLE_SET =
  new Set(BOOTSTRAP_NODE_READY_REBALANCE_TABLES);

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
    this.seedCacheHydrationPhase = new SeedCacheHydrationPhase({
      delegates: seedDelegates,
    });
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
        self.seedMessageGroupsPhase
          .getLeaderMessageGroupService(options),
      getBootstrapMessageGroupService: () =>
        self.seedMessageGroupsPhase
          .getBootstrapMessageGroupService(),
      resolveOperationalMessageGroupSelection: (options) =>
        self.seedMessageGroupsPhase
          .resolveOperationalMessageGroupSelection(options),

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
      waitForPartitionLeadership: () =>
        self.seedPartitionsPhase
          .waitForPartitionLeadership(),
      stopUnifiedLifecycleOwners: () =>
        self.seedInfrastructurePhase
          .stopUnifiedLifecycleOwners(),
      swapSystemTableWriter: () =>
        self.seedRegistrationPhase.swapSystemTableWriter(),
      ensureBootstrapCdcIntegrationService: () =>
        self.seedCacheHydrationPhase
          .ensureBootstrapCdcIntegrationService(),
      handleNodeReadyRebalanceTrigger: (cdcEvent, prevRow) =>
        self.handleNodeReadyRebalanceTrigger(
          cdcEvent, prevRow,
        ),
      propagatePartitionCDCEvent: (mgs, cdcEvent) =>
        self.seedCacheHydrationPhase
          .propagatePartitionCDCEvent(mgs, cdcEvent),
      resolveCdcPropagationMessageGroup: (preferred) =>
        self.seedCacheHydrationPhase
          .resolveCdcPropagationMessageGroup(preferred),
      applyCurrentEpochFromCache: () =>
        self.seedCacheHydrationPhase
          .applyCurrentEpochFromCache(),
      hydrateFromLocalPartitions: (stc, mg) =>
        self.seedCacheHydrationPhase
          .hydrateFromLocalPartitions(stc, mg),
      createCdcPipelineReadinessGate: (stc) =>
        self.seedCacheHydrationPhase
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
          this.seedCacheHydrationPhase
            .startLatencyTopologyLifecycle();
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
      await this.seedCacheHydrationPhase
        .waitForReadyNodeInCache(nodeId);
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
    const nodeReadyScoped = reason === BOOTSTRAP_REBALANCE_REASON.NODE_READY;
    let leaderPartitionCount = NUM.ZERO;
    let triggeredPartitionCount = NUM.ZERO;

    for (const partition of this.partitionServices.values()) {
      if (!partition?.isLeader) {
        continue;
      }
      leaderPartitionCount++;
      if (nodeReadyScoped &&
          !this.shouldTriggerNodeReadyRebalanceForPartition(partition)) {
        continue;
      }
      triggeredPartitionCount++;
      partition.triggerRebalanceCheck(reason);
    }

    this.logger.info(BootstrapLog.REBALANCE_TRIGGER, {
      reason,
      partitionCount: this.partitionServices.size,
      leaderPartitionCount,
      triggeredPartitionCount,
      scope: nodeReadyScoped ?
        'bootstrap_convergence_critical' :
        'all_leader_partitions',
    });
  }

  /**
   * Limit node-ready fanout to the control-plane partitions that gate
   * convergence. Periodic rebalancing covers the broader data plane.
   * @param {Object} partition
   * @return {boolean}
   * @private
   */
  shouldTriggerNodeReadyRebalanceForPartition(partition) {
    const tableName =
      partition?.tableName ||
      partition?.table_id ||
      partition?.tableId ||
      null;
    if (typeof tableName === 'string' &&
        NODE_READY_REBALANCE_TABLE_SET.has(tableName)) {
      return true;
    }

    const partitionId =
      partition?.partitionId ||
      partition?.partition_id ||
      partition?.serviceId ||
      partition?.service_id ||
      null;
    if (typeof partitionId !== 'string' || partitionId.length === NUM.ZERO) {
      return false;
    }
    for (const nodeReadyTableName of BOOTSTRAP_NODE_READY_REBALANCE_TABLES) {
      if (partitionId === `${nodeReadyTableName}-p1`) {
        return true;
      }
    }
    return false;
  }


  /**
   * Get the AssignmentEpochManager instance.
   * @return {AssignmentEpochManager|null}
   */
  getEpochManager() {
    return this.epochManager;
  }

  async activateMessageGroupServiceRows() {
    return activateMessageGroupServiceRows({
      nodeId: this.nodeId,
      systemTableWriter: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      deferTransientFailures: true,
      handlerRegistered: this.messageGroupServiceHandlerRegistered,
      endpointsPublished: this.messageGroupServiceEndpointsPublished,
      messageGroupServices: this.messageGroupServices,
      onDeferredActivation: ({groupId, replicaId, error}) => {
        this.logger.warn(
          'Deferring seed message-group service row activation during startup',
          {
            nodeId: this.nodeId,
            groupId,
            replicaId,
            error: error?.message || String(error),
          },
        );
      },
    });
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
    const messageGroupService =
      this.seedMessageGroupsPhase.getLeaderMessageGroupService();

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
          this.seedMessageGroupsPhase
            .resolveOperationalMessageGroupSelection({
              requiredTables: [tableName],
            });
        const subscriptionMessageGroupService =
          subscriptionSelection.service;
        if (!subscriptionMessageGroupService) {
          throw buildMessageGroupOwnerNotReadyError(
            subscriptionSelection,
            {
              message:
                `Operational message-group ingress not ready ` +
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
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(BootstrapLog.CDC_DYNAMIC_PARTITION_EVENT, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              partitionId: options.partitionId,
              replicaId: options.replicaId,
            });
            const propagationSelection =
              this.seedMessageGroupsPhase
                .resolveOperationalMessageGroupSelection({
                  requiredTables: [tableName],
                });
            const propagationMessageGroupService =
              propagationSelection.service;
            if (!propagationMessageGroupService) {
              throw buildMessageGroupOwnerNotReadyError(
                propagationSelection,
                {
                  message:
                    `Operational message-group ingress not ready ` +
                    `for ${tableName} CDC propagation`,
                },
              );
            }

            await this.seedCacheHydrationPhase
              .propagatePartitionCDCEvent(
                propagationMessageGroupService,
                cdcEvent,
              );

            if (tableName === TABLES.CONFIG) {
              this.seedCacheHydrationPhase
                .applyCurrentEpochFromCache();
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
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache: this.systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      rebalanceCoordinator: this.rebalanceCoordinator,
      bootstrapReadinessState: this.bootstrapReadinessState,
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
      await this.seedCacheHydrationPhase
        .waitForSystemServiceLeadersInCache();
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
      await this.seedCacheHydrationPhase
        .waitForReadyNodeInCache(this.nodeId);
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
   * Delegate leader-partition resolution to the canonical seed registration
   * owner while preserving the BootstrapService seam used by tests.
   * @param {string} tableName
   * @return {Object|null}
   */
  getLeaderPartition(tableName) {
    return this.seedRegistrationPhase.getLeaderPartition(tableName);
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
   * Clean up a failed bootstrap by delegating to the canonical
   * cleanup owner (SeedCleanupHandler — D3.1).
   * @param {string} failedPhase - The phase that failed.
   * @param {Object} cleanupContext - Context about what was created.
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    await this.seedCleanupHandler.cleanupFailedBootstrap(
      failedPhase, cleanupContext,
    );
  }

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
      step, cleanupContext,
    );
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

      await this.seedCleanupHandler.cleanup();

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
