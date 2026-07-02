import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
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
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from '../../src/control-plane/priority-recovery-snapshot-contract.js';
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
const TEST_OPERATION_ID = 'target-sync-active-progress-operation';
const TEST_REPLICA_ID = 'sql_transactions-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_PUBLICATION_EPOCH = 2;
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_CREATED_AT_MS = 900000;
const TEST_UPDATED_AT_MS = 960000;
const TEST_STEP_AGE_MS = 40000;
const TEST_STEP_TIMEOUT_MS = 30000;
const TEST_READY_DISTINCT_NODE_COUNT = 1;
const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_EMPTY_ROWS = Object.freeze([]);
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_REPLICA_DISPATCH_TARGET =
  'node-target/service/replica-dispatch';
const TEST_DELIVERY_STATUS_INITIATED = 'initiated';
const TEST_PROGRESS_CONTRACT_EVENT_WAKE_SOURCE = 'operation_lifecycle_event';
const TEST_PROGRESS_CONTRACT_ELIGIBLE_ROUTE = 'eligible';
const TEST_ASSERT_TARGET_SYNC_CONTRACT =
  'target-sync active target progress should expose owner progress';
const TEST_ASSERT_TARGET_SYNC_REENTRY =
  'target-sync active target progress should enter observed progress';
const TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE =
  'remote target-sync active target progress should wake the owner';
const TEST_ASSERT_SOURCE_REMOVAL_REENTRY =
  'source-removal owner advance progress should enter observed progress';

function buildOperation(overrides = {}) {
  return Object.freeze({
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_OBSERVER_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflowStep: WORKFLOW_STEP.SYNCING,
    createdAt: TEST_CREATED_AT_MS,
    updatedAt: TEST_UPDATED_AT_MS,
    targetVisibilityState:
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.NON_TERMINAL,
    ...overrides,
  });
}

function buildOperationRow(overrides = {}) {
  return Object.freeze({
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_OBSERVER_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflow_step: WORKFLOW_STEP.SYNCING,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_UPDATED_AT_MS,
    ...overrides,
  });
}

function buildPlanningSnapshot(options = {}) {
  const operation = options.coordinatorOperation || null;
  const workflowProgressPhaseId =
    options.workflowProgressPhaseId ||
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC;
  const nextRequiredAction =
    options.nextRequiredAction ||
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
  const workflowStep = options.workflowStep || WORKFLOW_STEP.SYNCING;
  const latestOperationStatus =
    options.latestOperationStatus || ReplicaStatus.SYNCING;
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_OBSERVER_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: TEST_EMPTY_LIST,
    pendingAckCount: 0,
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
            latestOperationStatus,
          }),
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
            workflowProgressPhaseId,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
            timeoutReconcileDue: true,
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
          coordinator: Object.freeze({
            operationIds: Object.freeze([TEST_OPERATION_ID]),
            ...(operation ? {operation} : {}),
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
          spreadGap: TEST_READY_DISTINCT_NODE_COUNT,
        }),
      ]),
    }),
  });
}

function buildSqlQueryEngine(operationRow) {
  return {
    async executeQuery(sql) {
      if (String(sql).includes(TEST_REPLICA_OPERATIONS_TABLE)) {
        return {success: true, rows: [operationRow], affectedRows: 1};
      }
      if (String(sql).includes(TEST_SERVICES_TABLE)) {
        return {
          success: true,
          rows: TEST_EMPTY_ROWS,
          affectedRows: 0,
        };
      }
      return {success: true, rows: TEST_EMPTY_ROWS, affectedRows: 0};
    },
  };
}

function createCoordinator(deliveries, deferredTimers, operationRow) {
  return new RebalanceCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine: buildSqlQueryEngine(operationRow),
    transactionCoordinator: {
      async begin() {
        return {success: true};
      },
      async commit() {
        return {success: true};
      },
      async rollback() {
        return {success: true};
      },
    },
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: TEST_EMPTY_ROWS, affectedRows: 0};
      },
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildPlanningSnapshot();
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

async function flushReentryQueue() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function buildDecisionSnapshot(coordinator, operation, planningOptions) {
  return coordinator.workflowOwner
    .buildPriorityRecoveryDecisionSnapshotForOperations(
      operation.partitionId,
      [operation],
      buildPlanningSnapshot({
        ...planningOptions,
        coordinatorOperation: operation,
      }),
    );
}

function installObservedProgressProbe(coordinator, observedProgressOperationIds) {
  coordinator.workflowOwner.reconcileObservedProgressOperation =
    async (operationId) => {
      observedProgressOperationIds.push(operationId);
      return true;
    };
}

function assertOwnerProgressContract(t, snapshot, message) {
  t.match(
    snapshot?.progress?.progressContract,
    {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      wakeSource: TEST_PROGRESS_CONTRACT_EVENT_WAKE_SOURCE,
      representativeRerunRoute: TEST_PROGRESS_CONTRACT_ELIGIBLE_ROUTE,
    },
    message,
  );
}

