// A placement REMOVE that was authorized for a learner has two effects.
// The current partition leader must first commit removal of that learner.
// The target runtime can be cleaned only for the captured service generation.
import {COLUMN, SERVICE_STATUS, TABLES} from '../constants/index.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {indexCommittedNodeRows} from '../control-plane/committed-node-rows.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {LEARNER_RETIREMENT_OUTCOME, ReplicaOperationField, ReplicaOperationMessageType} from
  './replica-operation-constants.js';
import {OPERATION_METADATA_KEY, OperationType} from './replica-operation-progress.js';
import {PLACEMENT_TRANSITION_KIND} from './replica-placement-owner-constants.js';
import {observesCommittedNodeLoss} from './replica-placement-owner-deficits.js';
import {ReplicaStatus} from './replica-status.js';

function verdict(state, fields = {}) {
  return Object.freeze({state, ...fields});
}

function scopedOperationAdmission(operation) {
  if (operation.type !== OperationType.REMOVE) return null;
  const admission = operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return admission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT ? admission : null;
}

async function currentNode(owner, targetNodeId) {
  const authority = owner.controlPlaneReadinessService;
  await authority.readServeEligibility();
  const observation = authority.answerCommittedNodes();
  if (observation?.state !== SERVE_ELIGIBILITY_STATE.READY) return null;
  return indexCommittedNodeRows(observation.nodeRows)?.get(targetNodeId);
}

function exactServiceGeneration(row, operation, scope) {
  return row?.[COLUMN.REPLICA_ID] === operation.replicaId &&
    row[COLUMN.PARTITION_ID] === operation.partitionId &&
    row[COLUMN.NODE_ID] === operation.targetNodeId &&
    row[COLUMN.CREATED_AT] === scope.replicaCreatedAt;
}

async function reachMembershipOwner(owner, operation, handlerType, scoped, canPropose) {
  const leaderNodeId = owner.repository.systemTableCache.get(
    TABLES.PARTITIONS, operation.partitionId)?.[COLUMN.LEADER_NODE_ID];
  if (!leaderNodeId) return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  const request = {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_LEARNER,
    [ReplicaOperationField.OPERATION_ID]: operation.operationId,
    [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
    [ReplicaOperationField.REPLICA_ID]: operation.replicaId,
    [ReplicaOperationField.LEARNER_RETIREMENT]: {
      ...scoped, targetNodeId: operation.targetNodeId, canPropose,
    },
  };
  let delivery;
  try {
    delivery = await owner.deliverReplicaOperationRequest(operation,
      `${leaderNodeId}/service/${handlerType}`, request, leaderNodeId);
  } catch {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  if (!isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery))) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  const answer = deliveryAnswerOf(delivery);
  if (answer?.replicaId !== operation.replicaId ||
      answer.partitionId !== operation.partitionId || answer.nodeId !== leaderNodeId) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  const outcome = answer[ReplicaOperationField.LEARNER_RETIREMENT];
  if (outcome === LEARNER_RETIREMENT_OUTCOME.SUPERSEDED) return verdict(outcome);
  return outcome === LEARNER_RETIREMENT_OUTCOME.CLEARED ?
    verdict(outcome, {scope: scoped}) : verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
}

async function evaluatePlacementLearnerRetirement(owner, operation, handlerType) {
  const admission = scopedOperationAdmission(operation);
  if (admission === null) return verdict(LEARNER_RETIREMENT_OUTCOME.NOT_APPLICABLE);
  const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
  if (!Array.isArray(rows) || rows.length === 0) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  const member = rows.find((row) => row[COLUMN.REPLICA_ID] === operation.replicaId);
  const scoped = admission.learnerRetirement;
  if (scoped === undefined) {
    // An old intent under a learner projection cannot become generic voter
    // removal. Settle the obsolete plan and let the committed wake re-plan.
    return verdict(isCatchupLearnerRaftRole(member?.[COLUMN.RAFT_ROLE]) ?
      LEARNER_RETIREMENT_OUTCOME.SUPERSEDED : LEARNER_RETIREMENT_OUTCOME.NOT_APPLICABLE);
  }
  if (!exactServiceGeneration(member, operation, scoped)) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.SUPERSEDED);
  }
  const node = await currentNode(owner, operation.targetNodeId);
  if (!node) return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  if (node[COLUMN.BOOT_INCARNATION] !== scoped.nodeBootIncarnation) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.SUPERSEDED);
  }
  const status = member[COLUMN.STATUS];
  const canPropose = isCatchupLearnerRaftRole(member[COLUMN.RAFT_ROLE]) &&
    (observesCommittedNodeLoss(node) || status === ReplicaStatus.FAILED ||
      status === SERVICE_STATUS.STOPPED);
  return reachMembershipOwner(owner, operation, handlerType, scoped, canPropose);
}

function isScopedPlacementLearnerRetirement(operation) {
  return scopedOperationAdmission(operation)?.learnerRetirement !== undefined;
}

export {evaluatePlacementLearnerRetirement, isScopedPlacementLearnerRetirement};
