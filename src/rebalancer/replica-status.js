/**
 * Unified Replica Status and Operation Types.
 *
 * This module provides a single source of truth for replica states used
 * across all components: RebalanceCoordinator, ReplicaHandler, CDC, Admin CLI.
 *
 * Requirements: 5.1, 5.2
 */

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
 * Workflow steps map to statuses.
 * Maps workflow step names to their corresponding ReplicaStatus values.
 *
 * @type {Object.<string, string>}
 */
const WORKFLOW_STEP_TO_STATUS = {
  'PENDING': ReplicaStatus.PENDING,
  'SENDING': ReplicaStatus.PENDING,
  'CREATING': ReplicaStatus.CREATING,
  'SYNCING': ReplicaStatus.SYNCING,
  'ACTIVE': ReplicaStatus.ACTIVE,
  'STOPPING': ReplicaStatus.REMOVING,
  'REMOVED': ReplicaStatus.REMOVED,
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
};

/**
 * Workflow steps for ADD operations.
 * Progress in order: PENDING → SENDING → CREATING → SYNCING → ACTIVE
 *
 * @type {string[]}
 */
const ADD_WORKFLOW_STEPS = ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];

/**
 * Workflow steps for REMOVE operations.
 * Progress in order: PENDING → SENDING → STOPPING → REMOVED
 *
 * @type {string[]}
 */
const REMOVE_WORKFLOW_STEPS = ['PENDING', 'SENDING', 'STOPPING', 'REMOVED'];

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
  if (step === 'FAILED') {
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
 * @return {Operation} A new Operation object.
 */
function createOperation(params) {
  const now = Date.now();
  const initialStep = 'PENDING';

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
    stepsHistory: [{step: initialStep, timestamp: now}],
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

export {
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  createOperation,
  getAllStatusValues,
  isValidStatus,
};