test(
  'target-sync active target wait snapshots expose local owner progress',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const observedProgressOperationIds = [];
    const operation = buildOperation();
    const operationRow = buildOperationRow();
    const coordinator = createCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    const originalDateNow = Date.now;
    Date.now = () => TEST_CAPTURED_AT_MS;

    try {
      coordinator.initialize();
      installObservedProgressProbe(coordinator, observedProgressOperationIds);

      const snapshot = buildDecisionSnapshot(coordinator, operation, {
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      });
      await flushReentryQueue();

      t.equal(
        snapshot?.operationOwnerObservation?.outcome,
        OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        TEST_ASSERT_TARGET_SYNC_CONTRACT,
      );
      t.equal(
        snapshot?.operationOwnerObservation?.effectCommand,
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .ADVANCE_EXISTING_OPERATION_COMMAND,
        TEST_ASSERT_TARGET_SYNC_CONTRACT,
      );
      assertOwnerProgressContract(t, snapshot, TEST_ASSERT_TARGET_SYNC_CONTRACT);
      t.same(
        observedProgressOperationIds,
        [operation.operationId],
        TEST_ASSERT_TARGET_SYNC_REENTRY,
      );
      t.equal(deliveries.length, 0, TEST_ASSERT_TARGET_SYNC_REENTRY);
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  },
);

test(
  'remote target-sync active target wait snapshots wake the owner',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const operation = buildOperation({
      targetNodeId: TEST_TARGET_NODE_ID,
    });
    const operationRow = buildOperationRow({
      target_node_id: TEST_TARGET_NODE_ID,
    });
    const coordinator = createCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    const originalDateNow = Date.now;
    Date.now = () => TEST_CAPTURED_AT_MS;

    try {
      coordinator.initialize();

      const snapshot = buildDecisionSnapshot(coordinator, operation, {
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      });
      await flushReentryQueue();

      t.equal(
        snapshot?.operationOwnerObservation?.outcome,
        OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
        TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE,
      );
      t.equal(
        snapshot?.operationOwnerObservation?.effectCommand,
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
        TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE,
      );
      assertOwnerProgressContract(
        t,
        snapshot,
        TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE,
      );
      t.equal(
        deliveries.length,
        1,
        TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE,
      );
      t.equal(
        deliveries[0]?.target,
        TEST_REPLICA_DISPATCH_TARGET,
        TEST_ASSERT_REMOTE_TARGET_SYNC_WAKE,
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  },
);

test(
  'normalized target-sync owner advance snapshots still re-enter progress',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const observedProgressOperationIds = [];
    const operation = buildOperation();
    const operationRow = buildOperationRow();
    const coordinator = createCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    const originalDateNow = Date.now;
    Date.now = () => TEST_CAPTURED_AT_MS;

    try {
      coordinator.initialize();
      installObservedProgressProbe(coordinator, observedProgressOperationIds);

      const snapshot = buildDecisionSnapshot(coordinator, operation, {
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      });
      await flushReentryQueue();

      t.equal(
        snapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
        TEST_ASSERT_TARGET_SYNC_CONTRACT,
      );
      t.same(
        observedProgressOperationIds,
        [operation.operationId],
        TEST_ASSERT_TARGET_SYNC_REENTRY,
      );
      t.equal(deliveries.length, 0, TEST_ASSERT_TARGET_SYNC_REENTRY);
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  },
);

test(
  'normalized source-removal owner advance snapshots still re-enter progress',
  async (t) => {
    const deliveries = [];
    const deferredTimers = [];
    const observedProgressOperationIds = [];
    const operation = buildOperation({
      status: ReplicaStatus.ACTIVE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
    });
    const operationRow = buildOperationRow({
      status: ReplicaStatus.ACTIVE,
      workflow_step: WORKFLOW_STEP.ACTIVE,
    });
    const coordinator = createCoordinator(
      deliveries,
      deferredTimers,
      operationRow,
    );
    const originalDateNow = Date.now;
    Date.now = () => TEST_CAPTURED_AT_MS;

    try {
      coordinator.initialize();
      installObservedProgressProbe(coordinator, observedProgressOperationIds);

      const snapshot = buildDecisionSnapshot(coordinator, operation, {
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
        workflowStep: WORKFLOW_STEP.ACTIVE,
        latestOperationStatus: ReplicaStatus.ACTIVE,
      });
      await flushReentryQueue();

      t.equal(
        snapshot?.progress?.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
        TEST_ASSERT_SOURCE_REMOVAL_REENTRY,
      );
      t.same(
        observedProgressOperationIds,
        [operation.operationId],
        TEST_ASSERT_SOURCE_REMOVAL_REENTRY,
      );
      t.equal(deliveries.length, 0, TEST_ASSERT_SOURCE_REMOVAL_REENTRY);
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  },
);
