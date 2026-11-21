import {isDeepStrictEqual} from 'node:util';

// An age-only decision is about this exact observed workflow state. Use
// the same immutable predicates when re-reading it and in the terminal CAS.
function captureElapsedWorkflowPreimage(operation) {
  return Object.freeze({
    operation_id: operation.operationId,
    type: operation.type,
    partition_id: operation.partitionId,
    source_node_id: operation.sourceNodeId,
    source_replica_id: operation.sourceReplicaId,
    target_node_id: operation.targetNodeId,
    replica_id: operation.replicaId,
    status: operation.status,
    workflow_step: operation.workflowStep,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    steps_history: JSON.stringify(operation.stepsHistory),
  });
}

function elapsedWorkflowPreimageMatches(operation, preimage) {
  return Boolean(operation) &&
    isDeepStrictEqual(captureElapsedWorkflowPreimage(operation), preimage);
}

export {captureElapsedWorkflowPreimage, elapsedWorkflowPreimageMatches};
