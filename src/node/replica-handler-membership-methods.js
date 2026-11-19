/**
 * Owner contract:
 * Owner: the replica handler's witness seam for the REPLACE owner (quest
 * replace-source-removal-owner, amendment-1 step 3, design S5.1/S2).
 * Inputs: READ_REPLICA_MEMBERSHIP and RETIRE_REPLICA_PEER replica-operation
 * messages naming a tracked partition replica (the REPLACE target) and the
 * source replica.
 * Canonical output: the replica's own committed configuration and
 * leadership read from its port, and a REMOVE_PEER of the source proposed
 * through its port. The same seam serves a local and a remote owner (the
 * router's local short-circuit).
 * Prohibited: no row, cache or prediction is read; nothing here decides
 * completion - the REPLACE owner does, from this observation.
 */
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {
  evaluatePartitionLearnerCatchUp,
  proposePartitionGrowthPromote,
  readPartitionReplicaMembership,
  removePartitionRaftLearner,
  retirePartitionRaftPeer,
  withdrawPartitionPromotion,
} from '../partition/partition-service-raft-membership-administration.js';
import {turnChainValue} from '../raft/raft-rs-turn-answer.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const REPLICA_MEMBERSHIP_ERROR = Object.freeze({
  REQUIRED_FIELDS:
    'membership request requires partitionId, replicaId and sourceReplicaId',
  PARTITION_REQUIRED: 'membership request requires partitionId',
  NOT_A_PARTITION_REPLICA: 'replica has no partition consensus port',
});

function readRequestField(request, field) {
  return request?.[field] || null;
}

function membershipRequestOf(request) {
  return {
    operationId: readRequestField(request, ReplicaOperationField.OPERATION_ID),
    partitionId: readRequestField(request, ReplicaOperationField.PARTITION_ID),
    replicaId: readRequestField(request, ReplicaOperationField.REPLICA_ID),
    sourceReplicaId:
      readRequestField(request, ReplicaOperationField.SOURCE_REPLICA_ID),
    promoteReplicaIds:
      readRequestField(request, ReplicaOperationField.PROMOTE_REPLICA_IDS),
    expectedBaseConfig:
      readRequestField(request, ReplicaOperationField.EXPECTED_BASE_CONFIG),
  };
}

