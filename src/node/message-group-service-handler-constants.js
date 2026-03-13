/**
 * Constants for MessageGroupServiceHandler.
 */

import {WORKFLOW_STEP} from '../constants/index.js';

const MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM =
  'message-group-service-handler';

const MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS = Object.freeze({
  SERVICE_SEGMENT: 'service',
  HANDLER_ID: 'message-group-handler',
});

const MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing MessageGroupServiceHandler',
  MESSAGE_RECEIVED: 'MessageGroupServiceHandler received message',
  CREATE_REQUEST: 'Handling CREATE_REPLICA for message group',
  CREATE_MISSING_FIELDS:
    'CREATE_REPLICA missing required fields for message group',
  CREATE_ALREADY_ACTIVE:
    'Message-group replica already exists in active state',
  CREATE_IN_PROGRESS:
    'Message-group replica creation already in progress',
  OPERATION_IN_PROGRESS: 'Operation already in progress',
  ASYNC_CREATE_FAILED: 'Async message-group replica creation failed',
  CREATE_COMPLETED: 'Message-group replica creation completed',
  CREATE_FAILED: 'Message-group replica creation failed',
  REMOVE_REQUEST: 'Handling REMOVE_REPLICA for message group',
  REMOVE_MISSING_FIELDS:
    'REMOVE_REPLICA missing required fields for message group',
  REMOVE_NOT_FOUND: 'Message-group replica not found for removal',
  REMOVE_IN_PROGRESS:
    'Message-group replica removal already in progress',
  REMOVE_ALREADY_REMOVED: 'Message-group replica already removed',
  ASYNC_REMOVE_FAILED: 'Async message-group replica removal failed',
  REMOVE_COMPLETED: 'Message-group replica removal completed',
  REMOVE_FAILED: 'Message-group replica removal failed',
  UPDATE_STATUS_FAILED: 'Failed to update operation step',
  OPERATION_NOT_FOUND:
    'Replica operation not found in system table cache',
  PARSE_STEPS_HISTORY_FAILED: 'Failed to parse steps_history',
  NO_MESSAGE_ROUTER:
    'No message router provided for message-group handler registration',
  REGISTERED_ROUTER:
    'Registered MessageGroupServiceHandler with message router',
  UNREGISTERED_ROUTER:
    'Unregistered MessageGroupServiceHandler from message router',
  SHUTTING_DOWN: 'Shutting down MessageGroupServiceHandler',
});

const MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG = Object.freeze({
  UNKNOWN_MESSAGE_TYPE: (type) => `Unknown message type: ${type}`,
  CREATE_REQUIRED_FIELDS:
    'CREATE_REPLICA requires operationId, groupId/entityId, and replicaId',
  REMOVE_REQUIRED_FIELDS:
    'REMOVE_REPLICA requires operationId, groupId/entityId, and replicaId',
  CREATE_REQUIRED:
    'MessageGroupServiceHandler requires createMessageGroupReplica',
  START_REQUIRED:
    'MessageGroupServiceHandler requires startMessageGroupReplica',
  STOP_REQUIRED:
    'MessageGroupServiceHandler requires stopMessageGroupReplica',
  CDC_REQUIRED:
    'MessageGroupServiceHandler requires cdcIntegrationService',
  CACHE_REQUIRED:
    'MessageGroupServiceHandler requires systemTableCache',
  REPLICA_HANDLER_NOT_REGISTERED: (replicaId) =>
    `Message-group replica handler was not registered for ${replicaId}`,
});

const MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW = Object.freeze({
  COMPLETION_STEPS: [
    WORKFLOW_STEP.ACTIVE,
    WORKFLOW_STEP.REMOVED,
    WORKFLOW_STEP.FAILED,
  ],
});

export {
  MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS,
  MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM,
  MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW,
};
