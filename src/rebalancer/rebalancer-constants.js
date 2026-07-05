import {NUM, SERVICE_STATUS, UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
} from './storage-capacity-constants.js';
import {
  DEFAULT_MESSAGE_GROUP_POLICY,
} from '../policy/policy-constants.js';

const REBALANCER_SUBSYSTEM = Object.freeze({
  UNIFIED: 'rebalancer',
  COORDINATOR: 'rebalance-coordinator',
});

const REBALANCER_ENTITY_TYPE = Object.freeze({
  PARTITION: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP: SERVICE_TYPE.MESSAGE_GROUP,
  WASM_SERVICE: SERVICE_TYPE.WASM_SERVICE,
  RUNTIME_SERVICE: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
});

const REBALANCER_TRIGGER = Object.freeze({
  NODE_JOIN: 'node_join',
  NODE_LEAVE: 'node_leave',
  NODE_FAILURE: 'node_failure',
  POLICY_CHANGE: 'policy_change',
  PERIODIC: 'periodic',
  CRITICAL: 'critical',
});

const REBALANCER_MOVE_TYPE = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
  REPLACE: 'replace',
});

const REBALANCER_CONCURRENT_BUDGET_READ_MODE = Object.freeze({
  CACHE_ONLY: 'cache_only',
  OWNER_RPC_RECHECK_ON_SATURATION: 'owner_rpc_recheck_on_saturation',
});

const REBALANCER_NODE_STATUS = Object.freeze({
  ACTIVE: SERVICE_STATUS.ACTIVE,
  SUSPECTED: 'suspected',
  FAILED: 'failed',
});

const REBALANCER_CONFIG_KEY = Object.freeze({
  PENDING_TIMEOUT_MS: 'rebalancer.pendingTimeoutMs',
  CREATING_TIMEOUT_MS: 'rebalancer.creatingTimeoutMs',
  SYNCING_TIMEOUT_MS: 'rebalancer.syncingTimeoutMs',
  REMOVING_TIMEOUT_MS: 'rebalancer.removingTimeoutMs',
  MAX_CONCURRENT_ADDS: 'rebalancer.maxConcurrentAdds',
  MAX_CONCURRENT_REMOVES: 'rebalancer.maxConcurrentRemoves',
  PERIODIC_CHECK_INTERVAL_MS: 'rebalancer.periodicCheckIntervalMs',
  PERIODIC_CHECK_JITTER_MS: 'rebalancer.periodicCheckJitterMs',
  CRITICAL_CHECK_DELAY_MS: 'rebalancer.criticalCheckDelayMs',
  MAX_CONCURRENT_MOVES: 'rebalancer.maxConcurrentMoves',
  MOVE_TIMEOUT_MS: 'rebalancer.moveTimeoutMs',
  MOVE_BATCH_SIZE: 'rebalancer.moveBatchSize',
  INTER_BATCH_DELAY_MS: 'rebalancer.interBatchDelayMs',
  REBALANCE_BUDGET: 'rebalancer.rebalanceBudget',
  NODE_CPU_THRESHOLD: 'rebalancer.nodeCpuThreshold',
  NODE_MEMORY_THRESHOLD: 'rebalancer.nodeMemoryThreshold',
  NODE_DISK_THRESHOLD: 'rebalancer.nodeDiskThreshold',
  READINESS_PING_ENABLED: 'rebalancer.readinessPingEnabled',
  READINESS_PING_TIMEOUT_MS: 'rebalancer.readinessPingTimeoutMs',
  STABILIZATION_PERIOD_MS: 'rebalancer.stabilizationPeriodMs',
  SYSTEM_PARTITION_START_DELAY_MS: 'rebalancer.systemPartitionStartDelayMs',
  USER_PARTITION_START_DELAY_MS: 'rebalancer.userPartitionStartDelayMs',
});

