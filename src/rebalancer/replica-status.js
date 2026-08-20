/**
 * Unified Replica Status and Operation Types.
 *
 * This module provides a single source of truth for replica states used
 * across all components: RebalanceCoordinator, ReplicaHandler, CDC, Admin CLI.
 *
 * Requirements: 5.1, 5.2
 */

import {WORKFLOW_STEP} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {resolvePartitionTableId} from '../bootstrap/system-partition-classification.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
} from './replica-operation-progress.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';

// Cycle-free single source of truth for the disruptive operation-ledger
// self-move class. Admission policy and workflow dispatch consume the same
// predicate without either owner importing the other.
const OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES = Object.freeze(
  new Set([OperationType.REPLACE, OperationType.REMOVE]),
);

function normalizeOperationLedgerMoveType(moveType) {
  if (typeof moveType !== LOCAL_STR_STRING) {
    return null;
  }
  const normalized = moveType.toUpperCase();
  return normalized.length === 0 ? null : normalized;
}

function isDisruptiveOperationLedgerSelfMove(moveType, partitionId) {
  return (
    OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES.has(
      normalizeOperationLedgerMoveType(moveType),
    ) &&
    resolvePartitionTableId({partitionId}) ===
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS
  );
}

function getOperationMetadataValue(stepsHistory, metadataKey) {
  if (!Array.isArray(stepsHistory) ||
      typeof metadataKey !== LOCAL_STR_STRING ||
      metadataKey.length === 0) {
    return null;
  }

  for (const stepEntry of stepsHistory) {
    if (!stepEntry || typeof stepEntry !== LOCAL_STR_OBJECT) {
      continue;
    }

    const value = stepEntry[metadataKey];
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function getOperationMetadataString(stepsHistory, metadataKey) {
  const value = getOperationMetadataValue(stepsHistory, metadataKey);
  return typeof value === LOCAL_STR_STRING && value.length > 0 ? value : null;
}

function getOperationMetadataStringArray(stepsHistory, metadataKey) {
  const value = getOperationMetadataValue(stepsHistory, metadataKey);
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== LOCAL_STR_STRING ||
        entry.length === 0 ||
        seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    normalized.push(entry);
  }
  return normalized;
}

function getOperationMetadataObject(stepsHistory, metadataKey) {
  const value = getOperationMetadataValue(stepsHistory, metadataKey);
  if (!value || typeof value !== LOCAL_STR_OBJECT || Array.isArray(value)) {
    return null;
  }
  return value;
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
  const operation = {
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
  // The planning membership epoch rides the operation record top-level so
  // the dispatch-time epoch gate can fence stale ADD/REPLACE execution
  // (audit finding 7); it is no longer duplicated into stepsHistory.
  if (Number.isInteger(params.membershipPublicationEpoch) &&
      params.membershipPublicationEpoch >= 0) {
    operation.membershipPublicationEpoch = params.membershipPublicationEpoch;
  }
  return operation;
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
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE,
  ADJUST_DIRECTION,
  WORKFLOW_STEP_TO_STATUS,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_REPLICA_OPERATION_SEMANTIC_PHASES,
  OPERATION_TERMINAL_STATUSES_BY_TYPE,
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  OPERATION_METADATA_KEY,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  REPLACE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  COORDINATOR_OWNED_OPERATION_TYPES,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  isCoordinatorOwnedOperationType,
  isReplaceRemoveDispatchPhase,
  isTerminalReplicaOperationRecord,
  isTerminalReplicaOperationStatusForType,
  isTerminalSuccessfulCreateOperation,
  buildReplicaOperationProgressSnapshot,
  resolveReplicaOperationSemanticPhase,
  resolveReplicaOperationSemanticPhaseFromRecord,
  buildReplicaOperationSemanticWitnesses,
  isTerminalReplicaOperationSemanticPhase,
} from './replica-operation-progress.js';

export {
  createOperation,
  getAllStatusValues,
  isValidStatus,
  getOperationMetadataValue,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  getOperationMetadataObject,
  OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES,
  isDisruptiveOperationLedgerSelfMove,
  normalizeOperationLedgerMoveType,
};
