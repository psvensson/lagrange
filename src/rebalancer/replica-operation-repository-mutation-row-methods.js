import {
  resolveOperationOwnerLeaseExpiryForPersist,
} from './replica-operation-owner-lease.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMutationRowMethods(
  ReplicaOperationRepository,
) {
  class ReplicaOperationRepositoryMutationRowMethods {
    // The persisted owner lease is re-stamped at every write boundary (audit
    // findings 5+14): a renewed lease is the owner's durable heartbeat; the
    // schema's lease_expires_at column carries it. The lease lives ONLY in
    // the write payload — the live operation object is never mutated, so the
    // owner-persisted-transition visibility comparison keeps matching the
    // pre-stamp durable row.
    resolveOperationOwnerLeasePersistExpiry(operation) {
      return resolveOperationOwnerLeaseExpiryForPersist(
        operation,
        this.nodeId,
      );
    }

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
        lease_expires_at:
          this.resolveOperationOwnerLeasePersistExpiry(operation),
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
        lease_expires_at:
          this.resolveOperationOwnerLeasePersistExpiry(operation),
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        replica_id: operation.replicaId,
        target_claim_key: operation.targetClaimKey || null,
      };
    }

    buildReplicaOperationUpdateWhereClause(
      operation,
      expectedWorkflowStep = null,
      options = {},
    ) {
      const whereClause = {operation_id: operation.operationId};
      if (
        typeof expectedWorkflowStep === 'string' &&
        expectedWorkflowStep.length > 0
      ) {
        whereClause.workflow_step = expectedWorkflowStep;
      }
      // Terminal-transition guard (audit finding 6): a terminal write must
      // overwrite any lagging NON-terminal step (deliberately no
      // expected-step CAS) but must never clobber a DIFFERENT durable
      // terminal that already won. The null where-value renders as
      // "completed_at IS NULL" in the gateway SQL plan, turning the
      // last-writer-wins overwrite into a first-terminal-wins CAS.
      if (options?.terminalTransition === true) {
        whereClause.completed_at = null;
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
