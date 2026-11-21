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

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
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
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  createCoordinatorSqlStore,
  createMockControlPlaneReadinessService,
  createMockControlPlaneSystemTableGateway,
  withFixtureReplaceWitness,
} from './test-helpers.js';

import {createDeterministicTimerQueue} from './reservation-dispatch-gate-test-harness.js';

const TEST_NODE_ID = 'convergence-node';
const TEST_PARTITION_ID = 'partition-conv-1';
const TEST_REPLICA_ID = 'partition-conv-1-r1';
const TEST_OPERATION_ID = 'op-conv-1';
const TEST_OBSERVED_PROGRESS_REPLACE_OPERATION_ID =
  'op-observed-progress-replace-fallback';
const TEST_OBSERVED_PROGRESS_TARGET_NODE_ID = 'node-target';
const TEST_OBSERVED_PROGRESS_SOURCE_REPLICA_ID = 'partition-conv-1-r1';
const TEST_OBSERVED_PROGRESS_TARGET_REPLICA_ID = 'partition-conv-1-r2';
const TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID =
  'op-deferred-dispatch-retry-fallback';
const TEST_DEFERRED_DISPATCH_RETRY_PARTITION_ID = 'sql_write_operations-p1';
const TEST_DEFERRED_DISPATCH_RETRY_SOURCE_NODE_ID = 'node-remote';
const TEST_DEFERRED_DISPATCH_RETRY_ACTION = 'dispatch';
const TEST_DEFERRED_DISPATCH_RETRY_COMPLETION_STATE = 'deferred';
const TEST_DEFERRED_DISPATCH_RETRY_VISIBILITY_DEFERRED_SOURCE =
  'test-deferred-dispatch-retry-visibility';
