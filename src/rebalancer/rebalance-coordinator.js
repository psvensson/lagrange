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
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../control-plane/control-plane-readiness-service.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {
  WORKFLOW_STEP, NUM, ERRORS, TIME_MS, METRICS_LOG_TAG,
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
  OPERATION_METADATA_KEY,
  ReplicaStatus,
  TERMINAL_STATUSES,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  isTerminalStep,
  createOperation as createOperationRecord,
} from './replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  OPERATION_TRANSITION_REASON,
} from './rebalancer-constants.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from './storage-capacity-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from './storage-admission-constants.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  buildDivergenceEvent,
} from '../control-plane/read-model-contract.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
} from './executor-outcome-constants.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from './executor-outcome-emitter.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE source_node_id = ?
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
const OPERATION_PERSIST_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FOUR;
const OPERATION_PERSIST_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
const CDC_FALLBACK_PHASE_RECOVERY = 'recovery';
const INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS = TIME_MS.SECOND;
const INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS =
  TIME_MS.SECOND * NUM.TEN;
const INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD = 1000;
const INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS = TIME_MS.SECOND * NUM.FIVE;
const COORDINATOR_OWNER_COMPONENT = 'RebalanceCoordinator';

const OPERATION_HANDLER = Object.freeze({
  [SERVICE_TYPE.PARTITION]: 'replica-handler',
  [SERVICE_TYPE.MESSAGE_GROUP]: 'message-group-handler',
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: 'runtime-service-handler',
});

const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);

const DEFAULT_MIN_REPLICA_COUNT = NUM.THREE;
const REPLICA_ID_SEPARATOR = '-r';
const REPLICA_ID_START_INDEX = NUM.ONE;
const DEFAULT_AMPLIFICATION_FACTOR = NUM.ONE;
const FAILURE_LOG_LEVEL = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});
const OPERATION_SINGLE_FLIGHT_SCOPE = Object.freeze({
  CREATE: 'create',
  OPERATION: 'operation',
});
const OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR = ':';
const CONTROL_PLANE_QUERY_OPTIONS = buildControlPlaneQueryOptions();

/**
 * RebalanceCoordinator manages the complete rebalancing workflow.
 * Uses SQL engine for all system information access (no in-memory cache).
 */
class RebalanceCoordinator extends EventEmitter {
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
    this.recentOperationIntents = new Map();
    this.lastIncompleteOperationQueryWarningAtMs = NUM.ZERO;

    this.executorOutcomeEmitter = options.executorOutcomeEmitter ||
      new ExecutorOutcomeEmitter({logger: this.logger});
    this._boundOutcomeHandler = null;