function assignReplicaHandlerMembershipMethods(ReplicaHandler) {
  class ReplicaHandlerMembershipMethods {
    /**
     * The tracked partition replica a membership request names, or the
     * typed response that it cannot be served.
     * @param {Object} request
     * @return {Object} {service, fields} or {response}.
     * @private
     */
    resolveMembershipWitness(request) {
      const fields = membershipRequestOf(request);
      if (!fields.partitionId || !fields.replicaId || !fields.sourceReplicaId) {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: REPLICA_MEMBERSHIP_ERROR.REQUIRED_FIELDS,
            nodeId: this.nodeId},
        )};
      }
      const service = this.getTrackedService(fields.replicaId);
      if (!service) {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND,
          {replicaId: fields.replicaId, nodeId: this.nodeId},
        )};
      }
      if (typeof service.raft?.readStatus !== 'function') {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: REPLICA_MEMBERSHIP_ERROR.NOT_A_PARTITION_REPLICA,
            replicaId: fields.replicaId, nodeId: this.nodeId},
        )};
      }
      return {service, fields};
    }

    /**
     * READ_REPLICA_MEMBERSHIP: the witness replica's committed configuration
     * (the source's voter state in it), commit index and leader.
     * @param {Object} request
     * @return {Promise<Object>}
     */
    async handleReadReplicaMembership(request) {
      const witness = this.resolveMembershipWitness(request);
      if (witness.response) {
        return witness.response;
      }
      const membership = await readPartitionReplicaMembership(
        witness.service, witness.fields.sourceReplicaId);
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          [ReplicaOperationField.MEMBERSHIP]: membership,
          replicaId: witness.fields.replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    /**
     * RETIRE_REPLICA_PEER: propose REMOVE_PEER of the source through the
     * witness replica's port; the answer is the port's.
     * @param {Object} request
     * @return {Promise<Object>}
     */
    async handleRetireReplicaPeer(request) {
      const witness = this.resolveMembershipWitness(request);
      if (witness.response) {
        return witness.response;
      }
      const proposal = await retirePartitionRaftPeer(
        witness.service, witness.fields.sourceReplicaId);
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.INITIATED,
        {
          [ReplicaOperationField.PROPOSAL]: proposal,
          replicaId: witness.fields.replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    findLocalPartitionService(partitionId, replicaId) {
      if (replicaId) {
        const direct = this.getTrackedService(replicaId);
        if (direct && (!partitionId || direct.partitionId === partitionId)) {
          return direct;
        }
      }
      let firstMatch = null;
      for (const service of this.localServices.values()) {
        if (service?.partitionId !== partitionId) continue;
        if (service.isLeader === true) return service;
        if (!firstMatch) firstMatch = service;
      }
      return firstMatch;
    }

    resolvePartitionAdministrationTarget(request) {
      const fields = membershipRequestOf(request);
      if (!fields.partitionId) {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: REPLICA_MEMBERSHIP_ERROR.PARTITION_REQUIRED,
            nodeId: this.nodeId},
        )};
      }
      const service = this.findLocalPartitionService(
        fields.partitionId, fields.replicaId);
      if (!service) {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND,
          {partitionId: fields.partitionId, replicaId: fields.replicaId,
            nodeId: this.nodeId},
        )};
      }
      if (!service.raft) {
        return {response: this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: REPLICA_MEMBERSHIP_ERROR.NOT_A_PARTITION_REPLICA,
            replicaId: service.replicaId, nodeId: this.nodeId},
        )};
      }
      return {service, fields};
    }

    async handleEvaluateLearnerCatchUp(request) {
      const target = this.resolvePartitionAdministrationTarget(request);
      if (target.response) return target.response;
      const catchUp = await turnChainValue(evaluatePartitionLearnerCatchUp(
        target.service,
        {
          operationId: target.fields.operationId,
          replicaIdentity: target.fields.replicaId,
        },
      ));
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          [ReplicaOperationField.CATCH_UP]: catchUp,
          partitionId: target.fields.partitionId,
          replicaId: target.fields.replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    async handleProposeGrowthPromote(request) {
      const target = this.resolvePartitionAdministrationTarget(request);
      if (target.response) return target.response;
      const promoteReplicaIds = Array.isArray(target.fields.promoteReplicaIds) ?
        target.fields.promoteReplicaIds :
        [target.fields.replicaId, target.fields.sourceReplicaId].filter(Boolean);
      const proposal = await turnChainValue(proposePartitionGrowthPromote(
        target.service,
        {
          operationId: target.fields.operationId,
          promoteReplicaIds,
          expectedBaseConfig: target.fields.expectedBaseConfig,
        },
      ));
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.INITIATED,
        {
          [ReplicaOperationField.PROPOSAL]: proposal,
          partitionId: target.fields.partitionId,
          replicaId: target.service.replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    async handleWithdrawPromotion(request) {
      const target = this.resolvePartitionAdministrationTarget(request);
      if (target.response) return target.response;
      const proposal = await turnChainValue(withdrawPartitionPromotion(
        target.service,
        {
          operationId: target.fields.operationId,
          replicaIdentity: target.fields.replicaId,
          promoteReplicaIds: target.fields.promoteReplicaIds,
        },
      ));
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {
          [ReplicaOperationField.PROPOSAL]: proposal,
          partitionId: target.fields.partitionId,
          replicaId: target.service.replicaId,
          nodeId: this.nodeId,
        },
      );
    }

    async handleRemoveLearner(request) {
      const target = this.resolvePartitionAdministrationTarget(request);
      if (target.response) return target.response;
      const proposal = await turnChainValue(removePartitionRaftLearner(
        target.service,
        {
          operationId: target.fields.operationId,
          replicaIdentity: target.fields.replicaId,
        },
      ));
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.INITIATED,
        {
          [ReplicaOperationField.PROPOSAL]: proposal,
          partitionId: target.fields.partitionId,
          replicaId: target.fields.replicaId,
          nodeId: this.nodeId,
        },
      );
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerMembershipMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerMembershipMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerMembershipMethods};
