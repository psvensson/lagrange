/**
 * Property Test: Recovery Handles Incomplete Operations
 *
 * Property 8: For any operation found in SENDING or CREATING state after node
 * recovery, the RebalanceCoordinator SHALL mark it as FAILED. For operations
 * in SYNCING state, the coordinator SHALL check actual replica status and
 * reconcile.
 *
 * Validates: Requirements 7.2, 7.3
 *
 * Feature: simplified-rebalancing-architecture, Property 8: Recovery Handles
 * Incomplete Operations
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
 * Create a mock system table cache for testing.
 * @param {Object} options - Options for the mock.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache(options = {}) {
  const operations = options.operations || [];
  const services = options.services || [];

  return {
    filter: (tableName, predicate) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        return operations.filter(predicate);
      }
      if (tableName === SystemTableName.SERVICES) {
        return services.filter(predicate);
      }
      return [];
    },
    get: (tableName, id) => {
      if (tableName === SystemTableName.REPLICA_OPERATIONS) {
        return operations.find((op) => op.operation_id === id) || null;
      }
      if (tableName === SystemTableName.SERVICES) {
        return services.find((s) => s.service_id === id) || null;
      }
      return null;
    },
  };
}

/**
 * Create a mock CDC integration service for testing.
 * @return {Object} Mock CDC integration service.
 */
function createMockCdcService() {
  return {
    updateSystemTableRow: async () => {},
    insertSystemTableRow: async () => {},
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
    rpcClient: options.rpcClient || null,
    systemTableCache: options.systemTableCache || null,
    cdcIntegrationService: options.cdcIntegrationService || createMockCdcService(),
  });

  // Don't start timeout checking in tests
  coordinator.timeoutCheckIntervalMs = 1000000;

  return coordinator;
}

/**
 * Create a mock operation row for the system table cache.
 * @param {Object} params - Operation parameters.
 * @return {Object} Operation row.
 */
function createOperationRow(params) {
  const now = Date.now();
  return {
    operation_id: params.operationId || `op-${Math.random().toString(36).slice(2)}`,
    type: params.type || OperationType.ADD,
    partition_id: params.partitionId || 'test-partition',
    replica_id: params.replicaId || null,
    source_node_id: params.sourceNodeId || 'source-node',
    target_node_id: params.targetNodeId || 'target-node',
    status: params.status || ReplicaStatus.PENDING,
    workflow_step: params.workflowStep || 'PENDING',
    created_at: params.createdAt || now,
    updated_at: params.updatedAt || now,
    completed_at: params.completedAt || null,
    error_message: params.errorMessage || null,
    steps_history: params.stepsHistory || JSON.stringify([{step: 'PENDING', timestamp: now}]),
  };
}

