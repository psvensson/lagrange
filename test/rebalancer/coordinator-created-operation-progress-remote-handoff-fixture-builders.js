import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {NUM, SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

export const REMOTE_HANDOFF_TEST_INITIAL_NOW_MS = 1_000_000;
export const REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS = 1;
export const REMOTE_HANDOFF_SNAPSHOT_OPERATION_ID =
  'remote-handoff-snapshot-operation';
export const REMOTE_HANDOFF_SNAPSHOT_SOURCE_NODE_ID =
  'remote-handoff-snapshot-source-node';
export const REMOTE_HANDOFF_SNAPSHOT_TARGET_NODE_ID =
  'remote-handoff-snapshot-target-node';
export const REMOTE_HANDOFF_SNAPSHOT_PARTITION_ID =
  'control_plane_publications-p1';
export const REMOTE_HANDOFF_SNAPSHOT_REPLICA_ID =
  'control_plane_publications-p1-r4';
export const REMOTE_HANDOFF_SNAPSHOT_DISPATCH_TARGET =
  `${REMOTE_HANDOFF_SNAPSHOT_TARGET_NODE_ID}/service/replica-dispatch`;
export const REMOTE_HANDOFF_SNAPSHOT_READ_ERROR =
  'replica_operations owner unavailable';
export const REMOTE_HANDOFF_SNAPSHOT_PARTICIPANT_FAILURE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
export const REMOTE_HANDOFF_SNAPSHOT_RETRY_AFTER_MS = 250;
export const RECENT_INTENT_POLICY_NODE_ID = 'recent-intent-policy-node';
export const RECENT_INTENT_POLICY_TARGET_NODE_ID =
  'recent-intent-policy-target-node';
export const RECENT_INTENT_PRIORITY_OPERATION_ID =
  'recent-intent-priority-operation';
export const RECENT_INTENT_NON_PRIORITY_OPERATION_ID =
  'recent-intent-non-priority-operation';
export const RECENT_INTENT_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
export const RECENT_INTENT_NON_PRIORITY_PARTITION_ID = 'customer_orders-p1';
export const REMOTE_PRIORITY_VISIBILITY_OBSERVER_NODE_ID =
  'remote-priority-visibility-observer-node';
export const REMOTE_PRIORITY_VISIBILITY_OPERATION_ID =
  'remote-priority-visibility-operation';
export const REMOTE_PRIORITY_VISIBILITY_PARTITION_ID = 'sql_write_operations-p1';
export const REMOTE_PRIORITY_VISIBILITY_TARGET_NODE_ID =
  'remote-priority-visibility-target-node';
export const REMOTE_PRIORITY_VISIBILITY_REPLICA_ID =
  'sql_write_operations-p1-r4';
export const REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE =
  'priority_recovery_authoritative_operation_read';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID =
  'sql_transaction_participants-p1';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID =
  'remote-priority-serial-wait-source-operation';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID =
  'remote-priority-serial-wait-source-active-operation';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID =
  'remote-priority-serial-wait-source-removed-operation';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID = 'serial-wait-source-node';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID =
  'serial-wait-source-target-node';
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID =
  'sql_transaction_participants-p1-r4';
export const REMOTE_PRIORITY_SERIAL_WAIT_LAST_PROGRESS_AT_MS = 5000;
export const REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS = 5000;
export const REMOTE_PRIORITY_SERIAL_WAIT_EPOCH = 4;
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_EPOCH = 2;
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_CREATED_AT_MS = 3000;
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_UPDATED_AT_MS = 3001;
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_CREATED_AT_MS = 1000;
export const REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS = 2000;
export const REMOTE_PRIORITY_TIMEOUT_PARTITION_ID = 'replica_operations-p1';
export const REMOTE_PRIORITY_TIMEOUT_OPERATION_ID =
  'remote-priority-timeout-operation';
export const REMOTE_PRIORITY_TIMEOUT_TARGET_NODE_ID =
  'remote-priority-timeout-target-node';
export const REMOTE_PRIORITY_TIMEOUT_REPLICA_ID = 'replica_operations-p1-r4';
export const REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS = 1000000;
export const REMOTE_PRIORITY_EMPTY_OBSERVATION_STATE = 'empty';
export const REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID =
  'sql_write_operations-p1';
export const REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID =
  'remote-priority-dispatch-pending-operation';
export const REMOTE_PRIORITY_DISPATCH_PENDING_TARGET_NODE_ID =
  'remote-priority-dispatch-pending-target-node';
export const REMOTE_PRIORITY_DISPATCH_PENDING_REPLICA_ID =
  'sql_write_operations-p1-r4';
export const REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS = 1000000;
export const REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS =
  REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS - 1;
export const REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_EPOCH = 2;
export const REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_PARTITION_IDS =
  Object.freeze([
    'sql_transactions-p1',
  ]);
export const REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_OPERATION_IDS =
  Object.freeze([
    'remote-priority-timeout-sql-transactions-operation',
  ]);
export const REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS = Object.freeze([
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
  'sql_transactions-p1',
  REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
]);
export const REMOTE_PRIORITY_TIMEOUT_SUPPORTING_OPERATION_IDS = Object.freeze([
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
  'remote-priority-timeout-sql-transactions-operation',
  REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
]);

export function buildRemotePrioritySerialWaitPlanningSnapshot() {
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

export function buildRemotePrioritySerialWaitSourcePlanningSnapshot() {
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

export function buildRemotePriorityVisibilityPlanningSnapshot() {
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

export function buildRemotePriorityTimeoutPlanningSnapshot() {
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

export function buildRemotePriorityDispatchPendingPlanningSnapshot() {
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

export function buildRemotePriorityDispatchPendingTimeoutPlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_EPOCH,
    publicationStatus: 'PUBLISHED',
    priorityRecoveryDecisionSnapshots: {
      capturedAt: REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS,
      publicationEpoch: REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_EPOCH,
      snapshots: [
        Object.freeze({
          partitionId: REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
          operationId: REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
          blockerReasons: ['operation_created_but_no_step_transitions'],
          semanticState: 'operation_stalled',
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
            state: 'transition_deferred',
            owner: 'operation_workflow_owner',
            workflowProgressPhaseId: 'dispatch_pending',
            lastProgressAtMs:
              REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
          },
          progress: {
            contractState: 'pending',
            nextAction: 'retry',
            currentOwner: 'operation_workflow_owner',
            nextRequiredAction: 'reconcile_stale_operation_progress',
            blockingBoundary: 'workflow_timeout',
            waitMode: 'timeout_reconcile_due',
            workflowProgressPhaseId: 'dispatch_pending',
            lastProgressAtMs:
              REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
          },
          coordinator: {
            operationIds: [REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID],
            serialWaitOperationIds:
              REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_OPERATION_IDS,
            serialWaitPartitionIds:
              REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_PARTITION_IDS,
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

export function createRemotePriorityVisibilityCoordinator() {
  const controlPlaneReadinessService = {
    ...createMockControlPlaneReadinessService(),
    async getPriorityRecoveryPlanningSnapshotBestEffort() {
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

export function buildRemotePriorityVisibilityOperation() {
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

export function buildRemotePriorityTimeoutOperation(startedAtMs) {
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

export function buildRemotePriorityDispatchPendingOperation(
  progressAtMs = REMOTE_PRIORITY_DISPATCH_PENDING_LAST_PROGRESS_AT_MS,
) {
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
    createdAt: progressAtMs,
    updatedAt: progressAtMs,
  });
}

export function createRecentIntentPolicyCoordinator() {
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
