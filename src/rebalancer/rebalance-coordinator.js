/**
 * RebalanceCoordinator - Owns the complete rebalancing workflow.
 *
 * Architecture (per system guidelines):
 * - NO in-memory operations cache - system cache is single source of truth
 * - All reads go through SQL engine (which uses system cache first, then partition)
 * - All writes go through SQL engine to partition leader
 * - CDC events update system cache automatically
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isCriticalTransportControlPlanePartition as
    isCriticalTransportControlPlanePartitionTable,
  isPriorityControlPlanePartition as isPriorityControlPlanePartitionTable,
} from '../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../control-plane/control-plane-readiness-service.js';
import {
  createControlPlaneRuntimeBundle,
} from '../control-plane/control-plane-runtime-bundle.js';
import {
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildPriorityRecoveryOperationAssessment,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../control-plane/priority-recovery-snapshot.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {
  WORKFLOW_STEP, NUM, TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {assertCritical} from '../utils/assert.js';
import {
  buildControlPlaneQueryOptions,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
} from '../control-plane/timeout-budget.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OPERATION_METADATA_KEY,
  OperationType,
  createOperation as createOperationRecord,
} from './replica-status.js';
import {
  ReplicaOperationField,
} from './replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from './storage-capacity-constants.js';
import {
} from './executor-outcome-constants.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from './executor-outcome-emitter.js';
import {ReplicaOperationRepository} from './replica-operation-repository.js';
import {OperationWorkflowOwner} from './operation-workflow-owner.js';
import {ProvisioningAdmissionPolicy} from './provisioning-admission-policy.js';
import {
  buildReplicatedServiceBootstrapTopology,
} from '../service/replicated-service-topology.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE source_node_id = ?
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`,
  SELECT_OPERATIONS_BY_PARTITION: 'SELECT * FROM replica_operations WHERE partition_id = ?',
  SELECT_OPERATIONS_BY_ENTITY: `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`,
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`,
  SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ?`,
  INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
    status, workflow_step, created_at, updated_at, completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`,
  SELECT_REPLICA_STATUS: 'SELECT status FROM services WHERE service_id = ?',
  SELECT_REPLICA_BY_PARTITION_NODE: `SELECT status FROM services 
    WHERE partition_id = ? AND node_id = ?`,
  SELECT_PARTITION_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND partition_id = ?`,
  SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND group_id = ?`,
  SELECT_RUNTIME_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND service_id = ?`,
  INSERT_RESERVATION: `INSERT INTO storage_reservations (
    reservation_id, operation_id, entity_type, entity_id,
    partition_id, target_node_id, estimated_bytes,
    amplification_factor, status, reason_code,
    created_at, updated_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_RESERVATION_STATUS_BY_ID: `UPDATE storage_reservations
    SET status = ?, updated_at = ?, released_at = ?
    WHERE reservation_id = ? AND status = ?`,
  SELECT_ACTIVE_RESERVATIONS_BY_OPERATION:
    'SELECT * FROM storage_reservations WHERE operation_id = ? AND status = ?',
  SELECT_ACTIVE_RESERVATIONS:
    'SELECT * FROM storage_reservations WHERE status = ?',
  SELECT_EXPIRED_ACTIVE_RESERVATIONS:
    'SELECT * FROM storage_reservations WHERE status = ? AND expires_at <= ?',
});

const RECENT_INTENT_TTL_MS = 15000;
const INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS = TIME_MS.SECOND * NUM.FIVE;
const REPLICA_ID_SEPARATOR = '-r';
const REPLICA_ID_START_INDEX = NUM.ONE;
const DEFAULT_AMPLIFICATION_FACTOR = NUM.ONE;

const CONCURRENT_CREATE_BUDGET_SCOPE = Object.freeze({
  ADD: 'add',
  PRIORITY_ADD: 'priority_add',
  EMERGENCY_PRIORITY_ADD: 'emergency_priority_add',
  REMOVE: 'remove',
});
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const STORAGE_RESERVATION_READ_QUERY_OPTIONS = Object.freeze({
  ...CONTROL_PLANE_QUERY_OPTIONS,
  // Reservation cleanup is an internal recovery path. When the routed
  // authoritative owner is temporarily unavailable, fall back to the local
  // SQL-backed view instead of leaving stale reservations behind.
  allowSqlFallback: true,
});
const STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS = Object.freeze({
  readOptions: {
    preferOwnerRpcRead: true,
    requireOwnerRpcRead: true,
    allowOwnerRpcFallback: true,
    allowSqlFallback: false,
  },
});
const PRIORITY_RECENT_INTENT_TTL_MS = TIME_MS.MINUTE * NUM.TWO;

/**
 * RebalanceCoordinator manages the complete rebalancing workflow.
 * Uses SQL engine for all system information access (no in-memory cache).
 */
