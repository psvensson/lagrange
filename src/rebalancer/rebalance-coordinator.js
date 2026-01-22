/**
 * RebalanceCoordinator - Owns the complete rebalancing workflow.
 *
 * Consolidates functionality from UnifiedRebalancer, ReplicaStateMachine,
 * and the coordination parts of ReplicaLifecycleManager.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';
import {
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  isTerminalStep,
  createOperation as createOperationRecord,
} from './replica-status.js';

/**
 * RebalanceCoordinator manages the complete rebalancing workflow.
 * Single source of truth for operation state.
 */
class RebalanceCoordinator extends EventEmitter {
  /**
   * Create a new RebalanceCoordinator instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.rpcClient - RPC client for remote calls.
   * @param {Object} options.tablePolicyService - Optional TablePolicyService for policy lookup.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.rpcClient = options.rpcClient || null;
    this.tablePolicyService = options.tablePolicyService || null;

    // Single source of truth for operations (in-memory cache)
    this.operations = new Map(); // operation_id -> Operation

    // Configuration (centralized) - Requirements 6.1, 6.4
    const configManager = ConfigurationManager.getInstance();
    this.config = {
      pendingTimeoutMs: configManager.get('rebalancer.pendingTimeoutMs') || 30000,
      creatingTimeoutMs: configManager.get('rebalancer.creatingTimeoutMs') || 60000,
      syncingTimeoutMs: configManager.get('rebalancer.syncingTimeoutMs') || 300000,
      removingTimeoutMs: configManager.get('rebalancer.removingTimeoutMs') || 60000,
      maxConcurrentAdds: configManager.get('rebalancer.maxConcurrentAdds') || 5,
      maxConcurrentRemoves: configManager.get('rebalancer.maxConcurrentRemoves') || 5,
      periodicCheckIntervalMs: configManager.get('rebalancer.periodicCheckIntervalMs') || 60000,
    };

    // Timeout checking interval
    this.timeoutCheckInterval = null;
    this.timeoutCheckIntervalMs = 5000; // Check every 5 seconds

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('rebalance-coordinator') : console;

    // Statistics
    this.stats = {
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
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

    this.logger.info('RebalanceCoordinator initialized', {
      nodeId: this.nodeId,
      config: this.config,
    });

    // Start timeout checking
    this.startTimeoutChecking();

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
      this.checkTimeouts();
    }, this.timeoutCheckIntervalMs);
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
   * Create an operation record (persisted to operation log).
   * Requirements: 2.2, 2.3
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type: 'ADD' or 'REMOVE'.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} move.nodeId - Target node ID.
   * @param {string} [move.replicaId] - Replica ID (for REMOVE operations).
   * @return {Promise<Object>} Created operation record.
   */
  async createOperation(move) {
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

    this.logger.info('Creating operation', {
      operationId,
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
    });

    // Persist to operation log
    await this.persistOperation(operation);

    // Store in memory
    this.operations.set(operationId, operation);

    this.stats.operationsCreated++;

    this.emit('operationCreated', {operation});

    return operation;
  }

