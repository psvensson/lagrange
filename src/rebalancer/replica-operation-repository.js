/**
 * ReplicaOperationRepository — SQL/cache reads and writes, row <-> operation
 * translation for replica_operations.
 *
 * Extracted from RebalanceCoordinator per Design D7.1 / D7.3.
 * Requirements: 6.1, 6.4
 *
 * This is the single owner for:
 * - replica_operations SQL reads and writes
 * - replica_operations cache reads
 * - row <-> operation object translation
 * - operation field extraction helpers (terminal, owner, replace phases)
 * - replica status observation (cache + authoritative)
 * - entity service row lookups
 */

import {v4 as uuidv4} from 'uuid';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {
  WORKFLOW_STEP, NUM, ERRORS, TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  buildControlPlaneQueryOptions,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OPERATION_METADATA_KEY,
  TERMINAL_STATUSES,
  OperationType,
  isTerminalStep,
  isCoordinatorOwnedOperationType,
} from './replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  buildDivergenceEvent,
} from '../control-plane/read-model-contract.js';
import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../partition/partition-service-constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID:
    'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE source_node_id = ?
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`,
  SELECT_OPERATIONS_BY_PARTITION:
    'SELECT * FROM replica_operations WHERE partition_id = ?',
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
  SELECT_ALL_OPERATIONS:
    'SELECT * FROM replica_operations ORDER BY created_at DESC',
  INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id,
    target_node_id, status, workflow_step, created_at, updated_at,
    completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`,
  SELECT_REPLICA_STATUS:
    'SELECT status FROM services WHERE service_id = ?',
  SELECT_REPLICA_BY_PARTITION_NODE: `SELECT status FROM services 
    WHERE partition_id = ? AND node_id = ?`,
});

const OPERATION_PERSIST_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FOUR;
const OPERATION_PERSIST_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
const CDC_FALLBACK_PHASE_RECOVERY = 'recovery';
const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';
const INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS = TIME_MS.SECOND;
const INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS =
  TIME_MS.SECOND * NUM.TEN;
const INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD = 1000;
const COORDINATOR_OWNER_COMPONENT = 'RebalanceCoordinator';

function buildControlPlaneFailurePayload(nodeId, resultOrError) {
  return {
    error: resultOrError?.error || resultOrError?.message || null,
    nodeId,
    code: getControlPlaneErrorCode(resultOrError) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
  };
}

const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
});
const REPLICA_OPERATION_READ_QUERY_OPTIONS = Object.freeze({
  ...CONTROL_PLANE_QUERY_OPTIONS,
  readStrategy:
    CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  controlPlaneTableName:
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  controlPlaneOperationKind: 'read',
});
const RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES = Object.freeze([
  QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX,
]);
const RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES = Object.freeze([
  PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
]);

/**
 * ReplicaOperationRepository owns all SQL/cache access and row <-> operation
 * translation for replica_operations.
 *
 * The coordinator facade delegates persistence and query concerns here.
 * This class does NOT own workflow progression, admission, or intent dedup.
 */