const REBALANCER_DEFAULT = Object.freeze({
  COORDINATOR: Object.freeze({
    PENDING_TIMEOUT_MS: 30000,
    CREATING_TIMEOUT_MS: 60000,
    SYNCING_TIMEOUT_MS: 300000,
    REMOVING_TIMEOUT_MS: 60000,
    MAX_CONCURRENT_ADDS: NUM.FIVE,
    MAX_CONCURRENT_REMOVES: NUM.FIVE,
    PERIODIC_CHECK_INTERVAL_MS: 60000,
    TIMEOUT_CHECK_INTERVAL_MS: 1000,
  }),
  UNIFIED: Object.freeze({
    PERIODIC_CHECK_INTERVAL_MS: 60000,
    PERIODIC_CHECK_JITTER_MS: 10000,
    CRITICAL_CHECK_DELAY_MS: 5000,
    MAX_CONCURRENT_MOVES: NUM.FIVE,
    MOVE_TIMEOUT_MS: 300000,
    MOVE_BATCH_SIZE: 2,
    INTER_BATCH_DELAY_MS: 100,
    REBALANCE_BUDGET: 10,
    CRITICAL_BUDGET_MULTIPLIER: 2,
    NODE_CPU_THRESHOLD: 0.8,
    NODE_MEMORY_THRESHOLD: 0.8,
    NODE_DISK_THRESHOLD: 0.9,
    READINESS_PING_ENABLED: false,
    READINESS_PING_TIMEOUT_MS: 1000,
    MIN_STABILIZATION_MS: 1000,
    MAX_STABILIZATION_MS: 10000,
    DEFAULT_STABILIZATION_MS: 1000,
    SYSTEM_PARTITION_START_DELAY_MS: 0,
    USER_PARTITION_START_DELAY_MS: 0,
  }),
});

const REBALANCER_DEFAULT_POLICY = Object.freeze({
  TABLE: Object.freeze({
    replicaCount: NUM.THREE,
    minReplicaCount: NUM.THREE,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: {
      spreadAcrossNodes: true,
      considerDiskSpace: true,
      considerCpuLoad: true,
      considerMemoryLoad: true,
      [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]:
        STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]:
        STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]:
        STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM,
    },
  }),
  MESSAGE_GROUP: DEFAULT_MESSAGE_GROUP_POLICY,
  WASM_SERVICE: Object.freeze({
    targetReplicaCount: NUM.THREE,
    minReplicaCount: NUM.THREE,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: {
      spreadAcrossNodes: true,
      considerCpuLoad: true,
      considerMemoryLoad: true,
    },
  }),
  RUNTIME_SERVICE: Object.freeze({
    targetReplicaCount: NUM.THREE,
    minReplicaCount: 1,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: {
      spreadAcrossNodes: true,
      considerCpuLoad: true,
      considerMemoryLoad: true,
    },
  }),
});

const REBALANCER_EVENT = Object.freeze({
  REBALANCE_COMPLETE: 'rebalanceComplete',
  NODE_STATE_CHANGE: 'nodeStateChange',
  REBALANCE_NEEDED: 'rebalanceNeeded',
});

