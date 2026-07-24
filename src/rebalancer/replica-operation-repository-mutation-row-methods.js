const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMutationRowMethods(
  ReplicaOperationRepository,
) {
  class ReplicaOperationRepositoryMutationRowMethods {
    buildReplicaOperationRow(operation) {
      return {
        operation_id: operation.operationId,
        type: operation.type,
        partition_id: operation.partitionId,
        replica_id: operation.replicaId,
        target_claim_key: operation.targetClaimKey || null,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        entity_type: operation.entityType,
        entity_id: operation.entityId,
      };
    }

    buildReplicaOperationUpdateData(operation) {
      return {
        type: operation.type,
        partition_id: operation.partitionId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        entity_type: operation.entityType,
        entity_id: operation.entityId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        replica_id: operation.replicaId,
        target_claim_key: operation.targetClaimKey || null,
      };
    }

    buildReplicaOperationUpdateWhereClause(
      operation,
      expectedWorkflowStep = null,
    ) {
      const whereClause = {operation_id: operation.operationId};
      if (
        typeof expectedWorkflowStep === 'string' &&
        expectedWorkflowStep.length > 0
      ) {
        whereClause.workflow_step = expectedWorkflowStep;
      }
      return whereClause;
    }

    buildReplicaOperationUpdateParams(operation, expectedWorkflowStep = null) {
      const params = [
        operation.status,
        operation.workflowStep,
        operation.updatedAt,
        operation.completedAt,
        operation.errorMessage,
        JSON.stringify(operation.stepsHistory),
        operation.replicaId,
        operation.operationId,
      ];
      if (
        typeof expectedWorkflowStep === 'string' &&
        expectedWorkflowStep.length > 0
      ) {
        params.push(expectedWorkflowStep);
      }
      return params;
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMutationRowMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMutationRowMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMutationRowMethods};
