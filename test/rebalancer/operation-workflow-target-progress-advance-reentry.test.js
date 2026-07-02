import {test} from '../../src/test-helpers/tap.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
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
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {createMockCache} from './test-helpers.js';

const TEST_PARTITION_ID = 'sql_transaction_participants-p1';
const TEST_OPERATION_ID = 'target-creation-advance-reentry-op';
const TEST_REPLICA_ID = 'sql_transaction_participants-p1-r4';
const TEST_OBSERVER_NODE_ID = 'node-observer';
const TEST_SOURCE_NODE_ID = 'node-source';
const TEST_TARGET_NODE_ID = TEST_OBSERVER_NODE_ID;
const TEST_PUBLICATION_EPOCH = 7;
const TEST_CAPTURED_AT_MS = 1000000;
const TEST_CREATED_AT_MS = 900000;
const TEST_UPDATED_AT_MS = 930000;
const TEST_STEP_AGE_MS = 70000;
const TEST_STEP_TIMEOUT_MS = 60000;
const TEST_EMPTY_ROWS = Object.freeze([]);
const TEST_ENTITY_TYPE_PARTITION = 'partition';

function buildOperation(overrides = {}) {
  return Object.freeze({
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: TEST_CREATED_AT_MS,
    updatedAt: TEST_UPDATED_AT_MS,
    targetVisibilityState:
      PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    targetServiceTerminalState:
      PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
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
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_UPDATED_AT_MS,
    ...overrides,
  });
}

function buildPlanningSnapshot(operation) {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: Object.freeze([]),
    pendingAckCount: 0,
    priorityRecoveryDecisionSnapshots: Object.freeze({
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      snapshots: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          operationId: TEST_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
          completion: Object.freeze({
            state: 'spread_satisfied_in_flight',
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
            latestOperationWorkflowStep: WORKFLOW_STEP.CREATING,
            latestOperationStatus: ReplicaStatus.CREATING,
          }),
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
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
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
            stepAgeMs: TEST_STEP_AGE_MS,
            stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
            lastProgressAtMs: TEST_UPDATED_AT_MS,
          }),
          coordinator: Object.freeze({
            operationIds: Object.freeze([TEST_OPERATION_ID]),
            operation,
          }),
        }),
      ]),
    }),
    priorityPartitionSummary: Object.freeze({
      blockedPartitions: Object.freeze([
        Object.freeze({
          partitionId: TEST_PARTITION_ID,
          readyDistinctNodeCount: 1,
          requiredDistinctNodeCount: 2,
          spreadGap: 1,
        }),
      ]),
    }),
  });
}

function createCoordinator(operation, operationRow) {
  return new RebalanceCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine: {
      async executeQuery(sql) {
        if (String(sql).includes('replica_operations')) {
          return {success: true, rows: [operationRow], affectedRows: 1};
        }
        return {success: true, rows: TEST_EMPTY_ROWS, affectedRows: 0};
      },
    },
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
        return buildPlanningSnapshot(operation);
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
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: NUM.THREE};
      },
    },
    setTimeoutFn(fn, delayMs) {
      return {fn, delayMs};
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
}

test(
  'target-creation advance workflow progress re-enters observed progress',
  async (t) => {
    const operation = buildOperation();
    const operationRow = buildOperationRow();
    const coordinator = createCoordinator(operation, operationRow);
    const observedProgressOperationIds = [];
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
      coordinator.workflowOwner.reconcileObservedProgressOperation =
        async (operationId) => {
          observedProgressOperationIds.push(operationId);
          return true;
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
        snapshot?.progress?.workflowProgressPhaseId,
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
        'fixture should preserve the target-creation phase',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
        'target progress snapshots normalize to the owner wait contract',
      );
      t.equal(
        snapshot?.operationOwnerObservation?.outcome,
        OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
        'owner lane held by the dispatched reentry reports the retry-wait ' +
          'outcome instead of a double advance',
      );
      t.same(
        observedProgressOperationIds,
        [TEST_OPERATION_ID],
        'target-creation owner advance should enter observed progress',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  },
);
