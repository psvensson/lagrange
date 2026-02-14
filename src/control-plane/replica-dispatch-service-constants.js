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
});

const DISPATCH_ERROR_MSG = Object.freeze({
  MISSING_NODE_ID: 'ReplicaDispatchService requires nodeId',
  MISSING_ROUTER: 'ReplicaDispatchService requires messageRouter',
  MISSING_CDC: 'ReplicaDispatchService requires cdcIntegrationService',
  MISSING_CDC_UPDATE:
    'ReplicaDispatchService requires cdcIntegrationService.updateSystemTableRow',
  MISSING_CACHE: 'ReplicaDispatchService requires systemTableCache',
  MISSING_COORDINATOR:
    'ReplicaDispatchService requires rebalanceCoordinator',
  NOT_INITIALIZED:
    'ReplicaDispatchService must be initialized before start',
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
  DISPATCH_EVENT,
};
