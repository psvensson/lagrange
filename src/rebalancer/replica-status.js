/**
 * Unified Replica Status and Operation Types.
 *
 * This module provides a single source of truth for replica states used
 * across all components: RebalanceCoordinator, ReplicaHandler, CDC, Admin CLI.
 *
 * Requirements: 5.1, 5.2
 */

import {WORKFLOW_STEP} from '../constants/index.js';

/**
 * ReplicaStatus - Single source of truth for replica states.
 * Used by RebalanceCoordinator, ReplicaHandler, CDC, and Admin CLI.
 *
 * @enum {string}
 */
const ReplicaStatus = {
  /** Operation created, not yet sent */
  PENDING: 'pending',
  /** Request sent, awaiting creation */
  CREATING: 'creating',
  /** Replica created, syncing data */
  SYNCING: 'syncing',
  /** Fully operational */
  ACTIVE: 'active',
  /** Removal in progress */
  REMOVING: 'removing',
  /** Fully removed */
  REMOVED: 'removed',
  /** Operation failed */
  FAILED: 'failed',
};

/**
 * Terminal statuses represent completed or failed operations.
 * A replica in one of these statuses has reached a final state.
 *
 * @type {string[]}
 */
const TERMINAL_STATUSES = [
  ReplicaStatus.ACTIVE,
  ReplicaStatus.REMOVED,
  ReplicaStatus.FAILED,
];

/**
 * SQL clause fragment for filtering by terminal statuses.
 * Built programmatically from TERMINAL_STATUSES to ensure consistency.
 * Usage: `WHERE status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`
 *
 * @type {string}
 */
const TERMINAL_STATUS_SQL_CLAUSE =
  TERMINAL_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * Direction constants for adjustToOddCount function.
 *
 * @enum {string}
 */
const ADJUST_DIRECTION = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

/**
 * Workflow steps map to statuses.
 * Maps workflow step names to their corresponding ReplicaStatus values.
 *
 * @type {Object.<string, string>}
 */
const WORKFLOW_STEP_TO_STATUS = {
  [WORKFLOW_STEP.PENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.SENDING]: ReplicaStatus.PENDING,
  [WORKFLOW_STEP.CREATING]: ReplicaStatus.CREATING,
  [WORKFLOW_STEP.SYNCING]: ReplicaStatus.SYNCING,
  [WORKFLOW_STEP.ACTIVE]: ReplicaStatus.ACTIVE,
  [WORKFLOW_STEP.STOPPING]: ReplicaStatus.REMOVING,
  [WORKFLOW_STEP.REMOVED]: ReplicaStatus.REMOVED,
};

/**
 * Operation types for replica operations.
 *
 * @enum {string}
 */
const OperationType = {
  /** Add a new replica */
  ADD: 'ADD',
  /** Remove an existing replica */
  REMOVE: 'REMOVE',
  /** Replace an existing replica (create/sync/promote/remove source) */
  REPLACE: 'REPLACE',
};

const COORDINATOR_OWNED_OPERATION_TYPES = Object.freeze([
  OperationType.ADD,
  OperationType.REMOVE,
  OperationType.REPLACE,
]);

const COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE =
  COORDINATOR_OWNED_OPERATION_TYPES
    .map((type) => `'${type}'`)
    .join(', ');

/**
 * Workflow steps for ADD operations.
 * Progress in order: PENDING → SENDING → CREATING → SYNCING → ACTIVE
 *
 * @type {string[]}
 */
const ADD_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.ACTIVE,
];

/**
 * Workflow steps for REMOVE operations.
 * Progress in order: PENDING → SENDING → STOPPING → REMOVED
 *
 * @type {string[]}
 */
const REMOVE_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.REMOVED,
];

/**
 * Workflow steps for REPLACE operations.
 * Progress in order:
 * PENDING → SENDING → CREATING → SYNCING → ACTIVE → STOPPING → REMOVED
 *
 * ACTIVE represents "replacement promoted and voter-ready".
 *
 * @type {string[]}
 */
const REPLACE_WORKFLOW_STEPS = [
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.REMOVED,
];

/**
 * Metadata keys stored in operation stepsHistory entries.
 *
 * @enum {string}
 */
const OPERATION_METADATA_KEY = Object.freeze({
  SOURCE_REPLICA_ID: 'sourceReplicaId',
  READINESS_SNAPSHOT: 'readinessSnapshot',
});

/**
 * Get the workflow steps for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @return {string[]} Array of workflow steps in order.
 */
function getWorkflowSteps(operationType) {
  if (operationType === OperationType.ADD) {
    return [...ADD_WORKFLOW_STEPS];
  }
  if (operationType === OperationType.REMOVE) {
    return [...REMOVE_WORKFLOW_STEPS];
  }
  if (operationType === OperationType.REPLACE) {
    return [...REPLACE_WORKFLOW_STEPS];
  }
  return [];
}