const REBALANCER_LOG_MSG = Object.freeze({
  INITIALIZED: 'Rebalancer initialized',
  COORDINATOR_SET: 'RebalanceCoordinator set for rebalancer',
  LEADER_START: 'Became leader, starting rebalancing scheduler',
  LEADER_STOP: 'Lost leadership, stopping rebalancing scheduler',
  STABILIZATION_RESET: 'State change recorded, resetting stabilization timer',
  SKIP_TRANSITIONAL: 'Replicas in transition, skipping move calculation',
  SKIP_PENDING: 'Pending moves exist, skipping move calculation',
  SKIP_REMOVE_REMOVING: 'Skipping REMOVE for replica already in removing state',
  SKIP_ADD_TRANSITIONAL: 'Skipping ADD for node with transitional replica',
  DEFER_ADD_DEGRADED:
    'Deferring ADD moves while degraded placement is already at target replica count',
  DEFER_ADD_OVER_TARGET:
    'Deferring spread-driven count-increasing ADD while already at/over target replica count (no count-neutral REPLACE pairing)',
  DEFER_REMOVE_DETAIL: 'Deferring REMOVE until ADDs complete',
  DEFER_REMOVE: 'Deferring REMOVE moves until ADD moves complete',
  INCLUDE_CRITICAL_REMOVE: 'Including critical REMOVE moves alongside ADD moves',
  NODE_STATE_CHANGE: 'Node state change detected',
  EXECUTE_MOVE: 'Executing rebalancing move',
  MOVE_SKIPPED: 'Rebalancing move skipped',
  SKIP_UNREADY_NODE: 'Skipping move for unready node',
  MOVE_BLOCKED_BY_SAFETY_POLICY: 'Skipping move blocked by safety policy',
  MOVE_FAILED: 'Failed to execute move',
  SKIP_BATCH_UNREADY: 'Skipping moves for unready node',
  NODE_DISCONNECTED_BATCH: 'Node disconnected during batch execution',
  NOT_LEADER_SKIP: 'Not leader, skipping rebalance',
  NO_AVAILABLE_NODES: 'Skipping rebalance - no available nodes in cache',
  NO_REBALANCE_NEEDED: 'No rebalancing needed',
  START_REBALANCE: 'Starting rebalancing',
  PRE_EXECUTION_HANDOFF: 'Rebalancer pre-execution handoff',
  SCHEDULE_NEXT: 'Scheduled next rebalance check',
  CACHE_UNAVAILABLE: 'System table cache not available, skipping rebalance check',
  WAIT_STABILIZATION: 'Waiting for stabilization period to complete',
  WAIT_START_DELAY: 'Waiting for partition rebalance start delay to elapse',
  WAIT_TOPOLOGY_SETTLING:
    'Waiting for transitional cluster membership to settle before planning ' +
    'critical system rebalancing',
  REVALIDATE_TOPOLOGY_BLOCKER_FAILED:
    'Failed to revalidate topology-settling in-flight blocker',
  WAIT_LOCAL_SERVE_READINESS:
    'Waiting for local control-plane serve readiness before planning critical system rebalancing',
  WAIT_LOCAL_MUTATION_READINESS:
    'Waiting for local control-plane mutation readiness before planning background rebalancing',
  WAIT_TRAFFIC_READY:
    'Waiting for bootstrap traffic-readiness before planning critical system rebalancing',
  WAIT_CONTROL_PLANE_PRIORITY:
    'Deferring non-system rebalancing until priority control-plane partitions spread',
  WAIT_TRANSPORT_BACKPRESSURE:
    'Waiting for local transport backpressure to clear before planning',
  PRIORITY_RECOVERY_PLANNING_GATE_DIAGNOSTIC:
    'Priority-recovery planning-gate decision diagnostic',
  REBALANCE_ERROR: 'Error during rebalance check',
  EVALUATING_STATE: 'Evaluating rebalancing state',
  CRITICAL_STATE: 'Critical rebalancing state detected',
  SUBOPTIMAL_STATE: 'Suboptimal rebalancing state detected',
  DEGRADED_TARGET: 'Replica target is constrained by available ready nodes',
  IMMEDIATE_TRIGGER: 'Immediate rebalancing check triggered',
  CLUSTER_NOT_READY: 'Cluster readiness not confirmed, deferring planning',
  CLUSTER_READINESS_TIMEOUT:
    'Cluster readiness timed out, proceeding with available state',
  CLUSTER_READINESS_CONFIRMED: 'Cluster readiness confirmed',
  SHUTDOWN: 'Rebalancer shutdown',
});

const REBALANCE_COORDINATOR_EVENT = Object.freeze({
  OPERATION_CREATED: 'operationCreated',
  STEP_CHANGED: 'stepChanged',
  OPERATION_COMPLETED: 'operationCompleted',
  OPERATION_FAILED: 'operationFailed',
  RECOVERY_COMPLETED: 'recoveryCompleted',
  RECOVERY_FAILED: 'recoveryFailed',
  RESERVATION_CREATED: 'reservationCreated',
  RESERVATION_RELEASED: 'reservationReleased',
  RESERVATION_RECONCILED: 'reservationReconciled',
  READ_MODEL_DIVERGENCE: 'readModelDivergence',
  OUTCOME_ROUTED: 'outcomeRouted',
  SHUTDOWN: 'shutdown',
});

