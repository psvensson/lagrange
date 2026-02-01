import {NUM, STATE} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';

const REBALANCER_SUBSYSTEM = Object.freeze({
  UNIFIED: 'rebalancer',
  COORDINATOR: 'rebalance-coordinator',
});

const REBALANCER_ENTITY_TYPE = Object.freeze({
  PARTITION: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP: SERVICE_TYPE.MESSAGE_GROUP,
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
});

const REBALANCER_NODE_STATUS = Object.freeze({
  ACTIVE: STATE.ACTIVE,
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
  NODE_CPU_THRESHOLD: 'rebalancer.nodeCpuThreshold',
  NODE_MEMORY_THRESHOLD: 'rebalancer.nodeMemoryThreshold',
  NODE_DISK_THRESHOLD: 'rebalancer.nodeDiskThreshold',
  READINESS_PING_ENABLED: 'rebalancer.readinessPingEnabled',
  READINESS_PING_TIMEOUT_MS: 'rebalancer.readinessPingTimeoutMs',
  STABILIZATION_PERIOD_MS: 'rebalancer.stabilizationPeriodMs',
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
    TIMEOUT_CHECK_INTERVAL_MS: 5000,
  }),
  UNIFIED: Object.freeze({
    PERIODIC_CHECK_INTERVAL_MS: 60000,
    PERIODIC_CHECK_JITTER_MS: 10000,
    CRITICAL_CHECK_DELAY_MS: 5000,
    MAX_CONCURRENT_MOVES: NUM.FIVE,
    MOVE_TIMEOUT_MS: 300000,
    MOVE_BATCH_SIZE: NUM.TWO,
    INTER_BATCH_DELAY_MS: 100,
    NODE_CPU_THRESHOLD: 0.8,
    NODE_MEMORY_THRESHOLD: 0.8,
    NODE_DISK_THRESHOLD: 0.9,
    READINESS_PING_ENABLED: false,
    READINESS_PING_TIMEOUT_MS: 1000,
    MIN_STABILIZATION_MS: 1000,
    MAX_STABILIZATION_MS: 10000,
    DEFAULT_STABILIZATION_MS: 1000,
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
    },
  }),
  MESSAGE_GROUP: Object.freeze({
    targetReplicaCount: NUM.THREE,
    maxReplicaCount: NUM.FIVE,
    ensureLocalAccess: true,
    placementConstraints: {
      spreadAcrossNodes: true,
      preferNearbyNodes: true,
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
  DEFER_REMOVE_DETAIL: 'Deferring REMOVE until ADDs complete',
  DEFER_REMOVE: 'Deferring REMOVE moves until ADD moves complete',
  INCLUDE_CRITICAL_REMOVE: 'Including critical REMOVE moves alongside ADD moves',
  NODE_STATE_CHANGE: 'Node state change detected',
  EXECUTE_MOVE: 'Executing rebalancing move',
  SKIP_UNREADY_NODE: 'Skipping move for unready node',
  MOVE_FAILED: 'Failed to execute move',
  SKIP_BATCH_UNREADY: 'Skipping moves for unready node',
  NODE_DISCONNECTED_BATCH: 'Node disconnected during batch execution',
  NOT_LEADER_SKIP: 'Not leader, skipping rebalance',
  NO_AVAILABLE_NODES: 'Skipping rebalance - no available nodes in cache',
  NO_REBALANCE_NEEDED: 'No rebalancing needed',
  START_REBALANCE: 'Starting rebalancing',
  SCHEDULE_NEXT: 'Scheduled next rebalance check',
  CACHE_UNAVAILABLE: 'System table cache not available, skipping rebalance check',
  WAIT_STABILIZATION: 'Waiting for stabilization period to complete',
  REBALANCE_ERROR: 'Error during rebalance check',
  EVALUATING_STATE: 'Evaluating rebalancing state',
  CRITICAL_STATE: 'Critical rebalancing state detected',
  SUBOPTIMAL_STATE: 'Suboptimal rebalancing state detected',
  IMMEDIATE_TRIGGER: 'Immediate rebalancing check triggered',
  SHUTDOWN: 'Rebalancer shutdown',
});

const REBALANCE_COORDINATOR_EVENT = Object.freeze({
  OPERATION_CREATED: 'operationCreated',
  STEP_CHANGED: 'stepChanged',
  OPERATION_COMPLETED: 'operationCompleted',
  OPERATION_FAILED: 'operationFailed',
  RECOVERY_COMPLETED: 'recoveryCompleted',
  RECOVERY_FAILED: 'recoveryFailed',
  SHUTDOWN: 'shutdown',
});

const REBALANCE_COORDINATOR_LOG_MSG = Object.freeze({
  INITIALIZED: 'RebalanceCoordinator initialized',
  CREATE_OPERATION: 'Creating operation',
  SEND_OPERATION: 'Sending replica operation',
  STEP_CHANGED: 'Operation step changed',
  OPERATION_COMPLETED: 'Operation completed',
  OPERATION_FAILED: 'Operation failed',
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
  SHUTDOWN: 'Shutting down RebalanceCoordinator',
  DUPLICATE_OPERATION: 'Duplicate operation detected, reusing existing',
  STEPS_HISTORY_PARSE_ERROR: 'Failed to parse steps_history JSON',
  QUERY_OPERATION_FAILED: 'Failed to query operation from system table',
  QUERY_OPERATIONS_FAILED: 'Failed to query operations from system table',
});

const REBALANCE_COORDINATOR_ERROR_MSG = Object.freeze({
  NODE_ID_REQUIRED: 'RebalanceCoordinator requires nodeId',
  CACHE_REQUIRED: 'RebalanceCoordinator requires systemTableCache',
  CDC_REQUIRED: 'RebalanceCoordinator requires cdcIntegrationService',
  ROUTER_MISSING: 'MessageRouter not configured',
  MESSAGE_NOT_ACKED: 'Message not acknowledged',
  POLICY_REQUIRED: 'RebalanceCoordinator requires tablePolicyService',
  SQL_ENGINE_REQUIRED: 'RebalanceCoordinator requires sqlQueryEngine',
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

const PULL_ASSIGNER_ERROR_MSG = Object.freeze({
  REPLICA_HANDLER_REQUIRED: 'ReplicaHandler is required for replica creation',
  RPC_CLIENT_REQUIRED: 'RPCClient is required for replica sync',
});

export {
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
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCER_ERROR_MSG,
  PULL_ASSIGNER_ERROR_MSG,
};
