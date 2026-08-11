import {test} from '../../src/test-helpers/tap.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from
  '../../src/control-plane/priority-recovery-completion.js';
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
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from '../../src/control-plane/priority-recovery-snapshot-contract.js';
import {buildPriorityRecoveryDecisionSnapshot} from
  '../../src/control-plane/priority-recovery-dispatch-snapshot.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {createMockCache} from './test-helpers.js';

// completeOperation/failOperation report a typed transition outcome
// ({committed, disposition}); the termination stubs return the
// committed shape so the drain's truthful-progress propagation sees a
// settled terminal (quest terminal-write-refusal-retry-ownership).
const TEST_COMMITTED_TRANSITION_OUTCOME = Object.freeze({
  committed: true,
  disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
});
// The refused shape: the terminal write changed zero rows against a live
// non-terminal authority row — the termination did NOT settle.
const TEST_REFUSED_TRANSITION_OUTCOME = Object.freeze({
  committed: false,
  disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
});
const {OPERATION_LIFECYCLE_ACTION: TEST_OPERATION_LIFECYCLE_ACTION} =
  OPERATION_WORKFLOW_OWNER_SHARED;
const {
  PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION:
    TEST_PRIORITY_DRAIN_OWNER_ACTION,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const TEST_PARTITION_ID = 'sql_transactions-p1';
const TEST_SQL_WRITE_PARTITION_ID = 'sql_write_operations-p1';
const TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID =
  'control_plane_publications-p1';
const TEST_REPLICA_OPERATIONS_PARTITION_ID = 'replica_operations-p1';
const TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID =
  'sql_transaction_participants-p1';
const TEST_OPERATION_ID = 'event-driven-progress-operation';
const TEST_CONTROL_PLANE_PUBLICATION_OPERATION_ID =
  'event-driven-control-plane-publication-operation';
const TEST_REPRESENTATIVE_CONTROL_PLANE_PUBLICATION_OPERATION_ID =
  'd5ffb401-f539-44d6-a23a-6365606ac232';
const TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID =
  '96c522ac-95c7-4713-96da-a98010d295d9';
const TEST_REPLICA_OPERATIONS_OPERATION_ID =
  'event-driven-replica-operations-operation';
const TEST_SQL_TRANSACTION_PARTICIPANTS_OPERATION_ID =
  'event-driven-sql-transaction-participants-operation';
const TEST_SQL_WRITE_OPERATION_ID =
  'event-driven-sql-write-operation';
const TEST_REPLICA_ID = 'sql_transactions-p1-r4';
const TEST_SQL_WRITE_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID =
  'control_plane_publications-p1-r4';
const TEST_REPLICA_OPERATIONS_REPLICA_ID = 'replica_operations-p1-r4';
const TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID =
  'control-plane-publication-source-node';
const TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID =
  'control-plane-publication-target-node';
const TEST_REPLICA_OPERATIONS_SOURCE_NODE_ID =
  'replica-operations-source-node';
const TEST_REPLICA_OPERATIONS_TARGET_NODE_ID =
  'replica-operations-target-node';
const TEST_SQL_TRANSACTION_PARTICIPANTS_SOURCE_NODE_ID =
  'sql-transaction-participants-source-node';
const TEST_SQL_TRANSACTION_PARTICIPANTS_TARGET_NODE_ID =
  'sql-transaction-participants-target-node';
const TEST_PUBLICATION_EPOCH = 2;
const TEST_PUBLICATION_STATUS_OPEN = 'OPEN';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_CREATED_AT_MS = 900000;
const TEST_UPDATED_AT_MS = 960000;
const TEST_STEP_AGE_MS = 40000;
const TEST_RECENT_OPERATION_UPDATED_AT_MS = 999000;
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
const TEST_CONTROL_PLANE_PUBLICATION_REPLICA_DISPATCH_TARGET =
  'control-plane-publication-target-node/service/replica-dispatch';
const TEST_DELIVERY_STATUS_INITIATED = 'initiated';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_OPERATION_OWNER_OBSERVATION_FIELD = 'operationOwnerObservation';
const TEST_OPERATION_OWNER_EFFECT_NOT_EXECUTED = 'not_executed';
const TEST_PROGRESS_CONTRACT_EVENT_WAKE_SOURCE = 'operation_lifecycle_event';
const TEST_PROGRESS_CONTRACT_ELIGIBLE_ROUTE = 'eligible';
const TEST_REENTRY_TEST_NAME =
  'event-driven dispatch-pending workflow progress re-enters through the ' +
  'operation owner outcome';
const TEST_PENDING_REENTRY_TEST_NAME =
  'persisted-not-dispatched PENDING workflow progress re-enters through ' +
  'the operation owner outcome';
const TEST_PUBLICATION_BACKPRESSURE_REENTRY_TEST_NAME =
  'control-plane publication backpressure PENDING workflow progress ' +
  're-enters through the operation owner outcome';
const TEST_DIAGNOSTIC_OWNER_REENTRY_TEST_NAME =
  'diagnostic dispatch-pending publication snapshots re-enter owner ' +
  'workflow progress';
const TEST_SPREAD_SATISFIED_REENTRY_TEST_NAME =
  'spread-satisfied priority PENDING dispatch waits drain through ' +
  'the operation owner outcome';
const TEST_SPREAD_SATISFIED_ADD_TARGET_DRAIN_TEST_NAME =
  'spread-satisfied ADD target progress drains through the operation owner ' +
  'outcome';
const TEST_SPREAD_SATISFIED_WAIT_PROGRESS_REENTRY_TEST_NAME =
  'control-plane publication WAIT_FOR_OPERATION_PROGRESS ' +
  'spread-satisfied dispatch wait drains through the operation owner outcome';
const TEST_DIRECT_BUILD_REENTRY_TEST_NAME =
  'direct owner snapshot build enqueues dispatch-pending workflow progress ' +
  're-entry';
const TEST_CACHE_EVENT_REENTRY_TEST_NAME =
  'replica_operations cache events re-enter priority dispatch-pending ' +
  'workflow progress';
const TEST_TARGET_PROGRESS_REENTRY_TEST_NAME =
  'target-service terminal progress snapshots re-enter workflow progress';
const TEST_REMOTE_TARGET_PROGRESS_REENTRY_TEST_NAME =
  'remote target-service terminal progress snapshots wake the workflow owner';
const TEST_DISPATCH_PENDING_TARGET_PROGRESS_REENTRY_TEST_NAME =
  'dispatch-pending active target progress snapshots re-enter workflow progress';
const TEST_TARGET_SYNC_ACTIVE_TARGET_PROGRESS_REENTRY_TEST_NAME =
  'target-sync active target progress snapshots re-enter workflow progress';
const TEST_SOURCE_REMOVAL_PROGRESS_REENTRY_TEST_NAME =
  'source-removal workflow progress snapshots re-enter workflow progress';
const TEST_SOURCE_REMOVAL_DISPATCH_RETRY_CONTRACT_TEST_NAME =
  'source-removal dispatch retry snapshots expose a rebalancer handoff ' +
  'retry contract';
const TEST_DISPATCH_PENDING_DISPATCH_RETRY_CONTRACT_TEST_NAME =
  'dispatch-pending dispatch retry snapshots expose a rebalancer handoff ' +
  'retry contract';
const TEST_LOCAL_INITIALIZATION_RETRY_TEST_NAME =
  'locally owned coordinator-created priority PENDING rows retry after ' +
  'workflow owner initialization';
const TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE =
  'timeout-due dispatch-pending snapshot normalization should wake the ' +
  'remote owner inline and arm bounded verification';
const TEST_ASSERT_CACHE_REENTRY_TARGET =
  'cache-event re-entry should use the canonical dispatch ingress';
const TEST_ASSERT_CACHE_REENTRY_TIMER =
  'cache-event re-entry should arm bounded handoff verification';
const TEST_ASSERT_TARGET_PROGRESS_REENTRY =
  'target terminal progress should re-enter the observed-progress owner lane';
const TEST_ASSERT_REMOTE_TARGET_PROGRESS_WAKE =
  'remote target terminal progress should wake the remote owner';
const TEST_ASSERT_TARGET_PROGRESS_PHASE =
  'target terminal progress fixture should preserve target creation phase';
const TEST_ASSERT_DISPATCH_PENDING_TARGET_PROGRESS_REENTRY =
  'dispatch-pending active target progress should re-enter the ' +
  'observed-progress owner lane';
const TEST_ASSERT_TARGET_SYNC_ACTIVE_TARGET_PROGRESS_REENTRY =
  'target-sync active target progress should re-enter the observed-progress ' +
  'owner lane';
const TEST_ASSERT_SOURCE_REMOVAL_PROGRESS_REENTRY =
  'source-removal workflow progress should re-enter the observed-progress ' +
  'owner lane';
const TEST_ASSERT_SOURCE_REMOVAL_DISPATCH_RETRY_CONTRACT =
  'active source-removal dispatch retry should surface as a rebalancer ' +
  'handoff retry';
const TEST_ASSERT_DISPATCH_PENDING_DISPATCH_RETRY_CONTRACT =
  'active dispatch-pending dispatch retry should surface as a rebalancer ' +
  'handoff retry';
const TEST_ASSERT_DIRECT_BUILD_PROGRESS_CONTRACT =
  'direct decision snapshot build should retain operation workflow progress ' +
  'contract';
const TEST_ASSERT_DIAGNOSTIC_BUILD_PROGRESS_CONTRACT =
  'diagnostic decision snapshot build should retain operation workflow ' +
  'progress contract';
const TEST_ASSERT_NON_WORKFLOW_PROGRESS_CONTRACT_ABSENT =
  'non-workflow owner progress should not receive operation workflow progress ' +
  'contract';
const TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_TIMER =
  'local uninitialized owner arms one bounded transition retry';
const TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_NO_DELIVERY =
  'local uninitialized owner should not deliver before initialization';
const TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_RESUMES =
  'local initialization retry drains the transition retry slot';
const TEST_ASSERT_SPREAD_SATISFIED_DRAIN =
  'spread-satisfied persisted-not-dispatched priority rows should drain';
const TEST_ASSERT_SPREAD_SATISFIED_ADD_TARGET_DRAIN =
  'spread-satisfied ADD target evidence should complete the drain';
const TEST_ASSERT_SPREAD_SATISFIED_WAIT_PROGRESS_DRAIN =
  'spread-satisfied WAIT_FOR_OPERATION_PROGRESS witness should drain';
const TEST_ASSERT_SPREAD_SATISFIED_NEXT_ACTION =
  'spread-satisfied persisted-not-dispatched fixture should preserve the ' +
  'representative next action';
const TEST_ASSERT_SPREAD_SATISFIED_NO_REMOTE_WAKE =
  'spread-satisfied persisted-not-dispatched priority rows should not ' +
  'wake the remote target owner';
const TEST_ASSERT_PUBLICATION_BACKPRESSURE_WAKE =
  'publication backpressure dispatch-pending rows should wake the remote ' +
  'operation owner';
const TEST_ASSERT_PUBLICATION_BACKPRESSURE_RETRY =
  'publication backpressure dispatch-pending rows should arm bounded ' +
  'owner re-entry';
const TEST_ASSERT_PUBLICATION_BACKPRESSURE_NO_DRAIN =
  'publication backpressure dispatch-pending rows should not drain while ' +
  'spread remains blocked';
const TEST_SPREAD_SATISFIED_DRAIN_WITNESSES = Object.freeze([
  Object.freeze({
    operationId: TEST_CONTROL_PLANE_PUBLICATION_OPERATION_ID,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
  }),
  Object.freeze({
    operationId: TEST_REPLICA_OPERATIONS_OPERATION_ID,
    partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
    replicaId: TEST_REPLICA_OPERATIONS_REPLICA_ID,
    sourceNodeId: TEST_REPLICA_OPERATIONS_SOURCE_NODE_ID,
    targetNodeId: TEST_REPLICA_OPERATIONS_TARGET_NODE_ID,
  }),
  Object.freeze({
    operationId: TEST_SQL_TRANSACTION_PARTICIPANTS_OPERATION_ID,
    partitionId: TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
    replicaId: TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID,
    sourceNodeId: TEST_SQL_TRANSACTION_PARTICIPANTS_SOURCE_NODE_ID,
    targetNodeId: TEST_SQL_TRANSACTION_PARTICIPANTS_TARGET_NODE_ID,
  }),
  Object.freeze({
    operationId: TEST_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
  }),
  Object.freeze({
    operationId: TEST_SQL_WRITE_OPERATION_ID,
    partitionId: TEST_SQL_WRITE_PARTITION_ID,
    replicaId: TEST_SQL_WRITE_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
  }),
]);

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
  const partitionId = options.partitionId || TEST_PARTITION_ID;
  const operationId = options.operationId || TEST_OPERATION_ID;
  const workflowStep = options.workflowStep || WORKFLOW_STEP.SENDING;
  const actuationState =
    options.actuationState ||
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS;
  const latestOperationStatus =
    options.latestOperationStatus || ReplicaStatus.PENDING;
  const workflowProgressPhaseId =
    options.workflowProgressPhaseId ||
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING;
  const nextRequiredAction =
    options.nextRequiredAction ||
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION;
  const completionState = options.completionState || 'blocked';
  const spreadGap = Number.isFinite(options.spreadGap) ?
    options.spreadGap :
    TEST_READY_DISTINCT_NODE_COUNT;
  const coordinatorOperation = options.coordinatorOperation || null;
  const coordinatorSnapshot = {
    operationIds: Object.freeze([operationId]),
    ...(coordinatorOperation ? {operation: coordinatorOperation} : {}),
  };
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus:
      options.publicationStatus || TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: TEST_EMPTY_LIST,
    pendingAckCount: 0,
    priorityRecoveryDecisionSnapshots: Object.freeze({
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      snapshots: Object.freeze([
        Object.freeze({
          partitionId,
          operationId,
          blockerReasons: Object.freeze([
            PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
          ]),
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
          completion: Object.freeze({
            state: completionState,
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
            latestOperationStatus,
          }),
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state: actuationState,
            workflowProgressPhaseId,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
            timeoutReconcileDue:
              typeof options.timeoutReconcileDue === 'boolean' ?
                options.timeoutReconcileDue :
                TEST_TIMEOUT_RECONCILE_DUE,
          }),
          progress: Object.freeze({
            contractState: OWNER_CONTRACT_STATE.PENDING,
            nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
            currentOwner:
              PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            nextRequiredAction,
            blockingBoundary:
              PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
            waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            workflowProgressPhaseId,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
          }),
          coordinator: Object.freeze(coordinatorSnapshot),
        }),
      ]),
    }),
    priorityPartitionSummary: Object.freeze({
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId,
          readyDistinctNodeCount:
            options.readyDistinctNodeCount || TEST_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap,
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
          affectedRows: 0,
        };
      }
      return {
        success: true,
        rows: TEST_EMPTY_ROWS,
        affectedRows: 0,
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
    authoritativeVisibilityTimeoutMs: 0,
    authoritativeVisibilityRetryDelayMs: 0,
    sqlQueryEngine: buildSqlQueryEngine(operationRow),
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: TEST_EMPTY_ROWS,
          affectedRows: 0,
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

function assertOperationDispatchRetryHandoffSnapshot(
  t,
  snapshot,
  operation,
  deliveries,
  deferredTimers,
  expectedWorkflowProgressPhaseId,
  label,
  assertMessage,
) {
  const actuation = snapshot.actuation;
  const progress = snapshot.progress;
  const coordinatorOperation = snapshot.coordinator.operation;
  const ownerObservation = snapshot.operationOwnerObservation;
  t.equal(
    actuation.workflowProgressPhaseId,
    expectedWorkflowProgressPhaseId,
    `${label} dispatch retry fixture should preserve actuation phase`,
  );
  t.equal(
    progress.workflowProgressPhaseId,
    expectedWorkflowProgressPhaseId,
    `${label} dispatch retry fixture should preserve progress phase`,
  );
  t.equal(
    snapshot.operationId,
    operation.operationId,
    `${label} dispatch retry fixture should preserve operation id`,
  );
  t.equal(
    coordinatorOperation.operationId,
    operation.operationId,
    `${label} dispatch retry fixture should preserve coordinator operation id`,
  );
  t.equal(
    progress.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
    assertMessage,
  );
  t.equal(
    progress.waitMode,
    PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    assertMessage,
  );
  t.equal(
    ownerObservation.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
    assertMessage,
  );
  t.equal(
    progress.progressContract.representativeRerunRoute,
    'blocked_model_route',
    assertMessage,
  );
  t.same(
    [deliveries.length, deferredTimers.length],
    [0, 0],
    `active ${label} dispatch retries should not duplicate remote wakes`,
  );
}

function assertSourceRemovalDispatchRetrySnapshot(
  t,
  snapshot,
  operation,
  deliveries,
  deferredTimers,
) {
  assertOperationDispatchRetryHandoffSnapshot(
    t,
    snapshot,
    operation,
    deliveries,
    deferredTimers,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
    'source-removal',
    TEST_ASSERT_SOURCE_REMOVAL_DISPATCH_RETRY_CONTRACT,
  );
}

function assertDispatchPendingDispatchRetrySnapshot(
  t,
  snapshot,
  operation,
  deliveries,
  deferredTimers,
) {
  assertOperationDispatchRetryHandoffSnapshot(
    t,
    snapshot,
    operation,
    deliveries,
    deferredTimers,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    'dispatch-pending',
    TEST_ASSERT_DISPATCH_PENDING_DISPATCH_RETRY_CONTRACT,
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
          operationCount: 1,
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
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
      'the focused PENDING witness should wake the dispatch owner',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'the priority recovery surface should keep the owner advancement action',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
      'the focused PENDING witness should use the remote owner wake command',
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
    t.match(
      snapshot?.progress?.progressContract,
      {
        owner: 'operation_workflow_owner',
        boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
        representativeRerunRoute: 'eligible',
      },
      'progressContract should match event-driven route fields',
    );
    const handoffRetrySnapshot =
      coordinator.workflowOwner
        .normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
          {
            ...snapshot,
            progress: {
              ...snapshot.progress,
              blockingBoundary:
                PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
              waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
            },
          }, operation);
    t.equal(
      handoffRetrySnapshot?.progress?.progressContract?.representativeRerunRoute,
      'blocked_model_route',
      'rebalancer handoff retry progress should block representative rerun',
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
      1,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      1,
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
      setTimeout(resolve, 0);
    });
    t.equal(
      deliveries.length,
      2,
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
      setTimeout(resolve, 0);
    });
    t.equal(
      deliveries.length,
      NUM.THREE,
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
          operationCount: 1,
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
      setTimeout(resolve, 0);
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
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
      'the focused PENDING witness should wake the dispatch owner',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'the focused PENDING witness should keep owner advancement as the requested action',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
      'the focused PENDING witness should use the remote owner wake command',
    );
    t.equal(
      deliveries.length,
      1,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_TIMEOUT_RECONCILE_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      1,
      'the focused PENDING witness should arm the bounded handoff verification lane',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_PUBLICATION_BACKPRESSURE_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const completedOperationIds = [];
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operation = buildEventDrivenOperation({
    operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entityId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: TEST_RECENT_OPERATION_UPDATED_AT_MS,
    updatedAt: TEST_RECENT_OPERATION_UPDATED_AT_MS,
  });
  const operationRow = buildEventDrivenOperationRow({
    operation_id: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    partition_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entity_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replica_id: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    source_node_id: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    target_node_id: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
    updated_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.PENDING,
      actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      completionState: PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
      publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
      timeoutReconcileDue: TEST_EVENT_DRIVEN_ONLY_TIMEOUT_RECONCILE_DUE,
    },
  );

  try {
    coordinator.initialize();
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_TRANSITION_OUTCOME;
    };
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
          [operation],
        );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_WAKE,
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_WAKE,
    );
    t.equal(
      snapshot?.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_NO_DRAIN,
    );
    t.same(
      completedOperationIds,
      TEST_EMPTY_LIST,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_NO_DRAIN,
    );
    t.equal(
      deliveries.length,
      1,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_RETRY,
    );
    t.equal(
      deferredTimers.length,
      1,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_RETRY,
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_WAKE,
    );
    t.equal(
      deliveries[1]?.target,
      TEST_CONTROL_PLANE_PUBLICATION_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_PUBLICATION_BACKPRESSURE_WAKE,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_DIAGNOSTIC_OWNER_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entityId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: TEST_RECENT_OPERATION_UPDATED_AT_MS,
    updatedAt: TEST_RECENT_OPERATION_UPDATED_AT_MS,
  });
  const operationRow = buildEventDrivenOperationRow({
    operation_id: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    partition_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entity_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replica_id: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    source_node_id: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    target_node_id: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
    updated_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
  );
  const publicationConvergence = buildEventDrivenPlanningSnapshot({
    operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
    publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
  });
  const snapshot = buildPriorityRecoveryDecisionSnapshot({
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationConvergence,
    priorityPartitionSummary:
      publicationConvergence.priorityPartitionSummary,
    operationContexts: [Object.freeze({
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      tableName: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      type: OperationType.REPLACE,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
      targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
      replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
      createdAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
      updatedAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
      completedAtMs: TEST_UNDEFINED_VALUE,
      stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      targetVisibilityState:
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
      targetServiceTerminalState:
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.UNKNOWN,
    })],
    operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
    stepTimeoutMsByWorkflowStep: {
      [WORKFLOW_STEP.PENDING]: TEST_STEP_TIMEOUT_MS,
    },
  });

  try {
    coordinator.initialize();
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
      'diagnostic snapshots should attach the owner advancement observation',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
        .ADVANCE_EXISTING_OPERATION_COMMAND,
      'diagnostic snapshots should retain the owner advancement effect',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.effectExecution,
      TEST_OPERATION_OWNER_EFFECT_NOT_EXECUTED,
      'diagnostic snapshots should not claim the effect already executed',
    );
    const expectedProgressContract = {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      wakeSource: TEST_PROGRESS_CONTRACT_EVENT_WAKE_SOURCE,
      representativeRerunRoute: TEST_PROGRESS_CONTRACT_ELIGIBLE_ROUTE,
    };
    t.match(
      snapshot?.progressContract,
      expectedProgressContract,
      TEST_ASSERT_DIAGNOSTIC_BUILD_PROGRESS_CONTRACT,
    );
    t.match(
      snapshot?.progress?.progressContract,
      expectedProgressContract,
      TEST_ASSERT_DIAGNOSTIC_BUILD_PROGRESS_CONTRACT,
    );
    t.match(
      snapshot?.progressSummary?.progressContract,
      expectedProgressContract,
      TEST_ASSERT_DIAGNOSTIC_BUILD_PROGRESS_CONTRACT,
    );
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        snapshot,
        [snapshot.coordinator.operation],
      ),
      true,
      'diagnostic snapshots should enqueue the workflow owner re-entry',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    t.equal(
      deliveries.length,
      1,
      'diagnostic owner re-entry should wake the remote operation owner',
    );
    t.equal(
      deliveries[0]?.target,
      TEST_CONTROL_PLANE_PUBLICATION_REPLICA_DISPATCH_TARGET,
      'diagnostic owner re-entry should use the canonical dispatch ingress',
    );
    t.equal(
      deferredTimers.length,
      1,
      'diagnostic owner re-entry should arm bounded handoff verification',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test(
  'first-timeout diagnostic owner re-entry refreshes active remote handoff retry',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const operationRow = buildEventDrivenOperationRow({
      operation_id: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      partition_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      entity_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      replica_id: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
      source_node_id: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
      target_node_id: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
      updated_at: TEST_RECENT_OPERATION_UPDATED_AT_MS,
    });
    const coordinator = createEventDrivenCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    const publicationConvergence = buildEventDrivenPlanningSnapshot({
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.PENDING,
      publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
    });
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationConvergence,
      priorityPartitionSummary:
        publicationConvergence.priorityPartitionSummary,
      operationContexts: [Object.freeze({
        operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
        partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
        tableName: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
        type: OperationType.REPLACE,
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
        sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
        targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
        replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
        createdAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
        updatedAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
        completedAtMs: TEST_UNDEFINED_VALUE,
        stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
        targetVisibilityState:
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
        targetServiceTerminalState:
          PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.UNKNOWN,
      })],
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      stepTimeoutMsByWorkflowStep: {
        [WORKFLOW_STEP.PENDING]: TEST_STEP_TIMEOUT_MS,
      },
    });
    const firstTimeoutStepAgeMs = TEST_STEP_TIMEOUT_MS;
    const firstTimeoutSnapshot = Object.freeze({
      ...snapshot,
      actuation: Object.freeze({
        ...snapshot.actuation,
        timeoutReconcileDue: true,
        stepAgeMs: firstTimeoutStepAgeMs,
        stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      }),
      progress: Object.freeze({
        ...snapshot.progress,
        stepAgeMs: firstTimeoutStepAgeMs,
        stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      }),
    });

    try {
      coordinator.initialize();
      t.equal(
        coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
          snapshot,
          [snapshot.coordinator.operation],
        ),
        true,
        'baseline diagnostic re-entry should arm the first remote retry',
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      t.same(
        [deliveries.length, deferredTimers.length],
        [1, 1],
        'baseline diagnostic re-entry should have one wake and retry',
      );

      t.equal(
        coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
          firstTimeoutSnapshot,
          [firstTimeoutSnapshot.coordinator.operation],
        ),
        true,
        'first-timeout diagnostics should refresh the remote retry',
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      t.same(
        [deliveries.length, deferredTimers.length],
        [2, 2],
        'first-timeout diagnostics should wake and re-arm verification',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'authoritative visibility owner progress does not receive workflow progress contract',
  (t) => {
    const publicationConvergence = buildEventDrivenPlanningSnapshot({
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.PENDING,
      publicationStatus: TEST_PUBLICATION_STATUS_OPEN,
    });
    const snapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationConvergence,
      priorityPartitionSummary:
        publicationConvergence.priorityPartitionSummary,
      operationContexts: [Object.freeze({
        operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
        partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
        tableName: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
        type: OperationType.REPLACE,
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
        sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
        targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
        replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
        createdAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
        updatedAtMs: TEST_RECENT_OPERATION_UPDATED_AT_MS,
        completedAtMs: TEST_UNDEFINED_VALUE,
        stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      })],
      operationId: TEST_PUBLICATION_BACKPRESSURE_OPERATION_ID,
      operationOwnerOutcome: Object.freeze({
        owner: OPERATION_WORKFLOW_OWNER,
        boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
        outcome:
          OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
      }),
    });

    t.equal(
      snapshot?.progress?.currentOwner,
      PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
      TEST_ASSERT_NON_WORKFLOW_PROGRESS_CONTRACT_ABSENT,
    );
    t.equal(
      snapshot?.progressContract,
      undefined,
      TEST_ASSERT_NON_WORKFLOW_PROGRESS_CONTRACT_ABSENT,
    );
    t.equal(
      snapshot?.progress?.progressContract,
      undefined,
      TEST_ASSERT_NON_WORKFLOW_PROGRESS_CONTRACT_ABSENT,
    );
    t.equal(
      snapshot?.progressSummary,
      undefined,
      TEST_ASSERT_NON_WORKFLOW_PROGRESS_CONTRACT_ABSENT,
    );
    t.end();
  },
);

