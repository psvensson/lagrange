/**
 * Owner-path convergence tests for RebalanceCoordinator.
 *
 * Proves that recovery, polling/timeout, and event-triggered
 * progression all route through the same owner-key reconcile
 * queue (operationWorkflowRunExclusive / DurableWorkflowCoordinator
 * .runExclusive). No alternate mutation path exists outside the
 * reconcile queue.
 *
 * Validates: Requirements 1.4, 6, 8
 * Design: §2, Phase 2
 * System Guidelines: §1.6 — Deterministic Control-Plane Progression
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  ExecutorOutcomeEmitter,
} from '../../src/rebalancer/executor-outcome-emitter.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  createMockControlPlaneReadinessService,
} from './test-helpers.js';

const TEST_NODE_ID = 'convergence-node';
const TEST_PARTITION_ID = 'partition-conv-1';
const TEST_REPLICA_ID = 'partition-conv-1-r1';
const TEST_OPERATION_ID = 'op-conv-1';

function buildOperationOwnerKey(operationId) {
  return `operation:${operationId}`;
}

function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

/**
 * Build a minimal operation row for the mock SQL engine.
 * @param {Object} overrides - Field overrides.
 * @return {Object} Operation row.
 */
function buildOperationRow(overrides = {}) {
  const now = Date.now();
  return {
    operation_id: overrides.operationId || TEST_OPERATION_ID,
    type: overrides.type || OperationType.ADD,
    partition_id: overrides.partitionId || TEST_PARTITION_ID,
    entity_type: overrides.entityType || 'partition',
    entity_id: overrides.entityId || TEST_PARTITION_ID,
    replica_id: overrides.replicaId || TEST_REPLICA_ID,
    source_node_id: overrides.sourceNodeId || TEST_NODE_ID,
    target_node_id: overrides.targetNodeId || TEST_NODE_ID,
    status: overrides.status || ReplicaStatus.PENDING,
    workflow_step: overrides.workflowStep || WORKFLOW_STEP.PENDING,
    created_at: overrides.createdAt || now,
    updated_at: overrides.updatedAt || now,
    completed_at: overrides.completedAt || null,
    error_message: overrides.errorMessage || null,
    steps_history: overrides.stepsHistory ||
      JSON.stringify([{step: WORKFLOW_STEP.PENDING, timestamp: now}]),
  };
}

/**
 * Create a coordinator that records every ownerKey passed to
 * runExclusive, allowing tests to prove that all three entry
 * points converge on the same reconcile queue.
 * @param {Object} options - Test options.
 * @return {Object} Coordinator, emitter, and recorded owner keys.
 */
function createConvergenceCoordinator(options = {}) {
  const {
    operationRows = [],
    serviceRows = [],
  } = options;

  const emitter = new ExecutorOutcomeEmitter({logger: console});
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const recordedOwnerKeys = [];
  const originalRunExclusive =
    workflowCoordinator.runExclusive.bind(workflowCoordinator);

  workflowCoordinator.runExclusive = (ownerKey, factory) => {
    recordedOwnerKeys.push(ownerKey);
    return originalRunExclusive(ownerKey, factory);
  };

  const operationMap = new Map();
  for (const row of operationRows) {
    operationMap.set(row.operation_id, {...row});
  }

  const sqlEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO replica_operations')) {
        return {success: true};
      }
      if (sql.includes('UPDATE replica_operations')) {
        const operationId = params?.[7];
        const existing = operationMap.get(operationId);
        if (existing) {
          existing.status = params[0];
          existing.workflow_step = params[1];
          existing.updated_at = params[2];
          existing.completed_at = params[3];
          existing.error_message = params[4];
          existing.steps_history = params[5];
          existing.replica_id = params[6];
        }
        return {success: true};
      }
      if (sql.includes('services') &&
          sql.includes('service_id')) {
        const replicaId = params?.[0];
        const matching = serviceRows.filter((s) => {
          return (s.service_id || s.replica_id) === replicaId;
        });
        return {
          success: true,
          rows: matching.length > 0 ?
            [{status: matching[0].status}] : [],
        };
      }
      if (sql.includes('services') &&
          sql.includes('partition_id')) {
        const partitionId = params?.[0];
        const nodeId = params?.[1];
        const matching = serviceRows.filter(
          (s) => s.partition_id === partitionId &&
            s.node_id === nodeId,
        );
        return {
          success: true,
          rows: matching.length > 0 ?
            [{status: matching[0].status}] : [],
        };
      }
      if (sql.includes('WHERE operation_id')) {
        const opId = params?.[0];
        const row = operationMap.get(opId);
        return {success: true, rows: row ? [row] : []};
      }
      if (sql.includes('replica_operations')) {
        const allOps = Array.from(operationMap.values());
        const incomplete = allOps.filter(
          (op) => !['active', 'removed', 'failed']
            .includes(op.status),
        );
        return {success: true, rows: incomplete};
      }
      return {success: true, rows: []};
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      getAll(tableName) {
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return Array.from(operationMap.values());
        }
        if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
          return [...serviceRows];
        }
        return [];
      },
      get(tableName, key) {
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return operationMap.get(key) || null;
        }
        if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
          return serviceRows.find((row) => {
            return row.service_id === key || row.replica_id === key;
          }) || null;
        }
        return null;
      },
      filter(tableName, predicate) {
        const rows = this.getAll(tableName);
        return rows.filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: sqlEngine,
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    enableTimeouts: false,
  });
  coordinator.initialize();

  return {coordinator, emitter, recordedOwnerKeys, operationMap};
}

