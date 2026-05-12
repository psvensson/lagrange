import {test} from '../../src/test-helpers/tap.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {createMockCache} from './test-helpers.js';

const TEST_PARTITION_ID = 'sql_transactions-p1';
const TEST_SQL_WRITE_PARTITION_ID = 'sql_write_operations-p1';
const TEST_OPERATION_ID = 'event-driven-progress-operation';
const TEST_REPLICA_ID = 'sql_transactions-p1-r4';
const TEST_SQL_WRITE_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_PUBLICATION_EPOCH = 2;
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_CREATED_AT_MS = 900000;
const TEST_UPDATED_AT_MS = 960000;
const TEST_STEP_AGE_MS = 40000;
const TEST_STEP_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_RECONCILE_DUE = true;
const TEST_EVENT_DRIVEN_ONLY_TIMEOUT_RECONCILE_DUE = false;
const TEST_READY_DISTINCT_NODE_COUNT = 1;
const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_EMPTY_ROWS = Object.freeze([]);
const TEST_UNDEFINED_VALUE = undefined;
const TEST_REPLICA_DISPATCH_TARGET =
  'node-target/service/replica-dispatch';
const TEST_DELIVERY_STATUS_INITIATED = 'initiated';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_OPERATION_OWNER_OBSERVATION_FIELD = 'operationOwnerObservation';
const TEST_REENTRY_TEST_NAME =
  'event-driven dispatch-pending workflow progress re-enters through the ' +
  'operation owner outcome';
const TEST_PENDING_REENTRY_TEST_NAME =
  'persisted-not-dispatched PENDING workflow progress re-enters through ' +
  'the operation owner outcome';
const TEST_DIRECT_BUILD_REENTRY_TEST_NAME =
  'direct owner snapshot build enqueues dispatch-pending workflow progress ' +
  're-entry';
const TEST_CACHE_EVENT_REENTRY_TEST_NAME =
  'replica_operations cache events re-enter priority dispatch-pending ' +
  'workflow progress';
const TEST_ASSERT_TIMEOUT_RECONCILE_OWNER_OUTCOME =
  'timeout-due dispatch-pending snapshots should carry the stale-progress ' +
  'reconcile owner outcome';
const TEST_ASSERT_TIMEOUT_RECONCILE_EFFECT =
  'timeout-due dispatch-pending snapshots should use the stale-progress ' +
  'reconcile command';
const TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE =
  'timeout-due dispatch-pending snapshot normalization should not wake the ' +
  'remote owner inline';
const TEST_ASSERT_CACHE_REENTRY_TARGET =
  'cache-event re-entry should use the canonical dispatch ingress';
const TEST_ASSERT_CACHE_REENTRY_TIMER =
  'cache-event re-entry should arm bounded handoff verification';

function buildEventDrivenOperation(overrides = {}) {
  return Object.freeze({
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    createdAt: TEST_CREATED_AT_MS,
    updatedAt: TEST_UPDATED_AT_MS,
    ...overrides,
  });
}

function buildEventDrivenOperationRow(overrides = {}) {
  return Object.freeze({
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_UPDATED_AT_MS,
    ...overrides,
  });
}

function buildEventDrivenPlanningSnapshot(options = {}) {
  const workflowStep = options.workflowStep || WORKFLOW_STEP.SENDING;
  const actuationState =
    options.actuationState ||
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS;
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: TEST_EMPTY_LIST,
    pendingAckCount: NUM.ZERO,
    priorityRecoveryDecisionSnapshots: Object.freeze({
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      snapshots: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          operationId: TEST_OPERATION_ID,
          blockerReasons: Object.freeze([
            PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
          ]),
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
          completion: Object.freeze({
            state: 'blocked',
          }),
          observation: Object.freeze({
            workflowState: 'in_flight',
            visibilityState: 'cache_visible',
            provenance: Object.freeze({
              capturedAt: TEST_CAPTURED_AT_MS,
              workflowSource: 'system_table_cache',
            }),
          }),
          conditions: Object.freeze({
            latestOperationWorkflowStep: workflowStep,
            latestOperationStatus: ReplicaStatus.PENDING,
          }),
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state: actuationState,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
            timeoutReconcileDue: TEST_TIMEOUT_RECONCILE_DUE,
          }),
          progress: Object.freeze({
            contractState: OWNER_CONTRACT_STATE.PENDING,
            nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
            currentOwner:
              PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            nextRequiredAction:
              PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
            blockingBoundary:
              PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
            waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
          }),
          coordinator: Object.freeze({
            operationIds: Object.freeze([TEST_OPERATION_ID]),
          }),
        }),
      ]),
    }),
    priorityPartitionSummary: Object.freeze({
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
        }),
      ]),
    }),
  });
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