  /**
   * Execute an operation (ADD or REMOVE).
   * Uses RPC for request-response over message groups.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    if (!this.rpcClient) {
      throw new Error('RPC client not configured');
    }

    try {
      // Update to SENDING step
      await this.updateStep(operation, 'SENDING');

      const target = `${operation.targetNodeId}/replica-handler`;
      const request = {
        type: operation.type === OperationType.ADD ? 'CREATE_REPLICA' : 'REMOVE_REPLICA',
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        replicaId: operation.replicaId,
        sourceNodeId: operation.sourceNodeId,
      };

      const timeoutMs = operation.type === OperationType.ADD ?
        this.config.creatingTimeoutMs :
        this.config.removingTimeoutMs;

      this.logger.debug('Sending RPC request', {
        operationId: operation.operationId,
        target,
        type: request.type,
      });

      const response = await this.rpcClient.call(target, request, {timeout: timeoutMs});

      if (response.status === 'initiated' || response.status === 'in_progress') {
        // Update to CREATING or STOPPING step based on operation type
        const nextStep = operation.type === OperationType.ADD ? 'CREATING' : 'STOPPING';
        await this.updateStep(operation, nextStep);

        // For ADD operations, we'll wait for sync completion via CDC or polling
        // For REMOVE operations, we'll wait for removal confirmation
        return {
          success: true,
          operationId: operation.operationId,
          status: 'in_progress',
        };
      } else if (response.status === 'already_exists') {
        // Replica already exists - mark as complete
        await this.completeOperation(operation);
        return {
          success: true,
          operationId: operation.operationId,
          status: 'already_exists',
        };
      } else if (response.status === 'completed') {
        // Operation completed immediately
        await this.completeOperation(operation);
        return {
          success: true,
          operationId: operation.operationId,
          status: 'completed',
        };
      } else {
        // Error response
        await this.failOperation(operation, response.error || 'Unknown error');
        return {
          success: false,
          operationId: operation.operationId,
          error: response.error,
        };
      }
    } catch (error) {
      await this.failOperation(operation, error.message);
      return {
        success: false,
        operationId: operation.operationId,
        error: error.message,
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

    // Persist the update
    await this.persistOperation(operation);

    this.logger.info('Operation step changed', {
      operationId: operation.operationId,
      previousStep,
      newStep: step,
      status: operation.status,
      partitionId: operation.partitionId,
    });

    this.emit('stepChanged', {
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
    const finalStep = operation.type === OperationType.ADD ? 'ACTIVE' : 'REMOVED';

    operation.workflowStep = finalStep;
    operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.stepsHistory.push({step: finalStep, timestamp: now});

    await this.persistOperation(operation);

    this.stats.operationsCompleted++;

    this.logger.info('Operation completed', {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    this.emit('operationCompleted', {operation});
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

    operation.workflowStep = 'FAILED';
    operation.status = ReplicaStatus.FAILED;
    operation.updatedAt = now;
    operation.completedAt = now;
    operation.errorMessage = errorMessage;
    operation.stepsHistory.push({step: 'FAILED', timestamp: now});

    await this.persistOperation(operation);

    this.stats.operationsFailed++;

    this.logger.error('Operation failed', {
      operationId: operation.operationId,
      type: operation.type,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
      errorMessage,
    });

    this.emit('operationFailed', {operation, errorMessage});
  }

  /**
   * Check for timed out operations.
   * Requirements: 6.2
   * @private
   */
  async checkTimeouts() {
    const now = Date.now();

    for (const [_operationId, operation] of this.operations) {
      // Skip completed or failed operations
      if (isTerminalStep(operation.type, operation.workflowStep)) {
        continue;
      }

      const elapsed = now - operation.updatedAt;
      const timeout = this.getTimeoutForStep(operation.workflowStep);

      if (elapsed > timeout) {
        this.logger.warn('Operation timed out', {
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
    case 'PENDING':
    case 'SENDING':
      return this.config.pendingTimeoutMs;
    case 'CREATING':
      return this.config.creatingTimeoutMs;
    case 'SYNCING':
      return this.config.syncingTimeoutMs;
    case 'STOPPING':
      return this.config.removingTimeoutMs;
    default:
      return this.config.pendingTimeoutMs;
    }
  }

  /**
   * Persist operation to the replica_operations system table.
   * Requirements: 9.1, 9.2
   *
   * @param {Object} operation - Operation to persist.
   * @return {Promise<void>}
   */
  async persistOperation(operation) {
    if (!this.cdcIntegrationService) {
      this.logger.debug('CDC integration service not available, skipping persistence');
      return;
    }

    const row = {
      operation_id: operation.operationId,
      type: operation.type,
      partition_id: operation.partitionId,
      replica_id: operation.replicaId,
      source_node_id: operation.sourceNodeId,
      target_node_id: operation.targetNodeId,
      status: operation.status,
      workflow_step: operation.workflowStep,
      created_at: operation.createdAt,
      updated_at: operation.updatedAt,
      completed_at: operation.completedAt,
      error_message: operation.errorMessage,
      steps_history: JSON.stringify(operation.stepsHistory),
    };

    try {
      // Check if operation exists
      const existing = this.systemTableCache?.get(
        SystemTableName.REPLICA_OPERATIONS,
        operation.operationId,
      );

      if (existing) {
        // Update existing operation
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.REPLICA_OPERATIONS,
          {operation_id: operation.operationId},
          row,
        );
      } else {
        // Insert new operation
        await this.cdcIntegrationService.insertSystemTableRow(
          SystemTableName.REPLICA_OPERATIONS,
          row,
        );
      }
    } catch (error) {
      this.logger.error('Failed to persist operation', {
        operationId: operation.operationId,
        error: error.message,
      });
      // Don't throw - persistence failure shouldn't block operation
    }
  }

  /**
   * Load incomplete operations from the operation log.
   * Used for recovery.
   * Requirements: 7.1
   *
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   */
  async loadIncompleteOperations() {
    if (!this.systemTableCache) {
      return [];
    }

    const terminalStatuses = [ReplicaStatus.ACTIVE, ReplicaStatus.REMOVED, ReplicaStatus.FAILED];

    const incompleteOps = this.systemTableCache.filter(
      SystemTableName.REPLICA_OPERATIONS,
      (op) => !terminalStatuses.includes(op.status),
    );

    // Convert to Operation objects
    return incompleteOps.map((row) => ({
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
      stepsHistory: JSON.parse(row.steps_history || '[]'),
    }));
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
    this.logger.info('Starting recovery process', {nodeId: this.nodeId});

    const result = {
      totalIncomplete: 0,
      markedFailed: 0,
      reconciled: 0,
      errors: [],
    };

    try {
      // Query replica_operations for incomplete operations (Requirement 7.1)
      const incompleteOps = await this.loadIncompleteOperations();
      result.totalIncomplete = incompleteOps.length;

      this.logger.info('Found incomplete operations during recovery', {
        count: incompleteOps.length,
        nodeId: this.nodeId,
      });

      for (const op of incompleteOps) {
        try {
          // Load operation into memory for tracking
          this.operations.set(op.operationId, op);

          // Handle based on workflow step
          if (this.isPreSyncStep(op.workflowStep)) {
            // Mark PENDING, SENDING, CREATING as FAILED (Requirement 7.2)
            await this.failOperation(op, 'Node recovery - incomplete operation');
            result.markedFailed++;

            this.logger.info('Marked incomplete operation as failed during recovery', {
              operationId: op.operationId,
              workflowStep: op.workflowStep,
              partitionId: op.partitionId,
            });
          } else if (op.workflowStep === 'SYNCING') {
            // Reconcile SYNCING operations (Requirement 7.3)
            await this.reconcileSyncingOperation(op);
            result.reconciled++;
          } else if (op.workflowStep === 'STOPPING') {
            // STOPPING operations should also be marked as failed
            await this.failOperation(op, 'Node recovery - incomplete removal operation');
            result.markedFailed++;

            this.logger.info('Marked incomplete removal operation as failed during recovery', {
              operationId: op.operationId,
              workflowStep: op.workflowStep,
              partitionId: op.partitionId,
            });
          }
        } catch (error) {
          this.logger.error('Error processing operation during recovery', {
            operationId: op.operationId,
            error: error.message,
          });
          result.errors.push({
            operationId: op.operationId,
            error: error.message,
          });
        }
      }

      this.logger.info('Recovery process completed', {
        nodeId: this.nodeId,
        ...result,
      });

      this.emit('recoveryCompleted', result);
    } catch (error) {
      this.logger.error('Recovery process failed', {
        nodeId: this.nodeId,
        error: error.message,
      });
      result.errors.push({error: error.message});
      this.emit('recoveryFailed', {error: error.message});
    }

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
    return ['PENDING', 'SENDING', 'CREATING'].includes(step);
  }

  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * Requirements: 7.3
   *
   * @param {Object} operation - Operation in SYNCING state.
   * @return {Promise<void>}
   * @private
   */
  async reconcileSyncingOperation(operation) {
    this.logger.info('Reconciling SYNCING operation', {
      operationId: operation.operationId,
      partitionId: operation.partitionId,
      targetNodeId: operation.targetNodeId,
    });

    // Check actual replica status from system table cache
    const actualStatus = await this.getActualReplicaStatus(
      operation.replicaId,
      operation.partitionId,
      operation.targetNodeId,
    );

    if (actualStatus === ReplicaStatus.ACTIVE) {
      // Replica is actually active - complete the operation
      await this.completeOperation(operation);
      this.logger.info('Reconciled SYNCING operation to ACTIVE', {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === ReplicaStatus.FAILED) {
      // Replica failed - fail the operation
      await this.failOperation(operation, 'Replica failed during sync');
      this.logger.info('Reconciled SYNCING operation to FAILED', {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else if (actualStatus === null) {
      // Replica doesn't exist - fail the operation (orphaned operation)
      await this.failOperation(operation, 'Replica not found during recovery reconciliation');
      this.logger.warn('Reconciled SYNCING operation to FAILED - replica not found', {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
      });
    } else {
      // Replica is still syncing or in another transitional state
      // Keep the operation in SYNCING state, timeout will handle it
      this.logger.info('SYNCING operation still in progress', {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        actualStatus,
      });
    }
  }

  /**
   * Get actual replica status from system table cache.
   * Requirements: 7.3
   *
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<string|null>} Replica status or null if not found.
   * @private
   */
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    if (!this.systemTableCache) {
      return null;
    }

    // Try to find replica by replicaId first
    if (replicaId) {
      const replica = this.systemTableCache.get(
        SystemTableName.SERVICES,
        replicaId,
      );
      if (replica) {
        return replica.status;
      }
    }

    // Fall back to searching by partition and node
    const replicas = this.systemTableCache.filter(
      SystemTableName.SERVICES,
      (service) =>
        service.partition_id === partitionId &&
        service.node_id === targetNodeId,
    );

    if (replicas && replicas.length > 0) {
      return replicas[0].status;
    }

    return null;
  }

  /**
   * Get an operation by ID.
   *
   * @param {string} operationId - Operation ID.
   * @return {Object|null} Operation or null if not found.
   */
  getOperation(operationId) {
    return this.operations.get(operationId) || null;
  }

  /**
   * Get all operations.
   *
   * @return {Array<Object>} Array of all operations.
   */
  getAllOperations() {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations by partition ID.
   *
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Array of operations for the partition.
   */
  getOperationsByPartition(partitionId) {
    return Array.from(this.operations.values())
      .filter((op) => op.partitionId === partitionId);
  }

  /**
   * Get in-flight operations (not completed or failed).
   *
   * @return {Array<Object>} Array of in-flight operations.
   */
  getInFlightOperations() {
    return Array.from(this.operations.values())
      .filter((op) => !isTerminalStep(op.type, op.workflowStep));
  }

  /**
   * Get count of concurrent ADD operations.
   *
   * @return {number} Count of concurrent ADD operations.
   */
  getConcurrentAddCount() {
    return this.getInFlightOperations()
      .filter((op) => op.type === OperationType.ADD)
      .length;
  }

  /**
   * Get count of concurrent REMOVE operations.
   *
   * @return {number} Count of concurrent REMOVE operations.
   */
  getConcurrentRemoveCount() {
    return this.getInFlightOperations()
      .filter((op) => op.type === OperationType.REMOVE)
      .length;
  }

  /**
   * Check if we can start a new ADD operation.
   *
   * @return {boolean} True if we can start a new ADD operation.
   */
  canStartAddOperation() {
    return this.getConcurrentAddCount() < this.config.maxConcurrentAdds;
  }

  /**
   * Check if we can start a new REMOVE operation.
   *
   * @return {boolean} True if we can start a new REMOVE operation.
   */
  canStartRemoveOperation() {
    return this.getConcurrentRemoveCount() < this.config.maxConcurrentRemoves;
  }

  /**
   * Get coordinator statistics.
   *
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      ...this.stats,
      inFlightOperations: this.getInFlightOperations().length,
      totalOperations: this.operations.size,
    };
  }

  /**
   * Shutdown the coordinator.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    this.logger.info('Shutting down RebalanceCoordinator', {
      nodeId: this.nodeId,
      inFlightOperations: this.getInFlightOperations().length,
    });

    this.stopTimeoutChecking();

    this.emit('shutdown');
  }
}

export {RebalanceCoordinator};
