/**
 * Unified Replica Status and Operation Types.
 *
 * This module provides a single source of truth for replica states used
 * across all components: RebalanceCoordinator, ReplicaHandler, CDC, Admin CLI.
 *
 * Requirements: 5.1, 5.2
 */

import {WORKFLOW_STEP} from '../constants/index.js';
import {memoizedParseStepsHistoryString} from './steps-history-parse-memo.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {resolvePartitionTableId} from '../bootstrap/system-partition-classification.js';
import {
  isBoundMembershipPublicationEpoch,
} from './replica-operation-membership-epoch-binding.js';
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
  return createOperationAt(params, Date.now());
}

/**
 * The one operation record builder at an explicit creation time: the
 * placement admission applier stamps the committed command's proposal time,
 * so every replica builds the same record.
 * @param {Object} params - As createOperation.
 * @param {number} now - The creation time (ms since epoch).
 * @return {Operation} A new Operation object.
 */
function resolvePositiveSafeInteger(value) {
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function createOperationAt(params, now) {
  const initialStep = WORKFLOW_STEP.PENDING;
  const initialHistory = {step: initialStep, timestamp: now};
  const replaceSourceReplicaId =
    params.type === OperationType.REPLACE && params.sourceReplicaId ?
      params.sourceReplicaId :
      null;
  if (replaceSourceReplicaId) {
    initialHistory[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] =
      replaceSourceReplicaId;
  }
  const bootInc = resolvePositiveSafeInteger(params.targetNodeBootIncarnation);
  if (bootInc !== null) {
    initialHistory[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION] = bootInc;
  }
  const storageInc = resolvePositiveSafeInteger(params.targetNodeStorageIncarnation);
  if (storageInc !== null) {
    initialHistory[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION] = storageInc;
  }
  const operation = {
    operationId: params.operationId,
    type: params.type,
    partitionId: params.partitionId,
    replicaId: params.replicaId || null,
    sourceReplicaId: replaceSourceReplicaId,
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
  if (bootInc !== null) {
    operation[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION] = bootInc;
  }
  if (storageInc !== null) {
    operation[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION] = storageInc;
  }
  if (isBoundMembershipPublicationEpoch(params.membershipPublicationEpoch)) {
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

function readPositiveSafeInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function parseEndpointMetadataStorageIncarnation(endpointRow) {
  const rawMetadata = endpointRow?.metadata;
  if (!rawMetadata) {
    return null;
  }
  if (typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    return readPositiveSafeInteger(rawMetadata.storageIncarnation);
  }
  if (typeof rawMetadata !== 'string' || rawMetadata.length === 0) {
    return null;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(rawMetadata);
  } catch (_error) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return readPositiveSafeInteger(parsed.storageIncarnation);
}

function resolveTargetNodeIncarnationSnapshot(systemTableCache, targetNodeId) {
  if (
    !systemTableCache ||
    typeof targetNodeId !== 'string' ||
    targetNodeId.length === 0
  ) {
    return Object.freeze({
      bootIncarnation: null,
      storageIncarnation: null,
    });
  }
  const targetNode = systemTableCache.get('nodes', targetNodeId);
  const targetEndpoint = systemTableCache.get(
    'node_endpoints',
    `ep-${targetNodeId}-ws`,
  );
  const nodeBootIncarnation =
    readPositiveSafeInteger(targetNode?.boot_incarnation) ??
    readPositiveSafeInteger(targetNode?.bootIncarnation);
  const endpointBootIncarnation =
    readPositiveSafeInteger(targetEndpoint?.boot_incarnation) ??
    readPositiveSafeInteger(targetEndpoint?.bootIncarnation);
  const bootIncarnation = nodeBootIncarnation ?? endpointBootIncarnation;
  const nodeStorageIncarnation =
    readPositiveSafeInteger(targetNode?.storage_incarnation) ??
    readPositiveSafeInteger(targetNode?.storageIncarnation);
  const rawEndpointStorageIncarnation =
    parseEndpointMetadataStorageIncarnation(targetEndpoint);
  const endpointCoherentWithNode =
    nodeBootIncarnation !== null &&
    endpointBootIncarnation === nodeBootIncarnation;
  const endpointStorageIncarnation = endpointCoherentWithNode ?
    rawEndpointStorageIncarnation :
    null;
  let storageIncarnation = endpointStorageIncarnation;
  if (
    nodeStorageIncarnation !== null &&
    (targetEndpoint == null || endpointCoherentWithNode) &&
    (storageIncarnation === null ||
      nodeStorageIncarnation > storageIncarnation)
  ) {
    storageIncarnation = nodeStorageIncarnation;
  }
  return Object.freeze({
    bootIncarnation,
    storageIncarnation,
  });
}

function readStepsHistoryPositiveInteger(stepsHistory, metadataKey) {
  if (!Array.isArray(stepsHistory)) {
    return null;
  }
  for (let index = stepsHistory.length - 1; index >= 0; index -= 1) {
    const entry = stepsHistory[index];
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = readPositiveSafeInteger(entry[metadataKey]);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

function readOperationTargetNodeBootIncarnation(operation, stepsHistory) {
  const directCamel = readPositiveSafeInteger(
    operation?.[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION],
  );
  if (directCamel !== null) {
    return directCamel;
  }
  const directSnake = readPositiveSafeInteger(
    operation?.target_node_boot_incarnation,
  );
  if (directSnake !== null) {
    return directSnake;
  }
  return readStepsHistoryPositiveInteger(
    stepsHistory,
    OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION,
  );
}

function readOperationTargetNodeStorageIncarnation(operation, stepsHistory) {
  const directCamel = readPositiveSafeInteger(
    operation?.[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION],
  );
  if (directCamel !== null) {
    return directCamel;
  }
  const directSnake = readPositiveSafeInteger(
    operation?.target_node_storage_incarnation,
  );
  if (directSnake !== null) {
    return directSnake;
  }
  return readStepsHistoryPositiveInteger(
    stepsHistory,
    OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION,
  );
}

function preserveOperationTargetNodeIncarnations(operation, stepEntry) {
  let stepsHistory = operation?.stepsHistory;
  if (!Array.isArray(stepsHistory)) {
    stepsHistory = operation?.steps_history;
  }
  if (typeof stepsHistory === 'string') {
    stepsHistory = memoizedParseStepsHistoryString(stepsHistory);
  }
  const normalizedHistory = Array.isArray(stepsHistory) ? stepsHistory : [];
  if (
    operation &&
    typeof operation === 'object' &&
    !Array.isArray(operation.stepsHistory) &&
    !Object.isFrozen(operation)
  ) {
    operation.stepsHistory = normalizedHistory;
  }
  const targetNodeBootIncarnation = readOperationTargetNodeBootIncarnation(
    operation,
    normalizedHistory,
  );
  const targetNodeStorageIncarnation =
    readOperationTargetNodeStorageIncarnation(
      operation,
      normalizedHistory,
    );
  if (targetNodeBootIncarnation !== null) {
    stepEntry[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION] =
      targetNodeBootIncarnation;
    if (operation && !Object.isFrozen(operation)) {
      operation[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION] =
        targetNodeBootIncarnation;
    }
  }
  if (targetNodeStorageIncarnation !== null) {
    stepEntry[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION] =
      targetNodeStorageIncarnation;
    if (operation && !Object.isFrozen(operation)) {
      operation[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION] =
        targetNodeStorageIncarnation;
    }
  }
  return stepEntry;
}

// The one peer-admission rule over a services row's status, read by
// partition and message-group admission alike (F1/F2): a row whose replica
// has not durably recorded that its port opened (PENDING, CREATING - a create
// target steps nothing until its SYNCING fact is durable, verifier N3) or
// that is retiring (FAILED, REMOVING, REMOVED) names no peer. A row without a
// status is a live one.
const PEER_ROW_EXCLUDED_STATUSES = Object.freeze(new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
  ReplicaStatus.HELD,
]));

function isPeerRowStatusAdmissible(status) {
  return !PEER_ROW_EXCLUDED_STATUSES.has(status || ReplicaStatus.ACTIVE);
}

// The post-intent boundary of a create (an ADD or REPLACE target), M2: its
// authoritative services row is ACTIVE - the replica opened, caught up and
// serves. Past it a create is never failed (the operation owner completes it
// instead) and its target is never a failed-target cleanup candidate. A
// target admitted but closed never wrote ACTIVE, so the cure still removes it.
function isLiveCreateTargetStatus(status) {
  return status === ReplicaStatus.ACTIVE;
}

function isBootstrapTopologyDispatchDeferred(operationOrRow) {
  if (!operationOrRow || typeof operationOrRow !== 'object') {
    return false;
  }
  let stepsHistory = operationOrRow.stepsHistory;
  if (!Array.isArray(stepsHistory)) {
    stepsHistory = operationOrRow.steps_history;
  }
  if (typeof stepsHistory === 'string') {
    // The one steps-history parser: unparsable -> no steps -> not deferred.
    stepsHistory = memoizedParseStepsHistoryString(stepsHistory);
  }
  return (
    getOperationMetadataValue(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED,
    ) === true ||
    getOperationMetadataValue(
      stepsHistory,
      OPERATION_METADATA_KEY.DISPATCH_HOLD,
    ) !== null
  );
}

export {
  isBootstrapTopologyDispatchDeferred,
  isLiveCreateTargetStatus,
  isPeerRowStatusAdmissible,
  createOperation,
  createOperationAt,
  getAllStatusValues,
  isValidStatus,
  getOperationMetadataValue,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  getOperationMetadataObject,
  OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES,
  isDisruptiveOperationLedgerSelfMove,
  normalizeOperationLedgerMoveType,
  preserveOperationTargetNodeIncarnations,
  readOperationTargetNodeBootIncarnation,
  readOperationTargetNodeStorageIncarnation,
  resolveTargetNodeIncarnationSnapshot,
};
