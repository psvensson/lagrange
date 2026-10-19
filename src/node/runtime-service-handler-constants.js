/**
 * Constants for RuntimeServiceHandler.
 *
 * Defines log messages, error messages, and address constants
 * for the runtime-service replica operation handler.
 */

import {
  OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
} from '../rebalancer/replica-operation-step-policy.js';

const RUNTIME_SERVICE_HANDLER_SUBSYSTEM = 'runtime-service-handler';

const RUNTIME_SERVICE_HANDLER_ADDRESS = Object.freeze({
  SERVICE_SEGMENT: 'service',
  HANDLER_ID: 'runtime-service-handler',
});

const RUNTIME_SERVICE_HANDLER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing RuntimeServiceHandler',
  MESSAGE_RECEIVED: 'RuntimeServiceHandler received message',
  CREATE_REQUEST: 'Handling CREATE_REPLICA for runtime service',
  CREATE_MISSING_FIELDS:
    'CREATE_REPLICA missing required fields for runtime service',
  CREATE_INVALID_REPLICA_ID:
    'CREATE_REPLICA rejected non-canonical runtime replica identity',
  CREATE_ALREADY_ACTIVE:
    'Runtime service replica already exists in active state',
  CREATE_IN_PROGRESS:
    'Runtime service replica creation already in progress',
  OPERATION_IN_PROGRESS: 'Operation already in progress',
  ASYNC_CREATE_FAILED: 'Async runtime service replica creation failed',
  CREATE_COMPLETED: 'Runtime service replica creation completed',
  CREATE_FAILED: 'Runtime service replica creation failed',
  REMOVE_REQUEST: 'Handling REMOVE_REPLICA for runtime service',
  REMOVE_MISSING_FIELDS:
    'REMOVE_REPLICA missing required fields for runtime service',
  REMOVE_NOT_FOUND: 'Runtime service replica not found for removal',
  REMOVE_IN_PROGRESS:
    'Runtime service replica removal already in progress',
  REMOVE_ALREADY_REMOVED: 'Runtime service replica already removed',
  ASYNC_REMOVE_FAILED: 'Async runtime service replica removal failed',
  REMOVE_COMPLETED: 'Runtime service replica removal completed',
  REMOVE_FAILED: 'Runtime service replica removal failed',
  UPDATE_STATUS_FAILED: 'Failed to update operation step',
  OPERATION_NOT_FOUND:
    'Replica operation not found in system table cache',
  PARSE_STEPS_HISTORY_FAILED: 'Failed to parse steps_history',
  DEFINITION_NOT_FOUND:
    'Service definition not found for runtime service',
  NO_MESSAGE_ROUTER:
    'No message router provided for registration',
  REGISTERED_ROUTER:
    'Registered RuntimeServiceHandler with message router',
  UNREGISTERED_ROUTER:
    'Unregistered RuntimeServiceHandler from message router',
  SHUTTING_DOWN: 'Shutting down RuntimeServiceHandler',
  CREATE_HELD: 'Runtime service bound creation held',
  REMOVE_HELD: 'Runtime service bound retirement held',
  CREATION_WAKE_NO_LOCAL_OPERATION:
    'Runtime service creation wake names no local operation',
  // Design RECOVERY-DESIGN-20261017 R1-A, R1-E, R3-F.
  RESTART_INVENTORY_APPLIED: 'Runtime service restart inventory applied',
  RESTART_ENTRY_UNREADABLE: 'Runtime service restart entry has an undecodable intent',
  RESTART_RETIREMENT_REDRIVEN: 'Runtime service restart retirement re-driven',
});

const RUNTIME_SERVICE_HANDLER_ERROR_MSG = Object.freeze({
  UNKNOWN_MESSAGE_TYPE: (type) => `Unknown message type: ${type}`,
  CREATE_REQUIRED_FIELDS:
    'CREATE_REPLICA requires operationId, entityId, and replicaId',
  CREATE_INVALID_REPLICA_ID:
    'CREATE_REPLICA requires canonical entityId-rN replica identity',
  CREATE_INVALID_REPLICA_ID_CODE:
    'runtime_service_replica_identity_invalid',
  REMOVE_REQUIRED_FIELDS:
    'REMOVE_REPLICA requires operationId, entityId, and replicaId',
  LIFECYCLE_MANAGER_REQUIRED:
    'RuntimeServiceHandler requires serviceLifecycleManager',
  CDC_REQUIRED:
    'RuntimeServiceHandler requires cdcIntegrationService',
  CACHE_REQUIRED:
    'RuntimeServiceHandler requires systemTableCache',
  DEFINITION_NOT_FOUND: (entityId) =>
    `Service definition not found: ${entityId}`,
  // A bound-class definition whose CREATE names no retained creation (D0, RV2.2).
  BOUND_ROUTE_REQUIRED: 'runtime_service_bound_route_required',
  // A CREATE for a replica whose bound retirement is in progress (RV6.3).
  RETIREMENT_IN_PROGRESS: 'runtime_service_retirement_in_progress',
  // A HELD memo that names no creation: corrupt by construction (RV6.4).
  CORRUPT_LOCAL_MEMO: 'runtime_service_corrupt_local_memo',
  // A message before the restart inventory is applied (RECOVERY-DESIGN R1-H, R2-F).
  NOT_READY: 'runtime_service_not_ready',
  HANDLER_STOPPED: 'runtime_service_handler_stopped',
  CREATION_CONTINUATION_PENDING: 'runtime_service_creation_continuation_pending',
});

const RUNTIME_SERVICE_CREATION_MEMO = Object.freeze({
  CONTINUATION_PENDING: 'CREATION_CONTINUATION_PENDING',
});
const RUNTIME_SERVICE_RESTART_ACTION = Object.freeze({REENTER: 'REENTER', REDRIVE: 'REDRIVE'});
const RUNTIME_SERVICE_RESTART_PLAN_STATE = Object.freeze({
  INITIAL: 'INITIAL', RUNNING: 'RUNNING', WAITING: 'WAITING', SETTLED: 'SETTLED',
});

// The node-local creation wake consumer's answers (design RV2.4, RV3.5).
const RUNTIME_SERVICE_CREATION_WAKE_OUTCOME = Object.freeze({
  QUEUED: 'QUEUED',
  RECORDED: 'RECORDED',
  NO_LOCAL_OPERATION: 'NO_LOCAL_OPERATION',
});

const RUNTIME_SERVICE_HANDLER_WORKFLOW = Object.freeze({
  COMPLETION_STEPS: OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
});

export {
  RUNTIME_SERVICE_CREATION_MEMO,
  RUNTIME_SERVICE_RESTART_ACTION,
  RUNTIME_SERVICE_RESTART_PLAN_STATE,
  RUNTIME_SERVICE_CREATION_WAKE_OUTCOME,
  RUNTIME_SERVICE_HANDLER_ADDRESS,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG,
  RUNTIME_SERVICE_HANDLER_LOG_MSG,
  RUNTIME_SERVICE_HANDLER_SUBSYSTEM,
  RUNTIME_SERVICE_HANDLER_WORKFLOW,
};
