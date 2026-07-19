import {
  REPLICA_INVENTORY_EFFECTIVE_VIEW,
  effectiveReplicaCountAfterOperations,
} from './replica-inventory.js';
import {
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
} from './rebalancer-constants.js';
import {ReplicaStatus} from './replica-status.js';

const PRIORITY_ACTION = Object.freeze({
  EMIT_NEW_MOVE: 'emit_new_move',
  IDLE: 'idle',
  PROGRESS_EXISTING_TRANSITION: 'progress_existing_transition',
});

const MOVE_PRECEDENCE = Object.freeze({
  FAILED_REPLICA_REMOVE: 0,
  TRUE_DEFICIT_ADD: 1,
  SPREAD_RESTORING_ADD: 2,
  MONOTONIC_SAFE_SURPLUS_REMOVE: 3,
  COUNT_NEUTRAL_REPLACE: 4,
});

const EXCLUSIVE_PROGRESS = Object.freeze({
  OPERATION_TYPE: 'REMOVE',
  WORKFLOW_STEP: 'STOPPING',
});
const EMPTY_RECORD = Object.freeze({});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeRecord(child);
  }
  return Object.freeze(value);
}

function normalizedTargetNodeIds(targetState) {
  const values = Array.isArray(targetState?.targetNodes) ?
    targetState.targetNodes :
    [];
  return [...new Set(
    values
      .map((nodeId) => String(nodeId || '').trim())
      .filter(Boolean),
  )].sort();
}

function operationId(operation) {
  return String(
    operation?.operationId ||
    operation?.operation_id ||
    operation?.id ||
    '',
  ).trim();
}

function operationType(operation) {
  return String(
    operation?.type ||
    operation?.operationType ||
    operation?.operation_type ||
    '',
  ).trim().toUpperCase();
}

function operationStep(operation) {
  return String(
    operation?.workflowStep ||
    operation?.workflow_step ||
    '',
  ).trim().toUpperCase();
}

function requiresExclusiveProgress(operation) {
  return operationType(operation) === EXCLUSIVE_PROGRESS.OPERATION_TYPE ||
    operationStep(operation) === EXCLUSIVE_PROGRESS.WORKFLOW_STEP;
}

function isFailedReplicaRemove(_placement, move) {
  return (
    move.type === REBALANCER_MOVE_TYPE.REMOVE &&
    move.reason === MOVE_REASON.REPLICA_FAILED
  );
}

function isTrueDeficitAdd(placement, move) {
  return (
    move.type === REBALANCER_MOVE_TYPE.ADD &&
    move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT &&
    placement.deficitCount > 0
  );
}

function isSpreadRestoringAdd(_placement, move) {
  return (
    move.type === REBALANCER_MOVE_TYPE.ADD &&
    move.reason === MOVE_REASON.SPREAD_REPLICAS
  );
}

function isRemove(_placement, move) {
  return move.type === REBALANCER_MOVE_TYPE.REMOVE;
}

function isReplace(_placement, move) {
  return move.type === REBALANCER_MOVE_TYPE.REPLACE;
}

const CANDIDATE_RULES = Object.freeze([
  Object.freeze({
    precedence: MOVE_PRECEDENCE.FAILED_REPLICA_REMOVE,
    accepts: isFailedReplicaRemove,
  }),
  Object.freeze({
    precedence: MOVE_PRECEDENCE.TRUE_DEFICIT_ADD,
    accepts: isTrueDeficitAdd,
  }),
  Object.freeze({
    precedence: MOVE_PRECEDENCE.SPREAD_RESTORING_ADD,
    accepts: isSpreadRestoringAdd,
  }),
  Object.freeze({
    precedence: MOVE_PRECEDENCE.MONOTONIC_SAFE_SURPLUS_REMOVE,
    accepts: isRemove,
  }),
  Object.freeze({
    precedence: MOVE_PRECEDENCE.COUNT_NEUTRAL_REPLACE,
    accepts: isReplace,
  }),
]);

function isTopologyIncreasing(move) {
  return move.type === REBALANCER_MOVE_TYPE.ADD ||
    move.type === REBALANCER_MOVE_TYPE.REPLACE;
}

function candidatePrecedence(placement, move) {
  if (!move || typeof move !== 'object') {
    return Number.POSITIVE_INFINITY;
  }
  if (
    isTopologyIncreasing(move) &&
    placement.topologyIncreaseUsable !== true
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const rule = CANDIDATE_RULES.find((row) => row.accepts(placement, move));
  return rule ? rule.precedence : Number.POSITIVE_INFINITY;
}

function resolveTargetReplicaCount(targetState) {
  const value = targetState?.targetReplicaCount;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function inventoryReplicas(inventory) {
  return Array.isArray(inventory?.replicas) ? inventory.replicas : [];
}

function unresolvedOperations(options) {
  return Array.isArray(options?.unresolvedOperations) ?
    options.unresolvedOperations :
    [];
}

function activeReplicaNodeIds(replicas) {
  return [...new Set(
    replicas
      .filter((replica) => replica?.active === true)
      .map((replica) => replica.nodeId)
      .filter(Boolean),
  )].sort();
}

function failedReplicaIds(replicas) {
  return replicas
    .filter((replica) => replica?.status === ReplicaStatus.FAILED)
    .map((replica) => replica.replicaId)
    .filter(Boolean)
    .sort();
}

function operationIds(operations) {
  return operations.map(operationId).filter(Boolean).sort();
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

function finiteCount(value) {
  return Number.isFinite(value) ? value : 0;
}

function shouldProgressExistingTransition(placement) {
  if (placement.exclusiveProgressRequired === true) {
    return true;
  }
  return placement.unresolvedTransitionCount > 0 &&
    placement.deficitCount === 0;
}

function isEligibleDuringDeficitTransition(precedence) {
  return precedence === MOVE_PRECEDENCE.FAILED_REPLICA_REMOVE ||
    precedence === MOVE_PRECEDENCE.TRUE_DEFICIT_ADD;
}

function selectCandidate(placement, candidates) {
  const deficitDuringTransition =
    placement.unresolvedTransitionCount > 0 &&
    placement.deficitCount > 0;
  let selected = null;
  let selectedPrecedence = Number.POSITIVE_INFINITY;
  for (const move of candidates) {
    const precedence = candidatePrecedence(placement, move);
    if (
      deficitDuringTransition &&
      !isEligibleDuringDeficitTransition(precedence)
    ) {
      continue;
    }
    if (precedence < selectedPrecedence) {
      selected = move;
      selectedPrecedence = precedence;
    }
  }
  return selected;
}

/**
 * Project the one priority-planning view from the canonical joined inventory.
 * This owner adds target-topology meaning; it never rebuilds row/operation
 * accounting already owned by replica-inventory.
 *
 * @param {Object} options projection inputs
 * @return {Object} deeply frozen EffectivePlacement
 */
export function buildEffectivePlacement(options = {}) {
  const {
    inventory = EMPTY_RECORD,
    targetState = EMPTY_RECORD,
  } = options;
  const targetReplicaCount = resolveTargetReplicaCount(targetState);
  const targetNodeIds = normalizedTargetNodeIds(targetState);
  const replicas = inventoryReplicas(inventory);
  const activeNodeIds = activeReplicaNodeIds(replicas);
  const effectiveReplicaCount = effectiveReplicaCountAfterOperations(
    inventory,
    REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL,
  );
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetNodeIds.length,
  );
  const operations = unresolvedOperations(options);
  const exclusiveProgressOperationIds = operations
    .filter(requiresExclusiveProgress)
    .map(operationId).filter(Boolean).sort();

  return freezeRecord({
    entityId: valueOrNull(inventory.entityId),
    capturedAtMs: valueOrNull(inventory.capturedAtMs),
    targetReplicaCount,
    targetNodeIds,
    activeReplicaCount: finiteCount(inventory?.accounting?.activeCount),
    effectiveReplicaCount,
    activeNodeIds,
    activeDistinctNodeCount: activeNodeIds.length,
    requiredDistinctNodeCount,
    spreadGap: Math.max(
      0,
      requiredDistinctNodeCount - activeNodeIds.length,
    ),
    deficitCount: Math.max(0, targetReplicaCount - effectiveReplicaCount),
    surplusCount: Math.max(0, effectiveReplicaCount - targetReplicaCount),
    failedReplicaIds: failedReplicaIds(replicas),
    unresolvedTransitionCount: operations.length,
    unresolvedOperationIds: operationIds(operations),
    exclusiveProgressOperationIds,
    exclusiveProgressRequired: operations.some(requiresExclusiveProgress),
    topologyIncreaseUsable:
      inventory?.provenance?.topologyIncreaseUsable === true,
    inventoryConsistency: valueOrNull(inventory?.provenance?.consistency),
  });
}

/**
 * Select at most one priority move from the existing policy-qualified
 * candidates. The candidate builders and downstream admission valves remain
 * unchanged during cutover; this owner makes their competing output serial.
 *
 * @param {Object} options selection inputs
 * @return {Object} frozen serial decision
 */
export function selectSerialPriorityMove(options = {}) {
  const placement = options.placement || {};
  if (shouldProgressExistingTransition(placement)) {
    return freezeRecord({
      action: PRIORITY_ACTION.PROGRESS_EXISTING_TRANSITION,
      move: null,
      newMoveCount: 0,
      operationIds: [...(placement.unresolvedOperationIds || [])],
    });
  }

  const candidates = Array.isArray(options.candidates) ?
    options.candidates :
    [];
  const selected = selectCandidate(placement, candidates);
  if (!selected) {
    return freezeRecord({
      action: PRIORITY_ACTION.IDLE,
      move: null,
      newMoveCount: 0,
      operationIds: [],
    });
  }
  return freezeRecord({
    action: PRIORITY_ACTION.EMIT_NEW_MOVE,
    move: {...selected},
    newMoveCount: 1,
    operationIds: [],
  });
}
