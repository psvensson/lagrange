/**
 * Constants for ReplicaDispatchService.
 */

const DISPATCH_SUBSYSTEM = 'replica-dispatch-service';

const DISPATCH_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const DISPATCH_LOG_MSG = Object.freeze({
  INITIALIZED: 'ReplicaDispatchService initialized',
  STARTED: 'ReplicaDispatchService started',
  STOPPED: 'ReplicaDispatchService stopped',
  DISPATCHED: 'Dispatched replica operation',
  CLAIM_SKIPPED: 'Skipped replica operation dispatch claim',
  DISPATCH_FAILED: 'Replica operation dispatch failed',
  FORWARDED: 'Forwarded message to leader',
  CDC_HANDLING_FAILED: 'CDC event handling failed',
  MESSAGE_HANDLING_FAILED: 'Message handling failed',
  NO_HANDLER_ON_TARGET:
    'No active handler for entity type on target node',
  RETRY_PENDING_READY_NODE:
    'Retrying pending replica operations for ready node',
  OPERATION_DISPATCH_DEFERRED:
    'Deferred replica operation dispatch while control-plane path recovers',
  PRIORITY_DISPATCH_LANE_EXHAUSTED:
    'Deferred priority replica operation dispatch: priority lane in-flight budget exhausted',
  OPERATION_DISPATCH_DEFERRED_RETRY:
    'Re-enqueued deferred replica operation dispatch',
  RETRY_READY_TRIGGER_SKIPPED:
    'Skipped duplicate ready-trigger retry',
  DISPATCH_LOOKUP_FAILED:
    'Replica operation lookup failed during ready-node retry',
  NODE_STATE_UPDATE_SKIPPED:
    'Skipped stale node-state update',
  NODE_STATE_UPDATE_DEFERRED:
    'Deferred node-state update while control-plane path recovers',
  NODE_STATE_UPDATE_DEFERRED_RETRY:
    'Re-enqueued deferred node-state update',
  NODE_STATE_UPDATE_BOOTSTRAP_UPSERTED:
    'Bootstrapped missing node row from node-state update payload',
  MEMBERSHIP_PUBLICATION_REFRESH_FAILED:
    'Membership publication refresh failed for ready node-state',
  MEMBERSHIP_PUBLICATION_ACK_FAILED:
    'Membership publication acknowledgement failed for ready node-state',
  MEMBERSHIP_PUBLICATION_ACK_DEFERRED:
    'Deferred membership publication acknowledgement retry',
  ENQUEUE_OPERATION_DISPATCH:
    'Enqueued operation for dispatch reconcile',
  ENQUEUE_NODE_STATE_UPDATE:
    'Enqueued node-state update for reconcile',
  ENQUEUE_NODE_READY_RETRY:
    'Enqueued node for ready-retry reconcile',
});

const DISPATCH_QUEUE_NAME = Object.freeze({
  OPERATION: 'dispatch-operation-reconcile',
  NODE_STATE_UPDATE: 'dispatch-node-state-update-reconcile',
  NODE_READY: 'dispatch-node-ready-reconcile',
});

const DISPATCH_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'ReplicaDispatchService requires nodeId',
  MISSING_ROUTER: 'ReplicaDispatchService requires messageRouter',
  MISSING_CDC: 'ReplicaDispatchService requires cdcIntegrationService',
  MISSING_CACHE: 'ReplicaDispatchService requires systemTableCache',
  MISSING_CACHE_GET:
    'ReplicaDispatchService requires systemTableCache.get',
  MISSING_CACHE_GET_ALL:
    'ReplicaDispatchService requires systemTableCache.getAll',
  MISSING_COORDINATOR:
    'ReplicaDispatchService requires rebalanceCoordinator',
  METADATA_FORWARD_PATH_UNAVAILABLE:
    'ReplicaDispatchService requires canonical metadata ingress forwarding support',
  NODE_ROW_MISSING:
    'ReplicaDispatchService cannot apply NODE_STATE_UPDATE because the node row is missing',
  NOT_INITIALIZED:
    'ReplicaDispatchService must be initialized before start',
});

const DISPATCH_DEFAULT = Object.freeze({
  OPERATION_DISPATCH_QUEUE_SHARD_COUNT: 4,
  NODE_STATE_UPDATE_RETRY_AFTER_MS: 250,
  NODE_READY_RETRY_AFTER_MS: 250,
  NODE_READY_RETRY_MAX_ATTEMPTS: 3,
  OPERATION_DISPATCH_RETRY_AFTER_MS: 250,
  OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS: 1000,
  PRIORITY_CONTROL_PLANE_DISPATCH_MAX_IN_FLIGHT: 8,
});

const NODE_STATE_UPDATE_RETRY_CLASS = Object.freeze({
  TRANSIENT: 'transient',
  PUBLICATION_PRESSURE: 'publication_pressure',
});

const NODE_STATE_UPDATE_RETRY_ACTION = Object.freeze({
  SCHEDULE_DEFERRED: 'schedule_deferred',
});

const NODE_STATE_UPDATE_RETRY_POLICY = Object.freeze({
  BACKOFF_MULTIPLIER: 2,
  TRANSIENT_MAX_DELAY_MULTIPLIER: 4,
  PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER: 8,
  PUBLICATION_PRESSURE_MAX_DELAY_MULTIPLIER: 32,
});

const DISPATCH_EVENT = Object.freeze({
  OPERATION_DISPATCHED: 'operationDispatched',
  OPERATION_FAILED: 'operationFailed',
});

export {
  DISPATCH_SUBSYSTEM,
  DISPATCH_STATE,
  DISPATCH_LOG_MSG,
  DISPATCH_ERROR_MSG,
  DISPATCH_DEFAULT,
  DISPATCH_EVENT,
  DISPATCH_QUEUE_NAME,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
};
