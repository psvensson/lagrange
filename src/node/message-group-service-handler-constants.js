/**
 * Constants for MessageGroupServiceHandler.
 */

import {
  OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
} from '../rebalancer/replica-operation-step-policy.js';

const MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM =
  'message-group-service-handler';

const MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS = Object.freeze({
  SERVICE_SEGMENT: 'service',
  HANDLER_ID: 'message-group-handler',
});

const MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing MessageGroupServiceHandler',
  LEFT_REGISTERED:
    'MessageGroupServiceHandler could not retire its exact registration; the callback stays registered',
  MESSAGE_RECEIVED: 'MessageGroupServiceHandler received message',
  CREATE_REFUSED:
    'CREATE_REPLICA refused: message-group membership change unsupported until the fresh-identity ADD path exists',
  OPERATION_IN_PROGRESS: 'Operation already in progress',
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
  CREATE_LEARNER_REFUSED:
    'Message-group learner CREATE answered without physical work',
  CREATE_LEARNER_ADMITTED:
    'Message-group learner CREATE admitted one physical worker',
  CREATE_LEARNER_WORKER_FENCED:
    'Admitted message-group worker lost its boot before the physical call',
});

const MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG = Object.freeze({
  UNKNOWN_MESSAGE_TYPE: (type) => `Unknown message type: ${type}`,
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
});

const MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW = Object.freeze({
  COMPLETION_STEPS: OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
});

// Typed answers of a message-group CREATE that carries a learner join package
// and is refused or held before any physical work (FreshMG 6.B slice B1).
// The existing admission owner's own error codes keep their names.
const MESSAGE_GROUP_CREATE_REFUSAL = Object.freeze({
  // No learner-join capability composed (every production root today): the
  // composed createMessageGroupReplica opens a lone founder and is never used.
  LEARNER_JOIN_CAPABILITY_UNAVAILABLE:
    'message_group_create_learner_join_capability_unavailable',
  JOIN_PACKAGE_INVALID: 'message_group_create_join_package_invalid',
  LEARNER_FACT_UNAVAILABLE: 'message_group_create_learner_fact_unavailable',
  LEARNER_FACT_NOT_RECORDED: 'message_group_create_learner_fact_not_recorded',
  ADMISSION_RETAINED: 'message_group_create_admission_retained',
  WORKER_NOT_ADMITTED: 'message_group_create_worker_not_admitted',
});

// The join route a learner CREATE carries: exactly these keys, a known kind.
// It names where the worker joins from; the install step must still read the
// leader's current descriptor at its own effect boundary.
const MESSAGE_GROUP_JOIN_PACKAGE = Object.freeze({
  KEYS: Object.freeze(['kind', 'groupId', 'replicaIdentity', 'peerId']),
  KIND: Object.freeze({RAFT_LOG_OR_CHECKPOINT: 'raft_log_or_checkpoint'}),
});

export {
  MESSAGE_GROUP_CREATE_REFUSAL,
  MESSAGE_GROUP_JOIN_PACKAGE,
  MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS,
  MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG,
  MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM,
  MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW,
};
