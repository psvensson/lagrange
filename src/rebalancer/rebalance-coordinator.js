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
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {
  WORKFLOW_STEP, NUM, ERRORS, TIME_MS, METRICS_LOG_TAG,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {assertCritical} from '../utils/assert.js';
import {
  OPERATION_METADATA_KEY,
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
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
} from './rebalancer-constants.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from './storage-capacity-constants.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations 
    WHERE status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`,
  SELECT_OPERATIONS_BY_PARTITION: 'SELECT * FROM replica_operations WHERE partition_id = ?',
  SELECT_OPERATIONS_BY_ENTITY: `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`,
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`,
  SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ? AND status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`,
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
  RELEASE_RESERVATION_BY_OPERATION: `UPDATE storage_reservations
    SET status = ?, updated_at = ?, released_at = ?
    WHERE operation_id = ? AND status = ?`,
  SELECT_ACTIVE_RESERVATIONS:
    'SELECT * FROM storage_reservations WHERE status = \'active\'',
  EXPIRE_STALE_RESERVATIONS: `UPDATE storage_reservations
    SET status = ?, updated_at = ?, released_at = ?
    WHERE status = ? AND expires_at <= ?`,
});

const RECENT_INTENT_TTL_MS = 15000;
const OPERATION_PERSIST_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FOUR;
const OPERATION_PERSIST_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;

const OPERATION_HANDLER = Object.freeze({
  [SERVICE_TYPE.PARTITION]: 'replica-handler',
  [SERVICE_TYPE.MESSAGE_GROUP]: 'message-group-handler',
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: 'runtime-service-handler',
});

const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SystemTableName).map((tableName) => `${tableName}-p1`),
);

const DEFAULT_MIN_REPLICA_COUNT = NUM.THREE;
const REPLICA_ID_SEPARATOR = '-r';
const REPLICA_ID_START_INDEX = NUM.ONE;
const DEFAULT_AMPLIFICATION_FACTOR = NUM.ONE;
const FAILURE_LOG_LEVEL = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});

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

    // In-memory dedupe guard for concurrent createOperation() calls.
    // This is an ephemeral lock (not an operation-state cache).
    this.operationsInCreation = new Map();
    this.operationsInExecution = new Map();
    this.recentOperationIntents = new Map();

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
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   * @private
   */
  async queryOperationById(operationId) {
    const result = await this.sqlQueryEngine.executeQuery(
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
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations() {
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_INCOMPLETE_OPERATIONS,
      [],
    );

    if (!result.success || !result.rows) {
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, {
        error: result.error,
        nodeId: this.nodeId,
      });
      return [];
    }

    return result.rows.map((row) => this.rowToOperation(row));
  }

  /**
   * Check for existing in-flight operation for entity/node combination.
   * Prevents duplicate operations (deduplication).
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
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE,
      [partitionId, targetNodeId, entityType, entityId],
    );

    if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {
      return null;
    }

    const operations = result.rows.map((row) => this.rowToOperation(row));
    return operations.find((operation) => {
      return this.operationMatchesMoveIntent(operation, move, entityType, entityId);
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

    return this.systemTableCache.filter(SystemTableName.SERVICES, (row) => {
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
      SystemTableName.REPLICA_OPERATIONS,
      (row) => {
        if (!row || TERMINAL_STATUSES.includes(row.status)) {
          return false;
        }
        const rowEntityType = row.entity_type || SERVICE_TYPE.PARTITION;
        const rowEntityId = row.entity_id || row.partition_id;
        return rowEntityType === entityType && rowEntityId === entityId;
      },
    ) || [];
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
   * @return {string} Allocated canonical replica ID.
   * @private
   */
  allocateCanonicalReplicaId({
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
    const inFlightRows = this.getEntityInFlightOperationRows({
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

    for (const row of inFlightRows) {
      const replicaId = row?.replica_id;
      if (typeof replicaId === 'string' && replicaId.length > 0) {
        usedReplicaIds.add(replicaId);
      }
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
   * Build a stable in-memory idempotency key for a move intent.
   * @param {Object} move - Move specification.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {string} Intent key.
   * @private
   */
  buildOperationIntentKey(move, entityType, entityId) {
    const normalizedType = (move?.type || '').toUpperCase();
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

    const operationType = (operation.type || '').toUpperCase();
    const moveType = (move.type || '').toUpperCase();
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
    this.pruneExpiredOperationIntents();

    const recentOperation = this.getRecentOperationIntent(dedupeKey);
    if (recentOperation) {
      return recentOperation;
    }

    const existingPromise = this.operationsInCreation.get(dedupeKey);
    if (existingPromise) {
      return existingPromise;
    }

    const creationPromise = this.createOperationInternal(move);
    this.operationsInCreation.set(dedupeKey, creationPromise);

    try {
      return await creationPromise;
    } finally {
      this.operationsInCreation.delete(dedupeKey);
    }
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move) {
    const entityType = move.entityType || SERVICE_TYPE.PARTITION;
    const entityId = move.entityId || move.partitionId;
    const partitionId = move.partitionId || entityId;
    const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);

    // Deduplication: check for existing in-flight operation
    const existing = await this.queryExistingInFlightOperation(
      partitionId,
      move.nodeId,
      entityType,
      entityId,
      move,
    );

    if (existing) {
      this.rememberOperationIntent(dedupeKey, existing);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, {
        existingOperationId: existing.operationId,
        partitionId: partitionId,
        targetNodeId: move.nodeId,
        type: move.type,
        entityType: entityType,
        entityId: entityId,
      });
      return existing;
    }

    const operationId = uuidv4();
    const sourceNodeId = move.type === OperationType.REPLACE ?
      (move.sourceNodeId || this.nodeId) :
      this.nodeId;
    const sourceReplicaId = move.type === OperationType.REPLACE ?
      (move.replicaId || null) :
      null;
    let operationReplicaId = move.replicaId || null;

    if (move.type === OperationType.ADD && !operationReplicaId) {
      operationReplicaId = this.allocateCanonicalReplicaId({
        partitionId,
        entityType,
        entityId,
      });
    }

    // Create operation using the helper from replica-status.js
    const operation = createOperationRecord({
      operationId,
      type: move.type,
      partitionId: partitionId,
      sourceNodeId,
      targetNodeId: move.nodeId,
      replicaId: operationReplicaId,
      sourceReplicaId,
    });
    operation.entityType = entityType;
    operation.entityId = entityId;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.CREATE_OPERATION, {
      operationId,
      type: move.type,
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
        move,
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
   * Persist a new operation via SQL engine.
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
      return result.changes > 0;
    }

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
      const result = await this.sqlQueryEngine.executeQuery(sql, params);
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
   * Create a storage reservation atomically with operation creation.
   * Delegates size estimation to the accounting service.
   * Requirements: 4.1
   *
   * @param {Object} operation - The persisted operation record.
   * @return {Promise<void>}
   * @private
   */
  async createReservationForOperation(operation) {
    if (!this.storageAccountingService) {
      return;
    }
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }

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
    if (!this.storageAccountingService) {
      return;
    }
    if (!this.isStorageIncreasingOperation(operation.type)) {
      return;
    }

    const now = Date.now();
    const result = await this.executeOperationMutationWithRetry(
      SQL.RELEASE_RESERVATION_BY_OPERATION,
      [
        RESERVATION_STATUS.RELEASED,
        now,
        now,
        operation.operationId,
        RESERVATION_STATUS.ACTIVE,
      ],
    );

    if (!result.success) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, {
          operationId: operation.operationId,
          error: result.error,
        });
      return;
    }

    this.stats.reservationsReleased++;

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASED, {
        operationId: operation.operationId,
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
    if (!this.storageAccountingService) {
      return {expired: NUM.ZERO, orphansReleased: NUM.ZERO};
    }

    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START,
    );

    const now = Date.now();
    let expired = NUM.ZERO;
    let orphansReleased = NUM.ZERO;

    // 1. Expire reservations past TTL
    const expireResult = await this.sqlQueryEngine.executeQuery(
      SQL.EXPIRE_STALE_RESERVATIONS,
      [
        RESERVATION_STATUS.EXPIRED,
        now,
        now,
        RESERVATION_STATUS.ACTIVE,
        now,
      ],
    );

    if (expireResult.success &&
        typeof expireResult.changes === 'number') {
      expired = expireResult.changes;
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
      [],
    );

    if (activeResult.success && activeResult.rows) {
      for (const row of activeResult.rows) {
        const op = await this.queryOperationById(row.operation_id);
        const isTerminal = !op ||
          TERMINAL_STATUSES.includes(op.status);
        if (isTerminal) {
          const releaseResult =
            await this.sqlQueryEngine.executeQuery(
              SQL.RELEASE_RESERVATION_BY_OPERATION,
              [
                RESERVATION_STATUS.RELEASED,
                now,
                now,
                row.operation_id,
                RESERVATION_STATUS.ACTIVE,
              ],
            );
          if (releaseResult.success) {
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
    if (operationId && this.operationsInExecution.has(operationId)) {
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING,
        operationId,
      };
    }

    const executionPromise = this.executeOperationInternal(operation);
    if (operationId) {
      this.operationsInExecution.set(operationId, executionPromise);
    }
    try {
      return await executionPromise;
    } finally {
      if (operationId) {
        this.operationsInExecution.delete(operationId);
      }
    }
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
          operation.replicaId = this.allocateCanonicalReplicaId({
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
   * Update operation workflow step.
   * Requirements: 4.3
   *
   * @param {Object} operation - Operation to update.
   * @param {string} step - New workflow step.
   * @return {Promise<void>}
   */
  async updateStep(operation, step) {
    const previousStep = operation.workflowStep;
    if (previousStep === step) {
      return;
    }
    const now = Date.now();

    operation.workflowStep = step;
    operation.updatedAt = now;
    operation.stepsHistory.push({step, timestamp: now});

    // Map workflow step to replica status
    operation.status = WORKFLOW_STEP_TO_STATUS[step] || operation.status;

    // Persist the update via SQL engine
    await this.persistOperationUpdate(operation);

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      status: operation.status,
      partitionId: operation.partitionId,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
      operation,
      previousStep,
      newStep: step,
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

    operation.workflowStep = finalStep;
    operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.stepsHistory.push({step: finalStep, timestamp: now});

    await this.persistOperationUpdate(operation);

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
      SystemTableName.SERVICES,
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
   * @param {string} nodeId - Node ID.
   * @return {boolean} True when node is READY with valid lease.
   * @private
   */
  isNodeReadyForRouting(nodeId) {
    if (!nodeId || !this.systemTableCache ||
        typeof this.systemTableCache.get !== 'function') {
      return false;
    }

    const nodeRow = this.systemTableCache.get(SystemTableName.NODES, nodeId);
    if (!nodeRow) {
      return false;
    }

    return isNodeRecordReady(nodeRow, {
      requireActiveStatus: true,
    });
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
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    const now = Date.now();
    const normalizedError = this.normalizeErrorMessage(errorMessage, 'Unknown error');
    const isSafetyBlocked = this.isSafetyPolicyFailure(normalizedError);
    const logLevel = options.logLevel ||
      (isSafetyBlocked ? FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR);
    const logMessage = options.logMessage ||
      (isSafetyBlocked ?
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY :
        REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED);

    operation.workflowStep = WORKFLOW_STEP.FAILED;
    operation.status = ReplicaStatus.FAILED;
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.errorMessage = normalizedError;
    operation.stepsHistory.push({step: WORKFLOW_STEP.FAILED, timestamp: now});

    await this.persistOperationUpdate(operation);

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

    // Query incomplete operations via SQL engine
    const incompleteOps = await this.queryIncompleteOperations();

    for (const operation of incompleteOps) {
      // Skip completed or failed operations
      if (isTerminalStep(operation.type, operation.workflowStep)) {
        continue;
      }

      // REPLACE operations transition from ACTIVE to STOPPING by dispatching
      // source removal once replacement activation is observed.
      if (operation.type === OperationType.REPLACE &&
          operation.workflowStep === WORKFLOW_STEP.ACTIVE) {
        await this.executeOperation(operation);
        continue;
      }

      const elapsed = now - operation.updatedAt;
      const timeout = this.getTimeoutForStep(operation.workflowStep);

      if (elapsed > timeout) {
        this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT, {
          operationId: operation.operationId,
          workflowStep: operation.workflowStep,
          elapsed,
          timeout,
        });

        await this.failOperation(
          operation,
          `Timeout in ${operation.workflowStep} step after ${elapsed}ms`,
        );

        this.stats.operationsTimedOut++;
      }
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
   * Handle node recovery - process incomplete operations.
   * Requirements: 7.1, 7.2, 7.3
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
      // Handle based on workflow step
      if (this.isPreSyncStep(op.workflowStep)) {
        // Mark PENDING, SENDING, CREATING as FAILED (Requirement 7.2)
        await this.failOperation(op, 'Node recovery - incomplete operation');
        result.markedFailed++;

        this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        });
      } else if (op.workflowStep === WORKFLOW_STEP.SYNCING) {
        // Reconcile SYNCING operations (Requirement 7.3)
        await this.reconcileSyncingOperation(op);
        result.reconciled++;
      } else if (op.workflowStep === WORKFLOW_STEP.STOPPING) {
        // STOPPING operations should also be marked as failed
        await this.failOperation(op, 'Node recovery - incomplete removal operation');
        result.markedFailed++;

        this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED, {
          operationId: op.operationId,
          workflowStep: op.workflowStep,
          partitionId: op.partitionId,
        });
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

    // Check actual replica status via SQL engine
    const actualStatus = await this.getActualReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );

    if (actualStatus === ReplicaStatus.ACTIVE) {
      // Replica is actually active - complete the operation
      await this.completeOperation(operation);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_ACTIVE, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === ReplicaStatus.FAILED) {
      // Replica failed - fail the operation
      await this.failOperation(operation, 'Replica failed during sync');
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_FAILED, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === null) {
      // Replica doesn't exist - fail the operation (orphaned operation)
      await this.failOperation(operation, 'Replica not found during recovery reconciliation');
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_FAILED_NOT_FOUND, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else {
      // Replica is still syncing or in another transitional state
      // Keep the operation in SYNCING state, timeout will handle it
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        actualStatus,
      });
    }
  }

  /**
   * Get actual replica status via SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * Requirements: 7.3
   *
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<string|null>} Replica status or null if not found.
   * @private
   */
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    // Try to find replica by replicaId first
    if (replicaId) {
      const result = await this.sqlQueryEngine.executeQuery(
        SQL.SELECT_REPLICA_STATUS,
        [replicaId],
      );

      if (result.success && result.rows && result.rows.length > NUM.ZERO) {
        return result.rows[NUM.ZERO].status;
      }
    }

    // Fall back to searching by partition and node
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_REPLICA_BY_PARTITION_NODE,
      [partitionId, targetNodeId],
    );

    if (result.success && result.rows && result.rows.length > NUM.ZERO) {
      return result.rows[NUM.ZERO].status;
    }

    return null;
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
    const result = await this.sqlQueryEngine.executeQuery(
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
    const result = await this.sqlQueryEngine.executeQuery(
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
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_IN_FLIGHT_BY_TYPE,
      [OperationType.REMOVE],
    );

    if (!result.success || !result.rows) {
      return NUM.ZERO;
    }

    return result.rows.length;
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
    this.operationsInExecution.clear();
    this.recentOperationIntents.clear();

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}

export {RebalanceCoordinator};
