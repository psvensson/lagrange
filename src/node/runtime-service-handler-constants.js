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
});

const RUNTIME_SERVICE_HANDLER_WORKFLOW = Object.freeze({
  COMPLETION_STEPS: OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
});

export {
  RUNTIME_SERVICE_HANDLER_ADDRESS,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG,
  RUNTIME_SERVICE_HANDLER_LOG_MSG,
  RUNTIME_SERVICE_HANDLER_SUBSYSTEM,
  RUNTIME_SERVICE_HANDLER_WORKFLOW,
};
