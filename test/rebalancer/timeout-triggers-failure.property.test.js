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

import {test} from 'tap';
import fc from 'fast-check';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
  isTerminalStep,
} from '../../src/rebalancer/replica-status.js';

/**
 * Create a mock RPC client for testing.
 * @return {Object} Mock RPC client.
 */
function createMockRpcClient() {
  return {
    call: async (_target, _request, _options) => {
      return {status: 'initiated', error: null};
    },
  };
}

/**
 * Create a RebalanceCoordinator for testing with short timeouts.
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

  // Set very short timeouts for testing
  coordinator.config.pendingTimeoutMs = options.pendingTimeoutMs || 10;
  coordinator.config.creatingTimeoutMs = options.creatingTimeoutMs || 10;
  coordinator.config.syncingTimeoutMs = options.syncingTimeoutMs || 10;
  coordinator.config.removingTimeoutMs = options.removingTimeoutMs || 10;

  // Don't start automatic timeout checking
  coordinator.timeoutCheckIntervalMs = 1000000;

  return coordinator;
}

test('Property 7: Timeout Triggers Failure', async (t) => {
  await t.test('operation in PENDING times out and fails', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Verify initial state
      t.equal(operation.workflowStep, 'PENDING', 'Initial step is PENDING');
      t.equal(operation.status, ReplicaStatus.PENDING, 'Initial status is pending');

      // Simulate time passing by backdating updatedAt
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation failed
      t.equal(operation.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.equal(operation.workflowStep, 'FAILED', 'Workflow step is FAILED');
      t.ok(operation.errorMessage.includes('Timeout'),
        'Error message mentions timeout');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in SENDING times out and fails', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to SENDING
      await coordinator.updateStep(operation, 'SENDING');
      t.equal(operation.workflowStep, 'SENDING', 'Step is SENDING');

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation failed
      t.equal(operation.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(operation.errorMessage.includes('SENDING'),
        'Error message mentions SENDING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in CREATING times out and fails', async (t) => {
    const coordinator = createTestCoordinator({creatingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to CREATING
      await coordinator.updateStep(operation, 'CREATING');
      t.equal(operation.workflowStep, 'CREATING', 'Step is CREATING');

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation failed
      t.equal(operation.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(operation.errorMessage.includes('CREATING'),
        'Error message mentions CREATING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in SYNCING times out and fails', async (t) => {
    const coordinator = createTestCoordinator({syncingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Move to SYNCING
      await coordinator.updateStep(operation, 'SYNCING');
      t.equal(operation.workflowStep, 'SYNCING', 'Step is SYNCING');

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation failed
      t.equal(operation.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(operation.errorMessage.includes('SYNCING'),
        'Error message mentions SYNCING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operation in STOPPING times out and fails', async (t) => {
    const coordinator = createTestCoordinator({removingTimeoutMs: 1});

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

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation failed
      t.equal(operation.status, ReplicaStatus.FAILED, 'Status is failed after timeout');
      t.ok(operation.errorMessage.includes('STOPPING'),
        'Error message mentions STOPPING step');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('completed operation does not timeout', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Complete the operation
      await coordinator.completeOperation(operation);
      t.equal(operation.workflowStep, 'ACTIVE', 'Step is ACTIVE');

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify operation is still completed (not failed)
      t.equal(operation.status, ReplicaStatus.ACTIVE,
        'Status is still active after timeout check');
      t.equal(operation.workflowStep, 'ACTIVE',
        'Workflow step is still ACTIVE');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('failed operation does not timeout again', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Fail the operation
      await coordinator.failOperation(operation, 'Initial failure');
      const initialErrorMessage = operation.errorMessage;

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify error message hasn't changed
      t.equal(operation.errorMessage, initialErrorMessage,
        'Error message unchanged after timeout check');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('timeout increments statistics', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      const initialStats = coordinator.getStats();
      t.equal(initialStats.operationsTimedOut, 0, 'Initial timeout count is 0');

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      const afterStats = coordinator.getStats();
      t.equal(afterStats.operationsTimedOut, 1, 'Timeout count is 1 after timeout');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('multiple operations can timeout in same check', async (t) => {
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});

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

      // Simulate time passing for both
      op1.updatedAt = Date.now() - 100;
      op2.updatedAt = Date.now() - 100;

      // Trigger timeout check
      await coordinator.checkTimeouts();

      // Verify both operations failed
      t.equal(op1.status, ReplicaStatus.FAILED, 'Op1 status is failed');
      t.equal(op2.status, ReplicaStatus.FAILED, 'Op2 status is failed');

      const stats = coordinator.getStats();
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
          const coordinator = createTestCoordinator({
            pendingTimeoutMs: 10000, // Long timeout
          });

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.ADD,
              ...move,
            });

            // Don't backdate - operation is fresh
            // Trigger timeout check
            await coordinator.checkTimeouts();

            // Operation should still be pending
            return operation.status === ReplicaStatus.PENDING &&
              !isTerminalStep(operation.type, operation.workflowStep);
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
    const coordinator = createTestCoordinator({pendingTimeoutMs: 1});
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

      // Simulate time passing
      operation.updatedAt = Date.now() - 100;

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
