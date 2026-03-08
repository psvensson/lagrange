/**
 * Typed participant acknowledgement constants for rebalance executors.
 *
 * Rebalance executor components (ReplicaHandler, MessageGroupServiceHandler,
 * RuntimeServiceHandler) produce acknowledgement payloads that flow through
 * the owner-key reconcile queue to RebalanceCoordinator.
 *
 * Payloads compose with PARTICIPANT_ACK_FIELD from workflow-constants.js
 * for the canonical field names (workflowId, participantKey, fenceToken,
 * status, checkpoint, acknowledgedAt).
 *
 * Requirements: 1, 3, 8
 * Design: §1, §2, §4
 */

/**
 * Participant status values for rebalance executor acknowledgements.
 *
 * Each value represents a semantic executor boundary that the coordinator
 * uses to decide whether to advance the workflow.
 *
 * @enum {string}
 */
const REBALANCE_ACK_STATUS = Object.freeze({
  // Partition replica acknowledgements
  REPLICA_CREATE_STARTED: 'replica_create_started',
  REPLICA_CREATE_SYNCING: 'replica_create_syncing',
  REPLICA_CREATE_ACTIVE: 'replica_create_active',
  REPLICA_CREATE_FAILED: 'replica_create_failed',
  REPLICA_REMOVE_COMPLETED: 'replica_remove_completed',
  REPLICA_REMOVE_FAILED: 'replica_remove_failed',

  // Message group replica acknowledgements
  MESSAGE_GROUP_CREATE_ACTIVE: 'message_group_create_active',
  MESSAGE_GROUP_CREATE_FAILED: 'message_group_create_failed',
  MESSAGE_GROUP_REMOVE_COMPLETED: 'message_group_remove_completed',
  MESSAGE_GROUP_REMOVE_FAILED: 'message_group_remove_failed',

  // Runtime service replica acknowledgements
  RUNTIME_SERVICE_CREATE_ACTIVE: 'runtime_service_create_active',
  RUNTIME_SERVICE_CREATE_FAILED: 'runtime_service_create_failed',
  RUNTIME_SERVICE_REMOVE_COMPLETED: 'runtime_service_remove_completed',
  RUNTIME_SERVICE_REMOVE_FAILED: 'runtime_service_remove_failed',
});

/**
 * Terminal status values for rebalance acknowledgements.
 * An acknowledgement with one of these statuses indicates the executor
 * has reached a final state for its participant boundary.
 *
 * @type {ReadonlySet<string>}
 */
const REBALANCE_ACK_TERMINAL_STATUSES = Object.freeze(new Set([
  REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
  REBALANCE_ACK_STATUS.REPLICA_CREATE_FAILED,
  REBALANCE_ACK_STATUS.REPLICA_REMOVE_COMPLETED,
  REBALANCE_ACK_STATUS.REPLICA_REMOVE_FAILED,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_ACTIVE,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_FAILED,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_COMPLETED,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_FAILED,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_ACTIVE,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_FAILED,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_COMPLETED,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_FAILED,
]));

/**
 * Failure status values for rebalance acknowledgements.
 *
 * @type {ReadonlySet<string>}
 */
const REBALANCE_ACK_FAILURE_STATUSES = Object.freeze(new Set([
  REBALANCE_ACK_STATUS.REPLICA_CREATE_FAILED,
  REBALANCE_ACK_STATUS.REPLICA_REMOVE_FAILED,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_CREATE_FAILED,
  REBALANCE_ACK_STATUS.MESSAGE_GROUP_REMOVE_FAILED,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_CREATE_FAILED,
  REBALANCE_ACK_STATUS.RUNTIME_SERVICE_REMOVE_FAILED,
]));

/**
 * Checkpoint field names specific to rebalance acknowledgement payloads.
 * These extend the generic PARTICIPANT_ACK_FIELD.CHECKPOINT object
 * with rebalance-specific progress data.
 *
 * @enum {string}
 */
const REBALANCE_ACK_CHECKPOINT_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  WORKFLOW_STEP: 'workflowStep',
  REPLICA_ID: 'replicaId',
  ERROR_MESSAGE: 'errorMessage',
});

/**
 * Log messages for rebalance participant acknowledgement processing.
 *
 * @enum {string}
 */
const REBALANCE_ACK_LOG_MSG = Object.freeze({
  ACK_RECEIVED: 'Rebalance participant acknowledgement received',
  ACK_ACCEPTED: 'Rebalance participant acknowledgement accepted',
  ACK_STALE_FENCE: 'Rebalance participant acknowledgement rejected: stale fence',
  ACK_DUPLICATE: 'Rebalance participant acknowledgement rejected: duplicate',
  ACK_NOT_FOUND:
    'Rebalance participant acknowledgement rejected: participant not found',
});

export {
  REBALANCE_ACK_STATUS,
  REBALANCE_ACK_TERMINAL_STATUSES,
  REBALANCE_ACK_FAILURE_STATUSES,
  REBALANCE_ACK_CHECKPOINT_FIELD,
  REBALANCE_ACK_LOG_MSG,
};
