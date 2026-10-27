/** Message-group membership facade of ReplicaOperationRepository.
 * These methods forward to the membership owner-claim and authorization
 * modules; the repository stays the sole decoder/validator and conditional
 * writer of membership phase, permit and stamps. No dispatch or CREATE
 * authority is created here; an ordered successor attempt is issued only by
 * its own module's proof of predecessor noncommitment.
 */
import {observeMessageGroupLearnerAuthorization, observeMessageGroupPromotionAuthorization,
  observeMessageGroupRemovalAuthorization} from
  './replica-operation-message-group-learner-observation.js';
import {claimMessageGroupMembershipOwner, settleMessageGroupMembershipNonAdmission} from
  './replica-operation-message-group-membership-owner-claim.js';
import {selectMessageGroupMembershipBranch, authorizeMessageGroupLearner,
  recordMessageGroupLearnerOutcome, recoverMessageGroupLearnerOutcome} from
  './replica-operation-message-group-membership-authorization.js';
import {issueMessageGroupLearnerSuccessor} from
  './replica-operation-message-group-learner-successor.js';
import {selectMessageGroupPromotion, recordMessageGroupVoterOutcome,
  recoverMessageGroupVoterOutcome} from './replica-operation-message-group-promotion.js';
import {selectMessageGroupSourceRemoval, recordMessageGroupRemovalOutcome,
  recoverMessageGroupRemovalOutcome} from './replica-operation-message-group-removal.js';
import {MEMBERSHIP_OBLIGATION} from './replica-operation-message-group-membership-permit.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryMessageGroupMembershipMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    SERVICE_TYPE,
    SQL,
    isCoordinatorOwnedOperationType,
  } = options;
  class ReplicaOperationRepositoryMessageGroupMembershipMethods {
    /** Authoritative census of operations still owing a membership obligation.
     * Ordinary terminal rows are included: debt outlives settlement. The answer
     * distinguishes an unavailable read from an empty census; it grants nothing.
     * @return {Promise<{available: boolean, operations: Array}>}
     */
    async queryAuthoritativeMessageGroupMembershipDebtOperations() {
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_MESSAGE_GROUP_MEMBERSHIP_DEBT_OPERATIONS,
        [SERVICE_TYPE.MESSAGE_GROUP, MEMBERSHIP_OBLIGATION.UNKNOWN],
        {
          ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          retryOnRetryableFailure: true,
        },
      );
      if (result?.success !== true || !Array.isArray(result.rows)) {
        return Object.freeze({available: false, operations: Object.freeze([])});
      }
      const operations = result.rows.map((row) => this.rowToOperation(row))
        .filter((operation) => isCoordinatorOwnedOperationType(operation?.type));
      return Object.freeze({available: true, operations: Object.freeze(operations)});
    }
    /** Settle never-authorized terminal intent; no execution claim is acquired. */
    settleMessageGroupMembershipNonAdmission(request) {
      return settleMessageGroupMembershipNonAdmission(this, request);
    }

    /** Claim membership recovery ownership; no action authorization is created. */
    claimMessageGroupMembershipOwner(request) {
      return claimMessageGroupMembershipOwner(this, request);
    }
    /** Observe exact issued learner intent for a bound runtime recipient. */
    observeMessageGroupLearnerAuthorization(request, receiver) {
      return observeMessageGroupLearnerAuthorization(this, request, receiver);
    }
    /** Record initial learner intent; runtime and CREATE admission remain separate. */
    authorizeMessageGroupLearner(request) {
      return authorizeMessageGroupLearner(this, request);
    }
    /** Record an exact recovered learner fact; never dispatch membership work. */
    recordMessageGroupLearnerOutcome(request, readCommittedLearner, isInvocationCurrent) {
      return recordMessageGroupLearnerOutcome(this, request, readCommittedLearner,
        isInvocationCurrent);
    }

    /** Recover a learner receipt by operation ID using durable inputs, not a saved packet. */
    recoverMessageGroupLearnerOutcome(operationId, readCommittedLearner, isInvocationCurrent) {
      return recoverMessageGroupLearnerOutcome(this, operationId, readCommittedLearner,
        isInvocationCurrent);
    }

    /** Issue the ordered successor of a definitively noncommitted learner
     * attempt through its own exact read; issuance is not a proposal. */
    issueMessageGroupLearnerSuccessor(request, readCommittedLearner, isInvocationCurrent) {
      return issueMessageGroupLearnerSuccessor(this, request, readCommittedLearner,
        isInvocationCurrent);
    }

    /** Select a durable membership branch; never directly dispatches Raft. */
    selectMessageGroupMembershipBranch(request, isInvocationCurrent) {
      return selectMessageGroupMembershipBranch(this, request, isInvocationCurrent);
    }

    /** Select the promotion of a recorded learner only over the routed
     * leader's positive origin evidence and exact caught-up acknowledgement
     * (6.C slice C2); not a proposal. */
    selectMessageGroupPromotion(request, readCommittedAction, observeCatchUp,
      isInvocationCurrent) {
      return selectMessageGroupPromotion(this, request, readCommittedAction, observeCatchUp,
        isInvocationCurrent);
    }

    /** Observe the exact issued promotion for its bound runtime recipient. */
    observeMessageGroupPromotionAuthorization(request, receiver) {
      return observeMessageGroupPromotionAuthorization(this, request, receiver);
    }

    /** Record a promotion's exact outcome as the voter stamp; never dispatch. */
    recordMessageGroupVoterOutcome(request, readCommittedAction, isInvocationCurrent) {
      return recordMessageGroupVoterOutcome(this, request, readCommittedAction,
        isInvocationCurrent);
    }

    /** Recover a promotion's voter outcome by operation ID from durable inputs. */
    recoverMessageGroupVoterOutcome(operationId, readCommittedAction, isInvocationCurrent) {
      return recoverMessageGroupVoterOutcome(this, operationId, readCommittedAction,
        isInvocationCurrent);
    }

    /** Select the source voter removal after a recorded voter stamp and leadership handoff. */
    selectMessageGroupSourceRemoval(request, observeLeader, isInvocationCurrent) {
      return selectMessageGroupSourceRemoval(this, request, observeLeader, isInvocationCurrent);
    }

    /** Observe the exact issued removal for its bound runtime recipient. */
    observeMessageGroupRemovalAuthorization(request, receiver) {
      return observeMessageGroupRemovalAuthorization(this, request, receiver);
    }

    /** Record a removal's exact committed outcome as the removal stamp and release the lane. */
    recordMessageGroupRemovalOutcome(request, readCommittedAction, isInvocationCurrent) {
      return recordMessageGroupRemovalOutcome(this, request, readCommittedAction,
        isInvocationCurrent);
    }

    /** Recover a removal's outcome by operation ID from durable inputs. */
    recoverMessageGroupRemovalOutcome(operationId, readCommittedAction, isInvocationCurrent) {
      return recoverMessageGroupRemovalOutcome(this, operationId, readCommittedAction,
        isInvocationCurrent);
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryMessageGroupMembershipMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryMessageGroupMembershipMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryMessageGroupMembershipMethods};
