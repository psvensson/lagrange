/**
 * Property Test: Operation Record Completeness
 *
 * Property 2: For any rebalancing decision that results in a move, the
 * RebalanceCoordinator SHALL create an Operation record containing:
 * operation_id, type, partition_id, target_node, status, created_at.
 * When the operation completes or fails, the record SHALL be updated with
 * completed_at and final status.
 *
 * Validates: Requirements 2.2, 2.3, 2.4
 *
 * Feature: simplified-rebalancing-architecture, Property 2: Operation Record
 * Completeness
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

/**
 * Create a mock RPC client for testing.
 * @param {Object} options - Options for the mock.
 * @return {Object} Mock RPC client.
 */
function createMockRpcClient(options = {}) {
  const responseStatus = options.responseStatus || 'initiated';
  const responseError = options.responseError || null;

  return {
    call: async (_target, _request, _options) => {
      if (responseError) {
        throw new Error(responseError);
      }
      return {status: responseStatus, error: null};
    },
  };
}

/**
 * Create a RebalanceCoordinator for testing.
 * @param {Object} options - Options for the coordinator.
 * @return {RebalanceCoordinator} Coordinator instance.
 */
function createTestCoordinator(options = {}) {
  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    rpcClient: options.rpcClient || createMockRpcClient(),
    systemTableCache: options.systemTableCache || null,
    cdcIntegrationService: options.cdcIntegrationService || null,
  });

  // Don't start timeout checking in tests
  coordinator.timeoutCheckIntervalMs = 1000000;

  return coordinator;
}

test('Property 2: Operation Record Completeness', async (t) => {
  await t.test('createOperation creates records with all required fields', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.option(fc.uuid(), {nil: undefined}),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation(move);

            // Verify all required fields are present (Requirements 2.2, 2.3)
            const hasOperationId = typeof operation.operationId === 'string' &&
              operation.operationId.length > 0;
            const hasType = operation.type === move.type;
            const hasPartitionId = operation.partitionId === move.partitionId;
            const hasTargetNode = operation.targetNodeId === move.nodeId;
            const hasStatus = typeof operation.status === 'string';
            const hasCreatedAt = typeof operation.createdAt === 'number' &&
              operation.createdAt > 0;

            // Verify additional fields
            const hasSourceNode = typeof operation.sourceNodeId === 'string';
            const hasWorkflowStep = typeof operation.workflowStep === 'string';
            const hasUpdatedAt = typeof operation.updatedAt === 'number';
            const hasStepsHistory = Array.isArray(operation.stepsHistory);

            return hasOperationId && hasType && hasPartitionId && hasTargetNode &&
              hasStatus && hasCreatedAt && hasSourceNode && hasWorkflowStep &&
              hasUpdatedAt && hasStepsHistory;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('createOperation creates records with all required fields');
  });

  await t.test('operation starts in PENDING status', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation(move);

            return operation.status === ReplicaStatus.PENDING &&
              operation.workflowStep === 'PENDING';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations start in PENDING status');
  });

  await t.test('operation is stored in coordinator memory', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation(move);
            const retrieved = coordinator.getOperation(operation.operationId);

            return retrieved !== null &&
              retrieved.operationId === operation.operationId;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations are stored in coordinator memory');
  });

  await t.test('completed operation has completed_at timestamp', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation(move);

            // Initially completedAt should be null
            const initiallyNull = operation.completedAt === null;

            // Complete the operation
            await coordinator.completeOperation(operation);

            // After completion, completedAt should be set
            const hasCompletedAt = typeof operation.completedAt === 'number' &&
              operation.completedAt > 0;

            return initiallyNull && hasCompletedAt;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Completed operations have completed_at timestamp');
  });

  await t.test('failed operation has completed_at and error_message', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        fc.string({minLength: 1, maxLength: 100}),
        async (move, errorMessage) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation(move);

            // Fail the operation
            await coordinator.failOperation(operation, errorMessage);

            // After failure, completedAt and errorMessage should be set
            const hasCompletedAt = typeof operation.completedAt === 'number' &&
              operation.completedAt > 0;
            const hasErrorMessage = operation.errorMessage === errorMessage;
            const hasFailedStatus = operation.status === ReplicaStatus.FAILED;

            return hasCompletedAt && hasErrorMessage && hasFailedStatus;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Failed operations have completed_at and error_message');
  });

  await t.test('ADD operation completes with ACTIVE status', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      await coordinator.completeOperation(operation);

      t.equal(operation.status, ReplicaStatus.ACTIVE,
        'ADD operation should complete with ACTIVE status');
      t.equal(operation.workflowStep, 'ACTIVE',
        'ADD operation should complete with ACTIVE workflow step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('REMOVE operation completes with REMOVED status', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition',
        nodeId: 'test-node',
        replicaId: 'test-replica',
      });

      await coordinator.completeOperation(operation);

      t.equal(operation.status, ReplicaStatus.REMOVED,
        'REMOVE operation should complete with REMOVED status');
      t.equal(operation.workflowStep, 'REMOVED',
        'REMOVE operation should complete with REMOVED workflow step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('stepsHistory tracks all step transitions', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Initial history should have PENDING
      t.equal(operation.stepsHistory.length, 1,
        'Initial history should have one entry');
      t.equal(operation.stepsHistory[0].step, 'PENDING',
        'Initial step should be PENDING');

      // Update to SENDING
      await coordinator.updateStep(operation, 'SENDING');
      t.equal(operation.stepsHistory.length, 2,
        'History should have two entries after SENDING');
      t.equal(operation.stepsHistory[1].step, 'SENDING',
        'Second step should be SENDING');

      // Update to CREATING
      await coordinator.updateStep(operation, 'CREATING');
      t.equal(operation.stepsHistory.length, 3,
        'History should have three entries after CREATING');
      t.equal(operation.stepsHistory[2].step, 'CREATING',
        'Third step should be CREATING');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('statistics are updated correctly', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const initialStats = coordinator.getStats();
      t.equal(initialStats.operationsCreated, 0, 'Initial created count is 0');

      // Create an operation
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      const afterCreate = coordinator.getStats();
      t.equal(afterCreate.operationsCreated, 1, 'Created count is 1 after create');

      // Complete the operation
      await coordinator.completeOperation(operation);

      const afterComplete = coordinator.getStats();
      t.equal(afterComplete.operationsCompleted, 1,
        'Completed count is 1 after complete');

      // Create and fail another operation
      const operation2 = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition-2',
        nodeId: 'test-node-2',
      });

      await coordinator.failOperation(operation2, 'Test error');

      const afterFail = coordinator.getStats();
      t.equal(afterFail.operationsFailed, 1, 'Failed count is 1 after fail');
    } finally {
      await coordinator.shutdown();
    }
  });
});