class ReplicaOperationRepository {
  /**
   * @param {object} options
   * @param {string} options.nodeId
   * @param {object} options.systemTableCache
   * @param {object} options.cdcIntegrationService
   * @param {object} options.controlPlaneSystemTableGateway
   * @param {object} options.logger
   * @param {object} [options.emitter] - EventEmitter for divergence events
   */
  constructor(options) {
    this.nodeId = options.nodeId;
    this.systemTableCache = options.systemTableCache;
    this.cdcIntegrationService = options.cdcIntegrationService;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway;
    this.logger = options.logger;
    this.emitter = options.emitter || null;
    this.lastIncompleteOperationQueryWarningAtMs = NUM.ZERO;
    this.replicaOperationTransitionQueue = Promise.resolve();
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, 'systemTableCache')) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (Object.hasOwn(options, 'cdcIntegrationService')) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, 'controlPlaneSystemTableGateway')) {
      this.controlPlaneSystemTableGateway =
        options.controlPlaneSystemTableGateway || null;
    }
    if (Object.hasOwn(options, 'logger')) {
      this.logger = options.logger || console;
    }
  }

  // ── Row <-> Operation Translation ──────────────────────────────

  /**
   * Translate a raw SQL/cache row into a normalized operation object.
   * @param {object} row
   * @return {object}
   */
  rowToOperation(row) {
    let stepsHistory = [];
    if (row.steps_history) {
      try {
        stepsHistory = JSON.parse(row.steps_history);
      } catch (error) {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR,
          {
            operationId: row.operation_id,
            error: error.message,
          },
        );
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

    operation.sourceReplicaId =
      this.getReplaceSourceReplicaId(operation);
    return operation;
  }

  /**
   * Check whether an operation is in a terminal state.
   * Accepts both translated operation objects and raw rows.
   * @param {object} operation
   * @return {boolean}
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
   * Resolve the owner node ID from an operation or raw row.
   * @param {object} operation
   * @return {string|null}
   */
  resolveOperationOwnerNodeId(operation) {
    const sourceNodeId = String(
      operation?.sourceNodeId ||
        operation?.source_node_id || '',
    );
    if (sourceNodeId.length > NUM.ZERO) {
      return sourceNodeId;
    }

    const targetNodeId = String(
      operation?.targetNodeId ||
        operation?.target_node_id || '',
    );
    if (targetNodeId.length > NUM.ZERO) {
      return targetNodeId;
    }
    return null;
  }

  /**
   * Check whether an operation is owned by this node.
   * @param {object} operation
   * @return {boolean}
   */
  isOperationLocallyOwned(operation) {
    return this.resolveOperationOwnerNodeId(operation) ===
      this.nodeId;
  }

  /**
   * Extract the source replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceSourceReplicaId(operation) {
    if (!operation ||
        operation.type !== OperationType.REPLACE) {
      return null;
    }

    if (operation.sourceReplicaId) {
      return operation.sourceReplicaId;
    }

    if (!Array.isArray(operation.stepsHistory)) {
      return null;
    }

    for (const stepEntry of operation.stepsHistory) {
      const sourceReplicaId =
        stepEntry?.[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID];
      if (typeof sourceReplicaId === 'string' &&
          sourceReplicaId.length > 0) {
        return sourceReplicaId;
      }
    }

    return null;
  }

  /**
   * Check whether a REPLACE operation is in the remove phase.
   * @param {object} operation
   * @return {boolean}
   */
  isReplaceRemovePhase(operation) {
    return operation?.type === OperationType.REPLACE &&
      operation?.workflowStep === WORKFLOW_STEP.ACTIVE;
  }

  /**
   * Extract the target replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceTargetReplicaId(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return null;
    }
    const sourceReplicaId =
      this.getReplaceSourceReplicaId(operation);
    if (typeof operation?.replicaId !== 'string' ||
        operation.replicaId.length === 0) {
      return null;
    }
    if (operation.replicaId === sourceReplicaId) {
      return null;
    }
    return operation.replicaId;
  }

  // ── Cache Read Methods ──────────────────────────────────────────

  /**
   * Get a single replica_operations row from cache by operation ID.
   * @param {string} operationId
   * @return {object|null}
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
      return rows.find(
        (row) => row?.operation_id === operationId,
      ) || null;
    }
    return null;
  }

  /**
   * Filter replica_operations rows from cache using a predicate.
   * @param {Function} predicate
   * @return {Array|null} null when cache is unavailable
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
   * Get service rows for an entity from cache.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
   */
  getEntityServiceRows({partitionId, entityType, entityId}) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.filter !== 'function') {
      return [];
    }

    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) => {
        if (!row || row.service_type !== entityType) {
          return false;
        }

        if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
          return row.group_id === entityId;
        }

        if (entityType ===
            UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
          return row.service_id === entityId;
        }

        return row.partition_id === partitionId;
      },
    ) || [];
  }

  /**
   * Get in-flight operation rows for an entity from cache.
   * @param {object} params
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
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
        const rowEntityType =
          row.entity_type || SERVICE_TYPE.PARTITION;
        const rowEntityId =
          row.entity_id || row.partition_id;
        return rowEntityType === entityType &&
          rowEntityId === entityId;
      },
    ) || [];
  }

  // ── SQL Read Methods ────────────────────────────────────────────

  /**
   * Execute a read query against the replica_operations table.
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<object>}
   */
  async executeReplicaOperationsRead(sql, params = []) {
    return this.controlPlaneSystemTableGateway.readRows(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      sql,
      params,
      REPLICA_OPERATION_READ_QUERY_OPTIONS,
    );
  }

  /**
   * Query a single operation by ID (cache-first, SQL fallback).
   * @param {string} operationId
   * @return {Promise<object|null>}
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

    if (!result.success || !result.rows ||
        result.rows.length === NUM.ZERO) {
      return null;
    }

    const operation =
      this.rowToOperation(result.rows[NUM.ZERO]);
    return isCoordinatorOwnedOperationType(operation?.type) ?
      operation :
      null;
  }

  /**
   * Query all incomplete (in-flight) operations owned by this node.
   * @param {object} [options={}]
   * @param {boolean} [options.skipSqlFallbackWhenCacheEmpty]
   * @return {Promise<Array>}
   */
  async queryIncompleteOperations(options = {}) {
    const skipSqlFallbackWhenCacheEmpty =
      options.skipSqlFallbackWhenCacheEmpty === true;
    const mapAndSortOperations = (rows) => rows
      .map((row) => this.rowToOperation(row))
      .filter((operation) =>
        isCoordinatorOwnedOperationType(operation?.type) &&
        !this.isOperationTerminal(operation),
      )
      .sort((left, right) => {
        const leftUpdatedAt =
          Number(left?.updatedAt) || NUM.ZERO;
        const rightUpdatedAt =
          Number(right?.updatedAt) || NUM.ZERO;
        if (leftUpdatedAt !== rightUpdatedAt) {
          return leftUpdatedAt - rightUpdatedAt;
        }
        return String(left?.operationId || '').localeCompare(
          String(right?.operationId || ''),
        );
      });

    const cachedRows =
      this.filterReplicaOperationRowsFromCache((row) => {
        if (!row || row.source_node_id !== this.nodeId) {
          return false;
        }
        if (!isCoordinatorOwnedOperationType(row.type)) {
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
      const cachedOperations =
        mapAndSortOperations(cachedRows);
      if (cachedOperations.length > NUM.ZERO ||
          skipSqlFallbackWhenCacheEmpty) {
        return cachedOperations;
      }
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
    const rowCount = Array.isArray(result?.rows) ?
      result.rows.length :
      NUM.ZERO;

    if (!result.success || !result.rows) {
      const logPayload =
        buildControlPlaneFailurePayload(this.nodeId, result);
      if (isRetryableControlPlaneError(result)) {
        this.logger.warn(
          REBALANCE_COORDINATOR_LOG_MSG
            .QUERY_OPERATIONS_FAILED,
          logPayload,
        );
      } else {
        this.logger.error(
          REBALANCE_COORDINATOR_LOG_MSG
            .QUERY_OPERATIONS_FAILED,
          logPayload,
        );
      }
      return [];
    }

    const shouldWarnOnQueryPressure =
      queryDurationMs >=
        INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS ||
      rowCount >=
        INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD;
    if (shouldWarnOnQueryPressure) {
      const nowMs = Date.now();
      if (
        nowMs -
          this.lastIncompleteOperationQueryWarningAtMs >=
        INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS
      ) {
        this.lastIncompleteOperationQueryWarningAtMs = nowMs;
        this.logger.warn(
          'In-flight operation owner query indicates' +
            ' control-plane pressure',
          {
            nodeId: this.nodeId,
            queryDurationMs,
            rowCount,
          },
        );
      }
    }

    return mapAndSortOperations(result.rows);
  }

  /**
   * Query for an existing in-flight operation matching a move intent.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} move
   * @param {Function} operationMatchesMoveIntent
   * @return {Promise<object|null>}
   */
  async queryExistingInFlightOperation(
    partitionId,
    targetNodeId,
    entityType,
    entityId,
    move,
    operationMatchesMoveIntent,
  ) {
    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE,
      [partitionId, targetNodeId, entityType, entityId],
    );

    if (result.success && Array.isArray(result.rows)) {
      if (result.rows.length === NUM.ZERO) {
        return null;
      }

      const operations =
        result.rows.map((row) => this.rowToOperation(row));
      return operations.find((operation) => {
        return !this.isOperationTerminal(operation) &&
          operationMatchesMoveIntent(
            operation, move, entityType, entityId,
          );
      }) || null;
    }

    // Fallback path for degraded SQL-read conditions.
    const cachedRows =
      this.filterReplicaOperationRowsFromCache((row) => {
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
    if (cachedRows === null) {
      return null;
    }

    const cachedOperations =
      cachedRows.map((row) => this.rowToOperation(row));
    return cachedOperations.find((operation) => {
      return !this.isOperationTerminal(operation) &&
        operationMatchesMoveIntent(
          operation, move, entityType, entityId,
        );
    }) || null;
  }

  /**
   * Get in-flight replica IDs for an entity.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Set<string>>}
   */
  async getEntityInFlightReplicaIds(
    {partitionId, entityType, entityId},
  ) {
    const replicaIds = new Set();
    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_OPERATIONS_BY_ENTITY,
      [entityType, entityId, entityId],
    );

    if (result.success && Array.isArray(result.rows)) {
      for (const row of result.rows) {
        const operation = this.rowToOperation(row);
        if (!operation ||
            this.isOperationTerminal(operation)) {
          continue;
        }

        const replicaId = operation.replicaId;
        if (typeof replicaId === 'string' &&
            replicaId.length > NUM.ZERO) {
          replicaIds.add(replicaId);
        }
      }
      return replicaIds;
    }

    // Fallback path for degraded SQL-read conditions.
    const cachedRows =
      this.filterReplicaOperationRowsFromCache((row) => {
        if (!row) {
          return false;
        }
        return (row.entity_type === entityType &&
          row.entity_id === entityId) ||
          ((row.entity_type === null ||
            row.entity_type === undefined ||
            row.entity_type === '') &&
            row.partition_id === partitionId);
      });
    if (cachedRows === null) {
      return replicaIds;
    }

    for (const row of cachedRows) {
      const operation = this.rowToOperation(row);
      if (!operation ||
          this.isOperationTerminal(operation)) {
        continue;
      }
      const replicaId = operation.replicaId;
      if (typeof replicaId === 'string' &&
          replicaId.length > NUM.ZERO) {
        replicaIds.add(replicaId);
      }
    }

    return replicaIds;
  }

  /**
   * Get all operations (cache-first, SQL fallback).
   * @return {Promise<Array>}
   */
  async getAllOperations() {
    const cachedRows =
      this.filterReplicaOperationRowsFromCache(() => true);
    if (cachedRows !== null) {
      return [...cachedRows]
        .sort((left, right) => {
          const leftCreatedAt =
            Number(left?.created_at) || NUM.ZERO;
          const rightCreatedAt =
            Number(right?.created_at) || NUM.ZERO;
          if (leftCreatedAt !== rightCreatedAt) {
            return rightCreatedAt - leftCreatedAt;
          }
          return String(
            right?.operation_id || '',
          ).localeCompare(
            String(left?.operation_id || ''),
          );
        })
        .map((row) => this.rowToOperation(row));
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_ALL_OPERATIONS,
      [],
    );

    if (!result.success || !result.rows) {
      return [];
    }

    return result.rows.map((row) => this.rowToOperation(row));
  }

  /**
   * Get operations for an entity (cache-first, SQL fallback).
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Array>}
   */
  async getOperationsByEntity(entityType, entityId) {
    const cachedRows =
      this.filterReplicaOperationRowsFromCache((row) => {
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
      return cachedRows.map(
        (row) => this.rowToOperation(row),
      );
    }

    const result = await this.executeReplicaOperationsRead(
      SQL.SELECT_OPERATIONS_BY_ENTITY,
      [entityType, entityId, entityId],
    );

    if (!result.success || !result.rows) {
      return [];
    }

    return result.rows.map(
      (row) => this.rowToOperation(row),
    );
  }

  /**
   * Get count of non-terminal REMOVE operations.
   * @return {Promise<number>}
   */
  async getConcurrentRemoveCount() {
    const cachedRows =
      this.filterReplicaOperationRowsFromCache(
        (row) => row?.type === OperationType.REMOVE,
      );
    if (cachedRows !== null) {
      return cachedRows
        .map((row) => this.rowToOperation(row))
        .filter((op) => !this.isOperationTerminal(op))
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
      .filter((op) => !this.isOperationTerminal(op))
      .length;
  }

  // ── SQL Write Methods ───────────────────────────────────────────

  /**
   * Persist a new operation row via SQL INSERT.
   * @param {object} operation
   * @return {Promise<boolean>}
   */
  async persistNewOperation(operation) {
    return this.runReplicaOperationTransitionExclusive(
      async () => {
        const result =
          await this.executeOperationMutationWithRetry(
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
            {
              ownerId: operation.operationId,
            },
          );

        if (!result.success) {
          this.logger.error(
            REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
            {
              operationId: operation.operationId,
              error: result.error,
            },
          );
          throw new Error(result.error);
        }

        if (typeof result.changes === 'number') {
          await this.waitForReplicaOperationCacheVisibility(
            operation,
          );
          return result.changes > 0;
        }

        await this.waitForReplicaOperationCacheVisibility(
          operation,
        );
        return true;
      },
    );
  }

  /**
   * Persist an operation update via SQL UPDATE.
   * @param {object} operation
   * @param {object} [options]
   * @param {string} [options.sessionId]
   * @return {Promise<void>}
   */
  async persistOperationUpdate(operation, options = {}) {
    const result =
      await this.executeOperationMutationWithRetry(
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
        {
          ownerId: operation.operationId,
          sessionId: options.sessionId,
        },
      );

    if (!result.success) {
      this.logger.error(
        REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
        {
          operationId: operation.operationId,
          error: result.error,
        },
      );
      throw new Error(result.error);
    }

    await this.waitForReplicaOperationCacheVisibility(
      operation,
    );
  }

  /**
   * Wait for a persisted operation to become visible in cache.
   * @param {object} operation
   * @return {Promise<void>}
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    if (!operation?.operationId ||
        !this.cdcIntegrationService ||
        typeof this.cdcIntegrationService
          .waitForCacheUpdate !== 'function') {
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
    if (operation.replicaId !== null &&
        operation.replicaId !== undefined) {
      expectedFields.replica_id = operation.replicaId;
    }
    const expectedCacheFields =
      Object.keys(expectedFields).length > NUM.ZERO ?
        expectedFields :
        undefined;
    const minimumCacheFields =
      Object.keys(minimumFields).length > NUM.ZERO ?
        minimumFields :
        undefined;
    try {
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
      return;
    } catch (error) {
      if (!this.isCacheVisibilityGapError(error)) {
        throw error;
      }

      const observedOperation =
        await this.queryOperationById(operation.operationId);
      if (this.isReplicaOperationVisibilitySatisfied(
        operation,
        observedOperation,
      )) {
        return;
      }
      throw error;
    }
  }

  /**
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */
  isCacheVisibilityGapError(error) {
    return String(error?.message || '')
      .includes(CACHE_VISIBILITY_ERROR_FRAGMENT);
  }

  /**
   * @param {object} expectedOperation
   * @param {object|null} observedOperation
   * @return {boolean}
   * @private
   */
  isReplicaOperationVisibilitySatisfied(
    expectedOperation,
    observedOperation,
  ) {
    if (!observedOperation ||
        observedOperation.operationId !== expectedOperation.operationId) {
      return false;
    }
    if (expectedOperation.replicaId !== null &&
        expectedOperation.replicaId !== undefined &&
        observedOperation.replicaId !== expectedOperation.replicaId) {
      return false;
    }
    if (Number.isFinite(expectedOperation.updatedAt) &&
        Number(observedOperation.updatedAt) < expectedOperation.updatedAt) {
      return false;
    }
    if (Number.isFinite(expectedOperation.completedAt) &&
        Number(observedOperation.completedAt) <
          expectedOperation.completedAt) {
      return false;
    }
    return true;
  }

  /**
   * Execute a mutation query with bounded retry on transient errors.
   * @param {string} sql
   * @param {Array} params
   * @param {object} [options]
   * @return {Promise<object>}
   */
  async executeOperationMutationWithRetry(
    sql, params, options = {},
  ) {
    const startedAt = Date.now();
    const queryOptions =
      this.buildOperationMutationQueryOptions(options);
    while (true) {
      const result =
        await this.controlPlaneSystemTableGateway
          .executeQuery(sql, params, queryOptions);
      if (result.success ||
          !this.isRetryableOperationPersistError(
            result.error,
          )) {
        return result;
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs =
        OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs;
      if (remainingMs <= NUM.ZERO) {
        return result;
      }

      const waitMs = Math.min(
        OPERATION_PERSIST_RETRY_DELAY_MS, remainingMs,
      );
      await this.waitForOperationPersistRetry(waitMs);
    }
  }

  /**
   * Check whether a persist error is retryable.
   * @param {string} errorMessage
   * @return {boolean}
   */
  isRetryableOperationPersistError(errorMessage) {
    return typeof errorMessage === 'string' &&
      (
        errorMessage.includes(
          ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
        ) ||
        errorMessage.includes(
          ERRORS.PARTITION_SERVICE_NOT_FOUND,
        ) ||
        RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES
          .includes(errorMessage) ||
        RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES
          .some((prefix) => errorMessage.startsWith(prefix))
      );
  }

  /**
   * Wait before retrying a failed persist.
   * @param {number} delayMs
   * @return {Promise<void>}
   */
  async waitForOperationPersistRetry(delayMs) {
    await new Promise(
      (resolve) => setTimeout(resolve, delayMs),
    );
  }

  /**
   * Build query options for an operation mutation.
   * @param {object} [options]
   * @return {object}
   */
  buildOperationMutationQueryOptions(options = {}) {
    const ownerId =
      typeof options.ownerId === 'string' &&
        options.ownerId.length > NUM.ZERO ?
        options.ownerId :
        null;
    return {
      ...CONTROL_PLANE_QUERY_OPTIONS,
      sessionId:
        this.resolveOperationMutationSessionId(options),
      deliveryPriority: 'critical',
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      controlPlaneTableName:
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      controlPlaneOperationKind: 'write',
      ...(ownerId ?
        {coalescingKey:
          `replica-operation:${ownerId}`} : {}),
    };
  }

  /**
   * Resolve a session ID for an operation mutation.
   * @param {object} [options]
   * @return {string}
   */
  resolveOperationMutationSessionId(options = {}) {
    if (typeof options.sessionId === 'string' &&
        options.sessionId.length > NUM.ZERO) {
      return options.sessionId;
    }
    const ownerId =
      typeof options.ownerId === 'string' &&
        options.ownerId.length > NUM.ZERO ?
        options.ownerId :
        uuidv4();
    return `${REBALANCER_SUBSYSTEM.COORDINATOR}:${ownerId}`;
  }

  /**
   * Extract the change count from a mutation result.
   * @param {object} result
   * @return {number|null}
   */
  extractMutationChangeCount(result) {
    const candidate =
      Number(result?.changes ?? result?.affectedRows);
    return Number.isFinite(candidate) ? candidate : null;
  }

  /**
   * Serialize replica operation transitions through a queue.
   * @param {Function} executionFactory
   * @return {Promise}
   */
  runReplicaOperationTransitionExclusive(executionFactory) {
    const queuedExecution =
      this.replicaOperationTransitionQueue
        .catch(() => {})
        .then(async () => executionFactory());
    this.replicaOperationTransitionQueue =
      queuedExecution.catch(() => {});
    return queuedExecution;
  }

  // ── Replica Status Observation ──────────────────────────────────

  /**
   * Get observed replica status from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   */
  getObservedReplicaStatusFromCache(
    replicaId, partitionId, targetNodeId,
  ) {
    if (!this.systemTableCache) {
      return null;
    }

    const normalizedReplicaId =
      typeof replicaId === 'string' ? replicaId : '';
    const normalizedPartitionId =
      typeof partitionId === 'string' ? partitionId : '';
    const normalizedTargetNodeId =
      typeof targetNodeId === 'string' ? targetNodeId : '';

    const normalizeRowStatus = (row) => {
      const status = row?.status;
      return typeof status === 'string' &&
        status.length > NUM.ZERO ?
        status :
        null;
    };
    const rowMatchesTarget = (row) => {
      if (!row || typeof row !== 'object') {
        return false;
      }

      const rowNodeId =
        String(row.node_id || row.nodeId || '');
      if (normalizedTargetNodeId.length > NUM.ZERO &&
          rowNodeId.length > NUM.ZERO &&
          rowNodeId !== normalizedTargetNodeId) {
        return false;
      }

      const rowPartitionId =
        String(row.partition_id || row.partitionId || '');
      if (normalizedPartitionId.length > NUM.ZERO &&
          rowPartitionId.length > NUM.ZERO &&
          rowPartitionId !== normalizedPartitionId) {
        return false;
      }

      return true;
    };
    const readAllServiceRows = () => {
      if (typeof this.systemTableCache.getAll ===
          'function') {
        return this.systemTableCache.getAll(
          SYSTEM_TABLE_NAME.SERVICES,
        ) || [];
      }
      if (typeof this.systemTableCache.filter ===
          'function') {
        return this.systemTableCache.filter(
          SYSTEM_TABLE_NAME.SERVICES,
          () => true,
        ) || [];
      }
      return [];
    };

    if (normalizedReplicaId.length > NUM.ZERO &&
        typeof this.systemTableCache.get === 'function') {
      const cachedRow = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        normalizedReplicaId,
      );
      if (rowMatchesTarget(cachedRow)) {
        const observedStatus =
          normalizeRowStatus(cachedRow);
        if (observedStatus) {
          return observedStatus;
        }
      }
    }

    const serviceRows = readAllServiceRows();
    if (normalizedReplicaId.length > NUM.ZERO) {
      const exactReplicaRow = serviceRows.find((row) => {
        const rowReplicaId = String(
          row?.service_id || row?.serviceId ||
            row?.replica_id || row?.replicaId || '',
        );
        return rowReplicaId === normalizedReplicaId &&
          rowMatchesTarget(row);
      });
      const observedStatus =
        normalizeRowStatus(exactReplicaRow);
      if (observedStatus) {
        return observedStatus;
      }
    }

    const partitionNodeRow = serviceRows.find((row) => {
      const rowNodeId =
        String(row?.node_id || row?.nodeId || '');
      const rowPartitionId = String(
        row?.partition_id || row?.partitionId || '',
      );
      return rowNodeId === normalizedTargetNodeId &&
        rowPartitionId === normalizedPartitionId;
    });
    return normalizeRowStatus(partitionNodeRow);
  }

  /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */
  async getActualReplicaStatus(
    replicaId, partitionId, targetNodeId,
  ) {
    if (replicaId) {
      const result =
        await this.controlPlaneSystemTableGateway.readRows(
          SYSTEM_TABLE_NAME.SERVICES,
          SQL.SELECT_REPLICA_STATUS,
          [replicaId],
          CONTROL_PLANE_QUERY_OPTIONS,
        );

      if (result.success && result.rows &&
          result.rows.length > NUM.ZERO) {
        return result.rows[NUM.ZERO].status;
      }
    }

    // Secondary lookup by partition + node when replicaId
    // yields no row
    const result =
      await this.controlPlaneSystemTableGateway.readRows(
        SYSTEM_TABLE_NAME.SERVICES,
        SQL.SELECT_REPLICA_BY_PARTITION_NODE,
        [partitionId, targetNodeId],
        CONTROL_PLANE_QUERY_OPTIONS,
      );

    if (result.success && result.rows &&
        result.rows.length > NUM.ZERO) {
      return result.rows[NUM.ZERO].status;
    }

    return this.getObservedReplicaStatusFromCache(
      replicaId,
      partitionId,
      targetNodeId,
    );
  }

  /**
   * Emit a read-model divergence event when cache and
   * authoritative status disagree.
   * @param {string} replicaId
   * @param {string} authoritativeStatus
   * @param {string} reason
   */
  emitReplicaStatusDivergence(
    replicaId, authoritativeStatus, reason,
  ) {
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
      cacheValue: cachedStatus ?
        {status: cachedStatus} : null,
      authoritativeValue: authoritativeStatus ?
        {status: authoritativeStatus} : null,
      divergentFields: ['status'],
    });

    this.logger.warn(
      REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE,
      event,
    );
    if (this.emitter) {
      this.emitter.emit(
        REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE,
        event,
      );
    }
  }
}

export {ReplicaOperationRepository, SQL};
