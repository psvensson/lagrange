import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {resolveRandomSource} from '../random/random-source.js';
import {
  applyUnifiedRebalancerControlPlaneReadinessMethods,
} from './unified-rebalancer-control-plane-readiness-methods.js';
import {
  applyUnifiedRebalancerPolicySchedulerMethods,
} from './unified-rebalancer-policy-scheduler-methods.js';
import {
  applyUnifiedRebalancerPriorityRecoveryCoordination,
} from './unified-rebalancer-priority-recovery-coordination.js';

const {
  CLUSTER_READINESS_TIMEOUT_MS,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  EventEmitter,
  LoggingService,
  MovePlanner,
  OwnerKeyReconcileQueue,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_ERROR_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_QUEUE_NAME,
  REBALANCER_SUBSYSTEM,
  RECONCILE_REASON,
  StartupRecoveryCoordinator,
  StoragePressureBehavior,
  UNIFIED_REBALANCER_LITERAL,
  assertCritical,
  createControlPlaneRuntimeBundle,
} = UNIFIED_REBALANCER_SHARED;

class UnifiedRebalancerLifecycleBase extends EventEmitter {
  constructor(options = {}) {
    super();

    this.entityId = assertCritical(
      options.entityId,
      REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED,
    );
    this.entityType = assertCritical(
      options.entityType,
      REBALANCER_ERROR_MSG.ENTITY_TYPE_REQUIRED,
    );
    this.systemTableCache = assertCritical(
      options.systemTableCache,
      REBALANCER_ERROR_MSG.CACHE_REQUIRED,
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      REBALANCER_ERROR_MSG.CDC_REQUIRED,
    );
    this.tablePolicyService = assertCritical(
      options.tablePolicyService,
      REBALANCER_ERROR_MSG.POLICY_REQUIRED,
    );
    this.nodeId = assertCritical(
      options.nodeId,
      REBALANCER_ERROR_MSG.NODE_ID_REQUIRED,
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      REBALANCER_ERROR_MSG.ROUTER_REQUIRED,
    );
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.messageRouter,
      }).controlPlaneSystemTableGateway;

    // RebalanceCoordinator for delegated operation execution (Requirements 2.5)
    this.rebalanceCoordinator = assertCritical(
      options.rebalanceCoordinator,
      REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED,
    );
    this.nowFn =
      typeof options.nowFn === UNIFIED_REBALANCER_LITERAL.FUNCTION ?
        options.nowFn :
        Date.now;
    // DT5 seam: scheduler/leadership-start jitter draws from a RandomSource
    // (default RealRandomSource = Math.random, byte-identical) so a seed determines
    // the rebalancer's check cadence — the thundering-herd staggering that perturbs
    // convergence ordering becomes reproducible.
    this.randomSource = resolveRandomSource(options);

    // Leadership state
    this.isLeader = false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.periodicCheckIntervalMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS;
    this.periodicCheckJitterMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_JITTER_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS;
    this.criticalCheckDelayMs =
      config.get(REBALANCER_CONFIG_KEY.CRITICAL_CHECK_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    this.maxConcurrentMoves =
      config.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_MOVES) ||
      REBALANCER_DEFAULT.UNIFIED.MAX_CONCURRENT_MOVES;
    this.moveTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.MOVE_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS;
    this.moveBatchSize =
      config.get(REBALANCER_CONFIG_KEY.MOVE_BATCH_SIZE) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_BATCH_SIZE;
    this.interBatchDelayMs =
      config.get(REBALANCER_CONFIG_KEY.INTER_BATCH_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.INTER_BATCH_DELAY_MS;
    this.rebalanceBudget =
      config.get(REBALANCER_CONFIG_KEY.REBALANCE_BUDGET) ||
      REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET;
    this.criticalBudgetMultiplier =
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_BUDGET_MULTIPLIER;
    this.nodeCpuThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_CPU_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_CPU_THRESHOLD;
    this.nodeMemoryThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_MEMORY_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_MEMORY_THRESHOLD;
    this.nodeDiskThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_DISK_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_DISK_THRESHOLD;
    this.priorityRecoveryActivityStaleGraceMs = Number.isFinite(
      options.priorityRecoveryActivityStaleGraceMs,
    ) ?
      Math.max(
        0,
        Math.floor(options.priorityRecoveryActivityStaleGraceMs),
      ) :
      DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS;
    this.priorityRecoveryAdmissionTracker = {
      lastObservedAdmissionPlan: null,
      lastObservedAdmissionPlanAtMs: null,
    };
    this.enableReadinessPing =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_ENABLED) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_ENABLED;
    this.readinessPingTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS;

    // Stabilization period configuration (Requirements 2.1)
    const configuredStabilization = config.get(
      REBALANCER_CONFIG_KEY.STABILIZATION_PERIOD_MS,
    );
    this.minStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MIN_STABILIZATION_MS;
    this.maxStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MAX_STABILIZATION_MS;
    this.defaultStabilizationMs =
      REBALANCER_DEFAULT.UNIFIED.DEFAULT_STABILIZATION_MS;
    // Clamp to valid range [1000ms, 10000ms] with default 1000ms
    this.stabilizationPeriodMs = this.clampStabilizationPeriod(
      configuredStabilization ?? this.defaultStabilizationMs,
    );
    this.systemPartitionStartDelayMs = this.resolveNonNegativeMs(
      config.get(REBALANCER_CONFIG_KEY.SYSTEM_PARTITION_START_DELAY_MS),
      REBALANCER_DEFAULT.UNIFIED.SYSTEM_PARTITION_START_DELAY_MS,
    );
    this.userPartitionStartDelayMs = this.resolveNonNegativeMs(
      config.get(REBALANCER_CONFIG_KEY.USER_PARTITION_START_DELAY_MS),
      REBALANCER_DEFAULT.UNIFIED.USER_PARTITION_START_DELAY_MS,
    );
    // Per-entity random offset spreads start-delay eligibility across
    // the jitter window so all system partitions don't become eligible
    // simultaneously (thundering herd prevention).
    this.rebalanceStartAtMs =
      Date.now() + Math.floor(Math.random() * this.periodicCheckJitterMs);

    // Stabilization state
    // Initialize to current time so rebalancer waits for stabilization period
    // before first check (prevents premature rebalancing during bootstrap)
    this.lastStateChangeTime = Date.now();
    this.stabilizationTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) :
      console;

    // State
    this.lastRebalanceTime = null;
    this.rebalanceCount = UNIFIED_REBALANCER_LITERAL.ZERO;
    this.lastDegradedTargetSignal = null;
    this.lastSuboptimalSignal = null;

    // Scheduler state
    this.scheduledCheck = null;
    this.currentInterval = this.periodicCheckIntervalMs;
    this.maxInterval =
      this.periodicCheckIntervalMs * UNIFIED_REBALANCER_LITERAL.TWO;

    // Storage capacity services.
    this.storageAdmissionService =
      options.storageAdmissionService ||
      this.rebalanceCoordinator?.storageAdmissionService ||
      null;
    this.storageAccountingService =
      options.storageAccountingService ||
      this.rebalanceCoordinator?.storageAccountingService ||
      null;
    this.managesStoragePressureBehavior = !options.storagePressureBehavior;
    this.storagePressureBehavior =
      options.storagePressureBehavior ||
      (this.storageAccountingService ?
        new StoragePressureBehavior({
          accountingService: this.storageAccountingService,
        }) :
        null);
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService ||
      this.rebalanceCoordinator?.cdcGroupPropagationService ||
      null;
    this.bootstrapReadinessState =
      options.bootstrapReadinessState ||
      this.rebalanceCoordinator?.bootstrapReadinessState ||
      null;
    this.startupRecoveryCoordinator =
      options.startupRecoveryCoordinator ||
      this.rebalanceCoordinator?.startupRecoveryCoordinator ||
      new StartupRecoveryCoordinator({
        readinessState: this.bootstrapReadinessState,
      });
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      });

    // Cluster readiness gate (optional, for bootstrap-lifecycle-hardening)
    // When provided, defers first planning cycle until cluster is ready.
    this.clusterReadinessSignal = options.clusterReadinessSignal || null;
    this.clusterReadinessConfirmed = !this.clusterReadinessSignal;
    this.clusterReadinessState = this.clusterReadinessSignal ? 'pending' : 'intentionally_relaxed';
    this.clusterReadinessStartMs = null;
    this.clusterReadinessTimeoutMs = CLUSTER_READINESS_TIMEOUT_MS;
    this.partitionServices = options.partitionServices || null;
    this.messageGroupServices = options.messageGroupServices || null;
    this.requirePropagationLeader = options.requirePropagationLeader !== false;

    // Planning is delegated to MovePlanner (single-path planning).
    this.movePlanner = new MovePlanner({
      entityId: this.entityId,
      entityType: this.entityType,
      moveStateProvider: this,
      storageAdmissionService: this.storageAdmissionService,
      accountingService: this.storageAccountingService,
      storagePressureBehavior: this.storagePressureBehavior,
      strictOwnerDependencies: true,
    });
    this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);

    this.isShuttingDown = false;
    this.initialized = false;

    this.rebalanceCheckQueue = new OwnerKeyReconcileQueue({
      name: `${REBALANCER_QUEUE_NAME.REBALANCE_CHECK}:${this.entityId}`,
      reconcileFn: (_ownerKey, reasons) =>
        this.reconcileRebalanceCheck(reasons),
    });
    this.priorityRecoveryVisibilityCacheListener = null;
    this.bindPriorityRecoveryVisibilityCacheListener(this.systemTableCache);
    this.coordinatorProgressListenerBindings = null;
    this.bindCoordinatorProgressListeners(this.rebalanceCoordinator);
  }

  /**
   * Initialize the rebalancer.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.isShuttingDown = false;
    this.logger.info(REBALANCER_LOG_MSG.INITIALIZED, {
      entityId: this.entityId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    this.initialized = true;
  }

  /**
   * Set the RebalanceCoordinator for delegated operation execution.
   * Requirements: 2.5
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.unbindCoordinatorProgressListeners();
    this.rebalanceCoordinator = coordinator;
    this.syncOwnerDependenciesFromCoordinator(coordinator);
    this.bindCoordinatorProgressListeners(coordinator);

    this.logger.info(REBALANCER_LOG_MSG.COORDINATOR_SET, {
      entityId: this.entityId,
      entityType: this.entityType,
      hasCoordinator: !!coordinator,
    });
    this.handleCoordinatorRebindProgress(coordinator);
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    const previousSystemTableCache = this.systemTableCache;
    if (Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.SYSTEMTABLECACHE)) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (
      Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.CDCINTEGRATIONSERVICE)
    ) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.TABLEPOLICYSERVICE)) {
      this.tablePolicyService = options.tablePolicyService || null;
    }
    if (Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.SQLQUERYENGINE)) {
      this.sqlQueryEngine = options.sqlQueryEngine || null;
    }
    if (
      Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.BOOTSTRAPREADINESSSTATE)
    ) {
      this.bootstrapReadinessState = options.bootstrapReadinessState || null;
      if (
        this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
          'function'
      ) {
        this.startupRecoveryCoordinator.syncOwnerDependencies({
          readinessState: this.bootstrapReadinessState,
        });
      }
    }
    if (
      Object.hasOwn(
        options,
        UNIFIED_REBALANCER_LITERAL.STARTUPRECOVERYCOORDINATOR,
      )
    ) {
      this.startupRecoveryCoordinator =
        options.startupRecoveryCoordinator || null;
    }

    if (
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.syncOwnerDependencies ===
        'function'
    ) {
      this.controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
      });
    }

    if (Object.hasOwn(options, 'partitionServices')) {
      this.partitionServices = options.partitionServices || null;
    }
    if (Object.hasOwn(options, 'messageGroupServices')) {
      this.messageGroupServices = options.messageGroupServices || null;
    }
    if (Object.hasOwn(options, 'requirePropagationLeader')) {
      this.requirePropagationLeader = options.requirePropagationLeader !== false;
    }

    if (
      Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.SYSTEMTABLECACHE) &&
      previousSystemTableCache !== this.systemTableCache
    ) {
      this.unbindPriorityRecoveryVisibilityCacheListener(
        previousSystemTableCache,
      );
      this.bindPriorityRecoveryVisibilityCacheListener(this.systemTableCache);
    }

    if (
      Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.REBALANCECOORDINATOR)
    ) {
      this.setRebalanceCoordinator(options.rebalanceCoordinator || null);
      return;
    }

    this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);
  }

  /**
   * Synchronize owner-scoped dependencies from coordinator.
   * @param {Object|null} coordinator
   * @private
   */
  syncOwnerDependenciesFromCoordinator(coordinator) {
    if (!coordinator || typeof coordinator !== 'object') {
      return;
    }
    if (coordinator.storageAdmissionService) {
      this.storageAdmissionService = coordinator.storageAdmissionService;
    }
    if (coordinator.storageAccountingService) {
      this.storageAccountingService = coordinator.storageAccountingService;
    }
    if (coordinator.cdcGroupPropagationService) {
      this.cdcGroupPropagationService = coordinator.cdcGroupPropagationService;
    }
    if (coordinator.bootstrapReadinessState) {
      this.bootstrapReadinessState = coordinator.bootstrapReadinessState;
    }
    if (coordinator.startupRecoveryCoordinator) {
      this.startupRecoveryCoordinator = coordinator.startupRecoveryCoordinator;
    } else if (
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
        'function'
    ) {
      this.startupRecoveryCoordinator.syncOwnerDependencies({
        readinessState: this.bootstrapReadinessState,
      });
    }
    if (coordinator.controlPlaneReadinessService) {
      this.controlPlaneReadinessService =
        coordinator.controlPlaneReadinessService;
    }
    if (this.managesStoragePressureBehavior && this.storageAccountingService) {
      this.storagePressureBehavior = new StoragePressureBehavior({
        accountingService: this.storageAccountingService,
      });
    }
    if (this.movePlanner) {
      this.movePlanner.storageAdmissionService = this.storageAdmissionService;
      this.movePlanner.accountingService = this.storageAccountingService;
      this.movePlanner.storagePressureBehavior = this.storagePressureBehavior;
    }
  }

  /**
   * Set leadership status.
   * @param {boolean} isLeader - Whether this instance is the leader.
   */
  setLeader(isLeader) {
    if (this.isShuttingDown) {
      this.isLeader = false;
      this.cancelScheduledCheck();
      this.cancelStabilizationTimer();
      return;
    }

    const wasLeader = this.isLeader;
    this.isLeader = isLeader;

    if (isLeader && !wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_START, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      if (this.isControlPlanePriorityPartition()) {
        this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
      }
      this.scheduleNextCheck(this.getLeadershipStartDelayMs());
    } else if (!isLeader && wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_STOP, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.cancelScheduledCheck();
      this.cancelStabilizationTimer();
    }
  }
}

applyUnifiedRebalancerControlPlaneReadinessMethods(
  UnifiedRebalancerLifecycleBase,
);
applyUnifiedRebalancerPolicySchedulerMethods(
  UnifiedRebalancerLifecycleBase,
);
applyUnifiedRebalancerPriorityRecoveryCoordination(
  UnifiedRebalancerLifecycleBase,
);

export {UnifiedRebalancerLifecycleBase};
