// A placement REMOVE that was authorized for a learner has two effects.
// The current partition leader must first commit removal of that learner.
// The target runtime can be cleaned only for the captured service generation.
import {COLUMN, SERVICE_STATUS, STATE, TABLES} from '../constants/index.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {indexCommittedNodeRows} from '../control-plane/committed-node-rows.js';
import {RAFT_FOUNDING_GROWTH_OUTCOME, RAFT_OPERATION_OUTCOME} from
  '../raft/raft-operation-port-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {ReplicaCleanupTombstoneOwner, observeScopedLearnerCleanup} from '../node/replica-cleanup-tombstone-owner.js';
import {learnerRetirementToken} from '../node/replica-learner-retirement-lifecycle.js';
import {isCatchupLearnerRaftRole, isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {
  LEARNER_RETIREMENT_OUTCOME, ReplicaOperationField, ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {OPERATION_METADATA_KEY, OperationType} from './replica-operation-progress.js';
import {canonicalVoterRetirement} from './replica-placement-owner-admission-statement.js';
import {PLACEMENT_TRANSITION_KIND} from './replica-placement-owner-constants.js';
import {observesCommittedNodeLoss} from './replica-placement-owner-deficits.js';
import {ReplicaStatus} from './replica-status.js';

function verdict(state, fields = {}) {
  return Object.freeze({state, ...fields});
}

const NO_PLACEMENT_ADMISSION = Object.freeze({state: LEARNER_RETIREMENT_OUTCOME.NOT_APPLICABLE});

function scopedOperationAdmission(operation) {
  if (operation.type !== OperationType.REMOVE) return NO_PLACEMENT_ADMISSION;
  const admission = operation.stepsHistory?.[0]?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION];
  return admission?.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT ?
    admission : NO_PLACEMENT_ADMISSION;
}

function isUnscopedPlacementRemoval(operation) {
  const admission = scopedOperationAdmission(operation);
  return admission !== NO_PLACEMENT_ADMISSION &&
    admission.learnerRetirement === undefined &&
    canonicalVoterRetirement(admission.voterRetirement) === null;
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

function matchesRetirementScope(replyScope, requestScope) {
  const reply = copyStrictOwnDataRecord(replyScope);
  const fields = Object.keys(requestScope);
  return reply !== null && Object.keys(reply).length === fields.length &&
    fields.every((field) => Object.hasOwn(reply, field) && reply[field] === requestScope[field]);
}

function removalProposalConsistent(answer) {
  const proposal = answer[ReplicaOperationField.PROPOSAL];
  if (proposal === undefined) return true;
  const recorded = copyStrictOwnDataRecord(proposal);
  if (!recorded || answer[ReplicaOperationField.LEARNER_RETIREMENT_CUSTODY] !==
      learnerRetirementToken(answer.operationId)) return false;
  const proposed = recorded.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    recorded.reason === RAFT_FOUNDING_GROWTH_OUTCOME.LEARNER_REMOVAL_PROPOSED &&
    recorded.replicaIdentity === answer.replicaId;
  return proposed && answer[ReplicaOperationField.LEARNER_RETIREMENT] ===
    LEARNER_RETIREMENT_OUTCOME.CLEARED;
}

function classifyRetirementReply(answer, request, leaderNodeId) {
  const reply = copyStrictOwnDataRecord(answer);
  const requestScope = request[ReplicaOperationField.LEARNER_RETIREMENT];
  const scope = reply?.[ReplicaOperationField.LEARNER_RETIREMENT_SCOPE];
  const identity = [ReplicaOperationField.OPERATION_ID, ReplicaOperationField.PARTITION_ID,
    ReplicaOperationField.REPLICA_ID];
  if (reply?.status !== ReplicaOperationResponseStatus.COMPLETED ||
      reply.nodeId !== leaderNodeId || identity.some((field) => reply[field] !== request[field]) ||
      !matchesRetirementScope(scope, requestScope) ||
      !removalProposalConsistent(reply)) {
    return LEARNER_RETIREMENT_OUTCOME.DEFERRED;
  }
  const outcome = reply[ReplicaOperationField.LEARNER_RETIREMENT];
  if (outcome === LEARNER_RETIREMENT_OUTCOME.CLEANUP_OWNED &&
      reply[ReplicaOperationField.LEARNER_RETIREMENT_CUSTODY] ===
        learnerRetirementToken(request[ReplicaOperationField.OPERATION_ID])) {
    return outcome;
  }
  return outcome === LEARNER_RETIREMENT_OUTCOME.SUPERSEDED ||
    outcome === LEARNER_RETIREMENT_OUTCOME.CLEARED ? outcome : LEARNER_RETIREMENT_OUTCOME.DEFERRED;
}

async function reachMembershipOwner(owner, operation, handlerType, scoped, canPropose) {
  const leaderNodeId = owner.repository.systemTableCache.get(
    TABLES.PARTITIONS, operation.partitionId)?.[COLUMN.LEADER_NODE_ID];
  if (!leaderNodeId) return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  const request = {
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_LEARNER,
    [ReplicaOperationField.OPERATION_ID]: operation.operationId,
    [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
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
  const outcome = classifyRetirementReply(deliveryAnswerOf(delivery), request, leaderNodeId);
  return verdict(outcome);
}

async function evaluatePlacementLearnerRetirement(owner, operation, handlerType) {
  const admission = scopedOperationAdmission(operation);
  if (admission === NO_PLACEMENT_ADMISSION) return NO_PLACEMENT_ADMISSION;
  const rows = await owner.getCriticalReplicaRowsForSafety(operation.partitionId);
  if (!Array.isArray(rows) || rows.authoritativeReadAvailable === false) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  const member = rows.find((row) => row[COLUMN.REPLICA_ID] === operation.replicaId);
  const scoped = admission.learnerRetirement;
  if (scoped !== undefined && admission.voterRetirement !== undefined) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.INTENT_UNSCOPED);
  }
  if (scoped === undefined) {
    const voter = canonicalVoterRetirement(admission.voterRetirement);
    if (voter === null) return verdict(LEARNER_RETIREMENT_OUTCOME.INTENT_UNSCOPED);
    if (!exactServiceGeneration(member, operation, voter) ||
        !isVoterRaftRole(member[COLUMN.RAFT_ROLE])) {
      return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
    }
    const node = await currentNode(owner, operation.targetNodeId);
    return node?.[COLUMN.BOOT_INCARNATION] === voter.nodeBootIncarnation ?
      verdict(LEARNER_RETIREMENT_OUTCOME.NOT_APPLICABLE, {voterScope: voter}) :
      verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  if (member && !exactServiceGeneration(member, operation, scoped)) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.SUPERSEDED);
  }
  return routeBoundLearnerRetirement(owner, operation, handlerType, scoped, member);
}

async function routeBoundLearnerRetirement(owner, operation, handlerType, scoped, member) {
  const node = await currentNode(owner, operation.targetNodeId);
  const boot = node?.[COLUMN.BOOT_INCARNATION];
  if (!Number.isSafeInteger(boot) || boot < scoped.nodeBootIncarnation) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  const status = member?.[COLUMN.STATUS];
  const canPropose = boot === scoped.nodeBootIncarnation &&
    isCatchupLearnerRaftRole(member?.[COLUMN.RAFT_ROLE]) &&
    (observesCommittedNodeLoss(node) || status === ReplicaStatus.FAILED ||
      status === SERVICE_STATUS.STOPPED);
  const membership = await reachMembershipOwner(owner, operation, handlerType, scoped, canPropose);
  if (membership.state === LEARNER_RETIREMENT_OUTCOME.CLEANUP_OWNED) {
    const custody = await observeScopedLearnerCleanup(
      owner.repository.controlPlaneSystemTableGateway, {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        replicaId: operation.replicaId,
        targetNodeId: operation.targetNodeId,
        replicaCreatedAt: scoped.replicaCreatedAt,
      });
    return custody ? membership : verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  if (membership.state !== LEARNER_RETIREMENT_OUTCOME.CLEARED) return membership;
  if (!member || node[COLUMN.CONNECTION_STATE] === STATE.DISCONNECTED) {
    return verdict(LEARNER_RETIREMENT_OUTCOME.DEFERRED);
  }
  // A durable rejoin keeps the same SERVICES birth, but changes process boot.
  // Only the fresh leader's committed absence can cross that boundary.
  return verdict(LEARNER_RETIREMENT_OUTCOME.CLEARED, {
    scope: Object.freeze({...scoped, nodeBootIncarnation: boot}),
  });
}

async function releaseCompletedLearnerRetirementCleanup(owner, operation) {
  const scope = scopedOperationAdmission(operation)?.learnerRetirement;
  if (scope === undefined) return;
  const cleanup = new ReplicaCleanupTombstoneOwner({
    gateway: owner.repository.controlPlaneSystemTableGateway,
    logger: owner.logger,
  });
  await cleanup.releaseCompletedScopedLearnerCleanup({
    operationId: operation.operationId, partitionId: operation.partitionId,
    replicaId: operation.replicaId, targetNodeId: operation.targetNodeId,
    replicaCreatedAt: scope.replicaCreatedAt,
  });
}

function isScopedPlacementLearnerRetirement(operation) {
  return scopedOperationAdmission(operation)?.learnerRetirement !== undefined;
}

export {
  evaluatePlacementLearnerRetirement, isScopedPlacementLearnerRetirement,
  isUnscopedPlacementRemoval, releaseCompletedLearnerRetirementCleanup,
};
