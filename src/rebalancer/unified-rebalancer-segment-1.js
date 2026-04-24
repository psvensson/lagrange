import { UNIFIED_REBALANCER_SHARED } from "./unified-rebalancer-shared.js";

const {
  CLUSTER_READINESS_TIMEOUT_MS,
  COLUMN,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DEFAULT_TABLE_POLICY,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  EntityType,
  EventEmitter,
  LIFECYCLE_PHASE,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  META_SERVICE_ID,
  MovePlanner,
  MoveType,
  NUM,
  NodeStatus,
  OperationType,
  OwnerKeyReconcileQueue,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT,
  PressureGovernor,
  RAFT_ROLE,
  READINESS_SKIP_DETAIL,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  RECONCILE_REASON,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SERVICE_STATUS,
  SQL_BUDGET,
  STABILIZATION_RESET_TRIGGER,
  STATE,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  StoragePressureBehavior,
  TABLES,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  adjustToOddCount,
  assertCritical,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  createControlPlaneRuntimeBundle,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReadySnapshot,
  isCoordinatorOwnedOperationType,
  isPriorityRecoveryEmergencyPartition,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeRecordReady,
  isOddReplicaCount,
  isPriorityControlPlanePartition,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  isTerminalReplicaOperationSemanticPhase,
  isTerminalStep,
  isValidWorkflowStep,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeReplicaOperationRecord,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  wasNodeRecordReadyWhenWritten,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET = new Set([
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.REMOVED,
]);
const PRIORITY_RECOVERY_COORDINATOR_TERMINAL_EVENT_SET = new Set([
  REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
  REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
]);
const PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD = Object.freeze({
  ENTITY_ID: "entityId",
  ENTITY_ID_SNAKE: "entity_id",
  PARTITION_ID: "partitionId",
  PARTITION_ID_SNAKE: "partition_id",
  SERVICE_TYPE: "serviceType",
  SERVICE_TYPE_SNAKE: "service_type",
  STATUS: "status",
});
const PRIORITY_RECOVERY_VISIBILITY_SERVICE_TYPE = Object.freeze({
  PARTITION: "partition",
});

class UnifiedRebalancerSegment1 extends EventEmitter {
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
      typeof options.nowFn === UNIFIED_REBALANCER_LITERAL.FUNCTION
        ? options.nowFn
        : Date.now;

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
    )
      ? Math.max(
          NUM.ZERO,
          Math.floor(options.priorityRecoveryActivityStaleGraceMs),
        )
      : DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS;
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
    this.logger = loggingService.isInitialized()
      ? loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED)
      : console;

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
      (this.storageAccountingService
        ? new StoragePressureBehavior({
            accountingService: this.storageAccountingService,
          })
        : null);
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
    this.clusterReadinessStartMs = null;
    this.clusterReadinessTimeoutMs = CLUSTER_READINESS_TIMEOUT_MS;

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
  }

  bindCoordinatorProgressListeners(coordinator) {
    if (
      !coordinator ||
      typeof coordinator.on !== TYPEOF.FUNCTION ||
      this.isControlPlanePriorityPartition() !== true ||
      this.coordinatorProgressListenerBindings
    ) {
      return;
    }
    const stepChangedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
        event,
      );
    const operationCompletedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        event,
      );
    const operationFailedListener = (event = {}) =>
      this.handleCoordinatorProgressEvent(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        event,
      );
    coordinator.on(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, stepChangedListener);
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      operationCompletedListener,
    );
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      operationFailedListener,
    );
    this.coordinatorProgressListenerBindings = {
      coordinator,
      stepChangedListener,
      operationCompletedListener,
      operationFailedListener,
    };
  }

  unbindCoordinatorProgressListeners() {
    const bindings = this.coordinatorProgressListenerBindings;
    if (!bindings?.coordinator) {
      this.coordinatorProgressListenerBindings = null;
      return;
    }
    const unsubscribe =
      typeof bindings.coordinator.off === TYPEOF.FUNCTION
        ? bindings.coordinator.off.bind(bindings.coordinator)
        : typeof bindings.coordinator.removeListener === TYPEOF.FUNCTION
          ? bindings.coordinator.removeListener.bind(bindings.coordinator)
          : null;
    if (unsubscribe) {
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.STEP_CHANGED,
        bindings.stepChangedListener,
      );
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        bindings.operationCompletedListener,
      );
      unsubscribe(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        bindings.operationFailedListener,
      );
    }
    this.coordinatorProgressListenerBindings = null;
  }

  bindPriorityRecoveryVisibilityCacheListener(
    systemTableCache = this.systemTableCache,
  ) {
    if (
      !systemTableCache ||
      typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION ||
      this.isControlPlanePriorityPartition() !== true ||
      this.priorityRecoveryVisibilityCacheListener
    ) {
      return;
    }
    this.priorityRecoveryVisibilityCacheListener =
      (tableName, operation, record) => {
        this.handlePriorityRecoveryVisibilityEvent({
          tableName,
          operation,
          data: record,
        });
      };
    systemTableCache.onCacheChange(this.priorityRecoveryVisibilityCacheListener);
  }

  unbindPriorityRecoveryVisibilityCacheListener(
    systemTableCache = this.systemTableCache,
  ) {
    if (
      !this.priorityRecoveryVisibilityCacheListener ||
      !systemTableCache ||
      typeof systemTableCache.offCacheChange !== TYPEOF.FUNCTION
    ) {
      this.priorityRecoveryVisibilityCacheListener = null;
      return;
    }
    systemTableCache.offCacheChange(this.priorityRecoveryVisibilityCacheListener);
    this.priorityRecoveryVisibilityCacheListener = null;
  }

  buildCoordinatorProgressRebalanceDecision(eventName, payload = {}) {
    const operation =
      payload?.operation && typeof payload.operation === TYPEOF.OBJECT
        ? payload.operation
        : {};
    const operationPartitionId = String(
      operation.partitionId ||
        operation.partition_id ||
        operation.entityId ||
        operation.entity_id ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const normalizedNewStep = String(
      payload?.newStep ||
        payload?.new_step ||
        operation.workflowStep ||
        operation.workflow_step ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
    const operationPriorityPartition =
      operationPartitionId.length > UNIFIED_REBALANCER_LITERAL.ZERO &&
      isPriorityControlPlanePartition({
        partitionId: operationPartitionId,
        partitionRow: getPartitionRowFromCache(
          this.systemTableCache,
          operationPartitionId,
        ),
      });
    const stepProgress =
      eventName === REBALANCE_COORDINATOR_EVENT.STEP_CHANGED &&
      PRIORITY_RECOVERY_COORDINATOR_STEP_PROGRESS_SET.has(normalizedNewStep);
    const terminalProgress =
      PRIORITY_RECOVERY_COORDINATOR_TERMINAL_EVENT_SET.has(eventName);
    const evidence = {
      isLeader: this.isLeader === true,
      priorityPartition: this.isControlPlanePriorityPartition() === true,
      partitionMatches: operationPartitionId === this.entityId,
      operationPriorityPartition,
      stepProgress,
      terminalProgress,
    };
    return {
      shouldEnqueue:
        evidence.isLeader &&
        evidence.priorityPartition &&
        (evidence.partitionMatches || evidence.operationPriorityPartition) &&
        (evidence.stepProgress || evidence.terminalProgress),
      reconcileReason: RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
      evidence,
    };
  }

  handleCoordinatorProgressEvent(eventName, payload = {}) {
    const decision = this.buildCoordinatorProgressRebalanceDecision(
      eventName,
      payload,
    );
    if (decision.shouldEnqueue !== true) {
      return false;
    }
    this.enqueueRebalanceCheck(decision.reconcileReason);
    this.enqueueMembershipPublicationReconcile(decision.reconcileReason);
    return true;
  }

  buildPriorityRecoveryVisibilityRebalanceDecision(event = {}, options = {}) {
    const serviceRow =
      event?.data && typeof event.data === TYPEOF.OBJECT ? event.data : {};
    const servicePartitionId = String(
      serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.PARTITION_ID] ||
        serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.PARTITION_ID_SNAKE] ||
        serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.ENTITY_ID] ||
        serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.ENTITY_ID_SNAKE] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const serviceType = String(
      serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.SERVICE_TYPE] ||
        serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.SERVICE_TYPE_SNAKE] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toLowerCase();
    const serviceStatus = String(
      serviceRow[PRIORITY_RECOVERY_VISIBILITY_SERVICE_FIELD.STATUS] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toLowerCase();
    const evidence = {
      isLeader: this.isLeader === true,
      priorityPartition: this.isControlPlanePriorityPartition() === true,
      tableMatches: event?.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES,
      partitionMatches: servicePartitionId === this.entityId,
      activePartitionService:
        serviceType === PRIORITY_RECOVERY_VISIBILITY_SERVICE_TYPE.PARTITION &&
        serviceStatus === SERVICE_STATUS.ACTIVE,
    };
    const visibilityProgress =
      evidence.priorityPartition &&
      evidence.tableMatches &&
      evidence.partitionMatches &&
      evidence.activePartitionService;
    return {
      shouldEnqueue:
        visibilityProgress &&
        (options.requireLeader === false || evidence.isLeader),
      visibilityProgress,
      reconcileReason: RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
      evidence,
    };
  }

  handlePriorityRecoveryVisibilityEvent(event = {}) {
    const decision = this.buildPriorityRecoveryVisibilityRebalanceDecision(
      event,
    );
    if (decision.shouldEnqueue !== true) {
      return false;
    }
    this.enqueueRebalanceCheck(decision.reconcileReason);
    this.enqueueMembershipPublicationReconcile(decision.reconcileReason);
    return true;
  }

  /**
   * Priority recovery progress must wake the canonical publication owner so
   * durable spread summaries converge from fresh service rows.
   *
   * @param {string} reason
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason) {
    const publicationService =
      this.controlPlaneReadinessService?.membershipPublicationService;
    if (
      !publicationService ||
      typeof publicationService.enqueueClusterMembershipReconcile !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    return publicationService.enqueueClusterMembershipReconcile(reason);
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
          TYPEOF.FUNCTION
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
        TYPEOF.FUNCTION
    ) {
      this.controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
      });
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
    if (!coordinator || typeof coordinator !== TYPEOF.OBJECT) {
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
        TYPEOF.FUNCTION
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

  /**
   * Get the policy for this entity.
   * @return {Promise<Object>} The applicable policy.
   */
  async getPolicy() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.getMessageGroupPolicy();
    }
    if (this.entityType === EntityType.RUNTIME_SERVICE) {
      return this.getRuntimeServicePolicy();
    }
    return this.getTablePolicy();
  }

  /**
   * Get table policy for a partition.
   * Uses TablePolicyService for policy lookup.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy() {
    return this.tablePolicyService.getPolicyForPartition(this.entityId);
  }

  /**
   * Get message group policy.
   * @return {Object} Message group policy.
   */
  getMessageGroupPolicy() {
    // Delegate to TablePolicyService for canonical validation/merge
    return this.tablePolicyService.getMessageGroupPolicy(this.entityId);
  }

  /**
   * Get runtime service policy.
   * Returns the default runtime service placement policy.
   * @return {Object} Runtime service policy.
   */
  getRuntimeServicePolicy() {
    return { ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE };
  }

  /**
   * Clamp stabilization period to valid range [1000ms, 10000ms].
   * @param {number} value - Configured stabilization period.
   * @return {number} Clamped stabilization period.
   */
  clampStabilizationPeriod(value) {
    if (typeof value !== UNIFIED_REBALANCER_LITERAL.NUMBER || isNaN(value)) {
      return this.defaultStabilizationMs;
    }
    return Math.max(
      this.minStabilizationMs,
      Math.min(this.maxStabilizationMs, value),
    );
  }

  /**
   * Resolve non-negative millisecond value with fallback.
   * @param {*} value - Candidate config value.
   * @param {number} fallback - Fallback milliseconds.
   * @return {number} Non-negative milliseconds.
   */
  resolveNonNegativeMs(value, fallback) {
    if (
      typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER &&
      Number.isFinite(value) &&
      value >= UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return Math.floor(value);
    }
    return fallback;
  }

  /**
   * Whether this rebalancer manages a system table partition.
   * @return {boolean}
   */
  isSystemPartitionEntity() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isSystemTablePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the readiness decision dimension for node-level rebalancer gates.
   * Critical system partitions must continue converging while publication
   * membership is still closing ACK_PENDING; ordinary entities remain strict.
   *
   * @return {string}
   * @private
   */
  resolveNodeReadinessDecisionDimension() {
    if (this.isSystemPartitionEntity()) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Evaluate readiness eligibility for one decision dimension.
   * Falls back to repairEligible only when older snapshots do not yet expose
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT
        ? readiness.dimensions
        : null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (
      decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    if (Object.hasOwn(dimensions, decisionDimension)) {
      return false;
    }
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true
    );
  }

  /**
   * Whether this entity is one of the startup-critical control-plane
   * partitions that should converge ahead of ordinary workload rebalancing.
   * @return {boolean}
   */
  isControlPlanePriorityPartition() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isPriorityControlPlanePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the minimum number of ACTIVE nodes that must satisfy readiness
   * before this entity may continue critical topology spread.
   *
   * Priority control-plane partitions converge against a quorum target during
   * startup so one flapping joiner does not stall every other priority table.
   *
   * @param {number} activeNodeCount
   * @return {number}
   * @private
   */
  resolveCriticalSystemRequiredHealthyNodeCount(activeNodeCount) {
    const normalizedActiveNodeCount =
      Number.isInteger(activeNodeCount) && activeNodeCount > NUM.ZERO
        ? activeNodeCount
        : NUM.ZERO;
    if (normalizedActiveNodeCount === NUM.ZERO) {
      return NUM.ZERO;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return normalizedActiveNodeCount;
    }
    const targetReplicaCount = this.getPriorityControlPlaneTargetReplicaCount();
    const quorumTarget = Math.max(
      NUM.ONE,
      Math.floor(targetReplicaCount / NUM.TWO) + NUM.ONE,
    );
    return Math.min(quorumTarget, normalizedActiveNodeCount);
  }

  /**
   * Resolve the quorum-sized distinct-node target for priority control-plane
   * spread. Non-system entities may resume once priority partitions have
   * escaped single-node concentration, even if the final spread target is
   * still converging.
   *
   * @param {number} readyNodeCount
   * @return {number}
   * @private
   */
  resolvePriorityControlPlaneQuorumDistinctNodeCount(readyNodeCount) {
    const normalizedReadyNodeCount =
      Number.isInteger(readyNodeCount) && readyNodeCount > NUM.ZERO
        ? readyNodeCount
        : NUM.ZERO;
    if (normalizedReadyNodeCount === NUM.ZERO) {
      return NUM.ZERO;
    }
    const quorumTarget = Math.max(
      NUM.ONE,
      Math.floor(
        PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT / NUM.TWO,
      ) + NUM.ONE,
    );
    return Math.min(quorumTarget, normalizedReadyNodeCount);
  }

  /**
   * Resolve the configured voter target for this priority control-plane
   * partition from the canonical partitions owner row.
   *
   * @return {number}
   * @private
   */
  getPriorityControlPlaneTargetReplicaCount() {
    if (!this.isControlPlanePriorityPartition()) {
      return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    const configuredReplicaCount = Number(
      partitionRow?.replica_count ?? partitionRow?.replicaCount,
    );
    if (
      Number.isFinite(configuredReplicaCount) &&
      configuredReplicaCount > NUM.ZERO
    ) {
      return Math.floor(configuredReplicaCount);
    }
    return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
  }

  /**
   * `control_plane_publications` owns the publication path other priority
   * partitions depend on, so it still requires coverage for every active node.
   * Priority partitions should, however, consume canonical readiness backfill
   * for endpoint visibility rather than waiting only on service-endpoint row
   * publication. Other priority partitions may recover against the quorum-
   * sized replica target.
   *
   * @return {boolean}
   * @private
   */
  isControlPlanePublicationPriorityPartition() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    const tableId =
      typeof partitionRow?.table_id === TYPEOF.STRING
        ? partitionRow.table_id
        : partitionRow?.tableId;
    return tableId === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS;
  }

  /**
   * Resolve one canonical endpoint-visibility policy for the current critical
   * system partition.
   *
   * @param {string[]} activeNodeIds
   * @return {{allowReadinessBackfill:boolean,requiredReadyNodeCount:number}}
   * @private
   */
  getCriticalSystemEndpointVisibilityPolicy(activeNodeIds = []) {
    const activeNodeCount = Array.isArray(activeNodeIds)
      ? activeNodeIds.filter(
          (nodeId) => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ).length
      : NUM.ZERO;
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const requireEveryActiveNode =
      this.isControlPlanePublicationPriorityPartition();
    const requiredReadyNodeCount =
      isPriorityPartition &&
      !requireEveryActiveNode &&
      activeNodeCount > NUM.ZERO
        ? Math.max(
            NUM.ONE,
            Math.min(
              activeNodeCount,
              this.getPriorityControlPlaneTargetReplicaCount(),
            ),
          )
        : activeNodeCount;
    return Object.freeze({
      allowReadinessBackfill: isPriorityPartition,
      requiredReadyNodeCount,
    });
  }

  /**
   * Resolve the short retry cadence used while startup-critical control-plane
   * partitions wait on gating conditions.
   * @return {number}
   */
  getPriorityRetryDelayMs() {
    const configuredDelayMs =
      Number.isFinite(this.criticalCheckDelayMs) &&
      this.criticalCheckDelayMs > NUM.ZERO
        ? Math.floor(this.criticalCheckDelayMs)
        : REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    return Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, configuredDelayMs);
  }

  /**
   * Resolve the first scheduler delay after leadership activation.
   * Priority control-plane partitions should begin checking quickly instead
   * of inheriting the ordinary 60s+ periodic cadence.
   * @return {number}
   */
  getLeadershipStartDelayMs() {
    if (this.isControlPlanePriorityPartition()) {
      return Math.max(
        UNIFIED_REBALANCER_LITERAL.ONE,
        Math.floor(Math.random() * this.getPriorityRetryDelayMs()),
      );
    }
    // Stagger initial check with per-entity random offset to avoid
    // thundering herd when many partitions become leaders at once
    // (e.g. during bootstrap or rolling restarts).
    const initialJitter = Math.floor(
      Math.random() * this.periodicCheckIntervalMs,
    );
    return this.periodicCheckIntervalMs + initialJitter;
  }

  /**
   * Schedule a follow-up check using the priority control-plane cadence when
   * this entity owns startup-critical control-plane work.
   * @param {number|null} [delayMs]
   */
  schedulePriorityAwareCheck(delayMs = null) {
    if (this.isControlPlanePriorityPartition()) {
      this.scheduleNextCheck(this.getPriorityRetryDelayMs());
      return;
    }
    this.scheduleNextCheck(delayMs);
  }

  /**
   * Resolve start delay before rebalancing is eligible.
   * @return {number} Delay in milliseconds.
   */
  getRebalanceStartDelayMs() {
    if (this.entityType !== EntityType.PARTITION) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    if (this.isSystemPartitionEntity()) {
      return this.systemPartitionStartDelayMs;
    }
    return this.userPartitionStartDelayMs;
  }

  /**
   * Milliseconds remaining until this entity is eligible for rebalancing.
   * @param {number} [nowMs=Date.now()] - Current timestamp.
   * @return {number} Remaining milliseconds, or 0 if eligible.
   */
  getTimeUntilRebalanceStartEligible(nowMs = Date.now()) {
    const delayMs = this.getRebalanceStartDelayMs();
    if (delayMs <= UNIFIED_REBALANCER_LITERAL.ZERO) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    const elapsed = nowMs - this.rebalanceStartAtMs;
    const remaining = delayMs - elapsed;
    return remaining > UNIFIED_REBALANCER_LITERAL.ZERO
      ? remaining
      : UNIFIED_REBALANCER_LITERAL.ZERO;
  }

  /**
   * Check if stabilization period has elapsed since last state change.
   * Requirements: 2.2, 2.3
   * @return {boolean} True if stable (no recent state changes).
   */
  isStabilized() {
    if (!this.lastStateChangeTime) {
      return true;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    return elapsed >= this.stabilizationPeriodMs;
  }

  /**
   * Record a state change and reset stabilization timer.
   * Requirements: 2.5
   * @param {string} reason - Reason for state change.
   */
  recordStateChange(reason) {
    if (this.isShuttingDown) {
      return;
    }

    this.lastStateChangeTime = Date.now();

    this.logger.debug(REBALANCER_LOG_MSG.STABILIZATION_RESET, {
      entityId: this.entityId,
      reason,
      stabilizationPeriodMs: this.stabilizationPeriodMs,
    });

    // Any previously scheduled periodic or stabilization check now represents
    // stale topology evidence. Replace them with one fresh stabilization timer.
    this.cancelScheduledCheck();
    this.cancelStabilizationTimer();

    // Schedule check after stabilization period
    if (this.isLeader) {
      this.stabilizationTimer = setTimeout(() => {
        this.stabilizationTimer = null;
        this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
      }, this.stabilizationPeriodMs);
    }
  }

  /**
   * Get the current stabilization period in milliseconds.
   * @return {number} Stabilization period.
   */
  getStabilizationPeriodMs() {
    return this.stabilizationPeriodMs;
  }

  /**
   * Get the time remaining until stabilization completes.
   * @return {number} Milliseconds remaining, or 0 if already stable.
   */
  getTimeUntilStabilized() {
    if (!this.lastStateChangeTime) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    const remaining = this.stabilizationPeriodMs - elapsed;
    return Math.max(UNIFIED_REBALANCER_LITERAL.ZERO, remaining);
  }

  /**
   * Validate and adjust replica count to be odd.
   * @param {number} count - Desired replica count.
   * @param {Object} policy - Policy with min/max constraints.
   * @return {number} Valid odd replica count.
   */
  validateReplicaCount(count, policy) {
    return this.movePlanner.validateReplicaCount(count, policy);
  }

  /**
   * Calculate target replica count based on policy and current state.
   * Supports growing/shrinking in odd increments (3→5→7 or 7→5→3).
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {number} Target replica count.
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    return this.movePlanner.calculateTargetReplicaCount(
      currentReplicas,
      policy,
    );
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy - Applicable policy.
   * @return {number} Desired policy target.
   */
  getPolicyTargetReplicaCount(policy) {
    return this.movePlanner.getPolicyTargetReplicaCount(policy);
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy - Applicable policy.
   * @param {Array<Object>} availableNodes - Ready nodes.
   * @return {number} Actionable target for current topology.
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    return this.movePlanner.getActionableTargetReplicaCount(
      policy,
      availableNodes,
    );
  }

  /**
   * Resolve the latest membership publication row, regardless of status.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    let publicationRow = null;
    if (
      publicationService &&
      typeof publicationService.getLatestClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (
      publicationService &&
      typeof publicationService.getLatestPublicationRowSync === TYPEOF.FUNCTION
    ) {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }
    return publicationRow && typeof publicationRow === TYPEOF.OBJECT
      ? publicationRow
      : null;
  }

  /**
   * Resolve the latest published membership row when available.
   * @return {Object|null}
   * @private
   */
  getLatestPublishedMembershipRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    const latestPublicationRow = this.getLatestMembershipPublicationRow();
    const publishedPublicationRow =
      this.getPublishedMembershipRowFallback(publicationService);
    return this.selectPublishedMembershipRow(
      latestPublicationRow,
      publishedPublicationRow,
    );
  }

  /**
   * Resolve one published-publication fallback row from the publication owner.
   * @param {Object|null} publicationService
   * @return {Object|null}
   * @private
   */
  getPublishedMembershipRowFallback(publicationService) {
    if (
      publicationService &&
      typeof publicationService.getLatestPublishedClusterPublicationSync ===
        TYPEOF.FUNCTION
    ) {
      return publicationService.getLatestPublishedClusterPublicationSync();
    }
    if (
      publicationService &&
      typeof publicationService.getLatestPublishedPublicationRowSync ===
        TYPEOF.FUNCTION
    ) {
      return publicationService.getLatestPublishedPublicationRowSync();
    }
    return null;
  }

  /**
   * Choose one published membership row when available.
   * @param {Object|null} latestPublicationRow
   * @param {Object|null} publishedPublicationRow
   * @return {Object|null}
   * @private
   */
  selectPublishedMembershipRow(latestPublicationRow, publishedPublicationRow) {
    const candidateRow =
      String(latestPublicationRow?.status || "").toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
        ? latestPublicationRow
        : publishedPublicationRow;
    return String(
      candidateRow?.status || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase() === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
      ? candidateRow
      : null;
  }

  /**
   * Global priority control-plane recovery remains active while the latest
   * publication row still reports spread unsatisfied.
   * @return {boolean}
   * @private
   */
  isGlobalPriorityControlPlaneRecoveryActive() {
    return this.getPriorityRecoveryAdmissionPlan().recoveryActive === true;
  }

  /**
   * Publication and replica-operation partitions own the recovery surfaces
   * the rest of priority convergence depends on. Keep the emergency
   * classification aligned with the coordinator admission contract rather
   * than the broader transport-critical routing classifier.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    return isPriorityRecoveryEmergencyPartition(partitionId);
  }

  /**
   * Resolve the current priority-recovery admission plan from membership
   * publication state so move-budget reservation follows the same canonical
   * recovery summary as coordinator add admission.
   * @return {Object}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    return resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker: this.priorityRecoveryAdmissionTracker,
      publicationRow: this.getLatestMembershipPublicationRow(),
      nowMs: this.nowFn(),
      staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
      maxConcurrentAdds: this.maxConcurrentMoves,
      isPriorityPartition: (partitionId) =>
        isPriorityControlPlanePartition({
          partitionId,
        }),
      isEmergencyPriorityPartition: (partitionId) =>
        this.isEmergencyPriorityControlPlanePartition(partitionId),
    });
  }

  /**
   * Priority control-plane partitions participate directly in the global
   * recovery phase tracked from membership publication state.
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneRecoveryActive() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    return this.isGlobalPriorityControlPlaneRecoveryActive();
  }

  /**
   * Reserve one global move slot for priority recovery while non-priority
   * system partitions are still sharing the global rebalance budget.
   * @return {number}
   * @private
   */
}

export { UnifiedRebalancerSegment1 };
