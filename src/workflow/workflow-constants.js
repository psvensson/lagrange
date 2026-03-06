/**
 * Canonical field names for durable workflow step transitions.
 *
 * @enum {string}
 */
const WORKFLOW_TRANSITION_FIELD = Object.freeze({
  PREVIOUS_STEP: 'previousStep',
  NEXT_STEP: 'nextStep',
  REASON: 'reason',
  TIMESTAMP: 'timestamp',
  OWNER_KEY: 'ownerKey',
  FENCE_TOKEN: 'fenceToken',
});

const WORKFLOW_ERROR_MSG = Object.freeze({
  WORKFLOW_ID_REQUIRED: 'Workflow ID is required',
  OWNER_KEY_REQUIRED: 'Workflow owner key is required',
  PARTICIPANT_ID_REQUIRED: 'Workflow participant ID is required',
  NEXT_STEP_REQUIRED: 'Workflow transition requires nextStep',
  REASON_REQUIRED: 'Workflow transition requires reason',
  DUPLICATE_TRANSITION: 'Duplicate transition rejected by idempotency check',
  STALE_FENCE_TOKEN: 'Transition rejected: stale fence token',
  workflowNotFound: (workflowId) => `Workflow ${workflowId} not found`,
  participantNotFound: (participantKey) =>
    `Workflow participant ${participantKey} not found`,
});

/**
 * Builds a canonical idempotency key for a workflow step transition.
 * Used to prevent duplicate transitions on recovery replay.
 *
 * @param {string} operationId - The operation or workflow ID.
 * @param {string} stepId - The target step of the transition.
 * @return {string} Idempotency key.
 */
const buildTransitionIdempotencyKey = (operationId, stepId) =>
  `${operationId}:${stepId}`;

export {
  WORKFLOW_TRANSITION_FIELD,
  WORKFLOW_ERROR_MSG,
  buildTransitionIdempotencyKey,
};
