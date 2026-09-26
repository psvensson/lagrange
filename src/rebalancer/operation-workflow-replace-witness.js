/**
 * Owner contract:
 * Owner: the REPLACE owner's transport to its witness replica (quest
 * replace-source-removal-owner, amendment-1 steps 2-3): the REPLACE target
 * t, addressed through the replica-operation seam (READ_REPLICA_MEMBERSHIP,
 * RETIRE_REPLICA_PEER) on t's node - the router short-circuits a local one.
 * Inputs: the operation's source and target replica identities and target
 * node.
 * Canonical output: the witness's own observation (membership state of the
 * source, commit index, term, leader, transfer window) or UNAVAILABLE; the
 * raw answer of a retirement proposal.
 * Prohibited: no decision is taken here; no row or cache is read as the
 * observation.
 */
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {
  ReplaceWitnessDeliveryOutcome,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../partition/partition-replica-membership-constants.js';
import {assertCanonicalRebalancerEntityIdentity} from
  './rebalancer-entity-identity.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  resolveOperationHandlerType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

function replaceReplicaIdsOf(owner, operation) {
  const sourceReplicaId =
    owner.repository.getReplaceSourceReplicaId(operation) || null;
  const targetReplicaId =
    owner.repository.getReplaceTargetReplicaId?.(operation) ||
    (typeof operation?.replicaId === 'string' &&
      operation.replicaId !== sourceReplicaId ?
      operation.replicaId : null);
  return {sourceReplicaId, targetReplicaId};
}

function unavailableWitness(reason) {
  return Object.freeze({
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE,
    reason: reason || null,
  });
}

function buildReplaceWitnessRequest(operation, messageType, replicaIds,
  readReplicaId) {
  return {
    [ReplicaOperationField.TYPE]: messageType,
    [ReplicaOperationField.OPERATION_ID]: operation.operationId,
    [ReplicaOperationField.OPERATION_TYPE]: operation.type,
    [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
    [ReplicaOperationField.REPLICA_ID]: readReplicaId,
    [ReplicaOperationField.SOURCE_REPLICA_ID]: replicaIds.sourceReplicaId,
  };
}

/**
 * Deliver a witness message to one replica of the partition: the REPLACE
 * target t unless another member is named (D2 target death only).
 * @param {Object} owner
 * @param {Object} operation
 * @param {string} messageType
 * @param {Object} [member] - {replicaId, nodeId}; defaults to t.
 * @return {Promise<Object>} {outcome, response?, reason?}.
 */
async function deliverToReplaceWitness(owner, operation, messageType,
  member = null) {
  const replicaIds = replaceReplicaIdsOf(owner, operation);
  const readReplicaId = member?.replicaId || replicaIds.targetReplicaId;
  const targetNodeId = member?.nodeId || operation?.targetNodeId || null;
  if (!replicaIds.sourceReplicaId || !readReplicaId ||
      !targetNodeId ||
      typeof owner.messageRouter?.deliver !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return {
      outcome: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
      reason: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
    };
  }
  // The operation's own typed entity identity (never a partition default):
  // an operation without a canonical one has no witness to address.
  let handlerType;
  try {
    handlerType = resolveOperationHandlerType(
      assertCanonicalRebalancerEntityIdentity(operation).entityType);
  } catch {
    return {
      outcome: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
      reason: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
    };
  }
  try {
    const response = await owner.messageRouter.deliver(
      `${targetNodeId}/service/${handlerType}`,
      buildReplaceWitnessRequest(operation, messageType, replicaIds,
        readReplicaId),
      {
        targetNodeId,
        deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
      },
    );
    return {outcome: ReplaceWitnessDeliveryOutcome.DELIVERED, response};
  } catch (error) {
    return {
      outcome: ReplaceWitnessDeliveryOutcome.DELIVERY_FAILED,
      reason: error?.message || String(error),
    };
  }
}

/**
 * The witness replica's committed configuration as its own port reports it.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} [member] - {replicaId, nodeId}: another member to read
 *   (D2 target death); defaults to the REPLACE target t.
 * @return {Promise<Object>} Frozen observation (a membership state plus
 *   commitIndex, appliedIndex - the witness runtime's applied index of the
 *   same observation its configuration came from; commit may run ahead of
 *   it - leaderReplicaId, term, transferWindowMaxMs).
 */
async function readReplaceWitnessMembership(owner, operation, member = null) {
  const {response, reason} = await deliverToReplaceWitness(
    owner, operation, ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP,
    member);
  const membership = response?.[ReplicaOperationField.MEMBERSHIP];
  if (response?.status !== ReplicaOperationResponseStatus.COMPLETED ||
      !membership || typeof membership.state !== 'string') {
    return unavailableWitness(reason || response?.status || null);
  }
  return Object.freeze({...membership});
}

export {
  deliverToReplaceWitness,
  readReplaceWitnessMembership,
  replaceReplicaIdsOf,
};