test('Property 8: Recovery Handles Incomplete Operations', async (t) => {
  await t.test('operations in PENDING state are marked FAILED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'PENDING',
            status: ReplicaStatus.PENDING,
          });

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            // Verify operation was marked as failed
            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.markedFailed === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations in PENDING state are marked FAILED during recovery');
  });

  await t.test('operations in SENDING state are marked FAILED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'SENDING',
            status: ReplicaStatus.PENDING,
          });

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.markedFailed === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations in SENDING state are marked FAILED during recovery');
  });

  await t.test('operations in CREATING state are marked FAILED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'CREATING',
            status: ReplicaStatus.CREATING,
          });

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.markedFailed === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations in CREATING state are marked FAILED during recovery');
  });

  await t.test('operations in STOPPING state are marked FAILED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            type: OperationType.REMOVE,
            workflowStep: 'STOPPING',
            status: ReplicaStatus.REMOVING,
          });

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.markedFailed === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations in STOPPING state are marked FAILED during recovery');
  });

  await t.test('SYNCING operations with ACTIVE replica are completed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'SYNCING',
            status: ReplicaStatus.SYNCING,
          });

          // Create a service entry showing the replica is ACTIVE
          const serviceRow = {
            service_id: params.replicaId,
            partition_id: params.partitionId,
            node_id: params.targetNodeId,
            status: ReplicaStatus.ACTIVE,
          };

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
            services: [serviceRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.ACTIVE &&
              operation.workflowStep === 'ACTIVE' &&
              result.reconciled === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations with ACTIVE replica are completed during recovery');
  });

  await t.test('SYNCING operations with FAILED replica are failed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'SYNCING',
            status: ReplicaStatus.SYNCING,
          });

          // Create a service entry showing the replica FAILED
          const serviceRow = {
            service_id: params.replicaId,
            partition_id: params.partitionId,
            node_id: params.targetNodeId,
            status: ReplicaStatus.FAILED,
          };

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
            services: [serviceRow],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.reconciled === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations with FAILED replica are failed during recovery');
  });

  await t.test('SYNCING operations with missing replica are failed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (params) => {
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'SYNCING',
            status: ReplicaStatus.SYNCING,
          });

          // No service entry - replica doesn't exist
          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
            services: [],
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            const result = await coordinator.handleRecovery();

            const operation = coordinator.getOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflowStep === 'FAILED' &&
              result.reconciled === 1;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations with missing replica are failed during recovery');
  });

  await t.test('multiple incomplete operations are all processed', async (t) => {
    const operations = [
      createOperationRow({
        operationId: 'op-1',
        workflowStep: 'PENDING',
        status: ReplicaStatus.PENDING,
      }),
      createOperationRow({
        operationId: 'op-2',
        workflowStep: 'SENDING',
        status: ReplicaStatus.PENDING,
      }),
      createOperationRow({
        operationId: 'op-3',
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
      }),
    ];

    const systemTableCache = createMockSystemTableCache({operations});
    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 3, 'All 3 incomplete operations found');
      t.equal(result.markedFailed, 3, 'All 3 operations marked as failed');

      // Verify each operation is failed
      for (const opRow of operations) {
        const op = coordinator.getOperation(opRow.operation_id);
        t.equal(op.status, ReplicaStatus.FAILED,
          `Operation ${opRow.operation_id} is failed`);
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('recovery emits recoveryCompleted event', async (t) => {
    const opRow = createOperationRow({
      operationId: 'test-op',
      workflowStep: 'PENDING',
      status: ReplicaStatus.PENDING,
    });

    const systemTableCache = createMockSystemTableCache({
      operations: [opRow],
    });

    const coordinator = createTestCoordinator({systemTableCache});
    let eventEmitted = false;
    let eventResult = null;

    coordinator.on('recoveryCompleted', (result) => {
      eventEmitted = true;
      eventResult = result;
    });

    try {
      await coordinator.handleRecovery();

      t.ok(eventEmitted, 'recoveryCompleted event was emitted');
      t.equal(eventResult.totalIncomplete, 1, 'Event contains correct count');
      t.equal(eventResult.markedFailed, 1, 'Event contains correct failed count');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('recovery with no incomplete operations succeeds', async (t) => {
    const systemTableCache = createMockSystemTableCache({
      operations: [],
    });

    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 0, 'No incomplete operations found');
      t.equal(result.markedFailed, 0, 'No operations marked as failed');
      t.equal(result.reconciled, 0, 'No operations reconciled');
      t.equal(result.errors.length, 0, 'No errors');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('error message includes recovery context', async (t) => {
    const opRow = createOperationRow({
      operationId: 'test-op',
      workflowStep: 'CREATING',
      status: ReplicaStatus.CREATING,
    });

    const systemTableCache = createMockSystemTableCache({
      operations: [opRow],
    });

    const coordinator = createTestCoordinator({systemTableCache});

    try {
      await coordinator.handleRecovery();

      const operation = coordinator.getOperation('test-op');
      t.ok(operation.errorMessage.includes('recovery'),
        'Error message mentions recovery');
      t.ok(operation.errorMessage.includes('incomplete'),
        'Error message mentions incomplete');
    } finally {
      await coordinator.shutdown();
    }
  });
});
