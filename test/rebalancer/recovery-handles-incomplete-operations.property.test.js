/**
 * Property Test: Restart Handles Incomplete Operations
 *
 * Property 8 (revised with the deletion of the startup restart routine): the
 * production restart path is the coordinator timer tick (checkTimeouts, then
 * the level-triggered orphan sweep reconcileOrphanedOperations). For any
 * incomplete operation within its step budget, that tick SHALL NOT fail it
 * merely for being incomplete: a pre-effect row is re-driven or timed out by
 * its owner, an in-flight effect is left to its owner. For a SYNCING
 * operation whose replica has reached an actionable truth, the tick SHALL
 * apply that truth (ACTIVE -> ACTIVE, FAILED -> FAILED).
 *
 * The former clauses "PENDING/SENDING/CREATING/STOPPING are marked FAILED",
 * "a SYNCING row with a missing replica is failed", the recoveryCompleted
 * event and the recovery result/error shape pinned the deleted destructive
 * routine and are retired.
 *
 * Validates: Requirements 7.2, 7.3
 *
 * Feature: simplified-rebalancing-architecture, Property 8
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
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';
import {REBALANCE_COORDINATOR_EVENT} from
  '../../src/rebalancer/rebalancer-constants.js';

// The production restart path (rebalance-coordinator-lifecycle.js
// startTimeoutChecking): step-budget sweep, then orphan sweep.
async function runRestartTimerTick(coordinator) {
  await coordinator.checkTimeouts();
  await coordinator.reconcileOrphanedOperations();
}

/**
 * Create a mock operation row for the SQL engine.
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
    refreshAuthoritativeCacheRow: async () => true,
  };

  // SQL engine that handles operations and services queries
  const sqlEngine = {
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
          return {success: true, rows: [{...service}]};
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

  const coordinator = new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
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
  }));
  coordinator.initialize();

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

test('Property 8: Restart Handles Incomplete Operations', async (t) => {
  const retainedCases = [
    {workflowStep: 'PENDING', status: ReplicaStatus.PENDING},
    {workflowStep: 'SENDING', status: ReplicaStatus.PENDING},
    {workflowStep: 'CREATING', status: ReplicaStatus.CREATING},
    {
      workflowStep: 'STOPPING',
      status: ReplicaStatus.REMOVING,
      type: OperationType.REMOVE,
    },
  ];
  for (const retainedCase of retainedCases) {
    await t.test(
      `operations in ${retainedCase.workflowStep} state are not failed ` +
      'for being incomplete',
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
              const now = Date.now();
              const opRow = createOperationRow({
                ...params,
                ...retainedCase,
                stepsHistory: JSON.stringify([
                  {step: retainedCase.workflowStep, timestamp: now},
                ]),
              });
              const {coordinator, getTrackedOperation} =
                createRecoveryTestCoordinator({operations: [opRow]});
              try {
                await runRestartTimerTick(coordinator);
                const operation = getTrackedOperation(params.operationId);
                return operation !== null &&
                  operation.status !== ReplicaStatus.FAILED &&
                  operation.workflow_step !== 'FAILED';
              } finally {
                await coordinator.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          `Operations in ${retainedCase.workflowStep} state are not failed ` +
          'by the restart tick',
        );
      },
    );
  }

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
            await runRestartTimerTick(coordinator);

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.ACTIVE &&
              operation.workflow_step === 'ACTIVE';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations with ACTIVE replica are completed by the restart tick');
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
            await runRestartTimerTick(coordinator);

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.FAILED &&
              operation.workflow_step === 'FAILED';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('SYNCING operations with FAILED replica are failed by the restart tick');
  });

  await t.test('SYNCING operations with a not-yet-visible replica are left ' +
    'to their owner within the step budget', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationId: fc.uuid(),
          partitionId: fc.uuid(),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (params) => {
          const now = Date.now();
          const opRow = createOperationRow({
            ...params,
            workflowStep: 'SYNCING',
            status: ReplicaStatus.SYNCING,
            stepsHistory: JSON.stringify([{step: 'SYNCING', timestamp: now}]),
          });

          const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
            operations: [opRow],
            services: [],
          });

          try {
            await runRestartTimerTick(coordinator);

            const operation = getTrackedOperation(params.operationId);
            return operation !== null &&
              operation.status === ReplicaStatus.SYNCING &&
              operation.workflow_step === 'SYNCING';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('a fresh SYNCING row is not failed for an absent replica read');
  });

  await t.test('multiple incomplete operations are all retained', async (t) => {
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
        stepsHistory: JSON.stringify([{step: 'SENDING', timestamp: Date.now()}]),
      }),
      createOperationRow({
        operationId: 'op-3',
        workflowStep: 'CREATING',
        status: ReplicaStatus.CREATING,
        stepsHistory: JSON.stringify([{step: 'CREATING', timestamp: Date.now()}]),
      }),
    ];

    const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
      operations,
    });

    try {
      await runRestartTimerTick(coordinator);

      for (const opRow of operations) {
        const op = getTrackedOperation(opRow.operation_id);
        t.not(op.status, ReplicaStatus.FAILED,
          `Operation ${opRow.operation_id} is not failed`);
        t.equal(op.error_message, null,
          `Operation ${opRow.operation_id} carries no failure message`);
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('no restart-completion event exists', async (t) => {
    t.notOk('RECOVERY_COMPLETED' in REBALANCE_COORDINATOR_EVENT,
      'the deleted restart routine\'s completion event is not re-added');
  });

  await t.test('the restart tick over an empty store resolves', async (t) => {
    const {coordinator, trackedOperations} = createRecoveryTestCoordinator({
      operations: [],
    });

    try {
      await runRestartTimerTick(coordinator);
      t.equal(trackedOperations.size, 0, 'no operation is created by a restart');
    } finally {
      await coordinator.shutdown();
    }
  });
});