class RebalanceCoordinator extends EventEmitter {
  /**
   * @return {Object}
   */
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
    this.storageAccountingService =
      options.storageAccountingService || null;
    this.storageAdmissionService =
      options.storageAdmissionService || null;
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService || null;
    this.bootstrapReadinessState =
      options.bootstrapReadinessState || null;
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
        configManager.get(
          STORAGE_CAPACITY_CONFIG_KEY.RESERVATION_TTL_MS,
        ) || STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    };

    // Timeout checking interval
    this.timeoutCheckInterval = null;
    this.timeoutCheckInFlight = false;
    this.timeoutCheckIntervalMs = REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS;
    this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    this.incompleteOperationQueryEmptyBackoffMs =
      INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.COORDINATOR) : console;

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
      options.operationWorkflowCoordinator ||
        new DurableWorkflowCoordinator(),
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED,
    );
    this.operationLane = options.operationLane ||
      new OperationLane({
        name: REBALANCER_SUBSYSTEM.COORDINATOR,
        workflowCoordinator: this.operationWorkflowCoordinator,
      });
    this.operationWorkflowRunExclusive = assertCritical(
      typeof this.operationLane.run === 'function' ?
        this.operationLane.run.bind(this.operationLane) :
        null,
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED,
    );
    const workflowInFlightExecutions = assertCritical(
      this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey instanceof Map ?
        this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey :
        null,
      REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REGISTRY_REQUIRED,
    );
    this.operationsInCreation = workflowInFlightExecutions;
    this.operationsInExecution = workflowInFlightExecutions;
    this.transactionCoordinator = options.transactionCoordinator || null;
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : Date.now;
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

    this.executorOutcomeEmitter = options.executorOutcomeEmitter ||
      new ExecutorOutcomeEmitter({logger: this.logger});
    this._boundOutcomeHandler = null;
    this.cacheChangeListener = null;
    this._boundTerminalOperationIntentPruner = null;

    // Repository owns SQL/cache access and row translation (D7.1)
    this.repository = options.repository ||
      new ReplicaOperationRepository({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway:
          this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService:
          this.controlPlaneReadinessService,
        logger: this.logger,
        emitter: this,
      });

    // Workflow owner owns single-flight keys, step transitions,
    // claim/dispatch progression, and reconciliation (D7.1)
    this.workflowOwner = options.workflowOwner ||
      new OperationWorkflowOwner({
        repository: this.repository,
        operationLane: this.operationLane,
        operationWorkflowCoordinator:
          this.operationWorkflowCoordinator,
        controlPlaneReadinessService:
          this.controlPlaneReadinessService,
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
        releaseReservationForOperation:
          (op) => this.releaseReservationForOperation(op),
        reconcileReservations:
          () => this.reconcileReservations(),
        allocateCanonicalReplicaId:
          (params) => this.allocateCanonicalReplicaId(params),
        getActualReplicaStatus:
          (...args) => this.getActualReplicaStatus(...args),
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
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
          getStorageAdmissionService: () =>
            this.storageAdmissionService,
          getStorageAccountingService: () =>
            this.storageAccountingService,
          isCriticalSystemPartition: (partitionId) =>
            this.isCriticalSystemPartition(partitionId),
          normalizeMoveType: (moveType) =>
            this.normalizeMoveType(moveType),
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

    if (Object.hasOwn(options, 'systemTableCache')) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (Object.hasOwn(options, 'cdcIntegrationService')) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, 'messageRouter')) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, 'tablePolicyService')) {
      this.tablePolicyService = options.tablePolicyService || null;
    }
    if (Object.hasOwn(options, 'sqlQueryEngine')) {
      this.sqlQueryEngine = options.sqlQueryEngine || null;
    }
    if (Object.hasOwn(options, 'storageAccountingService')) {
      this.storageAccountingService =
        options.storageAccountingService || null;
    }
    if (Object.hasOwn(options, 'storageAdmissionService')) {
      this.storageAdmissionService =
        options.storageAdmissionService || null;
    }
    if (Object.hasOwn(options, 'cdcGroupPropagationService')) {
      this.cdcGroupPropagationService =
        options.cdcGroupPropagationService || null;
    }
    if (Object.hasOwn(options, 'bootstrapReadinessState')) {
      this.bootstrapReadinessState =
        options.bootstrapReadinessState || null;
      if (this.startupRecoveryCoordinator &&
          typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
            'function') {
        this.startupRecoveryCoordinator.syncOwnerDependencies({
          readinessState: this.bootstrapReadinessState,
        });
      }
    }
    if (Object.hasOwn(options, 'startupRecoveryCoordinator')) {
      this.startupRecoveryCoordinator =
        options.startupRecoveryCoordinator || null;
    }
    if (Object.hasOwn(options, 'controlPlaneReadinessService')) {
      this.controlPlaneReadinessService =
        options.controlPlaneReadinessService || null;
    }
    if (Object.hasOwn(options, 'transactionCoordinator')) {
      this.transactionCoordinator =
        options.transactionCoordinator || null;
    }

    if (this.repository &&
        typeof this.repository.syncOwnerDependencies === 'function') {
      this.repository.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway:
          this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService:
          this.controlPlaneReadinessService,
        logger: this.logger,
      });
    }

    if (this.workflowOwner) {
      this.workflowOwner.controlPlaneReadinessService =
        this.controlPlaneReadinessService;
      this.workflowOwner.messageRouter = this.messageRouter;
      this.workflowOwner.tablePolicyService = this.tablePolicyService;
      this.workflowOwner.transactionCoordinator =
        this.transactionCoordinator;
    }

    if (this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService
          .syncOwnerDependencies === 'function') {
      this.controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway:
          this.controlPlaneSystemTableGateway,
      });
    }

    if (this.initialized &&
        previousSystemTableCache !== this.systemTableCache) {
      this.unbindSystemTableCacheListener(previousSystemTableCache);
      this.bindSystemTableCacheListener();
    }
  }

  /**
   * Bind coordinator cache-change observation to the current cache.
   * @private
   */
  bindSystemTableCacheListener() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.onCacheChange !== 'function') {
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
    if (!this.cacheChangeListener ||
        !systemTableCache ||
        typeof systemTableCache.offCacheChange !== 'function') {
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
    this._boundOutcomeHandler =
      (outcome) => this.handleExecutorOutcome(outcome);
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
   * @param {boolean} [options.preferAuthoritativeRead]
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations(options = {}) {
    const preferAuthoritativeRead =
      options.preferAuthoritativeRead === true;
    if (!preferAuthoritativeRead &&
        this.isLocalRouterBackpressured(options)) {
      return this.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      preferAuthoritativeRead,
    });
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
    if (typeof this.repository?.queryCachedIncompleteOperations ===
        'function') {
      return this.repository.queryCachedIncompleteOperations();
    }
    return this.repository.queryIncompleteOperations({
      skipSqlFallbackWhenCacheEmpty: true,
    });
  }

  /**
   * Merge cache-visible and authoritative incomplete operation sets.
   * Authoritative rows win when both sources contain the same operation ID.
   *
   * Cache observation boundaries can lag individual rows. Timeout/recovery
   * loops must not stall just because one local cache snapshot only contains a
   * subset of the owner-authoritative in-flight operations.
   *
   * @param {Array<Object>} cachedIncompleteOps
   * @param {Array<Object>} authoritativeIncompleteOps
   * @return {Array<Object>}
   * @private
   */
  mergeIncompleteOperations(
    cachedIncompleteOps = [],
    authoritativeIncompleteOps = [],
  ) {
    const mergedByOperationId = new Map();
    for (const operation of cachedIncompleteOps) {
      if (!operation?.operationId) {
        continue;
      }
      mergedByOperationId.set(operation.operationId, operation);
    }
    for (const operation of authoritativeIncompleteOps) {
      if (!operation?.operationId) {
        continue;
      }
      mergedByOperationId.set(operation.operationId, operation);
    }
    return [...mergedByOperationId.values()].sort((left, right) => {
      const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
      const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
      }
      return String(left?.operationId || '').localeCompare(
        String(right?.operationId || ''),
      );
    });
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
    return this.repository.resolveOperationOwnerNodeId(
      operation,
    );
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
    return this.repository.getReplaceSourceReplicaId(
      operation,
    );
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
    return this.repository.getReplaceTargetReplicaId(
      operation,
    );
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
    return this.repository.getEntityServiceRows(
      {partitionId, entityType, entityId},
    );
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
    if (!result.success || !Array.isArray(result.rows)) {
      return [];
    }
    return result.rows;
  }

  /**
   * Get in-flight operation rows for an entity.
   * @readModel COORDINATOR_ENTITY_IN_FLIGHT —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching in-flight operations.
   * @private
   */
  getEntityInFlightOperationRows({entityType, entityId}) {
    return this.repository.getEntityInFlightOperationRows(
      {entityType, entityId},
    );
  }

  /**
   * Read one replica_operations row from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {string} operationId
   * @return {Object|null}
   * @private
   */
  getReplicaOperationRowFromCache(operationId) {
    return this.repository
      .getReplicaOperationRowFromCache(operationId);
  }

  /**
   * Filter replica_operations rows from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {Function} predicate
   * @return {Object[]|null}
   * @private
   */
  filterReplicaOperationRowsFromCache(predicate) {
    return this.repository
      .filterReplicaOperationRowsFromCache(predicate);
  }

  /**
   * Return true when one operation can advance from observed replica
   * progress. Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isObservedProgressOperationCandidate(operation) {
    return this.workflowOwner
      .isObservedProgressOperationCandidate(operation);
  }

  /**
   * Filter candidate operation ids for one observed services row.
   * Delegates to workflow owner (D7.1).
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   * @private
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    return this.workflowOwner
      .findObservedProgressOperationIds(
        serviceRow, cacheOperation,
      );
  }

  /**
   * Reconcile one observed replica-progress event.
   * Delegates to workflow owner (D7.1).
   * @param {string} operationId
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileObservedProgressOperation(operationId) {
    return this.workflowOwner
      .reconcileObservedProgressOperation(operationId);
  }

  /**
   * Observe services cache progress and re-enter the owner lane.
   * Delegates to workflow owner (D7.1).
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   * @return {void}
   * @private
   */
  handleObservedReplicaStateChange(
    tableName, cacheOperation, record,
  ) {
    return this.workflowOwner
      .handleObservedReplicaStateChange(
        tableName, cacheOperation, record,
      );
  }

  /**
   * Resolve in-flight replica IDs for an entity from authoritative SQL.
   * Single read-model path — no cache fallback.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID compatibility key.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} In-flight replica IDs.
   * @private
   */
  async getEntityInFlightReplicaIds(
    {partitionId, entityType, entityId},
  ) {
    return this.repository.getEntityInFlightReplicaIds(
      {partitionId, entityType, entityId},
    );
  }

  /**
   * Allocate canonical replica ID for ADD/REPLACE create phase.
   * Canonical format mirrors bootstrap replicas: `${entityId}-rN`.
   * @param {Object} params - Allocation parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @param {Array<string>} [params.excludeReplicaIds] - IDs that cannot be
   *   selected (e.g., REPLACE source replica during create phase).
   * @return {Promise<string>} Allocated canonical replica ID.
   * @private
   */
  async allocateCanonicalReplicaId({
    partitionId,
    entityType,
    entityId,
    excludeReplicaIds = [],
  }) {
    const usedReplicaIds = new Set();
    const serviceRows = this.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    const authoritativeServiceRows =
      await this.getAuthoritativeEntityServiceRows({
        partitionId,
        entityType,
        entityId,
      });
    const inFlightReplicaIds = await this.getEntityInFlightReplicaIds({
      partitionId,
      entityType,
      entityId,
    });

    for (const row of serviceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const row of authoritativeServiceRows) {
      const replicaId = row?.service_id || row?.replica_id;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    for (const replicaId of inFlightReplicaIds) {
      usedReplicaIds.add(replicaId);
    }

    for (const replicaId of excludeReplicaIds) {
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
    }

    const canonicalPrefix = `${entityId}${REPLICA_ID_SEPARATOR}`;
    let candidateIndex = REPLICA_ID_START_INDEX;
    while (true) {
      const candidateReplicaId = `${canonicalPrefix}${candidateIndex}`;
      if (!usedReplicaIds.has(candidateReplicaId)) {
        return candidateReplicaId;
      }
      candidateIndex++;
    }
  }

  /**
   * Normalize one move type to canonical upper-case enum representation.
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (typeof moveType !== 'string') {
      return null;
    }
    const normalized = moveType.toUpperCase();
    if (normalized.length === NUM.ZERO) {
      return null;
    }
    return normalized;
  }

  /**
   * Build a stable in-memory idempotency key for a move intent.
   * @param {Object} move - Move specification.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {string} Intent key.
   * @private
   */
  buildOperationIntentKey(move, entityType, entityId) {
    const normalizedType = this.normalizeMoveType(move?.type) || '';
    const targetNodeId = move?.nodeId || '';
    const replicaIntent = normalizedType === OperationType.REMOVE ||
      normalizedType === OperationType.REPLACE ?
      (move?.replicaId || '') :
      '';
    return `${entityType}:${entityId}:${normalizedType}:${targetNodeId}:${replicaIntent}`;
  }

  /**
   * Critical system partitions allow only one add-like recovery lifecycle in
   * flight. Use one broader key so target-node churn or authoritative entity
   * read misses cannot mint a second PENDING replacement for the same entity.
   *
   * @param {string|null} normalizedMoveType
   * @param {string} partitionId
   * @param {string} entityType
   * @param {string} entityId
   * @return {string|null}
   * @private
   */
  buildCriticalAddLikeIntentKey(
    move,
    normalizedMoveType,
    partitionId,
    entityType,
    entityId,
  ) {
    if (move?.enforceConcurrentOperationBudget !== true ||
        (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE) ||
        !this.isCriticalSystemPartition(partitionId)) {
      return null;
    }
    return `${entityType}:${entityId}:critical_add_like`;
  }

  /**
   * Determine whether an in-flight operation matches a new move intent.
   * @param {Object} operation - Existing operation.
   * @param {Object} move - New move request.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {boolean} True when intents match.
   * @private
   */
  operationMatchesMoveIntent(operation, move, entityType, entityId) {
    if (!operation || !move) {
      return false;
    }

    const operationType = this.normalizeMoveType(operation.type) || '';
    const moveType = this.normalizeMoveType(move.type) || '';
    if (operationType !== moveType) {
      return false;
    }

    if (operation.targetNodeId !== move.nodeId) {
      return false;
    }

    if ((operation.entityType || SERVICE_TYPE.PARTITION) !== entityType) {
      return false;
    }

    if ((operation.entityId || operation.partitionId) !== entityId) {
      return false;
    }

    if (moveType === OperationType.REMOVE) {
      return operation.replicaId === move.replicaId;
    }

    if (moveType === OperationType.REPLACE) {
      return this.getReplaceSourceReplicaId(operation) === move.replicaId;
    }

    return true;
  }

  /**
   * Get a recently remembered operation intent.
   * @param {string} dedupeKey - Intent key.
   * @return {Object|null} Cached operation or null.
   * @private
   */
  async getRecentOperationIntent(dedupeKey) {
    const cached = this.recentOperationIntents.get(dedupeKey);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    const cachedOperation = cached.operation;
    if (!cachedOperation ||
        this.isOperationTerminal(cachedOperation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    const cachedOperationId = cachedOperation.operationId;
    if (typeof cachedOperationId !== 'string' ||
        cachedOperationId.length === NUM.ZERO) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }

    let cacheVisibleOperation = null;
    try {
      cacheVisibleOperation = await this.queryOperationById(cachedOperationId);
    } catch (error) {
      this.logger.debug(
        'Failed to refresh recent operation intent from cache-visible state',
        {
          operationId: cachedOperationId,
          dedupeKey,
          error: error?.message || String(error),
        },
      );
    }
    if (cacheVisibleOperation &&
        this.isOperationTerminal(cacheVisibleOperation)) {
      this.pruneRecentOperationIntentsForOperation(cacheVisibleOperation);
      return null;
    }
    const operationForMissReuse =
      cacheVisibleOperation &&
      !this.isOperationTerminal(cacheVisibleOperation) ?
        cacheVisibleOperation :
        cachedOperation;

    const authoritativeOperation =
      await this.repository.queryAuthoritativeOperationById(
        cachedOperationId,
        {requireOwnerRpcRead: true},
      );
    if (!authoritativeOperation) {
      if (this.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        operationForMissReuse,
      )) {
        this.rememberOperationIntent(dedupeKey, operationForMissReuse);
        return operationForMissReuse;
      }
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    if (this.isOperationTerminal(authoritativeOperation)) {
      this.pruneRecentOperationIntentsForOperation(authoritativeOperation);
      return null;
    }

    this.rememberOperationIntent(dedupeKey, authoritativeOperation);
    return authoritativeOperation;
  }

  /**
   * Remember a recently created/reused operation intent.
   * @param {string} dedupeKey - Intent key.
   * @param {Object} operation - Operation payload.
   * @private
   */
  rememberOperationIntent(dedupeKey, operation) {
    if (!operation || this.isOperationTerminal(operation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return;
    }
    this.recentOperationIntents.set(dedupeKey, {
      operation,
      expiresAt: Date.now() + this.getRecentOperationIntentTtlMs(operation),
    });
  }

  /**
   * Remember one operation under one or more intent keys.
   * @param {string[]|Set<string>} intentKeys
   * @param {Object} operation
   * @private
   */
  rememberOperationIntents(intentKeys, operation) {
    const keys = Array.isArray(intentKeys) ?
      intentKeys :
      Array.from(intentKeys || []);
    for (const key of keys) {
      if (typeof key !== 'string' || key.length === NUM.ZERO) {
        continue;
      }
      this.rememberOperationIntent(key, operation);
    }
  }

  /**
   * Reused create-intent rows may still be the correct in-flight operation
   * while remaining stuck at PENDING because the first owner-side handoff was
   * deferred or missed. Re-arm those rows through the canonical owner path so
   * later planning retries do not keep returning one limbo operation forever.
   *
   * @param {Object|null} operation
   * @param {Object} [options={}]
   * @param {boolean} [options.shouldEmitOperationCreated]
   * @return {Promise<Object|null>}
   * @private
   */
  async maybeRearmReusedPendingOperation(
    operation,
    options = {},
  ) {
    const workflowStep = String(
      operation?.workflowStep ||
      operation?.workflow_step ||
      '',
    ).trim();
    if (!operation ||
        this.isOperationTerminal(operation) ||
        workflowStep !== WORKFLOW_STEP.PENDING) {
      return operation;
    }
    await this.armCoordinatorCreatedOperationProgress(operation);
    return operation;
  }

  /**
   * Drop cached create-intent entries that point at one terminal operation.
   * This keeps failed/completed priority recovery rows from suppressing the
   * next required operation while cache/owner reads are under pressure.
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  pruneRecentOperationIntentsForOperation(operation) {
    const operationId = String(
      operation?.operationId ||
      operation?.operation_id ||
      '',
    ).trim();
    if (operationId.length === NUM.ZERO) {
      return;
    }
    for (const [dedupeKey, entry] of this.recentOperationIntents.entries()) {
      if (String(entry?.operation?.operationId || '').trim() !== operationId) {
        continue;
      }
      this.recentOperationIntents.delete(dedupeKey);
    }
  }

  /**
   * Extend recent-intent retention for priority control-plane partitions so
   * transient owner-read misses do not create a new PENDING operation every
   * few seconds while the original one is still the intended recovery op.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationIntentTtlMs(operation) {
    const partitionId = String(
      operation?.partitionId ||
      operation?.entityId ||
      '',
    ).trim();
    if (!partitionId ||
        !this.isPriorityControlPlanePartition(partitionId)) {
      return RECENT_INTENT_TTL_MS;
    }
    const configuredPendingTimeoutMs = Number.isFinite(
      this.config?.pendingTimeoutMs,
    ) && this.config.pendingTimeoutMs > NUM.ZERO ?
      Math.floor(this.config.pendingTimeoutMs) :
      RECENT_INTENT_TTL_MS;
    return Math.max(
      RECENT_INTENT_TTL_MS,
      PRIORITY_RECENT_INTENT_TTL_MS,
      configuredPendingTimeoutMs * NUM.FOUR,
    );
  }

  /**
   * Resolve the workflow-timeout window that defines how long a missing
   * recent intent is still credible as an in-flight recovery operation.
   * Once a cached priority operation has aged past its own step timeout,
   * reusing it on authoritative misses suppresses the fresh recovery op that
   * the planner now needs to mint.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationMissReuseBudgetMs(operation) {
    const workflowStep = String(operation?.workflowStep || '').trim();
    if (workflowStep === WORKFLOW_STEP.CREATING) {
      return this.config.creatingTimeoutMs;
    }
    if (workflowStep === WORKFLOW_STEP.SYNCING) {
      return this.config.syncingTimeoutMs;
    }
    if (workflowStep === WORKFLOW_STEP.STOPPING ||
        workflowStep === WORKFLOW_STEP.ACTIVE) {
      return this.config.removingTimeoutMs;
    }
    return this.config.pendingTimeoutMs;
  }

  /**
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getOperationAgeMs(operation) {
    const updatedAt = Number(operation?.updatedAt);
    const createdAt = Number(operation?.createdAt);
    const startedAt = Number.isFinite(updatedAt) && updatedAt > NUM.ZERO ?
      updatedAt :
      createdAt;
    if (!Number.isFinite(startedAt) || startedAt <= NUM.ZERO) {
      return NUM.ZERO;
    }
    return Math.max(NUM.ZERO, Date.now() - startedAt);
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldReuseRecentOperationIntentOnAuthoritativeMiss(operation) {
    if (!operation || this.isOperationTerminal(operation)) {
      return false;
    }
    const partitionId = String(
      operation.partitionId ||
      operation.entityId ||
      '',
    ).trim();
    if (partitionId.length === NUM.ZERO ||
        !this.isPriorityControlPlanePartition(partitionId)) {
      return false;
    }

    const reuseBudgetMs =
      this.getRecentOperationMissReuseBudgetMs(operation);
    if (!Number.isFinite(reuseBudgetMs) || reuseBudgetMs <= NUM.ZERO) {
      return false;
    }

    return this.getOperationAgeMs(operation) < reuseBudgetMs;
  }

  /**
   * Prune expired recent operation intents.
   * @private
   */
  pruneExpiredOperationIntents() {
    const now = Date.now();
    for (const [key, entry] of this.recentOperationIntents.entries()) {
      if (!entry || entry.expiresAt <= now) {
        this.recentOperationIntents.delete(key);
      }
    }
  }

  /**
   * Build one operation single-flight key for shared workflow coordination.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string} Single-flight owner key.
   * @private
   */
  buildOperationSingleFlightKey(scope, key) {
    return this.workflowOwner
      .buildOperationSingleFlightKey(scope, key);
  }

  /**
   * Build create-operation single-flight key.
   * @param {string} dedupeKey - Move-intent dedupe key.
   * @return {string}
   * @private
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.workflowOwner
      .getCreateOperationSingleFlightKey(dedupeKey);
  }

  /**
   * Build the shared single-flight key for concurrent create-budget checks.
   * @param {string} scope
   * @return {string}
   * @private
   */
  getCreateBudgetSingleFlightKey(scope) {
    return this.workflowOwner
      .getCreateBudgetSingleFlightKey(scope);
  }

  /**
   * Build execute-operation single-flight key.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.workflowOwner
      .getExecuteOperationSingleFlightKey(operationId);
  }

  /**
   * Build the shared owner-key single-flight gate for one persisted
   * operation.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.workflowOwner
      .getOperationOwnerSingleFlightKey(operationId);
  }

  /**
   * Claim a PENDING operation for dispatch by transitioning it to
   * SENDING through the coordinator-owned workflow path.
   *
   * This is the single-owner replacement for the direct
   * cdcIntegrationService.updateSystemTableRow call that previously
   * lived in ReplicaDispatchService.claimPendingDispatch.
   *
   * Design reference: §2 — dispatch claim routed through coordinator.
   *
   * @param {string} operationId - The operation to claim.
   * @return {Promise<Object|null>} The claimed operation in SENDING
   *   state, or null if the claim could not be acquired (operation
   *   not found, not PENDING, or not locally owned).
   */
  async claimDispatchTransition(operationId) {
    return this.workflowOwner
      .claimDispatchTransition(operationId);
  }

  /**
   * Dispatch one operation through the coordinator-owned single-flight lane.
   * This is the canonical owner entry point for PENDING dispatch and any
   * retry of an already-claimed SENDING operation.
   *
   * Accepts either an operation id, a SQL row, or a canonical operation
   * payload. Callers that carry extra in-memory metadata (for example initial
   * bootstrap peer lists) should pass the canonical operation object so that
   * this owner path can preserve it.
   *
   * @param {string|Object} operationInput - Operation id or payload.
   * @return {Promise<Object>} Execution result or typed skip.
   */
  async dispatchOperation(operationInput) {
    return this.workflowOwner
      .dispatchOperation(operationInput);
  }

  /**
   * Normalize one topology mutation work class for coordinator callers.
   * Background work is deferable; interactive/critical work keeps its current
   * caller-visible behavior.
   *
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    return this.provisioningAdmissionPolicy
      .normalizeControlPlaneMutationWorkClass(move);
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   * @private
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    return this.provisioningAdmissionPolicy
      .buildLocalControlPlaneMutationAdmissionResult(blocker);
  }

  /**
   * Defer optional background topology mutation when the local control-plane
   * mutation contract is not currently healthy.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertLocalControlPlaneMutationReady(move) {
    return this.provisioningAdmissionPolicy
      .assertLocalControlPlaneMutationReady(move);
  }

  /**
   * Resolve the current published membership epoch, when available.
   * @return {number|null}
   * @private
   */
  getCurrentPublishedMembershipEpoch() {
    if (!this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getCurrentPublishedMembershipEpochSync !== 'function') {
      return null;
    }
    return this.controlPlaneReadinessService
      .getCurrentPublishedMembershipEpochSync(
        this.nodeId,
        Date.now(),
      );
  }

  /**
   * Reject stale epoch-bound placement requests after membership cutover.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertMembershipPublicationEpoch(move) {
    const requestedEpoch = Number(move?.membershipPublicationEpoch);
    if (!Number.isInteger(requestedEpoch) || requestedEpoch < 0) {
      return;
    }

    const currentEpoch = this.getCurrentPublishedMembershipEpoch();
    if (!Number.isInteger(currentEpoch) || currentEpoch === requestedEpoch) {
      return;
    }

    const error = new Error(
      `Stale placement plan for published membership epoch ${requestedEpoch}; ` +
      `current epoch is ${currentEpoch}`,
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_CHANGED;
    error.requestedMembershipPublicationEpoch = requestedEpoch;
    error.currentMembershipPublicationEpoch = currentEpoch;
    throw error;
  }

  /**
   * Create an operation record (persisted via SQL engine).
   * Includes deduplication check to prevent duplicate operations.
   * Requirements: 2.2, 2.3
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type: 'ADD', 'REMOVE', or 'REPLACE'.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Entity type for canonical operations.
   * @param {string} [move.entityId] - Entity ID for canonical operations.
   * @param {string} move.nodeId - Target node ID.
   * @param {string} [move.replicaId] - Replica ID (for REMOVE operations).
   * @param {boolean} [move.emitOperationCreated] - Emit the local
   *   coordinator-created dispatch trigger after persistence.
   * @param {boolean} [move.skipProvisioningAdmissionRecheck] - Reuse an
   *   immediately preceding admitted provisioning probe for this target.
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    if (this.isShuttingDown || !this.initialized) {
      throw new Error('RebalanceCoordinator is shutting down');
    }

    this.assertLocalControlPlaneMutationReady(move);

    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const shouldEmitOperationCreated = move?.emitOperationCreated !== false;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
    const criticalAddLikeIntentKey =
      this.buildCriticalAddLikeIntentKey(
        move,
        normalizedMoveType,
        partitionId,
        entityType,
        entityId,
      );
    const createOperationIntentKey =
      criticalAddLikeIntentKey || dedupeKey;
    const singleFlightKey =
      this.getCreateOperationSingleFlightKey(createOperationIntentKey);
    this.pruneExpiredOperationIntents();

    const recentOperation = await this.getRecentOperationIntent(dedupeKey);
    if (recentOperation) {
      return this.maybeRearmReusedPendingOperation(
        recentOperation,
        {shouldEmitOperationCreated},
      );
    }
    if (criticalAddLikeIntentKey &&
        criticalAddLikeIntentKey !== dedupeKey) {
      const recentCriticalOperation =
        await this.getRecentOperationIntent(criticalAddLikeIntentKey);
      if (recentCriticalOperation) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          recentCriticalOperation,
        );
        return this.maybeRearmReusedPendingOperation(
          recentCriticalOperation,
          {shouldEmitOperationCreated},
        );
      }
    }

    const existingPromise = this.operationsInCreation.get(singleFlightKey);
    if (existingPromise) {
      return existingPromise;
    }

    return this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.createOperationInternal(move),
    );
  }

  /**
   * Probe provisioning admission without persisting replica_operations rows.
   * Callers should use this before creating storage-increasing operations when
   * they need an all-or-nothing planning decision.
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Canonical entity type.
   * @param {string} [move.entityId] - Canonical entity ID.
   * @param {string} [move.nodeId] - Target node ID.
   * @param {string} [move.sourceNodeId] - Optional replace source node.
   * @return {Promise<Object>} Admission decision payload.
   */
  async checkProvisioningAdmission(move) {
    return this.provisioningAdmissionPolicy
      .checkProvisioningAdmission(move);
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move) {
    this.assertMembershipPublicationEpoch(move);

    const normalizedMoveType = this.normalizeMoveType(move?.type);
    const shouldEmitOperationCreated = move?.emitOperationCreated !== false;
    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMove = normalizedMoveType ?
      {
        ...move,
        type: normalizedMoveType,
      } :
      move;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
    const criticalAddLikeIntentKey =
      this.buildCriticalAddLikeIntentKey(
        move,
        normalizedMoveType,
        partitionId,
        entityType,
        entityId,
      );
    const sourceNodeId = normalizedMoveType === OperationType.REPLACE ?
      (move.sourceNodeId || this.nodeId) :
      this.nodeId;

    // Deduplication: check for existing in-flight operation
    const existing = await this.queryExistingInFlightOperation(
      partitionId,
      move.nodeId,
      entityType,
      entityId,
      normalizedMove,
      STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
    );

    if (existing) {
      this.rememberOperationIntents(
        [dedupeKey, criticalAddLikeIntentKey],
        existing,
      );
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, {
        existingOperationId: existing.operationId,
        partitionId: partitionId,
        targetNodeId: move.nodeId,
        type: normalizedMoveType || move.type,
        entityType: entityType,
        entityId: entityId,
      });
      return this.maybeRearmReusedPendingOperation(
        existing,
        {shouldEmitOperationCreated},
      );
    }

    if (criticalAddLikeIntentKey) {
      const recentCriticalOperation =
        await this.getRecentOperationIntent(criticalAddLikeIntentKey);
      if (recentCriticalOperation) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          recentCriticalOperation,
        );
        return this.maybeRearmReusedPendingOperation(
          recentCriticalOperation,
          {shouldEmitOperationCreated},
        );
      }
    }

    await this.ensureNoConflictingInFlightReplaceForRemove({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });

    await this.ensureCriticalPartitionCreateLaneAvailable({
      move,
      normalizedMoveType,
      entityType,
      entityId,
      partitionId,
    });

    if (this.shouldEnforceConcurrentOperationBudget(move, normalizedMoveType)) {
      return this.runConcurrentCreateBudgetGate(
        normalizedMoveType,
        {
          partitionId,
          entityType,
          entityId,
        },
        async () => this.createOperationRecordInternal({
          move,
          normalizedMove,
          normalizedMoveType,
          shouldEmitOperationCreated,
          entityType,
          entityId,
          partitionId,
          dedupeKey,
          criticalAddLikeIntentKey,
          sourceNodeId,
        }),
      );
    }

    return this.createOperationRecordInternal({
      move,
      normalizedMove,
      normalizedMoveType,
      shouldEmitOperationCreated,
      entityType,
      entityId,
      partitionId,
      dedupeKey,
      criticalAddLikeIntentKey,
      sourceNodeId,
    });
  }

  /**
   * Build canonical bootstrap topology for create dispatch.
   * Message-group operations fail closed when canonical topology is missing.
   * Partition operations derive topology when visible, but tolerate cache lag
   * so explicit bootstrap hints or local restore paths can still proceed.
   *
   * @param {Object} context
   * @return {{replicaIds: string[], peerAddresses: string[]}|null}
   * @private
   */
  buildOperationBootstrapTopology(context) {
    const {
      normalizedMoveType,
      entityType,
      entityId,
      excludeReplicaIds,
      partitionId,
      targetNodeId,
      targetReplicaId,
    } = context;

    if ((entityType !== SERVICE_TYPE.MESSAGE_GROUP &&
        entityType !== SERVICE_TYPE.PARTITION) ||
        (normalizedMoveType !== OperationType.ADD &&
          normalizedMoveType !== OperationType.REPLACE)) {
      return null;
    }

    const serviceRows = this.repository.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    if (!Array.isArray(serviceRows) || serviceRows.length === NUM.ZERO) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        return null;
      }
      throw new Error(
        `Cannot create ${entityType} operation for ${entityId} without existing canonical topology`,
      );
    }

    const topology = buildReplicatedServiceBootstrapTopology({
      serviceType: entityType,
      serviceRows,
      excludeReplicaIds,
      targetReplicaId,
      targetNodeId,
    });
    const replicaIds = topology?.replicaIds || [];
    const peerAddresses = topology?.peerAddresses || [];

    if (replicaIds.length <= NUM.ONE ||
        peerAddresses.length < replicaIds.length) {
      if (entityType === SERVICE_TYPE.PARTITION) {
        return null;
      }
      throw new Error(
        `Canonical topology for ${entityType} ${entityId} is incomplete`,
      );
    }

    return {
      replicaIds,
      peerAddresses,
    };
  }

  /**
   * Create and persist one operation after dedupe checks pass.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createOperationRecordInternal(context) {
    const {
      move,
      normalizedMove,
      normalizedMoveType,
      shouldEmitOperationCreated,
      entityType,
      entityId,
      partitionId,
      dedupeKey,
      criticalAddLikeIntentKey,
      sourceNodeId,
    } = context;

    const operationId = uuidv4();
    const sourceReplicaId = normalizedMoveType === OperationType.REPLACE ?
      (move.replicaId || null) :
      null;
    let operationReplicaId = move.replicaId || null;

    if (move?.skipProvisioningAdmissionRecheck !== true) {
      await this.ensureProvisioningAdmissionAllowed({
        move: normalizedMove,
        entityType,
        entityId,
        partitionId,
        sourceNodeId,
      });
    }

    if (normalizedMoveType === OperationType.ADD && !operationReplicaId) {
      operationReplicaId = await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
      });
    } else if (normalizedMoveType === OperationType.REPLACE &&
        (!operationReplicaId || operationReplicaId === sourceReplicaId)) {
      operationReplicaId = await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
        excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
      });
    }

    // Create operation using the helper from replica-status.js
    const operation = createOperationRecord({
      operationId,
      type: normalizedMoveType || move.type,
      partitionId: partitionId,
      sourceNodeId,
      targetNodeId: move.nodeId,
      replicaId: operationReplicaId,
      sourceReplicaId,
      membershipPublicationEpoch: move.membershipPublicationEpoch,
    });
    operation.entityType = entityType;
    operation.entityId = entityId;
    const bootstrapTopology = this.buildOperationBootstrapTopology({
      normalizedMoveType,
      entityType,
      entityId,
      excludeReplicaIds: normalizedMoveType === OperationType.REPLACE &&
        typeof sourceReplicaId === 'string' &&
        sourceReplicaId.length > NUM.ZERO ?
        [sourceReplicaId] :
        [],
      partitionId,
      targetNodeId: move.nodeId,
      targetReplicaId: operationReplicaId,
    });
    if (bootstrapTopology && operation.stepsHistory.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] =
        bootstrapTopology.replicaIds;
      operation[ReplicaOperationField.PEER_ADDRESSES] =
        bootstrapTopology.peerAddresses;
      operation.stepsHistory[NUM.ZERO][
        OPERATION_METADATA_KEY.REPLICA_IDS
      ] = bootstrapTopology.replicaIds;
      operation.stepsHistory[NUM.ZERO][
        OPERATION_METADATA_KEY.PEER_ADDRESSES
      ] = bootstrapTopology.peerAddresses;
    }

    // Capture readiness snapshot for the target node at creation time
    // (Req 4.2 — persist readiness snapshot with decisions)
    const readinessDecisionDimension =
      this.resolveOperationReadinessDecisionDimension(partitionId);
    const targetReadiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(
        move.nodeId,
        {
          decisionDimension:
            readinessDecisionDimension,
        },
      );
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        readinessDecisionDimension,
      );
    if (readinessSnapshot && operation.stepsHistory.length > NUM.ZERO) {
      operation.stepsHistory[NUM.ZERO][
        OPERATION_METADATA_KEY.READINESS_SNAPSHOT
      ] = readinessSnapshot;
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.CREATE_OPERATION, {
      operationId,
      type: normalizedMoveType || move.type,
      partitionId: partitionId,
      targetNodeId: move.nodeId,
      entityType: entityType,
      entityId: entityId,
    });

    // Persist via SQL engine (writes to partition leader)
    const inserted = await this.persistNewOperation(operation);
    if (!inserted) {
      const existingAfterInsert = await this.queryExistingInFlightOperation(
        partitionId,
        move.nodeId,
        entityType,
        entityId,
        normalizedMove,
        STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
      );
      if (existingAfterInsert) {
        this.rememberOperationIntents(
          [dedupeKey, criticalAddLikeIntentKey],
          existingAfterInsert,
        );
        return this.maybeRearmReusedPendingOperation(
          existingAfterInsert,
          {shouldEmitOperationCreated},
        );
      }
    }

    this.stats.operationsCreated++;
    this.rememberOperationIntents(
      [dedupeKey, criticalAddLikeIntentKey],
      operation,
    );

    // Create storage reservation atomically (Req 4.1)
    await this.createReservationForOperation(operation);

    if (shouldEmitOperationCreated) {
      this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});
      await this.armCoordinatorCreatedOperationProgress(operation);
    }

    return operation;
  }

  /**
   * Newly created locally owned operations should not depend solely on cache
   * visibility or external listeners before leaving PENDING. Prime the
   * owner-side transition lane best-effort while keeping dispatch ownership on
   * the canonical event/read-model paths.
   *
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  async armCoordinatorCreatedOperationProgress(operation) {
    if (!operation?.operationId ||
        typeof this.workflowOwner?.armCoordinatorCreatedOperation !==
          'function') {
      return false;
    }
    try {
      return await this.workflowOwner
        .armCoordinatorCreatedOperation(operation);
    } catch (error) {
      this.logger.warn(
        'Failed to prime coordinator-created operation progress',
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId || null,
          workflowStep: operation.workflowStep || null,
          error: error?.message || String(error),
        },
      );
      return false;
    }
  }

  /**
   * Determine whether this create request should enforce coordinator-level
   * concurrent operation budgets.
   * @param {Object} move
   * @param {string|null} normalizedMoveType
   * @return {boolean}
   * @private
   */
  shouldEnforceConcurrentOperationBudget(move, normalizedMoveType) {
    if (move?.enforceConcurrentOperationBudget !== true) {
      return false;
    }
    return normalizedMoveType === OperationType.ADD ||
      normalizedMoveType === OperationType.REPLACE ||
      normalizedMoveType === OperationType.REMOVE;
  }

  /**
   * Critical system partitions admit only one add-like workflow at a time.
   * This prevents multiple replacement learners from racing ahead of the
   * source-removal phase and creating temporary 5-voter critical groups.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCriticalPartitionCreateLaneAvailable(context) {
    const normalizedMoveType = context?.normalizedMoveType;
    if (context?.move?.enforceConcurrentOperationBudget !== true) {
      return;
    }
    if (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE) {
      return;
    }
    if (!this.isCriticalSystemPartition(context?.partitionId)) {
      return;
    }

    const existingOperations =
      await this.repository.getOperationsByEntityAuthoritative(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    let conflictingOperation = null;
    for (const operation of existingOperations) {
      if (!operation || this.isOperationTerminal(operation)) {
        continue;
      }
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      if (await this.shouldIgnoreCriticalAddBudgetOperation(operation)) {
        continue;
      }
      conflictingOperation = operation;
      break;
    }
    if (!conflictingOperation) {
      return;
    }

    throw this.createConcurrentOperationBudgetError(
      normalizedMoveType,
      1,
      {
        message: 'Critical partition ' +
          `${context.partitionId} already has an add-like operation ` +
          'in flight',
        conflictingOperationId: conflictingOperation.operationId,
      },
    );
  }

  /**
   * Priority recovery rows that already satisfy spread or no longer target the
   * current eligible cohort must not keep blocking the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async shouldIgnoreCriticalAddBudgetOperation(operation) {
    if (!operation ||
        !isPriorityControlPlanePartitionTable({
          partitionId: operation.partitionId,
        }) ||
        typeof this.workflowOwner
          ?.getPriorityRecoveryPlanningSnapshotForOperation !== 'function') {
      return false;
    }
    const planningSnapshot =
      await this.workflowOwner
        .getPriorityRecoveryPlanningSnapshotForOperation(operation);
    if (!planningSnapshot ||
        typeof planningSnapshot !== 'object') {
      return false;
    }
    const assessment = buildPriorityRecoveryOperationAssessment({
      operation,
      priorityPartitionSummary:
        planningSnapshot.priorityPartitionSummary || null,
      effectiveEligibleNodeIds:
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    });
    return !shouldPriorityRecoveryOperationBlockPlanning(assessment);
  }

  /**
   * Prevent conflicting REMOVE scheduling while a REPLACE workflow already
   * owns the same source/target replica lifecycle.
   *
   * This guard uses authoritative operation rows to avoid cache-staleness
   * races where planner-side pending-move tracking can lag behind a REPLACE
   * transition and allow an overlapping REMOVE to be created.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureNoConflictingInFlightReplaceForRemove(context) {
    if (context?.normalizedMoveType !== OperationType.REMOVE) {
      return;
    }
    const replicaId = String(context?.move?.replicaId || '').trim();
    if (replicaId.length === NUM.ZERO) {
      return;
    }

    const operations =
      await this.repository.getOperationsByEntityAuthoritative(
        context?.entityType || SERVICE_TYPE.PARTITION,
        context?.entityId || context?.partitionId,
      );
    const conflictingOperation = operations.find((operation) => {
      if (!operation ||
          this.isOperationTerminal(operation) ||
          operation.type !== OperationType.REPLACE) {
        return false;
      }
      if (operation.operationId === context?.move?.operationId) {
        return false;
      }
      const replaceSourceReplicaId =
        this.getReplaceSourceReplicaId(operation);
      const replaceTargetReplicaId =
        this.getReplaceTargetReplicaId(operation);
      return replicaId === replaceSourceReplicaId ||
        replicaId === replaceTargetReplicaId;
    });
    if (!conflictingOperation) {
      return;
    }

    throw this.createConflictingOperationInFlightError(
      context?.normalizedMoveType,
      replicaId,
      conflictingOperation,
    );
  }

  /**
   * Serialize create admission through one add-like or remove-like budget lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  async runConcurrentCreateBudgetGate(
    normalizedMoveType,
    budgetContext = {},
    executionFactory,
  ) {
    const scope = this.resolveConcurrentCreateBudgetScope(
      normalizedMoveType,
      budgetContext,
    );
    return this.operationWorkflowRunExclusive(
      this.getCreateBudgetSingleFlightKey(scope),
      async () => {
        await this.ensureConcurrentOperationBudgetAllowed(
          normalizedMoveType,
          budgetContext,
        );
        return executionFactory();
      },
    );
  }

  /**
   * Keep emergency priority recovery admission off the ordinary create-budget
   * single-flight lane so unrelated add scheduling cannot head-of-line block
   * the control-plane partitions that publish and execute recovery itself.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @return {string}
   * @private
   */
  resolveConcurrentCreateBudgetScope(
    normalizedMoveType,
    budgetContext = {},
  ) {
    if (normalizedMoveType === OperationType.REMOVE) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE;
    }
    if (!this.shouldUsePriorityConcurrentAddLane(
      normalizedMoveType,
      budgetContext,
    )) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.ADD;
    }
    const priorityRecoveryAdmissionPlan =
      this.getPriorityRecoveryAdmissionPlan();
    if (priorityRecoveryAdmissionPlan.usesEmergencyPriorityOverflow(
      budgetContext?.partitionId,
    ) === true) {
      return CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD;
    }
    return CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD;
  }

  /**
   * Critical system partitions must not be starved behind the empty-cache
   * observation backoff. The backoff guards cache freshness, but it should
   * not suppress control-plane recovery operations that already run through
   * the strict critical-partition create lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldBypassConcurrentBudgetEmptyBackoff(
    normalizedMoveType,
    options = {},
  ) {
    if (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE &&
        normalizedMoveType !== OperationType.REMOVE) {
      return false;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    return this.isCriticalSystemPartition(partitionId);
  }

  /**
   * Priority control-plane partitions must re-check authoritative in-flight
   * counts when cache-sourced budget admission is saturated.
   * Cache lag is expected during recovery and must not strand spread progress.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldPreferAuthoritativeConcurrentBudgetCheck(
    normalizedMoveType,
    options = {},
  ) {
    if (options.preferAuthoritativeCount === true) {
      return true;
    }
    if (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE &&
        normalizedMoveType !== OperationType.REMOVE) {
      return false;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    return this.isPriorityControlPlanePartition(partitionId);
  }

  /**
   * Priority control-plane spread must not stall behind unrelated add/replace
   * workflows. Keep priority add/replace operations on a dedicated count lane
   * while preserving the configured maxConcurrentAdds bound.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldUsePriorityConcurrentAddLane(
    normalizedMoveType,
    options = {},
  ) {
    if (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE) {
      return false;
    }
    const partitionId = String(options.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    return this.isPriorityControlPlanePartition(partitionId);
  }

  /**
   * Critical transport/system-table partitions own publication and
   * replica-operation convergence for the rest of the control plane. During
   * active priority recovery they must retain one extra add-like slot so
   * ordinary priority system tables cannot consume the whole priority lane.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    return isCriticalTransportControlPlanePartitionTable({
      partitionId,
    });
  }

  /**
   * Resolve the latest cluster publication row when available.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    const publicationService =
      this.controlPlaneReadinessService?.membershipPublicationService;
    let publicationRow = null;
    if (publicationService &&
        typeof publicationService.getLatestClusterPublicationSync ===
          'function') {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (publicationService &&
        typeof publicationService.getLatestPublicationRowSync === 'function') {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }
    return publicationRow && typeof publicationRow === 'object' ?
      publicationRow :
      null;
  }

  /**
   * Priority recovery remains active while the latest membership publication
   * summary still reports unsatisfied spread. A short stale grace window keeps
   * recovery admission active when publication summary reads are transiently
   * unavailable under load.
   * @return {boolean}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    return resolveTrackedPriorityRecoveryAdmissionPlan({
      tracker: this.priorityRecoveryAdmissionTracker,
      publicationRow: this.getLatestMembershipPublicationRow(),
      nowMs: this.nowFn(),
      staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
      maxConcurrentAdds: this.config.maxConcurrentAdds,
      isPriorityPartition: (partitionId) =>
        this.isPriorityControlPlanePartition(partitionId),
      isEmergencyPriorityPartition: (partitionId) =>
        this.isEmergencyPriorityControlPlanePartition(partitionId),
    });
  }

  isGlobalPriorityControlPlaneRecoveryActive() {
    return this.getPriorityRecoveryAdmissionPlan().recoveryActive === true;
  }

  /**
   * Return true when emergency transport partitions are currently part of the
   * unresolved priority spread set. This keeps the emergency reservation
   * narrow: ordinary priority tables should not be hard-blocked at limit 1
   * when only ordinary priority partitions remain unresolved.
   *
   * Uses the same stale-grace semantics as global recovery activation so
   * transient summary read gaps do not flap reservation behavior.
   *
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlaneRecoveryActive() {
    return this.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive ===
      true;
  }

  /**
   * Keep one shared add slot free for priority recovery while publication
   * spread remains unsatisfied.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getReservedPriorityRecoveryAddSlots(options = {}) {
    return this.getPriorityRecoveryAdmissionPlan()
      .getReservedNonPrioritySlots(options.partitionId, 'add');
  }

  /**
   * Resolve the effective add budget for non-priority scheduling after
   * reserving capacity for priority recovery.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getConcurrentAddBudgetLimit(options = {}) {
    return Math.max(
      NUM.ZERO,
      this.config.maxConcurrentAdds -
        this.getReservedPriorityRecoveryAddSlots(options),
    );
  }

  /**
   * Resolve the effective priority-lane add budget.
   * During active recovery, emergency transport partitions may use one extra
   * slot above the ordinary priority limit, while ordinary priority tables
   * preserve that slot instead of consuming it first.
   *
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getPriorityConcurrentAddBudgetLimit(options = {}) {
    return this.getPriorityRecoveryAdmissionPlan()
      .getPriorityAddBudgetLimit(options.partitionId);
  }

  /**
   * Enforce configured maxConcurrentAdds/maxConcurrentRemoves before persisting
   * a newly scheduled operation.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {Promise<void>}
   * @private
   */
  async ensureConcurrentOperationBudgetAllowed(normalizedMoveType, options = {}) {
    const bypassEmptyQueryDelay = this.shouldBypassConcurrentBudgetEmptyBackoff(
      normalizedMoveType,
      options,
    );
    const preferAuthoritativeCount =
      this.shouldPreferAuthoritativeConcurrentBudgetCheck(
        normalizedMoveType,
        options,
      );
    if (normalizedMoveType === OperationType.ADD ||
        normalizedMoveType === OperationType.REPLACE) {
      const usePriorityConcurrentAddLane =
        this.shouldUsePriorityConcurrentAddLane(
          normalizedMoveType,
          options,
        );
      const concurrentAddLimit = usePriorityConcurrentAddLane ?
        this.getPriorityConcurrentAddBudgetLimit(options) :
        this.getConcurrentAddBudgetLimit(options);
      const canStart = usePriorityConcurrentAddLane ?
        await this.canStartPriorityAddOperation({
          bypassEmptyQueryDelay,
          preferAuthoritativeCount,
          partitionId: options.partitionId,
        }) :
        await this.canStartAddOperation({
          bypassEmptyQueryDelay,
          preferAuthoritativeCount,
          partitionId: options.partitionId,
        });
      if (canStart) {
        return;
      }
      throw this.createConcurrentOperationBudgetError(
        normalizedMoveType,
        concurrentAddLimit,
      );
    }

    if (normalizedMoveType === OperationType.REMOVE) {
      const canStart = await this.canStartRemoveOperation({
        bypassEmptyQueryDelay,
        preferAuthoritativeCount,
      });
      if (canStart) {
        return;
      }
      throw this.createConcurrentOperationBudgetError(
        normalizedMoveType,
        this.config.maxConcurrentRemoves,
      );
    }
  }

  /**
   * Build a typed concurrent-budget error for rebalancer callers.
   * @param {string|null} normalizedMoveType
   * @param {number} limit
   * @return {Error}
   * @private
   */
  createConcurrentOperationBudgetError(normalizedMoveType, limit, options = {}) {
    const error = new Error(
      options.message ||
      (
        `Concurrent ${String(normalizedMoveType || 'operation').toLowerCase()} ` +
        `budget exceeded at limit ${limit}`
      ),
    );
    error.rebalanceSkipReason = REBALANCER_SKIP_REASON.BUDGET_EXCEEDED;
    error.operationType = normalizedMoveType || null;
    error.limit = limit;
    if (options.conflictingOperationId) {
      error.conflictingOperationId = options.conflictingOperationId;
    }
    return error;
  }

  /**
   * Build a typed conflict error for overlapping operation lifecycles.
   * @param {string|null} normalizedMoveType
   * @param {string} replicaId
   * @param {Object} conflictingOperation
   * @return {Error}
   * @private
   */
  createConflictingOperationInFlightError(
    normalizedMoveType,
    replicaId,
    conflictingOperation,
  ) {
    const operationTypeText =
      String(normalizedMoveType || 'operation').toLowerCase();
    const error = new Error(
      `${REBALANCE_COORDINATOR_ERROR_MSG.CONFLICTING_OPERATION_IN_FLIGHT} ` +
      `${replicaId}: ${operationTypeText} conflicts with ` +
      `${String(conflictingOperation?.type || 'unknown')} ` +
      `${String(conflictingOperation?.operationId || 'unknown')}`,
    );
    error.rebalanceSkipReason =
      REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT;
    error.operationType = normalizedMoveType || null;
    error.replicaId = replicaId;
    error.conflictingOperationId =
      conflictingOperation?.operationId || null;
    return error;
  }

  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureProvisioningAdmissionAllowed(context) {
    return this.provisioningAdmissionPolicy
      .ensureProvisioningAdmissionAllowed(context);
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>} Normalized evaluation output.
   * @private
   */
  async evaluateProvisioningAdmission(context) {
    return this.provisioningAdmissionPolicy
      .evaluateProvisioningAdmission(context);
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  estimateProvisioningAdmissionBytes(entityType) {
    return this.provisioningAdmissionPolicy
      .estimateProvisioningAdmissionBytes(entityType);
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing moves.
   * @param {string} moveType
   * @return {void}
   * @private
   */
  assertProvisioningAdmissionDependencies(moveType) {
    return this.provisioningAdmissionPolicy
      .assertProvisioningAdmissionDependencies(moveType);
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createProvisioningAdmissionError(move, admissionResult) {
    return this.provisioningAdmissionPolicy
      .createProvisioningAdmissionError(move, admissionResult);
  }

  /**
   * Persist a new operation via SQL engine.
   *
   * OWNERSHIP BOUNDARY: RebalanceCoordinator is the sole writer for
   * steady-state replica_operations rows (ADD/REMOVE/REPLACE).
   * BootstrapAPI owns a separate domain for MOVE_REPLICA handoff
   * and MOVE_ASSIGNMENT reservation rows created during node join.
   * The two domains are distinguished by operation type and creation
   * context. See BootstrapAPI.insertMoveReplicaHandoffOperation for
   * the bootstrap-side boundary contract.
   *
   * @readModel COORDINATOR_OPERATION_PERSIST —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} operation - Operation to persist.
   * @return {Promise<boolean>} True when row inserted, false when ignored.
   * @private
   */
  async persistNewOperation(operation) {
    return this.repository.persistNewOperation(operation);
  }

  /**
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation, options = {}) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.repository.persistOperationUpdate(
        operation, options,
      ),
      {operation},
    );
  }

  /**
   * Wait for replica_operations cache visibility after SQL persistence.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    return this.repository
      .waitForReplicaOperationCacheVisibility(operation);
  }

  /**
   * Execute operation mutation SQL with retry for transient leader gaps.
   * @param {string} sql - SQL statement.
   * @param {Array<*>} params - Statement parameters.
   * @return {Promise<Object>} SQL query result.
   * @private
   */
  async executeOperationMutationWithRetry(
    sql, params, options = {},
  ) {
    return this.repository
      .executeOperationMutationWithRetry(
        sql, params, options,
      );
  }

  /**
   * Check whether operation persist error is transient and retryable.
   * @param {string} errorMessage - SQL error message.
   * @return {boolean} True when retry should be attempted.
   * @private
   */
  isRetryableOperationPersistError(errorMessage) {
    return this.repository
      .isRetryableOperationPersistError(errorMessage);
  }

  /**
   * Delay helper for operation mutation retry loop.
   * @param {number} delayMs - Delay duration in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async waitForOperationPersistRetry(delayMs) {
    return this.repository
      .waitForOperationPersistRetry(delayMs);
  }

  /**
   * Build query options for one owner-managed mutation.
   * Coordinator writes must not inherit the default SQL session.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {Object}
   * @private
   */
  buildOperationMutationQueryOptions(options = {}) {
    return this.repository
      .buildOperationMutationQueryOptions(options);
  }

  /**
   * Resolve the SQL session for one owner-managed mutation.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {string}
   * @private
   */
  resolveOperationMutationSessionId(options = {}) {
    return this.repository
      .resolveOperationMutationSessionId(options);
  }

  // --- Reservation lifecycle (Req 4.1, 4.2, 4.3, 4.4, 4.5) ---

  /**
   * Check whether an operation type increases storage on the target node.
   * Only ADD and REPLACE operations require reservations.
   * @param {string} operationType - Operation type.
   * @return {boolean}
   * @private
   */
  isStorageIncreasingOperation(operationType) {
    return operationType === OperationType.ADD ||
      operationType === OperationType.REPLACE;
  }

  /**
   * Map operation type to reservation reason code.
   * @param {string} operationType - Operation type.
   * @return {string} Reservation reason code.
   * @private
   */
  getReservationReasonCode(operationType) {
    if (operationType === OperationType.REPLACE) {
      return RESERVATION_REASON.REPLACE_REPLICA;
    }
    return RESERVATION_REASON.ADD_REPLICA;
  }

  /**
   * Resolve mutation change counts from SQL-engine responses.
   * @param {Object} result - SQL query result.
   * @return {number|null} Number of changed rows, or null when unavailable.
   * @private
   */
  extractMutationChangeCount(result) {
    return this.repository
      .extractMutationChangeCount(result);
  }

  /**
   * Transition one active reservation row by its canonical primary key.
   * @param {string} reservationId - Reservation primary key.
   * @param {string} nextStatus - Target reservation status.
   * @param {number} now - Transition timestamp.
   * @return {Promise<Object>} Transition result.
   * @private
   */
  async transitionActiveReservationById(
    reservationId,
    nextStatus,
    now,
    options = {},
  ) {
    const result = await this.executeOperationMutationWithRetry(
      SQL.UPDATE_RESERVATION_STATUS_BY_ID,
      [
        nextStatus,
        now,
        now,
        reservationId,
        RESERVATION_STATUS.ACTIVE,
      ],
      {
        ownerId: options.ownerId || reservationId,
        sessionId: options.sessionId,
      },
    );
    if (!result.success) {
      return {
        success: false,
        changed: false,
        error: result.error || null,
      };
    }

    const changeCount = this.extractMutationChangeCount(result);
    return {
      success: true,
      changed: changeCount === null || changeCount > NUM.ZERO,
      changeCount,
    };
  }

  /**
   * Create a storage reservation atomically with operation creation.
   * Delegates size estimation to the accounting service.
   * Requirements: 4.1
   *
   * @param {Object} operation - The persisted operation record.
   * @return {Promise<void>}
   * @private
   */
  async createReservationForOperation(operation, options = {}) {
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }
    assertCritical(
      this.storageAccountingService &&
        typeof this.storageAccountingService.estimateReplicaBytes ===
          'function',
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED,
    );

    const estimatedBytes = this.storageAccountingService
      .estimateReplicaBytes({
        entityType: operation.entityType || SERVICE_TYPE.PARTITION,
        sizeBytes: NUM.ZERO,
      });

    const now = Date.now();
    const reservationId = `res-${operation.operationId}`;
    const expiresAt = now + this.config.reservationTtlMs;

    const result = await this.executeOperationMutationWithRetry(
      SQL.INSERT_RESERVATION,
      [
        reservationId,
        operation.operationId,
        operation.entityType || SERVICE_TYPE.PARTITION,
        operation.entityId || operation.partitionId,
        operation.partitionId,
        operation.targetNodeId,
        estimatedBytes,
        DEFAULT_AMPLIFICATION_FACTOR,
        RESERVATION_STATUS.ACTIVE,
        this.getReservationReasonCode(operation.type),
        now,
        now,
        expiresAt,
      ],
      {
        ownerId: operation.operationId,
        sessionId: options.sessionId,
      },
    );

    if (!result.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATE_FAILED, {
          operationId: operation.operationId,
          reservationId,
          error: result.error,
        });
      return;
    }

    this.stats.reservationsCreated++;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATED, {
        reservationId,
        operationId: operation.operationId,
        targetNodeId: operation.targetNodeId,
        estimatedBytes,
        expiresAt,
      });

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, {
      reservationId,
      operationId: operation.operationId,
      targetNodeId: operation.targetNodeId,
      estimatedBytes,
    });
  }

  /**
   * Release the storage reservation tied to an operation.
   * Called on terminal outcomes (completed, failed, cancelled).
   * Requirements: 4.3
   *
   * @param {Object} operation - The terminal operation record.
   * @return {Promise<void>}
   * @private
   */
  async releaseReservationForOperation(operation) {
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }

    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION,
      [operation.operationId, RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    if (!activeResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, {
          operationId: operation.operationId,
          error: activeResult.error,
        });
      return;
    }

    const now = Date.now();
    let releasedCount = NUM.ZERO;
    const rows = Array.isArray(activeResult.rows) ? activeResult.rows : [];
    for (const row of rows) {
      const transition = await this.transitionActiveReservationById(
        row.reservation_id,
        RESERVATION_STATUS.RELEASED,
        now,
      );
      if (!transition.success) {
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
          {
            operationId: operation.operationId,
            reservationId: row.reservation_id,
            error: transition.error,
          },
        );
        continue;
      }
      if (transition.changed) {
        releasedCount++;
      }
    }
    if (releasedCount <= NUM.ZERO) {
      return;
    }

    this.stats.reservationsReleased += releasedCount;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASED, {
        operationId: operation.operationId,
        releasedCount,
      });

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RELEASED, {
      operationId: operation.operationId,
    });
  }

  /**
   * Reconcile stale and orphan reservations.
   * - Expire active reservations past their TTL.
   * - Release active reservations whose operations are terminal.
   * Called during startup recovery and periodically.
   * Requirements: 4.4, 12.3
   *
   * @return {Promise<Object>} Reconciliation result counts.
   */
  async reconcileReservations() {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START,
    );

    const now = Date.now();
    let expired = NUM.ZERO;
    let orphansReleased = NUM.ZERO;

    // 1. Expire reservations past TTL, keyed by reservation_id.
    const staleResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_EXPIRED_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE, now],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );
    if (staleResult.success && Array.isArray(staleResult.rows)) {
      for (const row of staleResult.rows) {
        const transition = await this.transitionActiveReservationById(
          row.reservation_id,
          RESERVATION_STATUS.EXPIRED,
          now,
        );
        if (!transition.success) {
          this.logger.warn(
            REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
            {
              operationId: row.operation_id,
              reservationId: row.reservation_id,
              error: transition.error,
            },
          );
          continue;
        }
        if (transition.changed) {
          expired++;
        }
      }
    } else if (!staleResult.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
        {
          operationId: null,
          reservationId: null,
          error: staleResult.error,
        },
      );
    }

    if (expired > NUM.ZERO) {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_EXPIRED,
        {count: expired},
      );
    }

    // 2. Release orphan reservations (operation is terminal)
    const activeResult = await readAuthoritativeControlPlaneRows(
      this.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS,
      SQL.SELECT_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE],
      STORAGE_RESERVATION_READ_QUERY_OPTIONS,
    );

    if (activeResult.success && activeResult.rows) {
      for (const row of activeResult.rows) {
        const op = await this.queryOperationById(row.operation_id);
        const isTerminal = !op || this.isOperationTerminal(op);
        if (isTerminal) {
          const transition = await this.transitionActiveReservationById(
            row.reservation_id,
            RESERVATION_STATUS.RELEASED,
            now,
          );
          if (!transition.success) {
            this.logger.warn(
              REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
              {
                operationId: row.operation_id,
                reservationId: row.reservation_id,
                error: transition.error,
              },
            );
            continue;
          }
          if (transition.changed) {
            orphansReleased++;
            this.logger.info(
              REBALANCE_COORDINATOR_LOG_MSG
                .RESERVATION_RECONCILE_ORPHAN,
              {
                reservationId: row.reservation_id,
                operationId: row.operation_id,
              },
            );
          }
        }
      }
    }

    this.stats.reservationsReconciled += expired + orphansReleased;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_COMPLETED,
      {expired, orphansReleased},
    );

    this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RECONCILED, {
      expired,
      orphansReleased,
    });

    return {expired, orphansReleased};
  }

  /**
   * Execute an operation (ADD or REMOVE).
   * Uses MessageRouter delivery to the target node.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    return this.workflowOwner
      .executeOperation(operation);
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {string|null}
   * @private
   */
  getOperationIdFromInput(operationInput) {
    return this.workflowOwner
      .getOperationIdFromInput(operationInput);
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveDispatchOperation(operationInput) {
    return this.workflowOwner
      .resolveDispatchOperation(operationInput);
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * Delegates to workflow owner (D7.1).
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  async dispatchOperationInternal(operationInput) {
    return this.workflowOwner
      .dispatchOperationInternal(operationInput);
  }

  /**
   * Execute operation body once per operation ID.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async executeOperationInternal(operation) {
    return this.workflowOwner
      .executeOperationInternal(operation);
  }

  /**
   * Execute a step transition atomically.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @return {Promise<void>}
   * @private
   */
  async executeAtomicTransition(
    operation, step, reason, persistFn,
  ) {
    return this.workflowOwner
      .executeAtomicTransition(
        operation, step, reason, persistFn,
      );
  }

  /**
   * Serialize replica_operations step transitions.
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
    return this.repository
      .runReplicaOperationTransitionExclusive(
        executionFactory,
        options,
      );
  }

  /**
   * Update operation workflow step.
   * Requirements: 4.3
   *
   * @param {Object} operation - Operation to update.
   * @param {string} step - New workflow step.
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    return this.workflowOwner
      .updateStep(operation, step, reason);
  }

  /**
   * Complete an operation successfully.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    return this.workflowOwner
      .completeOperation(operation);
  }

  /**
   * Get safety validation error for REMOVE operations, if any.
   * Critical system partition removes are blocked until a replacement
   * replica is voter-ready and routable.
   * @readModel COORDINATOR_SAFETY_CHECK —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} operation - Operation to validate.
   * @return {Promise<string|null>} Error message or null when safe.
   * @private
   */
  async getRemoveSafetyError(operation) {
    return this.workflowOwner
      .getRemoveSafetyError(operation);
  }

  /**
   * Evaluate safety error for a move intent.
   * Delegates to workflow owner (D7.1).
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    return this.workflowOwner.getMoveSafetyError(move);
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    return this.workflowOwner
      .isCriticalSystemPartition(partitionId);
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isPriorityControlPlanePartition(partitionId) {
    return isPriorityControlPlanePartitionTable({
      partitionId,
    });
  }

  /**
   * Resolve the readiness dimension used for operation-scoped snapshots.
   * Critical system partition recovery paths must remain routable while
   * publication is converging; ordinary entities keep strict repair gating.
   *
   * @param {string|null} partitionId
   * @return {string}
   * @private
   */
  resolveOperationReadinessDecisionDimension(partitionId = null) {
    if (this.isCriticalSystemPartition(partitionId)) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   * @private
   */
  isVoterReadyRoutableReplica(replicaRow) {
    return this.workflowOwner
      .isVoterReadyRoutableReplica(replicaRow);
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationReplicaRow(replicaRow, operation) {
    return this.workflowOwner
      .isOperationReplicaRow(replicaRow, operation);
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   * @private
   */
  async getCriticalMinReplicaCount(partitionId) {
    return this.workflowOwner
      .getCriticalMinReplicaCount(partitionId);
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  isNodeReadyForRouting(nodeId) {
    return this.workflowOwner
      .isNodeReadyForRouting(nodeId);
  }

  /**
   * Fail an operation.
   * Requirements: 6.2
   *
   * @param {Object} operation - Operation to fail.
   * @param {string} errorMessage - Error message.
   * @param {Object} [options] - Failure logging options.
   * @param {string} [options.logLevel] - Log level for failure event.
   * @param {string} [options.logMessage] - Log message override.
   * @param {Object} [options.stepMetadata] - FAILED step metadata.
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    return this.workflowOwner
      .failOperation(operation, errorMessage, options);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @private
   */
  ensureOperationWorkflow(operation) {
    return this.workflowOwner
      .ensureOperationWorkflow(operation);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   * @private
   */
  resolveTransitionReason(previousStep, nextStep) {
    return this.workflowOwner
      .resolveTransitionReason(previousStep, nextStep);
  }

  /**
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  isSafetyPolicyFailure(errorMessage) {
    return this.workflowOwner
      .isSafetyPolicyFailure(errorMessage);
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   * @private
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    return this.workflowOwner
      .normalizeErrorMessage(errorLike, fallbackMessage);
  }


  /**
   * Check for timed out operations.
   * Queries operations via SQL engine (no in-memory cache).
   * Requirements: 6.2
   * @private
   */
  async checkTimeouts() {
    if (!this.workflowOwner) {
      return;
    }
    return this.workflowOwner.checkTimeouts();
  }

  /**
   * @param {string} step
   * @return {number}
   * @private
   */
  getTimeoutForStep(step, operation = null) {
    return this.workflowOwner.getTimeoutForStep(
      step,
      operation,
    );
  }

  /**
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    return this.workflowOwner.reconcileTimeoutOperation(
      operation,
      now,
    );
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationProgress(operation) {
    return this.workflowOwner
      .reconcileOperationProgress(operation);
  }

  /**
   * Handle an executor outcome event by routing it through the
   * owner-key reconcile queue. This is the only entry point for
   * executor outcomes into the coordinator — no direct mutation.
   *
   * The outcome is enqueued via `runExclusive` keyed by operationId
   * so that at most one reconcile runs per operation at a time.
   *
   * @param {Object} outcome - Frozen executor outcome payload.
   */
  handleExecutorOutcome(outcome) {
    return this.workflowOwner
      .handleExecutorOutcome(outcome);
  }

  /**
   * Reconcile a single executor outcome.
   * Delegates to workflow owner (D7.1).
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    return this.workflowOwner
      .reconcileExecutorOutcome(outcome);
  }

  /**
   * Handle node recovery - process incomplete operations.
   * Requirements: 7.1, 7.2, 7.3
   * @readModel COORDINATOR_RECOVERY_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * This method is called when a node restarts to handle operations that
   * were in progress when the node went down.
   *
   * @return {Promise<Object>} Recovery result with counts.
   */
  async handleRecovery() {
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START,
      {nodeId: this.nodeId},
    );

    const result = {
      totalIncomplete: NUM.ZERO,
      markedFailed: NUM.ZERO,
      reconciled: NUM.ZERO,
      errors: [],
    };

    const incompleteOps =
      await this.queryIncompleteOperations({
        preferAuthoritativeRead: true,
      });
    result.totalIncomplete = incompleteOps.length;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND,
      {count: incompleteOps.length, nodeId: this.nodeId},
    );

    for (const op of incompleteOps) {
      if (!this.isOperationLocallyOwned(op)) {
        continue;
      }

      const originalStep = op.workflowStep;
      const singleFlightKey =
        this.getOperationOwnerSingleFlightKey(
          op.operationId,
        );

      try {
        await this.operationWorkflowRunExclusive(
          singleFlightKey,
          () => this.reconcileRecoveryOperation(op),
        );
      } catch (error) {
        result.errors.push({
          operationId: op.operationId,
          error: error.message,
        });
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .RECOVERY_MARK_FAILED,
          {
            operationId: op.operationId,
            workflowStep: originalStep,
            partitionId: op.partitionId,
            error: error.message,
          },
        );
        continue;
      }

      if (this.isPreSyncStep(originalStep) ||
          originalStep === WORKFLOW_STEP.STOPPING) {
        result.markedFailed++;
      } else if (
        originalStep === WORKFLOW_STEP.SYNCING
      ) {
        result.reconciled++;
      }
    }

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED,
      {nodeId: this.nodeId, ...result},
    );

    const reservationResult =
      await this.reconcileReservations();
    result.reservationsExpired = reservationResult.expired;
    result.reservationsOrphansReleased =
      reservationResult.orphansReleased;

    this.emit(
      REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
      result,
    );

    return result;
  }

  /**
   * @param {string} step
   * @return {boolean}
   * @private
   */
  isPreSyncStep(step) {
    return this.workflowOwner.isPreSyncStep(step);
  }

  /**
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    return this.workflowOwner
      .reconcileRecoveryOperation(op);
  }

  /**
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileSyncingOperation(operation) {
    return this.workflowOwner
      .reconcileSyncingOperation(operation);
  }

  /**
   * Resolve observed replica status from the local services cache boundary.
   * This is only used after authoritative service reads miss, so owner-path
   * progression can converge on exact observed target rows instead of timing
   * out behind stale visibility.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  getObservedReplicaStatusFromCache(
    replicaId, partitionId, targetNodeId,
  ) {
    return this.repository
      .getObservedReplicaStatusFromCache(
        replicaId, partitionId, targetNodeId,
      );
  }

  /**
   * Get actual replica status via SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * Requirements: 7.3
   * @readModel COORDINATOR_REPLICA_STATUS_RECONCILE —
   *   READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<string|null>} Replica status or null if not found.
   * @private
   */
  async getActualReplicaStatus(
    replicaId, partitionId, targetNodeId,
  ) {
    return this.repository.getActualReplicaStatus(
      replicaId, partitionId, targetNodeId,
    );
  }

  /**
   * Emit a typed divergence event when cache and authoritative replica
   * status differ during recovery reconciliation.
   * @param {string} replicaId - Replica service ID.
   * @param {string|null} authoritativeStatus - Status from SQL.
   * @param {string} reason - SQL_RECONCILIATION_REASON value.
   * @private
   */
  emitReplicaStatusDivergence(
    replicaId, authoritativeStatus, reason,
  ) {
    return this.repository.emitReplicaStatusDivergence(
      replicaId, authoritativeStatus, reason,
    );
  }

  /**
   * Get an operation by ID via SQL engine.
   *
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   */
  async getOperation(operationId) {
    return this.queryOperationById(operationId);
  }

  /**
   * Get all operations via SQL engine.
   * Note: This queries the database, not an in-memory cache.
   *
   * @return {Promise<Array<Object>>} Array of all operations.
   */
  async getAllOperations() {
    return this.repository.getAllOperations();
  }

  /**
   * Get operations by partition ID via SQL engine.
   *
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Array<Object>>} Array of operations for the partition.
   */
  async getOperationsByPartition(partitionId) {
    return this.getOperationsByEntity(SERVICE_TYPE.PARTITION, partitionId);
  }

  /**
   * Get operations by canonical entity identity via SQL engine.
   *
   * @param {string} entityType - Entity type.
   * @param {string} entityId - Entity ID.
   * @return {Promise<Array<Object>>} Array of operations for the entity.
   */
  async getOperationsByEntity(entityType, entityId) {
    return this.repository.getOperationsByEntity(
      entityType, entityId,
    );
  }

  /**
   * Get in-flight operations (not completed or failed) via SQL engine.
   *
   * @return {Promise<Array<Object>>} Array of in-flight operations.
   */
  async getInFlightOperations() {
    return this.queryIncompleteOperations();
  }

  /**
   * Get count of concurrent ADD operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent ADD operations.
   */
  async getConcurrentAddCount(options = {}) {
    const inFlight = await this.queryIncompleteOperations(options);
    return inFlight.filter((operation) =>
      this.isConcurrentAddBudgetOperation(operation),
    ).length;
  }

  /**
   * Build add/replace in-flight counts for ordinary-priority,
   * emergency-priority, and non-priority lanes.
   * @param {Array<Object>} operations
   * @return {{
   *   priorityCount:number,
   *   ordinaryPriorityCount:number,
   *   emergencyPriorityCount:number,
   *   nonPriorityCount:number,
   * }}
   * @private
   */
  buildConcurrentAddCountByPriorityClass(operations = []) {
    let ordinaryPriorityCount = NUM.ZERO;
    let emergencyPriorityCount = NUM.ZERO;
    let nonPriorityCount = NUM.ZERO;
    for (const operation of operations) {
      if (!this.isConcurrentAddBudgetOperation(operation)) {
        continue;
      }
      const partitionId = String(
        operation.partitionId ||
        operation.entityId ||
        '',
      ).trim();
      if (partitionId.length > NUM.ZERO &&
          this.isPriorityControlPlanePartition(partitionId)) {
        if (this.isEmergencyPriorityControlPlanePartition(partitionId)) {
          emergencyPriorityCount += NUM.ONE;
        } else {
          ordinaryPriorityCount += NUM.ONE;
        }
        continue;
      }
      nonPriorityCount += NUM.ONE;
    }
    return {
      priorityCount:
        ordinaryPriorityCount + emergencyPriorityCount,
      ordinaryPriorityCount,
      emergencyPriorityCount,
      nonPriorityCount,
    };
  }

  /**
   * Resolve add/replace in-flight counts grouped by priority lane.
   * @param {Object} [options={}]
   * @return {Promise<{priorityCount:number, nonPriorityCount:number}>}
   * @private
   */
  async getConcurrentAddCountByPriorityClass(options = {}) {
    const inFlight = await this.queryIncompleteOperations(options);
    return this.buildConcurrentAddCountByPriorityClass(inFlight);
  }

  /**
   * Return true when one operation still consumes add-budget capacity.
   * REPLACE operations in source-removal dispatch (ACTIVE/STOPPING) are
   * remove-phase work and must not block new add/replace scheduling.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isConcurrentAddBudgetOperation(operation) {
    if (!operation || typeof operation !== 'object') {
      return false;
    }
    const type = String(operation.type || '').toUpperCase();
    if (type === OperationType.ADD) {
      return true;
    }
    if (type !== OperationType.REPLACE) {
      return false;
    }
    return !this.isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * Get count of concurrent REMOVE operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent REMOVE operations.
   */
  async getConcurrentRemoveCount(options = {}) {
    return this.repository.getConcurrentRemoveCount(options);
  }

  /**
   * Execute a replica_operations read with a local authoritative fast-path
   * when this node hosts the local leader replica for that system partition.
   * Falls back to the routed SQL engine otherwise.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeReplicaOperationsRead(sql, params = []) {
    return this.repository
      .executeReplicaOperationsRead(sql, params);
  }

  /**
   * Check if we can start a new ADD operation.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>} True if we can start a new ADD operation.
   */
  async canStartAddOperation(options = {}) {
    if (this.isLocalRouterBackpressured(options)) {
      return false;
    }
    const concurrentAddLimit = this.getConcurrentAddBudgetLimit(options);
    if (concurrentAddLimit <= NUM.ZERO) {
      return false;
    }
    const cachedCount =
      (await this.queryCachedIncompleteOperations()).filter((operation) =>
        this.isConcurrentAddBudgetOperation(operation),
      ).length;
    if (cachedCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
      if (cachedCount < concurrentAddLimit) {
        return true;
      }
      if (options?.preferAuthoritativeCount !== true) {
        return false;
      }
      const authoritativeCount = await this.getConcurrentAddCount({
        partitionId: options.partitionId,
        preferAuthoritativeRead: true,
      });
      if (authoritativeCount === NUM.ZERO) {
        this.markEmptyIncompleteOperationQueryAt();
      } else {
        this.clearEmptyIncompleteOperationQueryDelay();
      }
      return authoritativeCount < concurrentAddLimit;
    }
    const bypassEmptyQueryDelay = options?.bypassEmptyQueryDelay === true;
    if (!bypassEmptyQueryDelay &&
        this.shouldDelayEmptyIncompleteOperationQuery()) {
      return false;
    }
    const count = await this.getConcurrentAddCount({
      partitionId: options.partitionId,
    });
    if (count === NUM.ZERO) {
      this.markEmptyIncompleteOperationQueryAt();
    } else {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    return count < concurrentAddLimit;
  }

  /**
   * Check whether one priority add/replace can start.
   * Priority partitions use a dedicated count lane so unrelated non-priority
   * workflows cannot exhaust the spread-recovery scheduling budget.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>}
   */
  async canStartPriorityAddOperation(options = {}) {
    if (this.isLocalRouterBackpressured(options)) {
      return false;
    }
    const priorityRecoveryAdmissionPlan =
      this.getPriorityRecoveryAdmissionPlan();
    const maximumPriorityConcurrentAddLimit =
      priorityRecoveryAdmissionPlan.emergencyPriorityAddBudgetLimit;
    if (maximumPriorityConcurrentAddLimit <= NUM.ZERO) {
      return false;
    }
    const isPriorityCountsAdmitted = (counts = {}) => {
      return priorityRecoveryAdmissionPlan
        .evaluatePriorityAddAdmission(
          options.partitionId,
          counts,
        )
        .allowed === true;
    };
    const cachedCounts = this.buildConcurrentAddCountByPriorityClass(
      await this.queryCachedIncompleteOperations(),
    );
    const cachedTotalCount =
      cachedCounts.priorityCount + cachedCounts.nonPriorityCount;
    if (cachedTotalCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
      if (isPriorityCountsAdmitted(cachedCounts)) {
        return true;
      }
      if (options?.preferAuthoritativeCount !== true) {
        return false;
      }
      const authoritativeCounts = await this.getConcurrentAddCountByPriorityClass({
        partitionId: options.partitionId,
        preferAuthoritativeRead: true,
      });
      const authoritativeTotalCount =
        authoritativeCounts.priorityCount + authoritativeCounts.nonPriorityCount;
      if (authoritativeTotalCount === NUM.ZERO) {
        this.markEmptyIncompleteOperationQueryAt();
      } else {
        this.clearEmptyIncompleteOperationQueryDelay();
      }
      return isPriorityCountsAdmitted(authoritativeCounts);
    }
    const bypassEmptyQueryDelay = options?.bypassEmptyQueryDelay === true;
    if (!bypassEmptyQueryDelay &&
        this.shouldDelayEmptyIncompleteOperationQuery()) {
      return false;
    }
    const counts = await this.getConcurrentAddCountByPriorityClass({
      partitionId: options.partitionId,
    });
    const totalCount = counts.priorityCount + counts.nonPriorityCount;
    if (totalCount === NUM.ZERO) {
      this.markEmptyIncompleteOperationQueryAt();
    } else {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    return isPriorityCountsAdmitted(counts);
  }

  /**
   * Check if we can start a new REMOVE operation.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>} True if we can start a new REMOVE operation.
   */
  async canStartRemoveOperation(options = {}) {
    if (this.isLocalRouterBackpressured(options)) {
      return false;
    }
    const cachedCount =
      (await this.queryCachedIncompleteOperations()).filter((operation) =>
        operation?.type === OperationType.REMOVE,
      ).length;
    if (cachedCount > NUM.ZERO) {
      this.clearEmptyIncompleteOperationQueryDelay();
      if (cachedCount < this.config.maxConcurrentRemoves) {
        return true;
      }
      if (options?.preferAuthoritativeCount !== true) {
        return false;
      }
      const authoritativeCount = await this.getConcurrentRemoveCount({
        preferAuthoritativeRead: true,
      });
      if (authoritativeCount === NUM.ZERO) {
        this.markEmptyIncompleteOperationQueryAt();
      } else {
        this.clearEmptyIncompleteOperationQueryDelay();
      }
      return authoritativeCount < this.config.maxConcurrentRemoves;
    }
    const bypassEmptyQueryDelay = options?.bypassEmptyQueryDelay === true;
    if (!bypassEmptyQueryDelay &&
        this.shouldDelayEmptyIncompleteOperationQuery()) {
      return false;
    }
    const count = await this.getConcurrentRemoveCount();
    if (count === NUM.ZERO) {
      this.markEmptyIncompleteOperationQueryAt();
    } else {
      this.clearEmptyIncompleteOperationQueryDelay();
    }
    return count < this.config.maxConcurrentRemoves;
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    const wfOwner = this.workflowOwner;
    if (!wfOwner ||
        wfOwner.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO) {
      return false;
    }
    if (wfOwner.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO) {
      wfOwner.lastEmptyIncompleteOperationQueryAtMs = now;
      return true;
    }
    if (now - wfOwner.lastEmptyIncompleteOperationQueryAtMs <
        wfOwner.incompleteOperationQueryEmptyBackoffMs) {
      return true;
    }
    wfOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    return false;
  }

  /**
   * Record one bounded empty-owner scan observation timestamp.
   * @param {number} [now=Date.now()]
   * @return {void}
   * @private
   */
  markEmptyIncompleteOperationQueryAt(now = Date.now()) {
    if (this.workflowOwner) {
      this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = now;
    }
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   * @private
   */
  clearEmptyIncompleteOperationQueryDelay() {
    if (this.workflowOwner) {
      this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    }
  }

  /**
   * Return true when the local router reports bounded outbound pressure and
   * non-critical scheduling should reuse existing observations instead of
   * issuing more routed control-plane reads.
   * @return {boolean}
   * @private
   */
  isLocalRouterBackpressured(options = {}) {
    return this.getLocalRouterPressureDecision(options).action !==
      PRESSURE_GOVERNOR_ACTION.ALLOW;
  }

  /**
   * Resolve one canonical local transport-pressure decision for coordinator
   * admission reads.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  getLocalRouterPressureDecision(options = {}) {
    const partitionId = String(options.partitionId || '').trim();
    const criticalPressureBypass =
      partitionId.length > NUM.ZERO &&
      this.isPriorityControlPlanePartition(partitionId);
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: criticalPressureBypass ?
        PRESSURE_WORK_CLASS.CRITICAL :
        PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [criticalPressureBypass ?
        'control-plane:rebalancer:operations' :
        'rebalancer:operations'],
    });
  }

  /**
   * Log one replica-operation query failure with severity aligned to whether
   * the control plane requested deferral/retry.
   * @param {Error|Object} error
   * @param {Object} [context={}]
   * @private
   */
  logQueryOperationsFailure(error, context = {}) {
    const participantFailures = Array.isArray(error?.participantFailures) ?
      error.participantFailures
        .filter((entry) => entry && typeof entry === 'object')
        .slice(NUM.ZERO, NUM.THREE) :
      [];
    const firstFailedParticipant =
      error?.firstFailedParticipant &&
      typeof error.firstFailedParticipant === 'object' ?
        error.firstFailedParticipant :
        (participantFailures.length > NUM.ZERO ? participantFailures[NUM.ZERO] : null);
    const tableName = typeof error?.tableName === 'string' &&
      error.tableName.length > NUM.ZERO ?
      error.tableName :
      (typeof firstFailedParticipant?.failedTable === 'string' ?
        firstFailedParticipant.failedTable :
        null);
    const payload = {
      ...context,
      queryDurationMs: Number.isFinite(context?.queryDurationMs) ?
        Math.max(NUM.ZERO, Math.floor(context.queryDurationMs)) :
        null,
      rowCount: Number.isFinite(context?.rowCount) ?
        Math.max(NUM.ZERO, Math.floor(context.rowCount)) :
        null,
      backpressured:
        typeof context?.backpressured === 'boolean' ?
          context.backpressured :
          (typeof this.isLocalRouterBackpressured === 'function' ?
            this.isLocalRouterBackpressured() :
            false),
      error: error?.message || error?.error || null,
      nodeId: this.nodeId,
      code: getControlPlaneErrorCode(error) || null,
      retryAfterMs: getControlPlaneRetryAfterMs(error),
      tableName,
      participantFailures,
      firstFailedParticipant,
    };
    if (isRetryableControlPlaneError(error)) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
        payload,
      );
      return;
    }
    this.logger.error(
      REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
      payload,
    );
  }

  /**
   * Get coordinator statistics.
   *
   * @return {Promise<Object>} Statistics object.
   */
  async getStats() {
    const inFlightOps = await this.getInFlightOperations();
    const allOps = await this.getAllOperations();

    return {
      ...this.stats,
      inFlightOperations: inFlightOps.length,
      totalOperations: allOps.length,
    };
  }

  /**
   * Shutdown the coordinator.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.initialized = false;
    this.stopTimeoutChecking();

    // Unsubscribe from executor outcome events.
    if (this._boundOutcomeHandler && this.executorOutcomeEmitter) {
      this.executorOutcomeEmitter.removeListener(
        OUTCOME_EVENT_NAME,
        this._boundOutcomeHandler,
      );
      this._boundOutcomeHandler = null;
    }
    if (this.cacheChangeListener &&
        typeof this.systemTableCache?.offCacheChange === 'function') {
      this.unbindSystemTableCacheListener();
      this.cacheChangeListener = null;
    }
    if (this._boundTerminalOperationIntentPruner) {
      this.unbindTerminalOperationIntentPruner();
      this._boundTerminalOperationIntentPruner = null;
    }

    let inFlightOperationCount = NUM.ZERO;
    try {
      const inFlightOps = await this.getInFlightOperations();
      inFlightOperationCount = inFlightOps.length;
    } catch (error) {
      this.logger.debug(
        'Skipping in-flight operation count during coordinator shutdown',
        {
          nodeId: this.nodeId,
          error: error.message,
        },
      );
    }

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
      inFlightOperations: inFlightOperationCount,
    });

    this.operationsInCreation.clear();
    this.recentOperationIntents.clear();
    if (typeof this.workflowOwner?.shutdown === 'function') {
      this.workflowOwner.shutdown();
    }

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}

export {RebalanceCoordinator};
