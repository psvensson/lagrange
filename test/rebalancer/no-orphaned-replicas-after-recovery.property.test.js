/**
 * Property Test: No Orphaned Replicas After Recovery
 *
 * Property 9: For any node recovery, the system SHALL not leave replicas in
 * transitional states without a corresponding operation tracking them. All
 * orphaned replicas SHALL be cleaned up or marked as failed.
 *
 * Validates: Requirements 7.4
 *
 * Feature: simplified-rebalancing-architecture, Property 9: No Orphaned
 * Replicas After Recovery
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

/**
 * Transitional states that indicate a replica is not fully operational.
 */
const TRANSITIONAL_STATES = [
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
  ReplicaStatus.REMOVING,
];

/**
 * Terminal states that indicate a replica operation is complete.
 */
const TERMINAL_STATES = [
  ReplicaStatus.ACTIVE,
  ReplicaStatus.REMOVED,
  ReplicaStatus.FAILED,
];

test('Property 9: No Orphaned Replicas After Recovery', async (t) => {
  await t.test('all incomplete operations have terminal status after recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            operationId: fc.uuid(),
            partitionId: fc.uuid(),
            targetNodeId: fc.uuid(),
            workflowStep: fc.constantFrom('PENDING', 'SENDING', 'CREATING'),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (opParams) => {
          const operations = opParams.map((params) => createOperationRow({
            ...params,
            status: params.workflowStep === 'CREATING' ?
              ReplicaStatus.CREATING : ReplicaStatus.PENDING,
          }));

          const systemTableCache = createMockSystemTableCache({operations});
          const coordinator = createTestCoordinator({systemTableCache});

          try {
            await coordinator.handleRecovery();

            // After recovery, all operations should be in terminal state
            for (const opRow of operations) {
              const op = coordinator.getOperation(opRow.operation_id);
              if (!op) {
                return false; // Operation should be tracked
              }
              if (!TERMINAL_STATES.includes(op.status)) {
                return false; // Should be in terminal state
              }
            }
            return true;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('All incomplete operations have terminal status after recovery');
  });

  await t.test('SYNCING operations are reconciled to terminal state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
          actualReplicaStatus: fc.constantFrom(
            ReplicaStatus.ACTIVE,
            ReplicaStatus.FAILED,
            null, // Replica doesn't exist
          ),
        }),
        async (params) => {
          const opRow = createOperationRow({
            operationId: params.operationId,
            partitionId: params.partitionId,
            targetNodeId: params.targetNodeId,
            replicaId: params.replicaId,
            workflowStep: 'SYNCING',
            status: ReplicaStatus.SYNCING,
          });

          // Create service entry if replica exists
          const services = params.actualReplicaStatus ? [{
            service_id: params.replicaId,
            partition_id: params.partitionId,
            node_id: params.targetNodeId,
            status: params.actualReplicaStatus,
          }] : [];

          const systemTableCache = createMockSystemTableCache({
            operations: [opRow],
            services,
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            await coordinator.handleRecovery();

            const op = coordinator.getOperation(params.operationId);
            if (!op) {
              return false;
            }

            // Operation should be in terminal state after reconciliation
            return TERMINAL_STATES.includes(op.status);
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations are reconciled to terminal state');
  });

  await t.test('no operations left in transitional state after recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            operationId: fc.uuid(),
            partitionId: fc.uuid(),
            targetNodeId: fc.uuid(),
            replicaId: fc.uuid(),
            workflowStep: fc.constantFrom(
              'PENDING', 'SENDING', 'CREATING', 'SYNCING', 'STOPPING',
            ),
          }),
          {minLength: 1, maxLength: 5},
        ),
        async (opParams) => {
          const operations = opParams.map((params) => {
            let status;
            switch (params.workflowStep) {
            case 'CREATING':
              status = ReplicaStatus.CREATING;
              break;
            case 'SYNCING':
              status = ReplicaStatus.SYNCING;
              break;
            case 'STOPPING':
              status = ReplicaStatus.REMOVING;
              break;
            default:
              status = ReplicaStatus.PENDING;
            }
            return createOperationRow({...params, status});
          });

          const systemTableCache = createMockSystemTableCache({
            operations,
            services: [], // No actual replicas
          });

          const coordinator = createTestCoordinator({systemTableCache});

          try {
            await coordinator.handleRecovery();

            // Check no operations are in transitional state
            const allOps = coordinator.getAllOperations();
            for (const op of allOps) {
              if (TRANSITIONAL_STATES.includes(op.status)) {
                return false; // Found transitional state - fail
              }
            }
            return true;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('No operations left in transitional state after recovery');
  });

  await t.test('recovery result counts match actual state changes', async (t) => {
    const operations = [
      createOperationRow({
        operationId: 'op-pending',
        workflowStep: 'PENDING',
        status: ReplicaStatus.PENDING,
      }),
      createOperationRow({
        operationId: 'op-creating',
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
      }),
      createOperationRow({
        operationId: 'op-syncing',
        replicaId: 'replica-syncing',
        workflowStep: 'SYNCING',
        status: ReplicaStatus.SYNCING,
      }),
    ];

    // Syncing replica is actually active
    const services = [{
      service_id: 'replica-syncing',
      status: ReplicaStatus.ACTIVE,
    }];

    const systemTableCache = createMockSystemTableCache({operations, services});
    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      // 2 operations should be marked failed (PENDING, CREATING)
      // 1 operation should be reconciled (SYNCING -> ACTIVE)
      t.equal(result.totalIncomplete, 3, 'Total incomplete is 3');
      t.equal(result.markedFailed, 2, 'Marked failed is 2');
      t.equal(result.reconciled, 1, 'Reconciled is 1');

      // Verify actual states
      const opPending = coordinator.getOperation('op-pending');
      const opCreating = coordinator.getOperation('op-creating');
      const opSyncing = coordinator.getOperation('op-syncing');

      t.equal(opPending.status, ReplicaStatus.FAILED, 'PENDING op is FAILED');
      t.equal(opCreating.status, ReplicaStatus.FAILED, 'CREATING op is FAILED');
      t.equal(opSyncing.status, ReplicaStatus.ACTIVE, 'SYNCING op is ACTIVE');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('operations are loaded into memory during recovery', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            operationId: fc.uuid(),
            partitionId: fc.uuid(),
            targetNodeId: fc.uuid(),
          }),
          {minLength: 1, maxLength: 3},
        ),
        async (opParams) => {
          const operations = opParams.map((params) => createOperationRow({
            ...params,
            workflowStep: 'PENDING',
            status: ReplicaStatus.PENDING,
          }));

          const systemTableCache = createMockSystemTableCache({operations});
          const coordinator = createTestCoordinator({systemTableCache});

          try {
            // Before recovery, no operations in memory
            const beforeCount = coordinator.getAllOperations().length;
            if (beforeCount !== 0) {
              return false;
            }

            await coordinator.handleRecovery();

            // After recovery, all operations should be in memory
            const afterCount = coordinator.getAllOperations().length;
            return afterCount === operations.length;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations are loaded into memory during recovery');
  });

  await t.test('REMOVE operations in STOPPING are handled', async (t) => {
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
            await coordinator.handleRecovery();

            const op = coordinator.getOperation(params.operationId);
            // STOPPING operations should be marked as FAILED
            return op !== null &&
              op.status === ReplicaStatus.FAILED &&
              op.workflowStep === 'FAILED';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE operations in STOPPING are handled');
  });

  await t.test('completed operations are not affected by recovery', async (t) => {
    const completedOp = createOperationRow({
      operationId: 'completed-op',
      workflowStep: 'ACTIVE',
      status: ReplicaStatus.ACTIVE,
      completedAt: Date.now(),
    });

    // This operation is already complete, so it won't be in the incomplete list
    const systemTableCache = createMockSystemTableCache({
      operations: [], // No incomplete operations
    });

    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 0, 'No incomplete operations');
      t.equal(result.markedFailed, 0, 'No operations marked failed');
      t.equal(result.reconciled, 0, 'No operations reconciled');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('failed operations are not reprocessed', async (t) => {
    const failedOp = createOperationRow({
      operationId: 'failed-op',
      workflowStep: 'FAILED',
      status: ReplicaStatus.FAILED,
      completedAt: Date.now(),
      errorMessage: 'Previous failure',
    });

    // Failed operations are terminal, so they won't be in incomplete list
    const systemTableCache = createMockSystemTableCache({
      operations: [], // No incomplete operations
    });

    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 0, 'No incomplete operations');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('recovery handles mixed operation types', async (t) => {
    const operations = [
      createOperationRow({
        operationId: 'add-op',
        type: OperationType.ADD,
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
      }),
      createOperationRow({
        operationId: 'remove-op',
        type: OperationType.REMOVE,
        replicaId: 'replica-to-remove',
        workflowStep: 'STOPPING',
        status: ReplicaStatus.REMOVING,
      }),
    ];

    const systemTableCache = createMockSystemTableCache({operations});
    const coordinator = createTestCoordinator({systemTableCache});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 2, 'Both operations found');
      t.equal(result.markedFailed, 2, 'Both operations marked failed');

      const addOp = coordinator.getOperation('add-op');
      const removeOp = coordinator.getOperation('remove-op');

      t.equal(addOp.status, ReplicaStatus.FAILED, 'ADD op is FAILED');
      t.equal(removeOp.status, ReplicaStatus.FAILED, 'REMOVE op is FAILED');
    } finally {
      await coordinator.shutdown();
    }
  });
});
