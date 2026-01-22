/**
 * Property Test: Operation Log Persistence
 *
 * Property 10: For any operation created by the RebalanceCoordinator, the
 * operation SHALL be persisted to the replica_operations system table.
 * The persisted record SHALL contain all required fields.
 *
 * Validates: Requirements 9.1, 9.2
 *
 * Feature: simplified-rebalancing-architecture, Property 10: Operation Log Persistence
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas.js';

/**
 * Create a mock CDC integration service that tracks persisted operations.
 * @return {Object} Mock CDC service with tracking.
 */
function createMockCdcService() {
  const persistedOperations = new Map();

  return {
    persistedOperations,
    insertSystemTableRow: async (tableName, row) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        persistedOperations.set(row.operation_id, {...row});
      }
    },
    updateSystemTableRow: async (tableName, _where, row) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        const existing = persistedOperations.get(row.operation_id);
        if (existing) {
          persistedOperations.set(row.operation_id, {...existing, ...row});
        }
      }
    },
  };
}

/**
 * Create a mock system table cache for testing.
 * @param {Map} persistedOperations - Map of persisted operations.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache(persistedOperations) {
  return {
    get: (tableName, id) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        return persistedOperations.get(id) || null;
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        return Array.from(persistedOperations.values()).filter(predicate);
      }
      return [];
    },
  };
}

/**
 * Create a RebalanceCoordinator for testing with persistence.
 * @param {Object} options - Options for the coordinator.
 * @return {Object} Coordinator and mock services.
 */
function createTestCoordinatorWithPersistence(options = {}) {
  const cdcService = createMockCdcService();
  const systemTableCache = createMockSystemTableCache(cdcService.persistedOperations);

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    rpcClient: options.rpcClient || null,
    systemTableCache,
    cdcIntegrationService: cdcService,
  });

  // Don't start timeout checking in tests
  coordinator.timeoutCheckIntervalMs = 1000000;

  return {coordinator, cdcService, systemTableCache};
}