test(TEST_SPREAD_SATISFIED_WAIT_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const completedOperationIds = [];
  const operation = buildEventDrivenOperation({
    operationId: TEST_REPRESENTATIVE_CONTROL_PLANE_PUBLICATION_OPERATION_ID,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entityId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    buildEventDrivenOperationRow(),
  );

  const failedOperationIds = [];

  try {
    coordinator.initialize();
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_TRANSITION_OUTCOME;
    };
    coordinator.workflowOwner.failOperation = async (failedOperation) => {
      failedOperationIds.push(failedOperation.operationId);
      return TEST_COMMITTED_TRANSITION_OUTCOME;
    };
    coordinator.workflowOwner.isPriorityRecoveryDrainOwnerUnavailable =
      () => true;
    const planningSnapshot = buildEventDrivenPlanningSnapshot({
      operationId: TEST_REPRESENTATIVE_CONTROL_PLANE_PUBLICATION_OPERATION_ID,
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.PENDING,
      actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      completionState:
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      spreadGap: 0,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    });
    const decisionSnapshot =
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots[0];

    t.equal(
      decisionSnapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      TEST_ASSERT_SPREAD_SATISFIED_NEXT_ACTION,
    );
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        decisionSnapshot,
        [operation],
      ),
      true,
      TEST_ASSERT_SPREAD_SATISFIED_WAIT_PROGRESS_DRAIN,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.same(
      failedOperationIds,
      [TEST_REPRESENTATIVE_CONTROL_PLANE_PUBLICATION_OPERATION_ID],
      TEST_ASSERT_SPREAD_SATISFIED_WAIT_PROGRESS_DRAIN,
    );
    t.same(
      completedOperationIds,
      [],
      'an undispatched REPLACE must never settle as completed/REMOVED ' +
        'without source-retirement evidence',
    );
    t.same(
      [deliveries.length, deferredTimers.length],
      [0, 0],
      TEST_ASSERT_SPREAD_SATISFIED_NO_REMOTE_WAKE,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test(TEST_SPREAD_SATISFIED_REENTRY_TEST_NAME, async (t) => {
  const completedOperationIds = [];
  const failedOperationIds = [];
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    for (const witness of TEST_SPREAD_SATISFIED_DRAIN_WITNESSES) {
      const deliveries = [];
      const deferredTimers = [];
      const operation = buildEventDrivenOperation({
        operationId: witness.operationId,
        partitionId: witness.partitionId,
        entityId: witness.partitionId,
        replicaId: witness.replicaId,
        sourceNodeId: witness.sourceNodeId,
        targetNodeId: witness.targetNodeId,
        workflowStep: WORKFLOW_STEP.PENDING,
      });
      const operationRow = buildEventDrivenOperationRow({
        operation_id: witness.operationId,
        partition_id: witness.partitionId,
        entity_id: witness.partitionId,
        replica_id: witness.replicaId,
        source_node_id: witness.sourceNodeId,
        target_node_id: witness.targetNodeId,
        workflow_step: WORKFLOW_STEP.PENDING,
      });
      const coordinator = createEventDrivenCoordinator(
        deliveries,
        deferredTimers,
        operationRow,
        {
          operationId: witness.operationId,
          partitionId: witness.partitionId,
          workflowStep: WORKFLOW_STEP.PENDING,
          actuationState:
            PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
          completionState:
            PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
          spreadGap: 0,
        },
      );

      try {
        coordinator.initialize();
        coordinator.workflowOwner.completeOperation =
          async (completedOperation) => {
            completedOperationIds.push(completedOperation.operationId);
            return TEST_COMMITTED_TRANSITION_OUTCOME;
          };
        coordinator.workflowOwner.failOperation =
          async (failedOperation) => {
            failedOperationIds.push(failedOperation.operationId);
            return TEST_COMMITTED_TRANSITION_OUTCOME;
          };
        coordinator.workflowOwner.isPriorityRecoveryDrainOwnerUnavailable =
          () => true;
        coordinator.workflowOwner.repository
          .getOperationsByEntityAuthoritativeObservation = async () => {
            return Object.freeze({
              state: 'present',
              operationCount: 1,
              operations: Object.freeze([operation]),
              deferredOutcome: null,
              retryAfterMs: null,
            });
          };

        const snapshot =
          await coordinator.workflowOwner
            .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
              witness.partitionId,
              [operation],
            );
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        t.equal(
          snapshot?.partitionId,
          witness.partitionId,
          'the focused fixture should preserve the priority partition',
        );
        t.ok(
          failedOperationIds.includes(witness.operationId),
          TEST_ASSERT_SPREAD_SATISFIED_DRAIN,
        );
        t.notOk(
          completedOperationIds.includes(witness.operationId),
          'an undispatched REPLACE must never settle as completed/REMOVED ' +
            'without source-retirement evidence',
        );
        t.equal(
          deliveries.length,
          0,
          TEST_ASSERT_SPREAD_SATISFIED_NO_REMOTE_WAKE,
        );
        t.equal(
          deferredTimers.length,
          0,
          TEST_ASSERT_SPREAD_SATISFIED_NO_REMOTE_WAKE,
        );
      } finally {
        await coordinator.shutdown();
      }
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test(TEST_SPREAD_SATISFIED_ADD_TARGET_DRAIN_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const completedOperationIds = [];
  const failedOperationIds = [];
  const operation = buildEventDrivenOperation({
    operationId: TEST_REPLICA_OPERATIONS_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
    entityId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
    replicaId: TEST_REPLICA_OPERATIONS_REPLICA_ID,
    sourceNodeId: TEST_REPLICA_OPERATIONS_SOURCE_NODE_ID,
    targetNodeId: TEST_REPLICA_OPERATIONS_TARGET_NODE_ID,
    workflowStep: WORKFLOW_STEP.PENDING,
    status: ReplicaStatus.PENDING,
  });
  const operationRow = buildEventDrivenOperationRow({
    operation_id: TEST_REPLICA_OPERATIONS_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_REPLICA_OPERATIONS_PARTITION_ID,
    entity_id: TEST_REPLICA_OPERATIONS_PARTITION_ID,
    replica_id: TEST_REPLICA_OPERATIONS_REPLICA_ID,
    source_node_id: TEST_REPLICA_OPERATIONS_SOURCE_NODE_ID,
    target_node_id: TEST_REPLICA_OPERATIONS_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    status: ReplicaStatus.PENDING,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      operationId: TEST_REPLICA_OPERATIONS_OPERATION_ID,
      partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.PENDING,
      latestOperationStatus: ReplicaStatus.PENDING,
      actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      completionState:
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      spreadGap: 0,
    },
  );

  try {
    coordinator.initialize();
    const completion = Object.freeze({
      state: PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
    });
    const priorityRecoveryContext = Object.freeze({
      decisionSnapshot: Object.freeze({
        spreadCompletion: Object.freeze({
          satisfyingOperationIds: Object.freeze([
            TEST_REPLICA_OPERATIONS_OPERATION_ID,
          ]),
        }),
      }),
      completion,
    });
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
        return TEST_COMMITTED_TRANSITION_OUTCOME;
      };
    coordinator.workflowOwner.failOperation =
      async (failedOperation) => {
        failedOperationIds.push(failedOperation.operationId);
        return TEST_COMMITTED_TRANSITION_OUTCOME;
      };
    coordinator.workflowOwner.buildPriorityRecoveryCompletionForOperation =
      () => completion;
    coordinator.workflowOwner.buildPriorityRecoveryAssessmentContextForOperation =
      () => priorityRecoveryContext;
    coordinator.workflowOwner.repository.getObservedReplicaStatusFromCache =
      () => ReplicaStatus.ACTIVE;

    const completed =
      await coordinator.workflowOwner.reconcilePriorityRecoveryOperationDrain(
        operation,
      );

    t.equal(
      completed,
      true,
      TEST_ASSERT_SPREAD_SATISFIED_ADD_TARGET_DRAIN,
    );
    t.same(
      completedOperationIds,
      [TEST_REPLICA_OPERATIONS_OPERATION_ID],
      TEST_ASSERT_SPREAD_SATISFIED_ADD_TARGET_DRAIN,
    );
    t.same(
      failedOperationIds,
      [],
      TEST_ASSERT_SPREAD_SATISFIED_ADD_TARGET_DRAIN,
    );
    t.same(
      [deliveries.length, deferredTimers.length],
      [0, 0],
      TEST_ASSERT_SPREAD_SATISFIED_NO_REMOTE_WAKE,
    );
  } finally {
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
        buildEventDrivenPlanningSnapshot({
          partitionId: TEST_SQL_WRITE_PARTITION_ID,
          operationId: operation.operationId,
          workflowStep: WORKFLOW_STEP.SENDING,
          actuationState:
            PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
          completionState: 'blocked',
          spreadGap: TEST_READY_DISTINCT_NODE_COUNT,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.partitionId,
      operation.partitionId,
      'the focused fixture should preserve the sql_write_operations partition',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
      'direct owner snapshots should wake the dispatch owner',
    );
    t.equal(
      snapshot?.operationOwnerObservation?.requestedOwnerAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'direct owner snapshots should keep owner advancement requested',
    );
    t.equal(
      deliveries.length,
      1,
      'direct owner snapshot builds should enqueue one owner wake',
    );
    t.equal(
      deliveries[0]?.target,
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
      setTimeout(resolve, 0);
    });

    t.equal(
      deliveries.length,
      1,
      'PENDING priority cache rows should wake the remote operation owner',
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_CACHE_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      1,
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
      setTimeout(resolve, 0);
    });

    t.equal(
      deliveries.length,
      2,
      'SENDING priority cache rows should re-wake the remote operation owner',
    );
    t.equal(
      deliveries[1]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_CACHE_REENTRY_TARGET,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_TARGET_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const observedProgressOperationIds = [];
  const operation = buildEventDrivenOperation({
    status: ReplicaStatus.CREATING,
    workflowStep: WORKFLOW_STEP.CREATING,
    targetNodeId: TEST_OBSERVER_NODE_ID,
  });
  const operationWithTargetProgress = Object.freeze({
    ...operation,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    target_node_id: TEST_OBSERVER_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      workflowStep: WORKFLOW_STEP.CREATING,
      latestOperationStatus: ReplicaStatus.CREATING,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      coordinatorOperation: operationWithTargetProgress,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.reconcileObservedProgressOperation =
      async (operationId) => {
        observedProgressOperationIds.push(operationId);
        return true;
      };

    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operationWithTargetProgress],
        buildEventDrivenPlanningSnapshot({
          workflowStep: WORKFLOW_STEP.CREATING,
          latestOperationStatus: ReplicaStatus.CREATING,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
          coordinatorOperation: operationWithTargetProgress,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
      TEST_ASSERT_TARGET_PROGRESS_PHASE,
    );
    t.same(
      observedProgressOperationIds,
      [operation.operationId],
      TEST_ASSERT_TARGET_PROGRESS_REENTRY,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_REMOTE_TARGET_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    status: ReplicaStatus.CREATING,
    workflowStep: WORKFLOW_STEP.CREATING,
    targetNodeId: TEST_TARGET_NODE_ID,
  });
  const operationWithTargetProgress = Object.freeze({
    ...operation,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    target_node_id: TEST_TARGET_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      workflowStep: WORKFLOW_STEP.CREATING,
      latestOperationStatus: ReplicaStatus.CREATING,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      coordinatorOperation: operationWithTargetProgress,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();

    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operationWithTargetProgress],
        buildEventDrivenPlanningSnapshot({
          workflowStep: WORKFLOW_STEP.CREATING,
          latestOperationStatus: ReplicaStatus.CREATING,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
          coordinatorOperation: operationWithTargetProgress,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
      TEST_ASSERT_TARGET_PROGRESS_PHASE,
    );
    t.equal(
      deliveries.length,
      1,
      TEST_ASSERT_REMOTE_TARGET_PROGRESS_WAKE,
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_REMOTE_TARGET_PROGRESS_WAKE,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_DISPATCH_PENDING_TARGET_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const observedProgressOperationIds = [];
  const operation = buildEventDrivenOperation({
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    targetNodeId: TEST_OBSERVER_NODE_ID,
  });
  const operationWithTargetProgress = Object.freeze({
    ...operation,
    targetVisibilityState:
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.PENDING,
    target_node_id: TEST_OBSERVER_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      workflowStep: WORKFLOW_STEP.PENDING,
      latestOperationStatus: ReplicaStatus.PENDING,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      coordinatorOperation: operationWithTargetProgress,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.reconcileObservedProgressOperation =
      async (operationId) => {
        observedProgressOperationIds.push(operationId);
        return true;
      };

    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operationWithTargetProgress],
        buildEventDrivenPlanningSnapshot({
          workflowStep: WORKFLOW_STEP.PENDING,
          latestOperationStatus: ReplicaStatus.PENDING,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
          coordinatorOperation: operationWithTargetProgress,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.same(
      observedProgressOperationIds,
      [operation.operationId],
      TEST_ASSERT_DISPATCH_PENDING_TARGET_PROGRESS_REENTRY,
    );
    t.match(
      snapshot?.progress?.progressContract,
      {
        owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
        boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
        wakeSource: TEST_PROGRESS_CONTRACT_EVENT_WAKE_SOURCE,
        representativeRerunRoute: TEST_PROGRESS_CONTRACT_ELIGIBLE_ROUTE,
      },
      TEST_ASSERT_DIRECT_BUILD_PROGRESS_CONTRACT,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_TARGET_SYNC_ACTIVE_TARGET_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const observedProgressOperationIds = [];
  const operation = buildEventDrivenOperation({
    operationId: TEST_SQL_WRITE_OPERATION_ID,
    partitionId: TEST_SQL_WRITE_PARTITION_ID,
    entityId: TEST_SQL_WRITE_PARTITION_ID,
    replicaId: TEST_SQL_WRITE_REPLICA_ID,
    status: ReplicaStatus.SYNCING,
    workflowStep: WORKFLOW_STEP.SYNCING,
    targetNodeId: TEST_OBSERVER_NODE_ID,
  });
  const operationWithTargetProgress = Object.freeze({
    ...operation,
    targetVisibilityState:
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    operation_id: TEST_SQL_WRITE_OPERATION_ID,
    partition_id: TEST_SQL_WRITE_PARTITION_ID,
    entity_id: TEST_SQL_WRITE_PARTITION_ID,
    replica_id: TEST_SQL_WRITE_REPLICA_ID,
    status: ReplicaStatus.SYNCING,
    workflow_step: WORKFLOW_STEP.SYNCING,
    target_node_id: TEST_OBSERVER_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      partitionId: TEST_SQL_WRITE_PARTITION_ID,
      operationId: TEST_SQL_WRITE_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.SYNCING,
      latestOperationStatus: ReplicaStatus.SYNCING,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      coordinatorOperation: operationWithTargetProgress,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.reconcileObservedProgressOperation =
      async (operationId) => {
        observedProgressOperationIds.push(operationId);
        return true;
      };

    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operationWithTargetProgress],
        buildEventDrivenPlanningSnapshot({
          partitionId: TEST_SQL_WRITE_PARTITION_ID,
          operationId: TEST_SQL_WRITE_OPERATION_ID,
          workflowStep: WORKFLOW_STEP.SYNCING,
          latestOperationStatus: ReplicaStatus.SYNCING,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
          coordinatorOperation: operationWithTargetProgress,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
      'target-sync active target fixture should preserve target-sync phase',
    );
    t.same(
      observedProgressOperationIds,
      [operation.operationId],
      TEST_ASSERT_TARGET_SYNC_ACTIVE_TARGET_PROGRESS_REENTRY,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_SOURCE_REMOVAL_PROGRESS_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const observedProgressOperationIds = [];
  const operation = buildEventDrivenOperation({
    status: ReplicaStatus.ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    targetNodeId: TEST_OBSERVER_NODE_ID,
  });
  const operationWithSourceRemovalProgress = Object.freeze({
    ...operation,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    target_node_id: TEST_OBSERVER_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      workflowStep: WORKFLOW_STEP.ACTIVE,
      latestOperationStatus: ReplicaStatus.ACTIVE,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      completionState: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
      spreadGap: 0,
      coordinatorOperation: operationWithSourceRemovalProgress,
    },
  );
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    coordinator.workflowOwner.reconcileObservedProgressOperation =
      async (operationId) => {
        observedProgressOperationIds.push(operationId);
        return true;
      };

    const snapshot =
      coordinator.workflowOwner.buildPriorityRecoveryDecisionSnapshotForOperations(
        operation.partitionId,
        [operationWithSourceRemovalProgress],
        buildEventDrivenPlanningSnapshot({
          workflowStep: WORKFLOW_STEP.ACTIVE,
          latestOperationStatus: ReplicaStatus.ACTIVE,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
          completionState: PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED,
          spreadGap: 0,
          coordinatorOperation: operationWithSourceRemovalProgress,
        }),
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
      'the focused fixture should preserve the source-removal phase',
    );
    t.same(
      observedProgressOperationIds,
      [operation.operationId],
      TEST_ASSERT_SOURCE_REMOVAL_PROGRESS_REENTRY,
    );
    t.same(
      [deliveries.length, deferredTimers.length],
      [0, 0],
      'local source-removal re-entry should not wake the remote owner',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_SOURCE_REMOVAL_DISPATCH_RETRY_CONTRACT_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    status: ReplicaStatus.ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entityId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL,
    targetVisibilityState:
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
  });
  const operationRow = buildEventDrivenOperationRow({
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    partition_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entity_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replica_id: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    source_node_id: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    target_node_id: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      operationId: TEST_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      latestOperationStatus: ReplicaStatus.ACTIVE,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      completionState:
        PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      spreadGap: 0,
      coordinatorOperation: operation,
      timeoutReconcileDue: false,
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
          operationCount: 1,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    coordinator.workflowOwner.recordOperationDispatchDeferredRetry(
      operation.operationId,
      Object.freeze({
        nextAttemptAt: TEST_CAPTURED_AT_MS + TEST_STEP_TIMEOUT_MS,
        retryAfterMs: TEST_STEP_TIMEOUT_MS,
      }),
    );
    t.equal(
      coordinator.workflowOwner.hasActiveOperationDispatchDeferredRetry(
        operation.operationId,
      ),
      true,
      'dispatch retry fixture should arm owner-visible retry state',
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
          [operation],
        );

    assertSourceRemovalDispatchRetrySnapshot(
      t,
      snapshot,
      operation,
      deliveries,
      deferredTimers,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_DISPATCH_PENDING_DISPATCH_RETRY_CONTRACT_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entityId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replicaId: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    sourceNodeId: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    targetNodeId: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
  });
  const operationRow = buildEventDrivenOperationRow({
    partition_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    entity_id: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
    replica_id: TEST_CONTROL_PLANE_PUBLICATION_REPLICA_ID,
    source_node_id: TEST_CONTROL_PLANE_PUBLICATION_SOURCE_NODE_ID,
    target_node_id: TEST_CONTROL_PLANE_PUBLICATION_TARGET_NODE_ID,
  });
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
    {
      partitionId: TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
      operationId: TEST_OPERATION_ID,
      workflowStep: WORKFLOW_STEP.SENDING,
      latestOperationStatus: ReplicaStatus.PENDING,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      actuationState:
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      completionState: 'blocked',
      coordinatorOperation: operation,
      timeoutReconcileDue: false,
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
          operationCount: 1,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    coordinator.workflowOwner.recordOperationDispatchDeferredRetry(
      operation.operationId,
      Object.freeze({
        nextAttemptAt: TEST_CAPTURED_AT_MS + TEST_STEP_TIMEOUT_MS,
        retryAfterMs: TEST_STEP_TIMEOUT_MS,
      }),
    );
    t.equal(
      coordinator.workflowOwner.hasActiveOperationDispatchDeferredRetry(
        operation.operationId,
      ),
      true,
      'dispatch-pending retry fixture should arm owner-visible retry state',
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID,
          [operation],
        );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    assertDispatchPendingDispatchRetrySnapshot(
      t,
      snapshot,
      operation,
      deliveries,
      deferredTimers,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test(TEST_LOCAL_INITIALIZATION_RETRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation({
    partitionId: TEST_SQL_WRITE_PARTITION_ID,
    entityId: TEST_SQL_WRITE_PARTITION_ID,
    replicaId: TEST_SQL_WRITE_REPLICA_ID,
    targetNodeId: TEST_OBSERVER_NODE_ID,
  });
  const operationRow = buildEventDrivenOperationRow({
    partition_id: TEST_SQL_WRITE_PARTITION_ID,
    entity_id: TEST_SQL_WRITE_PARTITION_ID,
    replica_id: TEST_SQL_WRITE_REPLICA_ID,
    target_node_id: TEST_OBSERVER_NODE_ID,
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

  try {
    t.equal(
      await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation),
      true,
      TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_TIMER,
    );
    t.equal(
      deferredTimers.length,
      1,
      TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_TIMER,
    );
    t.equal(
      deliveries.length,
      0,
      TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_NO_DELIVERY,
    );

    coordinator.initialize();
    await deferredTimers[0].fn();

    t.equal(
      coordinator.workflowOwner.transitionRetryTimerByOperationId.size,
      0,
      TEST_ASSERT_LOCAL_INITIALIZATION_RETRY_RESUMES,
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('event-driven rebalancer handoff waits resolve retry contract fields', async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = buildEventDrivenOperation();
  const operationRow = buildEventDrivenOperationRow();
  const coordinator = createEventDrivenCoordinator(
    deliveries,
    deferredTimers,
    operationRow,
  );

  try {
    coordinator.initialize();
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
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

    const handoffRetrySnapshot =
      coordinator.workflowOwner
        .normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
          {
            ...snapshot,
            actuation: {
              ...snapshot.actuation,
              state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
            },
            progress: {
              ...snapshot.progress,
              blockingBoundary:
                PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
              waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
            },
          }, operation);

    const contract = handoffRetrySnapshot?.progress?.progressContract;


    t.ok(contract, 'progressContract should exist for the handoff snapshot');
    t.equal(
      contract?.representativeRerunRoute,
      'blocked_model_route',
      'event-driven rebalancer handoff wait resolves representative rerun route to blocked_model_route',
    );
    t.equal(
      contract?.ownerReentryState,
      'bounded_owner_reentry_scheduled',
      'event-driven rebalancer handoff wait resolves owner reentry state to bounded_owner_reentry_scheduled',
    );
    t.equal(
      contract?.retryAfterMs,
      1000,
      'event-driven rebalancer handoff wait resolves retryAfterMs to 1000ms',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test(
  'priority recovery drain reports truthful progress from the typed ' +
    'termination outcome (quest terminal-write-refusal-retry-ownership)',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const operation = buildEventDrivenOperation();
    const operationRow = buildEventDrivenOperationRow();
    const coordinator = createEventDrivenCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    try {
      coordinator.initialize();
      const owner = coordinator.workflowOwner;
      let terminationOutcome = TEST_REFUSED_TRANSITION_OUTCOME;
      owner.completeOperation = async () => terminationOutcome;
      owner.failOperation = async () => terminationOutcome;

      const settleSnapshots = [
        {
          action:
            TEST_OPERATION_LIFECYCLE_ACTION.COMPLETE_PRIORITY_RECOVERY_DRAIN,
        },
        {
          action: TEST_OPERATION_LIFECYCLE_ACTION
            .FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET,
          supersededTargetError: 'superseded target probe',
        },
        {
          action: TEST_OPERATION_LIFECYCLE_ACTION
            .FAIL_PRIORITY_RECOVERY_DRAIN_STALE,
          ownerAction: TEST_PRIORITY_DRAIN_OWNER_ACTION.ALLOW_RECONCILE,
        },
      ];

      const refusedProgress = [];
      for (const drainSnapshot of settleSnapshots) {
        refusedProgress.push(
          await owner.reconcilePriorityRecoveryOperationDrain(
            operation,
            drainSnapshot,
          ),
        );
      }
      t.same(
        refusedProgress,
        [false, false, false],
        'a REFUSED termination is NOT drain progress in any settle ' +
          'arm — level-triggered machinery must not believe a settle ' +
          'that never landed',
      );

      terminationOutcome = TEST_COMMITTED_TRANSITION_OUTCOME;
      const committedProgress = [];
      for (const drainSnapshot of settleSnapshots) {
        committedProgress.push(
          await owner.reconcilePriorityRecoveryOperationDrain(
            operation,
            drainSnapshot,
          ),
        );
      }
      t.same(
        committedProgress,
        [true, true, true],
        'a committed termination IS drain progress in every settle arm',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
