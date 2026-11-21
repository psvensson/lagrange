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
import {REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG} from
  '../../src/rebalancer/rebalancer-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OPERATION_RECONCILE_OUTCOME} from
  '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createCoordinatorSqlStore,
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createMockPolicyService,
  createMockMessageRouter,
} from './test-helpers.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';

const {OPERATION_OWNER_ACTION} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Create a mock operation row for the SQL engine.
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
    target_node_id: params.targetNodeId || 'test-node-1',
    status: params.status || ReplicaStatus.PENDING,
    workflow_step: params.workflowStep || 'PENDING',
    created_at: params.createdAt || now,
    updated_at: params.updatedAt || now,
    completed_at: params.completedAt || null,
    error_message: params.errorMessage || null,
    steps_history: params.stepsHistory || JSON.stringify([
      {step: params.workflowStep || WORKFLOW_STEP.PENDING, timestamp: now},
    ]),
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
    unavailableReplicaId,
  } = options;

  // Mirror committed SQLite operation rows for assertions.
  const trackedOperations = new Map();
  operations.forEach((op) => trackedOperations.set(op.operation_id, {...op}));

  // Track services for replica status lookup
  const trackedServices = new Map();
  services.forEach((row) => trackedServices.set(row.service_id, {
    service_type: SERVICE_TYPE.PARTITION,
    raft_role: RAFT_ROLE.FOLLOWER,
    ...row,
  }));

  // Mock CDC service
  const cdcService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    refreshAuthoritativeCacheRow: async () => true,
  };

  const store = createCoordinatorSqlStore({
    getAll(table) {
      if (table === 'replica_operations') return [...trackedOperations.values()];
      if (table === 'services') return [...trackedServices.values()];
      return [];
    },
    upsert(_table, row) {
      trackedOperations.set(row.operation_id, row);
    },
  });
  const sqlEngine = {
    async executeQuery(sql, params) {
      if (unavailableReplicaId && sql.includes('FROM services') && params[0] === unavailableReplicaId) {
        return {success: false, error: 'authoritative_row_source_unavailable'};
      }
      return store.execute(sql, params);
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

  const shutdown = coordinator.shutdown.bind(coordinator);
  coordinator.shutdown = async () => {
    try {
      await shutdown();
    } finally {
      store.suspend();
    }
  };

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

test('recovery reports the committed terminal branch and leaves pending outcomes uncounted', async (t) => {
  const rows = [
    ['pending-completes', WORKFLOW_STEP.PENDING, ReplicaStatus.PENDING, ReplicaStatus.ACTIVE],
    ['syncing-fails', WORKFLOW_STEP.SYNCING, ReplicaStatus.SYNCING, ReplicaStatus.FAILED],
    ['pending-refused', WORKFLOW_STEP.PENDING, ReplicaStatus.PENDING, null],
    ['syncing-waits', WORKFLOW_STEP.SYNCING, ReplicaStatus.SYNCING, ReplicaStatus.SYNCING],
  ];
  const operations = rows.map(([operationId, workflowStep, status]) =>
    createOperationRow({operationId, replicaId: operationId + '-replica', workflowStep, status}));
  const services = rows.flatMap(([operationId, , , status]) => status === null ? [] : [{
    service_id: operationId + '-replica',
    partition_id: 'test-partition',
    node_id: 'test-node-1',
    status,
  }]);
  const {coordinator, getTrackedOperation} = createRecoveryTestCoordinator({
    operations, services, unavailableReplicaId: 'pending-refused-replica',
  });
  const recoveryLogs = [];
  const recoveryEvents = [];
  const failedEvents = [];
  const completedEvents = [];
  const reconcileOutcomes = new Map();
  const owner = coordinator.workflowOwner;
  const reconcile = owner.reconcileOperationLifecycle.bind(owner);
  const pendingEntered = Promise.withResolvers();
  const resumePending = Promise.withResolvers();
  owner.reconcileOperationLifecycle = async (operation, options) => {
    if (operation.operationId === 'pending-completes') {
      pendingEntered.resolve(operation);
      await resumePending.promise;
    }
    const outcome = await reconcile(operation, options);
    reconcileOutcomes.set(operation.operationId, outcome);
    return outcome;
  };
  owner.logger = {
    info: (message, detail) => recoveryLogs.push({message, detail}),
    warn() {},
    error() {},
    debug() {},
  };
  coordinator.on(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED,
    (summary) => recoveryEvents.push(summary));
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
    ({operation}) => failedEvents.push(operation.operationId));
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
    ({operation}) => completedEvents.push(operation.operationId));
  coordinator.initialize();
  try {
    const recovery = coordinator.handleRecovery();
    const pending = await pendingEntered.promise;
    const joiningAction = owner.runOperationOwnerAction(OPERATION_OWNER_ACTION.EXECUTE, pending);
    resumePending.resolve();
    const summary = await recovery;
    t.equal(await joiningAction, OPERATION_RECONCILE_OUTCOME.COMPLETED,
      'a non-retaining action shares the exact result of the held recovery lane');
    t.same(operations.map(({operation_id: id}) => getTrackedOperation(id).workflow_step),
      [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.FAILED, WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SYNCING],
      'authoritative state carries both opposite terminal outcomes and retains two live rows');
    t.equal(summary.markedFailed, 1, 'only the durably failed SYNCING row counts as a failure');
    t.equal(summary.reconciled, 1, 'only the durably completed PENDING row counts as reconciled');
    t.same(summary.errors, [], 'ordinary refusal and waiting do not become thrown errors');
    t.equal(reconcileOutcomes.get('pending-refused'), OPERATION_RECONCILE_OUTCOME.REFUSED,
      'real authority unavailability takes the normal named refusal');
    t.equal(reconcileOutcomes.get('syncing-waits'), OPERATION_RECONCILE_OUTCOME.WAITING,
      'the observable live SYNCING row takes the normal named wait');
    t.same(failedEvents, ['syncing-fails'], 'failure event identifies the durable FAILED row');
    t.same(completedEvents, ['pending-completes'], 'completion event identifies the durable ACTIVE row');
    t.same(recoveryEvents, [summary], 'the public recovery event publishes the exact returned counters');
    const failureLogs = recoveryLogs.filter(({message}) =>
      message === REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_OBSERVED_FAILURE);
    t.same(failureLogs.map(({detail}) => detail.operationId), ['syncing-fails'],
      'only observed durable failure receives failure-settlement diagnostics');
    const summaryLog = recoveryLogs.find(({message}) =>
      message === REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED);
    t.same(summaryLog?.detail, {nodeId: 'test-node-1', ...summary},
      'completion diagnostics and public event agree after reservation and debt accounting');
    const direct = await owner.handleRecovery();
    t.equal(direct.totalIncomplete, 2, 'direct recovery rediscovers the same retained operations');
    t.equal(direct.markedFailed + direct.reconciled, 0,
      'direct recovery reports no progress without a terminal or advancing outcome');
    t.same(failedEvents, ['syncing-fails'], 'direct recovery does not emit a second terminal failure');
  } finally {
    await coordinator.shutdown();
  }
});