const REBALANCE_COORDINATOR_LOG_MSG = Object.freeze({
  INITIALIZED: 'RebalanceCoordinator initialized',
  CREATE_OPERATION: 'Creating operation',
  SEND_OPERATION: 'Sending replica operation',
  STEP_CHANGED: 'Operation step changed',
  OPERATION_COMPLETED: 'Operation completed',
  OPERATION_FAILED: 'Operation failed',
  OPERATION_BLOCKED_BY_SAFETY_POLICY: 'Operation blocked by safety policy',
  OPERATION_DEFERRED_BY_SAFETY_POLICY: 'Operation deferred by safety policy',
  OPERATION_DISPATCH_RETRY_DEFERRED:
    'Deferred retryable replica operation dispatch failure',
  OPERATION_DISPATCH_RETRY_SHED:
    'Shed replica operation dispatch retry: per-target retry budget exhausted',
  OPERATION_DISPATCH_RETRY_FAILED:
    'Deferred replica operation dispatch retry failed',
  OPERATION_DISPATCH_RETRY_REARM_DROPPED:
    'Dropped deferred replica operation retry: not re-armed while ' +
    'uninitialized after operation budget exhausted',
  OPERATION_TRANSITION_RETRY_DEFERRED:
    'Deferred retryable replica operation transition failure',
  OPERATION_TRANSITION_RETRY_FAILED:
    'Deferred replica operation transition retry failed',
  OPERATION_TIMED_OUT: 'Operation timed out',
  SKIP_PERSIST_NO_CDC: 'CDC integration service not available, skipping persistence',
  PERSIST_FAILED: 'Failed to persist operation',
  RECOVERY_START: 'Starting recovery process',
  RECOVERY_FOUND: 'Found incomplete operations during recovery',
  RECOVERY_MARK_FAILED: 'Marked incomplete operation as failed during recovery',
  RECOVERY_MARK_REMOVE_FAILED: 'Marked incomplete removal operation as failed during recovery',
  RECOVERY_PROCESS_ERROR: 'Error processing operation during recovery',
  RECOVERY_COMPLETED: 'Recovery process completed',
  RECOVERY_FAILED: 'Recovery process failed',
  RECONCILE_SYNCING: 'Reconciling SYNCING operation',
  RECONCILE_ACTIVE: 'Reconciled SYNCING operation to ACTIVE',
  RECONCILE_FAILED: 'Reconciled SYNCING operation to FAILED',
  RECONCILE_FAILED_NOT_FOUND:
    'Reconciled SYNCING operation to FAILED - replica not found',
  RECONCILE_IN_PROGRESS: 'SYNCING operation still in progress',
  LATE_DISPATCH_HONOR_FAILED:
    'Failed to honor late dispatch delivery confirmation',
  SHUTDOWN: 'Shutting down RebalanceCoordinator',
  DUPLICATE_OPERATION: 'Duplicate operation detected, reusing existing',
  REUSED_IN_FLIGHT_OPERATION: 'Reusing in-flight operation for planned move',
  OPERATION_ROW_DIVERGENCE_REINSERT:
    'Operation row missing from authoritative partition after zero-row ' +
    'update; re-inserting owner copy',
  TERMINAL_TRANSITION_REPAIR_ARMED:
    'Committed terminal transition not authoritatively visible; ' +
    'repair scheduled',
  TERMINAL_TRANSITION_REPAIR_SUCCEEDED:
    'Terminal transition repair confirmed authoritative visibility',
  TERMINAL_TRANSITION_REPAIR_UNCONFIRMED:
    'Terminal transition repair attempt still unconfirmed; rescheduling',
  TERMINAL_TRANSITION_REPAIR_ABANDONED:
    'Terminal transition repair abandoned: a different durable terminal ' +
    'state won',
  OPERATION_LEDGER_QUORUM_SPREAD_HOLD:
    'Operation-ledger quorum concentrated on one node; deferring dependent ' +
    'operation admission until the ledger spreads',
  PRIORITY_RECOVERY_DRAIN_SETTLED:
    'Priority recovery drain settled operation',
  BOOTSTRAP_TOPOLOGY_UNRESOLVED:
    'Create dispatch proceeding without bootstrap topology',
  STEPS_HISTORY_PARSE_ERROR: 'Failed to parse steps_history JSON',
  QUERY_OPERATION_FAILED: 'Failed to query operation from system table',
  QUERY_OPERATIONS_FAILED: 'Failed to query operations from system table',
  RESERVATION_CREATED: 'Storage reservation created with operation',
  RESERVATION_RELEASED: 'Storage reservation released',
  RESERVATION_CREATE_FAILED:
    'Failed to create storage reservation for operation',
  RESERVATION_RELEASE_FAILED:
    'Failed to release storage reservation for operation',
  RESERVATION_RECONCILE_START:
    'Starting storage reservation reconciliation',
  RESERVATION_RECONCILE_COMPLETED:
    'Storage reservation reconciliation completed',
  RESERVATION_RECONCILE_EXPIRED:
    'Expired stale storage reservation during reconciliation',
  RESERVATION_RECONCILE_ORPHAN:
    'Released orphan storage reservation during reconciliation',
  READ_MODEL_DIVERGENCE:
    'Cache/authoritative divergence detected during reconciliation',
  PROVISIONING_ADMISSION_DENIED:
    'Provisioning admission denied for storage-increasing move',
  OUTCOME_RECEIVED: 'Executor outcome received via reconcile queue',
  OUTCOME_OPERATION_NOT_FOUND:
    'Executor outcome ignored: operation not found',
  OUTCOME_OPERATION_TERMINAL:
    'Executor outcome ignored: operation already terminal',
  OUTCOME_OPERATION_NOT_LOCAL:
    'Executor outcome ignored: operation not locally owned',
  OUTCOME_TRANSITION_FAILED:
    'Executor outcome transition failed',
  OUTCOME_UNKNOWN_ACTION:
    'Executor outcome ignored: unknown action mapping',
  OBSERVED_PROGRESS_TRANSITION_FAILED:
    'Observed replica progress transition failed',
});