test('Owner-path convergence: all progression entry points ' +
  'route through runExclusive', async (t) => {
  await t.test(
    'recovery routes per-operation work through ' +
    'operationWorkflowRunExclusive',
    async (t) => {
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.PENDING,
        status: ReplicaStatus.PENDING,
      });
      const {coordinator, recordedOwnerKeys} =
        createConvergenceCoordinator({operationRows: [opRow]});

      try {
        await coordinator.handleRecovery();

        const recoveryKeys = recordedOwnerKeys.filter((k) => {
          return k === buildOperationOwnerKey(TEST_OPERATION_ID);
        });
        t.ok(
          recoveryKeys.length > 0,
          'recovery must route through runExclusive ' +
          'with the shared per-operation owner key',
        );
        t.equal(
          recoveryKeys[0],
          buildOperationOwnerKey(TEST_OPERATION_ID),
          'recovery owner key must match the shared operation owner key',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'checkTimeouts routes per-operation work through ' +
    'operationWorkflowRunExclusive',
    async (t) => {
      const now = Date.now();
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: ReplicaStatus.SYNCING,
        // Set updatedAt far in the past to trigger timeout
        updatedAt: now - 600000,
        createdAt: now - 600000,
      });
      const {coordinator, recordedOwnerKeys} =
        createConvergenceCoordinator({operationRows: [opRow]});

      try {
        await coordinator.checkTimeouts();

        const timeoutKeys = recordedOwnerKeys.filter((k) => {
          return k === buildOperationOwnerKey(TEST_OPERATION_ID);
        });
        t.ok(
          timeoutKeys.length > 0,
          'checkTimeouts must route through runExclusive ' +
          'with the shared per-operation owner key',
        );
        t.equal(
          timeoutKeys[0],
          buildOperationOwnerKey(TEST_OPERATION_ID),
          'timeout owner key must match the shared operation owner key',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'handleExecutorOutcome routes through ' +
    'operationWorkflowRunExclusive',
    async (t) => {
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
      });
      const {coordinator, emitter, recordedOwnerKeys} =
        createConvergenceCoordinator({operationRows: [opRow]});

      try {
        emitter.emitOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
          TEST_OPERATION_ID,
          WORKFLOW_STEP.SYNCING,
        );

        await new Promise((r) => setImmediate(r));

        const outcomeKeys = recordedOwnerKeys.filter((k) => {
          return k === buildOperationOwnerKey(TEST_OPERATION_ID);
        });
        t.ok(
          outcomeKeys.length > 0,
          'executor outcome must route through runExclusive ' +
          'with the shared per-operation owner key',
        );
        t.equal(
          outcomeKeys[0],
          buildOperationOwnerKey(TEST_OPERATION_ID),
          'outcome owner key must match the shared operation owner key',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'all three entry points use the same runExclusive ' +
    'mechanism for the same operation',
    async (t) => {
      // Use three separate operations so they don't collide
      // in the single-flight map.
      const recoveryOp = buildOperationRow({
        operationId: 'op-recovery-path',
        workflowStep: WORKFLOW_STEP.PENDING,
        status: ReplicaStatus.PENDING,
      });
      const timeoutOp = buildOperationRow({
        operationId: 'op-timeout-path',
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: ReplicaStatus.SYNCING,
        updatedAt: Date.now() - 600000,
        createdAt: Date.now() - 600000,
      });
      const outcomeOp = buildOperationRow({
        operationId: 'op-outcome-path',
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
      });

      const {coordinator, emitter, recordedOwnerKeys} =
        createConvergenceCoordinator({
          operationRows: [recoveryOp, timeoutOp, outcomeOp],
        });

      try {
        // Trigger all three entry points
        await coordinator.handleRecovery();

        await coordinator.checkTimeouts();

        emitter.emitOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
          'op-outcome-path',
          WORKFLOW_STEP.SYNCING,
        );
        await new Promise((r) => setImmediate(r));

        const hasRecovery = recordedOwnerKeys.includes(
          buildOperationOwnerKey('op-recovery-path'),
        );
        const hasTimeout = recordedOwnerKeys.includes(
          buildOperationOwnerKey('op-timeout-path'),
        );
        const hasOutcome = recordedOwnerKeys.includes(
          buildOperationOwnerKey('op-outcome-path'),
        );

        t.ok(hasRecovery, 'recovery path recorded');
        t.ok(hasTimeout, 'timeout path recorded');
        t.ok(hasOutcome, 'outcome path recorded');

        // All keys must be non-empty strings (proving they
        // went through the same runExclusive mechanism)
        const allValid = recordedOwnerKeys.every((k) => {
          return typeof k === 'string' &&
            k.startsWith('operation:');
        });
        t.ok(
          allValid,
          'all owner keys are valid strings from the ' +
          'same runExclusive mechanism',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'timeout and executor outcomes serialize through the same owner key ' +
    'for FAILED transitions',
    async (t) => {
      const operationId = 'op-shared-failed-path';
      const now = Date.now();
      const opRow = buildOperationRow({
        operationId,
        type: OperationType.REMOVE,
        workflowStep: WORKFLOW_STEP.STOPPING,
        status: ReplicaStatus.REMOVING,
        updatedAt: now - 600000,
        createdAt: now - 600000,
      });

      const emitter = new ExecutorOutcomeEmitter({logger: console});
      const workflowCoordinator = new DurableWorkflowCoordinator();
      const recordedOwnerKeys = [];
      const originalRunExclusive =
        workflowCoordinator.runExclusive.bind(workflowCoordinator);
      workflowCoordinator.runExclusive = (ownerKey, factory) => {
        recordedOwnerKeys.push(ownerKey);
        return originalRunExclusive(ownerKey, factory);
      };

      const operationMap = new Map([[operationId, {...opRow}]]);
      const serviceRows = [{
        service_id: TEST_REPLICA_ID,
        replica_id: TEST_REPLICA_ID,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        status: ReplicaStatus.REMOVING,
      }];
      let failedPersistStartedResolve;
      const failedPersistStarted = new Promise((resolve) => {
        failedPersistStartedResolve = resolve;
      });
      let releaseFailedPersistResolve;
      const releaseFailedPersist = new Promise((resolve) => {
        releaseFailedPersistResolve = resolve;
      });
      let blockedFailedPersist = false;
      const beginCalls = [];
      let failedBeginCalls = 0;
      const activeSessions = new Set();

      const coordinator = new RebalanceCoordinator({
        nodeId: TEST_NODE_ID,
        transactionCoordinator: {
          async begin(sessionId) {
            beginCalls.push(sessionId);
            if (activeSessions.has(sessionId)) {
              failedBeginCalls += 1;
              return {
                success: false,
                error: 'Transaction already active for this session',
              };
            }
            activeSessions.add(sessionId);
            return {success: true};
          },
          async commit(sessionId) {
            activeSessions.delete(sessionId);
            return {success: true};
          },
          async rollback(sessionId) {
            activeSessions.delete(sessionId);
            return {success: true};
          },
        },
        systemTableCache: {
          getAll(tableName) {
            if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return Array.from(operationMap.values());
            }
            if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
              return [...serviceRows];
            }
            return [];
          },
          get(tableName, key) {
            if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return operationMap.get(key) || null;
            }
            if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
              return serviceRows.find((row) => {
                return row.service_id === key || row.replica_id === key;
              }) || null;
            }
            return null;
          },
          filter(tableName, predicate) {
            const rows = this.getAll(tableName);
            return rows.filter(predicate);
          },
        },
        cdcIntegrationService: {
          async waitForCacheUpdate() {},
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'initiated'};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql, params) {
            if (sql.includes('UPDATE replica_operations')) {
              const opId = params?.[7];
              const existing = operationMap.get(opId);
              if (existing) {
                if (params?.[1] === WORKFLOW_STEP.FAILED &&
                    !blockedFailedPersist) {
                  blockedFailedPersist = true;
                  failedPersistStartedResolve();
                  await releaseFailedPersist;
                }
                existing.status = params[0];
                existing.workflow_step = params[1];
                existing.updated_at = params[2];
                existing.completed_at = params[3];
                existing.error_message = params[4];
                existing.steps_history = params[5];
                existing.replica_id = params[6];
              }
              return {success: true, changes: 1};
            }
            if (sql.includes('WHERE operation_id')) {
              const opId = params?.[0];
              const row = operationMap.get(opId);
              return {success: true, rows: row ? [row] : []};
            }
            if (sql.includes('FROM services') &&
                sql.includes('service_id = ?')) {
              const replicaId = params?.[0];
              const row = serviceRows.find((service) => {
                return service.service_id === replicaId ||
                  service.replica_id === replicaId;
              });
              return {
                success: true,
                rows: row ? [{status: row.status}] : [],
              };
            }
            if (sql.includes('FROM services') &&
                sql.includes('partition_id = ?') &&
                sql.includes('node_id = ?')) {
              const partitionId = params?.[0];
              const nodeId = params?.[1];
              const row = serviceRows.find((service) => {
                return service.partition_id === partitionId &&
                  service.node_id === nodeId;
              });
              return {
                success: true,
                rows: row ? [{status: row.status}] : [],
              };
            }
            if (sql.includes('replica_operations')) {
              return {success: true, rows: Array.from(operationMap.values())};
            }
            return {success: true, rows: []};
          },
        },
        storageAdmissionService: {
          checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
          checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
        },
        storageAccountingService: {estimateReplicaBytes: () => 1},
        controlPlaneReadinessService: createMockControlPlaneReadinessService(),
        operationWorkflowCoordinator: workflowCoordinator,
        executorOutcomeEmitter: emitter,
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const timeoutPromise = coordinator.checkTimeouts();
        await Promise.race([
          failedPersistStarted,
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Timed out waiting for FAILED persistence gate'));
            }, 2000);
          }),
        ]);

        emitter.emitOutcome(
          EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
          operationId,
          WORKFLOW_STEP.FAILED,
          {errorMessage: 'replica removal failed'},
        );

        await new Promise((resolve) => setImmediate(resolve));
        releaseFailedPersistResolve();
        await timeoutPromise;
        await workflowCoordinator
          .inFlightExecutionsByOwnerKey
          .get(buildOperationOwnerKey(operationId));

        t.equal(
          failedBeginCalls,
          0,
          'shared owner key should prevent overlapping FAILED transitions',
        );
        t.same(
          beginCalls,
          [`${operationId}:${WORKFLOW_STEP.FAILED}`],
          'FAILED transition should begin exactly one transaction session',
        );
        t.same(
          recordedOwnerKeys,
          [
            buildOperationOwnerKey(operationId),
            buildOperationOwnerKey(operationId),
          ],
          'timeout and outcome paths must share the same owner key',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'recovery reconciles SYNCING operations through the ' +
    'same owner path as event-triggered progression',
    async (t) => {
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: ReplicaStatus.SYNCING,
      });
      const serviceRow = {
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        status: ReplicaStatus.ACTIVE,
      };
      const {coordinator, recordedOwnerKeys} =
        createConvergenceCoordinator({
          operationRows: [opRow],
          serviceRows: [serviceRow],
        });

      try {
        await coordinator.handleRecovery();

        const recoveryKeys = recordedOwnerKeys.filter((k) => {
          return k === buildOperationOwnerKey(TEST_OPERATION_ID);
        });
        t.ok(
          recoveryKeys.length > 0,
          'SYNCING reconciliation during recovery must ' +
          'route through runExclusive',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'checkTimeouts reconciles progress through the same ' +
    'owner path before evaluating timeout',
    async (t) => {
      // Operation is SYNCING with an ACTIVE replica — should
      // be reconciled (completed) rather than timed out.
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.SYNCING,
        status: ReplicaStatus.SYNCING,
        updatedAt: Date.now() - 600000,
        createdAt: Date.now() - 600000,
      });
      const serviceRow = {
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        status: ReplicaStatus.ACTIVE,
      };
      const {coordinator, recordedOwnerKeys, operationMap} =
        createConvergenceCoordinator({
          operationRows: [opRow],
          serviceRows: [serviceRow],
        });

      try {
        await coordinator.checkTimeouts();

        const timeoutKeys = recordedOwnerKeys.filter((k) => {
          return k === buildOperationOwnerKey(TEST_OPERATION_ID);
        });
        t.ok(
          timeoutKeys.length > 0,
          'progress reconciliation during timeout check ' +
          'must route through runExclusive',
        );

        // The operation should be completed (reconciled),
        // not failed by timeout.
        const finalOp = operationMap.get(TEST_OPERATION_ID);
        t.equal(
          finalOp.workflow_step,
          WORKFLOW_STEP.ACTIVE,
          'operation should be completed via reconciliation ' +
          'not failed by timeout',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );
});
