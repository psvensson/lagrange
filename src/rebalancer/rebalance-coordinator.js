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
import {WORKFLOW_STEP, NUM} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  ReplicaStatus,
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
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations 
    WHERE status NOT IN ('active', 'removed', 'failed')`,
  SELECT_OPERATIONS_BY_PARTITION: 'SELECT * FROM replica_operations WHERE partition_id = ?',
  SELECT_IN_FLIGHT_FOR_PARTITION_NODE: `SELECT * FROM replica_operations 
    WHERE partition_id = ? AND target_node_id = ? 
    AND status NOT IN ('active', 'removed', 'failed')`,
  SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ? AND status NOT IN ('active', 'removed', 'failed')`,
  INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
    status, workflow_step, created_at, updated_at, completed_at, error_message, steps_history
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`,
  SELECT_REPLICA_STATUS: 'SELECT status FROM services WHERE service_id = ?',
  SELECT_REPLICA_BY_PARTITION_NODE: `SELECT status FROM services 
    WHERE partition_id = ? AND node_id = ?`,
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
    };

    // Timeout checking interval
    this.timeoutCheckInterval = null;
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
    };

    this.initialized = false;
  }

  /**
   * Initialize the coordinator.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

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
      this.checkTimeouts().catch((error) => {
        this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, {
          error: error.message,
          nodeId: this.nodeId,
        });
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
   * Check for existing in-flight operation for partition/node combination.
   * Prevents duplicate operations (deduplication).
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object|null>} Existing operation or null.
   * @private
   */
  async queryExistingInFlightOperation(partitionId, targetNodeId) {
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_IN_FLIGHT_FOR_PARTITION_NODE,
      [partitionId, targetNodeId],
    );

    if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {
      return null;
    }

    return this.rowToOperation(result.rows[NUM.ZERO]);
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

    return {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
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
  }


  /**
   * Create an operation record (persisted via SQL engine).
   * Includes deduplication check to prevent duplicate operations.
   * Requirements: 2.2, 2.3
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type: 'ADD' or 'REMOVE'.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} move.nodeId - Target node ID.
   * @param {string} [move.replicaId] - Replica ID (for REMOVE operations).
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    // Deduplication: check for existing in-flight operation
    const existing = await this.queryExistingInFlightOperation(
      move.partitionId,
      move.nodeId,
    );

    if (existing) {
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, {
        existingOperationId: existing.operationId,
        partitionId: move.partitionId,
        targetNodeId: move.nodeId,
        type: move.type,
      });
      return existing;
    }

    const operationId = uuidv4();

    // Create operation using the helper from replica-status.js
    const operation = createOperationRecord({
      operationId,
      type: move.type,
      partitionId: move.partitionId,
      sourceNodeId: this.nodeId,
      targetNodeId: move.nodeId,
      replicaId: move.replicaId,
    });

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.CREATE_OPERATION, {
      operationId,
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
    });

    // Persist via SQL engine (writes to partition leader)
    await this.persistNewOperation(operation);

    this.stats.operationsCreated++;

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, {operation});

    return operation;
  }

  /**
   * Persist a new operation via SQL engine.
   * @param {Object} operation - Operation to persist.
   * @return {Promise<void>}
   * @private
   */
  async persistNewOperation(operation) {
    const result = await this.sqlQueryEngine.executeQuery(
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
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation) {
    const result = await this.sqlQueryEngine.executeQuery(
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
   * Execute an operation (ADD or REMOVE).
   * Uses MessageRouter delivery to the target node.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    if (!this.messageRouter) {
      throw new Error(REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING);
    }

    // Update to SENDING step
    await this.updateStep(operation, WORKFLOW_STEP.SENDING);

    const target = `${operation.targetNodeId}/service/replica-handler`;
    const messageType = operation.type === OperationType.ADD ?
      ReplicaOperationMessageType.CREATE_REPLICA :
      ReplicaOperationMessageType.REMOVE_REPLICA;
    const request = {
      [ReplicaOperationField.TYPE]: messageType,
      [ReplicaOperationField.OPERATION_ID]: operation.operationId,
      [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
      [ReplicaOperationField.REPLICA_ID]: operation.replicaId,
      [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
    };

    this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION, {
      operationId: operation.operationId,
      target,
      type: messageType,
    });

    const response = await this.messageRouter.deliver(
      target,
      request,
      {targetNodeId: operation.targetNodeId},
    );

    if (!response.acknowledged) {
      const errorMsg = response.error || REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED;
      await this.failOperation(operation, errorMsg);
      return {
        success: false,
        operationId: operation.operationId,
        error: errorMsg,
      };
    }

    if (response.status === ReplicaOperationResponseStatus.INITIATED ||
        response.status === ReplicaOperationResponseStatus.IN_PROGRESS) {
      // Update to CREATING or STOPPING step based on operation type
      const nextStep = operation.type === OperationType.ADD ?
        WORKFLOW_STEP.CREATING :
        WORKFLOW_STEP.STOPPING;
      await this.updateStep(operation, nextStep);

      return {
        success: true,
        operationId: operation.operationId,
        status: 'in_progress',
      };
    } else if (response.status === ReplicaOperationResponseStatus.ALREADY_EXISTS) {
      // Replica already exists - mark as complete
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.ALREADY_EXISTS,
      };
    } else if (response.status === ReplicaOperationResponseStatus.COMPLETED) {
      // Operation completed immediately
      await this.completeOperation(operation);
      return {
        success: true,
        operationId: operation.operationId,
        status: ReplicaOperationResponseStatus.COMPLETED,
      };
    } else {
      // Error response
      const errorMsg = response.error || 'Unknown error';
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

    this.stats.operationsCompleted++;

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {operation});
  }

  /**
   * Fail an operation.
   * Requirements: 6.2
   *
   * @param {Object} operation - Operation to fail.
   * @param {string} errorMessage - Error message.
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage) {
    const now = Date.now();

    operation.workflowStep = WORKFLOW_STEP.FAILED;
    operation.status = ReplicaStatus.FAILED;
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.errorMessage = errorMessage;
    operation.stepsHistory.push({step: WORKFLOW_STEP.FAILED, timestamp: now});

    await this.persistOperationUpdate(operation);

    this.stats.operationsFailed++;

    this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED, {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      errorMessage,
    });

    this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, {operation, errorMessage});
  }


  /**
   * Check for timed out operations.
   * Queries operations via SQL engine (no in-memory cache).
   * Requirements: 6.2
   * @private
   */
  async checkTimeouts() {
    const now = Date.now();

    // Query incomplete operations via SQL engine
    const incompleteOps = await this.queryIncompleteOperations();

    for (const operation of incompleteOps) {
      // Skip completed or failed operations
      if (isTerminalStep(operation.type, operation.workflowStep)) {
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
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_OPERATIONS_BY_PARTITION,
      [partitionId],
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
    const result = await this.sqlQueryEngine.executeQuery(
      SQL.SELECT_IN_FLIGHT_BY_TYPE,
      [OperationType.ADD],
    );

    if (!result.success || !result.rows) {
      return NUM.ZERO;
    }

    return result.rows.length;
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
    const inFlightOps = await this.getInFlightOperations();

    this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
      inFlightOperations: inFlightOps.length,
    });

    this.stopTimeoutChecking();

    this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
  }
}

export {RebalanceCoordinator};