function buildSqlQueryEngine(operationRow) {
  return {
    async executeQuery(sql) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_REPLICA_OPERATIONS_TABLE)) {
        const operationRows = [operationRow];
        return {
          success: true,
          rows: operationRows,
          affectedRows: operationRows.length,
        };
      }
      if (normalizedSql.includes(TEST_SERVICES_TABLE)) {
        return {
          success: true,
          rows: TEST_EMPTY_ROWS,
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: TEST_EMPTY_ROWS,
        affectedRows: NUM.ZERO,
      };
    },
  };
}

function createEventDrivenCoordinator(
  deliveries,
  deferredTimers,
  operationRow,
  planningOptions = {},
) {
  return new RebalanceCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine: buildSqlQueryEngine(operationRow),
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: TEST_EMPTY_ROWS,
          affectedRows: NUM.ZERO,
        };
      },
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildEventDrivenPlanningSnapshot(planningOptions);
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
}

function omitOperationOwnerObservation(snapshot) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(snapshot).filter(([key]) =>
        key !== TEST_OPERATION_OWNER_OBSERVATION_FIELD,
      ),
    ),
  );
}

test(TEST_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation();
  const operationRow = buildEventDrivenOperationRow();
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          [operation],
        );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });

    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      TEST_ASSERT_TIMEOUT_RECONCILE_OWNER_OUTCOME,
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'the priority recovery surface should keep the owner advancement action',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.RECONCILE_STALE_PROGRESS_COMMAND,
      TEST_ASSERT_TIMEOUT_RECONCILE_EFFECT,
    );
    t.equal(
      snapshot?.actuation?.state,
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      'the owner outcome should return the stale dispatched wait to the dispatch owner path',
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      'the re-entry remains a workflow-progress boundary',
    );
    t.equal(
      snapshot?.progress?.waitMode,
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      'the re-entry should stay on event-driven workflow progress',
    );
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        snapshot,
        [operation],
      ),
      false,
      'the active remote wake retry should close duplicate owner re-entry scheduling',
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_UNDEFINED_VALUE,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the remote wake should arm the bounded handoff verification lane',
    );

    coordinator.workflowOwner.clearCreatedOperationHandoffRetry(
      operation.operationId,
    );
    const eventDrivenOnlySnapshot = Object.freeze({
      ...snapshot,
      actuation: Object.freeze({
        ...snapshot.actuation,
        timeoutReconcileDue: TEST_EVENT_DRIVEN_ONLY_TIMEOUT_RECONCILE_DUE,
      }),
    });
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        eventDrivenOnlySnapshot,
        [operation],
      ),
      true,
      'owner-observed event-driven re-entry should not require the timeout flag',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });
    t.equal(
      deliveries.length,
      NUM.ONE,
      'owner-observed event-driven re-entry should enqueue a fresh owner wake',
    );

    coordinator.workflowOwner.clearCreatedOperationHandoffRetry(
      operation.operationId,
    );
    const observationMissingSnapshot = Object.freeze({
      ...omitOperationOwnerObservation(snapshot),
      actuation: Object.freeze({
        ...snapshot.actuation,
        timeoutReconcileDue: TEST_EVENT_DRIVEN_ONLY_TIMEOUT_RECONCILE_DUE,
      }),
    });
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        observationMissingSnapshot,
        [operation],
      ),
      true,
      'persisted-not-dispatched event-driven re-entry should not require an owner observation',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });
    t.equal(
      deliveries.length,
      NUM.TWO,
      'observation-missing event-driven re-entry should enqueue owner work',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_PENDING_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const operationRow = buildEventDrivenOperationRow({
    workflow_step: WORKFLOW_STEP.PENDING,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      workflowStep: WORKFLOW_STEP.PENDING,
      actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          [operation],
        );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });

    t.equal(
      snapshot?.conditions?.latestOperationWorkflowStep,
      WORKFLOW_STEP.PENDING,
      'the focused witness should preserve the durable PENDING step',
    );
    t.equal(
      snapshot?.actuation?.state,
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      'the focused witness should stay persisted-not-dispatched',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      TEST_ASSERT_TIMEOUT_RECONCILE_OWNER_OUTCOME,
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'the focused PENDING witness should keep owner advancement as the requested action',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.RECONCILE_STALE_PROGRESS_COMMAND,
      TEST_ASSERT_TIMEOUT_RECONCILE_EFFECT,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_UNDEFINED_VALUE,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the focused PENDING witness should arm the bounded handoff verification lane',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_DIRECT_BUILD_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    partitionId: TEST_SQL_WRITE_PARTITION_ID,
    entityId: TEST_SQL_WRITE_PARTITION_ID,
    replicaId: TEST_SQL_WRITE_REPLICA_ID,
  });
  const operationRow = buildEventDrivenOperationRow({
    partition_id: TEST_SQL_WRITE_PARTITION_ID,
    entity_id: TEST_SQL_WRITE_PARTITION_ID,
    replica_id: TEST_SQL_WRITE_REPLICA_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operation],
        buildEventDrivenPlanningSnapshot(),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });

    t.equal(
      snapshot?.partitionId,
      operation.partitionId,
      'the focused fixture should preserve the sql_write_operations partition',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      TEST_ASSERT_TIMEOUT_RECONCILE_OWNER_OUTCOME,
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'direct owner snapshots should keep owner advancement requested',
    );
    t.equal(
      deliveries.length,
      NUM.ONE,
      'direct owner snapshot builds should enqueue one owner wake',
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      'direct owner snapshot builds should use the canonical dispatch ingress',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_CACHE_EVENT_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const operationRow = buildEventDrivenOperationRow({
    workflow_step: WORKFLOW_STEP.PENDING,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();

    t.equal(
      coordinator.workflowOwner
        .scheduleCoordinatorCreatedCacheReentryFromOperationRow(
          coordinator.workflowOwner.getObservedProgressTableState(
            TEST_REPLICA_OPERATIONS_TABLE,
          ),
          TEST_DELIVERY_STATUS_INITIATED,
          operationRow,
        ),
      true,
      'PENDING priority cache rows should re-enter the workflow owner lane',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });

    t.equal(
      deliveries.length,
      NUM.ONE,
      'PENDING priority cache rows should wake the remote operation owner',
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_CACHE_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_CACHE_REENTRY_TIMER,
    );

    const sendingOperationRow = buildEventDrivenOperationRow({
      operation_id: TEST_OPERATION_ID,
      workflow_step: WORKFLOW_STEP.SENDING,
      updated_at: TEST_UPDATED_AT_MS,
    });
    coordinator.workflowOwner.clearCreatedOperationHandoffRetry(
      operation.operationId,
    );

    t.equal(
      coordinator.workflowOwner
        .scheduleCoordinatorCreatedCacheReentryFromOperationRow(
          coordinator.workflowOwner.getObservedProgressTableState(
            TEST_REPLICA_OPERATIONS_TABLE,
          ),
          TEST_DELIVERY_STATUS_INITIATED,
          sendingOperationRow,
        ),
      true,
      'SENDING priority cache rows should re-enter the workflow owner lane',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, NUM.ZERO);
    });

    t.equal(
      deliveries.length,
      NUM.TWO,
      'SENDING priority cache rows should re-wake the remote operation owner',
    );
    t.equal(
      deliveries[NUM.ONE]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_CACHE_REENTRY_TARGET,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});
