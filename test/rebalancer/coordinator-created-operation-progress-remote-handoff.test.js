import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {NUM, SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from
  '../../src/control-plane/priority-recovery-completion.js';
import {TIMEOUT_BUDGET_DEFAULT} from
  '../../src/control-plane/timeout-budget.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const REMOTE_HANDOFF_TEST_INITIAL_NOW_MS = 1_000_000;
const REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS = 1;
const RECENT_INTENT_POLICY_NODE_ID = 'recent-intent-policy-node';
const RECENT_INTENT_POLICY_TARGET_NODE_ID =
  'recent-intent-policy-target-node';
const RECENT_INTENT_PRIORITY_OPERATION_ID =
  'recent-intent-priority-operation';
const RECENT_INTENT_NON_PRIORITY_OPERATION_ID =
  'recent-intent-non-priority-operation';
const RECENT_INTENT_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const RECENT_INTENT_NON_PRIORITY_PARTITION_ID = 'customer_orders-p1';
const REMOTE_PRIORITY_VISIBILITY_OBSERVER_NODE_ID =
  'remote-priority-visibility-observer-node';
const REMOTE_PRIORITY_VISIBILITY_OPERATION_ID =
  'remote-priority-visibility-operation';
const REMOTE_PRIORITY_VISIBILITY_PARTITION_ID = 'sql_write_operations-p1';
const REMOTE_PRIORITY_VISIBILITY_TARGET_NODE_ID =
  'remote-priority-visibility-target-node';
const REMOTE_PRIORITY_VISIBILITY_REPLICA_ID =
  'sql_write_operations-p1-r4';
const REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE =
  'priority_recovery_authoritative_operation_read';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID =
  'sql_transaction_participants-p1';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID =
  'remote-priority-serial-wait-source-operation';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID =
  'remote-priority-serial-wait-source-active-operation';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID =
  'remote-priority-serial-wait-source-removed-operation';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID = 'serial-wait-source-node';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID =
  'serial-wait-source-target-node';
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
const REMOTE_PRIORITY_SERIAL_WAIT_LAST_PROGRESS_AT_MS = 5000;
const REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS = 5000;
const REMOTE_PRIORITY_SERIAL_WAIT_EPOCH = 4;
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH = 2;
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_CREATED_AT_MS = 3000;
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_UPDATED_AT_MS = 3001;
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_CREATED_AT_MS = 1000;
const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS = 2000;
const REMOTE_PRIORITY_TIMEOUT_PARTITION_ID = 'replica_operations-p1';
const REMOTE_PRIORITY_TIMEOUT_OPERATION_ID =
  'remote-priority-timeout-operation';
const REMOTE_PRIORITY_TIMEOUT_TARGET_NODE_ID =
  'remote-priority-timeout-target-node';
const REMOTE_PRIORITY_TIMEOUT_REPLICA_ID = 'replica_operations-p1-r4';
const REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS = 1000000;
const REMOTE_PRIORITY_EMPTY_OBSERVATION_STATE = 'empty';
const REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID =
  'sql_write_operations-p1';
const REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID =
  'remote-priority-dispatch-pending-operation';
const REMOTE_PRIORITY_DISPATCH_PENDING_TARGET_NODE_ID =
  'remote-priority-dispatch-pending-target-node';
const REMOTE_PRIORITY_DISPATCH_PENDING_REPLICA_ID =
  'sql_write_operations-p1-r4';
const REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS = 1000000;
const REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS =
  REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS - 1;
const REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS = Object.freeze([
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
  'sql_transactions-p1',
  REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
]);
const REMOTE_PRIORITY_TIMEOUT_SUPPORTING_OPERATION_IDS = Object.freeze([
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
  'remote-priority-timeout-sql-transactions-operation',
  REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
]);

function buildRemotePrioritySerialWaitPlanningSnapshot() {
  return Object.freeze({
    priorityRecoveryDecisionSnapshots: {
      capturedAt: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
      publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_EPOCH,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          operationId: null,
          blockerReasons: ['priority_operation_serial_wait'],
          semanticState: 'needs_operation',
          completion: {
            state: 'blocked',
          },
          observation: {
            workflowState: 'none',
            visibilityState: 'none',
            provenance: {
              capturedAt: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
              workflowSource: 'none',
            },
          },
          conditions: {},
          actuation: {
            state: 'transition_deferred',
            owner: 'operation_workflow_owner',
            workflowProgressPhaseId: 'none',
            lastProgressAtMs: REMOTE_PRIORITY_SERIAL_WAIT_LAST_PROGRESS_AT_MS,
          },
          progress: {
            contractState: 'pending',
            nextAction: 'wait',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'wait_for_operation_progress',
            blockingBoundary: 'workflow_progress',
            waitMode: 'event_driven',
            workflowProgressPhaseId: 'none',
            lastProgressAtMs:
              REMOTE_PRIORITY_SERIAL_WAIT_LAST_PROGRESS_AT_MS,
          },
          planner: {
            ready: false,
            spreadGap: 1,
          },
          admission: {
            effectiveEligibleNodeIds: ['eligible-node-a', 'eligible-node-b'],
            recoveryEligibleExcludedNodeIds: [],
          },
          spreadCompletion: {},
          coordinator: {
            operationIds: [],
            serialWaitOperationIds: [
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            ],
          },
        }),
      ],
    },
    priorityPartitionSummary: {
      blockedPartitions: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          spreadGap: 1,
          readyDistinctNodeCount: 1,
          requiredDistinctNodeCount: 2,
        }),
      ],
    },
  });
}

function buildRemotePrioritySerialWaitSourcePlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: Object.freeze([
      REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
      REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
    ]),
    pendingAckNodeIds: Object.freeze([]),
    pendingAckCount: NUM.ZERO,
    priorityRecoveryDecisionSnapshots: {
      capturedAt: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
      publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
          operationId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID,
          blockerReasons: ['priority_operation_serial_wait'],
          semanticState: 'needs_operation',
          completion: {
            state: 'blocked',
          },
          observation: {
            workflowState: 'none',
            visibilityState: 'none',
            provenance: {
              capturedAt: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
              workflowSource: 'none',
            },
          },
          conditions: {},
          actuation: {
            state: 'transition_deferred',
            owner: 'operation_workflow_owner',
            workflowProgressPhaseId: 'none',
            lastProgressAtMs: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
          },
          progress: {
            contractState: 'pending',
            nextAction: 'wait',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'wait_for_operation_progress',
            blockingBoundary: 'workflow_progress',
            waitMode: 'event_driven',
            workflowProgressPhaseId: 'none',
            lastProgressAtMs: REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
          },
          coordinator: {
            operationIds: [
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID,
            ],
            serialWaitOperationIds: [
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
              REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
            ],
            serialWaitPartitionIds: [
              'replica_operations-p1',
              REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
            ],
          },
        }),
      ],
    },
    priorityPartitionSummary: {
      blockedPartitions: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
          spreadGap: 1,
          readyDistinctNodeCount: 1,
          requiredDistinctNodeCount: 2,
        }),
      ],
      readyEligibleNodeCount: 2,
    },
  });
}

function buildRemotePriorityVisibilityPlanningSnapshot() {
  return Object.freeze({
    priorityRecoveryDecisionSnapshots: {
      capturedAt: 4000,
      publicationEpoch: 4,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          operationId: REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
          coordinator: {
            operationIds: [REMOTE_PRIORITY_VISIBILITY_OPERATION_ID],
          },
        }),
      ],
    },
  });
}

function buildRemotePriorityTimeoutPlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_EPOCH,
    publicationStatus: 'PUBLISHED',
    priorityRecoveryDecisionSnapshots: {
      capturedAt: REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS,
      publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_EPOCH,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
          operationId: REMOTE_PRIORITY_TIMEOUT_OPERATION_ID,
          blockerReasons: ['operation_created_but_no_step_transitions'],
          semanticState: 'operation_stalled',
          completion: {
            state: 'blocked',
          },
          observation: {
            workflowState: 'in_flight',
            visibilityState: 'cache_visible',
            provenance: {
              capturedAt: REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS,
              workflowSource: 'system_table_cache',
            },
          },
          actuation: {
            state: 'transition_deferred',
            owner: 'operation_workflow_owner',
            workflowProgressPhaseId: 'target_creation',
            lastProgressAtMs: REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS - 1,
          },
          progress: {
            contractState: 'blocked',
            nextAction: 'retry',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'reconcile_stale_operation_progress',
            blockingBoundary: 'workflow_timeout',
            waitMode: 'timeout_reconcile_due',
            workflowProgressPhaseId: 'target_creation',
            lastProgressAtMs: REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS - 1,
          },
          coordinator: {
            operationIds: [REMOTE_PRIORITY_TIMEOUT_OPERATION_ID],
            serialWaitOperationIds:
              REMOTE_PRIORITY_TIMEOUT_SUPPORTING_OPERATION_IDS,
            serialWaitPartitionIds:
              REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS,
          },
        }),
      ],
    },
    priorityPartitionSummary: {
      blockedPartitions: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
          spreadGap: 1,
          readyDistinctNodeCount: 1,
          requiredDistinctNodeCount: 2,
        }),
      ],
    },
  });
}

function buildRemotePriorityDispatchPendingPlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH,
    publicationStatus: 'PUBLISHED',
    priorityRecoveryDecisionSnapshots: {
      capturedAt: REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS,
      publicationEpoch: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
          operationId: REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
          blockerReasons: [],
          semanticState: 'recovering_in_flight',
          completion: {
            state: 'blocked',
          },
          observation: {
            workflowState: 'in_flight',
            visibilityState: 'cache_visible',
            provenance: {
              capturedAt: REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS,
              workflowSource: 'system_table_cache',
            },
          },
          conditions: {},
          actuation: {
            state: 'persisted_not_dispatched',
            owner: 'operation_workflow_owner',
            workflowProgressPhaseId: 'dispatch_pending',
            lastProgressAtMs:
              REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
          },
          progress: {
            contractState: 'pending',
            nextAction: 'wait',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'wait_for_operation_progress',
            blockingBoundary: 'workflow_progress',
            waitMode: 'event_driven',
            workflowProgressPhaseId: 'dispatch_pending',
            lastProgressAtMs:
              REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
          },
          coordinator: {
            operationIds: [REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID],
          },
        }),
      ],
    },
    priorityPartitionSummary: {
      blockedPartitions: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
          spreadGap: 1,
          readyDistinctNodeCount: 1,
          requiredDistinctNodeCount: 2,
        }),
      ],
    },
  });
}

