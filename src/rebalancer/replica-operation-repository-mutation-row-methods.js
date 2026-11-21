import {
  GROWTH_PROMOTION_COHORT_UNRESOLVED, readGrowthPromotionCohort,
} from './growth-promotion-subject.js';
import {OperationType} from './replica-operation-progress.js';
import {invalidOperationPersistenceOutcome} from './replica-operation-update-outcome.js';
import {
  resolveOperationOwnerLeaseExpiryForPersist,
} from './replica-operation-owner-lease.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const SQL_NULL_VALUE = null;

function nullableOperationValue(value) {
  return value === undefined ? null : value;
}

/**
 * The one replica_operations row of an operation record: the repository's
 * persisted row and the placement admission applier's inserted row alike.
 * @param {Object} operation - The operation record.
 * @param {number|null} leaseExpiresAt - The owner lease the row carries.
 * @return {Object} The row, keyed by column.
 */
function buildCanonicalReplicaOperationRow(operation, leaseExpiresAt) {
  if (operation.type === OperationType.GROWTH_PROMOTE &&
      readGrowthPromotionCohort(operation) === null) {
    throw invalidOperationPersistenceOutcome(GROWTH_PROMOTION_COHORT_UNRESOLVED);
  }
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
    lease_expires_at: leaseExpiresAt,
    error_message: operation.errorMessage,
    steps_history: JSON.stringify(operation.stepsHistory),
    entity_type: entityType,
    entity_id: entityId,
    membership_publication_epoch:
      nullableOperationValue(operation.membershipPublicationEpoch),
    source_replica_id: nullableOperationValue(operation.sourceReplicaId),
    copy_source_node_id: nullableOperationValue(operation.copySourceNodeId),
    message_group_membership_lane_key:
      nullableOperationValue(operation.messageGroupMembershipLaneKey),
    message_group_membership_phase:
      nullableOperationValue(operation.messageGroupMembershipPhase),
    message_group_membership_obligation_state:
      nullableOperationValue(
        operation.messageGroupMembershipObligationState),
    message_group_membership_identity:
      nullableOperationValue(operation.messageGroupMembershipIdentity),
    message_group_membership_owner_claim:
      nullableOperationValue(operation.messageGroupMembershipOwnerClaim),
    message_group_membership_permit:
      nullableOperationValue(operation.messageGroupMembershipPermit),
    message_group_learner_stamp:
      nullableOperationValue(operation.messageGroupLearnerStamp),
    message_group_voter_stamp:
      nullableOperationValue(operation.messageGroupVoterStamp),
    message_group_removal_stamp:
      nullableOperationValue(operation.messageGroupRemovalStamp),
    message_group_source_lifecycle_claim:
      nullableOperationValue(operation.messageGroupSourceLifecycleClaim),
    create_admission_state:
      nullableOperationValue(operation.createAdmissionState),
    create_admission_token:
      nullableOperationValue(operation.createAdmissionToken),
    create_admission_replica_created_at:
      nullableOperationValue(operation.createAdmissionReplicaCreatedAt),
    create_admission_attempt_token:
      nullableOperationValue(operation.createAdmissionAttemptToken),
    create_admission_previous_attempt_token:
      nullableOperationValue(operation.createAdmissionPreviousAttemptToken),
    create_admission_attempt_seq:
      nullableOperationValue(operation.createAdmissionAttemptSeq),
    create_admission_workflow_updated_at:
      nullableOperationValue(operation.createAdmissionWorkflowUpdatedAt),
    create_admission_owner_incarnation:
      nullableOperationValue(operation.createAdmissionOwnerIncarnation),
  };
}

function buildReplicaOperationWakeRow(operation) {
  return buildCanonicalReplicaOperationRow(operation, operation.ownerLeaseExpiresAt ?? null);
}

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
      return buildCanonicalReplicaOperationRow(operation,
        this.resolveOperationOwnerLeasePersistExpiry(operation));
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
      const whereClause = {operation_id: operation.operationId, ...options.elapsedWorkflowPreimage};
      if (
        typeof expectedWorkflowStep === 'string' &&
        expectedWorkflowStep.length > 0
      ) {
        whereClause.workflow_step = expectedWorkflowStep;
      }
      // Observed-history refinement of the step CAS: the serialized steps
      // history the writer read must still be the durable one.
      if (typeof options?.expectedStepsHistory === 'string') {
        whereClause.steps_history = options.expectedStepsHistory;
        whereClause.created_at = operation.createdAt;
        whereClause.completed_at = null;
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
      if (options?.requireExactCreateTarget === true) {
        whereClause.replica_id = operation.replicaId;
        whereClause.target_node_id = operation.targetNodeId;
      }
      return whereClause;
    }

    buildReplicaOperationUpdateParams(
      operation,
      expectedWorkflowStep = null,
      expectedStepsHistory = null,
    ) {
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
      if (typeof expectedStepsHistory === 'string') {
        params.push(expectedStepsHistory, operation.createdAt);
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

export {
  assignReplicaOperationRepositoryMutationRowMethods,
  buildCanonicalReplicaOperationRow,
  buildReplicaOperationWakeRow,
};
