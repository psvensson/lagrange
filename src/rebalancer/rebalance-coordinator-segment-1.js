import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SYSTEMTABLECACHE = 'systemTableCache';
const LOCAL_STR_O1VD7 = 'cdcIntegrationService';
const LOCAL_STR_MESSAGEROUTER = 'messageRouter';
const LOCAL_STR_TABLEPOLICYSERVICE = 'tablePolicyService';
const LOCAL_STR_SQLQUERYENGINE = 'sqlQueryEngine';
const LOCAL_STR_1506A = 'storageAccountingService';
const LOCAL_STR_NXU1D = 'storageAdmissionService';
const LOCAL_STR_1UD6S = 'cdcGroupPropagationService';
const LOCAL_STR_V9KQS = 'bootstrapReadinessState';
const LOCAL_STR_1KAZK = 'startupRecoveryCoordinator';
const LOCAL_STR_1WEH4 = 'controlPlaneReadinessService';
const LOCAL_STR_1HYTQ = 'transactionCoordinator';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_OBJECT = 'object';

const {
  CONTROL_PLANE_QUERY_OPTIONS,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  EventEmitter,
  ExecutorOutcomeEmitter,
  INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  LoggingService,
  NUM,
  OUTCOME_EVENT_NAME,
  OperationLane,
  OperationWorkflowOwner,
  ProvisioningAdmissionPolicy,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SUBSYSTEM,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
  SERVICE_TYPE,
  SQL,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  UNIFIED_SERVICE_TYPE,
  assertCritical,
  createControlPlaneRuntimeBundle,
  getControlPlaneRetryAfterMs,
  readAuthoritativeControlPlaneRows,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorSegment1 extends EventEmitter {
  get logger() {
    return this._logger;
  }

  /**
   * Keep coordinator-extracted owners on one logger surface.
   * @param {Object} value
   */
  set logger(value) {
    this._logger = value || console;
    if (this.executorOutcomeEmitter) {
      this.executorOutcomeEmitter.logger = this._logger;
    }
    if (this.repository) {
      this.repository.logger = this._logger;
    }
    if (this.workflowOwner) {
      this.workflowOwner.logger = this._logger;
    }
    if (this.provisioningAdmissionPolicy) {
      this.provisioningAdmissionPolicy.logger = this._logger;
    }
  }

  /**
   * Create a new RebalanceCoordinator instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.messageRouter - MessageRouter instance for delivery.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {Object} options.sqlQueryEngine - SQL query engine for system table access.
   * @param {Object} [options.storageAccountingService] - Storage capacity
   *   accounting service for replica size estimation.
   * @param {Object} [options.storageAdmissionService] - Storage admission
   *   service for reservation management.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      REBALANCE_COORDINATOR_ERROR_MSG.NODE_ID_REQUIRED,
    );
    this.systemTableCache = assertCritical(
      options.systemTableCache,
      REBALANCE_COORDINATOR_ERROR_MSG.CACHE_REQUIRED,
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      REBALANCE_COORDINATOR_ERROR_MSG.CDC_REQUIRED,
    );
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.messageRouter,
      }).controlPlaneSystemTableGateway;
    this.messageRouter = assertCritical(
      options.messageRouter,
      REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING,
    );
    this.tablePolicyService = assertCritical(
      options.tablePolicyService,
      REBALANCE_COORDINATOR_ERROR_MSG.POLICY_REQUIRED,
    );
    this.sqlQueryEngine = assertCritical(
      options.sqlQueryEngine,
      REBALANCE_COORDINATOR_ERROR_MSG.SQL_ENGINE_REQUIRED,
    );
    this.enableTimeouts = options.enableTimeouts !== false;

    // Optional storage capacity services (Req 4.1, 11.4)
    this.storageAccountingService = options.storageAccountingService || null;
    this.storageAdmissionService = options.storageAdmissionService || null;
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService || null;
    this.bootstrapReadinessState = options.bootstrapReadinessState || null;
    this.startupRecoveryCoordinator =
      options.startupRecoveryCoordinator ||
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

    // Configuration (centralized) - Requirements 6.1, 6.4
    const configManager = ConfigurationManager.getInstance();
    this.config = {
      pendingTimeoutMs:
        configManager.get(REBALANCER_CONFIG_KEY.PENDING_TIMEOUT_MS) ||
        REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
      creatingTimeoutMs:
        configManager.get(REBALANCER_CONFIG_KEY.CREATING_TIMEOUT_MS) ||
        REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS,
      syncingTimeoutMs:
        configManager.get(REBALANCER_CONFIG_KEY.SYNCING_TIMEOUT_MS) ||
        REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS,
      removingTimeoutMs:
        configManager.get(REBALANCER_CONFIG_KEY.REMOVING_TIMEOUT_MS) ||
        REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS,
      maxConcurrentAdds:
        configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_ADDS) ||
        REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS,
      maxConcurrentRemoves:
        configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_REMOVES) ||
        REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_REMOVES,
      periodicCheckIntervalMs:
        configManager.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) ||
        REBALANCER_DEFAULT.COORDINATOR.PERIODIC_CHECK_INTERVAL_MS,
      reservationTtlMs:
        configManager.get(STORAGE_CAPACITY_CONFIG_KEY.RESERVATION_TTL_MS) ||
        STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    };

    // Timeout checking interval
    this.timeoutCheckInterval = null;
    this.timeoutCheckInFlight = false;
    this.timeoutCheckIntervalMs =
      REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS;
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    this.incompleteOperationQueryEmptyBackoffMs =
      INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.COORDINATOR) :
      console;

    // Statistics (local counters only, not cached state)
    this.stats = {
      operationsCreated: NUM.ZERO,
      operationsCompleted: NUM.ZERO,
      operationsFailed: NUM.ZERO,
      operationsTimedOut: NUM.ZERO,
      reservationsCreated: NUM.ZERO,
      reservationsReleased: NUM.ZERO,
      reservationsReconciled: NUM.ZERO,
    };

    this.operationWorkflowCoordinator = assertCritical(
      options.operationWorkflowCoordinator || new DurableWorkflowCoordinator(),
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED,
    );
    this.operationLane =
      options.operationLane ||
      new OperationLane({
        name: REBALANCER_SUBSYSTEM.COORDINATOR,
        workflowCoordinator: this.operationWorkflowCoordinator,
      });
    this.operationWorkflowRunExclusive = assertCritical(
      typeof this.operationLane.run === LOCAL_STR_FUNCTION ?
        this.operationLane.run.bind(this.operationLane) :
        null,
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED,
    );
    const workflowInFlightExecutions = assertCritical(
      this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey instanceof
        Map ?
        this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey :
        null,
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REGISTRY_REQUIRED,
    );
    this.operationsInCreation = workflowInFlightExecutions;
    this.operationsInExecution = workflowInFlightExecutions;
    this.transactionCoordinator = options.transactionCoordinator || null;
    this.nowFn = typeof options.nowFn === LOCAL_STR_FUNCTION ? options.nowFn : Date.now;
    this.priorityRecoveryActivityStaleGraceMs = Number.isFinite(
      options.priorityRecoveryActivityStaleGraceMs,
    ) ?
      Math.max(
        NUM.ZERO,
        Math.floor(options.priorityRecoveryActivityStaleGraceMs),
      ) :
      DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS;
    this.priorityRecoveryAdmissionTracker = {
      lastObservedAdmissionPlan: null,
      lastObservedAdmissionPlanAtMs: null,
    };
    this.recentOperationIntents = new Map();
    this.replicaOperationTransitionQueue = Promise.resolve();

    this.executorOutcomeEmitter =
      options.executorOutcomeEmitter ||
      new ExecutorOutcomeEmitter({logger: this.logger});
    this._boundOutcomeHandler = null;
    this.cacheChangeListener = null;
    this._boundTerminalOperationIntentPruner = null;

    // Repository owns SQL/cache access and row translation (D7.1)
    this.repository =
      options.repository ||
      new ReplicaOperationRepository({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        logger: this.logger,
        emitter: this,
      });

    // Workflow owner owns single-flight keys, step transitions,
    // claim/dispatch progression, and reconciliation (D7.1)
    this.workflowOwner =
      options.workflowOwner ||
      new OperationWorkflowOwner({
        repository: this.repository,
        operationLane: this.operationLane,
        operationWorkflowCoordinator: this.operationWorkflowCoordinator,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        messageRouter: this.messageRouter,
        tablePolicyService: this.tablePolicyService,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        emitter: this,
        config: this.config,
        nodeId: this.nodeId,
        stats: this.stats,
        isShuttingDown: () => this.isShuttingDown,
        isInitialized: () => this.initialized,
        releaseReservationForOperation: (op) =>
          this.releaseReservationForOperation(op),
        reconcileReservations: () => this.reconcileReservations(),
        allocateCanonicalReplicaId: (params) =>
          this.allocateCanonicalReplicaId(params),
        getActualReplicaStatus: (...args) =>
          this.getActualReplicaStatus(...args),
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
        replicaOperationDispatchTimeoutMs:
          options.replicaOperationDispatchTimeoutMs,
        incompleteOperationQueryEmptyBackoffMs:
          INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS,
      });

    // Admission policy owns storage/readiness synthesis for provisioning
    // decisions while coordinator remains compatibility facade (D7.1/D7.2).
    this.provisioningAdmissionPolicy =
      options.provisioningAdmissionPolicy ||
      new ProvisioningAdmissionPolicy({
        nodeId: this.nodeId,
        logger: this.logger,
        delegates: {
          getNodeId: () => this.nodeId,
          getControlPlaneReadinessService: () =>
            this.controlPlaneReadinessService,
          getStorageAdmissionService: () => this.storageAdmissionService,
          getStorageAccountingService: () => this.storageAccountingService,
          isCriticalSystemPartition: (partitionId) =>
            this.isCriticalSystemPartition(partitionId),
          normalizeMoveType: (moveType) => this.normalizeMoveType(moveType),
        },
      });

    this.isShuttingDown = false;
    this.initialized = false;
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    const previousSystemTableCache = this.systemTableCache;

    if (Object.hasOwn(options, LOCAL_STR_SYSTEMTABLECACHE)) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_O1VD7)) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_TABLEPOLICYSERVICE)) {
      this.tablePolicyService = options.tablePolicyService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_SQLQUERYENGINE)) {
      this.sqlQueryEngine = options.sqlQueryEngine || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1506A)) {
      this.storageAccountingService = options.storageAccountingService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_NXU1D)) {
      this.storageAdmissionService = options.storageAdmissionService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1UD6S)) {
      this.cdcGroupPropagationService =
        options.cdcGroupPropagationService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_V9KQS)) {
      this.bootstrapReadinessState = options.bootstrapReadinessState || null;
      if (
        this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
          LOCAL_STR_FUNCTION
      ) {
        this.startupRecoveryCoordinator.syncOwnerDependencies({
          readinessState: this.bootstrapReadinessState,
        });
      }
    }
    if (Object.hasOwn(options, LOCAL_STR_1KAZK)) {
      this.startupRecoveryCoordinator =
        options.startupRecoveryCoordinator || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1WEH4)) {
      this.controlPlaneReadinessService =
        options.controlPlaneReadinessService || null;
    }
    if (Object.hasOwn(options, LOCAL_STR_1HYTQ)) {
      this.transactionCoordinator = options.transactionCoordinator || null;
    }

    if (
      this.repository &&
      typeof this.repository.syncOwnerDependencies === LOCAL_STR_FUNCTION
    ) {
      this.repository.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        logger: this.logger,
      });
    }

    if (this.workflowOwner) {
      this.workflowOwner.controlPlaneReadinessService =
        this.controlPlaneReadinessService;
      this.workflowOwner.messageRouter = this.messageRouter;
      this.workflowOwner.tablePolicyService = this.tablePolicyService;
      this.workflowOwner.transactionCoordinator = this.transactionCoordinator;
    }

    if (
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.syncOwnerDependencies ===
        LOCAL_STR_FUNCTION
    ) {
      this.controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      });
    }

    if (
      this.initialized &&
      previousSystemTableCache !== this.systemTableCache
    ) {
      this.unbindSystemTableCacheListener(previousSystemTableCache);
      this.bindSystemTableCacheListener();
    }
  }

  /**
   * Bind coordinator cache-change observation to the current cache.
   * @private
   */
  bindSystemTableCacheListener() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.onCacheChange !== LOCAL_STR_FUNCTION
    ) {
      return;
    }
    if (!this.cacheChangeListener) {
      this.cacheChangeListener = (tableName, operation, record) => {
        this.handleObservedReplicaStateChange(tableName, operation, record);
      };
    }
    this.systemTableCache.onCacheChange(this.cacheChangeListener);
  }

  /**
   * Remove coordinator cache-change observation from one cache.
   * @param {Object|null} systemTableCache
   * @private
   */
  unbindSystemTableCacheListener(systemTableCache = this.systemTableCache) {
    if (
      !this.cacheChangeListener ||
      !systemTableCache ||
      typeof systemTableCache.offCacheChange !== LOCAL_STR_FUNCTION
    ) {
      return;
    }
    systemTableCache.offCacheChange(this.cacheChangeListener);
  }

  /**
   * Bind terminal-operation events to recent-intent cache pruning.
   * @private
   */
  bindTerminalOperationIntentPruner() {
    if (!this._boundTerminalOperationIntentPruner) {
      this._boundTerminalOperationIntentPruner = (payload = {}) => {
        this.pruneRecentOperationIntentsForOperation(payload?.operation);
      };
    }
    this.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      this._boundTerminalOperationIntentPruner,
    );
    this.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      this._boundTerminalOperationIntentPruner,
    );
  }

  /**
   * Remove terminal-operation recent-intent pruning listeners.
   * @private
   */
  unbindTerminalOperationIntentPruner() {
    if (!this._boundTerminalOperationIntentPruner) {
      return;
    }
    this.removeListener(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      this._boundTerminalOperationIntentPruner,
    );
    this.removeListener(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      this._boundTerminalOperationIntentPruner,
    );
  }

  /**
   * Initialize the coordinator.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.isShuttingDown = false;

    // Subscribe to executor outcome events through the emitter.
    // Outcomes are routed through the owner-key reconcile queue so
    // the coordinator remains the single writer for workflow fields.
    this._boundOutcomeHandler = (outcome) =>
      this.handleExecutorOutcome(outcome);
    this.executorOutcomeEmitter.on(
      OUTCOME_EVENT_NAME,
      this._boundOutcomeHandler,
    );
    this.bindSystemTableCacheListener();
    this.bindTerminalOperationIntentPruner();

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      config: this.config,
    });

    // Start timeout checking
    if (this.enableTimeouts) {
      this.startTimeoutChecking();
    }

    this.initialized = true;
  }

  /**
   * Start periodic timeout checking.
   * @private
   */
  startTimeoutChecking() {
    if (this.timeoutCheckInterval) {
      return;
    }

    this.timeoutCheckInterval = setInterval(() => {
      if (this.isShuttingDown || this.timeoutCheckInFlight === true) {
        return;
      }
      this.timeoutCheckInFlight = true;
      void this.checkTimeouts()
        .catch((error) => {
          this.logQueryOperationsFailure(error);
        })
        .finally(() => {
          this.timeoutCheckInFlight = false;
        });
    }, this.timeoutCheckIntervalMs);
    // Unref to allow process exit when this is the only timer
    this.timeoutCheckInterval.unref();
  }

  /**
   * Stop periodic timeout checking.
   * @private
   */
  stopTimeoutChecking() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
    this.timeoutCheckInFlight = false;
  }

  /**
   * Query an operation by ID using SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   * @private
   */
  async queryOperationById(operationId) {
    return this.repository.queryOperationById(operationId);
  }

  /**
   * Query incomplete operations using SQL engine.
   * @readModel COORDINATOR_TIMEOUT_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   * @param {Object} [options={}]
   * @param {string} [options.visibilityReadMode]
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations(options = {}) {
    const visibilityReadMode =
      this.resolveIncompleteOperationVisibilityReadMode(options);
    if (
      visibilityReadMode !==
        REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED &&
      this.shouldPauseAdmissionReadForLocalRouterPressure(options)
    ) {
      return this.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      visibilityReadMode,
    });
  }

  /**
   * Normalize coordinator-facing incomplete-operation visibility reads to one
   * named repository contract.
   *
   * Legacy boolean adapters stay local here so hot rebalancer callers can move
   * incrementally without reopening the repository boolean bag.
   *
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolveIncompleteOperationVisibilityReadMode(options = {}) {
    if (
      options?.visibilityReadMode ===
      REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
    ) {
      return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY;
    }
    if (
      options?.visibilityReadMode ===
      REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED
    ) {
      return REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED;
    }
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
  }

  /**
   * Query only the cache-visible incomplete operations.
   * This keeps cache-bound observation semantics explicit instead of exposing
   * cache-empty fallback tuning on the general repository API.
   *
   * @return {Promise<Array<Object>>}
   * @private
   */
  async queryCachedIncompleteOperations() {
    if (
      typeof this.repository?.queryCachedIncompleteOperations === LOCAL_STR_FUNCTION
    ) {
      return this.repository.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY,
    });
  }

  /**
   * Observe in-flight operations during shutdown from the cache boundary only.
   * Shutdown diagnostics must not reopen authoritative owner reads or retry
   * loops while the coordinator is tearing down.
   *
   * @return {Promise<Array<Object>>}
   * @private
   */
  async queryShutdownIncompleteOperations() {
    return this.queryCachedIncompleteOperations();
  }

  /**
   * Resolve the canonical incomplete-operation observation state from the
   * repository owner. Empty and deferred observations must stay distinct so
   * admission logic does not collapse a pressured owner read into true zero.
   *
   * @param {Array<Object>} [operations=[]]
   * @return {Object}
   * @private
   */
  getIncompleteOperationObservation(operations = []) {
    if (
      typeof this.repository?.resolveIncompleteOperationObservation ===
      LOCAL_STR_FUNCTION
    ) {
      return this.repository.resolveIncompleteOperationObservation(operations);
    }
    const operationCount = Array.isArray(operations) ? operations.length : 0;
    return Object.freeze({
      state:
        operationCount > LOCAL_NUM_ZERO ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operationCount,
      deferredOutcome: null,
      retryAfterMs: null,
    });
  }

  /**
   * Resolve one canonical entity-scoped authoritative operation observation.
   * Callers must not collapse deferred owner visibility into true zero.
   *
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Object>}
   * @private
   */
  async getEntityAuthoritativeOperationObservation(entityType, entityId) {
    const hasCustomObservationMethod =
      typeof this.repository?.getOperationsByEntityAuthoritativeObservation ===
        'function' &&
      this.repository.getOperationsByEntityAuthoritativeObservation !==
        ReplicaOperationRepository.prototype
          .getOperationsByEntityAuthoritativeObservation;
    if (hasCustomObservationMethod) {
      return this.repository.getOperationsByEntityAuthoritativeObservation(
        entityType,
        entityId,
      );
    }
    const hasCustomLegacyMethod =
      typeof this.repository?.getOperationsByEntityAuthoritative ===
        'function' &&
      this.repository.getOperationsByEntityAuthoritative !==
        ReplicaOperationRepository.prototype.getOperationsByEntityAuthoritative;
    const operations = hasCustomLegacyMethod ?
      await this.repository.getOperationsByEntityAuthoritative(
        entityType,
        entityId,
      ) :
      typeof this.repository
        ?.getOperationsByEntityAuthoritativeObservation === 'function' ?
        (
          await this.repository.getOperationsByEntityAuthoritativeObservation(
            entityType,
            entityId,
          )
        )?.operations :
        await this.repository.getOperationsByEntityAuthoritative(
          entityType,
          entityId,
        );
    const operationCount = Array.isArray(operations) ? operations.length : 0;
    return Object.freeze({
      state:
        operationCount > LOCAL_NUM_ZERO ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operationCount,
      operations: Array.isArray(operations) ? operations : [],
      deferredOutcome: null,
      retryAfterMs: null,
    });
  }

  /**
   * @param {Object|null} observation
   * @return {void}
   * @private
   */
  reconcileIncompleteOperationEmptyQueryDelay(observation = null) {
    if (observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY) {
      this.markEmptyIncompleteOperationQueryAt();
      return;
    }
    this.clearEmptyIncompleteOperationQueryDelay();
  }

  /**
   * @param {Object|null} observation
   * @return {boolean}
   * @private
   */
  shouldBlockOperationAdmissionOnIncompleteOperationObservation(
    observation = null,
  ) {
    return (
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    );
  }

  /**
   * Check for existing in-flight operation for entity/node combination.
   * Prevents duplicate operations (deduplication).
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} partitionId - Partition ID compatibility key.
   * @param {string} targetNodeId - Target node ID.
   * @param {string} entityType - Entity type (partition/message_group).
   * @param {string} entityId - Entity ID.
   * @return {Promise<Object|null>} Existing operation or null.
   * @private
   */
  async queryExistingInFlightOperation(
    partitionId,
    targetNodeId,
    entityType,
    entityId,
    move,
    options = {},
  ) {
    return this.repository.queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      move,
      this.operationMatchesMoveIntent.bind(this),
      options,
    );
  }

  /**
   * Convert database row to Operation object.
   * @param {Object} row - Database row.
   * @return {Object} Operation object.
   * @private
   */
  rowToOperation(row) {
    return this.repository.rowToOperation(row);
  }

  /**
   * Determine whether an operation has reached its terminal workflow step.
   * Falls back to status when workflow data is incomplete.
   * @param {Object} operation - Operation row or payload.
   * @return {boolean} True when terminal.
   * @private
   */
  isOperationTerminal(operation) {
    return this.repository.isOperationTerminal(operation);
  }

  /**
   * Resolve the canonical owner node for one operation lifecycle.
   * Source node owns operation progression. Legacy rows may fall back to
   * target node ownership when source is unavailable.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveOperationOwnerNodeId(operation) {
    return this.repository.resolveOperationOwnerNodeId(operation);
  }

  /**
   * Return true when this coordinator owns operation lifecycle progression.
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationLocallyOwned(operation) {
    return this.repository.isOperationLocallyOwned(operation);
  }

  /**
   * Resolve source replica ID for REPLACE operations.
   * @param {Object} operation - Operation payload.
   * @return {string|null} Source replica ID or null.
   * @private
   */
  getReplaceSourceReplicaId(operation) {
    return this.repository.getReplaceSourceReplicaId(operation);
  }

  /**
   * Check whether a REPLACE operation is in source-removal phase.
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE should remove the source replica.
   * @private
   */
  isReplaceRemovePhase(operation) {
    return this.repository.isReplaceRemovePhase(operation);
  }

  /**
   * Check whether a REPLACE operation is dispatching/reconciling source
   * removal (ACTIVE/STOPPING).
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE is in source-removal dispatch phase.
   * @private
   */
  isReplaceRemoveDispatchPhase(operation) {
    return this.repository.isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * Resolve target replica ID for REPLACE operations.
   * @param {Object} operation - Operation record.
   * @return {string|null} Target replacement replica ID.
   * @private
   */
  getReplaceTargetReplicaId(operation) {
    return this.repository.getReplaceTargetReplicaId(operation);
  }

  /**
   * Get service rows for an entity.
   * @readModel COORDINATOR_ENTITY_SERVICES —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching services rows.
   * @private
   */
  getEntityServiceRows({partitionId, entityType, entityId}) {
    return this.repository.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
  }

  /**
   * Read entity service rows from the authoritative services owner path.
   * Falls back to an empty list when the authoritative read is unavailable.
   * @readModel COORDINATOR_ENTITY_SERVICES_AUTHORITATIVE —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeEntityServiceRows({
    partitionId,
    entityType,
    entityId,
  }) {
    const observation = await this.getAuthoritativeEntityServiceRowsObservation(
      {
        partitionId,
        entityType,
        entityId,
      },
    );
    return observation.rows;
  }

  /**
   * Read entity service rows from the authoritative services owner path and
   * preserve whether the read succeeded so create-time topology guards can
   * distinguish "no rows" from "no authoritative answer".
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Object>}
   * @private
   */
  async getAuthoritativeEntityServiceRowsObservation({
    partitionId,
    entityType,
    entityId,
  }) {
    let sql = SQL.SELECT_PARTITION_SERVICES_BY_ENTITY;
    let params = [
      entityType || SERVICE_TYPE.PARTITION,
      partitionId || entityId,
    ];

    if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
      sql = SQL.SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY;
      params = [entityType, entityId];
    } else if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
      sql = SQL.SELECT_RUNTIME_SERVICES_BY_ENTITY;
      params = [entityType, entityId];
    }

    const result = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.SERVICES,
      sql,
      params,
      CONTROL_PLANE_QUERY_OPTIONS,
    );
    return Object.freeze({
      available: result.success === true && Array.isArray(result.rows),
      rows:
        result.success === true && Array.isArray(result.rows) ?
          result.rows :
          [],
      error: result?.error || null,
      reasonCode: result?.reasonCode || null,
      retryAfterMs: getControlPlaneRetryAfterMs(result),
    });
  }

  /**
   * Merge cache-visible and authoritative entity service rows into one node
   * occupancy snapshot so create-time invariants are adjudicated once.
   * @param {Array<Object>} cacheServiceRows
   * @param {Array<Object>} authoritativeServiceRows
   * @return {Array<Object>}
   * @private
   */
  mergeEntityServiceRows(cacheServiceRows = [], authoritativeServiceRows = []) {
    const mergedRowsByTopologyKey = new Map();
    const allRows = [
      ...(Array.isArray(cacheServiceRows) ? cacheServiceRows : []),
      ...(Array.isArray(authoritativeServiceRows) ?
        authoritativeServiceRows :
        []),
    ];
    for (const row of allRows) {
      if (!row || typeof row !== LOCAL_STR_OBJECT) {
        continue;
      }
      const serviceId = String(
        row.service_id ||
          row.serviceId ||
          row.replica_id ||
          row.replicaId ||
          '',
      ).trim();
      const partitionKey = String(
        row.partition_id || row.partitionId || '',
      ).trim();
      const nodeId = String(row.node_id || row.nodeId || '').trim();
      const topologyKey =
        serviceId.length > NUM.ZERO ?
          serviceId :
          [partitionKey, nodeId].join(':');
      if (topologyKey.length === NUM.ZERO) {
        continue;
      }
      mergedRowsByTopologyKey.set(topologyKey, row);
    }
    return [...mergedRowsByTopologyKey.values()];
  }

  /**
   * Resolve the steady-state target replica count for one create-time topology
   * guard. Partition guards use table policy; other entities do not currently
   * participate in this guard.
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @return {Promise<number|null>}
   * @private
   */
}

export {RebalanceCoordinatorSegment1};
