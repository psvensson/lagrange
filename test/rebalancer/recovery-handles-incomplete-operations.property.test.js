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

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
} from './test-helpers.js';

/**
 * Create a mock operation row for the SQL engine.
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
    source_node_id: params.sourceNodeId || 'test-node-1',
    target_node_id: params.targetNodeId || 'test-node-1',
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
 * Create a RebalanceCoordinator for recovery testing.
 * @param {Object} options - Options for the coordinator.
 * @return {Object} Coordinator and helper functions.
 */
function createRecoveryTestCoordinator(options = {}) {
  const {
    operations = [],
    services = [],
  } = options;

  // Track operations in a map (simulating SQL storage)
  const trackedOperations = new Map();
  operations.forEach((op) => trackedOperations.set(op.operation_id, {...op}));

  // Track services for replica status lookup
  const trackedServices = new Map();
  services.forEach((s) => trackedServices.set(s.service_id, {...s}));

  // Mock CDC service
  const cdcService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };

  // SQL engine that handles operations and services queries
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

      // Handle SELECT for services (replica status lookup)
      if (sql.includes('services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = trackedServices.get(serviceId);
        if (service) {
          return {success: true, rows: [{status: service.status}]};
        }
        return {success: true, rows: []};
      }

      // Handle SELECT for services by partition/node
      if (sql.includes('services') && sql.includes('partition_id = ?')) {
        const [partitionId, nodeId] = params;
        const matching = Array.from(trackedServices.values()).filter((s) =>
          s.partition_id === partitionId && s.node_id === nodeId);
        if (matching.length > 0) {
          return {success: true, rows: [{status: matching[0].status}]};
        }
        return {success: true, rows: []};
      }

      // Handle SELECT for replica_operations
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(trackedOperations.values());

        // Handle operation by ID query
        if (sql.includes('operation_id = ?')) {
          const [operationId] = params;
          const op = trackedOperations.get(operationId);
          return {success: true, rows: op ? [op] : []};
        }

        // Handle deduplication query
        if (sql.includes('partition_id = ?') && sql.includes('target_node_id = ?')) {
          const [partitionId, targetNodeId] = params;
          const matching = allOps.filter((op) =>
            op.partition_id === partitionId &&
            op.target_node_id === targetNodeId &&
            !['active', 'removed', 'failed'].includes(op.status));
          return {success: true, rows: matching};
        }

        // Filter for non-terminal operations
        if (sql.includes('NOT IN')) {
          const incompleteOps = allOps.filter((op) =>
            !['active', 'removed', 'failed'].includes(op.status));
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
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlEngine),
    transactionCoordinator: {
      begin: async () => ({success: true}),
      commit: async () => ({success: true}),
      rollback: async () => ({success: true}),
    },
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    enableTimeouts: false,
  });

  /**
   * Get an operation from the tracked store.
   * @param {string} operationId - Operation ID.
   * @return {Object|null} Operation or null.
   */
  const getTrackedOperation = (operationId) => {
    return trackedOperations.get(operationId) || null;
  };

  return {coordinator, getTrackedOperation, trackedOperations};
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

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

          const serviceRow = {
            service_id: params.replicaId,
            partition_id: params.partitionId,
            node_id: params.targetNodeId,
            status: ReplicaStatus.ACTIVE,
          };

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
            services: [serviceRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.ACTIVE &&
              operation.workflow_step === 'ACTIVE' &&
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

          const serviceRow = {
            service_id: params.replicaId,
            partition_id: params.partitionId,
            node_id: params.targetNodeId,
            status: ReplicaStatus.FAILED,
          };

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
            services: [serviceRow],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
            services: [],
          });

          try {
            const result = await coordinator.handleRecovery();

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED' &&
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

    const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
      operations,
    });

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 3, 'All 3 incomplete operations found');
      t.equal(result.markedFailed, 3, 'All 3 operations marked as failed');

      for (const opRow of operations) {
        const op = getTrackedOperation(opRow.operation_id);
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

    const {coordinator} = createRecoveryTestCoordinator({
      operations: [opRow],
    });

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
    const {coordinator} = createRecoveryTestCoordinator({
      operations: [],
    });

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

    const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
      operations: [opRow],
    });

    try {
      await coordinator.handleRecovery();

      const operation = getTrackedOperation('test-op');
      t.ok(operation.error_message.includes('recovery'),
        'Error message mentions recovery');
      t.ok(operation.error_message.includes('incomplete'),
        'Error message mentions incomplete');
    } finally {
      await coordinator.shutdown();
    }
  });
});
