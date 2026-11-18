/**
 * Property Test: No Orphaned Replicas After Recovery
 *
 * Property 9: For any node restart, the system SHALL not leave replicas in
 * transitional states without a corresponding operation tracking them.
 *
 * The production restart path is the coordinator timer tick
 * (checkTimeouts, then the level-triggered orphan sweep). The deleted startup
 * routine achieved this property by failing every incomplete row; the timer
 * achieves it through each row's own owner: a row past its step budget is
 * re-driven or timed out to a terminal state, a row within its budget is left
 * to its owner (never failed merely for being incomplete), and a SYNCING row
 * whose replica reached an actionable truth has that truth applied. The
 * generators below are retargeted accordingly: the "every incomplete row is
 * terminal" clauses run over rows past their step budget.
 *
 * Validates: Requirements 7.4
 *
 * Feature: simplified-rebalancing-architecture, Property 9: No Orphaned
 * Replicas After Recovery
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  createReplicaOperationsCasStore,
} from './durable-step-authority-fixture.js';

/**
 * Create a mock operation row for the system table cache.
 * @param {Object} params - Operation parameters.
 * @return {Object} Operation row.
 */
function createOperationRow(params) {
  const now = Date.now();
  const partitionId = params.partitionId || 'test-partition';
  return {
    operation_id: params.operationId || `op-${Math.random().toString(36).slice(2)}`,
    type: params.type || OperationType.ADD,
    partition_id: partitionId,
    entity_type: 'partition',
    entity_id: partitionId,
    replica_id: params.replicaId || null,
    source_node_id: params.sourceNodeId || 'test-node-1',
    target_node_id: params.targetNodeId || 'target-node',
    status: params.status || ReplicaStatus.PENDING,
    workflow_step: params.workflowStep || 'PENDING',
    created_at: params.createdAt || now,
    updated_at: params.updatedAt || now,
    completed_at: params.completedAt || null,
    error_message: params.errorMessage || null,
    steps_history: params.stepsHistory ||
      JSON.stringify([{step: 'PENDING', timestamp: now}]),
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

  // Track operations in memory (simulates SQL engine storage)
  const trackedOperations = new Map();

  // Initialize with provided operations
  for (const op of operations) {
    trackedOperations.set(op.operation_id, {...op});
  }

  function mergeTrackedOperation(operationId, patch = {}) {
    const existing = trackedOperations.get(operationId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      ...patch,
      operation_id: operationId,
    };
    trackedOperations.set(operationId, updated);
    return updated;
  }

  const operationCasStore = createReplicaOperationsCasStore({
    readRow: (operationId) => trackedOperations.get(operationId) || null,
  });
  // SQL engine that tracks operations via INSERT/UPDATE queries
  const sqlQueryEngine = {
    executeQuery: async (sql, params) => {
      // Handle INSERT operations
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, targetClaimKey,
          sourceNodeId, targetNodeId, status, workflowStep, createdAt,
          updatedAt, completedAt, errorMessage, stepsHistory,
        ] = params;

        trackedOperations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          target_claim_key: targetClaimKey,
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
      // A status/step UPDATE honours its CAS guards (shared store); any
      // other replica_operations UPDATE is accepted without effect.
      if (operationCasStore.isStepUpdate(sql)) {
        return operationCasStore.apply(sql, params);
      }
      if (sql.includes('UPDATE replica_operations')) {
        return {success: true};
      }

      // Handle SELECT by operation_id
      if (sql.includes('WHERE operation_id = ?')) {
        const [operationId] = params;
        const op = trackedOperations.get(operationId);
        return {success: true, rows: op ? [op] : []};
      }

      // Handle owner-scoped incomplete operation query (for recovery)
      if (sql.includes('replica_operations') &&
          sql.includes('source_node_id = ?') &&
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
        const allOps = Array.from(trackedOperations.values());
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

      // Handle SELECT all operations
      if (sql.includes('SELECT * FROM replica_operations') &&
          sql.includes('ORDER BY')) {
        return {success: true, rows: Array.from(trackedOperations.values())};
      }

      // Handle SELECT services (for reconciliation)
      if (sql.includes('services') && sql.includes('service_id = ?')) {
        const [serviceId] = params;
        const service = services.find((s) => s.service_id === serviceId);
        return {success: true, rows: service ? [service] : []};
      }

      // Handle SELECT services by partition and node
      if (sql.includes('services') && sql.includes('partition_id = ?') &&
          sql.includes('node_id = ?')) {
        const [partitionId, nodeId] = params;
        const service = services.find((s) =>
          s.partition_id === partitionId && s.node_id === nodeId);
        return {success: true, rows: service ? [service] : []};
      }

      return {success: true, rows: []};
    },
  };

  const controlPlaneSystemTableGateway = {
    readAuthoritativeRows: async (_tableName, sql, params = []) =>
      sqlQueryEngine.executeQuery(sql, params),
    readRows: async (_tableName, sql, params = []) =>
      sqlQueryEngine.executeQuery(sql, params),
    executeQuery: async (sql, params = []) =>
      sqlQueryEngine.executeQuery(sql, params),
    async submitMutation(mutation) {
      if (mutation?.tableName !== 'replica_operations') {
        return {success: true, partitionResult: {affectedRows: 1}};
      }

      if (mutation.operation === 'insert') {
        const row = {
          ...mutation.row,
          operation_id: mutation.row?.operation_id ?? mutation.row?.operationId,
        };
        trackedOperations.set(row.operation_id, row);
        return {success: true, partitionResult: {affectedRows: 1}};
      }

      if (mutation.operation === 'update') {
        const whereClause = mutation.whereClause || mutation.where || {};
        const operationId =
          whereClause.operation_id ?? whereClause.operationId ?? null;
        if (operationId) {
          mergeTrackedOperation(operationId, mutation.data || {});
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      }

      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    systemTableCache: createMockCache({services}),
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
  return {coordinator, trackedOperations};
}

// Far past every step and operation budget.
const STALE_AGE_MS = 24 * 60 * 60 * 1000;

function staleTiming(workflowStep) {
  const staleAtMs = Date.now() - STALE_AGE_MS;
  return {
    createdAt: staleAtMs,
    updatedAt: staleAtMs,
    stepsHistory: JSON.stringify([{step: workflowStep, timestamp: staleAtMs}]),
  };
}

function freshTiming(workflowStep) {
  const nowMs = Date.now();
  return {
    createdAt: nowMs,
    updatedAt: nowMs,
    stepsHistory: JSON.stringify([{step: workflowStep, timestamp: nowMs}]),
  };
}

// The production restart path (rebalance-coordinator-lifecycle.js
// startTimeoutChecking). The empty-cache deferral is disabled so the
// step-budget sweep reads the owner's rows on this tick.
async function runRestartTimerTick(coordinator) {
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
  await coordinator.checkTimeouts();
  await coordinator.reconcileOrphanedOperations();
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
  await t.test('every incomplete operation past its step budget is terminal ' +
    'after the restart tick', async (t) => {
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
            ...staleTiming(params.workflowStep),
            status: params.workflowStep === 'CREATING' ?
              ReplicaStatus.CREATING : ReplicaStatus.PENDING,
          }));

          const {coordinator, trackedOperations} =
            createRecoveryTestCoordinator({operations});

          try {
            await runRestartTimerTick(coordinator);

            for (const opRow of operations) {
              const tracked = trackedOperations.get(opRow.operation_id);
              if (!tracked) {
                return false; // Operation should be tracked
              }
              if (!TERMINAL_STATES.includes(tracked.status)) {
                return false; // Its owner retired it
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

    t.pass('Every stale incomplete operation is retired by the restart tick');
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
            ...staleTiming('SYNCING'),
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
            await runRestartTimerTick(coordinator);

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

  await t.test('no stale operation left in transitional state after the ' +
    'restart tick', async (t) => {
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
            return createOperationRow({
              ...params, type, status, ...staleTiming(params.workflowStep),
            });
          });

          const {coordinator, trackedOperations} = createRecoveryTestCoordinator({
            operations,
            services: [], // No actual replicas
          });

          try {
            await runRestartTimerTick(coordinator);

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

    t.pass('No stale operation left in transitional state after the restart tick');
  });

  await t.test('the restart tick fails no fresh row and applies an ' +
    'actionable SYNCING truth', async (t) => {
    const operations = [
      createOperationRow({
        operationId: 'op-pending',
        workflowStep: 'PENDING',
        status: ReplicaStatus.PENDING,
        ...freshTiming('PENDING'),
      }),
      createOperationRow({
        operationId: 'op-creating',
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
        ...freshTiming('CREATING'),
      }),
      createOperationRow({
        operationId: 'op-syncing',
        replicaId: 'replica-syncing',
        workflowStep: 'SYNCING',
        status: ReplicaStatus.SYNCING,
        ...freshTiming('SYNCING'),
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
      await runRestartTimerTick(coordinator);

      const opPending = trackedOperations.get('op-pending');
      const opCreating = trackedOperations.get('op-creating');
      const opSyncing = trackedOperations.get('op-syncing');

      t.not(opPending.status, ReplicaStatus.FAILED,
        'a fresh PENDING op is not failed for being incomplete');
      t.not(opCreating.status, ReplicaStatus.FAILED,
        'a fresh CREATING op (in-flight effect) is left to its owner');
      t.equal(opSyncing.status, ReplicaStatus.ACTIVE, 'SYNCING op is ACTIVE');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('the restart tick neither drops nor duplicates operation rows',
    async (t) => {
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
              const beforeCount = trackedOperations.size;
              if (beforeCount !== operations.length) {
                return false;
              }

              await runRestartTimerTick(coordinator);

              return trackedOperations.size === operations.length;
            } finally {
              await coordinator.shutdown();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('The restart tick neither drops nor duplicates operation rows');
    });

  await t.test('REMOVE operations in STOPPING are left to their owner',
    async (t) => {
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
              ...freshTiming('STOPPING'),
            });

            const {coordinator, trackedOperations} =
              createRecoveryTestCoordinator({operations: [opRow]});

            try {
              await runRestartTimerTick(coordinator);

              const tracked = trackedOperations.get(params.operationId);
              // An in-flight removal is never failed by a restart.
              return tracked !== null &&
                tracked.status !== ReplicaStatus.FAILED &&
                tracked.workflow_step !== 'FAILED';
            } finally {
              await coordinator.shutdown();
            }
          },
        ),
        {numRuns: 10},
      );

      t.pass('REMOVE operations in STOPPING are not failed by the restart tick');
    });

  await t.test('terminal operations are not touched by the restart tick',
    async (t) => {
      const completedAt = Date.now();
      const operations = [
        createOperationRow({
          operationId: 'op-done',
          workflowStep: 'ACTIVE',
          status: ReplicaStatus.ACTIVE,
          completedAt,
        }),
        createOperationRow({
          operationId: 'op-failed',
          workflowStep: 'FAILED',
          status: ReplicaStatus.FAILED,
          completedAt,
          errorMessage: 'earlier failure',
        }),
      ];
      const {coordinator, trackedOperations} =
        createRecoveryTestCoordinator({operations});

      try {
        await runRestartTimerTick(coordinator);

        t.same(trackedOperations.get('op-done'), operations[0],
          'a completed operation is unchanged');
        t.same(trackedOperations.get('op-failed'), operations[1],
          'a failed operation is not reprocessed');
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('mixed operation types: no fresh row is failed', async (t) => {
    const operations = [
      createOperationRow({
        operationId: 'add-op',
        type: OperationType.ADD,
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
        ...freshTiming('CREATING'),
      }),
      createOperationRow({
        operationId: 'remove-op',
        type: OperationType.REMOVE,
        replicaId: 'replica-to-remove',
        workflowStep: 'STOPPING',
        status: ReplicaStatus.REMOVING,
        ...freshTiming('STOPPING'),
      }),
    ];

    const {coordinator, trackedOperations} =
      createRecoveryTestCoordinator({operations});

    try {
      await runRestartTimerTick(coordinator);

      const addOp = trackedOperations.get('add-op');
      const removeOp = trackedOperations.get('remove-op');

      t.not(addOp.status, ReplicaStatus.FAILED,
        'the in-flight ADD is left to its owner');
      t.not(removeOp.status, ReplicaStatus.FAILED,
        'the in-flight REMOVE is left to its owner');
    } finally {
      await coordinator.shutdown();
    }
  });
});