function createRemotePriorityVisibilityCoordinator() {
  const controlPlaneReadinessService = {
    ...createMockControlPlaneReadinessService(),
    async getPriorityRecoveryPlanningAnswerBestEffort() {
      return buildRemotePriorityVisibilityPlanningSnapshot();
    },
  };
  return new RebalanceCoordinator({
    nodeId: REMOTE_PRIORITY_VISIBILITY_OBSERVER_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: NUM.ONE};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    controlPlaneReadinessService,
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
}

function buildRemotePriorityVisibilityOperation() {
  return Object.freeze({
    operationId: REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
    targetNodeId: REMOTE_PRIORITY_VISIBILITY_TARGET_NODE_ID,
    replicaId: REMOTE_PRIORITY_VISIBILITY_REPLICA_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: 3000,
    updatedAt: 3001,
  });
}

function buildRemotePriorityTimeoutOperation(startedAtMs) {
  return Object.freeze({
    operationId: REMOTE_PRIORITY_TIMEOUT_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
    targetNodeId: REMOTE_PRIORITY_TIMEOUT_TARGET_NODE_ID,
    replicaId: REMOTE_PRIORITY_TIMEOUT_REPLICA_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: startedAtMs,
    updatedAt: startedAtMs,
  });
}

function buildRemotePriorityDispatchPendingOperation() {
  return Object.freeze({
    operationId: REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
    targetNodeId: REMOTE_PRIORITY_DISPATCH_PENDING_TARGET_NODE_ID,
    replicaId: REMOTE_PRIORITY_DISPATCH_PENDING_REPLICA_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
    updatedAt: REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
  });
}

function createRecentIntentPolicyCoordinator() {
  return new RebalanceCoordinator({
    nodeId: RECENT_INTENT_POLICY_NODE_ID,
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: NUM.ONE};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: NUM.ZERO};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
}

test('createOperation retries coordinator-created handoff for remote-owned ' +
  'priority REPLACE operations until the canonical owner wake-up succeeds',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  let deliveryAttempt = 0;
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        deliveryAttempt += 1;
        if (deliveryAttempt === 1) {
          const error = new Error('connection unavailable');
          error.deferRetry = true;
          error.retryAfterMs = 250;
          throw error;
        }
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'sql_write_operations-p1',
      entityType: 'partition',
      entityId: 'sql_write_operations-p1',
      nodeId: 'node-target',
      replicaId: 'sql_write_operations-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      operationRows.get(operation.operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'the inserted row should stay pending until the remote owner accepts the handoff',
    );
    t.equal(
      deliveries.length,
      1,
      'remote-owned priority REPLACE handoff should wake the canonical owner immediately',
    );
    t.equal(
      deliveries[0]?.target,
      'node-target/service/replica-dispatch',
      'handoff should target the remote replica-dispatch owner ingress',
    );
    t.equal(
      deferredTimers.length,
      1,
      'retryable remote handoff failure should arm one deferred handoff retry',
    );

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'deferred handoff retry should re-send the owner wake-up through the same ingress',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery partition snapshots preserve ' +
  'planning serial-wait witnesses for carrier partitions without local ' +
  'operation rows',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePrioritySerialWaitPlanningSnapshot();
    };
  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async () => {
      return Object.freeze({
        state: 'present',
        operationCount: NUM.ZERO,
        operations: [],
        deferredOutcome: null,
        retryAfterMs: null,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          [],
        );

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'wait_for_operation_progress',
      'carrier partitions should retain the planning serial-wait next action when the supporting source partition operation is still in flight',
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      'workflow_progress',
      'carrier partitions should stay on the workflow-progress boundary instead of reopening follow-up scheduling',
    );
    t.same(
      snapshot?.coordinator?.serialWaitPartitionIds,
      [REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID],
      'carrier snapshots should retain the supporting source partition context from planning',
    );
    t.same(
      snapshot?.coordinator?.serialWaitOperationIds,
      [REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID],
      'carrier snapshots should retain the supporting source operation context from planning',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery source partition snapshots prefer ' +
  'live workflow progress over stale planning serial-wait matches while ' +
  'preserving supporting carrier context',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  const originalDateNow = Date.now;
  Date.now = () => REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS;
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePrioritySerialWaitSourcePlanningSnapshot();
    };
  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async () => {
      return Object.freeze({
        state: 'present',
        operationCount: 2,
        operations: [
          Object.freeze({
            operationId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
            type: OperationType.REMOVE,
            partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            sourceNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
            targetNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
            replicaId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID,
            status: ReplicaStatus.PENDING,
            workflowStep: WORKFLOW_STEP.SENDING,
            createdAt: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_CREATED_AT_MS,
            updatedAt: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_UPDATED_AT_MS,
            completedAt: null,
          }),
          Object.freeze({
            operationId:
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID,
            type: OperationType.REPLACE,
            partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            entityType: SERVICE_TYPE.PARTITION,
            entityId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            sourceNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
            targetNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
            replicaId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID,
            status: ReplicaStatus.REMOVED,
            workflowStep: WORKFLOW_STEP.REMOVED,
            createdAt:
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_CREATED_AT_MS,
            updatedAt:
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS,
            completedAt:
              REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS,
          }),
        ],
        deferredOutcome: null,
        retryAfterMs: null,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
          [],
        );

    t.equal(
      snapshot?.semanticState,
      'recovering_in_flight',
      'source partitions should keep the live in-flight workflow state when authoritative operations exist',
    );
    t.equal(
      snapshot?.actuation?.state,
      'dispatched_waiting_progress',
      'source partitions should keep the live workflow-progress actuation state',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'wait_for_operation_progress',
      'source partitions should keep waiting on workflow progress instead of falling back to a planning-only needs_operation state',
    );
    t.equal(
      snapshot?.coordinator?.operation?.operationId,
      REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
      'source partitions should target the live in-flight authoritative operation context',
    );
    t.same(
      snapshot?.coordinator?.serialWaitPartitionIds,
      ['replica_operations-p1', REMOTE_PRIORITY_VISIBILITY_PARTITION_ID],
      'source partitions should preserve supporting carrier partition context from planning',
    );
    t.same(
      snapshot?.coordinator?.serialWaitOperationIds,
      [
        REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
        REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
      ],
      'source partitions should preserve supporting carrier operation context from planning',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery dispatch-pending partition snapshots ' +
  'reclassify persisted-not-dispatched workflow waits to advance the ' +
  'existing operation',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  const originalDateNow = Date.now;
  const dispatchPendingOperation =
    buildRemotePriorityDispatchPendingOperation();
  Date.now = () => REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS;
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePriorityDispatchPendingPlanningSnapshot();
    };
  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async () => {
      return Object.freeze({
        state: 'present',
        operationCount: NUM.ONE,
        operations: [dispatchPendingOperation],
        deferredOutcome: null,
        retryAfterMs: null,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
          [dispatchPendingOperation],
        );

    t.equal(
      snapshot?.semanticState,
      'recovering_in_flight',
      'dispatch-pending persisted rows should stay on the in-flight semantic state',
    );
    t.equal(
      snapshot?.actuation?.state,
      'persisted_not_dispatched',
      'dispatch-pending persisted rows should preserve the undispatched actuation state',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'advance_existing_operation',
      'dispatch-pending persisted rows should surface owner advancement instead of a generic workflow wait',
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      'workflow_progress',
      'dispatch-pending persisted rows should stay on the workflow-progress boundary',
    );
    t.equal(
      snapshot?.progress?.waitMode,
      'event_driven',
      'dispatch-pending persisted rows should keep the event-driven wait mode while the owner advances the operation',
    );
    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      'dispatch_pending',
      'dispatch-pending persisted rows should preserve the dispatch-pending workflow phase',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('createOperation re-arms acknowledged remote handoff while the ' +
  'authoritative priority REPLACE row remains dispatchable',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'control_plane_publications-p1',
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      nodeId: 'node-target',
      replicaId: 'control_plane_publications-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    t.equal(
      operationRows.get(operation.operationId)?.workflow_step,
      WORKFLOW_STEP.PENDING,
      'the inserted row should remain pending when the remote owner has not advanced the durable workflow yet',
    );
    t.equal(
      deliveries.length,
      1,
      'remote-owned priority REPLACE creation should still send the initial owner wake-up immediately',
    );
    t.equal(
      deferredTimers.length,
      1,
      'an acknowledged handoff should still arm one follow-up verification while the authoritative row remains PENDING',
    );

    const remoteOwnedRow = operationRows.get(operation.operationId);
    remoteOwnedRow.workflow_step = WORKFLOW_STEP.SENDING;
    remoteOwnedRow.status = ReplicaStatus.PENDING;
    operationRows.set(operation.operationId, remoteOwnedRow);

    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'the follow-up verification should re-send the owner wake-up when the authoritative row is still dispatchable',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('createOperation continues re-arming acknowledged remote handoff after ' +
  'durable PENDING timeout until operation budget exhaustion',
async (t) => {
  const operationRows = new Map();
  const deferredTimers = [];
  const deliveries = [];
  let nowMs = REMOTE_HANDOFF_TEST_INITIAL_NOW_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  const authoritativeRead = async (tableName, sql, params = []) => {
    if (tableName === 'replica_operations' &&
        String(sql).includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    return {
      success: true,
      rows: [],
      affectedRows: 0,
    };
  };
  const executeQuery = async (sql, params = []) => {
    const normalizedSql = String(sql);
    if (normalizedSql.includes('WHERE operation_id = ?')) {
      const row = operationRows.get(params[0]) || null;
      return {
        success: true,
        rows: row ? [{...row}] : [],
        affectedRows: row ? 1 : 0,
      };
    }
    if (normalizedSql.includes('WHERE partition_id = ? AND target_node_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('WHERE (') &&
        normalizedSql.includes('entity_type = ?') &&
        normalizedSql.includes('entity_id = ?')) {
      return {success: true, rows: [], affectedRows: 0};
    }
    if (normalizedSql.includes('replica_operations') &&
        normalizedSql.includes('VALUES')) {
      const row = {
        operation_id: params[0],
        type: params[1],
        partition_id: params[2],
        replica_id: params[3],
        source_node_id: params[4],
        target_node_id: params[5],
        status: params[6],
        workflow_step: params[7],
        created_at: params[8],
        updated_at: params[9],
        completed_at: params[10],
        error_message: params[11],
        steps_history: params[12],
        entity_type: params[13],
        entity_id: params[14],
      };
      operationRows.set(row.operation_id, row);
      return {success: true, affectedRows: 1};
    }
    return {success: true, rows: [], affectedRows: 0};
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-source',
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
      ) {
        return authoritativeRead(tableName, sql, params);
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async readAuthoritativeRows(tableName, sql, params = []) {
        return authoritativeRead(tableName, sql, params);
      },
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    sqlQueryEngine: {
      async executeQuery(sql, params = []) {
        return executeQuery(sql, params);
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push({target, payload});
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = await coordinator.createOperation({
      type: 'REPLACE',
      partitionId: 'control_plane_publications-p1',
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      nodeId: 'node-target',
      replicaId: 'control_plane_publications-p1-r1',
      skipProvisioningAdmissionRecheck: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const pendingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.PENDING,
      {partitionId: 'control_plane_publications-p1'},
    );

    t.equal(
      deferredTimers.length,
      1,
      'the initial acknowledged handoff should still arm one verification timer',
    );

    nowMs =
      operation.updatedAt +
      pendingTimeoutMs +
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    await deferredTimers[0].fn();

    t.equal(
      deliveries.length,
      2,
      'expired durable PENDING step budget should still re-send remote owner wake-ups while the operation budget remains',
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      1,
      'handoff verification should remain armed until the operation budget is exhausted',
    );

    nowMs =
      operation.createdAt +
      TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS +
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    await deferredTimers[1].fn();

    t.equal(
      deliveries.length,
      2,
      'exhausted operation budget should stop re-sending remote owner wake-ups',
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      0,
      'no further handoff verification timer should remain once the operation budget is exhausted',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('priority add-like recent intents survive deferred authoritative ' +
  'misses through the priority create-phase window',
async (t) => {
  const nowMs = REMOTE_HANDOFF_TEST_INITIAL_NOW_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;

  const coordinator = createRecentIntentPolicyCoordinator();

  try {
    const pendingTimeoutMs = coordinator.config.pendingTimeoutMs;
    const expiredStepStartedAtMs =
      nowMs - pendingTimeoutMs - REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    const priorityPendingOperation = {
      operationId: RECENT_INTENT_PRIORITY_OPERATION_ID,
      type: OperationType.REPLACE,
      partitionId: RECENT_INTENT_PRIORITY_PARTITION_ID,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: RECENT_INTENT_PRIORITY_PARTITION_ID,
      targetNodeId: RECENT_INTENT_POLICY_TARGET_NODE_ID,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: expiredStepStartedAtMs,
      updatedAt: expiredStepStartedAtMs,
    };
    const priorityTtlMs =
      coordinator.getRecentOperationIntentTtlMs(priorityPendingOperation);

    t.ok(
      priorityTtlMs > pendingTimeoutMs,
      'priority recent-intent TTL should exceed the ordinary PENDING timeout',
    );
    t.equal(
      coordinator.getRecentOperationMissReuseBudgetMs(
        priorityPendingOperation,
      ),
      priorityTtlMs,
      'priority PENDING add-like operations should use the priority miss reuse window',
    );
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        priorityPendingOperation,
      ),
      true,
      'priority PENDING add-like operations should remain reusable after the ordinary step timeout',
    );

    const prioritySendingOperation = {
      ...priorityPendingOperation,
      workflowStep: WORKFLOW_STEP.SENDING,
    };
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        prioritySendingOperation,
      ),
      true,
      'priority SENDING add-like operations should remain reusable after the ordinary step timeout',
    );

    const nonPriorityPendingOperation = {
      ...priorityPendingOperation,
      operationId: RECENT_INTENT_NON_PRIORITY_OPERATION_ID,
      partitionId: RECENT_INTENT_NON_PRIORITY_PARTITION_ID,
      entityId: RECENT_INTENT_NON_PRIORITY_PARTITION_ID,
    };
    t.equal(
      coordinator.shouldReuseRecentOperationIntentOnAuthoritativeMiss(
        nonPriorityPendingOperation,
      ),
      false,
      'non-priority operation misses should not use priority recent-intent reuse',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery partition snapshots recover ' +
  'authoritative remote operations for observer-only nodes',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  coordinator.initialize();

  const authoritativeObservationCalls = [];
  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async (entityType, entityId) => {
      authoritativeObservationCalls.push({entityType, entityId});
      return Object.freeze({
        state: 'present',
        operationCount: NUM.ONE,
        operations: [buildRemotePriorityVisibilityOperation()],
        deferredOutcome: null,
        retryAfterMs: null,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          [],
        );

    t.same(
      authoritativeObservationCalls,
      [{
        entityType: SERVICE_TYPE.PARTITION,
        entityId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
      }],
      'observer-only partition snapshot reads should escalate to the authoritative entity visibility path',
    );
    t.match(snapshot, {
      partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
      operationId: REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
      coordinator: {
        operationIds: [REMOTE_PRIORITY_VISIBILITY_OPERATION_ID],
      },
    });
  } finally {
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery partition snapshots preserve deferred ' +
  'authoritative-read state when authoritative observation returns the ' +
  'remote operation plus a deferred outcome',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  coordinator.initialize();

  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async () => {
      return Object.freeze({
        state: 'deferred',
        operationCount: NUM.ONE,
        operations: [buildRemotePriorityVisibilityOperation()],
        deferredOutcome: Object.freeze({
          completionState:
            PRIORITY_RECOVERY_COMPLETION_STATE
              .AUTHORITATIVE_OPERATION_READ_DEFERRED,
          retryAfterMs: 250,
          source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
        }),
        retryAfterMs: 250,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          [],
        );

    t.equal(
      snapshot?.operationId,
      REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
      'the planning-snapshot match should still retain the remote operation identity',
    );
    t.equal(
      snapshot?.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE
        .AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'the workflow-owner fallback should preserve the deferred authoritative-read completion state',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'observe_authoritative_visibility',
      'deferred authoritative reads should keep the partition on the canonical authoritative-visibility action',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery planning-only partition snapshots ' +
  'preserve deferred authoritative-read state when authoritative ' +
  'observation returns zero operations plus a deferred outcome',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePrioritySerialWaitPlanningSnapshot();
    };
  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async () => {
      return Object.freeze({
        state: 'deferred',
        operationCount: NUM.ZERO,
        operations: [],
        deferredOutcome: Object.freeze({
          completionState:
            PRIORITY_RECOVERY_COMPLETION_STATE
              .AUTHORITATIVE_OPERATION_READ_DEFERRED,
          retryAfterMs: 250,
          source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
        }),
        retryAfterMs: 250,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
          [],
        );

    t.equal(
      snapshot?.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE
        .AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'planning-only snapshot reuse should not mask deferred authoritative-read completion state',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'observe_authoritative_visibility',
      'planning-only deferred reads should keep the partition on the canonical authoritative-visibility action',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery partition snapshots keep deferred ' +
  'authoritative-read handling when a stale cache-visible operation would ' +
  'otherwise fall through to workflow-timeout reconcile',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  const originalDateNow = Date.now;
  const authoritativeObservationCalls = [];
  Date.now = () => REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS;
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePriorityTimeoutPlanningSnapshot();
    };

  const creatingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.CREATING,
    buildRemotePriorityTimeoutOperation(REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS),
  );
  const staleStartedAtMs =
    REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS -
    creatingTimeoutMs -
    REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
  const staleCacheVisibleOperation =
    buildRemotePriorityTimeoutOperation(staleStartedAtMs);

  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async (entityType, entityId) => {
      authoritativeObservationCalls.push({entityType, entityId});
      return Object.freeze({
        state: 'deferred',
        operationCount: NUM.ONE,
        operations: [staleCacheVisibleOperation],
        deferredOutcome: Object.freeze({
          completionState:
            PRIORITY_RECOVERY_COMPLETION_STATE
              .AUTHORITATIVE_OPERATION_READ_DEFERRED,
          retryAfterMs: 250,
          source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
        }),
        retryAfterMs: 250,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
          [staleCacheVisibleOperation],
        );

    t.same(
      authoritativeObservationCalls,
      [{
        entityType: SERVICE_TYPE.PARTITION,
        entityId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
      }],
      'cache-visible inputs should still consult the authoritative entity visibility path',
    );
    t.equal(
      snapshot?.completion?.state,
      PRIORITY_RECOVERY_COMPLETION_STATE
        .AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'deferred authoritative reads should override stale cache-visible timeout classification',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      'observe_authoritative_visibility',
      'stale cache-visible operations should stay on the canonical authoritative-visibility action while the authoritative read is deferred',
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      'authoritative_visibility',
      'deferred authoritative reads should stay on the visibility boundary instead of reopening workflow-timeout reconcile',
    );
    t.same(
      snapshot?.coordinator?.serialWaitPartitionIds,
      REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS,
      'the stale timeout witness should retain the supporting partition context from planning',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

test('workflowOwner priority recovery partition snapshots let a resolved ' +
  'authoritative empty observation displace stale cache-visible timeout ' +
  'inputs',
async (t) => {
  const coordinator = createRemotePriorityVisibilityCoordinator();
  const originalDateNow = Date.now;
  const authoritativeObservationCalls = [];
  Date.now = () => REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS;
  coordinator.initialize();

  coordinator.controlPlaneReadinessService
    .getPriorityRecoveryPlanningAnswerBestEffort = async () => {
      return buildRemotePriorityTimeoutPlanningSnapshot();
    };

  const creatingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.CREATING,
    buildRemotePriorityTimeoutOperation(REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS),
  );
  const staleStartedAtMs =
    REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS -
    creatingTimeoutMs -
    REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
  const staleCacheVisibleOperation =
    buildRemotePriorityTimeoutOperation(staleStartedAtMs);

  coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
    async (entityType, entityId) => {
      authoritativeObservationCalls.push({entityType, entityId});
      return Object.freeze({
        state: REMOTE_PRIORITY_EMPTY_OBSERVATION_STATE,
        operationCount: NUM.ZERO,
        operations: [],
        deferredOutcome: null,
        retryAfterMs: null,
      });
    };

  try {
    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
          [staleCacheVisibleOperation],
        );

    t.same(
      authoritativeObservationCalls,
      [{
        entityType: SERVICE_TYPE.PARTITION,
        entityId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
      }],
      'cache-visible timeout inputs should still consult the authoritative entity visibility path',
    );
    t.equal(
      snapshot?.operationId,
      null,
      'a resolved authoritative empty should clear the stale operation identity from the partition snapshot',
    );
    t.same(
      snapshot?.coordinator?.operationIds,
      [],
      'a resolved authoritative empty should remove stale operation contexts from the coordinator contract',
    );
    t.ok(
      snapshot?.progress?.nextRequiredAction !==
        'reconcile_stale_operation_progress' &&
        snapshot?.progress?.nextRequiredAction !==
          'wait_for_operation_progress',
      'a resolved authoritative empty should stop stale cache-visible operations from driving timeout or workflow-progress follow-up actions',
    );
    t.ok(
      snapshot?.progress?.blockingBoundary !== 'workflow_timeout' &&
        snapshot?.progress?.blockingBoundary !== 'workflow_progress',
      'a resolved authoritative empty should move the partition off the stale operation blocker boundaries',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});