test('Property 8: Recovery Handles Incomplete Operations', async (t) => {
  const failureRecoveryCases = [
    {workflowStep: 'PENDING', status: ReplicaStatus.PENDING},
    {workflowStep: 'SENDING', status: ReplicaStatus.PENDING},
    {workflowStep: 'CREATING', status: ReplicaStatus.CREATING},
    {
      workflowStep: 'STOPPING',
      status: ReplicaStatus.REMOVING,
      type: OperationType.REMOVE,
    },
  ];
  for (const recoveryCase of failureRecoveryCases) {
    await t.test(
      `operations in ${recoveryCase.workflowStep} state are marked FAILED`,
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
              const opRow = createOperationRow({...params, ...recoveryCase});
              const {coordinator, getTrackedOperation} =
                createRecoveryTestCoordinator({operations: [opRow]});
              try {
                const result = await coordinator.handleRecovery();
                const operation = getTrackedOperation(params.operationId);
                return operation?.status === ReplicaStatus.FAILED &&
                  operation.workflow_step === 'FAILED' &&
                  result.markedFailed === 1;
              } finally {
                await coordinator.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
        t.pass(
          `Operations in ${recoveryCase.workflowStep} state are marked ` +
          'FAILED during recovery',
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
              result.markedFailed === 1 && result.reconciled === 0;
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
              result.markedFailed === 1 && result.reconciled === 0;
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
