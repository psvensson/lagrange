// Cleanup-owned conversion of the existing durable REMOVE record. The lifecycle
// owner supplies the original incarnation predicate; the operation owner supplies
// metadata and workflow semantics. No operation birth or CREATE admission fields
// substitute for the replica incarnation stored in the original precondition.
import {SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {getOperationMetadataObject, OperationType, OPERATION_METADATA_KEY,
  ReplicaStatus, isValidWorkflowStep, WORKFLOW_STEP_TO_STATUS} from
  '../rebalancer/replica-status.js';
import {memoizedParseStepsHistoryString} from '../rebalancer/steps-history-parse-memo.js';
import {buildFailedCreateRemoveToken, isFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {buildReplicaLifecycleMutationPredicateFromRow,
  rowMatchesReplicaLifecyclePredicate} from './replica-state-machine-lifecycle-observation.js';
import {REPLICA_CLEANUP_AUTHORITY_KIND, REPLICA_CLEANUP_OPERATION_STATE} from
  './replica-cleanup-constants.js';

const UNAVAILABLE_OPERATION = Object.freeze({state: REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE});

function nonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function failedCreatePredicate(row) {
  if (!Number.isFinite(row?.state_entered_at)) return null;
  const predicate = buildReplicaLifecycleMutationPredicateFromRow(row);
  if (!rowMatchesReplicaLifecyclePredicate(row, predicate)) return null;
  const expected = {service_type: SERVICE_TYPE.PARTITION, status: ReplicaStatus.FAILED,
    replica_id: row.service_id};
  if (!Object.entries(expected).every(([key, value]) => row[key] === value)) return null;
  if (![row.service_id, row.partition_id, row.node_id, row.create_attempt_token]
    .every(nonemptyString) || !isFailedCreateCleanupToken(row.cleanup_token)) return null;
  return predicate;
}

function cleanupOperationState(row) {
  if (!isValidWorkflowStep(OperationType.REMOVE, row.workflow_step) ||
      WORKFLOW_STEP_TO_STATUS[row.workflow_step] !== row.status) {
    return REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE;
  }
  if (row.workflow_step === WORKFLOW_STEP.REMOVED) {
    return Number.isFinite(row.completed_at) ? REPLICA_CLEANUP_OPERATION_STATE.TERMINAL :
      REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE;
  }
  return row.completed_at === null ? REPLICA_CLEANUP_OPERATION_STATE.NONTERMINAL :
    REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE;
}

function cleanupOperationFromRow(row) {
  if (!nonemptyString(row?.operation_id) || !nonemptyString(row?.steps_history)) {
    return UNAVAILABLE_OPERATION;
  }
  const precondition = failedCreatePredicate(getOperationMetadataObject(
    memoizedParseStepsHistoryString(row.steps_history),
    OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION));
  if (!precondition) return UNAVAILABLE_OPERATION;
  const expected = {type: OperationType.REMOVE, replica_id: precondition.service_id,
    partition_id: precondition.partition_id, target_node_id: precondition.node_id,
    entity_type: SERVICE_TYPE.PARTITION, entity_id: precondition.partition_id};
  if (!Object.entries(expected).every(([key, value]) => row[key] === value)) {
    return UNAVAILABLE_OPERATION;
  }
  return Object.freeze({state: cleanupOperationState(row),
    operationId: row.operation_id, precondition});
}

function cleanupOperationMatchesRequest(operation, request) {
  const original = operation.precondition;
  const expected = {operationId: operation.operationId, operationType: OperationType.REMOVE,
    replicaId: original.service_id, partitionId: original.partition_id,
    nodeId: original.node_id, entityType: SERVICE_TYPE.PARTITION, entityId: original.partition_id};
  return Object.entries(expected).every(([key, value]) => request[key] === value) &&
    rowMatchesReplicaLifecyclePredicate(request.precondition, original);
}

function cleanupOperationMatchesReceipt(operation, receipt) {
  const original = operation.precondition;
  const expected = {kind: REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE,
    replicaId: original.service_id, partitionId: original.partition_id,
    nodeId: original.node_id, ownerToken: buildFailedCreateRemoveToken(operation.operationId),
    replicaCreatedAt: original.created_at, createAttemptToken: original.create_attempt_token};
  return Object.entries(expected).every(([key, value]) => receipt?.[key] === value);
}

export {cleanupOperationFromRow, cleanupOperationMatchesRequest, cleanupOperationMatchesReceipt};
