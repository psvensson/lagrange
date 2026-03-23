/**
 * Property Test: Timeout Triggers Failure
 *
 * Property 7: For any operation that remains in a transitional state
 * (PENDING, SENDING, CREATING, SYNCING, STOPPING) longer than the configured
 * timeout, the RebalanceCoordinator SHALL transition it to FAILED status.
 *
 * Validates: Requirements 6.2
 *
 * Feature: simplified-rebalancing-architecture, Property 7: Timeout Triggers
 * Failure
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
  isTerminalStep,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

/**
 * Create a RebalanceCoordinator for timeout testing.
 * Returns both the coordinator and a function to backdate operations.
 * @param {Object} options - Options for the coordinator.
 * @return {Object} Coordinator and helper functions.
 */
function createTimeoutTestCoordinator(options = {}) {
  const {services = []} = options;
  const trackedOperations = new Map();

  // Mock CDC service (not used for persistence in new architecture)
  const cdcService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };

  // SQL engine that tracks operations via INSERT/UPDATE queries
  const sqlEngine = {
    executeQuery: async (sql, params) => {
      // Handle INSERT operations
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, sourceNodeId, targetNodeId,
          status, workflowStep, createdAt, updatedAt, completedAt, errorMessage,
          stepsHistory,
        ] = params;

        trackedOperations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          status,
          workflow_step: workflowStep,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
        });
        return {success: true};
      }

      // Handle UPDATE operations
      if (sql.includes('UPDATE replica_operations')) {
        const [
          status, workflowStep, updatedAt, completedAt, errorMessage,
          stepsHistory, replicaId, operationId,
        ] = params;

        const existing = trackedOperations.get(operationId);
        if (existing) {
          trackedOperations.set(operationId, {
            ...existing,
            status,
            workflow_step: workflowStep,
            updated_at: updatedAt,
            completed_at: completedAt,
            error_message: errorMessage,
            steps_history: stepsHistory,
            replica_id: replicaId,
          });
        }
        return {success: true};
      }

      // Handle SELECT services lookups for reconciliation
      if (sql.includes('FROM services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = services.find((row) =>
          row.service_id === serviceId || row.replica_id === serviceId);
        return {success: true, rows: service ? [{status: service.status}] : []};
      }

      if (sql.includes('FROM services') &&
          sql.includes('partition_id = ?') &&
          sql.includes('node_id = ?')) {
        const [partitionId, nodeId] = params;
        const service = services.find((row) =>
          row.partition_id === partitionId && row.node_id === nodeId);
        return {success: true, rows: service ? [{status: service.status}] : []};
      }

      // Handle SELECT queries
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        // Handle deduplication query (partition_id AND target_node_id)
        if (sql.includes('partition_id = ?') && sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          const matching = allOps.filter((op) =>
            op.partition_id === partitionId &&
            op.target_node_id === targetNodeId &&
            !['active', 'removed', 'failed'].includes(op.status));
          return {success: true, rows: matching};
        }

        if (sql.includes('SELECT * FROM replica_operations') &&
            sql.includes('WHERE type = ?')) {
          const [type] = params;
          return {
            success: true,
            rows: allOps.filter((op) => op.type === type),
          };
        }

        // Owner-scoped in-flight query used by timeout checks
        if (sql.includes('source_node_id = ?') &&
            sql.includes('workflow_step IN')) {
          const [
            sourceNodeId,
            pendingStep,
            sendingStep,
            creatingStep,
            syncingStep,
            stoppingStep,
            activeStep,
            replaceType,
          ] = params;
          const inFlightSteps = new Set([
            pendingStep,
            sendingStep,
            creatingStep,
            syncingStep,
            stoppingStep,
          ]);
          const incompleteOps = allOps.filter((op) => {
            if (op.source_node_id !== sourceNodeId) {
              return false;
            }
            if (inFlightSteps.has(op.workflow_step)) {
              return true;
            }
            return op.workflow_step === activeStep && op.type === replaceType;
          });
          return {success: true, rows: incompleteOps};
        }

        return {success: true, rows: allOps};
      }

      return {success: true, rows: []};
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: cdcService,
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts: false,
  });

  coordinator.initialize();
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
  // Set very short timeouts for testing
  coordinator.config.pendingTimeoutMs = options.pendingTimeoutMs || 10;
  coordinator.config.creatingTimeoutMs = options.creatingTimeoutMs || 10;
  coordinator.config.syncingTimeoutMs = options.syncingTimeoutMs || 10;
  coordinator.config.removingTimeoutMs = options.removingTimeoutMs || 10;

  /**
   * Backdate an operation's updated_at to simulate time passing.
   * @param {string} operationId - Operation ID to backdate.
   * @param {number} msAgo - Milliseconds in the past.
   */
  const backdateOperation = (operationId, msAgo) => {
    const op = trackedOperations.get(operationId);
    if (op) {
      op.updated_at = Date.now() - msAgo;
    }
  };

  /**
   * Get the current state of an operation from the tracked store.
   * @param {string} operationId - Operation ID.
   * @return {Object|null} Operation or null.
   */
  const getTrackedOperation = (operationId) => {
    return trackedOperations.get(operationId) || null;
  };

  return {coordinator, backdateOperation, getTrackedOperation, trackedOperations};
}

