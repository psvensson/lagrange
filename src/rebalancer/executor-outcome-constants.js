/**
 * Typed executor outcome constants for replica operation handlers.
 *
 * Executor-side components (ReplicaHandler, MessageGroupServiceHandler,
 * RuntimeServiceHandler) emit these outcomes instead of directly mutating
 * coordinator-owned workflow fields on replica_operations rows.
 *
 * The RebalanceCoordinator consumes these outcomes through the owner-key
 * reconcile path and decides whether to transition the workflow.
 */

/**
 * Executor outcome types — one constant per semantic executor boundary.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_TYPE = Object.freeze({
  // Partition replica outcomes (ReplicaHandler)
  REPLICA_CREATE_SYNCING: 'REPLICA_CREATE_SYNCING',
  REPLICA_CREATE_ACTIVE: 'REPLICA_CREATE_ACTIVE',
  REPLICA_CREATE_FAILED: 'REPLICA_CREATE_FAILED',
  REPLICA_REMOVE_COMPLETED: 'REPLICA_REMOVE_COMPLETED',
  REPLICA_REMOVE_FAILED: 'REPLICA_REMOVE_FAILED',

  // Message group replica outcomes (MessageGroupServiceHandler)
  MESSAGE_GROUP_CREATE_ACTIVE: 'MESSAGE_GROUP_CREATE_ACTIVE',
  MESSAGE_GROUP_CREATE_FAILED: 'MESSAGE_GROUP_CREATE_FAILED',
  MESSAGE_GROUP_REMOVE_COMPLETED: 'MESSAGE_GROUP_REMOVE_COMPLETED',
  MESSAGE_GROUP_REMOVE_FAILED: 'MESSAGE_GROUP_REMOVE_FAILED',

  // Runtime service replica outcomes (RuntimeServiceHandler)
  RUNTIME_SERVICE_CREATE_ACTIVE: 'RUNTIME_SERVICE_CREATE_ACTIVE',
  RUNTIME_SERVICE_CREATE_FAILED: 'RUNTIME_SERVICE_CREATE_FAILED',
  RUNTIME_SERVICE_REMOVE_COMPLETED: 'RUNTIME_SERVICE_REMOVE_COMPLETED',
  RUNTIME_SERVICE_REMOVE_FAILED: 'RUNTIME_SERVICE_REMOVE_FAILED',
});

/**
 * Executor outcome field names — canonical property names for outcome
 * payloads.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  OUTCOME_TYPE: 'outcomeType',
  WORKFLOW_STEP: 'workflowStep',
  REPLICA_ID: 'replicaId',
  ERROR_MESSAGE: 'errorMessage',
  ERROR_CODE: 'errorCode',
  RETRY_AFTER_MS: 'retryAfterMs',
  DEFER_RETRY: 'deferRetry',
  TIMESTAMP: 'timestamp',
});

/**
 * Coordinator actions that map from executor outcome types.
 * The coordinator uses this to decide which transition method to call.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_ACTION = Object.freeze({
  UPDATE_STEP: 'updateStep',
  COMPLETE: 'complete',
  FAIL: 'fail',
});

/**
 * Maps each executor outcome type to the coordinator action and
 * target workflow step. The coordinator consumes this mapping in the
 * owner-key reconcile handler.
 */
const EXECUTOR_OUTCOME_ACTION_MAP = Object.freeze({
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.UPDATE_STEP,
  }),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_COMPLETED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_REMOVE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.COMPLETE,
  }),
  [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED]: Object.freeze({
    action: EXECUTOR_OUTCOME_ACTION.FAIL,
  }),
});

/**
 * Log messages for executor outcome emission.
 * @enum {string}
 */
const EXECUTOR_OUTCOME_LOG_MSG = Object.freeze({
  OUTCOME_EMITTED: 'Executor outcome emitted',
  OUTCOME_EMIT_SKIPPED: 'Executor outcome emission skipped: no operationId',
});

export {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_LOG_MSG,
};