const TEST_DEFERRED_DISPATCH_RETRY_VISIBILITY_RETRY_AFTER_MS = 50;

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
    source_replica_id: overrides.sourceReplicaId || null,
    source_node_id: overrides.sourceNodeId || TEST_NODE_ID,
    target_node_id: overrides.targetNodeId || TEST_NODE_ID,
    status: overrides.status || ReplicaStatus.PENDING,
    workflow_step: overrides.workflowStep || WORKFLOW_STEP.PENDING,
    created_at: overrides.createdAt || now,
    updated_at: overrides.updatedAt || now,
    completed_at: overrides.completedAt || null,
    error_message: overrides.errorMessage || null,
    steps_history: overrides.stepsHistory ||
      JSON.stringify([{
        step: overrides.workflowStep || WORKFLOW_STEP.PENDING,
        timestamp: overrides.updatedAt || now,
        ...(overrides.sourceReplicaId ? {sourceReplicaId: overrides.sourceReplicaId} : {}),
      }]),
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
    beforeSql,
    onDelivery,
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
  const cacheListeners = new Set();

  function applyCacheChange(tableName, operation, row) {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
      const serviceId = row?.service_id || row?.replica_id;
      const nextRows = serviceRows.filter((existing) => {
        return (existing.service_id || existing.replica_id) !== serviceId;
      });
      if (operation !== 'DELETE') {
        nextRows.push({...row});
      }
      serviceRows.length = 0;
      serviceRows.push(...nextRows);
    }

    for (const listener of cacheListeners) {
      listener(tableName, operation, row);
    }
  }

  const store = createCoordinatorSqlStore({
    getAll(table) {
      if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) return [...operationMap.values()];
      if (table === SYSTEM_TABLE_NAME.SERVICES) return serviceRows;
      return [];
    },
    upsert(_table, row) {
      operationMap.set(row.operation_id, row);
    },
  });
  const sqlEngine = {
    async executeQuery(sql, params) {
      const fault = beforeSql?.(sql, params, operationMap);
      return fault || store.execute(sql, params);
    },
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      onCacheChange(listener) {
        cacheListeners.add(listener);
      },
      offCacheChange(listener) {
        return cacheListeners.delete(listener);
      },
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
      refreshAuthoritativeCacheRow: async () => true,
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver(_target, payload) {
        onDelivery?.(payload, operationMap);
        return buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'});
      },
    },
    sqlQueryEngine: sqlEngine,
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlEngine),
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {estimateReplicaBytes: () => 1},
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    enableTimeouts: false,
  });
  coordinator.workflowOwner.recoverReplicaCleanupReleaseDebt =
    async () => 0;
  coordinator.initialize();
  const shutdown = coordinator.shutdown.bind(coordinator);
  coordinator.shutdown = async () => {
    try {
      await shutdown();
    } finally {
      store.suspend();
    }
  };
  // The witness replica's answers (quest replace-source-removal-owner): the
  // fixture world models the committed configuration from its rows.
  withFixtureReplaceWitness(coordinator.workflowOwner.messageRouter,
    coordinator.systemTableCache);

  return {
    coordinator,
    emitter,
    recordedOwnerKeys,
    operationMap,
    applyCacheChange,
    cacheListeners,
  };
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
    'services cache progression routes through the same owner key ' +
    'and completes creating ADD operations',
    async (t) => {
      const replicaId = 'partition-conv-1-r2';
      const targetNodeId = 'node-target';
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
        replicaId,
        targetNodeId,
      });
      const {
        coordinator,
        recordedOwnerKeys,
        operationMap,
        applyCacheChange,
      } = createConvergenceCoordinator({
        operationRows: [opRow],
      });

      try {
        applyCacheChange(SYSTEM_TABLE_NAME.SERVICES, 'UPDATE', {
          service_id: replicaId,
          replica_id: replicaId,
          partition_id: TEST_PARTITION_ID,
          node_id: targetNodeId,
          status: ReplicaStatus.ACTIVE,
        });

        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        const updated = operationMap.get(TEST_OPERATION_ID);
        t.equal(
          updated?.workflow_step,
          WORKFLOW_STEP.ACTIVE,
          'service-row progress should complete the creating ADD workflow',
        );
        t.ok(
          recordedOwnerKeys.includes(buildOperationOwnerKey(TEST_OPERATION_ID)),
          'services cache progression must route through the shared owner key',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'services cache progression retains REPLACE until exact removal authority recovers',
    async (t) => {
      const operationId = TEST_OBSERVED_PROGRESS_REPLACE_OPERATION_ID;
      const replaceRow = buildOperationRow({
        operationId,
        type: OperationType.REPLACE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
        status: ReplicaStatus.ACTIVE,
        replicaId: TEST_OBSERVED_PROGRESS_TARGET_REPLICA_ID,
        sourceReplicaId: TEST_OBSERVED_PROGRESS_SOURCE_REPLICA_ID,
        sourceNodeId: TEST_NODE_ID,
        targetNodeId: TEST_OBSERVED_PROGRESS_TARGET_NODE_ID,
      });
      const sourceRow = {
        service_id: TEST_OBSERVED_PROGRESS_SOURCE_REPLICA_ID,
        replica_id: TEST_OBSERVED_PROGRESS_SOURCE_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      };
      let blockOperationPointRead = true;
      let pointReadFaults = 0;
      const removalDispatchSteps = [];
      const {coordinator, recordedOwnerKeys, operationMap, applyCacheChange} =
        createConvergenceCoordinator({
          operationRows: [replaceRow],
          serviceRows: [sourceRow],
          beforeSql(sql, params) {
            if (blockOperationPointRead && sql.includes('FROM replica_operations') &&
                sql.includes('operation_id = ?') && params[0] === operationId) {
              pointReadFaults += 1;
              return {success: false, error: 'owner-rpc-read-failed'};
            }
            return null;
          },
          onDelivery(payload, rows) {
            if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
              removalDispatchSteps.push(rows.get(payload.operationId)?.workflow_step);
            }
          },
        });
      const owner = coordinator.workflowOwner;
      const timers = createDeterministicTimerQueue();
      owner.setTimeoutFn = timers.setTimeoutFn;
      owner.clearTimeoutFn = timers.clearTimeoutFn;
      owner.evaluateRemoveSafety = async () => owner.buildSafeRemoveSafetyEvaluation();
      const visibilityObservationCalls = [];
      const originalVisibility =
        coordinator.repository.getOperationByIdVisibilityObservation.bind(coordinator.repository);
      coordinator.repository.getOperationByIdVisibilityObservation =
        async (observedId, options) => {
          visibilityObservationCalls.push({operationId: observedId, options});
          return originalVisibility(observedId, options);
        };

      const targetRow = {
        service_id: TEST_OBSERVED_PROGRESS_TARGET_REPLICA_ID,
        replica_id: TEST_OBSERVED_PROGRESS_TARGET_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_OBSERVED_PROGRESS_TARGET_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      };

      const driveObservedProgress = async () => {
        applyCacheChange(SYSTEM_TABLE_NAME.SERVICES, 'UPDATE', targetRow);
        for (let turn = 0; turn < 20; turn += 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      };
      try {
        await driveObservedProgress();
        t.equal(operationMap.get(operationId)?.workflow_step, WORKFLOW_STEP.ACTIVE,
          'the active target cannot advance removal without an exact authority read');
        t.ok(pointReadFaults > 0, 'the ACTIVE removal turn hits the exact operation read fault');
        t.same(removalDispatchSteps, [], 'the cache cannot authorize the source removal effect');

        const retained = owner.safetyDeferredRetryTimerByOperationId.get(operationId);
        t.ok(timers.scheduled.includes(retained) && !retained.cleared,
          'the exact operation retains its live removal-safety retry');
        blockOperationPointRead = false;
        await retained?.callback();
        const stopping = operationMap.get(operationId);
        t.equal(stopping?.workflow_step, WORKFLOW_STEP.STOPPING,
          'restored authority lets the owner persist its exact removal intent');
        t.equal(stopping?.status, ReplicaStatus.REMOVING,
          'the durable source-removal row carries its canonical status');
        const intent = stopping && JSON.parse(stopping.steps_history)
          .find((entry) => entry.replaceRemovalIntent);
        t.ok(intent && Number.isFinite(intent.replaceWitnessCommitIndex),
          'the durable intent retains the witnessed configuration index');
        t.same(removalDispatchSteps, [WORKFLOW_STEP.STOPPING],
          'the source receives its removal effect after durable STOPPING');
        t.ok(visibilityObservationCalls.some((call) => call.operationId === operationId &&
          call.options?.allowPriorityRecoveryDeferredVisibility === true),
        'observed progress uses the repository visibility observation contract');
        t.ok(recordedOwnerKeys.includes(buildOperationOwnerKey(operationId)),
          'services cache progression uses the same owner key through fault and resumption');
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'deferred dispatch retry reuses the retained priority REPLACE snapshot ' +
    'when visibility is deferred',
    async (t) => {
      const deferredTimers = [];
      const visibilityObservationCalls = [];
      const opRow = buildOperationRow({
        operationId: TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID,
        type: OperationType.REPLACE,
        partitionId: TEST_DEFERRED_DISPATCH_RETRY_PARTITION_ID,
        sourceNodeId: TEST_DEFERRED_DISPATCH_RETRY_SOURCE_NODE_ID,
        targetNodeId: TEST_NODE_ID,
        workflowStep: WORKFLOW_STEP.PENDING,
        status: ReplicaStatus.PENDING,
      });
      const {
        coordinator,
        recordedOwnerKeys,
        operationMap,
      } = createConvergenceCoordinator({
        operationRows: [opRow],
      });
      let recordedDispatchAction = null;
      const retryableError = new Error('deferred dispatch retry regression');
      retryableError.deferRetry = true;
      retryableError.retryAfterMs =
        TEST_DEFERRED_DISPATCH_RETRY_VISIBILITY_RETRY_AFTER_MS;

      coordinator.workflowOwner.setTimeoutFn = (fn, delayMs) => {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      };
      coordinator.workflowOwner.runOperationOwnerAction =
        async (action, operation, context) => {
          recordedDispatchAction = {
            action,
            operation,
            context,
          };
        };
      coordinator.repository.getOperationByIdVisibilityObservation =
        async (operationId, options = {}) => {
          visibilityObservationCalls.push({
            operationId,
            options: {...options},
          });
          return {
            operation: null,
            deferredOutcome: {
              completionState:
                TEST_DEFERRED_DISPATCH_RETRY_COMPLETION_STATE,
              retryAfterMs:
                TEST_DEFERRED_DISPATCH_RETRY_VISIBILITY_RETRY_AFTER_MS,
              source:
                TEST_DEFERRED_DISPATCH_RETRY_VISIBILITY_DEFERRED_SOURCE,
            },
          };
        };

      try {
        const operation = coordinator.repository.rowToOperation(
          operationMap.get(TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID),
        );
        const deferred = coordinator.workflowOwner.deferDispatchRetry(
          operation,
          retryableError,
        );

        t.equal(
          deferred,
          true,
          'retryable dispatch failure should arm the deferred dispatch retry',
        );
        t.equal(
          deferredTimers.length,
          1,
          'deferred dispatch retry should arm one timer',
        );

        await deferredTimers[0].fn();

        t.equal(
          recordedDispatchAction?.action,
          TEST_DEFERRED_DISPATCH_RETRY_ACTION,
          'deferred dispatch retry should re-enter the dispatch owner action',
        );
        t.equal(
          recordedDispatchAction?.operation?.operationId,
          TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID,
          'deferred dispatch retry should reuse the retained operation snapshot when visibility is deferred',
        );
        t.equal(
          recordedDispatchAction?.operation?.targetNodeId,
          TEST_NODE_ID,
          'the retained snapshot should preserve target-owner routing for the priority REPLACE',
        );
        t.same(
          visibilityObservationCalls,
          [{
            operationId: TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID,
            options: {
              allowPriorityRecoveryDeferredVisibility: true,
              allowOwnerPersistedTransitionDeferredVisibility: false,
            },
          }],
          'dispatch retry should use the repository visibility observation contract before re-entering the owner lane',
        );
        t.ok(
          recordedOwnerKeys.includes(
            buildOperationOwnerKey(
              TEST_DEFERRED_DISPATCH_RETRY_OPERATION_ID,
            ),
          ),
          'deferred dispatch retry should still route through the shared owner key',
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
    'shutdown removes the services cache listener used for ' +
    'event-triggered progression',
    async (t) => {
      const opRow = buildOperationRow({
        workflowStep: WORKFLOW_STEP.CREATING,
        status: ReplicaStatus.CREATING,
      });
      const {coordinator, cacheListeners} =
        createConvergenceCoordinator({operationRows: [opRow]});

      t.equal(cacheListeners.size, 1, 'coordinator should register one cache listener');
      await coordinator.shutdown();
      t.equal(cacheListeners.size, 0, 'coordinator should remove its cache listener on shutdown');
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
        service_type: SERVICE_TYPE.PARTITION,
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
      let failedCommittedChanges = 0;
      let transactionCoordinatorCalls = 0;

      const store = createCoordinatorSqlStore({
        getAll(table) {
          if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) return [...operationMap.values()];
          if (table === SYSTEM_TABLE_NAME.SERVICES) return serviceRows;
          return [];
        },
        upsert(_table, row) {
          operationMap.set(row.operation_id, row);
        },
      });
      const sqlEngine = {
        async executeQuery(sql, params) {
          const writesFailedForThisOperation = sql.includes('UPDATE replica_operations') &&
            sql.includes('completed_at IS NULL') &&
            params[1] === WORKFLOW_STEP.FAILED && params[7] === operationId;
          if (writesFailedForThisOperation && !blockedFailedPersist) {
            blockedFailedPersist = true;
            failedPersistStartedResolve();
            await releaseFailedPersist;
          }
          const result = store.execute(sql, params);
          if (writesFailedForThisOperation && result.success) {
            failedCommittedChanges += result.changes;
          }
          return result;
        },
      };

      const coordinator = new RebalanceCoordinator({
        nodeId: TEST_NODE_ID,
        transactionCoordinator: {
          async begin() {
            transactionCoordinatorCalls += 1;
            throw new Error('rebalancer must not own SQL transactions');
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
          refreshAuthoritativeCacheRow: async () => true,
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false,
              reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
            });
          },
        },
        sqlQueryEngine: sqlEngine,
        controlPlaneSystemTableGateway: createMockControlPlaneSystemTableGateway(sqlEngine),
        storageAdmissionService: {
          checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
          checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
        },
        storageAccountingService: {estimateReplicaBytes: () => 1},
        controlPlaneReadinessService: createMockControlPlaneReadinessService({
          defaultRepairEligible: true,
        }),
        operationWorkflowCoordinator: workflowCoordinator,
        executorOutcomeEmitter: emitter,
        enableTimeouts: false,
      });
      coordinator.workflowOwner.recoverReplicaCleanupReleaseDebt =
        async () => 0;
      coordinator.initialize();

      let gateDeadline;
      const timeoutPromise = coordinator.checkTimeouts();
      try {
        await Promise.race([
          failedPersistStarted,
          timeoutPromise.then(() => {
            throw new Error('Timeout check returned before the FAILED persistence gate');
          }),
          new Promise((_, reject) => {
            gateDeadline = setTimeout(() => {
              reject(new Error('Timed out waiting for FAILED persistence gate'));
            }, 2000);
          }),
        ]);
        clearTimeout(gateDeadline);

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
          transactionCoordinatorCalls,
          0,
          'the rebalancer must not own SQL transaction sessions',
        );
        t.equal(
          failedCommittedChanges,
          1,
          'exactly one guarded FAILED write changed a SQLite row',
        );
        const readback = store.execute(
          'SELECT * FROM replica_operations WHERE operation_id = ?', [operationId],
        );
        t.equal(readback.rowSetComplete, true,
          'the exact-key SQLite read is complete');
        t.equal(readback.rows.length, 1, 'the operation has one durable row');
        const [durable] = readback.rows;
        t.equal(durable.workflow_step, WORKFLOW_STEP.FAILED);
        t.equal(durable.status, ReplicaStatus.FAILED);
        t.ok(Number.isFinite(durable.completed_at), 'the committed failure is terminal');
        t.equal(JSON.parse(durable.steps_history).filter(
          ({step}) => step === WORKFLOW_STEP.FAILED,
        ).length, 1, 'durable history has one FAILED transition');
        // CL-029: the outcome arriving while the timeout path holds the
        // lane is coalesced away by runExclusive and then RE-DRIVEN after
        // the holder settles (redriveExecutorOutcomeReconcile), so the
        // outcome path may enter the lane more than once — every entry
        // must still use the same per-operation key. The re-driven reconcile
        // leaves a single committed change and durable terminal history.
        t.ok(
          recordedOwnerKeys.length >= 2,
          'timeout and outcome paths must both enter the owner lane',
        );
        t.same(
          [...new Set(recordedOwnerKeys)],
          [buildOperationOwnerKey(operationId)],
          'timeout and outcome paths must share the same owner key',
        );
      } finally {
        clearTimeout(gateDeadline);
        releaseFailedPersistResolve();
        await Promise.allSettled([timeoutPromise]);
        await coordinator.shutdown();
        store.suspend();
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
        service_id: TEST_REPLICA_ID,
        replica_id: TEST_REPLICA_ID,
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
        service_id: TEST_REPLICA_ID,
        replica_id: TEST_REPLICA_ID,
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