const REBALANCE_COORDINATOR_DEFER_REASON = Object.freeze({
  REMOVE_SAFETY_BLOCKED:
    'remove_safety_blocked',
  REPLACE_REMOVE_SAFETY_BLOCKED:
    'replace_remove_safety_blocked',
});

const REBALANCE_COORDINATOR_ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'RebalanceCoordinator requires nodeId',
  CACHE_REQUIRED: 'RebalanceCoordinator requires systemTableCache',
  CDC_REQUIRED: 'RebalanceCoordinator requires cdcIntegrationService',
  ROUTER_MISSING: 'MessageRouter not configured',
  MESSAGE_NOT_ACKED: 'Message not acknowledged',
  POLICY_REQUIRED: 'RebalanceCoordinator requires tablePolicyService',
  SQL_ENGINE_REQUIRED: 'RebalanceCoordinator requires sqlQueryEngine',
  STORAGE_ADMISSION_REQUIRED:
    'RebalanceCoordinator requires storageAdmissionService for add/replace operations',
  STORAGE_ACCOUNTING_REQUIRED:
    'RebalanceCoordinator requires storageAccountingService for add/replace operations',
  STORAGE_ADMISSION_CHECK_ADD_REQUIRED:
    'storageAdmissionService must provide checkAdd()',
  STORAGE_ADMISSION_CHECK_REPLACE_REQUIRED:
    'storageAdmissionService must provide checkReplace()',
  TRANSACTION_COORDINATOR_REQUIRED:
    'RebalanceCoordinator requires transactionCoordinator for atomic workflow transitions',
  WORKFLOW_COORDINATOR_REQUIRED:
    'RebalanceCoordinator requires operationWorkflowCoordinator with runExclusive()',
  WORKFLOW_COORDINATOR_REGISTRY_REQUIRED:
    'operationWorkflowCoordinator requires inFlightExecutionsByOwnerKey Map',
  EXECUTOR_OUTCOME_EMITTER_REQUIRED:
    'RebalanceCoordinator requires executorOutcomeEmitter',
  CONFLICTING_OPERATION_IN_FLIGHT:
    'Conflicting in-flight operation for replica',
});

const REBALANCER_ERROR_MSG = Object.freeze({
  ENTITY_ID_REQUIRED: 'UnifiedRebalancer requires entityId',
  ENTITY_TYPE_REQUIRED: 'UnifiedRebalancer requires entityType',
  NODE_ID_REQUIRED: 'UnifiedRebalancer requires nodeId',
  CACHE_REQUIRED: 'UnifiedRebalancer requires systemTableCache',
  CDC_REQUIRED: 'UnifiedRebalancer requires cdcIntegrationService',
  POLICY_REQUIRED: 'UnifiedRebalancer requires tablePolicyService',
  ROUTER_REQUIRED: 'UnifiedRebalancer requires messageRouter',
  COORDINATOR_REQUIRED: 'RebalanceCoordinator is required for move execution',
  SQL_ENGINE_REQUIRED: 'UnifiedRebalancer requires sqlQueryEngine',
});

const MOVE_PLANNER_ERROR_MSG = Object.freeze({
  STORAGE_ADMISSION_REQUIRED:
    'MovePlanner requires storageAdmissionService for active capacity-gated planning',
  STORAGE_ADMISSION_CHECK_ADD_REQUIRED:
    'MovePlanner storageAdmissionService must provide checkAdd()',
  STORAGE_ACCOUNTING_REQUIRED:
    'MovePlanner requires accountingService for active capacity-gated planning',
  STORAGE_ACCOUNTING_ESTIMATE_REQUIRED:
    'MovePlanner accountingService must provide estimateReplicaBytes()',
  STORAGE_PRESSURE_BEHAVIOR_REQUIRED:
    'MovePlanner requires storagePressureBehavior for active pressure-gated planning',
  STORAGE_PRESSURE_BEHAVIOR_CHECK_REQUIRED:
    'MovePlanner storagePressureBehavior must provide shouldAllowMove()',
});