    this.isShuttingDown = false;
    this.initialized = false;
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
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, {
            error: error.message,
            nodeId: this.nodeId,
          });
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
    const cachedRow =
      this.getReplicaOperationRowFromCache(operationId);
    if (cachedRow) {
      return this.rowToOperation(cachedRow);
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_OPERATION_BY_ID,
      [operationId],
    );

    if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {
      return null;
    }

    return this.rowToOperation(result.rows[NUM.ZERO]);
  }

  /**
   * Query incomplete operations using SQL engine.
   * @readModel COORDINATOR_TIMEOUT_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations() {
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
      if (!row || row.source_node_id !== this.nodeId) {
        return false;
      }

      return row.workflow_step === WORKFLOW_STEP.PENDING ||
        row.workflow_step === WORKFLOW_STEP.SENDING ||
        row.workflow_step === WORKFLOW_STEP.CREATING ||
        row.workflow_step === WORKFLOW_STEP.SYNCING ||
        row.workflow_step === WORKFLOW_STEP.STOPPING ||
        (row.workflow_step === WORKFLOW_STEP.ACTIVE &&
          row.type === OperationType.REPLACE);
    });
    if (cachedRows !== null) {
      return cachedRows
        .map((row) => this.rowToOperation(row))
        .filter((operation) => !this.isOperationTerminal(operation))
        .sort((left, right) => {
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

    const queryStartedAtMs = Date.now();
    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_INCOMPLETE_OPERATIONS,
      [
        this.nodeId,
        WORKFLOW_STEP.PENDING,
        WORKFLOW_STEP.SENDING,
        WORKFLOW_STEP.CREATING,
        WORKFLOW_STEP.SYNCING,
        WORKFLOW_STEP.STOPPING,
        WORKFLOW_STEP.ACTIVE,
        OperationType.REPLACE,
      ],
    );
    const queryDurationMs = Date.now() - queryStartedAtMs;
    const rowCount = Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO;

    if (!result.success || !result.rows) {
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, {
        error: result.error,
        nodeId: this.nodeId,
      });
      return [];
    }

    const shouldWarnOnQueryPressure =
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS ||
      rowCount >= INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD;
    if (shouldWarnOnQueryPressure) {
      const nowMs = Date.now();
      if (
        nowMs - this.lastIncompleteOperationQueryWarningAtMs >=
        INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS
      ) {
        this.lastIncompleteOperationQueryWarningAtMs = nowMs;
        this.logger.warn(
          'In-flight operation owner query indicates control-plane pressure',
          {
            nodeId: this.nodeId,
            queryDurationMs,
            rowCount,
          },
        );
      }
    }

    return result.rows
      .map((row) => this.rowToOperation(row))
      .filter((operation) => !this.isOperationTerminal(operation))
      .sort((left, right) => {
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
  ) {
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
      if (!row ||
          row.partition_id !== partitionId ||
          row.target_node_id !== targetNodeId) {
        return false;
      }

      return (row.entity_type === entityType &&
        row.entity_id === entityId) ||
        row.entity_type === null ||
        row.entity_type === undefined ||
        row.entity_type === '';
    });
    if (cachedRows !== null) {
      const cachedOperations =
        cachedRows.map((row) => this.rowToOperation(row));
      return cachedOperations.find((operation) => {
        return !this.isOperationTerminal(operation) &&
          this.operationMatchesMoveIntent(
            operation,
            move,
            entityType,
            entityId,
          );
      }) || null;
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE,
      [partitionId, targetNodeId, entityType, entityId],
    );

    if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {
      return null;
    }

    const operations = result.rows.map((row) => this.rowToOperation(row));
    return operations.find((operation) => {
      return !this.isOperationTerminal(operation) &&
        this.operationMatchesMoveIntent(operation, move, entityType, entityId);
    }) || null;
  }

  /**
   * Convert database row to Operation object.
   * @param {Object} row - Database row.
   * @return {Object} Operation object.
   * @private
   */
  rowToOperation(row) {
    let stepsHistory = [];
    if (row.steps_history) {
      try {
        stepsHistory = JSON.parse(row.steps_history);
      } catch (error) {
        this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR, {
          operationId: row.operation_id,
          error: error.message,
        });
        stepsHistory = [];
      }
    }

    const operation = {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
      entityType: row.entity_type || SERVICE_TYPE.PARTITION,
      entityId: row.entity_id || row.partition_id,
      replicaId: row.replica_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      status: row.status,
      workflowStep: row.workflow_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stepsHistory,
    };

    operation.sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    return operation;
  }

  /**
   * Determine whether an operation has reached its terminal workflow step.
   * Falls back to status when workflow data is incomplete.
   * @param {Object} operation - Operation row or payload.
   * @return {boolean} True when terminal.
   * @private
   */
  isOperationTerminal(operation) {
    if (!operation) {
      return false;
    }

    const operationType = operation.type || null;
    const workflowStep =
      operation.workflowStep ?? operation.workflow_step ?? null;
    if (typeof operationType === 'string' &&
        typeof workflowStep === 'string' &&
        workflowStep.length > NUM.ZERO) {
      return isTerminalStep(operationType, workflowStep);
    }

    return TERMINAL_STATUSES.includes(operation.status);
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
    const sourceNodeId = String(
      operation?.sourceNodeId || operation?.source_node_id || '',
    );
    if (sourceNodeId.length > NUM.ZERO) {
      return sourceNodeId;
    }

    const targetNodeId = String(
      operation?.targetNodeId || operation?.target_node_id || '',
    );
    if (targetNodeId.length > NUM.ZERO) {
      return targetNodeId;
    }
    return null;
  }

  /**
   * Return true when this coordinator owns operation lifecycle progression.
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationLocallyOwned(operation) {
    return this.resolveOperationOwnerNodeId(operation) === this.nodeId;
  }

  /**
   * Resolve source replica ID for REPLACE operations.
   * @param {Object} operation - Operation payload.
   * @return {string|null} Source replica ID or null.
   * @private
   */
  getReplaceSourceReplicaId(operation) {
    if (!operation || operation.type !== OperationType.REPLACE) {
      return null;
    }

    if (operation.sourceReplicaId) {
      return operation.sourceReplicaId;
    }

    if (!Array.isArray(operation.stepsHistory)) {
      return null;
    }

    for (const stepEntry of operation.stepsHistory) {
      const sourceReplicaId = stepEntry?.[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID];
      if (typeof sourceReplicaId === 'string' && sourceReplicaId.length > 0) {
        return sourceReplicaId;
      }
    }

    return null;
  }

  /**
   * Check whether a REPLACE operation is in source-removal phase.
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE should remove the source replica.
   * @private
   */
  isReplaceRemovePhase(operation) {
    return operation?.type === OperationType.REPLACE &&
      operation?.workflowStep === WORKFLOW_STEP.ACTIVE;
  }

  /**
   * Resolve target replica ID for REPLACE operations.
   * @param {Object} operation - Operation record.
   * @return {string|null} Target replacement replica ID.
   * @private
   */
  getReplaceTargetReplicaId(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return null;
    }
    const sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    if (typeof operation?.replicaId !== 'string' || operation.replicaId.length === 0) {
      return null;
    }
    if (operation.replicaId === sourceReplicaId) {
      return null;
    }
    return operation.replicaId;
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
    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== 'function') {
      return [];
    }

    return this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {
      if (!row || row.service_type !== entityType) {
        return false;
      }

      if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
        return row.group_id === entityId;
      }

      if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
        return row.service_id === entityId;
      }

      return row.partition_id === partitionId;
    }) || [];
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
    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== 'function') {
      return [];
    }

    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (row) => {
        if (!row || this.isOperationTerminal(row)) {
          return false;
        }
        const rowEntityType = row.entity_type || SERVICE_TYPE.PARTITION;
        const rowEntityId = row.entity_id || row.partition_id;
        return rowEntityType === entityType && rowEntityId === entityId;
      },
    ) || [];
  }

  /**
   * Read one replica_operations row from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {string} operationId
   * @return {Object|null}
   * @private
   */
  getReplicaOperationRowFromCache(operationId) {
    if (!this.systemTableCache || !operationId) {
      return null;
    }
    if (typeof this.systemTableCache.get === 'function') {
      return this.systemTableCache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        operationId,
      ) || null;
    }
    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      ) || [];
      return rows.find((row) => row?.operation_id === operationId) || null;
    }
    return null;
  }

  /**
   * Filter replica_operations rows from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {Function} predicate
   * @return {Object[]|null}
   * @private
   */
  filterReplicaOperationRowsFromCache(predicate) {
    if (!this.systemTableCache ||
        typeof predicate !== 'function') {
      return null;
    }

    if (typeof this.systemTableCache.filter === 'function') {
      return this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        predicate,
      ) || [];
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      ) || [];
      return rows.filter(predicate);
    }

    return null;
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
  async getEntityInFlightReplicaIds({partitionId, entityType, entityId}) {
    const replicaIds = new Set();

    const operations =
      await this.getOperationsByEntity(entityType, entityId);
    for (const operation of operations) {
      if (!operation || this.isOperationTerminal(operation)) {
        continue;
      }

      const replicaId = operation.replicaId;
      if (typeof replicaId === 'string' && replicaId.length > NUM.ZERO) {
        replicaIds.add(replicaId);
      }
    }

    return replicaIds;
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
  getRecentOperationIntent(dedupeKey) {
    const cached = this.recentOperationIntents.get(dedupeKey);
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= Date.now()) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    return cached.operation;
  }

  /**
   * Remember a recently created/reused operation intent.
   * @param {string} dedupeKey - Intent key.
   * @param {Object} operation - Operation payload.
   * @private
   */
  rememberOperationIntent(dedupeKey, operation) {
    this.recentOperationIntents.set(dedupeKey, {
      operation,
      expiresAt: Date.now() + RECENT_INTENT_TTL_MS,
    });
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
    return [
      scope,
      key,
    ].join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
  }

  /**
   * Build create-operation single-flight key.
   * @param {string} dedupeKey - Move-intent dedupe key.
   * @return {string}
   * @private
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.CREATE,
      dedupeKey,
    );
  }

  /**
   * Build execute-operation single-flight key.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getExecuteOperationSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
  }

  /**
   * Build the shared owner-key single-flight gate for one persisted operation.
   * Recovery, timeout, execution, and outcome reconciliation must all
   * serialize on this same key so one owner transition cannot overlap another.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getOperationOwnerSingleFlightKey(operationId) {
    return this.buildOperationSingleFlightKey(
      OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION,
      operationId,
    );
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
    if (this.isShuttingDown || !this.initialized) {
      return null;
    }

    const operation = await this.queryOperationById(operationId);
    if (!operation) {
      return null;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.PENDING) {
      return null;
    }

    if (!this.isOperationLocallyOwned(operation)) {
      return null;
    }

    await this.updateStep(
      operation,
      WORKFLOW_STEP.SENDING,
      OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
    );

    return operation;
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
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    if (this.isShuttingDown || !this.initialized) {
      throw new Error('RebalanceCoordinator is shutting down');
    }

    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
    const singleFlightKey =
      this.getCreateOperationSingleFlightKey(dedupeKey);
    this.pruneExpiredOperationIntents();

    const recentOperation = this.getRecentOperationIntent(dedupeKey);
    if (recentOperation) {
      return recentOperation;
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
    const moveType = this.normalizeMoveType(move?.type);
    if (moveType !== OperationType.ADD &&
        moveType !== OperationType.REPLACE) {
      return {
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        admissionResult: {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        },
      };
    }

    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const normalizedMove = {
      ...move,
      type: moveType,
    };
    const sourceNodeId = moveType === OperationType.REPLACE ?
      (move.sourceNodeId || this.nodeId) :
      this.nodeId;

    try {
      await this.ensureProvisioningAdmissionAllowed({
        move: normalizedMove,
        entityType,
        entityId,
        partitionId,
        sourceNodeId,
      });
      return {
        allowed: true,
        decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        admissionResult: {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        },
      };
    } catch (error) {
      if (!error?.admissionResult) {
        throw error;
      }
      return {
        allowed: false,
        decisionType:
          error.admissionResult?.decisionType ||
          STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
        admissionResult: error.admissionResult,
        error,
      };
    }
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move) {
    const normalizedMoveType = this.normalizeMoveType(move?.type);
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
    );

    if (existing) {
      this.rememberOperationIntent(dedupeKey, existing);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, {
        existingOperationId: existing.operationId,
        partitionId: partitionId,
        targetNodeId: move.nodeId,
        type: normalizedMoveType || move.type,
        entityType: entityType,
        entityId: entityId,
      });
      return existing;
    }

    const operationId = uuidv4();
    const sourceReplicaId = normalizedMoveType === OperationType.REPLACE ?
      (move.replicaId || null) :
      null;
    let operationReplicaId = move.replicaId || null;

    await this.ensureProvisioningAdmissionAllowed({
      move: normalizedMove,
      entityType,
      entityId,
      partitionId,
      sourceNodeId,
    });

    if (normalizedMoveType === OperationType.ADD && !operationReplicaId) {
      operationReplicaId = await this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
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
    });
    operation.entityType = entityType;
    operation.entityId = entityId;

    // Capture readiness snapshot for the target node at creation time
    // (Req 4.2 — persist readiness snapshot with decisions)
    const targetReadiness =
      this.controlPlaneReadinessService.getNodeReadinessSync(
        move.nodeId,
      );
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
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
      );
      if (existingAfterInsert) {
        this.rememberOperationIntent(dedupeKey, existingAfterInsert);
        return existingAfterInsert;
      }
    }

    this.stats.operationsCreated++;
    this.rememberOperationIntent(dedupeKey, operation);

    // Create storage reservation atomically (Req 4.1)
    await this.createReservationForOperation(operation);

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});

    return operation;
  }

  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureProvisioningAdmissionAllowed(context) {
    const {moveType, admissionResult, estimatedBytes} =
      await this.evaluateProvisioningAdmission(context);
    if (!admissionResult) {
      return;
    }
    if (admissionResult.allowed === true ||
        admissionResult.decisionType ===
          STORAGE_ADMISSION_DECISION_TYPE.ADMITTED) {
      return;
    }

    const firstIneligibleNode = Array.isArray(admissionResult.ineligibleNodes) &&
      admissionResult.ineligibleNodes.length > NUM.ZERO ?
      admissionResult.ineligibleNodes[NUM.ZERO] :
      null;
    this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.PROVISIONING_ADMISSION_DENIED, {
      moveType,
      targetNodeId: context?.move?.nodeId || null,
      sourceNodeId: context?.sourceNodeId || null,
      estimatedBytes,
      decisionType: admissionResult?.decisionType || null,
      blockingReasons: Array.isArray(admissionResult?.blockingReasons) ?
        admissionResult.blockingReasons :
        [],
      eligibleNodeIds: Array.isArray(admissionResult?.eligibleNodeIds) ?
        admissionResult.eligibleNodeIds :
        [],
      firstIneligibleNode: firstIneligibleNode ?
        {
          nodeId: firstIneligibleNode.nodeId || null,
          failedDimensions: Array.isArray(firstIneligibleNode.failedDimensions) ?
            firstIneligibleNode.failedDimensions :
            [],
          reasonCodes: Array.isArray(firstIneligibleNode.reasonCodes) ?
            firstIneligibleNode.reasonCodes :
            [],
          nodeSummary: firstIneligibleNode.nodeSummary &&
            typeof firstIneligibleNode.nodeSummary === 'object' ?
            {
              status: firstIneligibleNode.nodeSummary.status ?? null,
              connectionState:
                firstIneligibleNode.nodeSummary.connectionState ??
                null,
              lastHeartbeat:
                firstIneligibleNode.nodeSummary.lastHeartbeat ??
                null,
              readyLeaseExpiresAt:
                firstIneligibleNode.nodeSummary.readyLeaseExpiresAt ??
                null,
              storageBudgetBytes:
                firstIneligibleNode.nodeSummary.storageBudgetBytes ??
                null,
            } :
            null,
        } :
        null,
    });

    throw this.createProvisioningAdmissionError(
      context.move,
      admissionResult,
    );
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>} Normalized evaluation output.
   * @private
   */
  async evaluateProvisioningAdmission(context) {
    const moveType = this.normalizeMoveType(context?.move?.type);
    if (moveType !== OperationType.ADD &&
        moveType !== OperationType.REPLACE) {
      return {
        moveType,
        admissionResult: null,
        estimatedBytes: NUM.ZERO,
      };
    }

    this.assertProvisioningAdmissionDependencies(moveType);

    const estimatedBytes = this.estimateProvisioningAdmissionBytes(
      context?.entityType,
    );
    let admissionResult = null;
    if (moveType === OperationType.ADD) {
      admissionResult = await this.storageAdmissionService.checkAdd({
        targetNodeId: context.move.nodeId,
        estimatedBytes,
      });
    } else if (moveType === OperationType.REPLACE) {
      admissionResult = await this.storageAdmissionService.checkReplace({
        sourceNodeId: context.sourceNodeId,
        targetNodeId: context.move.nodeId,
        estimatedBytes,
      });
    }

    assertCritical(
      admissionResult,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED,
    );
    if (admissionResult.allowed === true ||
        admissionResult.decisionType ===
          STORAGE_ADMISSION_DECISION_TYPE.ADMITTED) {
      return {
        moveType,
        admissionResult,
        estimatedBytes,
      };
    }
    return {
      moveType,
      admissionResult,
      estimatedBytes,
    };
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  estimateProvisioningAdmissionBytes(entityType) {
    return this.storageAccountingService.estimateReplicaBytes({
      entityType: entityType || SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.ZERO,
    });
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing moves.
   * @param {string} moveType
   * @return {void}
   * @private
   */
  assertProvisioningAdmissionDependencies(moveType) {
    assertCritical(
      this.storageAdmissionService,
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_REQUIRED,
    );
    assertCritical(
      this.storageAccountingService &&
        typeof this.storageAccountingService.estimateReplicaBytes ===
          'function',
      REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED,
    );
    if (moveType === OperationType.ADD) {
      assertCritical(
        typeof this.storageAdmissionService.checkAdd === 'function',
        REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED,
      );
    }
    if (moveType === OperationType.REPLACE) {
      assertCritical(
        typeof this.storageAdmissionService.checkReplace === 'function',
        REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ADMISSION_CHECK_REPLACE_REQUIRED,
      );
    }
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createProvisioningAdmissionError(move, admissionResult) {
    const blockingReasons = Array.isArray(admissionResult?.blockingReasons) ?
      admissionResult.blockingReasons.map((reason) => String(
        reason?.code ||
        reason?.reason ||
        reason ||
        '',
      )).filter((reason) => reason.length > NUM.ZERO) :
      [];
    const primaryReason = blockingReasons.length > NUM.ZERO ?
      String(
        blockingReasons[NUM.ZERO] ||
        '',
      ) :
      String(admissionResult?.reason || admissionResult?.decisionType || '');
    const secondaryReasons = blockingReasons
      .slice(NUM.ONE)
      .filter((reason) => reason !== primaryReason)
      .slice(0, 3);
    const firstIneligibleReasonCodes = Array.isArray(
      admissionResult?.ineligibleNodes?.[NUM.ZERO]?.reasonCodes,
    ) ?
      admissionResult.ineligibleNodes[NUM.ZERO].reasonCodes
        .map((reason) => String(reason || ''))
        .filter((reason) => reason.length > NUM.ZERO)
        .slice(0, 4) :
      [];
    const diagnosticsSuffixParts = [];
    if (secondaryReasons.length > NUM.ZERO) {
      diagnosticsSuffixParts.push(
        'secondary=' + secondaryReasons.join(','),
      );
    }
    if (firstIneligibleReasonCodes.length > NUM.ZERO) {
      diagnosticsSuffixParts.push(
        'node_reason_codes=' + firstIneligibleReasonCodes.join(','),
      );
    }
    const diagnosticsSuffix = diagnosticsSuffixParts.length > NUM.ZERO ?
      ` (${diagnosticsSuffixParts.join('; ')})` :
      '';
    const error = new Error(
      `Provisioning admission ${admissionResult?.decisionType || 'blocked'} ` +
      `for ${move?.type || 'operation'} on ${move?.nodeId || 'unknown'}` +
      (primaryReason ? `: ${primaryReason}` : '') +
      diagnosticsSuffix,
    );
    error.admissionResult = admissionResult;
    return error;
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
    const result = await this.executeOperationMutationWithRetry(
      SQL.INSERT_OPERATION,
      [
        operation.operationId,
        operation.type,
        operation.partitionId,
        operation.replicaId,
        operation.sourceNodeId,
        operation.targetNodeId,
        operation.status,
        operation.workflowStep,
        operation.createdAt,
        operation.updatedAt,
        operation.completedAt,
        operation.errorMessage,
        JSON.stringify(operation.stepsHistory),
        operation.entityType,
        operation.entityId,
      ],
    );

    if (!result.success) {
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
        operationId: operation.operationId,
        error: result.error,
      });
      throw new Error(result.error);
    }

    if (typeof result.changes === 'number') {
      await this.waitForReplicaOperationCacheVisibility(operation);
      return result.changes > 0;
    }

    await this.waitForReplicaOperationCacheVisibility(operation);
    return true;
  }

  /**
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation) {
    const result = await this.executeOperationMutationWithRetry(
      SQL.UPDATE_OPERATION,
      [
        operation.status,
        operation.workflowStep,
        operation.updatedAt,
        operation.completedAt,
        operation.errorMessage,
        JSON.stringify(operation.stepsHistory),
        operation.replicaId,
        operation.operationId,
      ],
    );

    if (!result.success) {
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, {
        operationId: operation.operationId,
        error: result.error,
      });
      throw new Error(result.error);
    }

    await this.waitForReplicaOperationCacheVisibility(operation);
  }

  /**
   * Wait for replica_operations cache visibility after SQL persistence.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    if (!operation?.operationId ||
        !this.cdcIntegrationService ||
        typeof this.cdcIntegrationService.waitForCacheUpdate !==
          'function') {
      return;
    }
    const minimumFields = {};
    if (Number.isFinite(operation.updatedAt)) {
      minimumFields.updated_at = operation.updatedAt;
    }
    if (Number.isFinite(operation.completedAt)) {
      minimumFields.completed_at = operation.completedAt;
    }
    const expectedFields = {};
    if (operation.replicaId !== null && operation.replicaId !== undefined) {
      expectedFields.replica_id = operation.replicaId;
    }
    const expectedCacheFields = Object.keys(expectedFields).length > NUM.ZERO ?
      expectedFields :
      undefined;
    const minimumCacheFields = Object.keys(minimumFields).length > NUM.ZERO ?
      minimumFields :
      undefined;
    await this.cdcIntegrationService.waitForCacheUpdate(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      operation.operationId,
      true,
      {
        expectedFields: expectedCacheFields,
        minimumFields: minimumCacheFields,
        fallbackPhase: CDC_FALLBACK_PHASE_RECOVERY,
      },
    );
  }

  /**
   * Execute operation mutation SQL with retry for transient leader gaps.
   * @param {string} sql - SQL statement.
   * @param {Array<*>} params - Statement parameters.
   * @return {Promise<Object>} SQL query result.
   * @private
   */
  async executeOperationMutationWithRetry(sql, params) {
    const startedAt = Date.now();
    while (true) {
      const result = await this.sqlQueryEngine.executeQuery(
        sql,
        params,
        CONTROL_PLANE_QUERY_OPTIONS,
      );
      if (result.success || !this.isRetryableOperationPersistError(result.error)) {
        return result;
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs;
      if (remainingMs <= NUM.ZERO) {
        return result;
      }

      const waitMs = Math.min(OPERATION_PERSIST_RETRY_DELAY_MS, remainingMs);
      await this.waitForOperationPersistRetry(waitMs);
    }
  }

  /**
   * Check whether operation persist error is transient and retryable.
   * @param {string} errorMessage - SQL error message.
   * @return {boolean} True when retry should be attempted.
   * @private
   */
  isRetryableOperationPersistError(errorMessage) {
    return typeof errorMessage === 'string' &&
      (
        errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
        errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND)
      );
  }

  /**
   * Delay helper for operation mutation retry loop.
   * @param {number} delayMs - Delay duration in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async waitForOperationPersistRetry(delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    const candidate = Number(result?.changes ?? result?.affectedRows);
    return Number.isFinite(candidate) ? candidate : null;
  }

  /**
   * Transition one active reservation row by its canonical primary key.
   * @param {string} reservationId - Reservation primary key.
   * @param {string} nextStatus - Target reservation status.
   * @param {number} now - Transition timestamp.
   * @return {Promise<Object>} Transition result.
   * @private
   */
  async transitionActiveReservationById(reservationId, nextStatus, now) {
    const result = await this.executeOperationMutationWithRetry(
      SQL.UPDATE_RESERVATION_STATUS_BY_ID,
      [
        nextStatus,
        now,
        now,
        reservationId,
        RESERVATION_STATUS.ACTIVE,
      ],
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
  async createReservationForOperation(operation) {
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

    const activeResult = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION,
      [operation.operationId, RESERVATION_STATUS.ACTIVE],
      CONTROL_PLANE_QUERY_OPTIONS,
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
    const staleResult = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_EXPIRED_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE, now],
      CONTROL_PLANE_QUERY_OPTIONS,
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
    const activeResult = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_ACTIVE_RESERVATIONS,
      [RESERVATION_STATUS.ACTIVE],
      CONTROL_PLANE_QUERY_OPTIONS,
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
    if (this.isShuttingDown || !this.initialized) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operationId: operation?.operationId,
      };
    }

    const operationId = operation?.operationId;
    const singleFlightKey = operationId ?
      this.getExecuteOperationSingleFlightKey(operationId) :
      null;
    if (singleFlightKey && this.operationsInExecution.has(singleFlightKey)) {
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      };
    }

    if (!singleFlightKey) {
      return this.executeOperationInternal(operation);
    }

    return this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.executeOperationInternal(operation),
    );
  }

  /**
   * Execute operation body once per operation ID.
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   * @private
   */
  async executeOperationInternal(operation) {
    if (!this.messageRouter) {
      throw new Error(REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING);
    }

    if (!this.isOperationLocallyOwned(operation)) {
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
        operationId: operation?.operationId,
      };
    }

    const replaceRemovePhase = this.isReplaceRemovePhase(operation);
    const replaceSourceReplicaId = this.getReplaceSourceReplicaId(operation);

    // Initial dispatch transitions to SENDING. REPLACE remove phase keeps ACTIVE
    // until the source remove request is acknowledged.
    if (!replaceRemovePhase) {
      await this.updateStep(operation, WORKFLOW_STEP.SENDING);
    }

    const removeSafetyError =
      await this.getRemoveSafetyError(operation);
    if (removeSafetyError) {
      await this.failOperation(operation, removeSafetyError, {
        logLevel: FAILURE_LOG_LEVEL.WARN,
        logMessage: REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY,
      });
      return {
        success: false,
        operationId: operation.operationId,
        error: removeSafetyError,
      };
    }

    const entityType = operation.entityType || SERVICE_TYPE.PARTITION;
    const entityId = operation.entityId || operation.partitionId;
    const handlerType = OPERATION_HANDLER[entityType] ||
      OPERATION_HANDLER[SERVICE_TYPE.PARTITION];
    let dispatchNodeId = operation.targetNodeId;
    let messageType = ReplicaOperationMessageType.CREATE_REPLICA;
    let requestReplicaId = operation.replicaId;
    let requestReason = null;

    if (operation.type === OperationType.REMOVE) {
      messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
    } else if (operation.type === OperationType.REPLACE) {
      if (replaceRemovePhase) {
        dispatchNodeId = operation.sourceNodeId;
        messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
        requestReplicaId = replaceSourceReplicaId;
        requestReason = 'replace_source_removal';
      } else {
        messageType = ReplicaOperationMessageType.CREATE_REPLICA;
        if (!operation.replicaId || operation.replicaId === replaceSourceReplicaId) {
          operation.replicaId = await this.allocateCanonicalReplicaId({
            partitionId: operation.partitionId,
            entityType,
            entityId,
            excludeReplicaIds: replaceSourceReplicaId ?
              [replaceSourceReplicaId] :
              [],
          });
        }
        requestReplicaId = operation.replicaId;
      }
    }

    if (operation.type === OperationType.REPLACE &&
        replaceRemovePhase &&
        !requestReplicaId) {
      const replaceSourceMissing =
        `Missing source replica for REPLACE operation ${operation.operationId}`;
      await this.failOperation(operation, replaceSourceMissing);
      return {
        success: false,
        operationId: operation.operationId,
        error: replaceSourceMissing,
      };
    }

    const target = `${dispatchNodeId}/service/${handlerType}`;
    const request = {
      [ReplicaOperationField.TYPE]: messageType,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: requestReplicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
      [ReplicaOperationField.ENTITY_TYPE]: entityType,
      [ReplicaOperationField.ENTITY_ID]: entityId,
    };
    if (requestReason) {
      request[ReplicaOperationField.REASON] = requestReason;
    }
    if (Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) &&
        operation[ReplicaOperationField.REPLICA_IDS].length > NUM.ZERO) {
      request[ReplicaOperationField.REPLICA_IDS] =
        operation[ReplicaOperationField.REPLICA_IDS];
    }
    if (Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) &&
        operation[ReplicaOperationField.PEER_ADDRESSES].length > NUM.ZERO) {
      request[ReplicaOperationField.PEER_ADDRESSES] =
        operation[ReplicaOperationField.PEER_ADDRESSES];
    }
    if (operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] &&
        typeof operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] ===
          'object') {
      request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] =
        operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA];
    }
    if (operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] &&
        typeof operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] ===
          'object') {
      request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] =
        operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA];
    }

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION, {
      operationId: operation.operationId,
      target,
      type: messageType,
      entityType,
      entityId,
      replaceRemovePhase,
    });

    const response = await this.messageRouter.deliver(
      target,
      request,
      {targetNodeId: dispatchNodeId},
    );

    if (!response.acknowledged) {
      const errorMsg = this.normalizeErrorMessage(
        response.error,
        REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
      );
      await this.failOperation(operation, errorMsg);
      return {
        success: false,
        operationId: operation.operationId,
        error: errorMsg,
      };
    }

    if (response.status === ReplicaOperationResponseStatus.INITIATED ||
        response.status === ReplicaOperationResponseStatus.IN_PROGRESS) {
      let nextStep = WORKFLOW_STEP.CREATING;
      if (operation.type === OperationType.REMOVE ||
          (operation.type === OperationType.REPLACE && replaceRemovePhase)) {
        nextStep = WORKFLOW_STEP.STOPPING;
      }
      await this.updateStep(operation, nextStep);

      return {
        success: true,
        operationId: operation.operationId,
        status: 'in_progress',
      };
    } else if (response.status === ReplicaOperationResponseStatus.ALREADY_EXISTS) {
      if (operation.type === OperationType.REPLACE && !replaceRemovePhase) {
        await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
        return {
          success: true,
          operationId: operation.operationId,
          status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
        };
      }

      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
      };
    } else if (response.status === ReplicaOperationResponseStatus.COMPLETED) {
      if (operation.type === OperationType.REPLACE && !replaceRemovePhase) {
        await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
        return {
          success: true,
          operationId: operation.operationId,
          status: ReplicaOperationResponseStatus.COMPLETED,
        };
      }

      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.COMPLETED,
      };
    } else if (response.status === ReplicaOperationResponseStatus.NOT_FOUND &&
        operation.type === OperationType.REPLACE &&
        replaceRemovePhase) {
      // Source replica already removed - complete idempotently.
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.NOT_FOUND,
      };
    } else {
      // Error response
      const errorMsg = this.normalizeErrorMessage(response.error, 'Unknown error');
      await this.failOperation(operation, errorMsg);
      return {
        success: false,
        operationId: operation.operationId,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute a step transition atomically using the distributed
   * transaction coordinator.
   *
   * Wraps the workflow transition and operation row persist in a
   * single transaction boundary. The coordinator is mandatory:
   * atomic topology transitions must fail closed when it is absent.
   *
   * Idempotency: if the workflow coordinator has already committed
   * this (operationId, stepId) pair, the transition is skipped.
   *
   * @param {Object} operation - Operation being transitioned.
   * @param {string} step - Target workflow step.
   * @param {string} reason - Transition reason code.
   * @param {Function} persistFn - Async function that persists the
   *   operation row after the in-memory state is updated.
   * @return {Promise<void>}
   * @private
   */
  async executeAtomicTransition(operation, step, reason, persistFn) {
    this.ensureOperationWorkflow(operation);

    if (this.operationWorkflowCoordinator
      .isTransitionIdempotent(operation.operationId, step)) {
      return;
    }

    const txCoordinator = this.transactionCoordinator;
    if (!txCoordinator ||
        typeof txCoordinator.begin !== 'function' ||
        typeof txCoordinator.commit !== 'function' ||
        typeof txCoordinator.rollback !== 'function') {
      throw new Error(
        REBALANCE_COORDINATOR_ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED,
      );
    }

    const sessionId = `${operation.operationId}:${step}`;
    const beginResult = await txCoordinator.begin(sessionId);
    if (!beginResult.success) {
      throw new Error(beginResult.error);
    }
    try {
      await this.operationWorkflowCoordinator.transitionStep(
        operation.operationId,
        {nextStep: step, reason},
      );
      await persistFn();
      const commitResult = await txCoordinator.commit(sessionId);
      if (!commitResult.success) {
        throw new Error(commitResult.error);
      }
    } catch (error) {
      await txCoordinator.rollback(sessionId);
      throw error;
    }
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
    const previousStep = operation.workflowStep;
    if (previousStep === step) {
      return;
    }
    const transitionReason = reason ||
      this.resolveTransitionReason(previousStep, step);
    const now = Date.now();

    // Capture readiness snapshot for the target node at transition
    // time (Req 4.2 — persist readiness snapshot with decisions)
    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService.getNodeReadinessSync(
        targetNodeId,
      ) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );

    const persistFn = async () => {
      operation.workflowStep = step;
      operation.updatedAt = now;
      const stepEntry = {
        step,
        timestamp: now,
        previousStep,
        reason: transitionReason,
        ownerKey: operation.operationId,
      };
      if (readinessSnapshot) {
        stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
          readinessSnapshot;
      }
      operation.stepsHistory.push(stepEntry);
      operation.status = WORKFLOW_STEP_TO_STATUS[step] || operation.status;
      await this.persistOperationUpdate(operation);
    };

    await this.executeAtomicTransition(
      operation, step, transitionReason, persistFn,
    );

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      reason: transitionReason,
      status: operation.status,
      partitionId: operation.partitionId,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
      operation,
      previousStep,
      newStep: step,
      reason: transitionReason,
    });
  }

  /**
   * Complete an operation successfully.
   *
   * @param {Object} operation - Operation to complete.
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    const now = Date.now();
    const finalStep = operation.type === OperationType.ADD ?
      WORKFLOW_STEP.ACTIVE :
      WORKFLOW_STEP.REMOVED;
    if (operation.workflowStep === finalStep &&
        operation.completedAt !== null &&
        operation.completedAt !== undefined) {
      return;
    }
    const previousStep = operation.workflowStep;

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService.getNodeReadinessSync(
        targetNodeId,
      ) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );

    const persistFn = async () => {
      operation.workflowStep = finalStep;
      operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
      operation.updatedAt = now;
      operation.completedAt = now;
      const stepEntry = {
        step: finalStep,
        timestamp: now,
        previousStep,
        reason: OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
        ownerKey: operation.operationId,
      };
      if (readinessSnapshot) {
        stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
          readinessSnapshot;
      }
      operation.stepsHistory.push(stepEntry);
      await this.persistOperationUpdate(operation);
    };

    await this.executeAtomicTransition(
      operation,
      finalStep,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      persistFn,
    );

    // Release storage reservation on terminal completion (Req 4.3)
    await this.releaseReservationForOperation(operation);

    this.stats.operationsCompleted++;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {operation});

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
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
    if (!operation) {
      return null;
    }

    const isRemoveOperation = operation.type === OperationType.REMOVE;
    const isReplaceRemovePhase = this.isReplaceRemovePhase(operation);
    if (!isRemoveOperation && !isReplaceRemovePhase) {
      return null;
    }

    if (!this.isCriticalSystemPartition(operation.partitionId)) {
      return null;
    }

    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== 'function') {
      return `Critical partition ${operation.partitionId} safety check unavailable`;
    }

    const criticalReplicaRows = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row.partition_id === operation.partitionId &&
        row.service_type === SERVICE_TYPE.PARTITION,
    ) || [];

    const currentVoterReadyRows = criticalReplicaRows.filter(
      (row) => this.isVoterReadyRoutableReplica(row),
    );

    const operationReplicaId = operation.type === OperationType.REPLACE ?
      this.getReplaceSourceReplicaId(operation) :
      operation.replicaId;

    if (!operationReplicaId) {
      return `Critical partition ${operation.partitionId} safety check unavailable`;
    }

    const removingVoterReady = currentVoterReadyRows.some(
      (row) => this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId,
      }),
    );

    // Removing a non-voter replica cannot reduce quorum.
    if (!removingVoterReady) {
      return null;
    }

    if (isReplaceRemovePhase) {
      const replacementReplicaId = this.getReplaceTargetReplicaId(operation);
      if (!replacementReplicaId) {
        return `Critical partition ${operation.partitionId} replacement replica is unavailable`;
      }
      const replacementReplica = criticalReplicaRows.find((row) => {
        return row?.service_id === replacementReplicaId ||
          row?.replica_id === replacementReplicaId;
      });
      if (!this.isVoterReadyRoutableReplica(replacementReplica)) {
        return `Critical partition ${operation.partitionId} replacement replica ` +
          `${replacementReplicaId} is not voter-ready`;
      }
    }

    const minReplicaCount =
      await this.getCriticalMinReplicaCount(
        operation.partitionId,
      );
    const projectedVoterReadyCount = Math.max(NUM.ZERO, currentVoterReadyRows.length - NUM.ONE);
    if (projectedVoterReadyCount >= minReplicaCount) {
      return null;
    }

    return `Critical partition ${operation.partitionId} would drop voter-ready replicas ` +
      `below minimum (${projectedVoterReadyCount}/${minReplicaCount})`;
  }

  /**
   * Evaluate safety error for a move intent before operation creation.
   * @param {Object} move - Move intent.
   * @return {Promise<string|null>} Safety error when move is blocked.
   */
  async getMoveSafetyError(move) {
    if (!move) {
      return null;
    }

    const normalizedType = typeof move.type === 'string' ?
      move.type.toUpperCase() :
      move.type;
    const operation = {
      type: normalizedType,
      partitionId: move.partitionId || move.entityId,
      replicaId: move.replicaId,
      targetNodeId: move.nodeId,
    };

    return this.getRemoveSafetyError(operation);
  }

  /**
   * Check whether a partition is a critical system partition.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True for critical system partitions.
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    return typeof partitionId === 'string' &&
      CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId);
  }

  /**
   * Check whether a replica row is voter-ready and routable.
   * @param {Object} replicaRow - services row.
   * @return {boolean} True when replica is non-learner ACTIVE with routeability.
   * @private
   */
  isVoterReadyRoutableReplica(replicaRow) {
    if (!replicaRow) {
      return false;
    }

    if (replicaRow.status !== ReplicaStatus.ACTIVE) {
      return false;
    }

    if (!replicaRow.address) {
      return false;
    }

    const raftRole = typeof replicaRow.raft_role === 'string' ?
      replicaRow.raft_role.toLowerCase() :
      null;

    if (!raftRole || raftRole === RAFT_ROLE.LEARNER) {
      return false;
    }

    return this.isNodeReadyForRouting(replicaRow.node_id);
  }

  /**
   * Determine whether a services row is the replica referenced by an operation.
   * @param {Object} replicaRow - services row.
   * @param {Object} operation - operation payload.
   * @return {boolean} True when row matches operation target replica.
   * @private
   */
  isOperationReplicaRow(replicaRow, operation) {
    if (!replicaRow || !operation) {
      return false;
    }
    if (!operation.replicaId) {
      return false;
    }
    return replicaRow.service_id === operation.replicaId ||
      replicaRow.replica_id === operation.replicaId;
  }

  /**
   * Resolve minimum voter-ready replica count for a critical partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<number>} Minimum replica count.
   * @private
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (!this.tablePolicyService ||
        typeof this.tablePolicyService.getPolicyForPartition !==
        'function') {
      return DEFAULT_MIN_REPLICA_COUNT;
    }

    try {
      const policy =
        await this.tablePolicyService.getPolicyForPartition(
          partitionId,
        );
      const minReplicaCount = Number(policy?.minReplicaCount);
      if (Number.isFinite(minReplicaCount) &&
          minReplicaCount > NUM.ZERO) {
        return Math.floor(minReplicaCount);
      }
    } catch (error) {
      this.logger.warn(
        'Failed to resolve minReplicaCount for critical' +
        ' partition safety check', {
          partitionId,
          error: error.message,
        });
    }

    return DEFAULT_MIN_REPLICA_COUNT;
  }

  /**
   * Check whether a node is currently routable for replica traffic.
   * @readModel COORDINATOR_NODE_READINESS —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Node ID.
   * @return {boolean} True when node is READY with valid lease.
   * @private
   */
  /**
     * Check whether a node is currently ready for internal topology work.
     * Rebalance is an internal topology consumer and gates on repairEligible
     * only (Req 4.2). Serve-only dimensions do not block rebalance routing.
     * @readModel COORDINATOR_NODE_READINESS —
     *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
     * @param {string} nodeId - Node ID.
     * @return {boolean}
     * @private
     */
    isNodeReadyForRouting(nodeId) {
      if (!nodeId) {
        return false;
      }

      const readiness = this.controlPlaneReadinessService
        .getNodeReadinessSync(nodeId);
      if (!readiness || !readiness.dimensions) {
        return false;
      }

      return readiness.dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
      ] === true;
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
    const now = Date.now();
    if (operation.workflowStep === WORKFLOW_STEP.FAILED &&
        operation.completedAt !== null &&
        operation.completedAt !== undefined) {
      return;
    }
    const normalizedError = this.normalizeErrorMessage(
      errorMessage, 'Unknown error',
    );
    const isSafetyBlocked = this.isSafetyPolicyFailure(normalizedError);
    const logLevel = options.logLevel ||
      (isSafetyBlocked ?
        FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR);
    const logMessage = options.logMessage ||
      (isSafetyBlocked ?
        REBALANCE_COORDINATOR_LOG_MSG
          .OPERATION_BLOCKED_BY_SAFETY_POLICY :
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED);
    const previousStep = operation.workflowStep;
    const transitionReason = isSafetyBlocked ?
      OPERATION_TRANSITION_REASON.SAFETY_POLICY_BLOCKED :
      OPERATION_TRANSITION_REASON.OPERATION_FAILED;

    const targetNodeId = operation.targetNodeId;
    const targetReadiness = targetNodeId ?
      this.controlPlaneReadinessService.getNodeReadinessSync(
        targetNodeId,
      ) :
      null;
    const readinessSnapshot =
      ControlPlaneReadinessService.compactSnapshotSummary(
        targetReadiness,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );

    const persistFn = async () => {
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = ReplicaStatus.FAILED;
      operation.updatedAt = now;
      operation.completedAt = now;
      operation.errorMessage = normalizedError;
      const failedStepEntry = {
        step: WORKFLOW_STEP.FAILED,
        timestamp: now,
        previousStep,
        reason: transitionReason,
        ownerKey: operation.operationId,
      };
      if (options.stepMetadata &&
          typeof options.stepMetadata === 'object') {
        Object.assign(failedStepEntry, options.stepMetadata);
      }
      if (readinessSnapshot) {
        failedStepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] =
          readinessSnapshot;
      }
      operation.stepsHistory.push(failedStepEntry);
      await this.persistOperationUpdate(operation);
    };

    await this.executeAtomicTransition(
      operation,
      WORKFLOW_STEP.FAILED,
      transitionReason,
      persistFn,
    );

    // Release storage reservation on terminal failure (Req 4.3)
    await this.releaseReservationForOperation(operation);

    this.stats.operationsFailed++;

    const logPayload = {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      errorMessage: normalizedError,
    };

    const logMethod = logLevel === FAILURE_LOG_LEVEL.WARN &&
      typeof this.logger.warn === 'function' ?
      this.logger.warn.bind(this.logger) :
      this.logger.error.bind(this.logger);

    logMethod(logMessage, logPayload);

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, {
      operation,
      errorMessage: normalizedError,
    });

    try {
      this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, {
        operationId: operation.operationId,
        entityType: operation.entityType,
        finalState: operation.status,
        totalDurationMs: now - operation.createdAt,
      });
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
  }

  /**
   * Check if an operation error corresponds to expected safety blocking.
   * @param {string} errorMessage - Operation error text.
   * @return {boolean} True when error is an expected safety policy block.
   * @private
   */
  /**
   * Register an operation as a workflow if not already tracked.
   *
   * This ensures the DurableWorkflowCoordinator knows about the
   * operation so that transitionStep can be called on it.
   *
   * @param {Object} operation - Operation record.
   * @private
   */
  ensureOperationWorkflow(operation) {
    const workflowId = operation.operationId;
    if (this.operationWorkflowCoordinator.getWorkflowById(workflowId)) {
      return;
    }
    const record = {
      workflowId,
      ownerKey: workflowId,
      step: operation.workflowStep || null,
      transitionHistory: [],
    };
    const workflow =
      this.operationWorkflowCoordinator.createWorkflowRecord(record);
    this.operationWorkflowCoordinator.setWorkflowState(workflow);
  }

  /**
   * Resolve a canonical transition reason from step progression.
   *
   * @param {string} previousStep - Previous workflow step.
   * @param {string} nextStep - Target workflow step.
   * @return {string} Canonical reason code.
   * @private
   */
  resolveTransitionReason(previousStep, nextStep) {
    if (nextStep === WORKFLOW_STEP.SENDING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
    }
    if (nextStep === WORKFLOW_STEP.CREATING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_CREATING;
    }
    if (nextStep === WORKFLOW_STEP.STOPPING) {
      return OPERATION_TRANSITION_REASON.DISPATCH_STOPPING;
    }
    if (nextStep === WORKFLOW_STEP.ACTIVE &&
        previousStep === WORKFLOW_STEP.SYNCING) {
      return OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE;
    }
    if (nextStep === WORKFLOW_STEP.ACTIVE) {
      return OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS;
    }
    if (nextStep === WORKFLOW_STEP.REMOVED) {
      return OPERATION_TRANSITION_REASON.OPERATION_COMPLETED;
    }
    if (nextStep === WORKFLOW_STEP.FAILED) {
      return OPERATION_TRANSITION_REASON.OPERATION_FAILED;
    }
    return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
  }

  isSafetyPolicyFailure(errorMessage) {
    if (typeof errorMessage !== 'string' || !errorMessage) {
      return false;
    }
    const normalized = errorMessage.toLowerCase();
    return normalized.includes('would drop voter-ready replicas below minimum') ||
      normalized.includes('safety check unavailable');
  }

  /**
   * Normalize arbitrary error payloads to a message string.
   * @param {*} errorLike - Error payload.
   * @param {string} fallbackMessage - Fallback when no message is available.
   * @return {string} Normalized error message.
   * @private
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (typeof errorLike === 'string' && errorLike.trim()) {
      return errorLike;
    }

    if (!errorLike || typeof errorLike !== 'object') {
      return fallbackMessage;
    }

    const candidateValues = [
      errorLike.message,
      errorLike.errorMessage,
      errorLike.error?.message,
      errorLike.error?.errorMessage,
      errorLike.details?.message,
      errorLike.details?.errorMessage,
    ];

    for (const candidate of candidateValues) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return fallbackMessage;
  }


  /**
   * Check for timed out operations.
   * Queries operations via SQL engine (no in-memory cache).
   * Requirements: 6.2
   * @private
   */
  async checkTimeouts() {
        if (this.isShuttingDown || !this.initialized) {
          return;
        }

        const now = Date.now();
        if (
          this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO &&
          now - this.lastEmptyIncompleteOperationQueryAtMs <
            this.incompleteOperationQueryEmptyBackoffMs
        ) {
          return;
        }

        // Query incomplete operations via SQL engine
        const incompleteOps = await this.queryIncompleteOperations();
        if (incompleteOps.length === NUM.ZERO) {
          this.lastEmptyIncompleteOperationQueryAtMs = now;
          return;
        }
        this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;

        for (const operation of incompleteOps) {
          if (!this.isOperationLocallyOwned(operation)) {
            continue;
          }
          // Skip completed or failed operations
          if (this.isOperationTerminal(operation)) {
            continue;
          }

          const singleFlightKey = this.getOperationOwnerSingleFlightKey(
            operation.operationId,
          );

          await this.operationWorkflowRunExclusive(
            singleFlightKey,
            () => this.reconcileTimeoutOperation(operation, now),
          ).catch((error) => {
            this.logger.error(
              REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED,
              {
                operationId: operation.operationId,
                error: error.message,
                nodeId: this.nodeId,
              },
            );
          });
        }

        // Periodic reservation reconciliation (Req 4.4)
        await this.reconcileReservations().catch((error) => {
          this.logger.warn(
            REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED,
            {error: error.message},
          );
        });
      }

  /**
   * Get timeout for a workflow step.
   *
   * @param {string} step - Workflow step.
   * @return {number} Timeout in milliseconds.
   * @private
   */
  getTimeoutForStep(step) {
    switch (step) {
    case WORKFLOW_STEP.PENDING:
    case WORKFLOW_STEP.SENDING:
      return this.config.pendingTimeoutMs;
    case WORKFLOW_STEP.CREATING:
      return this.config.creatingTimeoutMs;
    case WORKFLOW_STEP.SYNCING:
      return this.config.syncingTimeoutMs;
    case WORKFLOW_STEP.STOPPING:
      return this.config.removingTimeoutMs;
    default:
      return this.config.pendingTimeoutMs;
    }
  }
  /**
   * Per-operation timeout/progress reconciliation routed through the
   * owner-key reconcile queue. Attempts progress reconciliation first;
   * if no progress is detected, evaluates timeout budget and fails the
   * operation when the budget is exhausted.
   * @param {Object} operation - The in-flight operation to check.
   * @param {number} now - Current wall-clock timestamp.
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    if (await this.reconcileOperationProgress(operation)) {
      return;
    }

    // Create a top-level budget anchored at operation creation time.
    // Step budgets derive from remaining time — never fresh defaults.
    const operationBudget = createTopLevelOperationBudget({
      configuredBudgetMs:
        TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
      operationName: 'rebalance',
      startedAtMs: operation.createdAt || operation.updatedAt,
      now: () => now,
    });

    const stepTimeout = this.getTimeoutForStep(
      operation.workflowStep,
    );
    const stepAllocation = createChildTimeoutBudget(
      operationBudget,
      {
        requestedBudgetMs: stepTimeout,
        minimumBudgetMs:
          TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        classification:
          TIMEOUT_BUDGET_CLASSIFICATION
            .REBALANCE_OPERATION_TIMEOUT,
        nestedOperation:
          `rebalance:${String(
            operation.workflowStep || 'unknown',
          ).toLowerCase()}`,
        now: () => now,
      },
    );

    const elapsed = now - operation.updatedAt;
    const stepExceeded = elapsed >= stepTimeout;
    const budgetExhausted = !stepAllocation.allowed;

    if (stepExceeded || budgetExhausted) {
      const timeoutClassification = budgetExhausted ?
        stepAllocation.timeoutClassification :
        buildTimeoutClassification({
          budget: operationBudget,
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION
              .REBALANCE_OPERATION_TIMEOUT,
          nestedOperation:
            `rebalance:${String(
              operation.workflowStep || 'unknown',
            ).toLowerCase()}`,
          now: () => now,
        });

      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT,
        {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          elapsed,
          timeout: stepTimeout,
          budgetExhausted,
          timeoutClassification,
        },
      );

      await this.failOperation(
        operation,
        `Timeout in ${operation.workflowStep} step ` +
          `after ${elapsed}ms`,
        {
          stepMetadata: {
            timeoutClassification,
            timeoutMs: stepTimeout,
            elapsedMs: elapsed,
            timedOutAtMs: now,
            budgetExhausted,
          },
        },
      );

      this.stats.operationsTimedOut++;
    }
  }



  /**
   * Reconcile one in-flight operation against observed replica state.
   * This keeps workflows progressing even if the async handler update is lost.
   * @param {Object} operation - Operation to reconcile.
   * @return {Promise<boolean>} True when the workflow advanced.
   * @private
   */
  async reconcileOperationProgress(operation) {
    if (!operation) {
      return false;
    }
    if (!this.isOperationLocallyOwned(operation)) {
      return false;
    }

    if (operation.type === OperationType.REPLACE &&
        operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
      await this.executeOperation(operation);
      return true;
    }

    if (operation.workflowStep !== WORKFLOW_STEP.CREATING &&
        operation.workflowStep !== WORKFLOW_STEP.SYNCING) {
      return false;
    }

    const actualStatus = await this.getActualReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );

    if (actualStatus === ReplicaStatus.SYNCING &&
        operation.workflowStep === WORKFLOW_STEP.CREATING) {
      await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
      return true;
    }

    if (actualStatus === ReplicaStatus.ACTIVE) {
      if (operation.type === OperationType.REPLACE) {
        await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
        await this.executeOperation(operation);
      } else {
        await this.completeOperation(operation);
      }
      return true;
    }

    if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(
        operation,
        'Replica failed during operation reconciliation',
      );
      return true;
    }

    return false;
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
    if (this.isShuttingDown || !this.initialized) {
      return;
    }

    const operationId =
      outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    if (!operationId) {
      return;
    }

    const singleFlightKey =
      this.getOperationOwnerSingleFlightKey(operationId);

    // Route through the owner-key reconcile queue. If an execution
    // or creation is already in flight for this key the outcome
    // reconcile will be coalesced by runExclusive.
    this.operationWorkflowRunExclusive(
      singleFlightKey,
      () => this.reconcileExecutorOutcome(outcome),
    ).catch((error) => {
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
        {
          operationId,
          outcomeType:
            outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE],
          error: error.message,
        },
      );
    });
  }

  /**
   * Reconcile a single executor outcome inside the owner-key
   * exclusive execution context.
   *
   * Looks up the operation, validates it, and calls the appropriate
   * coordinator transition method (updateStep / completeOperation /
   * failOperation).
   *
   * @param {Object} outcome - Frozen executor outcome payload.
   * @return {Promise<boolean>} True if a transition was applied.
   */
  async reconcileExecutorOutcome(outcome) {
    const operationId =
      outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
    const outcomeType =
      outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
    const workflowStep =
      outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
    const errorMessage =
      outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];

    this.logger.debug(
      REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED,
      {operationId, outcomeType, workflowStep},
    );

    // Look up the authoritative operation row.
    const operation = await this.queryOperationById(operationId);
    if (!operation) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND,
        {operationId, outcomeType},
      );
      return false;
    }

    // Skip if already terminal.
    if (this.isOperationTerminal(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_TERMINAL,
        {operationId, outcomeType, step: operation.workflowStep},
      );
      return false;
    }

    // Skip if not locally owned.
    if (!this.isOperationLocallyOwned(operation)) {
      this.logger.debug(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL,
        {operationId, outcomeType},
      );
      return false;
    }

    const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
    if (!mapping) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION,
        {operationId, outcomeType},
      );
      return false;
    }

    if (mapping.action === EXECUTOR_OUTCOME_ACTION.UPDATE_STEP) {
      await this.updateStep(
        operation,
        workflowStep,
        OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME,
      );
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE) {
      await this.completeOperation(operation);
    } else if (mapping.action === EXECUTOR_OUTCOME_ACTION.FAIL) {
      await this.failOperation(
        operation,
        errorMessage || outcomeType,
      );
    } else {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION,
        {operationId, outcomeType, action: mapping.action},
      );
      return false;
    }

    this.emit(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, {
      operationId,
      outcomeType,
      action: mapping.action,
    });

    return true;
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
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, {
        nodeId: this.nodeId,
      });

      const result = {
        totalIncomplete: NUM.ZERO,
        markedFailed: NUM.ZERO,
        reconciled: NUM.ZERO,
        errors: [],
      };

      // Query replica_operations for incomplete operations via SQL engine
      const incompleteOps = await this.queryIncompleteOperations();
      result.totalIncomplete = incompleteOps.length;

      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, {
        count: incompleteOps.length,
        nodeId: this.nodeId,
      });

      for (const op of incompleteOps) {
        if (!this.isOperationLocallyOwned(op)) {
          continue;
        }

        // Capture the original step before reconcile mutates the
        // operation in-place so the result counters stay correct.
        const originalStep = op.workflowStep;

        const singleFlightKey = this.getOperationOwnerSingleFlightKey(
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
            REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
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
        } else if (originalStep === WORKFLOW_STEP.SYNCING) {
          result.reconciled++;
        }
      }

      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, {
        nodeId: this.nodeId,
        ...result,
      });

      // Reconcile stale/orphan reservations after recovery (Req 4.4, 12.3)
      const reservationResult = await this.reconcileReservations();
      result.reservationsExpired = reservationResult.expired;
      result.reservationsOrphansReleased = reservationResult.orphansReleased;

      this.emit(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED, result);

      return result;
    }

  /**
   * Check if a workflow step is a pre-sync step that should be marked failed.
   * Requirements: 7.2
   *
   * @param {string} step - Workflow step to check.
   * @return {boolean} True if step is PENDING, SENDING, or CREATING.
   * @private
   */
  isPreSyncStep(step) {
    return [
      WORKFLOW_STEP.PENDING,
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
    ].includes(step);
  }
  /**
   * Per-operation recovery logic routed through the owner-key
   * reconcile queue. Decides whether to fail or reconcile the
   * operation based on its current workflow step.
   * @param {Object} op - The incomplete operation to recover.
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    if (this.isPreSyncStep(op.workflowStep)) {
      await this.failOperation(
        op, 'Node recovery - incomplete operation',
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED,
        {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        },
      );
    } else if (op.workflowStep === WORKFLOW_STEP.SYNCING) {
      await this.reconcileSyncingOperation(op);
    } else if (op.workflowStep === WORKFLOW_STEP.STOPPING) {
      await this.failOperation(
        op, 'Node recovery - incomplete removal operation',
      );
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED,
        {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        },
      );
    }
  }



  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * Uses SQL engine to query services table.
   * Requirements: 7.3
   *
   * @param {Object} operation - Operation in SYNCING state.
   * @return {Promise<void>}
   * @private
   */
  async reconcileSyncingOperation(operation) {
    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING, {
      operationId: operation.operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    // Check actual replica status via authoritative SQL
    const actualStatus = await this.getActualReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );

    // Emit divergence event when cache and authoritative state differ
    this.emitReplicaStatusDivergence(
      operation.replicaId,
      actualStatus,
      SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS,
    );

    if (actualStatus === ReplicaStatus.ACTIVE) {
      await this.completeOperation(operation);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_ACTIVE, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === ReplicaStatus.FAILED) {
      await this.failOperation(operation, 'Replica failed during sync');
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_FAILED, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === null) {
      await this.failOperation(
        operation,
        'Replica not found during recovery reconciliation',
      );
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_FAILED_NOT_FOUND,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
        },
      );
    } else {
      this.logger.info(
        REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId,
          actualStatus,
        },
      );
    }
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
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    if (replicaId) {
      const result = await this.sqlQueryEngine.executeQuery(
        SQL.SELECT_REPLICA_STATUS,
        [replicaId],
        CONTROL_PLANE_QUERY_OPTIONS,
      );

      if (result.success && result.rows && result.rows.length > NUM.ZERO) {
        return result.rows[NUM.ZERO].status;
      }
    }

    // Secondary lookup by partition + node when replicaId yields no row
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_REPLICA_BY_PARTITION_NODE,
      [partitionId, targetNodeId],
      CONTROL_PLANE_QUERY_OPTIONS,
    );

    if (result.success && result.rows && result.rows.length > NUM.ZERO) {
      return result.rows[NUM.ZERO].status;
    }

    return null;
  }

  /**
   * Emit a typed divergence event when cache and authoritative replica
   * status differ during recovery reconciliation.
   * @param {string} replicaId - Replica service ID.
   * @param {string|null} authoritativeStatus - Status from SQL.
   * @param {string} reason - SQL_RECONCILIATION_REASON value.
   * @private
   */
  emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
    if (!replicaId || !this.systemTableCache ||
        typeof this.systemTableCache.get !== 'function') {
      return;
    }

    const cachedRow = this.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      replicaId,
    );
    const cachedStatus = cachedRow?.status || null;

    if (cachedStatus === authoritativeStatus) {
      return;
    }

    const divergenceType = authoritativeStatus === null ?
      READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING :
      cachedStatus === null ?
        READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING :
        READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;

    const event = buildDivergenceEvent({
      divergenceType,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      ownerComponent: COORDINATOR_OWNER_COMPONENT,
      reconciliationReason: reason,
      rowKey: replicaId,
      cacheValue: cachedStatus ? {status: cachedStatus} : null,
      authoritativeValue: authoritativeStatus ?
        {status: authoritativeStatus} : null,
      divergentFields: ['status'],
    });

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE,
      event,
    );
    this.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);
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
    const cachedRows = this.filterReplicaOperationRowsFromCache(() => true);
    if (cachedRows !== null) {
      return [...cachedRows]
        .sort((left, right) => {
          const leftCreatedAt = Number(left?.created_at) || NUM.ZERO;
          const rightCreatedAt = Number(right?.created_at) || NUM.ZERO;
          if (leftCreatedAt !== rightCreatedAt) {
            return rightCreatedAt - leftCreatedAt;
          }
          return String(right?.operation_id || '').localeCompare(
            String(left?.operation_id || ''),
          );
        })
        .map((row) => this.rowToOperation(row));
    }

    const result = await this.executeReplicaOperationsRead(
      'SELECT * FROM replica_operations ORDER BY created_at DESC',
      [],
    );

    if (!result.success || !result.rows) {
      return [];
    }

    return result.rows.map((row) => this.rowToOperation(row));
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
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {
      if (!row) {
        return false;
      }

      return (row.entity_type === entityType &&
        row.entity_id === entityId) ||
        ((row.entity_type === null ||
          row.entity_type === undefined ||
          row.entity_type === '') &&
          row.partition_id === entityId);
    });
    if (cachedRows !== null) {
      return cachedRows.map((row) => this.rowToOperation(row));
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_OPERATIONS_BY_ENTITY,
      [entityType, entityId, entityId],
    );

    if (!result.success || !result.rows) {
      return [];
    }

    return result.rows.map((row) => this.rowToOperation(row));
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
  async getConcurrentAddCount() {
    const inFlight = await this.queryIncompleteOperations();
    return inFlight.filter((operation) => {
      return operation.type === OperationType.ADD ||
        operation.type === OperationType.REPLACE;
    }).length;
  }

  /**
   * Get count of concurrent REMOVE operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent REMOVE operations.
   */
  async getConcurrentRemoveCount() {
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) =>
      row?.type === OperationType.REMOVE,
    );
    if (cachedRows !== null) {
      return cachedRows
        .map((row) => this.rowToOperation(row))
        .filter((operation) => !this.isOperationTerminal(operation))
        .length;
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_IN_FLIGHT_BY_TYPE,
      [OperationType.REMOVE],
    );

    if (!result.success || !result.rows) {
      return NUM.ZERO;
    }

    return result.rows
      .map((row) => this.rowToOperation(row))
      .filter((operation) => !this.isOperationTerminal(operation))
      .length;
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
    if (this.cdcIntegrationService &&
        typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
          'function') {
      const result =
        await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          sql,
          params,
          {
            localReadConsistency: 'local_leader',
            replicaFallbackConsistency: 'any_replica',
            queryOptions: CONTROL_PLANE_QUERY_OPTIONS,
          },
        );
      if (result?.success) {
        return result;
      }
    }

    return this.sqlQueryEngine.executeQuery(
      sql,
      params,
      CONTROL_PLANE_QUERY_OPTIONS,
    );
  }

  /**
   * Check if we can start a new ADD operation.
   *
   * @return {Promise<boolean>} True if we can start a new ADD operation.
   */
  async canStartAddOperation() {
    const count = await this.getConcurrentAddCount();
    return count < this.config.maxConcurrentAdds;
  }

  /**
   * Check if we can start a new REMOVE operation.
   *
   * @return {Promise<boolean>} True if we can start a new REMOVE operation.
   */
  async canStartRemoveOperation() {
    const count = await this.getConcurrentRemoveCount();
    return count < this.config.maxConcurrentRemoves;
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

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}

export {RebalanceCoordinator};