test('Property 7: Timeout Triggers Failure', async (t) => {
  await t.test('operation in PENDING times out and fails', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Verify initial state
      t.equal(operation.workflowStep, 'PENDING', 'Initial step is PENDING');
      t.equal(operation.status, ReplicaStatus.PENDING, 'Initial status is pending');

      // Backdate the operation in the tracked store
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operation from the tracked store
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation failed
      t.equal(updatedOp.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.equal(updatedOp.workflow_step, 'FAILED', 'Workflow step is FAILED');
      t.ok(updatedOp.error_message.includes('Timeout'),
        'Error message mentions timeout');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in SENDING times out and fails', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to SENDING
      await coordinator.updateStep(operation, 'SENDING');
      t.equal(operation.workflowStep, 'SENDING', 'Step is SENDING');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation failed
      t.equal(updatedOp.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(updatedOp.error_message.includes('SENDING'),
        'Error message mentions SENDING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in CREATING times out and fails', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({creatingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to CREATING
      await coordinator.updateStep(operation, 'CREATING');
      t.equal(operation.workflowStep, 'CREATING', 'Step is CREATING');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation failed
      t.equal(updatedOp.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(updatedOp.error_message.includes('CREATING'),
        'Error message mentions CREATING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in SYNCING times out and fails', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({syncingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to SYNCING
      await coordinator.updateStep(operation, 'SYNCING');
      t.equal(operation.workflowStep, 'SYNCING', 'Step is SYNCING');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation failed
      t.equal(updatedOp.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(updatedOp.error_message.includes('SYNCING'),
        'Error message mentions SYNCING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in STOPPING times out and fails', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({
        removingTimeoutMs: 1,
        services: [{
          service_id: 'test-replica',
          replica_id: 'test-replica',
          partition_id: 'test-partition',
          node_id: 'test-node',
          status: ReplicaStatus.REMOVING,
        }],
      });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition',
        nodeId: 'test-node',
        replicaId: 'test-replica',
      });

      // Move to STOPPING
      await coordinator.updateStep(operation, 'STOPPING');
      t.equal(operation.workflowStep, 'STOPPING', 'Step is STOPPING');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation failed
      t.equal(updatedOp.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(updatedOp.error_message.includes('STOPPING'),
        'Error message mentions STOPPING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('completed operation does not timeout', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Complete the operation
      await coordinator.completeOperation(operation);
      t.equal(operation.workflowStep, 'ACTIVE', 'Step is ACTIVE');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify operation is still completed (not failed)
      t.equal(updatedOp.status, ReplicaStatus.ACTIVE,
        'Status is still active after timeout check');
      t.equal(updatedOp.workflow_step, 'ACTIVE',
        'Workflow step is still ACTIVE');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('failed operation does not timeout again', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Fail the operation
      await coordinator.failOperation(operation, 'Initial failure');
      const initialOp = getTrackedOperation(operation.operationId);
      const initialErrorMessage = initialOp.error_message;

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the operation
      const updatedOp = getTrackedOperation(operation.operationId);

      // Verify error message hasn't changed
      t.equal(updatedOp.error_message, initialErrorMessage,
        'Error message unchanged after timeout check');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('timeout increments statistics', async (t) => {
    const {coordinator, backdateOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      const initialStats = await coordinator.getStats();
      t.equal(initialStats.operationsTimedOut, 0, 'Initial timeout count is 0');

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      const afterStats = await coordinator.getStats();
      t.equal(afterStats.operationsTimedOut, 1, 'Timeout count is 1 after timeout');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('multiple operations can timeout in same check', async (t) => {
    const {coordinator, backdateOperation, getTrackedOperation, trackedOperations} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});

    try {
      const op1 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition-1',
        nodeId: 'test-node-1',
      });

      const op2 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition-2',
        nodeId: 'test-node-2',
      });

      // Verify both operations were created
      t.equal(trackedOperations.size, 2, 'Two operations tracked');

      // Backdate both operations
      backdateOperation(op1.operationId, 100);
      backdateOperation(op2.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Get the updated operations
      const updatedOp1 = getTrackedOperation(op1.operationId);
      const updatedOp2 = getTrackedOperation(op2.operationId);

      // Verify both operations failed
      t.equal(updatedOp1.status, ReplicaStatus.FAILED, 'Op1 status is failed');
      t.equal(updatedOp2.status, ReplicaStatus.FAILED, 'Op2 status is failed');

      const stats = await coordinator.getStats();
      t.equal(stats.operationsTimedOut, 2, 'Two operations timed out');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation within timeout does not fail', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const {coordinator, getTrackedOperation} =
            createTimeoutTestCoordinator({pendingTimeoutMs: 10000});

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.ADD,
              ...move,
            });

            // Don't backdate - operation is fresh
            // Trigger timeout check
            await coordinator.checkTimeouts();

            // Get the operation
            const updatedOp = getTrackedOperation(operation.operationId);

            // Operation should still be pending
            return updatedOp.status === ReplicaStatus.PENDING &&
              !isTerminalStep(operation.type, updatedOp.workflow_step);
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations within timeout do not fail');
  });

  await t.test('operationFailed event is emitted on timeout', async (t) => {
    const {coordinator, backdateOperation} =
      createTimeoutTestCoordinator({pendingTimeoutMs: 1});
    let failedEvent = null;

    coordinator.on('operationFailed', (event) => {
      failedEvent = event;
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Backdate the operation
      backdateOperation(operation.operationId, 100);

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify event was emitted
      t.ok(failedEvent !== null, 'operationFailed event was emitted');
      t.equal(failedEvent.operation.operationId, operation.operationId,
        'Event contains correct operation');
      t.ok(failedEvent.errorMessage.includes('Timeout'),
        'Event error message mentions timeout');
    } finally {
      await coordinator.shutdown();
    }
  });
});
