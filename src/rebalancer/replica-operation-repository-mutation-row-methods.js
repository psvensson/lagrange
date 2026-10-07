import {
  resolveOperationOwnerLeaseExpiryForPersist,
} from './replica-operation-owner-lease.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const SQL_NULL_VALUE = null;

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
      const {entityType, entityId} =
        assertCanonicalRebalancerEntityIdentity(operation);
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
        entity_type: entityType,
        entity_id: entityId,
        membership_publication_epoch:
          operation.membershipPublicationEpoch,
        source_replica_id: operation.sourceReplicaId ?? null,
        message_group_membership_lane_key:
          operation.messageGroupMembershipLaneKey ?? null,
        message_group_membership_phase:
          operation.messageGroupMembershipPhase ?? null,
        message_group_membership_obligation_state:
          operation.messageGroupMembershipObligationState ?? null,
        message_group_membership_identity:
          operation.messageGroupMembershipIdentity ?? null,
        message_group_learner_stamp:
          operation.messageGroupLearnerStamp ?? null,
        message_group_voter_stamp:
          operation.messageGroupVoterStamp ?? null,
        message_group_removal_stamp:
          operation.messageGroupRemovalStamp ?? null,
        message_group_source_lifecycle_claim:
          operation.messageGroupSourceLifecycleClaim ?? null,
        create_admission_state: operation.createAdmissionState ?? null,
        create_admission_token: operation.createAdmissionToken ?? null,
        create_admission_replica_created_at:
          operation.createAdmissionReplicaCreatedAt ?? null,
        create_admission_attempt_token:
          operation.createAdmissionAttemptToken ?? null,
        create_admission_previous_attempt_token:
          operation.createAdmissionPreviousAttemptToken ?? null,
        create_admission_attempt_seq:
          operation.createAdmissionAttemptSeq ?? null,
        create_admission_workflow_updated_at:
          operation.createAdmissionWorkflowUpdatedAt ?? null,
        create_admission_owner_incarnation:
          operation.createAdmissionOwnerIncarnation ?? null,
      };
    }

    buildReplicaOperationUpdateData(operation) {
      const {entityType, entityId} =
        assertCanonicalRebalancerEntityIdentity(operation);
      return {
        type: operation.type,
        partition_id: operation.partitionId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        entity_type: entityType,
        entity_id: entityId,
        membership_publication_epoch:
          operation.membershipPublicationEpoch,
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
      if (options?.requireCreateAdmissionAbsent === true) {
        whereClause.create_admission_state = SQL_NULL_VALUE;
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
