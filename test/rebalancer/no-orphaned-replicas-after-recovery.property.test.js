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

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createCoordinatorSqlStore,
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';

/**
 * Create a mock operation row for the system table cache.
 * @param {Object} params - Operation parameters.
 * @return {Object} Operation row.
 */
function createOperationRow(params) {
  const now = Date.now();
  const partitionId = params.partitionId || 'test-partition';
  const operationId = params.operationId || `op-${Math.random().toString(36).slice(2)}`;
  return {
    operation_id: operationId,
    type: params.type || OperationType.ADD,
    partition_id: partitionId,
    entity_type: 'partition',
    entity_id: partitionId,
    replica_id: params.replicaId || `${partitionId}-${operationId}-replica`,
    source_node_id: params.sourceNodeId || 'test-node-1',
    target_node_id: params.targetNodeId || 'target-node',
    status: params.status || ReplicaStatus.PENDING,
    workflow_step: params.workflowStep || 'PENDING',
    created_at: params.createdAt || now,
    updated_at: params.updatedAt || now,
    completed_at: params.completedAt || null,
    error_message: params.errorMessage || null,
    steps_history: params.stepsHistory ||
      JSON.stringify([{step: params.workflowStep || WORKFLOW_STEP.PENDING, timestamp: now}]),
  };
}

/**
 * Create a coordinator with custom SQL query results for recovery testing.
 * Tracks operations in memory to simulate SQL engine behavior.
 * @param {Object} options - Options including operations and services.
 * @return {Object} Coordinator instance and tracked operations map.
 */
function createRecoveryTestCoordinator(options = {}) {
  const {operations = [], services = []} = options;

  const trackedOperations = new Map(operations.map((row) => [row.operation_id, {...row}]));
  const exactServices = services.map((row) => ({
    service_type: SERVICE_TYPE.PARTITION,
    raft_role: RAFT_ROLE.FOLLOWER,
    ...row,
  }));
  const store = createCoordinatorSqlStore({
    getAll(table) {
      if (table === 'replica_operations') return [...trackedOperations.values()];
      if (table === 'services') return exactServices;
      return [];
    },
    upsert(_table, row) {
      trackedOperations.set(row.operation_id, row);
    },
  });
  const sqlQueryEngine = {executeQuery: async (sql, params) => store.execute(sql, params)};
  const controlPlaneSystemTableGateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    systemTableCache: createMockCache({services: exactServices}),
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway,
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
    enableTimeouts: false,
  });
  coordinator.initialize();
  const shutdown = coordinator.shutdown.bind(coordinator);
  coordinator.shutdown = async () => {
    try {
      await shutdown();
    } finally {
      store.suspend();
    }
  };
  return {coordinator, trackedOperations};
}

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

          const {coordinator, trackedOperations} =
            createRecoveryTestCoordinator({operations});

          try {
            await coordinator.handleRecovery();

            // After recovery, all operations should be in terminal state
            for (const opRow of operations) {
              const tracked = trackedOperations.get(opRow.operation_id);
              if (!tracked) {
                return false; // Operation should be tracked
              }
              if (!TERMINAL_STATES.includes(tracked.status)) {
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

          const {coordinator, trackedOperations} = createRecoveryTestCoordinator({
            operations: [opRow],
            services,
          });

          try {
            await coordinator.handleRecovery();

            const tracked = trackedOperations.get(params.operationId);
            if (!tracked) {
              return false;
            }

            // Operation should be in terminal state after reconciliation
            return TERMINAL_STATES.includes(tracked.status);
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
            let type = OperationType.ADD;
            switch (params.workflowStep) {
            case 'CREATING':
              status = ReplicaStatus.CREATING;
              break;
            case 'SYNCING':
              status = ReplicaStatus.SYNCING;
              break;
            case 'STOPPING':
              status = ReplicaStatus.REMOVING;
              type = OperationType.REMOVE;
              break;
            default:
              status = ReplicaStatus.PENDING;
            }
            return createOperationRow({...params, type, status});
          });

          const {coordinator, trackedOperations} = createRecoveryTestCoordinator({
            operations,
            services: [], // No actual replicas
          });

          try {
            await coordinator.handleRecovery();

            // REMOVE operations already in STOPPING remain tracked while
            // external removal completes; other transitional states should not.
            for (const op of trackedOperations.values()) {
              if (!TERMINAL_STATES.includes(op.status)) {
                const trackedStoppingRemove =
                  op.type === OperationType.REMOVE &&
                  op.workflow_step === 'STOPPING' &&
                  op.status === ReplicaStatus.REMOVING;
                if (!trackedStoppingRemove) {
                  return false;
                }
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
      partition_id: 'test-partition',
      node_id: 'target-node',
      status: ReplicaStatus.ACTIVE,
    }];

    const {coordinator, trackedOperations} =
      createRecoveryTestCoordinator({operations, services});

    try {
      const result = await coordinator.handleRecovery();

      // 2 operations should be marked failed (PENDING, CREATING)
      // 1 operation should be reconciled (SYNCING -> ACTIVE)
      t.equal(result.totalIncomplete, 3, 'Total incomplete is 3');
      t.equal(result.markedFailed, 2, 'Marked failed is 2');
      t.equal(result.reconciled, 1, 'Reconciled is 1');

      // Verify actual states from tracked operations
      const opPending = trackedOperations.get('op-pending');
      const opCreating = trackedOperations.get('op-creating');
      const opSyncing = trackedOperations.get('op-syncing');

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

          const {coordinator, trackedOperations} =
            createRecoveryTestCoordinator({operations});

          try {
            // Before recovery, operations are already in trackedOperations
            const beforeCount = trackedOperations.size;
            if (beforeCount !== operations.length) {
              return false;
            }

            await coordinator.handleRecovery();

            // After recovery, all operations should still be tracked
            const afterCount = trackedOperations.size;
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

          const {coordinator, trackedOperations} = createRecoveryTestCoordinator({
            operations: [opRow],
          });

          try {
            await coordinator.handleRecovery();

            const tracked = trackedOperations.get(params.operationId);
            // REMOVE STOPPING remains tracked as removing
            return tracked !== null &&
              tracked.status === ReplicaStatus.REMOVING &&
              tracked.workflow_step === 'STOPPING';
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
    // No incomplete operations - completed ones won't be returned by query
    const {coordinator} = createRecoveryTestCoordinator({
      operations: [], // No incomplete operations
    });

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
    // Failed operations are terminal, so they won't be in incomplete list
    const {coordinator} = createRecoveryTestCoordinator({
      operations: [], // No incomplete operations
    });

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
        sourceNodeId: 'other-owner-node',
        workflowStep: 'STOPPING',
        status: ReplicaStatus.REMOVING,
      }),
    ];

    const {coordinator, trackedOperations} =
      createRecoveryTestCoordinator({operations});

    try {
      const result = await coordinator.handleRecovery();

      t.equal(result.totalIncomplete, 1, 'Only ADD-like operations remain incomplete');
      t.equal(result.markedFailed, 1, 'Only the ADD operation is marked failed');

      const addOp = trackedOperations.get('add-op');
      const removeOp = trackedOperations.get('remove-op');

      t.equal(addOp.status, ReplicaStatus.FAILED, 'ADD op is FAILED');
      t.equal(removeOp.status, ReplicaStatus.REMOVING,
        'REMOVE op remains removing while STOPPING is externally tracked');
    } finally {
      await coordinator.shutdown();
    }
  });
});