/**
 * Check if a workflow step is valid for an operation type.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to validate.
 * @return {boolean} True if the step is valid for the operation type.
 */
function isValidWorkflowStep(operationType, step) {
  const steps = getWorkflowSteps(operationType);
  return steps.includes(step);
}

/**
 * Get the next workflow step for an operation.
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} currentStep - The current workflow step.
 * @return {string|null} The next step, or null if at final step or invalid.
 */
function getNextWorkflowStep(operationType, currentStep) {
  const steps = getWorkflowSteps(operationType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= steps.length - 1) {
    return null;
  }
  return steps[currentIndex + 1];
}

/**
 * Check if a workflow step is a terminal step (final step or FAILED).
 *
 * @param {string} operationType - The operation type (ADD or REMOVE).
 * @param {string} step - The workflow step to check.
 * @return {boolean} True if the step is terminal.
 */
function isTerminalStep(operationType, step) {
  if (step === WORKFLOW_STEP.FAILED) {
    return true;
  }
  const steps = getWorkflowSteps(operationType);
  if (steps.length === 0) {
    return false;
  }
  return step === steps[steps.length - 1];
}

/**
 * @typedef {Object} Operation
 * @property {string} operationId - Unique operation identifier (UUID).
 * @property {string} type - Operation type: 'ADD' or 'REMOVE'.
 * @property {string} partitionId - Target partition identifier.
 * @property {string|null} replicaId - Replica being created/removed (null for
 *   new ADD operations until replica is created).
 * @property {string} sourceNodeId - Node that initiated the operation.
 * @property {string} targetNodeId - Node where replica is created/removed.
 * @property {string} status - Current ReplicaStatus value.
 * @property {string} workflowStep - Current workflow step.
 * @property {number} createdAt - Creation timestamp (ms since epoch).
 * @property {number} updatedAt - Last update timestamp (ms since epoch).
 * @property {number|null} completedAt - Completion timestamp (null if not
 *   complete).
 * @property {string|null} errorMessage - Error message if failed.
 * @property {Array<{step: string, timestamp: number}>} stepsHistory - History
 *   of workflow step transitions.
 */

/**
 * Create a new Operation object with required fields.
 *
 * @param {Object} params - Operation parameters.
 * @param {string} params.operationId - Unique operation identifier.
 * @param {string} params.type - Operation type: 'ADD' or 'REMOVE'.
 * @param {string} params.partitionId - Target partition identifier.
 * @param {string} params.sourceNodeId - Node that initiated the operation.
 * @param {string} params.targetNodeId - Node where replica is created/removed.
 * @param {string} [params.replicaId] - Replica identifier (optional for ADD).
 * @param {string} [params.sourceReplicaId] - Source replica ID for REPLACE
 *   operations.
 * @return {Operation} A new Operation object.
 */
function createOperation(params) {
  const now = Date.now();
  const initialStep = WORKFLOW_STEP.PENDING;
  const initialHistory = {step: initialStep, timestamp: now};

  if (params.type === OperationType.REPLACE &&
      params.sourceReplicaId) {
    initialHistory[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] =
      params.sourceReplicaId;
  }

  return {
    operationId: params.operationId,
    type: params.type,
    partitionId: params.partitionId,
    replicaId: params.replicaId || null,
    sourceNodeId: params.sourceNodeId,
    targetNodeId: params.targetNodeId,
    status: WORKFLOW_STEP_TO_STATUS[initialStep],
    workflowStep: initialStep,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [initialHistory],
  };
}

/**
 * Get all valid ReplicaStatus values.
 *
 * @return {string[]} Array of all valid status values.
 */
function getAllStatusValues() {
  return Object.values(ReplicaStatus);
}

/**
 * Check if a value is a valid ReplicaStatus.
 *
 * @param {string} value - The value to check.
 * @return {boolean} True if the value is a valid ReplicaStatus.
 */
function isValidStatus(value) {
  return getAllStatusValues().includes(value);
}

/**
 * Check whether an operation type belongs to the steady-state coordinator
 * domain. Bootstrap-owned MOVE_ASSIGNMENT rows must not be treated as
 * dispatchable or recoverable coordinator work.
 *
 * @param {string} value - Operation type to check.
 * @return {boolean} True when the type is coordinator-owned.
 */
function isCoordinatorOwnedOperationType(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return COORDINATOR_OWNED_OPERATION_TYPES.includes(value.toUpperCase());
}

export {
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  ADJUST_DIRECTION,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  OPERATION_METADATA_KEY,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  REPLACE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  createOperation,
  getAllStatusValues,
  isValidStatus,
  COORDINATOR_OWNED_OPERATION_TYPES,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  isCoordinatorOwnedOperationType,
};
