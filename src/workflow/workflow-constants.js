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

/**
 * Participant acknowledgement result outcomes.
 *
 * Every call to acknowledgeParticipant returns one of these to let the
 * caller know whether the acknowledgement was accepted, and if not, why.
 *
 * @enum {string}
 */
const PARTICIPANT_ACK_RESULT = Object.freeze({
  ACCEPTED: 'accepted',
  STALE_FENCE: 'stale_fence',
  DUPLICATE: 'duplicate',
  PARTICIPANT_NOT_FOUND: 'participant_not_found',
  INVALID_TRANSITION: 'invalid_transition',
});

const WORKFLOW_CLAIM_RESULT = Object.freeze({
  ACCEPTED: 'accepted',
  ACTIVE_OWNER: 'active_owner',
  STALE_FENCE: 'stale_fence',
  STORAGE_REJECTED: 'storage_rejected',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown',
});

/**
 * Fallback owner identity prefix when a managed workflow coordinator is
 * constructed without an explicit `nodeId` (tests and single-node harnesses).
 *
 * @type {string}
 */
const WORKFLOW_DEFAULT_NODE_ID = 'node';

/**
 * The prototype property skipped when mixin method descriptors are copied
 * onto a class prototype.
 *
 * @type {string}
 */
const PROTOTYPE_CONSTRUCTOR_METHOD = 'constructor';

/**
 * Canonical field names for participant acknowledgement payloads.
 *
 * @enum {string}
 */
const PARTICIPANT_ACK_FIELD = Object.freeze({
  WORKFLOW_ID: 'workflowId',
  PARTICIPANT_KEY: 'participantKey',
  FENCE_TOKEN: 'fenceToken',
  STATUS: 'status',
  CHECKPOINT: 'checkpoint',
  ACKNOWLEDGED_AT: 'acknowledgedAt',
});

const WORKFLOW_ERROR_MSG = Object.freeze({
  WORKFLOW_ID_REQUIRED: 'Workflow ID is required',
  OWNER_KEY_REQUIRED: 'Workflow owner key is required',
  WORKFLOW_COORDINATOR_REQUIRED:
    'Workflow step runner requires a workflow coordinator',
  PARTICIPANT_ID_REQUIRED: 'Workflow participant ID is required',
  NEXT_STEP_REQUIRED: 'Workflow transition requires nextStep',
  ENLISTED_PARTICIPANTS_MISSING:
    'Workflow enlisted participants that are missing from the registry; ' +
    'refusing to run the stage against lost enlistment state',
  REASON_REQUIRED: 'Workflow transition requires reason',
  DUPLICATE_TRANSITION: 'Duplicate transition rejected by idempotency check',
  STALE_FENCE_TOKEN: 'Transition rejected: stale fence token',
  CLAIM_OWNER_ID_REQUIRED: 'Workflow claim requires ownerId',
  CLAIM_FENCE_TOKEN_REQUIRED:
    'Workflow claim requires a non-negative integer fenceToken',
  CLAIM_LEASE_EXPIRY_REQUIRED:
    'Workflow claim requires a finite leaseExpiresAt',
  TERMINAL_WORKFLOW_IMMUTABLE:
    'Terminal workflow transitions are immutable',
  WORKFLOW_LEASE_EXPIRED:
    'Workflow transition rejected: ownership lease expired',
  WORKFLOW_OWNER_MISMATCH:
    'Workflow transition rejected: owner does not hold the lease',
  PARTICIPANT_KEY_REQUIRED:
    'Participant acknowledgement requires participantKey',
  ACK_STATUS_REQUIRED:
    'Participant acknowledgement requires status',
  PARTICIPANT_INVALID_TRANSITION:
    'Participant acknowledgement rejected: transition not in the ' +
    'participant graph',
  workflowNotFound: (workflowId) => `Workflow ${workflowId} not found`,
  participantNotFound: (participantKey) =>
    `Workflow participant ${participantKey} not found`,
});

/**
 * Typed diagnostic record field names for acknowledgement rejections.
 *
 * Every rejection diagnostic carries these fields so callers and
 * invariant consumers can inspect rejection context without parsing
 * free-form strings.
 *
 * @enum {string}
 */
const ACK_REJECTION_DIAGNOSTIC_FIELD = Object.freeze({
  WORKFLOW_ID: 'workflowId',
  PARTICIPANT_KEY: 'participantKey',
  REJECTION_RESULT: 'rejectionResult',
  REASON: 'reason',
  RECEIVED_STATUS: 'receivedStatus',
  CURRENT_STATUS: 'currentStatus',
  RECEIVED_FENCE_TOKEN: 'receivedFenceToken',
  CURRENT_FENCE_TOKEN: 'currentFenceToken',
  TIMESTAMP: 'timestamp',
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
  PARTICIPANT_ACK_RESULT,
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_DEFAULT_NODE_ID,
  PROTOTYPE_CONSTRUCTOR_METHOD,
  PARTICIPANT_ACK_FIELD,
  ACK_REJECTION_DIAGNOSTIC_FIELD,
  buildTransitionIdempotencyKey,
};