const MOVE_REASON = Object.freeze({
  REPLICA_FAILED: 'replica_failed',
  INCREASE_REPLICA_COUNT: 'increase_replica_count',
  NODE_NOT_IN_TARGET: 'node_not_in_target',
  SPREAD_REPLICAS: 'spread_replicas',
  REPLACE_REPLICA: 'replace_replica',
});

const STABILIZATION_RESET_TRIGGER = Object.freeze({
  NODE_JOINED: 'node_joined',
  NODE_LEFT: 'node_left',
  NODE_FAILED: 'node_failed',
  REPLICA_FAILED: MOVE_REASON.REPLICA_FAILED,
  POLICY_CHANGED: 'policy_changed',
  SPLIT_COMPLETED: 'split_completed',
});


const PLACEMENT_DEGRADED_REASON = Object.freeze({
  INSUFFICIENT_NODES: 'insufficient_nodes',
  INSUFFICIENT_CAPACITY: 'insufficient_capacity',
  CAPACITY_ACCOUNTING_UNAVAILABLE: 'capacity_accounting_unavailable',
});

const REBALANCER_SKIP_REASON = Object.freeze({
  BUDGET_EXCEEDED: 'budget_exceeded',
  BUDGET_QUERY_FAILED: 'budget_query_failed',
  CONFLICTING_OPERATION_IN_FLIGHT: 'conflicting_operation_in_flight',
  MEMBERSHIP_EPOCH_CHANGED: 'membership_epoch_changed',
  NOT_LEADER: 'not_leader',
  STABILIZING: 'stabilizing',
  NO_NODES: 'no_nodes',
  CACHE_UNAVAILABLE: 'cache_unavailable',
  START_DELAY: 'start_delay',
  SAFETY_BLOCKED: 'safety_blocked',
  LOCAL_MUTATION_UNHEALTHY: 'local_mutation_unhealthy',
  OPERATION_ALREADY_EXECUTING: 'operation_already_executing',
  OPERATION_OWNED_BY_ANOTHER_NODE: 'operation_owned_by_another_node',
  DEFERRED_RETRY_PENDING: 'deferred_retry_pending',
  AWAITING_READY_ADD_CAPACITY: 'awaiting_ready_add_capacity',
  NODE_NOT_READY: 'node_not_ready',
});

/**
 * Granular readiness skip reasons that map policy rejection
 * dimensions to stable rebalancer diagnostic codes.
 * Used alongside REBALANCER_SKIP_REASON.NODE_NOT_READY to
 * preserve reason granularity (Requirement 5.3, Design D6.3).
 * @enum {string}
 */
const READINESS_SKIP_DETAIL = Object.freeze({
  LEASE_EXPIRED: 'lease',
  STATUS_NOT_ACTIVE: 'status',
  CONNECTION_DOWN: 'connection',
  OUTBOUND_QUEUE_UNAVAILABLE: 'outbound_queue',
  PING_FAILED: 'ping',
  REPAIR_INELIGIBLE: 'repair_ineligible',
});

const REBALANCER_QUEUE_NAME = Object.freeze({
  REBALANCE_CHECK: 'rebalance-check-reconcile',
});

/**
 * Canonical reason codes for rebalance operation step transitions.
 * Used as the `reason` field in durable workflow transition records.
 *
 * @enum {string}
 */
const OPERATION_TRANSITION_REASON = Object.freeze({
  DISPATCH_SENDING: 'dispatch_sending',
  DISPATCH_CREATING: 'dispatch_creating',
  DISPATCH_STOPPING: 'dispatch_stopping',
  DISPATCH_ALREADY_EXISTS: 'dispatch_already_exists',
  DISPATCH_COMPLETED: 'dispatch_completed',
  RECONCILE_ACTIVE: 'reconcile_active',
  RECONCILE_FAILED: 'reconcile_failed',
  EXECUTOR_OUTCOME: 'executor_outcome',
  OPERATION_COMPLETED: 'operation_completed',
  OPERATION_FAILED: 'operation_failed',
  OPERATION_TIMED_OUT: 'operation_timed_out',
  SAFETY_POLICY_BLOCKED: 'safety_policy_blocked',
});

export {
  MOVE_REASON,
  OPERATION_TRANSITION_REASON,
  PLACEMENT_DEGRADED_REASON,
  READINESS_SKIP_DETAIL,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_SUBSYSTEM,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_TRIGGER,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_QUEUE_NAME,
  REBALANCER_SKIP_REASON,
  STABILIZATION_RESET_TRIGGER,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCER_ERROR_MSG,
  MOVE_PLANNER_ERROR_MSG,
};
