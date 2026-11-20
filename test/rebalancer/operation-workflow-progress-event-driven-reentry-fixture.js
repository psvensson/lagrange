import {
  installCommittedOperationMutationFixture,
  workflowFixtureHistory,
} from './operation-outcome-fixture.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
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
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createCoordinatorSqlStore,
  createMockCache,
  createMockCdcService,
  createMockControlPlaneSystemTableGateway,
} from './test-helpers.js';

const TEST_PARTITION_ID = 'sql_transactions-p1';
const TEST_OPERATION_ID = 'event-driven-progress-operation';
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
const TEST_TIMEOUT_RECONCILE_DUE = true;
const TEST_READY_DISTINCT_NODE_COUNT = 1;
const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_EMPTY_LIST = Object.freeze([]);
const TEST_DELIVERY_STATUS_INITIATED = 'initiated';
const TEST_ENTITY_TYPE_PARTITION = 'partition';

function buildEventDrivenOperation(overrides = {}) {
  const operation = {
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
  };
  return Object.freeze({
    completedAt: null,
    errorMessage: null,
    stepsHistory: workflowFixtureHistory(operation.workflowStep, operation.updatedAt),
    ...operation,
  });
}

function buildEventDrivenOperationRow(overrides = {}) {
  const operation = {
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
  };
  return Object.freeze({completed_at: null, error_message: null,
    steps_history: JSON.stringify(workflowFixtureHistory(operation.workflow_step, operation.updated_at)), ...operation});
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

function createEventDrivenCoordinator(
  deliveries,
  deferredTimers,
  operationRow,
  planningOptions = {},
) {
  const sqlStore = createCoordinatorSqlStore(createMockCache({
    replicaOperations: operationRow ? [operationRow] : [],
  }));
  const execute = (sql, params) => {
    const result = sqlStore.execute(sql, params);
    sqlStore.suspend();
    return result;
  };
  const sqlQueryEngine = {executeQuery: async (sql, params) => execute(sql, params)};
  const gateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);
  gateway.submitMutation = async (mutation) => {
    const result = sqlStore.submitMutation(mutation);
    sqlStore.suspend();
    return result;
  };
  installCommittedOperationMutationFixture(gateway);
  return new RebalanceCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    authoritativeVisibilityTimeoutMs: 0,
    authoritativeVisibilityRetryDelayMs: 0,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: createMockCdcService(),
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: createMockCache(),
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningAnswerSync: () =>
        buildEventDrivenPlanningSnapshot(planningOptions),
      getPriorityRecoveryPlanningSnapshotBestEffort: () =>
        buildEventDrivenPlanningSnapshot(planningOptions),
      getNodeReadinessSync(nodeId) {
        return {nodeId, dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        }};
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: TEST_DELIVERY_STATUS_INITIATED,
        });
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {targetReplicaCount: 3, minReplicaCount: TEST_MIN_REPLICA_COUNT};
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

export {
  TEST_PARTITION_ID,
  TEST_OPERATION_ID,
  TEST_REPLICA_ID,
  TEST_OBSERVER_NODE_ID,
  TEST_SOURCE_NODE_ID,
  TEST_TARGET_NODE_ID,
  TEST_PUBLICATION_EPOCH,
  TEST_CAPTURED_AT_MS,
  TEST_STEP_TIMEOUT_MS,
  TEST_READY_DISTINCT_NODE_COUNT,
  TEST_EMPTY_LIST,
  TEST_DELIVERY_STATUS_INITIATED,
  buildEventDrivenOperation,
  buildEventDrivenOperationRow,
  buildEventDrivenPlanningSnapshot,
  createEventDrivenCoordinator,
};
