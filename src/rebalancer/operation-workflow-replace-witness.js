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

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  SERVICE_TYPE,
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

function buildReplaceWitnessRequest(operation, messageType, replicaIds) {
  return {
    [ReplicaOperationField.TYPE]: messageType,
    [ReplicaOperationField.OPERATION_ID]: operation.operationId,
    [ReplicaOperationField.OPERATION_TYPE]: operation.type,
    [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
    [ReplicaOperationField.REPLICA_ID]: replicaIds.targetReplicaId,
    [ReplicaOperationField.SOURCE_REPLICA_ID]: replicaIds.sourceReplicaId,
  };
}

async function deliverToReplaceWitness(owner, operation, messageType) {
  const replicaIds = replaceReplicaIdsOf(owner, operation);
  const targetNodeId = operation?.targetNodeId || null;
  if (!replicaIds.sourceReplicaId || !replicaIds.targetReplicaId ||
      !targetNodeId ||
      typeof owner.messageRouter?.deliver !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) {
    return {
      outcome: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
      reason: ReplaceWitnessDeliveryOutcome.IDENTITY_UNAVAILABLE,
    };
  }
  const handlerType = resolveOperationHandlerType(
    operation.entityType || SERVICE_TYPE.PARTITION);
  try {
    const response = await owner.messageRouter.deliver(
      `${targetNodeId}/service/${handlerType}`,
      buildReplaceWitnessRequest(operation, messageType, replicaIds),
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
 * @return {Promise<Object>} Frozen observation (a membership state plus
 *   commitIndex, leaderReplicaId, term, transferWindowMaxMs).
 */
async function readReplaceWitnessMembership(owner, operation) {
  const {response, reason} = await deliverToReplaceWitness(
    owner, operation, ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP);
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
