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
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  CONFIG_SEED_SOURCE,
  CONFIG_VALUE_TYPE,
} from '../config/config-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {DataDirectoryManager as _DataDirectoryManager} from '../storage/data-directory-manager.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  BOOTSTRAP_CLEANUP_STEP,
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_EPOCH,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_MESSAGE_GROUP,
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_READY_MESSAGE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_REBALANCE_REASON,
  BOOTSTRAP_REPLICA_PROGRESS,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
  BOOTSTRAP_SQL,
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_UNIFIED_RECONCILE,
} from './bootstrap-constants.js';
import {
  SystemTableName,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
} from './system-table-schemas-constants.js';
import {CacheHydrationService as _CacheHydrationService} from '../cache/cache-hydration-service.js';
import {
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../cache/cache-constants.js';
import {
  CDCPipelineReadinessGate,
} from '../cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getMissingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
} from '../cache/leader-readiness-gate.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';
import {DynamicConfigService} from '../config/dynamic-config-service.js';
import {
  EPOCH_CONFIG_KEY,
} from '../cdc/cdc-integration-service.js';
import {
  BootstrapSystemTableWriter,
  RoutedSqlSystemTableWriter,
} from './system-table-writer.js';
import {RPCClient} from '../transport/rpc-client.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {ReplicaState} from '../node/replica-state-machine.js';
import {AssignmentEpochManager} from '../rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../rebalancer/assignment-epoch.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {MessageRouterSetup} from './shared/message-router-setup.js';
import {CDCIntegrationSetup} from './shared/cdc-integration-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {LatencyTopologySetup} from './shared/latency-topology-setup.js';
import {assertCritical} from '../utils/assert.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {NODE_CONFIG_KEY} from '../node/node-constants.js';
import {PARTITION_STATE} from '../partition/partition-constants.js';
import {PARTITION_SERVICE_INIT_STAGE} from '../partition/partition-service-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
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
  registerBuiltInMetaServiceDefinitions,
  registerBuiltInMetaServiceEndpoints,
} from './shared/meta-service-definition-registration.js';
import {
  PgWireStartupSafetyGate,
} from './pgwire-startup-safety-gate.js';
import {
  RuntimeServiceHandlerSetup,
} from './shared/runtime-service-handler-setup.js';
import {
  ReplicaCreationProgressReporter,
} from '../utils/replica-creation-progress-reporter.js';
import {createSeedPhaseOwners} from './owners/seed-phase-owners.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';
import {createSeedStartupPlan} from './pipeline/seed-startup-plan.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {BOOTSTRAP_SUB_PHASE} from '../node/node-constants.js';
import {
  MessageGroupServiceAdapter,
  PartitionServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../service/index.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  RUNTIME_KIND,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  UNIFIED_SERVICE_TYPE,
  CDC_OPERATION,
} from '../constants/index.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const BootstrapEvent = BOOTSTRAP_EVENT;
const BootstrapLog = BOOTSTRAP_LOG_MSG;
const bootstrapError = BOOTSTRAP_ERROR;
const routerInitFailed = bootstrapError.routerInitFailed;
const messageGroupLeadershipTimeout = bootstrapError.messageGroupLeadershipTimeout;
const partitionLeadershipTimeout = bootstrapError.partitionLeadershipTimeout;
const DEFAULT_BOOTSTRAP_CONFIG = BOOTSTRAP_DEFAULT;
const DEFAULT_CACHE_SYNC_TABLES = new Set(CACHE_HYDRATION_TABLES);
const BOOTSTRAP_REPLICA_REGISTRATION_PROGRESS_INTERVAL = 10;
const BOOTSTRAP_REPLICA_STATE_TRANSITIONS_PER_REPLICA = 4;

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
    this.config.replicaRegistrationTraceEnabled =
      this.config.replicaRegistrationTraceEnabled === true;
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
    return {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: this.nodeId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
        BOOTSTRAP_UNIFIED_RECONCILE.RUNTIME_KIND,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null,
    };
  }

  /**
   * Queue a bootstrap replica in desired state and option catalogs.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   * @private
   */
  queueBootstrapServiceReplica(descriptor, options) {
    const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    this.bootstrapDesiredServiceDefinitions.set(serviceId, descriptor);
    this.bootstrapReplicaOptionsByServiceId.set(serviceId, options);
  }

  /**
   * Resolve bootstrap replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   * @private
   */
  resolveBootstrapReplicaOptions(serviceId, serviceType) {
    const options = this.bootstrapReplicaOptionsByServiceId.get(serviceId) || null;
    assertCritical(
      options,
      `Missing bootstrap replica options for service ${serviceId}`,
    );
    assertCritical(
      options.serviceType === serviceType,
      `Bootstrap service type mismatch for ${serviceId}: expected ${serviceType}`,
    );
    return options;
  }

  /**
   * Build local actual-state rows for bootstrap service reconciliation.
   * @return {Object[]}
   * @private
   */
  buildBootstrapActualStateRows() {
    if (!this.serviceLifecycleManager) {
      return [];
    }

    const rows = [];

    for (const replicaId of this.messageGroupServices.keys()) {
      const handle = this.createBootstrapServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }

    for (const replicaId of this.partitionServices.keys()) {
      const handle = this.createBootstrapServiceDescriptor(
        UNIFIED_SERVICE_TYPE.PARTITION,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }

    return rows;
  }

  /**
   * Initialize unified lifecycle owners for bootstrap orchestration.
   * @return {Promise<void>}
   * @private
   */
  async initializeUnifiedLifecycleOwners() {
    if (this.serviceLifecycleManager && this.serviceReconciler) {
      return;
    }

    this.serviceLifecycleManager = new ServiceLifecycleManager();
    this.serviceLifecycleManager.registerAdapter(
      new MessageGroupServiceAdapter({
        createReplica: (context) => this.createBootstrapMessageGroupReplica(context),
        startReplica: (replicaHandle, context) =>
          this.startBootstrapMessageGroupReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          this.stopBootstrapMessageGroupReplica(replicaHandle, context),
      }),
    );
    this.serviceLifecycleManager.registerAdapter(
      new PartitionServiceAdapter({
        createReplica: (context) => this.createBootstrapPartitionReplica(context),
        startReplica: (replicaHandle, context) =>
          this.startBootstrapPartitionReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          this.stopBootstrapPartitionReplica(replicaHandle, context),
      }),
    );
    this.serviceLifecycleManager.registerAdapter(
      new RuntimeServiceAdapter({
        serviceRuntimeLifecycle: this.serviceRuntimeLifecycle,
      }),
    );

    this.serviceReconciler = new ServiceReconciler({
      lifecycleManager: this.serviceLifecycleManager,
      desiredStateReader: async () =>
        [...this.bootstrapDesiredServiceDefinitions.values()],
      actualStateReader: async () => this.buildBootstrapActualStateRows(),
      checkIntervalMs: BOOTSTRAP_UNIFIED_RECONCILE.CHECK_INTERVAL_MS,
      maxConcurrentServiceActions: this.config.maxConcurrentServiceActions,
    });

    await this.serviceReconciler.start();
  }

  /**
   * Trigger one bootstrap reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async triggerBootstrapReconciler(reason) {
    assertCritical(
      this.serviceReconciler,
      'Bootstrap reconciler must be initialized before reconciliation',
    );
    await this.serviceReconciler.trigger(reason, {
      nodeId: this.nodeId,
      phase: this.phase,
    });
  }

  /**
   * Stop unified lifecycle owners and clear bootstrap desired-state catalogs.
   * @return {void}
   * @private
   */
  stopUnifiedLifecycleOwners() {
    if (this.serviceReconciler) {
      this.serviceReconciler.stop();
      this.serviceReconciler = null;
    }
    this.serviceLifecycleManager = null;
    this.bootstrapDesiredServiceDefinitions.clear();
    this.bootstrapReplicaOptionsByServiceId.clear();
  }

  /**
   * Unified lifecycle create hook for message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createBootstrapMessageGroupReplica(context) {
    const definition = context?.definition || {};
    const serviceId = definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );

    if (this.messageGroupServices.has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      await this.sleep(options.createDelayMs);
    }

    const messageGroup = new MessageGroupService({
      groupId: options.groupId,
      replicaId: options.replicaId,
      nodeId: this.nodeId,
      replicaIds: options.replicaIds,
      peerAddresses: options.peerAddresses,
      transport: this.messageRouter,
      deferElection: Boolean(options.deferElection),
    });

    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${options.replicaId}`;
    this.messageRouter.register(unifiedAddress, (envelope) => {
      return messageGroup.receiveMessage(envelope);
    });

    await messageGroup.initialize();

    this.messageGroupServices.set(options.replicaId, messageGroup);
    this.messageGroupReplicas.push(messageGroup);
    this.servicesCreated++;

    this.logger.debug(BootstrapLog.MESSAGE_GROUP_REPLICA_CREATED, {
      groupId: options.groupId,
      replicaId: options.replicaId,
      replicaIndex: options.replicaIndex,
      nodeId: this.nodeId,
    });

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startBootstrapMessageGroupReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroup = this.messageGroupServices.get(options.replicaId);

    assertCritical(
      messageGroup,
      `Message-group replica ${options.replicaId} missing at start`,
    );

    if (!options.deferElection) {
      messageGroup.startElection();
    }

    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }

  /**
   * Unified lifecycle stop hook for message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopBootstrapMessageGroupReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroup = this.messageGroupServices.get(options.replicaId);
    if (!messageGroup) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (messageGroup.shutdown) {
      await messageGroup.shutdown();
    }

    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${options.replicaId}`;
    if (this.messageRouter) {
      this.messageRouter.unregister(unifiedAddress);
    }

    this.messageGroupServices.delete(options.replicaId);
    this.messageGroupReplicas = this.messageGroupReplicas.filter(
      (service) => service !== messageGroup,
    );

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Unified lifecycle create hook for partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createBootstrapPartitionReplica(context) {
    const definition = context?.definition || {};
    const serviceId = definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );

    if (this.partitionServices.has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      await this.sleep(options.createDelayMs);
    }

    const progress = this.startPartitionReplicaProgress({
      tableName: options.tableName,
      partitionId: options.partitionId,
      replicaId: options.replicaId,
      peerTotal: Math.max(NUM.ZERO, options.replicaIds.length - NUM.ONE),
    });

    try {
      const partition = new PartitionService({
        partitionId: options.partitionId,
        tableId: options.tableName,
        tableName: options.tableName,
        schema: options.schema,
        keyRange: {start: null, end: null},
        replicaId: options.replicaId,
        replicaIds: options.replicaIds,
        peerAddresses: options.peerAddresses,
        nodeId: this.nodeId,
        transport: this.transport,
        dbPath: options.dbPath,
        messageGroupService: this.getLeaderMessageGroupService(),
        messageRouter: this.messageRouter,
        rebalanceCoordinator: this.rebalanceCoordinator,
        deferElection: Boolean(options.deferElection),
        suppressLifecycleLogs: true,
        onInitializationStage: (stageEvent) =>
          this.updatePartitionReplicaProgress(progress, stageEvent),
      });

      await partition.initialize();
      this.partitionServices.set(options.replicaId, partition);
      this.partitionReplicas.push(partition);
      this.servicesCreated++;
      this.finishPartitionReplicaProgress(progress);

      this.logger.debug(BootstrapLog.PARTITION_REPLICA_CREATED, {
        tableName: options.tableName,
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        replicaIndex: options.replicaIndex,
        nodeId: this.nodeId,
      });
    } catch (error) {
      this.failPartitionReplicaProgress(progress, error);
      throw error;
    }

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startBootstrapPartitionReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );
    const partition = this.partitionServices.get(options.replicaId);

    assertCritical(
      partition,
      `Partition replica ${options.replicaId} missing at start`,
    );

    if (!options.deferElection) {
      partition.startElection();
    }

    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }

  /**
   * Unified lifecycle stop hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopBootstrapPartitionReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveBootstrapReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.PARTITION,
    );
    const partition = this.partitionServices.get(options.replicaId);
    if (!partition) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (partition.shutdown) {
      await partition.shutdown();
    }

    const unifiedAddress = partition.getUnifiedAddress ?
      partition.getUnifiedAddress() :
      `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
      `${ADDRESS.SEPARATOR}${options.replicaId}`;
    if (this.messageRouter) {
      this.messageRouter.unregister(unifiedAddress);
    }

    this.partitionServices.delete(options.replicaId);
    this.partitionReplicas = this.partitionReplicas.filter(
      (service) => service !== partition,
    );

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Compatibility shim for deferred election activation during bootstrap.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @return {Promise<void>}
   * @private
   */
  async startDeferredBootstrapReplicaElections() {
    if (this.messageGroupReplicas && this.messageGroupReplicas.length > NUM.ZERO) {
      this.logger.info(BootstrapLog.STARTING_MG_ELECTIONS, {
        totalReplicas: this.messageGroupReplicas.length,
        nodeId: this.nodeId,
      });

      for (const messageGroup of this.messageGroupReplicas) {
        messageGroup.startElection();
      }

      // Wait for message group leadership before starting partition elections
      // This ensures message groups are stable before partitions start electing
      await this.waitForMessageGroupLeadership(
        INITIAL_MESSAGE_GROUP_ID,
        INITIAL_MESSAGE_GROUP_REPLICA_IDS,
      );

      this.logger.debug(BootstrapLog.MESSAGE_GROUP_LEADERSHIP_READY, {
        groupId: INITIAL_MESSAGE_GROUP_ID,
        nodeId: this.nodeId,
      });
    }

    this.logger.info(BootstrapLog.STARTING_PARTITION_ELECTIONS, {
      totalReplicas: this.partitionReplicas.length,
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });

    for (const partition of this.partitionReplicas) {
      partition.startElection();
    }
  }

  /**
   * Phase 1: Infrastructure setup.
   * Initialize node service and transport.
   * Requirements: 2.1, 2.2, 2.3 - Use WebSocket-based transport for message groups.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<void>}
   * @private
   */
  async phaseInfrastructure() {
    // Initialize configuration if not already done
    const configManager = ConfigurationManager.getInstance();
    if (!configManager.isInitialized()) {
      configManager.initialize({
        node: {id: this.nodeId},
      });
    }

    // Get or generate node ID
    this.nodeId = this.nodeId || configManager.get(NODE_CONFIG_KEY.ID) || uuidv4();

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });
    }

    this.nodeId = nodeService.getNodeId();
    this.nodeAddress = nodeService.getNodeAddress();

    // Determine WebSocket port from config or options
    const wsPort = this.wsPort || this.config.wsPort;

    // Route message-router setup through the shared owner.
    try {
      this.messageRouter = await MessageRouterSetup.create({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: wsPort,
      });
    } catch (error) {
      this.logger.error(BootstrapLog.ROUTER_INIT_FAILED, {
        nodeId: this.nodeId,
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(routerInitFailed(error.message));
    }

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    // No MessageGroupTransport needed - all messages go through MessageRouter
    if (typeof this.messageRouter.setQueryMessageGroupServiceResolver === 'function') {
      this.messageRouter.setQueryMessageGroupServiceResolver(() =>
        this.getLeaderMessageGroupService(),
      );
    }
    this.transport = this.messageRouter;

    this.logger.debug(BootstrapLog.INFRA_READY, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
      hasMessageRouter: !!this.messageRouter,
      hasSelfConnection: wsPort ? this.messageRouter.hasSelfConnection() : false,
      owner: 'MessageRouterSetup',
    });

    await this.initializeUnifiedLifecycleOwners();
    await this.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.INFRA_READY_REASON,
    );
  }


  /**
   * Phase 2: Message group creation.
   * Create initial message group with 3 replicas on seed node.
   * Elections are DEFERRED until after partitions are created to prevent election storms.
   * Requirements: 2.1, 2.2 - Use WebSocket-based transport for message groups.
   * @return {Promise<void>}
   * @private
   */
  async phaseMessageGroups() {
    const groupId = INITIAL_MESSAGE_GROUP_ID;
    const replicaIds = INITIAL_MESSAGE_GROUP_REPLICA_IDS;
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    this.logger.debug(BootstrapLog.CREATING_MESSAGE_GROUP, {
      groupId,
      replicaCount: replicaIds.length,
      nodeId: this.nodeId,
    });

    this.messageGroupReplicas = [];
    const peerAddresses = replicaIds.map((replicaId) =>
      `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );
    for (let index = NUM.ZERO; index < replicaIds.length; index++) {
      const replicaId = replicaIds[index];
      this.queueBootstrapServiceReplica(
        this.createBootstrapServiceDescriptor(
          UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          replicaId,
        ),
        {
          serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          groupId,
          replicaId,
          replicaIds,
          replicaIndex: index,
          peerAddresses,
          deferElection: true,
          createDelayMs: index > NUM.ZERO ?
            index * replicaStaggerDelayMs :
            NUM.ZERO,
        },
      );
    }

    await this.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );
    this.messageGroupsCreated++;
    this.logger.debug(BootstrapLog.MESSAGE_GROUPS_CREATED_DEFERRED, {
      groupId,
      replicaCount: this.messageGroupReplicas.length,
      nodeId: this.nodeId,
    });
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
    const startTime = Date.now();
    const timeoutMs = this.config.leadershipWaitTimeoutMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitBackoffMultiplier;

    this.logger.debug(BootstrapLog.WAITING_MESSAGE_GROUP_LEADER, {
      groupId,
      timeoutMs,
      nodeId: this.nodeId,
    });

    // Check immediately first (no delay) - leadership may already be established
    for (const replicaId of replicaIds) {
      const service = this.messageGroupServices.get(replicaId);
      if (service && service.isLeaderReplica()) {
        this.logger.debug(BootstrapLog.MESSAGE_GROUP_LEADER_IMMEDIATE, {
          groupId,
          leaderId: replicaId,
          elapsedMs: NUM.ZERO,
        });
        return;
      }
    }

    while (Date.now() - startTime < timeoutMs) {
      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      // Check if any replica is leader
      for (const replicaId of replicaIds) {
        const service = this.messageGroupServices.get(replicaId);
        if (service && service.isLeaderReplica()) {
          this.logger.debug(BootstrapLog.MESSAGE_GROUP_LEADER_FOUND, {
            groupId,
            leaderId: replicaId,
            elapsedMs: Date.now() - startTime,
          });
          return;
        }
      }
    }

    // Timeout - fail bootstrap
    const error = new Error(
      messageGroupLeadershipTimeout(groupId, timeoutMs),
    );
    error.groupId = groupId;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Wait for all system table partitions to establish leadership.
   * This ensures writes can succeed during the registration phase.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeadership() {
    const startTime = Date.now();
    // Wait up to leadershipWaitTimeoutMs (capped by TIMEOUT_CAP_MS) for partition leadership
    // Raft election takes 150-300ms per partition, and elections happen in parallel
    // so this should be enough for all 12 system table partitions
    const timeoutMs = Math.min(
      this.config.leadershipWaitTimeoutMs || DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitTimeoutMs,
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
    );
    let delay = this.config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoffMultiplier = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;

    // Get unique partition IDs (multiple replicas per partition)
    const partitionIds = new Set();
    for (const partition of this.partitionServices.values()) {
      partitionIds.add(partition.partitionId);
    }

    this.logger.debug(BootstrapLog.WAITING_PARTITION_LEADERS, {
      partitionCount: partitionIds.size,
      timeoutMs,
      nodeId: this.nodeId,
    });

    // Check immediately first (no delay) - leadership may already be established
    const leadersFound = this.checkPartitionLeaders(partitionIds);
    if (leadersFound.size === partitionIds.size) {
      this.logger.debug(BootstrapLog.PARTITION_LEADERS_IMMEDIATE, {
        partitionCount: partitionIds.size,
        elapsedMs: NUM.ZERO,
      });
      return;
    }

    while (Date.now() - startTime < timeoutMs) {
      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      // Check if all partitions have leaders
      const leaders = this.checkPartitionLeaders(partitionIds);
      if (leaders.size === partitionIds.size) {
        this.logger.debug(BootstrapLog.PARTITION_LEADERS_FOUND, {
          partitionCount: partitionIds.size,
          elapsedMs: Date.now() - startTime,
        });
        return;
      }
    }

    // Timeout - fail bootstrap to avoid writing before leadership is established.
    const leaders = this.checkPartitionLeaders(partitionIds);
    const missing = [...partitionIds].filter((id) => !leaders.has(id));
    this.logger.error(BootstrapLog.PARTITION_LEADERS_PENDING, {
      totalPartitions: partitionIds.size,
      leadersFound: leaders.size,
      missingLeaders: missing,
      elapsedMs: Date.now() - startTime,
      nodeId: this.nodeId,
    });

    const error = new Error(
      partitionLeadershipTimeout(missing, timeoutMs),
    );
    error.missingLeaders = missing;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Wait for system leadership info to appear in the system cache.
   * Ensures leaders and leader_node_id values are present before seeding.
   * @return {Promise<void>}
   * @private
   */
  async waitForSystemServiceLeadersInCache() {
    const cache = this.getSystemTableCache();
    const timeoutMs = this.config.leadershipWaitTimeoutMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitBackoffMultiplier;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const missing = getMissingSystemServiceLeaders(cache, {
        requireLeaderNodeId: true,
      });
      const missingCount = getMissingSystemServiceLeaderCount(missing);

      if (missingCount === NUM.ZERO) {
        return;
      }

      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    const missing = getMissingSystemServiceLeaders(cache, {
      requireLeaderNodeId: true,
    });
    const allMissing = [
      ...missing.missingPartitionLeaders,
      ...missing.missingMessageGroupLeaders,
      ...missing.missingPartitionLeaderNodes,
      ...missing.missingMessageGroupLeaderNodes,
      ...missing.missingPartitionLeaderAddresses,
      ...missing.missingMessageGroupLeaderAddresses,
    ];
    const error = new Error(partitionLeadershipTimeout(allMissing, timeoutMs));
    error.missingLeaders = missing;
    error.missingCount = getMissingSystemServiceLeaderCount(missing);
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Wait for a node to appear as ready in the system table cache.
   * Ensures ready node list is usable by joining nodes.
   * @param {string} nodeId - Node ID to verify.
   * @return {Promise<void>}
   * @private
   */
  async waitForReadyNodeInCache(nodeId) {
    const cache = this.getSystemTableCache();
    const timeoutMs = this.config.leadershipWaitTimeoutMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier ||
      DEFAULT_BOOTSTRAP_CONFIG.leadershipWaitBackoffMultiplier;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const now = Date.now();
      const node = cache.get(TABLES.NODES, nodeId);
      if (isNodeRecordReady(node, {now})) {
        return;
      }

      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    try {
      await this.repairPropagatedCacheTablesFromLocalPartitions({
        reason: 'ready_node_timeout',
        targetNodeId: nodeId,
      });
      const repairedNode = cache.get(TABLES.NODES, nodeId);
      if (isNodeRecordReady(repairedNode, {now: Date.now()})) {
        return;
      }
    } catch (error) {
      this.logger.error(
        'Failed to repair propagated cache tables after ready-node cache timeout',
        {
          nodeId: this.nodeId,
          targetNodeId: nodeId,
          error: error?.message || String(error),
        },
      );
    }

    throw new Error(bootstrapError.seedReadyTimeout(nodeId, timeoutMs));
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
    const systemTableCache = this.getSystemTableCache();
    const hydrationMessageGroup = assertCritical(
      this.getLeaderMessageGroupService(),
      bootstrapError.CDC_HYDRATION_MISSING,
    );
    const result = await this.hydrateFromLocalPartitions(
      systemTableCache,
      hydrationMessageGroup,
    );
    if (result?.success === false ||
        (Array.isArray(result?.errors) && result.errors.length > NUM.ZERO)) {
      const errorDetails = (result?.errors || [])
        .map((entry) => `${entry.tableName}:${entry.error}`)
        .join(', ');
      throw new Error(
        'Failed to repair propagated cache tables from local partitions' +
          (errorDetails ? ` (${errorDetails})` : ''),
      );
    }

    this.logger.warn('Repaired propagated cache tables from local partitions', {
      nodeId: this.nodeId,
      reason: options.reason || null,
      targetNodeId: options.targetNodeId || null,
      tablesHydrated: Object.keys(result?.tables || {}).length,
      totalRows: this.countTotalRows(result),
    });
    return result;
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds - Partition IDs to check.
   * @return {Set<string>} Partition IDs that have leaders.
   * @private
   */
  checkPartitionLeaders(partitionIds) {
    const leadersFound = new Set();
    for (const partition of this.partitionServices.values()) {
      if (partition.isLeader && partitionIds.has(partition.partitionId)) {
        leadersFound.add(partition.partitionId);
      }
    }
    return leadersFound;
  }

  /**
   * Ensure CDC integration service is initialized for bootstrap writes.
   * @return {CDCIntegrationService} CDC integration service.
   * @private
   */
  ensureBootstrapCdcIntegrationService() {
    if (this.cdcIntegrationService) {
      return this.cdcIntegrationService;
    }

    this.cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    });

    this.logger.debug('CDC integration initialized by owner', {
      nodeId: this.nodeId,
      owner: 'CDCIntegrationSetup',
      mode: 'bootstrap',
    });

    const cdcIntegrationService = this.cdcIntegrationService;
    return cdcIntegrationService;
  }

  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   * @private
   */
  ensureLatencyTopologyOwners() {
    if (this.latencyTopology) {
      return this.latencyTopology;
    }

    this.latencyTopology = LatencyTopologySetup.create({
      nodeId: this.nodeId,
      systemTableCache: this.getSystemTableCache(),
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
    });
    this.latencyTopology.latencyTreeService.start({
      recomputeImmediately: true,
    });
    this.latencyTopology.cdcGroupPropagationService.start();

    this.logger.info(BootstrapLog.LATENCY_TOPOLOGY_READY, {
      nodeId: this.nodeId,
      owner: 'LatencyTopologySetup',
    });
    return this.latencyTopology;
  }

  /**
   * Start latency topology lifecycle owners.
   * Runs assignment lifecycle without blocking bootstrap readiness.
   * @private
   */
  startLatencyTopologyLifecycle() {
    const topologyOwners = assertCritical(
      this.latencyTopology,
      bootstrapError.LATENCY_TOPOLOGY_MISSING,
    );
    LatencyTopologySetup.start(topologyOwners);
    this.logger.info(BootstrapLog.LATENCY_TOPOLOGY_STARTED, {
      nodeId: this.nodeId,
      owner: 'LatencyTopologySetup',
    });
  }

  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   * @private
   */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    const topologyOwners = assertCritical(
      this.latencyTopology,
      bootstrapError.LATENCY_TOPOLOGY_MISSING,
    );
    return topologyOwners.cdcGroupPropagationService.propagateCDCEvent({
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      data: cdcEvent.data,
      sourceMessageGroupService: messageGroupService,
    });
  }

  /**
   * Ensure system table writer is initialized for bootstrap writes.
   * @return {BootstrapSystemTableWriter|RoutedSqlSystemTableWriter}
   * @private
   */
  ensureSystemTableWriter() {
    if (!this.systemTableWriter) {
      const cdcIntegrationService = this.ensureBootstrapCdcIntegrationService();
      this.systemTableWriter = new BootstrapSystemTableWriter(
        cdcIntegrationService,
        this.partitionServices,
      );
    }

    return this.systemTableWriter;
  }

  /**
   * Swap writer to routed SQL implementation once cache is hydrated.
   * @private
   */
  swapSystemTableWriter() {
    if (!this.cdcIntegrationService) {
      return;
    }

    if (this.systemTableWriter && this.systemTableWriter.disable) {
      this.systemTableWriter.disable();
      this.logger.debug(BootstrapLog.BOOTSTRAP_MODE_DISABLED, {
        nodeId: this.nodeId,
      });
    }

    this.systemTableWriter = new RoutedSqlSystemTableWriter(
      this.cdcIntegrationService,
    );
    this.systemTableWriter.enable();
  }

  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first message group service that is a leader, or any available service.
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService() {
    // First try to find a leader
    for (const service of this.messageGroupServices.values()) {
      if (service && service.isLeaderReplica && service.isLeaderReplica()) {
        return service;
      }
    }
    // Fall back to any available service
    for (const service of this.messageGroupServices.values()) {
      if (service) {
        return service;
      }
    }
    return null;
  }

  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current local leader when available and falls back to
   * the captured message-group service.
   * @param {Object|null} preferredMessageGroupService
   * @return {Object|null}
   */
  resolveCdcPropagationMessageGroup(preferredMessageGroupService) {
    const leaderMessageGroupService = this.getLeaderMessageGroupService();
    if (leaderMessageGroupService) {
      return leaderMessageGroupService;
    }
    return preferredMessageGroupService || null;
  }

  /**
   * Start progress reporting for one partition replica creation.
   * @param {Object} details - Replica progress details.
   * @return {Object} Reporter progress context.
   * @private
   */
  startPartitionReplicaProgress(details) {
    return this.partitionReplicaProgressReporter.start({
      ...details,
      stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
      peerTotal: Math.max(NUM.ZERO, details.peerTotal || NUM.ZERO),
      peerJoined: NUM.ZERO,
    });
  }

  /**
   * Update partition creation progress based on stage callbacks.
   * @param {Object|null} progress - Reporter progress context.
   * @param {Object} stageEvent - Stage event from PartitionService.
   * @private
   */
  updatePartitionReplicaProgress(progress, stageEvent) {
    if (!progress || !stageEvent) {
      return;
    }

    const update = {};
    if (stageEvent.stage) {
      update.stage = stageEvent.stage;
    }
    if (Number.isFinite(stageEvent.peerTotal)) {
      update.peerTotal = Math.max(NUM.ZERO, stageEvent.peerTotal);
    }
    if (Number.isFinite(stageEvent.peerJoined)) {
      update.peerJoined = Math.max(NUM.ZERO, stageEvent.peerJoined);
    }
    if (stageEvent.peerId) {
      update.peerId = stageEvent.peerId;
    }
    if (Number.isFinite(stageEvent.sizeBytes)) {
      update.sizeBytes = stageEvent.sizeBytes;
    }

    this.partitionReplicaProgressReporter.update(progress, update);
  }

  /**
   * Complete partition creation progress reporting.
   * @param {Object|null} progress - Reporter progress context.
   * @private
   */
  finishPartitionReplicaProgress(progress) {
    this.partitionReplicaProgressReporter.finish(progress, {
      stage: PARTITION_SERVICE_INIT_STAGE.READY,
    });
  }

  /**
   * Fail partition creation progress reporting.
   * @param {Object|null} progress - Reporter progress context.
   * @param {Error|string|null} error - Failure reason.
   * @private
   */
  failPartitionReplicaProgress(progress, error) {
    this.partitionReplicaProgressReporter.fail(progress, error);
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
    const spinner = progress.spinnerFrame || BOOTSTRAP_REPLICA_PROGRESS.SPINNER_IDLE;
    const peerTotal = Number.isFinite(progress.peerTotal) ? progress.peerTotal : NUM.ZERO;
    const peerJoined = Number.isFinite(progress.peerJoined) ? progress.peerJoined : NUM.ZERO;
    const localReplicas = this.partitionServices.size + (status ? NUM.ZERO : NUM.ONE);
    const statusText = status ? ` status=${status}` : '';
    const errorText = error ? ` error=${this.formatReplicaCreationError(error)}` : '';

    return (
      `${BOOTSTRAP_REPLICA_PROGRESS.PREFIX} ${spinner} ` +
      `service=${progress.partitionId} replica=${progress.replicaId} ` +
      `type=${BOOTSTRAP_REPLICA_PROGRESS.TYPE_PARTITION} stage=${progress.stage} ` +
      `peers=${peerJoined}/${peerTotal} local_replicas=${localReplicas}` +
      `${statusText}${errorText}`
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
    const context = {
      nodeId: this.nodeId,
      partitionId: progress.partitionId,
      tableName: progress.tableName,
      replicaId: progress.replicaId,
      stage: progress.stage,
      peerTotal: progress.peerTotal,
      peerJoined: progress.peerJoined,
      localReplicas: this.partitionServices.size,
    };
    if (status) {
      context.status = status;
    }
    if (error) {
      context.error = this.formatReplicaCreationError(error);
    }
    return context;
  }

  /**
   * Normalize replica creation errors for display.
   * @param {Error|string|null} error - Error value.
   * @return {string} Error message.
   * @private
   */
  formatReplicaCreationError(error) {
    if (!error) {
      return STRING.EMPTY;
    }
    return typeof error === 'string' ? error : error.message;
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
   * Create partitions for all system tables.
   * Elections are deferred until ALL partitions are created to prevent election storms.
   * @return {Promise<void>}
   * @private
   */
  async phasePartitions() {
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;
    let queuedPartitionReplicaCount = NUM.ZERO;
    this.partitionReplicas = [];

    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];

      this.logger.debug(BootstrapLog.CREATING_SYSTEM_PARTITION, {
        tableName,
        partitionId,
        replicaCount: replicaIds.length,
        nodeId: this.nodeId,
      });

      const peerAddresses = replicaIds.map((replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`,
      );
      for (let index = NUM.ZERO; index < replicaIds.length; index++) {
        const replicaId = replicaIds[index];
        let dbPath = DEFAULT_BOOTSTRAP_CONFIG.partitionDbPath;
        if (this.dataDirectoryManager && this.dataDirectoryManager.isInitialized()) {
          dbPath = this.dataDirectoryManager.getPartitionDbPath(partitionId, replicaId);
        } else if (this.config.partitionDbPath) {
          dbPath = this.config.partitionDbPath;
        }

        this.queueBootstrapServiceReplica(
          this.createBootstrapServiceDescriptor(
            UNIFIED_SERVICE_TYPE.PARTITION,
            replicaId,
          ),
          {
            serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
            tableName,
            schema,
            partitionId,
            replicaId,
            replicaIds,
            replicaIndex: index,
            peerAddresses,
            dbPath,
            deferElection: true,
            createDelayMs: index > NUM.ZERO ?
              index * replicaStaggerDelayMs :
              NUM.ZERO,
          },
        );
        queuedPartitionReplicaCount++;
      }
    }

    const firstBatchReplicaCount = Math.min(
      queuedPartitionReplicaCount,
      this.config.maxConcurrentServiceActions,
    );
    this.logger.info(BootstrapLog.PARTITION_CREATION_BATCH_STARTING, {
      nodeId: this.nodeId,
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
      queuedReplicaCount: queuedPartitionReplicaCount,
      firstBatchReplicaCount,
      maxConcurrentServiceActions: this.config.maxConcurrentServiceActions,
    });
    await this.triggerBootstrapReconciler(
      BOOTSTRAP_UNIFIED_RECONCILE.PARTITIONS_REASON,
    );
    this.partitionsCreated = SYSTEM_TABLE_SCHEMAS.length;

    await this.startDeferredBootstrapReplicaElections();

    if (this.serviceReconciler) {
      this.serviceReconciler.stop();
    }
    await this.initializeEpochManager();

    this.logger.debug(BootstrapLog.PARTITIONS_CREATED, {
      partitionsCreated: this.partitionsCreated,
      nodeId: this.nodeId,
    });
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch.
   * Creates epoch 0 with all partition assignments from the seed node.
   * Requirements: 3.4, 4.1 - Epoch-based initialization
   * @private
   */
  async initializeEpochManager() {
    // Build initial assignments from created partitions
    // Map partitionId -> [nodeId] (all replicas on seed node initially)
    const initialAssignments = {};

    // Track unique partition IDs (multiple replicas per partition)
    const partitionNodes = new Map();

    for (const [_replicaId, partition] of this.partitionServices) {
      const partitionId = partition.partitionId;
      if (!partitionNodes.has(partitionId)) {
        partitionNodes.set(partitionId, []);
      }
      // All replicas are on this seed node during bootstrap
      if (!partitionNodes.get(partitionId).includes(this.nodeId)) {
        partitionNodes.get(partitionId).push(this.nodeId);
      }
    }

    // Convert to assignments format
    for (const [partitionId, nodes] of partitionNodes) {
      initialAssignments[partitionId] = nodes;
    }

    // Create the epoch manager
    this.epochManager = new AssignmentEpochManager({
      nodeId: this.nodeId,
      timestampProvider: () => new Date().toISOString(),
    });

    const persistedEpoch = await this.loadPersistedEpochFromLocalConfigPartition();
    if (persistedEpoch) {
      this.epochManager.initialize(persistedEpoch);
    } else {
      // Create initial epoch (epoch 0) with the assignments
      const initialEpoch = new AssignmentEpoch({
        epoch: NUM.ZERO,
        assignments: initialAssignments,
        timestamp: new Date().toISOString(),
        proposedBy: this.nodeId,
      });

      // Initialize the manager with the initial epoch
      this.epochManager.initialize(initialEpoch);
    }

    this.logger.info(BootstrapLog.EPOCH_MANAGER_READY, {
      nodeId: this.nodeId,
      epoch: this.epochManager.getCurrentEpoch().epoch,
      partitionCount: Object.keys(initialAssignments).length,
      assignments: initialAssignments,
    });
  }

  /**
   * Load persisted assignment epoch from the local config partition if present.
   * @return {Promise<AssignmentEpoch|null>} Persisted epoch or null when absent.
   * @private
   */
  async loadPersistedEpochFromLocalConfigPartition() {
    const configReplicaIds = INITIAL_REPLICA_IDS[SystemTableName.CONFIG] || [];
    for (const replicaId of configReplicaIds) {
      const configPartition = this.partitionServices.get(replicaId);
      if (!configPartition) {
        continue;
      }

      try {
        const result = await configPartition.executeLocalQuery(
          'SELECT config_value FROM config WHERE config_key = ?',
          [EPOCH_CONFIG_KEY],
        );
        const hasRow = result?.success &&
          Array.isArray(result.rows) &&
          result.rows.length > NUM.ZERO;
        if (!hasRow) {
          continue;
        }

        const configValue = result.rows[NUM.ZERO]?.[COLUMN.CONFIG_VALUE];
        if (typeof configValue !== 'string' || configValue.length === NUM.ZERO) {
          continue;
        }

        return AssignmentEpoch.fromJSON(configValue);
      } catch (error) {
        this.logger.warn(BootstrapLog.CONFIG_CHECK_FAILED, {
          nodeId: this.nodeId,
          replicaId,
          error: error.message,
        });
      }
    }

    return null;
  }

  /**
   * Apply authoritative epoch from the current cache snapshot.
   * @private
   */
  applyCurrentEpochFromCache() {
    if (!this.cdcIntegrationService || !this.epochManager) {
      return;
    }

    const systemTableCache = this.getSystemTableCache();
    const epochRow = systemTableCache?.get(TABLES.CONFIG, EPOCH_CONFIG_KEY);
    if (!epochRow) {
      return;
    }

    this.cdcIntegrationService.handleEpochChangeCDC({
      tableName: TABLES.CONFIG,
      operation: CDC_OPERATION.UPSERT,
      data: {
        ...epochRow,
        [COLUMN.CONFIG_KEY]: epochRow[COLUMN.CONFIG_KEY] || EPOCH_CONFIG_KEY,
      },
    });
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
    this.logger.debug(BootstrapLog.CDC_SUBSCRIPTION_START, {
      tableName,
      partitionId,
      replicaIds,
    });

    const messageGroups = [...this.messageGroupServices.values()];

    // Subscribe each message-group CDC handler once per table.
    // Replicas still register per-replica partition listeners below.
    for (const messageGroup of messageGroups) {
      await messageGroup.subscribeToCDC(tableName);
    }

    // Subscribe to ALL replicas since any could become leader
    // and the query executor routes to the current leader
    for (const replicaId of replicaIds) {
      const partition = this.partitionServices.get(replicaId);
      if (!partition) {
        this.logger.warn(BootstrapLog.CDC_PARTITION_MISSING, {
          tableName,
          replicaId,
        });
        continue;
      }

      // Register partition CDC callback for each message-group replica.
      for (const messageGroup of messageGroups) {
        const subscriberId = [
          'bootstrap',
          this.nodeId,
          tableName,
          replicaId,
          messageGroup?.groupId || 'message-group',
        ].join(':');
        // Register CDC handler on this partition replica
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(BootstrapLog.CDC_EVENT_RECEIVED, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              sourceReplica: replicaId,
            });
            const cdcData = cdcEvent?.data && typeof cdcEvent.data === 'object' ?
              cdcEvent.data :
              {};
            const nodeId = cdcData[COLUMN.NODE_ID] || cdcData.id || null;
            let previousNodeRow = null;
            if (tableName === TABLES.NODES && nodeId) {
              const systemTableCache = this.getSystemTableCache();
              const cachedNodeRow = systemTableCache.get(TABLES.NODES, nodeId);
              previousNodeRow = cachedNodeRow ? {...cachedNodeRow} : null;
            }

            // Only apply CDC event if this message group is the leader
            // This ensures CDC events are replicated through Raft to all nodes
            if (tableName === TABLES.NODES) {
              this.handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow);
            }

            const propagationMessageGroupService =
              this.resolveCdcPropagationMessageGroup(messageGroup);
            if (propagationMessageGroupService) {
              await this.propagatePartitionCDCEvent(
                propagationMessageGroupService, cdcEvent,
              );

              if (tableName === TABLES.CONFIG) {
                this.applyCurrentEpochFromCache();
              }
            } else {
              this.logger.warn(
                CDC_LIFECYCLE_LOG_MSG.MESSAGE_GROUP_RESOLUTION_NULL, {
                  tableName: cdcEvent.tableName,
                  operation: cdcEvent.operation,
                  reason: 'no_leader_message_group',
                },
              );
            }
          }
        };
        const handshake = await partition.subscribeToCDCWithHandshake(
          cdcSubscriber,
          {subscriberId},
        );
        this.logger.debug(BootstrapLog.CDC_SUBSCRIPTION_REGISTERED, {
          tableName,
          partitionId,
          replicaId,
          subscriberId: handshake.subscriberId,
          subscriptionEpoch: handshake.subscriptionEpoch,
          catchupMode: handshake.catchup.mode,
          bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed,
        });
      }

      this.logger.debug(BootstrapLog.CDC_SUBSCRIPTION_REGISTERED, {
        tableName,
        partitionId,
        replicaId,
        isLeader: partition.isLeader,
      });
    }
  }

  /**
   * Subscribe to CDC for all initial system tables after cache hydration.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToInitialSystemTableCDC() {
    for (const tableName of CACHE_HYDRATION_TABLES) {
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName] || [];
      if (!partitionId || replicaIds.length === NUM.ZERO) {
        continue;
      }

      await this.subscribeToCDC(tableName, partitionId, replicaIds);
    }
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
    const isReady = isNodeRecordReady(nodeRow, {now});
    const wasReady = isNodeRecordReady(previousRow, {now});

    if (!isReady) {
      this.logger.info('Skipping node-ready rebalance trigger: node not ready', {
        nodeId,
        status: nodeRow.status || null,
        readyLeaseExpiresAt: nodeRow.ready_lease_expires_at || null,
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
    const timestamp = Date.now();

    // Wait for partition leadership before attempting writes
    // This prevents "No leader available for write operation" errors
    await this.waitForPartitionLeadership();
    const systemTableWriter = this.ensureSystemTableWriter();

    // Enable bootstrap mode for direct writes to local partitions
    // This bypasses SQL routing which requires system cache (not yet populated)
    this.logger.debug(BootstrapLog.BOOTSTRAP_MODE_ENABLED, {
      nodeId: this.nodeId,
      partitionCount: this.partitionServices.size,
    });
    systemTableWriter.enable();

    // Register message group
    await this.registerMessageGroup(timestamp);

    // Register all services
    await this.registerServices(timestamp);

    // Register built-in runtime service definitions.
    await this.registerMetaServiceDefinitions();

    // Register system tables metadata
    await this.registerSystemTables(timestamp);

    // Update partition sizes in the partitions table
    await this.updatePartitionSizes();

    // Seed dynamic configuration into config system table
    await this.seedDynamicConfiguration();
    await this.persistCurrentEpochIfMissing();

    this.logger.debug(BootstrapLog.SERVICE_REGISTRATION_COMPLETE, {
      nodeId: this.nodeId,
      servicesCreated: this.servicesCreated,
    });
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroup(now) {
    const systemTableWriter = this.ensureSystemTableWriter();

    const leaderService = this.getLeaderMessageGroupService();
    const leaderNodeId = leaderService?.nodeId || this.nodeId;

    const groupData = {
      group_id: INITIAL_MESSAGE_GROUP_ID,
      group_name: BOOTSTRAP_MESSAGE_GROUP.NAME,
      replica_count: BOOTSTRAP_MESSAGE_GROUP.REPLICA_COUNT,
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      policy: JSON.stringify(BOOTSTRAP_MESSAGE_GROUP.POLICY),
      created_at: now,
      updated_at: now,
    };

    try {
      await systemTableWriter.upsertSystemTableRow(
        SystemTableName.MESSAGE_GROUPS,
        groupData,
      );
      this.logger.debug(BootstrapLog.MESSAGE_GROUP_REGISTERED, {
        groupId: INITIAL_MESSAGE_GROUP_ID,
      });
    } catch (error) {
      this.logger.error(BootstrapLog.MESSAGE_GROUP_REGISTER_FAILED, {
        groupId: INITIAL_MESSAGE_GROUP_ID,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerServices(now) {
    const systemTableWriter = this.ensureSystemTableWriter();

    // Register message group replicas
    for (const [replicaId, service] of this.messageGroupServices) {
      const isLeader = service.isLeaderReplica && service.isLeaderReplica();
      const currentRole = service.getRole ? service.getRole() : null;
      const raftRole = isLeader ?
        RAFT_ROLE.LEADER :
        currentRole || RAFT_ROLE.FOLLOWER;
      // Use unified address format: ${nodeId}/${entityType}/${entityId}
      const unifiedAddress =
        `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replicaId}`;
      const serviceData = {
        service_id: replicaId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: this.nodeId,
        partition_id: null,
        group_id: INITIAL_MESSAGE_GROUP_ID,
        replica_id: replicaId,
        raft_role: raftRole,
        status: SERVICE_STATUS.ACTIVE,
        address: unifiedAddress,
        created_at: now,
        updated_at: now,
      };

      this.logger.debug(BootstrapLog.REGISTERING_SERVICE || 'Registering service', {
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.MESSAGE_GROUP,
        raftRole,
        address: unifiedAddress,
        nodeId: this.nodeId,
      });

      try {
        await systemTableWriter.upsertSystemTableRow(
          SystemTableName.SERVICES,
          serviceData,
        );
      } catch (error) {
        this.logger.error(BootstrapLog.MESSAGE_GROUP_SERVICE_REGISTER_FAILED, {
          replicaId,
          error: error.message,
        });
        throw error;
      }
    }

    // Register partition replicas
    for (const [replicaId, service] of this.partitionServices) {
      const isLeader = service.isLeader === true;
      const currentRole = service.getRole ? service.getRole() : service.role;
      const raftRole = isLeader ?
        RAFT_ROLE.LEADER :
        currentRole || RAFT_ROLE.FOLLOWER;
      const serviceData = {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: this.nodeId,
        partition_id: service.partitionId,
        group_id: null,
        replica_id: replicaId,
        raft_role: raftRole,
        status: SERVICE_STATUS.ACTIVE,
        // Use unified address format: ${nodeId}/${entityType}/${entityId}
        address: `${this.nodeId}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SystemTableName.SERVICES,
          serviceData,
        );
      } catch (error) {
        this.logger.error(BootstrapLog.PARTITION_SERVICE_REGISTER_FAILED, {
          replicaId,
          error: error.message,
        });
        throw error;
      }
    }

    this.logger.debug(BootstrapLog.SERVICES_REGISTERED, {
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });
  }

  /**
   * Register built-in runtime service definitions.
   * @return {Promise<void>}
   * @private
   */
  async registerMetaServiceDefinitions() {
    const systemTableWriter = this.ensureSystemTableWriter();
    const metaServices = await registerBuiltInMetaServiceDefinitions({
      upsertRow: async (tableName, row) => {
        await systemTableWriter.upsertSystemTableRow(tableName, row);
      },
    });
    const metaEndpoints = await registerBuiltInMetaServiceEndpoints({
      upsertRow: async (tableName, row) => {
        await systemTableWriter.upsertSystemTableRow(tableName, row);
      },
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: this.wsPort,
    });

    this.logger.debug(BootstrapLog.SERVICES_REGISTERED, {
      metaServices,
      metaEndpoints,
    });
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerSystemTables(now) {
    const systemTableWriter = this.ensureSystemTableWriter();

    // Register each system table
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];

      // Register table (use upsert to handle restarts with persistent storage)
      const tableData = {
        table_id: tableName,
        table_name: tableName,
        schema_definition: JSON.stringify(schema),
        partition_key: schema.columns[NUM.ZERO].name, // Primary key is partition key
        table_policies: JSON.stringify({}),
        partition_count: NUM.ONE,
        created_at: now,
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SystemTableName.TABLES,
          tableData,
        );
      } catch (error) {
        this.logger.error(BootstrapLog.TABLE_REGISTER_FAILED, {
          tableName,
          error: error.message,
        });
        throw error;
      }

      // Register partition (use upsert to handle restarts with persistent storage)
      const partitionData = {
        partition_id: partitionId,
        table_id: tableName,
        table_name: tableName,
        partition_key_start: null,
        partition_key_end: null,
        replica_count: NUM.THREE,
        size_bytes: NUM.ZERO,
        leader_node_id: this.nodeId,
        state: PARTITION_STATE.NORMAL,
        created_at: now,
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SystemTableName.PARTITIONS,
          partitionData,
        );
      } catch (error) {
        this.logger.error(BootstrapLog.PARTITION_REGISTER_FAILED, {
          partitionId,
          error: error.message,
        });
        throw error;
      }
    }

    this.logger.debug(BootstrapLog.SYSTEM_TABLES_REGISTERED, {
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
    });
  }

  /**
   * Update partition sizes in the partitions table.
   * Calculates actual sizes from SQLite databases and updates the records.
   * @return {Promise<void>}
   * @private
   */
  async updatePartitionSizes() {
    const systemTableWriter = this.ensureSystemTableWriter();

    // Track which partitions we've already updated (multiple replicas per partition)
    const updatedPartitions = new Set();
    let updatedCount = NUM.ZERO;

    for (const [_replicaId, partitionService] of this.partitionServices) {
      const partitionId = partitionService.partitionId;

      // Skip if we've already updated this partition (from another replica)
      if (updatedPartitions.has(partitionId)) {
        continue;
      }

      try {
        // Calculate the actual size from SQLite
        const sizeBytes = await partitionService.calculatePartitionSize();

        // Update the partition record
        await systemTableWriter.updateSystemTableRow(
          SystemTableName.PARTITIONS,
          {partition_id: partitionId},
          {size_bytes: sizeBytes, updated_at: Date.now()},
        );

        updatedPartitions.add(partitionId);
        updatedCount++;

        this.logger.debug(BootstrapLog.PARTITION_SIZE_UPDATED, {
          partitionId,
          sizeBytes,
        });
      } catch (error) {
        this.logger.error(BootstrapLog.PARTITION_SIZE_UPDATE_FAILED, {
          partitionId,
          error: error.message,
        });
        throw error;
      }
    }

    this.logger.debug(BootstrapLog.PARTITION_SIZES_UPDATED, {
      updatedCount,
      totalPartitions: updatedPartitions.size,
    });
  }

  /**
   * Seed dynamic configuration into the config system table.
   * This must happen before cache hydration so config values are available.
   * @return {Promise<void>}
   * @private
   */
  async seedDynamicConfiguration() {
    // Get the config partition to check if data already exists
    const configPartition = this.getLeaderPartition(SystemTableName.CONFIG);
    if (!configPartition || !configPartition.isLeader) {
      this.logger.warn(BootstrapLog.CONFIG_LEADER_MISSING);
      return;
    }

    // Check if config already exists in the partition (from previous run)
    try {
      const result = await configPartition.executeQuery(
        BOOTSTRAP_SQL.CONFIG_COUNT,
      );
      if (result && result.rows && result.rows.length > NUM.ZERO &&
          result.rows[NUM.ZERO].count > NUM.ZERO) {
        this.logger.info(BootstrapLog.CONFIG_ALREADY_SEEDED, {
          existingCount: result.rows[NUM.ZERO].count,
        });
        return;
      }
    } catch (error) {
      this.logger.debug(BootstrapLog.CONFIG_CHECK_FAILED, {
        error: error.message,
      });
      throw error;
    }

    const systemTableCache = this.getSystemTableCache();

    // Use the bootstrap CDC integration service so writes go directly
    // to local partitions while cache is not yet hydrated.
    const cdcIntegrationService = this.ensureBootstrapCdcIntegrationService();

    // Create and initialize dynamic config service
    const dynamicConfigService = new DynamicConfigService({
      cdcIntegrationService,
      systemTableCache,
      nodeId: this.nodeId,
    });
    await dynamicConfigService.initialize();

    try {
      const result = await dynamicConfigService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM);
      this.logger.info(BootstrapLog.CONFIG_SEEDED, {
        seeded: result.seeded.length,
        skipped: result.skipped.length,
      });
    } catch (error) {
      this.logger.error(BootstrapLog.CONFIG_SEED_FAILED, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Persist the authoritative assignment epoch in config.current_epoch.
   * @return {Promise<void>}
   * @private
   */
  async persistCurrentEpochIfMissing() {
    if (!this.epochManager) {
      return;
    }

    const configPartition = this.getLeaderPartition(SystemTableName.CONFIG);
    if (!configPartition || !configPartition.isLeader) {
      throw new Error(BootstrapLog.CONFIG_LEADER_MISSING);
    }

    const result = await configPartition.executeQuery(
      'SELECT config_key FROM config WHERE config_key = ?',
      [EPOCH_CONFIG_KEY],
    );
    const hasEpoch = result?.success &&
      Array.isArray(result.rows) &&
      result.rows.length > NUM.ZERO;
    if (hasEpoch) {
      return;
    }

    const epoch = this.epochManager.getCurrentEpoch();
    const serializedEpoch = epoch.toJSON();
    const now = Date.now();
    const systemTableWriter = this.ensureSystemTableWriter();

    await systemTableWriter.upsertSystemTableRow(SystemTableName.CONFIG, {
      [COLUMN.CONFIG_KEY]: EPOCH_CONFIG_KEY,
      [COLUMN.CONFIG_VALUE]: serializedEpoch,
      [COLUMN.VALUE_TYPE]: CONFIG_VALUE_TYPE.JSON,
      [COLUMN.REQUIRES_RESTART]: NUM.ZERO,
      [COLUMN.DESCRIPTION]: BOOTSTRAP_EPOCH.CONFIG_DESCRIPTION,
      [COLUMN.DEFAULT_VALUE]: serializedEpoch,
      [COLUMN.UPDATED_BY]: this.nodeId,
      [COLUMN.UPDATED_AT]: now,
      [COLUMN.CREATED_AT]: now,
    });
  }

  /**
   * Phase 5: Cache hydration.
   *
   * Seed Node Cache Hydration:
   * - Reads all system table data from local partitions
   * - Populates system cache with complete cluster state
   * - After hydration, cache becomes single source of truth
   * - Switches CDC service from bootstrap mode to normal mode
   *
   * Process:
   * 1. Read data directly from local partition services
   * 2. Populate system cache using applySystemTableChange
   * 3. Verify cache contains complete state
   * 4. Switch CDC service to cache-based routing
   *
   * After this phase:
   * - System cache is fully populated
   * - All writes route through SQL engine and system cache
   * - Bootstrap mode is disabled
   * - Single code path for all operations
   *
   * Requirements: 7.3, 7.4, 7.5
   * @return {Promise<void>}
   * @private
   */
  async phaseCacheHydration() {
    this.logger.debug(BootstrapLog.CACHE_HYDRATION_STARTING, {
      nodeId: this.nodeId,
      partitionCount: this.partitionServices.size,
    });

    const systemTableCache = this.getSystemTableCache();
    const leaderMessageGroup = this.getLeaderMessageGroupService();

    if (!leaderMessageGroup) {
      throw new Error(bootstrapError.CDC_HYDRATION_MISSING);
    }

    // Read all system table data directly from local partition services
    // This bypasses SQL routing since cache is empty
    this.logger.debug(BootstrapLog.CACHE_HYDRATION_READING, {
      nodeId: this.nodeId,
    });

    const phaseStepStartedAt = Date.now();
    const result = await this.hydrateFromLocalPartitions(
      systemTableCache,
      leaderMessageGroup,
    );
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'hydrateFromLocalPartitions',
      durationMs: Date.now() - phaseStepStartedAt,
    });

    // Verify cache contains complete cluster state
    const verifyStartedAt = Date.now();
    this.verifyCacheHydration(systemTableCache, result);
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'verifyCacheHydration',
      durationMs: Date.now() - verifyStartedAt,
    });

    // Strict gate: all leaders must have complete routing metadata before
    // switching out of bootstrap writer/routing mode.
    const leaderWaitStartedAt = Date.now();
    await this.waitForSystemServiceLeadersInCache();
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'waitForSystemServiceLeadersInCache',
      durationMs: Date.now() - leaderWaitStartedAt,
    });

    const latencyOwnersStartedAt = Date.now();
    this.ensureLatencyTopologyOwners();
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'ensureLatencyTopologyOwners',
      durationMs: Date.now() - latencyOwnersStartedAt,
    });

    const subscribeStartedAt = Date.now();
    await this.subscribeToInitialSystemTableCDC();
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'subscribeToInitialSystemTableCDC',
      durationMs: Date.now() - subscribeStartedAt,
    });

    // Gate: verify CDC pipeline is fully wired before proceeding.
    // Requirements 2.4, 2.5 — node must not transition to READY with
    // an incomplete CDC pipeline.
    const cdcReadinessGate =
      this.createCdcPipelineReadinessGate(systemTableCache);
    const cdcReadinessTimeoutMs = this.config.cdcPipelineReadinessTimeoutMs ||
      CDC_PIPELINE_READINESS_TIMEOUT_MS;
    const readinessStartedAt = Date.now();
    await cdcReadinessGate.waitForReady(
      {
        partitionServices: this.partitionServices,
        messageGroupServices: this.messageGroupServices,
      },
      cdcReadinessTimeoutMs,
    );
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'cdcReadinessGate.waitForReady',
      durationMs: Date.now() - readinessStartedAt,
    });

    // Now that cache is populated, update CDC integration service to use cache
    // This switches from bootstrap mode (direct writes) to normal mode (cache-based routing)
    // Create SQL query engine for cache-based routing (used by CDC and partition services)
    const cdcQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: this.messageRouter,
      nodeId: this.nodeId,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    const cdcUpgradeStartedAt = Date.now();
    if (!this.cdcIntegrationService) {
      this.cdcIntegrationService = CDCIntegrationSetup.createForNormal({
        nodeId: this.nodeId,
        sqlQueryEngine: cdcQueryEngine,
        systemTableCache,
        messageRouter: this.messageRouter,
      });

      this.logger.debug('CDC integration initialized by owner', {
        nodeId: this.nodeId,
        owner: 'CDCIntegrationSetup',
        mode: 'normal',
      });
    } else {
      CDCIntegrationSetup.upgrade({
        cdcIntegrationService: this.cdcIntegrationService,
        sqlQueryEngine: cdcQueryEngine,
        systemTableCache,
        messageRouter: this.messageRouter,
      });

      this.logger.debug('CDC integration upgraded by owner', {
        nodeId: this.nodeId,
        owner: 'CDCIntegrationSetup',
      });
    }
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'configureCdcIntegrationForNormalMode',
      durationMs: Date.now() - cdcUpgradeStartedAt,
    });

    if (this.epochManager) {
      this.cdcIntegrationService.setEpochManager(this.epochManager);
    }

    const cdcIntegrationService = this.cdcIntegrationService;
    this.systemTableCache = systemTableCache;
    this.swapSystemTableWriter();

    if (leaderMessageGroup) {
      this.rpcClient = new RPCClient({messageGroupService: leaderMessageGroup});
    }

    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    } else {
      this.tablePolicyService.systemTableCache = systemTableCache;
      this.tablePolicyService.cdcIntegrationService = cdcIntegrationService;
    }

    // Set system table cache and CDC integration service on all partition services
    const partitionWiringStartedAt = Date.now();
    for (const partition of this.partitionServices.values()) {
      // Keep cache-hydration critical path lightweight by wiring references
      // directly. Rebalancer/bootstrap follow-up paths can perform any
      // heavier initialization once the node is reachable.
      partition.systemTableCache = systemTableCache;
      partition.cdcIntegrationService = cdcIntegrationService;
      partition.tablePolicyService = this.tablePolicyService;
      partition.sqlQueryEngine = cdcQueryEngine;
    }
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'wirePartitionServicesForNormalMode',
      durationMs: Date.now() - partitionWiringStartedAt,
      partitionServiceCount: this.partitionServices.size,
    });

    const messageGroupWiringStartedAt = Date.now();
    for (const messageGroup of this.messageGroupServices.values()) {
      messageGroup.cdcIntegrationService = cdcIntegrationService;
    }
    this.logger.info('Cache hydration step complete', {
      nodeId: this.nodeId,
      step: 'wireMessageGroupServicesForNormalMode',
      durationMs: Date.now() - messageGroupWiringStartedAt,
      messageGroupServiceCount: this.messageGroupServices.size,
    });

    this.logger.info(BootstrapLog.CACHE_HYDRATION_COMPLETE, {
      success: result.success,
      tablesHydrated: Object.keys(result.tables).length,
      totalRows: this.countTotalRows(result),
      errors: result.errors.length,
      nodeId: this.nodeId,
    });
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
  async hydrateFromLocalPartitions(systemTableCache, leaderMessageGroup) {
    const result = {
      success: true,
      tables: {},
      errors: [],
    };

    // Hydrate only default cache-sync tables; high-volume logs are opt-in.
    const systemTables = CACHE_HYDRATION_TABLES;

    for (const tableName of systemTables) {
      try {
        // Find the leader partition service for this table
        const partitionId = INITIAL_PARTITION_IDS[tableName];
        if (!partitionId) {
          result.tables[tableName] = {
            success: false,
            error: `No partition ID for table: ${tableName}`,
          };
          result.errors.push({tableName, error: 'No partition ID'});
          continue;
        }

        // Find leader replica for this partition
        let leaderPartition = null;
        for (const partition of this.partitionServices.values()) {
          if (partition.partitionId === partitionId && partition.isLeader) {
            leaderPartition = partition;
            break;
          }
        }

        if (!leaderPartition) {
          result.tables[tableName] = {
            success: false,
            error: `No leader partition found for: ${tableName}`,
          };
          result.errors.push({tableName, error: 'No leader partition'});
          continue;
        }

        // Read all rows directly from the partition
        const sql = `SELECT * FROM ${tableName}`;
        const queryResult = await leaderPartition.executeQuery(sql);

        if (!queryResult.success) {
          result.tables[tableName] = {
            success: false,
            error: queryResult.error || 'Query failed',
          };
          result.errors.push({tableName, error: queryResult.error});
          continue;
        }

        const rows = queryResult.rows || [];

        // Apply each row to the cache via CDC event applier
        for (const row of rows) {
          await leaderMessageGroup.applyCDCEvent(tableName, CDC_OPERATION.INSERT, row, {
            skipReplication: true,
            skipSubscriptionCheck: true,
          });
        }

        result.tables[tableName] = {
          success: true,
          rowCount: rows.length,
        };

        this.logger.debug(BootstrapLog.TABLE_HYDRATED, {
          tableName,
          rowCount: rows.length,
        });
      } catch (error) {
        result.tables[tableName] = {
          success: false,
          error: error.message,
        };
        result.errors.push({tableName, error: error.message});

        this.logger.error(BootstrapLog.TABLE_HYDRATION_FAILED, {
          tableName,
          error: error.message,
        });
      }
    }

    // Mark overall success as false if any table failed
    if (result.errors.length > NUM.ZERO) {
      result.success = false;
    }

    return result;
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
    const expectedTables = [
      SystemTableName.PARTITIONS,
      SystemTableName.SERVICES,
      SystemTableName.TABLES,
      SystemTableName.MESSAGE_GROUPS,
    ];

    const missingTables = [];
    const emptyTables = [];

    for (const tableName of expectedTables) {
      if (!result.tables[tableName]) {
        missingTables.push(tableName);
        continue;
      }

      if (!result.tables[tableName].success) {
        missingTables.push(tableName);
        continue;
      }

      const rows = systemTableCache.getAll(tableName);
      if (!rows || rows.length === NUM.ZERO) {
        emptyTables.push(tableName);
      }
    }

    if (missingTables.length > NUM.ZERO || emptyTables.length > NUM.ZERO) {
      this.logger.error(BootstrapLog.CACHE_HYDRATION_INCOMPLETE, {
        missingTables,
        emptyTables,
        nodeId: this.nodeId,
      });
      const details = [
        `missing tables: ${missingTables.join(', ') || 'none'}`,
        `empty tables: ${emptyTables.join(', ') || 'none'}`,
      ];
      const error = new Error(
        `Cache hydration incomplete for required tables (${details.join('; ')})`,
      );
      error.missingTables = missingTables;
      error.emptyTables = emptyTables;
      throw error;
    } else {
      this.logger.debug(BootstrapLog.CACHE_HYDRATION_VERIFIED, {
        tablesVerified: expectedTables.length,
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Count total rows hydrated across all tables.
   * @param {Object} result - Hydration result.
   * @return {number} Total row count.
   * @private
   */
  countTotalRows(result) {
    let total = NUM.ZERO;
    for (const tableResult of Object.values(result.tables)) {
      if (tableResult.success && tableResult.rowCount) {
        total += tableResult.rowCount;
      }
    }
    return total;
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
        tablePolicyService: this.tablePolicyService,
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);
      this.servicesCreated++;

      const tableName = options.tableName;
      if (
        tableName &&
        messageGroupService &&
        DEFAULT_CACHE_SYNC_TABLES.has(tableName)
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
    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    assertCritical(replicaIds, bootstrapError.PARTITION_REPLICAS_MISSING);

    // Find leader replica
    for (const replicaId of replicaIds) {
      const partition = this.partitionServices.get(replicaId);
      if (partition && partition.isLeader) {
        return partition;
      }
    }

    throw new Error(bootstrapError.PARTITION_LEADER_MISSING);
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

    // Build cleanup context from current bootstrap state
    const cleanupContext = {
      failedPhase,
      createdPartitions: [...this.partitionServices.keys()],
      createdServices: [
        ...this.messageGroupServices.keys(),
        ...this.partitionServices.keys(),
      ],
      createdMessageGroups: this.messageGroupsCreated > NUM.ZERO ?
        [INITIAL_MESSAGE_GROUP_ID] : [],
      registeredNodeId: this.nodeId,
    };

    // Execute structured reverse-order cleanup
    await this.cleanupFailedBootstrap(failedPhase, cleanupContext);

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
   *
   * Requirements: 7.1, 7.3
   * @param {string} failedPhase - The phase that failed.
   * @param {Object} cleanupContext - Context about what was created.
   * @param {string[]} cleanupContext.createdPartitions - Partition
   *   replica IDs created before failure.
   * @param {string[]} cleanupContext.createdServices - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroups - Message
   *   group IDs created before failure.
   * @param {string|null} cleanupContext.registeredNodeId - Node ID
   *   if registered before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedBootstrap(failedPhase, cleanupContext) {
    this.logger.info(BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_START, {
      nodeId: this.nodeId,
      failedPhase,
      createdPartitions: cleanupContext.createdPartitions.length,
      createdServices: cleanupContext.createdServices.length,
      createdMessageGroups: cleanupContext.createdMessageGroups.length,
    });

    const startIndex = PHASE_TO_CLEANUP_INDEX[failedPhase];
    // If the failed phase is not in the map (e.g. NOT_STARTED),
    // fall back to running all cleanup steps.
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

    // Transition lifecycle state machine to STOPPED
    const currentState = this.lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      try {
        this.lifecycleStateMachine.transition(NodeState.STOPPED);
      } catch (err) {
        this.logger.warn(
          BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_COMPLETE, {
            nodeId: this.nodeId,
            transitionError: err.message,
          });
      }
    }

    this.logger.info(BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_SUMMARY, {
      nodeId: this.nodeId,
      failedPhase,
      stepResults,
    });
  }

  /**
   * Execute a single cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
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
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupCacheHydration() {
    try {
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_CACHE, {
          nodeId: this.nodeId,
        });
      const cache = this.systemTableCache ||
        this._getSystemTableCacheSafe();
      if (cache && cache.clear) {
        cache.clear();
      }
      this.systemTableCache = null;
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_CACHE_DONE, {
          nodeId: this.nodeId,
        });
      return 'success';
    } catch (err) {
      this.logger.warn(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_CACHE_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return 'error';
    }
  }

  /**
   * Cleanup step: remove partial registration entries.
   * Disables the system table writer and clears related state.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupRegistration(cleanupContext) {
    try {
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION, {
          nodeId: this.nodeId,
          registeredNodeId: cleanupContext.registeredNodeId,
          serviceCount: cleanupContext.createdServices.length,
          partitionCount: cleanupContext.createdPartitions.length,
          messageGroupCount:
            cleanupContext.createdMessageGroups.length,
        });

      await this.quiesceRebalancers();
      this.stopUnifiedLifecycleOwners();

      // Disable the system table writer to prevent further writes
      if (this.systemTableWriter && this.systemTableWriter.disable) {
        this.systemTableWriter.disable();
      }
      this.systemTableWriter = null;
      LatencyTopologySetup.stop(this.latencyTopology);
      this.latencyTopology = null;

      // Clear CDC integration service
      if (this.cdcIntegrationService) {
        this.cdcIntegrationService = null;
      }

      // Clear control plane services
      if (this.heartbeatService) {
        this.heartbeatService.stop();
        this.heartbeatService = null;
      }
      if (this.leaseService) {
        this.leaseService.stop();
        this.leaseService = null;
      }
      if (this.endpointService) {
        this.endpointService.stop();
        this.endpointService = null;
      }
      if (this.dispatchService) {
        this.dispatchService.stop();
        this.dispatchService = null;
      }

      // Clear RPC client
      if (this.rpcClient) {
        await this.rpcClient.shutdown();
        this.rpcClient = null;
      }

      // Clear replica state machine
      if (this.replicaStateMachine) {
        this.replicaStateMachine.stopTimeoutChecker();
        this.replicaStateMachine.clear();
        this.replicaStateMachine = null;
      }

      // Clear epoch manager
      if (this.epochManager) {
        this.epochManager = null;
      }

      // Clear replica handler
      if (this.replicaHandler) {
        this.replicaHandler.unregisterFromRouter(
          this.messageRouter,
        );
        await this.replicaHandler.shutdown();
        this.replicaHandler = null;
      }

      // Clear table policy service
      if (this.tablePolicyService) {
        this.tablePolicyService = null;
      }

      // Clear rebalance coordinator
      if (this.rebalanceCoordinator) {
        this.rebalanceCoordinator = null;
      }

      this.clearNodeReadyRebalanceState();

      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_DONE, {
          nodeId: this.nodeId,
        });
      return 'success';
    } catch (err) {
      this.logger.warn(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return 'error';
    }
  }

  /**
   * Cleanup step: stop and destroy partition services.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupPartitions() {
    try {
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS, {
          nodeId: this.nodeId,
          partitionCount: this.partitionServices.size,
        });

      for (const [replicaId, partition] of this.partitionServices) {
        try {
          if (partition.shutdown) {
            await partition.shutdown();
          }
        } catch (err) {
          this.logger.warn(
            BootstrapLog.PARTITION_CLEANUP_FAILED, {
              replicaId,
              error: err.message,
            });
        }
      }

      // Unregister from message router
      if (this.messageRouter) {
        for (const [replicaId, partition] of
          this.partitionServices) {
          const address = partition?.getUnifiedAddress ?
            partition.getUnifiedAddress() :
            `${this.nodeId}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.PARTITION}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          this.messageRouter.unregister(address);
        }
      }
      this.partitionServices.clear();
      this.partitionReplicas = [];

      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_DONE, {
          nodeId: this.nodeId,
        });
      return 'success';
    } catch (err) {
      this.logger.warn(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return 'error';
    }
  }

  /**
   * Cleanup step: stop and destroy message group services.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupMessageGroups() {
    try {
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS, {
          nodeId: this.nodeId,
          messageGroupCount: this.messageGroupServices.size,
        });

      for (const [replicaId, messageGroup] of
        this.messageGroupServices) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (err) {
          this.logger.warn(
            BootstrapLog.MESSAGE_GROUP_CLEANUP_FAILED, {
              replicaId,
              error: err.message,
            });
        }
      }

      // Unregister from message router
      if (this.messageRouter) {
        for (const [replicaId] of this.messageGroupServices) {
          const address =
            `${this.nodeId}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.MESSAGE_GROUP}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          this.messageRouter.unregister(address);
        }
      }
      this.messageGroupServices.clear();
      this.messageGroupReplicas = [];

      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_DONE,
        {nodeId: this.nodeId},
      );
      return 'success';
    } catch (err) {
      this.logger.warn(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_ERROR,
        {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return 'error';
    }
  }

  /**
   * Cleanup step: stop the message router and transport.
   * @return {Promise<string>} 'success' or 'error'.
   * @private
   */
  async _cleanupInfrastructure() {
    try {
      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE, {
          nodeId: this.nodeId,
        });

      this.stopUnifiedLifecycleOwners();

      if (this.messageRouter && this.messageRouter.shutdown) {
        await this.messageRouter.shutdown();
        this.messageRouter = null;
      }

      if (this.transport &&
          this.transport.shutdown &&
          this.transport !== this.messageRouter) {
        await this.transport.shutdown();
      }
      this.transport = null;

      this.logger.info(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_DONE,
        {nodeId: this.nodeId},
      );
      return 'success';
    } catch (err) {
      this.logger.warn(
        BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_ERROR,
        {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return 'error';
    }
  }

  /**
   * Stop all rebalancer and coordinator activity before service teardown.
   * @return {Promise<void>}
   * @private
   */
  async quiesceRebalancers() {
    const partitionTasks = [...this.partitionServices.entries()].map(
      async ([replicaId, partition]) => {
        if (!partition || typeof partition.quiesceRebalancing !== 'function') {
          return;
        }
        try {
          await partition.quiesceRebalancing();
        } catch (error) {
          this.logger.warn(BootstrapLog.PARTITION_CLEANUP_FAILED, {
            replicaId,
            error: error.message,
          });
        }
      },
    );

    const messageGroupTasks = [...this.messageGroupServices.entries()]
      .map(async ([replicaId, messageGroup]) => {
        if (!messageGroup || typeof messageGroup.quiesceRebalancing !== 'function') {
          return;
        }
        try {
          await messageGroup.quiesceRebalancing();
        } catch (error) {
          this.logger.warn(BootstrapLog.MESSAGE_GROUP_CLEANUP_FAILED, {
            replicaId,
            error: error.message,
          });
        }
      });

    await Promise.all([...partitionTasks, ...messageGroupTasks]);

    if (this.rebalanceCoordinator) {
      try {
        await this.rebalanceCoordinator.shutdown();
      } catch (error) {
        this.logger.warn(BootstrapLog.FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR, {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
      this.rebalanceCoordinator = null;
    }
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
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    this.isShuttingDown = true;
    this.logger.info(BootstrapLog.CLEANUP_START, {
      nodeId: this.nodeId,
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });

    this.clearNodeReadyRebalanceState();
    this.stopUnifiedLifecycleOwners();
    await this.quiesceRebalancers();
    LatencyTopologySetup.stop(this.latencyTopology);
    this.latencyTopology = null;

    // Shutdown control plane services FIRST to stop heartbeat timers
    // This prevents heartbeat from firing after router shutdown
    if (this.heartbeatService) {
      this.heartbeatService.stop();
      this.heartbeatService = null;
    }
    if (this.leaseService) {
      this.leaseService.stop();
      this.leaseService = null;
    }
    if (this.endpointService) {
      this.endpointService.stop();
      this.endpointService = null;
    }
    if (this.dispatchService) {
      this.dispatchService.stop();
      this.dispatchService = null;
    }

    // Shutdown RPC client to cancel pending requests
    if (this.rpcClient) {
      await this.rpcClient.shutdown();
      this.rpcClient = null;
    }

    // Shutdown replica state machine
    if (this.replicaStateMachine) {
      this.replicaStateMachine.stopTimeoutChecker();
      this.replicaStateMachine.clear();
      this.replicaStateMachine = null;
    }

    if (this.systemTableWriter && this.systemTableWriter.disable) {
      this.systemTableWriter.disable();
    }
    this.systemTableWriter = null;

    // Clear epoch manager
    if (this.epochManager) {
      this.epochManager = null;
    }

    // Shutdown replica handler
    if (this.replicaHandler) {
      this.replicaHandler.unregisterFromRouter(this.messageRouter);
      await this.replicaHandler.shutdown();
      this.replicaHandler = null;
    }

    // Shutdown partition services
    for (const [replicaId, partition] of this.partitionServices) {
      try {
        if (partition.shutdown) {
          await partition.shutdown();
        }
        this.logger.debug(BootstrapLog.PARTITION_CLEANED, {replicaId});
      } catch (err) {
        this.logger.warn(BootstrapLog.PARTITION_CLEANUP_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving infrastructure running.
      }
    }
    if (this.messageRouter) {
      for (const [replicaId, partition] of this.partitionServices) {
        const address = partition?.getUnifiedAddress ?
          partition.getUnifiedAddress() :
          `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
          `${ADDRESS.SEPARATOR}${replicaId}`;
        this.messageRouter.unregister(address);
      }
    }
    this.partitionServices.clear();
    this.partitionReplicas = [];

    // Shutdown message group services
    for (const [replicaId, messageGroup] of this.messageGroupServices) {
      try {
        if (messageGroup.shutdown) {
          await messageGroup.shutdown();
        }
        this.logger.debug(BootstrapLog.MESSAGE_GROUP_CLEANED, {replicaId});
      } catch (err) {
        this.logger.warn(BootstrapLog.MESSAGE_GROUP_CLEANUP_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving infrastructure running.
      }
    }
    if (this.messageRouter) {
      for (const [replicaId] of this.messageGroupServices) {
        const address = `${this.nodeId}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
        this.messageRouter.unregister(address);
      }
    }
    this.messageGroupServices.clear();
    this.messageGroupReplicas = [];

    // Shutdown message router
    if (this.messageRouter && this.messageRouter.shutdown) {
      await this.messageRouter.shutdown();
      this.messageRouter = null;
    }

    // Shutdown transport (alias for messageRouter)
    if (this.transport && this.transport.shutdown && this.transport !== this.messageRouter) {
      await this.transport.shutdown();
    }
    this.transport = null;

    this.logger.info(BootstrapLog.CLEANUP_COMPLETE, {nodeId: this.nodeId});
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
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => Date.now(),
      sleep: (delayMs) => this.sleep(delayMs),
    });
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
