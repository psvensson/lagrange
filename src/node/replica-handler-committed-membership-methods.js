/**
 * Owner contract:
 * Owner: the replica handler's half of the committed-membership boundary
 * (owner decision O1, committed-read amendment 1, sections 3.1-3.2).
 * Inputs: READ_COMMITTED_MEMBERSHIP requests naming a partition; the
 * bootstrap-membership stamp a CREATE_REPLICA carries.
 * Canonical output: the answer of the local replica's operation port to a
 * bootstrap read (the leader's committed configuration, or a typed refusal);
 * the validated stamp a new replica opens its group from, with the address
 * hints and join mode it yields (a replica holding a durable record is
 * restored from it by its port whatever the stamp).
 * Prohibited: no row is read as membership. Rows are discovery only: the
 * genesis check reads them as evidence that a group already exists, and the
 * address book stays with the caller.
 */
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {RAFT_OPERATION} from '../raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../raft/raft-committed-membership-constants.js';
import {committedMembershipRefusal} from
  '../raft/raft-rs-committed-membership-read.js';
import {
  replicaIdsOfStamp,
  validateBootstrapMembershipStamp,
} from '../raft/raft-committed-membership-stamp.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const READ = RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP;
const FUNCTION_TYPE = 'function';
const COMMITTED_MEMBERSHIP_ERROR = Object.freeze({
  PARTITION_REQUIRED: 'committed-membership read requires partitionId',
  refused: (partitionId, reason, defect) =>
    `bootstrap membership refused for partition ${partitionId}: ${reason}` +
    (defect ? ` (${defect})` : ''),
});

/**
 * A typed, non-transient refusal of a new replica's bootstrap: the create
 * fails with the refusal as its error code and never resolves from rows.
 * @param {string} partitionId - The partition.
 * @param {string} reason - A COMMITTED_MEMBERSHIP_REFUSAL.
 * @param {string|null} [defect] - A COMMITTED_MEMBERSHIP_STAMP_DEFECT.
 * @return {Error} The error, with code/errorCode = reason.
 */
function bootstrapMembershipRefusedError(partitionId, reason, defect = null) {
  return Object.assign(new Error(COMMITTED_MEMBERSHIP_ERROR.refused(
    partitionId, reason, defect)), {code: reason, errorCode: reason,
    defect});
}

// The answer a node gives from its local replicas of the partition: the
// committed configuration any of them answers as leader; otherwise a
// NOT_LEADER that can redirect, otherwise the first refusal.
function settleLocalAnswers(answers) {
  const committed = answers.find((answer) =>
    answer?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
  if (committed) {
    return committed;
  }
  return answers.find((answer) =>
    answer?.reason === COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER &&
    typeof answer.leaderAddress === 'string') || answers[0];
}

// Rows as discovery: any replica of the partition outside the founding set
// is evidence that a group already exists.
function discoveredOutsideFounders(services, founders) {
  const founding = new Set(founders);
  return services.some((service) => {
    const replicaId = service?.service_id || service?.replica_id;
    return typeof replicaId === 'string' && !founding.has(replicaId) &&
      service.status !== ReplicaStatus.REMOVED;
  });
}

function assignReplicaHandlerCommittedMembershipMethods(ReplicaHandler) {
  class ReplicaHandlerCommittedMembershipMethods {
    /**
     * READ_COMMITTED_MEMBERSHIP: this node's answer for a partition, read
     * through each local replica's operation port as a bootstrap read.
     * @param {Object} request - {partitionId}.
     * @return {Promise<Object>} COMPLETED with the answer under MEMBERSHIP.
     */
    async handleReadCommittedMembership(request) {
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      if (typeof partitionId !== 'string' || partitionId.length === 0) {
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: COMMITTED_MEMBERSHIP_ERROR.PARTITION_REQUIRED,
            nodeId: this.nodeId},
        );
      }
      // A bootstrap read, or the retirement read that also refuses a
      // pending configuration change; never any other purpose remotely.
      const purpose = request?.[ReplicaOperationField.READ_PURPOSE] ===
        COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT ?
        COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT :
        COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP;
      const answers = [];
      for (const service of this.localServices.values()) {
        if (service?.partitionId === partitionId &&
            typeof service.raft?.[READ] === FUNCTION_TYPE) {
          answers.push(await service.raft[READ]({purpose}));
        }
      }
      const answer = answers.length === 0 ?
        committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.NOT_HOSTED) :
        settleLocalAnswers(answers);
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          [ReplicaOperationField.MEMBERSHIP]: answer,
          partitionId,
          nodeId: this.nodeId,
        },
      );
    }

    /**
     * The bootstrap membership a new partition replica opens its group from:
     * the dispatched stamp, validated. A COMMITTED stamp is a join into the
     * group whose leader answered it; a GENESIS stamp founds a group and is
     * refused where discovery shows a replica outside the founders (a
     * founder holding a durable record is restored from it by its port).
     * The stamp kind, never a row count, decides the join mode.
     * @param {Object} context - {partitionId, replicaId, bootstrapMembership,
     *   observedServices}.
     * @return {Object} {bootstrapMembership, replicaIds, existingReplicaCount}.
     */
    resolveStampedBootstrapMembership({partitionId, replicaId,
      bootstrapMembership, observedServices}) {
      const validation = validateBootstrapMembershipStamp(bootstrapMembership);
      if (!validation.valid) {
        throw bootstrapMembershipRefusedError(partitionId, validation.reason,
          validation.defect);
      }
      const canonical = validation.stamp;
      const committed = canonical.kind ===
        COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED;
      // A founder that already holds a durable record (a RESTART_CREATE
      // after its index-0 write) is restored from that record by its port:
      // the record, not the stamp, is the authority, so there is one group.
      if (!committed && discoveredOutsideFounders(observedServices,
        canonical.founders)) {
        throw bootstrapMembershipRefusedError(partitionId,
          COMMITTED_MEMBERSHIP_REFUSAL.GENESIS_REFUSED_GROUP_EXISTS);
      }
      return {
        bootstrapMembership: canonical,
        replicaIds: replicaIdsOfStamp(canonical, replicaId),
        existingReplicaCount: committed ?
          canonical.voters.length : 0,
      };
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerCommittedMembershipMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerCommittedMembershipMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerCommittedMembershipMethods};
