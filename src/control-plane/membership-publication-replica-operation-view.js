// The membership publication owner's view of one replica_operations row,
// as a typed outcome. A row whose steps_history does not parse, or whose
// entity identity is not canonical, is MALFORMED: it is never read as "not an
// operation" (absent) and never as an operation; its consumer records it.
import {
  assertCanonicalRebalancerEntityIdentity,
} from '../rebalancer/rebalancer-entity-identity.js';

const REPLICA_OPERATION_VIEW_STATE = Object.freeze({
  VIEW: 'view',
  // The input is not an object: there is no row to read.
  ABSENT: 'absent',
  MALFORMED: 'malformed',
});
const REPLICA_OPERATION_VIEW_MALFORMED_REASON = Object.freeze({
  STEPS_HISTORY_UNPARSABLE: 'steps_history_unparsable',
  ENTITY_IDENTITY_INVALID: 'entity_identity_invalid',
});
const ABSENT_VIEW = Object.freeze({
  state: REPLICA_OPERATION_VIEW_STATE.ABSENT, view: null, reason: null,
});
const MALFORMED_REPLICA_OPERATION_ROW_MSG =
  'Malformed replica_operations row excluded from membership publication reads';

function malformed(operation, reason, error) {
  return Object.freeze({
    state: REPLICA_OPERATION_VIEW_STATE.MALFORMED,
    view: null,
    reason,
    operationId: operation.operation_id ?? operation.operationId ?? null,
    error,
  });
}

/**
 * @param {Object} operation a replica_operations row or operation view
 * @return {{state: string, view: Object|null, reason: string|null}}
 */
function readReplicaOperationView(operation) {
  if (!operation || typeof operation !== 'object') {
    return ABSENT_VIEW;
  }
  const isDatabaseRow = Object.hasOwn(operation, 'operation_id');
  let stepsHistory = isDatabaseRow ? operation.steps_history :
    operation.stepsHistory;
  if (typeof stepsHistory === 'string') {
    try {
      stepsHistory = JSON.parse(stepsHistory);
    } catch (error) {
      return malformed(operation,
        REPLICA_OPERATION_VIEW_MALFORMED_REASON.STEPS_HISTORY_UNPARSABLE, error);
    }
  }
  if (!Array.isArray(stepsHistory)) {
    stepsHistory = [];
  }
  const normalized = isDatabaseRow ? {
    operationId: operation.operation_id,
    type: operation.type,
    partitionId: operation.partition_id,
    replicaId: operation.replica_id,
    sourceNodeId: operation.source_node_id,
    targetNodeId: operation.target_node_id,
    status: operation.status,
    workflowStep: operation.workflow_step,
    createdAt: operation.created_at,
    updatedAt: operation.updated_at,
    completedAt: operation.completed_at,
    errorMessage: operation.error_message,
    stepsHistory,
    entityType: operation.entity_type,
    entityId: operation.entity_id,
  } : {
    ...operation,
    stepsHistory,
  };
  let identity = null;
  try {
    identity = assertCanonicalRebalancerEntityIdentity(normalized);
  } catch (error) {
    return malformed(operation,
      REPLICA_OPERATION_VIEW_MALFORMED_REASON.ENTITY_IDENTITY_INVALID, error);
  }
  return Object.freeze({
    state: REPLICA_OPERATION_VIEW_STATE.VIEW,
    view: {...normalized, ...identity},
    reason: null,
  });
}

/**
 * The consumer's handling of a row it cannot read: counted on the owner and
 * logged, then excluded from the read it was part of.
 * @param {Object} owner the membership publication coordinator
 * @param {Object} read a MALFORMED readReplicaOperationView result
 * @return {void}
 */
function recordMalformedReplicaOperationView(owner, read) {
  owner.malformedReplicaOperationRowCount =
    (owner.malformedReplicaOperationRowCount || 0) + 1;
  owner.logger?.warn?.(MALFORMED_REPLICA_OPERATION_ROW_MSG, {
    nodeId: owner.nodeId,
    operationId: read.operationId,
    reason: read.reason,
    error: read.error?.message,
  });
}

/**
 * The operation view a read consumes, or null when there is none to consume;
 * a MALFORMED row is recorded before it is excluded.
 * @param {Object} owner
 * @param {Object} operation
 * @return {Object|null}
 */
function consumeReplicaOperationView(owner, operation) {
  const read = readReplicaOperationView(operation);
  if (read.state === REPLICA_OPERATION_VIEW_STATE.MALFORMED) {
    recordMalformedReplicaOperationView(owner, read);
  }
  return read.state === REPLICA_OPERATION_VIEW_STATE.VIEW ? read.view : null;
}

export {
  REPLICA_OPERATION_VIEW_STATE,
  consumeReplicaOperationView,
  readReplicaOperationView,
};