test('Property 10: Operation Log Persistence', async (t) => {
  await t.test('operations are persisted to replica_operations table', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.option(fc.uuid(), {nil: undefined}),
        }),
        async (move) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);

            // Verify operation was persisted
            const persisted = cdcService.persistedOperations.get(operation.operationId);

            return persisted !== undefined &&
              persisted.operation_id === operation.operationId;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations are persisted to replica_operations table');
  });

  await t.test('persisted record contains all required fields', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.option(fc.uuid(), {nil: undefined}),
        }),
        async (move) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);
            const persisted = cdcService.persistedOperations.get(operation.operationId);

            // Verify all required fields per Requirements 9.2
            const hasOperationId = typeof persisted.operation_id === 'string';
            const hasType = persisted.type === move.type;
            const hasPartitionId = persisted.partition_id === move.partitionId;
            const hasSourceNodeId = typeof persisted.source_node_id === 'string';
            const hasTargetNodeId = persisted.target_node_id === move.nodeId;
            const hasStatus = typeof persisted.status === 'string';
            const hasWorkflowStep = typeof persisted.workflow_step === 'string';
            const hasCreatedAt = typeof persisted.created_at === 'number';
            const hasUpdatedAt = typeof persisted.updated_at === 'number';
            const hasStepsHistory = typeof persisted.steps_history === 'string';

            return hasOperationId && hasType && hasPartitionId &&
              hasSourceNodeId && hasTargetNodeId && hasStatus &&
              hasWorkflowStep && hasCreatedAt && hasUpdatedAt && hasStepsHistory;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Persisted records contain all required fields');
  });

  await t.test('step updates are persisted', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);

            // Update step
            await coordinator.updateStep(operation, 'SENDING');

            const persisted = cdcService.persistedOperations.get(operation.operationId);

            // Verify step was updated in persisted record
            return persisted.workflow_step === 'SENDING' &&
              persisted.updated_at >= persisted.created_at;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Step updates are persisted');
  });

  await t.test('completion is persisted with completed_at', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);
            await coordinator.completeOperation(operation);

            const persisted = cdcService.persistedOperations.get(operation.operationId);

            // Verify completion was persisted
            const hasCompletedAt = typeof persisted.completed_at === 'number' &&
              persisted.completed_at > 0;
            const expectedStep = move.type === OperationType.ADD ? 'ACTIVE' : 'REMOVED';
            const hasCorrectStep = persisted.workflow_step === expectedStep;

            return hasCompletedAt && hasCorrectStep;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Completion is persisted with completed_at');
  });

  await t.test('failure is persisted with error_message', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        fc.string({minLength: 1, maxLength: 100}),
        async (move, errorMessage) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);
            await coordinator.failOperation(operation, errorMessage);

            const persisted = cdcService.persistedOperations.get(operation.operationId);

            // Verify failure was persisted
            const hasCompletedAt = typeof persisted.completed_at === 'number';
            const hasErrorMessage = persisted.error_message === errorMessage;
            const hasFailedStatus = persisted.status === ReplicaStatus.FAILED;
            const hasFailedStep = persisted.workflow_step === 'FAILED';

            return hasCompletedAt && hasErrorMessage && hasFailedStatus && hasFailedStep;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Failure is persisted with error_message');
  });

  await t.test('steps_history is persisted as JSON', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

          try {
            const operation = await coordinator.createOperation(move);

            // Add some steps
            await coordinator.updateStep(operation, 'SENDING');
            await coordinator.updateStep(operation, 'CREATING');

            const persisted = cdcService.persistedOperations.get(operation.operationId);

            // Verify steps_history is valid JSON
            const stepsHistory = JSON.parse(persisted.steps_history);

            // Should have 3 steps: PENDING, SENDING, CREATING
            return Array.isArray(stepsHistory) &&
              stepsHistory.length === 3 &&
              stepsHistory[0].step === 'PENDING' &&
              stepsHistory[1].step === 'SENDING' &&
              stepsHistory[2].step === 'CREATING';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('steps_history is persisted as valid JSON');
  });

  await t.test('loadIncompleteOperations returns non-terminal operations', async (t) => {
    const {coordinator, cdcService} = createTestCoordinatorWithPersistence();

    try {
      // Create operations in different states
      const op1 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-1',
        nodeId: 'node-1',
      });

      const op2 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-2',
        nodeId: 'node-2',
      });
      await coordinator.completeOperation(op2);

      const op3 = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'partition-3',
        nodeId: 'node-3',
      });
      await coordinator.failOperation(op3, 'Test error');

      // Load incomplete operations
      const incomplete = await coordinator.loadIncompleteOperations();

      // Only op1 should be returned (PENDING state)
      t.equal(incomplete.length, 1, 'Should return 1 incomplete operation');
      t.equal(incomplete[0].operationId, op1.operationId,
        'Should return the pending operation');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('loadIncompleteOperations converts row to operation object', async (t) => {
    const {coordinator} = createTestCoordinatorWithPersistence();

    try {
      // Create an operation
      await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-1',
        nodeId: 'node-1',
      });

      // Load incomplete operations
      const incomplete = await coordinator.loadIncompleteOperations();

      // Verify the returned object has the correct structure
      const op = incomplete[0];
      t.ok(op.operationId, 'Has operationId');
      t.ok(op.type, 'Has type');
      t.ok(op.partitionId, 'Has partitionId');
      t.ok(op.sourceNodeId, 'Has sourceNodeId');
      t.ok(op.targetNodeId, 'Has targetNodeId');
      t.ok(op.status, 'Has status');
      t.ok(op.workflowStep, 'Has workflowStep');
      t.ok(op.createdAt, 'Has createdAt');
      t.ok(op.updatedAt, 'Has updatedAt');
      t.ok(Array.isArray(op.stepsHistory), 'Has stepsHistory as array');
    } finally {
      await coordinator.shutdown();
    }
  });
});
